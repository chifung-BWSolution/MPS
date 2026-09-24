/** Shared Google Ads helpers for Edge Functions */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractDomainsFromName,
  extractDomainsFromUrls,
  loadWebsiteRows,
  matchDomainsToWebsites,
  matchWebsitesFromText,
  matchWebsitesFromUniqueNameToken,
  pickSampleUrlForDomain,
  replaceGoogleCampaignWebsiteLinks,
  upsertDiscoveredDomains,
  type AdsLinkSummary,
  type DiscoveredDomainInput,
  type GoogleCampaignWebsiteRow,
} from "./website-match.ts";

export const LOGIN_CUSTOMER_ID = (
  Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "5641404438"
).replace(/-/g, "");

export const ADS_API_VERSION = "v25";
export const ACCOUNT_CONCURRENCY = 12;

export type GaqlRow = Record<string, unknown>;

export function asInt(v: unknown): number {
  return Math.round(Number(v ?? 0)) || 0;
}

export function nestGet(obj: GaqlRow, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google Ads OAuth secrets");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

function adsHeaders(accessToken: string): HeadersInit {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "";
  if (!developerToken) throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "login-customer-id": LOGIN_CUSTOMER_ID,
    "Content-Type": "application/json",
  };
}

export async function gaqlQuery(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<GaqlRow[]> {
  const streamUrl =
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  const streamRes = await fetch(streamUrl, {
    method: "POST",
    headers: adsHeaders(accessToken),
    body: JSON.stringify({ query }),
  });

  if (streamRes.ok) {
    const payload = await streamRes.json();
    const rows: GaqlRow[] = [];
    if (Array.isArray(payload)) {
      for (const chunk of payload) {
        for (const r of chunk?.results ?? []) rows.push(r);
      }
    } else {
      for (const r of payload?.results ?? []) rows.push(r);
    }
    return rows;
  }

  const streamErr = await streamRes.text();
  const searchUrl =
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: adsHeaders(accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const searchErr = await res.text();
      throw new Error(
        `GAQL failed for ${customerId} (${res.status}): ${(searchErr || streamErr).slice(0, 1800)}`,
      );
    }
    const json = await res.json();
    for (const r of json.results ?? []) rows.push(r);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return rows;
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => run()),
  );
  return results;
}

export type AccountRow = {
  customer_id: string;
  descriptive_name: string;
  currency_code: string | null;
  time_zone: string | null;
  status: string;
  is_manager: boolean;
  level: number;
  manager_customer_id: string | null;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchAccounts(
  accessToken: string,
  nowIso: string,
): Promise<AccountRow[]> {
  const clientRows = await gaqlQuery(
    accessToken,
    LOGIN_CUSTOMER_ID,
    `
    SELECT
      customer_client.client_customer,
      customer_client.descriptive_name,
      customer_client.id,
      customer_client.manager,
      customer_client.status,
      customer_client.level,
      customer_client.currency_code,
      customer_client.time_zone
    FROM customer_client
    `,
  );

  const accounts = clientRows.map((row) => {
    const id = String(nestGet(row, "customerClient.id") ?? "");
    const isManager = Boolean(nestGet(row, "customerClient.manager"));
    return {
      customer_id: id,
      descriptive_name: String(nestGet(row, "customerClient.descriptiveName") ?? ""),
      currency_code: (nestGet(row, "customerClient.currencyCode") as string) || null,
      time_zone: (nestGet(row, "customerClient.timeZone") as string) || null,
      status: String(nestGet(row, "customerClient.status") ?? "UNKNOWN"),
      is_manager: isManager,
      level: Number(nestGet(row, "customerClient.level") ?? 0),
      manager_customer_id: isManager ? null : LOGIN_CUSTOMER_ID,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };
  });

  if (!accounts.some((a) => a.customer_id === LOGIN_CUSTOMER_ID)) {
    accounts.unshift({
      customer_id: LOGIN_CUSTOMER_ID,
      descriptive_name: "Franco Lee MCC",
      currency_code: null,
      time_zone: null,
      status: "ENABLED",
      is_manager: true,
      level: 0,
      manager_customer_id: null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    });
  }
  return accounts;
}

export type DailyMetricRow = {
  customer_id: string;
  campaign_id: string;
  metric_date: string;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  ctr: number;
  average_cpc_micros: number;
  last_synced_at: string;
  updated_at: string;
};

export type CampaignMetaRow = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string | null;
  daily_budget_micros: number | null;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchDailyMetricsForRange(
  accessToken: string,
  customerIds: string[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ daily: DailyMetricRow[]; campaigns: CampaignMetaRow[]; errors: string[] }> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;

  const daily: DailyMetricRow[] = [];
  const campaignMap = new Map<string, CampaignMetaRow>();
  const errors: string[] = [];

  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const rows = await gaqlQuery(accessToken, customerId, query);
      for (const row of rows) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        const metricDate = String(nestGet(row, "segments.date") ?? "");
        if (!campaignId || !metricDate) continue;
        daily.push({
          customer_id: customerId,
          campaign_id: campaignId,
          metric_date: metricDate,
          impressions: asInt(nestGet(row, "metrics.impressions")),
          clicks: asInt(nestGet(row, "metrics.clicks")),
          cost_micros: asInt(nestGet(row, "metrics.costMicros")),
          conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
          ctr: Number(nestGet(row, "metrics.ctr") ?? 0) || 0,
          average_cpc_micros: asInt(nestGet(row, "metrics.averageCpc")),
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
        const key = `${customerId}:${campaignId}`;
        campaignMap.set(key, {
          id: key,
          customer_id: customerId,
          campaign_id: campaignId,
          campaign_name: String(nestGet(row, "campaign.name") ?? ""),
          status: String(nestGet(row, "campaign.status") ?? "UNKNOWN"),
          advertising_channel_type:
            String(nestGet(row, "campaign.advertisingChannelType") ?? "") || null,
          daily_budget_micros: (() => {
            const raw = nestGet(row, "campaignBudget.amountMicros");
            if (raw == null || raw === "") return null;
            const n = asInt(raw);
            return n > 0 ? n : null;
          })(),
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${customerId}: ${msg.slice(0, 160)}`);
    }
  });

  return { daily, campaigns: [...campaignMap.values()], errors };
}

const SKIP_OBJECTIVE_TOKENS = new Set(["", "UNSPECIFIED", "UNKNOWN", "DEFAULT"]);

function asEnumName(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && "name" in (v as object)) {
    return String((v as { name?: unknown }).name ?? "").trim();
  }
  return String(v).trim();
}

function collectEnumNames(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.map(asEnumName).filter(Boolean);
  const name = asEnumName(v);
  return name ? [name] : [];
}

function isBiddable(v: unknown): boolean {
  return v === true || v === "true" || v === "TRUE";
}

function normalizeObjectiveTokens(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    if (!v || SKIP_OBJECTIVE_TOKENS.has(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function addObjectiveTokens(
  bag: Map<string, Set<string>>,
  campaignKey: string,
  tokens: string[],
) {
  if (!campaignKey) return;
  let set = bag.get(campaignKey);
  if (!set) {
    set = new Set<string>();
    bag.set(campaignKey, set);
  }
  for (const token of tokens) set.add(token);
}

/**
 * Fetch conversion-goal categories and campaign optimization goals per campaign.
 * Keys are `{customerId}:{campaignId}`.
 */
export async function fetchCampaignObjectives(
  accessToken: string,
  customerIds: string[],
  errors: string[],
): Promise<Map<string, string[]>> {
  const bag = new Map<string, Set<string>>();
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.app_campaign_setting.bidding_strategy_goal_type,
      campaign.optimization_goal_setting.optimization_goal_types
    FROM campaign
    WHERE campaign.status != REMOVED
  `;
  const goalQuery = `
    SELECT
      campaign.id,
      campaign_conversion_goal.category,
      campaign_conversion_goal.biddable
    FROM campaign_conversion_goal
    WHERE campaign.status != REMOVED
  `;

  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const rows = await gaqlQuery(accessToken, customerId, campaignQuery);
      for (const row of rows) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        if (!campaignId) continue;
        const key = `${customerId}:${campaignId}`;
        addObjectiveTokens(bag, key, [
          ...collectEnumNames(
            nestGet(row, "campaign.appCampaignSetting.biddingStrategyGoalType"),
          ),
          ...collectEnumNames(
            nestGet(row, "campaign.optimizationGoalSetting.optimizationGoalTypes"),
          ),
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${customerId} campaign goals: ${msg.slice(0, 160)}`);
    }

    try {
      const rows = await gaqlQuery(accessToken, customerId, goalQuery);
      for (const row of rows) {
        if (!isBiddable(nestGet(row, "campaignConversionGoal.biddable"))) continue;
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        if (!campaignId) continue;
        addObjectiveTokens(
          bag,
          `${customerId}:${campaignId}`,
          collectEnumNames(nestGet(row, "campaignConversionGoal.category")),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${customerId} conversion goals: ${msg.slice(0, 160)}`);
    }
  });

  const out = new Map<string, string[]>();
  for (const [key, tokens] of bag) {
    out.set(key, normalizeObjectiveTokens(tokens));
  }
  return out;
}

/** Write fetched objectives onto existing google_ads_campaigns rows. */
export async function applyCampaignObjectives(
  supabase: SupabaseClient,
  objectivesById: Map<string, string[]>,
  errors: string[],
): Promise<number> {
  const entries = [...objectivesById.entries()];
  let updated = 0;
  for (let i = 0; i < entries.length; i += 40) {
    const chunk = entries.slice(i, i + 40);
    const results = await Promise.all(
      chunk.map(([id, objectives]) =>
        supabase.from("google_ads_campaigns").update({ objectives }).eq("id", id),
      ),
    );
    for (const result of results) {
      if (result.error) {
        errors.push(`objectives upsert: ${result.error.message}`.slice(0, 160));
      } else {
        updated += 1;
      }
    }
  }
  return updated;
}

/** Write each campaign's daily budget onto existing google_ads_campaigns rows. */
export async function syncCampaignDailyBudgets(
  supabase: SupabaseClient,
  accessToken: string,
  customerIds: string[],
  errors: string[],
): Promise<number> {
  const query = `
    SELECT campaign.id, campaign.bidding_strategy_type, campaign_budget.amount_micros
    FROM campaign
  `;
  const keywordQuery = `
    SELECT campaign.id
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = KEYWORD
      AND ad_group_criterion.status = ENABLED
      AND ad_group_criterion.negative = FALSE
      AND ad_group_criterion.system_serving_status = ELIGIBLE
  `;
  const updates: {
    id: string;
    daily_budget_micros: number | null;
    bidding_strategy_type: string | null;
    eligible_keyword_count: number | null;
  }[] = [];
  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const rows = await gaqlQuery(accessToken, customerId, query);
      const keywordCounts = new Map<string, number>();
      let keywordQueryOk = false;
      try {
        const keywordRows = await gaqlQuery(accessToken, customerId, keywordQuery);
        keywordQueryOk = true;
        for (const row of keywordRows) {
          const campaignId = String(nestGet(row, "campaign.id") ?? "");
          if (!campaignId) continue;
          keywordCounts.set(campaignId, (keywordCounts.get(campaignId) ?? 0) + 1);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${customerId} eligible keywords: ${msg.slice(0, 160)}`);
      }
      for (const row of rows) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        if (!campaignId) continue;
        const raw = nestGet(row, "campaignBudget.amountMicros");
        const n = raw == null || raw === "" ? null : asInt(raw);
        const strategy = String(nestGet(row, "campaign.biddingStrategyType") ?? "").trim();
        updates.push({
          id: `${customerId}:${campaignId}`,
          daily_budget_micros: n && n > 0 ? n : null,
          bidding_strategy_type: strategy && strategy !== "UNSPECIFIED" && strategy !== "UNKNOWN" ? strategy : null,
          eligible_keyword_count: keywordQueryOk ? (keywordCounts.get(campaignId) ?? 0) : null,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${customerId} daily budget: ${msg.slice(0, 160)}`);
    }
  });

  let updated = 0;
  for (let i = 0; i < updates.length; i += 40) {
    const chunk = updates.slice(i, i + 40);
    const results = await Promise.all(
      chunk.map((row) =>
        supabase
          .from("google_ads_campaigns")
          .update({
            daily_budget_micros: row.daily_budget_micros,
            bidding_strategy_type: row.bidding_strategy_type,
            eligible_keyword_count: row.eligible_keyword_count,
          })
          .eq("id", row.id),
      ),
    );
    for (const result of results) {
      if (result.error) errors.push(`daily budget: ${result.error.message}`.slice(0, 160));
      else updated += 1;
    }
  }
  return updated;
}

export async function syncCampaignObjectives(
  supabase: SupabaseClient,
  accessToken: string,
  customerIds: string[],
  errors: string[],
): Promise<{ campaigns: number; updated: number }> {
  const objectivesById = await fetchCampaignObjectives(
    accessToken,
    customerIds,
    errors,
  );
  const updated = await applyCampaignObjectives(supabase, objectivesById, errors);
  return { campaigns: objectivesById.size, updated };
}

/** Max inclusive day span for live campaign breakdown fetches. */
export const LIVE_BREAKDOWN_MAX_DAYS = 92;
/** change_status keeps the latest change per resource for the past 90 days. */
export const CHANGE_STATUS_MAX_DAYS = 90;
/** change_event field detail only retains the past 30 days, and the query window cannot exceed 30 days. */
export const CHANGE_HISTORY_MAX_DAYS = 30;
export const CHANGE_HISTORY_ROW_LIMIT = 10000;

/** Channel types that expose live breakdown panels in the UI. */
export type LiveBreakdownChannel =
  | "SEARCH"
  | "DEMAND_GEN"
  | "PERFORMANCE_MAX"
  | "SHOPPING";

export type LiveAdGroupRow = {
  adGroupId: string;
  adGroupName: string;
  status?: string;
  adGroupType?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveKeywordRow = {
  adGroupId: string;
  criterionId: string;
  keywordText: string;
  matchType?: string;
  status?: string;
  qualityScore?: number | null;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveSearchTermRow = {
  /** Empty for Performance Max campaign_search_term_view rows. */
  adGroupId?: string;
  searchTerm: string;
  keywordText?: string;
  matchType?: string;
  searchTermStatus?: string;
  searchTermMatchType?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveAssetGroupRow = {
  assetGroupId: string;
  assetGroupName: string;
  status?: string;
  primaryStatus?: string;
  adStrength?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveAdRow = {
  adGroupId: string;
  adGroupName?: string;
  adId: string;
  adName?: string;
  adType?: string;
  status?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveAssetRow = {
  assetId: string;
  assetName?: string;
  assetType?: string;
  fieldType?: string;
  performanceLabel?: string;
  status?: string;
  assetGroupId?: string;
  assetGroupName?: string;
  adGroupId?: string;
  adId?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveProductGroupRow = {
  adGroupId: string;
  adGroupName?: string;
  criterionId: string;
  productGroupLabel: string;
  listingGroupType?: string;
  status?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveProductRow = {
  productItemId: string;
  productTitle?: string;
  productBrand?: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
};

export type LiveCampaignBreakdownsResult = {
  channelType: string;
  supported: boolean;
  adGroups: LiveAdGroupRow[];
  keywords: LiveKeywordRow[];
  searchTerms: LiveSearchTermRow[];
  assetGroups: LiveAssetGroupRow[];
  ads: LiveAdRow[];
  assets: LiveAssetRow[];
  productGroups: LiveProductGroupRow[];
  products: LiveProductRow[];
  errors: string[];
};

export function normalizeLiveBreakdownChannel(
  raw?: string | null,
): LiveBreakdownChannel | null {
  const t = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (t === "SEARCH") return "SEARCH";
  if (t === "DEMAND_GEN") return "DEMAND_GEN";
  if (t === "PERFORMANCE_MAX") return "PERFORMANCE_MAX";
  if (t === "SHOPPING") return "SHOPPING";
  return null;
}

export async function fetchCampaignAdvertisingChannelType(
  accessToken: string,
  customerId: string,
  campaignId: string,
): Promise<string | null> {
  const query = `
    SELECT campaign.id, campaign.advertising_channel_type
    FROM campaign
    WHERE campaign.id = ${campaignId}
    LIMIT 1
  `;
  const rows = await gaqlQuery(accessToken, customerId, query);
  const value = nestGet(rows[0] || {}, "campaign.advertisingChannelType");
  return value == null || value === "" ? null : String(value);
}

async function settleBreakdown<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  errors: string[],
): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    errors.push(
      `${label}: ${(e instanceof Error ? e.message : String(e)).slice(0, 700)}`,
    );
    return fallback;
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateLiveBreakdownRange(
  dateFrom: string,
  dateTo: string,
): { ok: true; days: number } | { ok: false; error: string } {
  if (!ISO_DATE_RE.test(dateFrom) || !ISO_DATE_RE.test(dateTo)) {
    return { ok: false, error: "日期格式無效（需 YYYY-MM-DD）" };
  }
  if (dateFrom > dateTo) {
    return { ok: false, error: "開始日期不可晚於結束日期" };
  }
  const fromMs = Date.parse(`${dateFrom}T00:00:00Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00Z`);
  const days = Math.round((toMs - fromMs) / 86_400_000) + 1;
  if (days > LIVE_BREAKDOWN_MAX_DAYS) {
    return {
      ok: false,
      error: `日期區間過長，即時細項最多 ${LIVE_BREAKDOWN_MAX_DAYS} 日`,
    };
  }
  return { ok: true, days };
}

function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Clamp a requested range onto the 90-day change_status window ending today. */
export function clampChangeHistoryRange(
  dateFrom: string,
  dateTo: string,
): { ok: true; from: string; to: string; clamped: boolean } | { ok: false; error: string } {
  if (!ISO_DATE_RE.test(dateFrom) || !ISO_DATE_RE.test(dateTo)) {
    return { ok: false, error: "日期格式無效（需 YYYY-MM-DD）" };
  }
  if (dateFrom > dateTo) {
    return { ok: false, error: "開始日期不可晚於結束日期" };
  }
  const today = utcTodayIso();
  const earliest = addIsoDays(today, -(CHANGE_STATUS_MAX_DAYS - 1));
  const from = dateFrom < earliest ? earliest : dateFrom;
  const to = dateTo > today ? today : dateTo;
  if (from > to) {
    return {
      ok: false,
      error: `Google Ads 變更狀態只保留近 ${CHANGE_STATUS_MAX_DAYS} 日（${earliest} 起）`,
    };
  }
  return { ok: true, from, to, clamped: from !== dateFrom || to !== dateTo };
}

/** Overlap of a status range with the 30-day change_event window. */
export function changeEventWindow(
  dateFrom: string,
  dateTo: string,
): { from: string; to: string } | null {
  const today = utcTodayIso();
  const earliest = addIsoDays(today, -(CHANGE_HISTORY_MAX_DAYS - 1));
  const from = dateFrom < earliest ? earliest : dateFrom;
  const to = dateTo > today ? today : dateTo;
  if (from > to) return null;
  return { from, to };
}

const CHANGE_RESOURCE_KEY: Record<string, string> = {
  AD: "ad",
  AD_GROUP: "adGroup",
  AD_GROUP_AD: "adGroupAd",
  AD_GROUP_ASSET: "adGroupAsset",
  AD_GROUP_BID_MODIFIER: "adGroupBidModifier",
  AD_GROUP_CRITERION: "adGroupCriterion",
  AD_GROUP_FEED: "adGroupFeed",
  ASSET: "asset",
  ASSET_SET: "assetSet",
  ASSET_SET_ASSET: "assetSetAsset",
  CAMPAIGN: "campaign",
  CAMPAIGN_ASSET: "campaignAsset",
  CAMPAIGN_ASSET_SET: "campaignAssetSet",
  CAMPAIGN_BUDGET: "campaignBudget",
  CAMPAIGN_CRITERION: "campaignCriterion",
  CAMPAIGN_FEED: "campaignFeed",
  CUSTOMER_ASSET: "customerAsset",
  FEED: "feed",
  FEED_ITEM: "feedItem",
};

function snakeToCamel(segment: string): string {
  return segment.replace(/_([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

function changedFieldPaths(mask: unknown): string[] {
  if (!mask) return [];
  if (typeof mask === "string") {
    return mask.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof mask === "object" && Array.isArray((mask as { paths?: unknown }).paths)) {
    return ((mask as { paths: unknown[] }).paths).map((p) => String(p).trim()).filter(Boolean);
  }
  return [];
}

function lookupField(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean).map(snakeToCamel);
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function resourceBody(wrapper: unknown, resourceType: string): unknown {
  if (!wrapper || typeof wrapper !== "object") return null;
  const rec = wrapper as Record<string, unknown>;
  const key = CHANGE_RESOURCE_KEY[resourceType];
  if (key && rec[key] != null) return rec[key];
  const keys = Object.keys(rec);
  if (keys.length === 1) return rec[keys[0]];
  return wrapper;
}

function toSnakePath(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

const ENUM_LABELS: Record<string, string> = {
  ENABLED: "已啟用",
  PAUSED: "已暫停",
  REMOVED: "已移除",
  UNKNOWN: "未知",
  UNSPECIFIED: "未指定",
  BROAD: "廣泛比對",
  PHRASE: "詞句配對",
  EXACT: "完全比對",
  SEARCH: "搜尋",
  DISPLAY: "多媒體",
  SHOPPING: "購物",
  VIDEO: "影片",
  MULTI_CHANNEL: "多管道",
  PERFORMANCE_MAX: "最高成效",
  DEMAND_GEN: "需求開發",
  LOCAL: "本地",
  SMART: "智能",
  HOTEL: "酒店",
  TRAVEL: "旅遊",
  STANDARD: "標準",
  ACCELERATED: "加速",
  DAILY: "每日",
  CUSTOM_PERIOD: "自訂期間",
  FIXED_DAILY: "固定每日",
  LEARNING: "學習中",
  LIMITED: "受限",
  ELIGIBLE: "符合資格",
  NOT_ELIGIBLE: "不符合資格",
  PENDING: "待處理",
  APPROVED: "已核准",
  DISAPPROVED: "已拒登",
  AREA_OF_INTEREST: "興趣地區",
  PRESENCE: "所在位置",
  PRESENCE_OR_INTEREST: "所在位置或興趣地區",
  ANYWHERE: "任何網頁",
  TOP_OF_PAGE: "網頁頂端",
  ABSOLUTE_TOP_OF_PAGE: "網頁絕對頂端",
  OPTIMIZE: "最佳化",
  ROTATE_FOREVER: "無限輪播",
  CONVERSION_OPTIMIZE: "轉換最佳化",
  ROTATE: "輪播",
  GOOD: "良好",
  EXCELLENT: "極佳",
  AVERAGE: "一般",
  POOR: "欠佳",
  BELOW_AVERAGE: "低於平均",
  ABOVE_AVERAGE: "高於平均",
  TRUE: "是",
  FALSE: "否",
};

function formatChangeValue(path: string, value: unknown, depth = 0): string {
  if (value == null || value === "") return "—";
  const last = toSnakePath(path.split(".").pop() || "");
  if (
    /micros$/.test(last) &&
    (typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)))
  ) {
    const n = Number(value) / 1_000_000;
    if (Number.isFinite(n)) {
      return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value.startsWith("customers/")) {
      const tail = value.split("/").pop() || value;
      return tail.includes("~") ? tail.split("~").pop() || tail : tail;
    }
    const enumLabel = ENUM_LABELS[value.trim().toUpperCase()];
    if (enumLabel && /^[A-Z0-9_]+$/.test(value.trim())) return enumLabel;
    return value;
  }
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value
      .slice(0, 8)
      .map((item) => formatChangeValue(path, item, depth + 1))
      .filter((item) => item && item !== "—")
      .join("、") + (value.length > 8 ? ` 及其他 ${value.length - 8} 項` : "");
  }
  if (depth > 2 || !value || typeof value !== "object") return "—";
  const entries = Object.entries(value as Record<string, unknown>).filter(([key, item]) => {
    if (item == null || item === "") return false;
    const snake = toSnakePath(key);
    if (snake === "resource_name") return false;
    if (typeof item === "string" && item.startsWith("customers/") && snake.endsWith("_constant")) return false;
    return true;
  });
  if (!entries.length) return "—";
  if (entries.length === 1) {
    const [key, item] = entries[0];
    const snake = toSnakePath(key);
    if (snake === "text" || snake === "name" || snake === "description") {
      return formatChangeValue(key, item, depth + 1);
    }
  }
  return entries
    .slice(0, 6)
    .map(([key, item]) => `${fieldLabel(key)}：${formatChangeValue(key, item, depth + 1)}`)
    .join("；");
}

export type CampaignChangeFieldDiff = {
  field: string;
  oldValue: string;
  newValue: string;
};

export type CampaignChangeEventRow = {
  resourceName: string;
  changeDateTime: string;
  userEmail: string;
  clientType: string;
  resourceType: string;
  changedResourceName: string;
  adGroupResource: string;
  operation: string;
  changedFields: string[];
  changes: CampaignChangeFieldDiff[];
  keywordText: string;
};

function mapChangeEventRow(row: GaqlRow): CampaignChangeEventRow {
  const event = (nestGet(row, "changeEvent") ?? row) as GaqlRow;
  const resourceType = String(event.changeResourceType ?? "");
  const oldBody = resourceBody(event.oldResource, resourceType);
  const newBody = resourceBody(event.newResource, resourceType);
  const fields = changedFieldPaths(event.changedFields);
  const changes = fields.map((field) => ({
    field,
    oldValue: formatChangeValue(field, lookupField(oldBody, field)),
    newValue: formatChangeValue(field, lookupField(newBody, field)),
  }));
  const keywordText = String(
    lookupField(newBody, "keyword.text") ?? lookupField(oldBody, "keyword.text") ?? "",
  );
  return {
    resourceName: String(event.resourceName ?? ""),
    changeDateTime: String(event.changeDateTime ?? ""),
    userEmail: String(event.userEmail ?? ""),
    clientType: String(event.clientType ?? ""),
    resourceType,
    changedResourceName: String(event.changeResourceName ?? ""),
    adGroupResource: String(event.adGroup ?? ""),
    operation: String(event.resourceChangeOperation ?? ""),
    changedFields: fields,
    changes,
    keywordText,
  };
}

const STATUS_RESOURCE_FIELD: Record<string, string> = {
  AD_GROUP: "adGroup",
  AD_GROUP_AD: "adGroupAd",
  AD_GROUP_BID_MODIFIER: "adGroupBidModifier",
  AD_GROUP_CRITERION: "adGroupCriterion",
  AD_GROUP_FEED: "adGroupFeed",
  CAMPAIGN: "campaign",
  CAMPAIGN_CRITERION: "campaignCriterion",
  CAMPAIGN_FEED: "campaignFeed",
  FEED: "feed",
  FEED_ITEM: "feedItem",
  SHARED_SET: "sharedSet",
  CAMPAIGN_SHARED_SET: "campaignSharedSet",
  ASSET: "asset",
  CUSTOMER_ASSET: "customerAsset",
  CAMPAIGN_ASSET: "campaignAsset",
  AD_GROUP_ASSET: "adGroupAsset",
};

export type CampaignChangeStatusRow = {
  resourceName: string;
  resourceType: string;
  resourceStatus: string;
  lastChangeDateTime: string;
  adGroupResource: string;
  assetGroupResource: string;
};

function specificStatusResource(status: GaqlRow): string {
  const resourceType = String(status.resourceType ?? "");
  const preferred = STATUS_RESOURCE_FIELD[resourceType];
  if (preferred) {
    const value = status[preferred];
    if (typeof value === "string" && value) return value;
  }
  for (const value of Object.values(status)) {
    if (typeof value !== "string" || !value.startsWith("customers/")) continue;
    if (value.includes("/changeStatus/")) continue;
    return value;
  }
  return String(status.resourceName ?? "");
}

function mapChangeStatusRow(row: GaqlRow): CampaignChangeStatusRow {
  const status = (nestGet(row, "changeStatus") ?? row) as GaqlRow;
  const resourceName = specificStatusResource(status);
  return {
    resourceName,
    resourceType: String(status.resourceType ?? ""),
    resourceStatus: String(status.resourceStatus ?? ""),
    lastChangeDateTime: String(status.lastChangeDateTime ?? ""),
    adGroupResource: String(status.adGroup ?? ""),
    assetGroupResource: resourceName.includes("/assetGroups/") ? resourceName : "",
  };
}

export async function fetchCampaignChangeStatuses(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<CampaignChangeStatusRow[]> {
  const campaignResource = `customers/${customerId}/campaigns/${campaignId}`;
  const query = `
    SELECT
      change_status.resource_name,
      change_status.last_change_date_time,
      change_status.resource_status,
      change_status.resource_type,
      change_status.ad_group,
      change_status.ad_group_ad,
      change_status.ad_group_bid_modifier,
      change_status.ad_group_criterion,
      change_status.campaign,
      change_status.campaign_criterion
    FROM change_status
    WHERE change_status.last_change_date_time >= '${dateFrom}'
      AND change_status.last_change_date_time <= '${dateTo} 23:59:59'
      AND change_status.campaign = '${campaignResource}'
    ORDER BY change_status.last_change_date_time DESC
    LIMIT ${CHANGE_HISTORY_ROW_LIMIT}
  `;
  const rows = await gaqlQuery(accessToken, customerId, query);
  return rows.map(mapChangeStatusRow);
}

export type CampaignChangeStatusGroup = CampaignChangeStatusRow & {
  events: CampaignChangeEventRow[];
};

export function groupChangeEventsByStatus(
  statuses: CampaignChangeStatusRow[],
  events: CampaignChangeEventRow[],
): CampaignChangeStatusGroup[] {
  const groups: CampaignChangeStatusGroup[] = statuses.map((status) => ({
    ...status,
    events: [],
  }));
  const byResource = new Map<string, CampaignChangeStatusGroup>();
  for (const group of groups) {
    if (group.resourceName && !byResource.has(group.resourceName)) {
      byResource.set(group.resourceName, group);
    }
  }
  const orphans = new Map<string, CampaignChangeStatusGroup>();
  for (const event of events) {
    const key = event.changedResourceName;
    const match = key ? byResource.get(key) : undefined;
    if (match) {
      match.events.push(event);
      continue;
    }
    const orphanKey = key || event.resourceName;
    let orphan = orphans.get(orphanKey);
    if (!orphan) {
      orphan = {
        resourceName: orphanKey,
        resourceType: event.resourceType,
        resourceStatus: "",
        lastChangeDateTime: event.changeDateTime,
        adGroupResource: orphanKey.includes("/adGroups/") || orphanKey.includes("/adGroup")
          ? orphanKey
          : "",
        assetGroupResource: orphanKey.includes("/assetGroups/") ? orphanKey : "",
        events: [],
      };
      orphans.set(orphanKey, orphan);
    }
    orphan.events.push(event);
    if (event.changeDateTime > orphan.lastChangeDateTime) {
      orphan.lastChangeDateTime = event.changeDateTime;
    }
  }
  for (const group of groups) {
    group.events.sort((a, b) => b.changeDateTime.localeCompare(a.changeDateTime));
  }
  const orphanGroups = [...orphans.values()];
  for (const group of orphanGroups) {
    group.events.sort((a, b) => b.changeDateTime.localeCompare(a.changeDateTime));
  }
  return [...groups, ...orphanGroups].sort((a, b) =>
    b.lastChangeDateTime.localeCompare(a.lastChangeDateTime)
  );
}

function resourceId(resourceName: string, marker: string): string {
  const idx = resourceName.indexOf(marker);
  if (idx < 0) return "";
  const rest = resourceName.slice(idx + marker.length);
  const id = rest.split(/[~/?]/)[0] || "";
  return /^\d+$/.test(id) ? id : "";
}

export async function attachChangeGroupNames(
  accessToken: string,
  customerId: string,
  campaignId: string,
  groups: CampaignChangeStatusGroup[],
): Promise<Array<CampaignChangeStatusGroup & { adGroupName: string; assetGroupName: string }>> {
  const adGroupIds = new Set<string>();
  const assetGroupIds = new Set<string>();
  for (const group of groups) {
    const adId = resourceId(group.adGroupResource, "/adGroups/") ||
      resourceId(group.resourceName, "/adGroups/") ||
      resourceId(group.resourceName, "/adGroupAds/") ||
      resourceId(group.resourceName, "/adGroupCriteria/");
    const assetId = resourceId(group.assetGroupResource, "/assetGroups/") ||
      resourceId(group.resourceName, "/assetGroups/");
    if (adId) adGroupIds.add(adId);
    if (assetId) assetGroupIds.add(assetId);
  }

  const adGroupNames = new Map<string, string>();
  const assetGroupNames = new Map<string, string>();
  if (adGroupIds.size) {
    const ids = [...adGroupIds].join(", ");
    const rows = await gaqlQuery(
      accessToken,
      customerId,
      `SELECT ad_group.id, ad_group.name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.id IN (${ids})`,
    );
    for (const row of rows) {
      adGroupNames.set(String(nestGet(row, "adGroup.id") ?? ""), String(nestGet(row, "adGroup.name") ?? ""));
    }
  }
  if (assetGroupIds.size) {
    const ids = [...assetGroupIds].join(", ");
    const rows = await gaqlQuery(
      accessToken,
      customerId,
      `SELECT asset_group.id, asset_group.name FROM asset_group WHERE campaign.id = ${campaignId} AND asset_group.id IN (${ids})`,
    );
    for (const row of rows) {
      assetGroupNames.set(
        String(nestGet(row, "assetGroup.id") ?? ""),
        String(nestGet(row, "assetGroup.name") ?? ""),
      );
    }
  }

  return groups.map((group) => {
    const adId = resourceId(group.adGroupResource, "/adGroups/") ||
      resourceId(group.resourceName, "/adGroups/") ||
      resourceId(group.resourceName, "/adGroupAds/") ||
      resourceId(group.resourceName, "/adGroupCriteria/");
    const assetId = resourceId(group.assetGroupResource, "/assetGroups/") ||
      resourceId(group.resourceName, "/assetGroups/");
    return {
      ...group,
      adGroupName: adGroupNames.get(adId) || "",
      assetGroupName: assetGroupNames.get(assetId) || "",
    };
  });
}

export async function fetchCampaignChangeHistory(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<CampaignChangeEventRow[]> {
  const campaignResource = `customers/${customerId}/campaigns/${campaignId}`;
  const query = `
    SELECT
      change_event.resource_name,
      change_event.change_date_time,
      change_event.change_resource_name,
      change_event.user_email,
      change_event.client_type,
      change_event.change_resource_type,
      change_event.ad_group,
      change_event.old_resource,
      change_event.new_resource,
      change_event.resource_change_operation,
      change_event.changed_fields
    FROM change_event
    WHERE change_event.change_date_time >= '${dateFrom}'
      AND change_event.change_date_time <= '${dateTo} 23:59:59'
      AND change_event.campaign = '${campaignResource}'
    ORDER BY change_event.change_date_time DESC
    LIMIT ${CHANGE_HISTORY_ROW_LIMIT}
  `;
  const rows = await gaqlQuery(accessToken, customerId, query);
  return rows.map(mapChangeEventRow);
}

export type ChangeHistoryCategory =
  | "budget"
  | "bidding"
  | "audience"
  | "location"
  | "language"
  | "conversions"
  | "ads"
  | "status"
  | "feeds"
  | "other";

export type ChangeHistoryLine = {
  text: string;
  category: ChangeHistoryCategory;
};

export type ChangeHistorySession = {
  id: string;
  userEmail: string;
  clientType: string;
  changeDateTime: string;
  adGroupResource: string;
  assetGroupResource: string;
  adGroupName: string;
  assetGroupName: string;
  lines: ChangeHistoryLine[];
};

const FIELD_LABELS: Record<string, string> = {
  name: "名稱",
  status: "狀態",
  type: "類型",
  resource_name: "資源名稱",
  id: "編號",
  labels: "標籤",
  start_date: "開始日期",
  end_date: "結束日期",
  final_urls: "最終到達網址",
  final_mobile_urls: "行動版最終到達網址",
  final_url_suffix: "最終到達網址尾碼",
  tracking_url_template: "追蹤網址範本",
  url_custom_parameters: "自訂參數",
  display_url: "顯示網址",
  path1: "路徑 1",
  path2: "路徑 2",
  amount_micros: "廣告預算金額",
  total_amount_micros: "總預算金額",
  delivery_method: "投放方式",
  period: "預算期間",
  explicitly_shared: "共用預算",
  reference_count: "參照次數",
  advertising_channel_type: "廣告管道類型",
  advertising_channel_sub_type: "廣告管道子類型",
  bidding_strategy: "出價策略",
  bidding_strategy_type: "出價策略類型",
  campaign_budget: "廣告預算",
  serving_status: "放送狀態",
  ad_serving_optimization_status: "廣告輪播",
  experiment_type: "實驗類型",
  payment_mode: "付款模式",
  optimization_score: "最佳化分數",
  primary_status: "主要狀態",
  primary_status_reasons: "主要狀態原因",
  network_settings: "聯播網設定",
  target_google_search: "Google 搜尋聯播網",
  target_search_network: "搜尋聯播網",
  target_content_network: "多媒體聯播網",
  target_partner_search_network: "搜尋合作夥伴聯播網",
  target_youtube: "YouTube",
  target_google_tv_network: "Google TV 聯播網",
  geo_target_type_setting: "地區目標類型",
  positive_geo_target_type: "指定地區的目標對象",
  negative_geo_target_type: "排除地區的目標對象",
  frequency_caps: "頻率上限",
  targeting_setting: "指定目標設定",
  target_restrictions: "指定目標限制",
  audience_setting: "目標對象設定",
  use_audience_grouped: "使用目標對象分組",
  brand_guidelines_enabled: "品牌規範",
  contains_eu_political_advertising: "歐盟政治廣告",
  video_brand_safety_suitability: "影片品牌安全",
  listing_type: "刊登類型",
  shopping_setting: "購物設定",
  merchant_id: "Merchant Center 編號",
  feed_label: "資料提供標籤",
  campaign_priority: "廣告系列優先順序",
  enable_local: "啟用本地產品",
  hotel_setting: "酒店設定",
  hotel_center_id: "酒店中心編號",
  dynamic_search_ads_setting: "動態搜尋廣告設定",
  domain_name: "網域名稱",
  language_code: "語言代碼",
  use_supplied_urls_only: "只使用提供的網址",
  selective_optimization: "選擇性最佳化",
  conversion_actions: "轉換動作",
  optimization_goal_setting: "最佳化目標",
  optimization_goal_types: "最佳化目標類型",
  manual_cpc: "手動單次點擊出價",
  enhanced_cpc_enabled: "加強型單次點擊出價",
  manual_cpm: "手動千次曝光出價",
  manual_cpv: "手動單次收視出價",
  maximize_conversions: "盡量爭取轉換",
  maximize_conversion_value: "盡量爭取轉換價值",
  target_cpa: "目標單次轉換出價",
  target_cpa_micros: "目標單次轉換出價",
  target_roas: "目標廣告投資報酬率",
  target_impression_share: "目標曝光佔有率",
  target_spend: "目標支出",
  target_spend_micros: "目標支出",
  percent_cpc: "百分比單次點擊出價",
  commission: "佣金",
  commission_rate_micros: "佣金率",
  location: "位置",
  location_fraction_micros: "目標曝光佔有率",
  cpc_bid_ceiling_micros: "單次點擊出價上限",
  cpc_bid_floor_micros: "單次點擊出價下限",
  cpc_bid_micros: "單次點擊出價",
  cpm_bid_micros: "千次曝光出價",
  cpv_bid_micros: "單次收視出價",
  percent_cpc_bid_micros: "百分比單次點擊出價",
  effective_target_cpa_micros: "有效目標單次轉換出價",
  effective_target_roas: "有效目標廣告投資報酬率",
  effective_target_cpa_source: "有效目標單次轉換出價來源",
  effective_target_roas_source: "有效目標廣告投資報酬率來源",
  ad_rotation_mode: "廣告輪播模式",
  display_custom_bid_dimension: "多媒體自訂出價維度",
  fixed_cpm: "固定千次曝光出價",
  target_cpm: "目標千次曝光出價",
  target_frequency_goal: "目標頻率",
  "manual_cpc.enhanced_cpc_enabled": "加強型單次點擊出價",
  "maximize_conversions.target_cpa_micros": "目標單次轉換出價",
  "maximize_conversion_value.target_roas": "目標廣告投資報酬率",
  "target_cpa.target_cpa_micros": "目標單次轉換出價",
  "target_roas.target_roas": "目標廣告投資報酬率",
  "campaign_budget.amount_micros": "廣告預算金額",
  keyword: "關鍵字",
  "keyword.text": "關鍵字",
  "keyword.match_type": "比對類型",
  match_type: "比對類型",
  negative: "排除",
  bid_modifier: "出價調整",
  cpc_bid: "單次點擊出價",
  quality_info: "品質資訊",
  quality_score: "品質分數",
  creative_quality_score: "廣告品質",
  post_click_quality_score: "到達網頁體驗",
  search_predicted_ctr: "預期點閱率",
  age_range: "年齡",
  gender: "性別",
  income_range: "家庭收入",
  parental_status: "親職狀態",
  user_list: "使用者名單",
  user_interest: "興趣",
  life_event: "人生大事",
  geo_target_constant: "地區",
  language_constant: "語言",
  topic: "主題",
  topic_constant: "主題",
  placement: "刊登位置",
  youtube_video: "YouTube 影片",
  youtube_channel: "YouTube 頻道",
  webpage: "網頁",
  criterion_name: "條件名稱",
  proximity: "鄰近地區",
  radius: "半徑",
  radius_units: "半徑單位",
  address: "地址",
  listing_group: "產品群組",
  custom_audience: "自訂目標對象",
  custom_affinity: "自訂相似目標對象",
  combined_audience: "組合目標對象",
  audience: "目標對象",
  mobile_application: "流動應用程式",
  mobile_app_category: "應用程式類別",
  app_id: "應用程式編號",
  device: "裝置",
  ad_schedule: "廣告時段",
  day_of_week: "星期",
  start_hour: "開始小時",
  start_minute: "開始分鐘",
  end_hour: "結束小時",
  end_minute: "結束分鐘",
  ip_block: "IP 位址",
  ip_address: "IP 位址",
  headlines: "標題",
  descriptions: "說明",
  headline: "標題",
  description: "說明",
  long_headline: "詳細標題",
  business_name: "商家名稱",
  call_to_action_text: "號召用語",
  marketing_images: "行銷圖片",
  square_marketing_images: "方形行銷圖片",
  logo_images: "標誌",
  youtube_videos: "YouTube 影片",
  text: "文字",
  pinned_field: "固定位置",
  asset_performance_label: "素材成效",
  ad_strength: "廣告效力",
  policy_summary: "政策摘要",
  approval_status: "核准狀態",
  review_status: "審核狀態",
  added_by_google_ads: "由 Google Ads 新增",
  device_preference: "裝置偏好",
  system_managed_resource_source: "系統管理來源",
  field_type: "素材欄位類型",
  source: "來源",
  primary_status_details: "主要狀態詳情",
  asset: "素材",
  image_asset: "圖片素材",
  text_asset: "文字素材",
  youtube_video_asset: "YouTube 影片素材",
  media_bundle_asset: "媒體套件",
  lead_form_asset: "潛在客戶表單",
  call_asset: "通話素材",
  callout_asset: "宣傳資訊",
  sitelink_asset: "網站連結",
  structured_snippet_asset: "結構化摘要",
  promotion_asset: "促銷活動",
  price_asset: "價格素材",
  mobile_app_asset: "流動應用程式素材",
  link_text: "連結文字",
  description1: "說明 1",
  description2: "說明 2",
  callout_text: "宣傳文字",
  header: "標題",
  values: "值",
  promotion_target: "促銷目標",
  discount_modifier: "折扣類型",
  percent_off: "折扣百分比",
  money_amount_off: "折扣金額",
  promotion_code: "促銷代碼",
  orders_over_amount: "最低消費金額",
  language: "語言",
  country_code: "國家代碼",
  phone_number: "電話號碼",
  country_code_phone: "電話國家代碼",
  conversion_type_id: "轉換類型編號",
  conversion_reporting_state: "轉換報表狀態",
  call_conversion_action: "通話轉換動作",
  call_only: "只限通話",
  video_id: "影片編號",
  channel_id: "頻道編號",
  file_size: "檔案大小",
  mime_type: "檔案類型",
  full_size: "完整尺寸",
  height_pixels: "高度（像素）",
  width_pixels: "寬度（像素）",
  url: "網址",
  youtube_video_title: "YouTube 影片標題",
  youtube_video_id: "YouTube 影片編號",
  automated: "自動產生",
  action_items: "建議動作",
  asset_automation_settings: "素材自動化設定",
  asset_automation_type: "素材自動化類型",
  asset_automation_status: "素材自動化狀態",
  demand_gen_ad_strength: "需求開發廣告效力",
  ad_group_ad_asset_automation_settings: "廣告素材自動化設定",
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  BROAD: "廣泛比對關鍵字",
  PHRASE: "詞句配對關鍵字",
  EXACT: "完全比對關鍵字",
};

function timestampMicros(resourceName: string): string {
  const match = resourceName.match(/changeEvents\/(\d+)~/);
  return match?.[1] || "";
}

function fieldLabel(field: string): string {
  const key = toSnakePath(field);
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const last = key.split(".").pop() || key;
  if (FIELD_LABELS[last]) return FIELD_LABELS[last];
  return last.replace(/_micros$/, "").replace(/_/g, "");
}

function isStatusField(field: string): boolean {
  const key = toSnakePath(field);
  return key === "status" || key.endsWith(".status");
}

function isBudgetAmount(field: string): boolean {
  return toSnakePath(field).includes("amount_micros");
}

function isBiddingField(field: string, resourceType: string): boolean {
  const f = field.toLowerCase();
  return (
    resourceType === "AD_GROUP_BID_MODIFIER" ||
    f.includes("cpc") ||
    f.includes("cpa") ||
    f.includes("roas") ||
    f.includes("bidding") ||
    f.includes("bid")
  );
}

function criterionKind(event: CampaignChangeEventRow): "location" | "language" | "audience" | "keyword" | "" {
  const blob = `${event.changedFields.join(" ")} ${event.changes.map((c) => `${c.field} ${c.oldValue} ${c.newValue}`).join(" ")}`.toLowerCase();
  if (blob.includes("location") || blob.includes("proximity") || blob.includes("geo_target")) return "location";
  if (blob.includes("language")) return "language";
  if (blob.includes("user_list") || blob.includes("user_interest") || blob.includes("audience")) return "audience";
  if (blob.includes("keyword") || event.resourceType.includes("CRITERION")) return "keyword";
  return "";
}

function lineCategory(event: CampaignChangeEventRow, field: string): ChangeHistoryCategory {
  if (isStatusField(field)) return "status";
  if (event.resourceType === "CAMPAIGN_BUDGET" || isBudgetAmount(field)) return "budget";
  if (isBiddingField(field, event.resourceType)) return "bidding";
  if (event.resourceType === "FEED" || event.resourceType === "FEED_ITEM" || event.resourceType.includes("FEED")) {
    return "feeds";
  }
  const kind = criterionKind(event);
  if (kind === "location") return "location";
  if (kind === "language") return "language";
  if (kind === "audience") return "audience";
  const f = field.toLowerCase();
  if (f.includes("conversion")) return "conversions";
  if (
    event.resourceType === "AD" ||
    event.resourceType === "AD_GROUP_AD" ||
    event.resourceType.includes("ASSET")
  ) {
    return "ads";
  }
  return "other";
}

function moneyDirection(oldValue: string, newValue: string): "up" | "down" | "" {
  const oldN = Number(String(oldValue).replace(/,/g, ""));
  const newN = Number(String(newValue).replace(/,/g, ""));
  if (!Number.isFinite(oldN) || !Number.isFinite(newN) || oldN === newN) return "";
  return newN > oldN ? "up" : "down";
}

function keywordPhrase(event: CampaignChangeEventRow): string {
  const match = event.changes.find((c) => toSnakePath(c.field).includes("match_type"));
  const raw = (match?.newValue && match.newValue !== "—" ? match.newValue : match?.oldValue) || "";
  const fromEnum = MATCH_TYPE_LABELS[raw.toUpperCase()];
  if (fromEnum) return fromEnum;
  if (raw.includes("廣泛")) return "廣泛比對關鍵字";
  if (raw.includes("詞句")) return "詞句配對關鍵字";
  if (raw.includes("完全")) return "完全比對關鍵字";
  return "關鍵字";
}

function keywordSentence(event: CampaignChangeEventRow): string {
  const verb = event.operation === "REMOVE" ? "已移除" : event.operation === "CREATE" ? "已新增" : "已變更";
  const phrase = keywordPhrase(event);
  return event.keywordText
    ? `${verb}「${phrase}」：${event.keywordText}`
    : `${verb} 1 個「${phrase}」`;
}

function describeChange(event: CampaignChangeEventRow, change: CampaignChangeFieldDiff): string {
  const field = change.field;
  const category = lineCategory(event, field);
  if (event.resourceType === "CAMPAIGN" && isStatusField(field)) return "廣告系列已變更";
  if (event.resourceType === "CAMPAIGN_BUDGET" && (isStatusField(field) || isBudgetAmount(field))) {
    const dir = moneyDirection(change.oldValue, change.newValue);
    if (dir === "up") return "已提高 1 個廣告預算金額";
    if (dir === "down") return "已降低 1 個廣告預算金額";
    return "廣告預算已變更";
  }
  if (event.resourceType === "AD_GROUP" && isStatusField(field)) return "廣告群組已變更";
  if (category === "conversions" && /default|account/i.test(`${change.oldValue} ${change.newValue}`)) {
    return "已使用帳戶預設目標";
  }
  if (category === "conversions") return "標準目標有變";
  if (
    (event.operation === "REMOVE" || event.operation === "CREATE") &&
    criterionKind(event) === "keyword"
  ) {
    return keywordSentence(event);
  }
  if (criterionKind(event) === "keyword" && event.keywordText && !toSnakePath(field).includes("keyword.text")) {
    const label = fieldLabel(field);
    const body = change.oldValue !== "—" && change.newValue !== "—"
      ? `${label}已從「${change.oldValue}」變更為「${change.newValue}」`
      : change.newValue !== "—"
      ? `${label}：${change.newValue}`
      : label;
    return `關鍵字「${event.keywordText}」${body}`;
  }
  if (event.resourceType === "CAMPAIGN" && field.toLowerCase() === "name" && change.oldValue !== "—" && change.newValue !== "—") {
    return `廣告系列名稱已從「${change.oldValue}」變更為「${change.newValue}」`;
  }
  const label = fieldLabel(field);
  if (change.oldValue !== "—" && change.newValue !== "—") {
    return `${label}已從「${change.oldValue}」變更為「${change.newValue}」`;
  }
  if (change.newValue !== "—") return `${label}：${change.newValue}`;
  if (change.oldValue !== "—") return `已移除${label}「${change.oldValue}」`;
  return label;
}

function withRecommendationPrefix(event: CampaignChangeEventRow, text: string): string {
  if (!/RECOMMENDATION/i.test(event.clientType)) return text;
  if (text.startsWith("已套用的建議")) return text;
  return `已套用的建議：${text}`;
}

function collapseKeywordLines(lines: ChangeHistoryLine[]): ChangeHistoryLine[] {
  const counts = new Map<string, { count: number; category: ChangeHistoryCategory; index: number }>();
  const out: ChangeHistoryLine[] = [];
  lines.forEach((line, index) => {
    const match = line.text.match(/^(已移除|已新增) 1 個「(.+)」$/);
    if (!match) {
      out.push(line);
      return;
    }
    const key = `${match[1]}|${match[2]}|${line.category}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      out[existing.index] = {
        category: line.category,
        text: `${match[1]} ${existing.count} 個「${match[2]}」`,
      };
      return;
    }
    counts.set(key, { count: 1, category: line.category, index: out.length });
    out.push(line);
  });
  return out;
}

function eventLines(event: CampaignChangeEventRow): ChangeHistoryLine[] {
  if (
    (event.operation === "REMOVE" || event.operation === "CREATE") &&
    criterionKind(event) === "keyword"
  ) {
    return [{
      category: "other",
      text: withRecommendationPrefix(event, keywordSentence(event)),
    }];
  }
  const changes = (event.changes.length
    ? event.changes
    : [{ field: event.operation || "change", oldValue: "—", newValue: "—" }]
  ).filter((change) => {
    const key = toSnakePath(change.field);
    return key !== "resource_name" && !key.endsWith(".resource_name");
  });
  const lines = changes.map((change) => ({
    category: lineCategory(event, change.field),
    text: withRecommendationPrefix(event, describeChange(event, change)),
  }));
  const seen = new Set<string>();
  return collapseKeywordLines(lines).filter((line) => {
    if (seen.has(line.text)) return false;
    seen.add(line.text);
    return true;
  });
}

export function groupChangeEventsIntoSessions(events: CampaignChangeEventRow[]): ChangeHistorySession[] {
  const order: string[] = [];
  const sessions = new Map<string, ChangeHistorySession>();
  for (const event of events) {
    const stamp = timestampMicros(event.resourceName) || event.changeDateTime;
    const key = `${stamp}|${event.userEmail}`;
    let session = sessions.get(key);
    if (!session) {
      session = {
        id: key,
        userEmail: event.userEmail,
        clientType: event.clientType,
        changeDateTime: event.changeDateTime,
        adGroupResource: event.adGroupResource,
        assetGroupResource: event.changedResourceName.includes("/assetGroups/")
          ? event.changedResourceName
          : "",
        adGroupName: "",
        assetGroupName: "",
        lines: [],
      };
      sessions.set(key, session);
      order.push(key);
    }
    if (!session.adGroupResource && event.adGroupResource) session.adGroupResource = event.adGroupResource;
    if (!session.adGroupResource && /\/adGroups\/|\/adGroupAds\/|\/adGroupCriteria\//.test(event.changedResourceName)) {
      session.adGroupResource = event.changedResourceName;
    }
    if (!session.assetGroupResource && event.changedResourceName.includes("/assetGroups/")) {
      session.assetGroupResource = event.changedResourceName;
    }
    if (event.changeDateTime > session.changeDateTime) session.changeDateTime = event.changeDateTime;
    session.lines.push(...eventLines(event));
  }
  return order
    .map((key) => {
      const session = sessions.get(key)!;
      return { ...session, lines: collapseKeywordLines(session.lines) };
    })
    .sort((a, b) => b.changeDateTime.localeCompare(a.changeDateTime));
}

export async function attachSessionNames(
  accessToken: string,
  customerId: string,
  campaignId: string,
  sessions: ChangeHistorySession[],
): Promise<ChangeHistorySession[]> {
  const adGroupIds = new Set<string>();
  const assetGroupIds = new Set<string>();
  for (const session of sessions) {
    const adId = resourceId(session.adGroupResource, "/adGroups/") ||
      resourceId(session.adGroupResource, "/adGroupAds/") ||
      resourceId(session.adGroupResource, "/adGroupCriteria/");
    const assetId = resourceId(session.assetGroupResource, "/assetGroups/");
    if (adId) adGroupIds.add(adId);
    if (assetId) assetGroupIds.add(assetId);
  }
  const adGroupNames = new Map<string, string>();
  const assetGroupNames = new Map<string, string>();
  if (adGroupIds.size) {
    const rows = await gaqlQuery(
      accessToken,
      customerId,
      `SELECT ad_group.id, ad_group.name FROM ad_group WHERE campaign.id = ${campaignId} AND ad_group.id IN (${[...adGroupIds].join(", ")})`,
    );
    for (const row of rows) {
      adGroupNames.set(String(nestGet(row, "adGroup.id") ?? ""), String(nestGet(row, "adGroup.name") ?? ""));
    }
  }
  if (assetGroupIds.size) {
    const rows = await gaqlQuery(
      accessToken,
      customerId,
      `SELECT asset_group.id, asset_group.name FROM asset_group WHERE campaign.id = ${campaignId} AND asset_group.id IN (${[...assetGroupIds].join(", ")})`,
    );
    for (const row of rows) {
      assetGroupNames.set(String(nestGet(row, "assetGroup.id") ?? ""), String(nestGet(row, "assetGroup.name") ?? ""));
    }
  }
  return sessions.map((session) => {
    const adId = resourceId(session.adGroupResource, "/adGroups/") ||
      resourceId(session.adGroupResource, "/adGroupAds/") ||
      resourceId(session.adGroupResource, "/adGroupCriteria/");
    const assetId = resourceId(session.assetGroupResource, "/assetGroups/");
    return {
      ...session,
      adGroupName: adGroupNames.get(adId) || "",
      assetGroupName: assetGroupNames.get(assetId) || "",
    };
  });
}

function withCtr(impressions: number, clicks: number): number {
  return impressions > 0 ? clicks / impressions : 0;
}

/** Period-aggregated ad groups for one campaign (no segments.date). */
export async function fetchLiveCampaignAdGroups(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<LiveAdGroupRow[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveAdGroupRow[] = [];
  for (const row of result) {
    const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
    if (!adGroupId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      adGroupId,
      adGroupName: String(nestGet(row, "adGroup.name") ?? adGroupId),
      status: String(nestGet(row, "adGroup.status") ?? "") || undefined,
      adGroupType: String(nestGet(row, "adGroup.type") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows;
}

/** Period-aggregated keywords for one campaign. */
export async function fetchLiveCampaignKeywords(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<LiveKeywordRow[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM keyword_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveKeywordRow[] = [];
  for (const row of result) {
    const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
    const criterionId = String(
      nestGet(row, "adGroupCriterion.criterionId") ?? "",
    );
    if (!adGroupId || !criterionId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    const qsRaw = nestGet(row, "adGroupCriterion.qualityInfo.qualityScore");
    rows.push({
      adGroupId,
      criterionId,
      keywordText: String(
        nestGet(row, "adGroupCriterion.keyword.text") ?? criterionId,
      ),
      matchType:
        String(nestGet(row, "adGroupCriterion.keyword.matchType") ?? "") ||
        undefined,
      status: String(nestGet(row, "adGroupCriterion.status") ?? "") || undefined,
      qualityScore:
        qsRaw === undefined || qsRaw === null || qsRaw === ""
          ? null
          : asInt(qsRaw),
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows;
}

/** Period-aggregated search terms for Search campaigns (top N by cost). */
export async function fetchLiveCampaignSearchTerms(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  limit = 100,
): Promise<LiveSearchTermRow[]> {
  const query = `
    SELECT
      ad_group.id,
      search_term_view.search_term,
      search_term_view.status,
      segments.keyword.info.text,
      segments.keyword.info.match_type,
      segments.search_term_match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveSearchTermRow[] = [];
  for (const row of result) {
    const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
    const searchTerm = String(nestGet(row, "searchTermView.searchTerm") ?? "")
      .trim()
      .slice(0, 512);
    if (!adGroupId || !searchTerm) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      adGroupId,
      searchTerm,
      keywordText:
        String(nestGet(row, "segments.keyword.info.text") ?? "") || undefined,
      matchType:
        String(nestGet(row, "segments.keyword.info.matchType") ?? "") ||
        undefined,
      searchTermStatus:
        String(nestGet(row, "searchTermView.status") ?? "") || undefined,
      searchTermMatchType:
        String(nestGet(row, "segments.searchTermMatchType") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows.slice(0, Math.max(limit, 1));
}

/** Performance Max / campaign-level search terms (no ad group). */
export async function fetchLiveCampaignSearchTermsPMax(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  limit = 100,
): Promise<LiveSearchTermRow[]> {
  const query = `
    SELECT
      campaign_search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign_search_term_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveSearchTermRow[] = [];
  for (const row of result) {
    const searchTerm = String(
      nestGet(row, "campaignSearchTermView.searchTerm") ?? "",
    )
      .trim()
      .slice(0, 512);
    if (!searchTerm) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      searchTerm,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows.slice(0, Math.max(limit, 1));
}

/** Performance Max asset groups. */
export async function fetchLiveCampaignAssetGroups(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<LiveAssetGroupRow[]> {
  const query = `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.primary_status,
      asset_group.ad_strength,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM asset_group
    WHERE campaign.id = ${campaignId}
      AND asset_group.status != 'REMOVED'
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveAssetGroupRow[] = [];
  for (const row of result) {
    const assetGroupId = String(nestGet(row, "assetGroup.id") ?? "");
    if (!assetGroupId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      assetGroupId,
      assetGroupName: String(
        nestGet(row, "assetGroup.name") ?? assetGroupId,
      ),
      status: String(nestGet(row, "assetGroup.status") ?? "") || undefined,
      primaryStatus:
        String(nestGet(row, "assetGroup.primaryStatus") ?? "") || undefined,
      adStrength:
        String(nestGet(row, "assetGroup.adStrength") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows;
}

function assetIdFromResourceName(resourceName: unknown): string {
  const raw = String(resourceName ?? "");
  if (!raw) return "";
  const parts = raw.split("/");
  return parts[parts.length - 1] || "";
}

/** Performance Max assets via asset_group_asset. */
export async function fetchLiveCampaignPMaxAssets(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  limit = 150,
): Promise<LiveAssetRow[]> {
  // Keep SELECT close to Google's documented PMax asset report.
  // Prefer asset.name when selectable; fall back to resource-name parsing.
  const attempts = [
    `
    SELECT
      asset_group.id,
      asset_group.name,
      asset.id,
      asset.name,
      asset.type,
      asset.text_asset.text,
      asset.youtube_video_asset.youtube_video_title,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset_group_asset.primary_status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM asset_group_asset
    WHERE campaign.id = ${campaignId}
      AND asset_group_asset.status != 'REMOVED'
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
    `
    SELECT
      asset_group.id,
      asset_group.name,
      asset_group_asset.asset,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset_group_asset.primary_status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM asset_group_asset
    WHERE campaign.id = ${campaignId}
      AND asset_group_asset.status != 'REMOVED'
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
  ];

  let result: GaqlRow[] = [];
  let lastError: unknown;
  for (const query of attempts) {
    try {
      result = await gaqlQuery(accessToken, customerId, query);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw lastError;

  const rows: LiveAssetRow[] = [];
  for (const row of result) {
    const assetId =
      String(nestGet(row, "asset.id") ?? "") ||
      assetIdFromResourceName(nestGet(row, "assetGroupAsset.asset"));
    if (!assetId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    const fieldType =
      String(nestGet(row, "assetGroupAsset.fieldType") ?? "") || undefined;
    const primaryStatus =
      String(nestGet(row, "assetGroupAsset.primaryStatus") ?? "") || undefined;
    const assetName =
      String(nestGet(row, "asset.name") ?? "") ||
      String(nestGet(row, "asset.textAsset.text") ?? "") ||
      String(nestGet(row, "asset.youtubeVideoAsset.youtubeVideoTitle") ?? "") ||
      undefined;
    const assetType = String(nestGet(row, "asset.type") ?? "") || undefined;
    rows.push({
      assetId,
      assetName: assetName || (fieldType ? `${fieldType} · ${assetId}` : assetId),
      assetType,
      fieldType,
      status:
        primaryStatus ||
        String(nestGet(row, "assetGroupAsset.status") ?? "") ||
        undefined,
      assetGroupId: String(nestGet(row, "assetGroup.id") ?? "") || undefined,
      assetGroupName:
        String(nestGet(row, "assetGroup.name") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros || b.impressions - a.impressions);
  return rows.slice(0, Math.max(limit, 1));
}

/** Demand Gen / Search-style ads via ad_group_ad. */
export async function fetchLiveCampaignAds(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<LiveAdRow[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.name,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId}
      AND ad_group_ad.status != 'REMOVED'
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveAdRow[] = [];
  for (const row of result) {
    const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
    const adId = String(nestGet(row, "adGroupAd.ad.id") ?? "");
    if (!adGroupId || !adId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      adGroupId,
      adGroupName: String(nestGet(row, "adGroup.name") ?? "") || undefined,
      adId,
      adName: String(nestGet(row, "adGroupAd.ad.name") ?? "") || undefined,
      adType: String(nestGet(row, "adGroupAd.ad.type") ?? "") || undefined,
      status: String(nestGet(row, "adGroupAd.status") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows;
}

/** Demand Gen assets via ad_group_ad_asset_view. */
export async function fetchLiveCampaignDemandGenAssets(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  limit = 150,
): Promise<LiveAssetRow[]> {
  // Prefer richer metrics; fall back if cost/clicks are incompatible for this view.
  const attempts = [
    `
    SELECT
      ad_group.id,
      ad_group_ad.ad.id,
      asset.id,
      asset.name,
      asset.type,
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.performance_label,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group_ad_asset_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
    `
    SELECT
      ad_group.id,
      ad_group_ad.ad.id,
      asset.id,
      asset.name,
      asset.type,
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.performance_label,
      metrics.impressions
    FROM ad_group_ad_asset_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
  ];

  let result: GaqlRow[] = [];
  let lastError: unknown;
  for (const query of attempts) {
    try {
      result = await gaqlQuery(accessToken, customerId, query);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw lastError;

  const rows: LiveAssetRow[] = [];
  for (const row of result) {
    const assetId = String(nestGet(row, "asset.id") ?? "");
    if (!assetId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    const fieldType =
      String(nestGet(row, "adGroupAdAssetView.fieldType") ?? "") || undefined;
    const assetName = String(nestGet(row, "asset.name") ?? "") || undefined;
    rows.push({
      assetId,
      assetName: assetName || fieldType || assetId,
      assetType: String(nestGet(row, "asset.type") ?? "") || undefined,
      fieldType,
      performanceLabel:
        String(nestGet(row, "adGroupAdAssetView.performanceLabel") ?? "") ||
        undefined,
      adGroupId: String(nestGet(row, "adGroup.id") ?? "") || undefined,
      adId: String(nestGet(row, "adGroupAd.ad.id") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros || b.impressions - a.impressions);
  return rows.slice(0, Math.max(limit, 1));
}

function listingGroupLabel(row: GaqlRow, criterionId: string): string {
  const caseValue = nestGet(row, "adGroupCriterion.listingGroup.caseValue");
  const cv =
    caseValue && typeof caseValue === "object"
      ? (caseValue as Record<string, unknown>)
      : {};
  const candidates = [
    nestGet(cv, "productItemId.value"),
    nestGet(cv, "productBrand.value"),
    nestGet(cv, "productType.value"),
    nestGet(cv, "productCustomAttribute.value"),
    nestGet(cv, "productChannel.channel"),
    nestGet(cv, "productCondition.condition"),
    nestGet(row, "adGroupCriterion.listingGroup.caseValue.productItemId.value"),
    nestGet(row, "adGroupCriterion.listingGroup.caseValue.productBrand.value"),
    nestGet(row, "adGroupCriterion.listingGroup.caseValue.productType.value"),
    nestGet(
      row,
      "adGroupCriterion.listingGroup.caseValue.productCustomAttribute.value",
    ),
    nestGet(
      row,
      "adGroupCriterion.listingGroup.caseValue.productChannel.channel",
    ),
    nestGet(
      row,
      "adGroupCriterion.listingGroup.caseValue.productCondition.condition",
    ),
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  if (candidates.length) return candidates[0];
  const listingType = String(
    nestGet(row, "adGroupCriterion.listingGroup.type") ?? "",
  );
  if (listingType === "SUBDIVISION") return "All products (subdivision)";
  if (listingType === "UNIT") return "Everything else";
  return criterionId;
}

/** Shopping listing / product groups via product_group_view. */
export async function fetchLiveCampaignProductGroups(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
): Promise<LiveProductGroupRow[]> {
  const query = `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.status,
      ad_group_criterion.listing_group.type,
      ad_group_criterion.listing_group.case_value.product_brand.value,
      ad_group_criterion.listing_group.case_value.product_item_id.value,
      ad_group_criterion.listing_group.case_value.product_type.value,
      ad_group_criterion.listing_group.case_value.product_custom_attribute.value,
      ad_group_criterion.listing_group.case_value.product_channel.channel,
      ad_group_criterion.listing_group.case_value.product_condition.condition,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM product_group_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;
  const result = await gaqlQuery(accessToken, customerId, query);
  const rows: LiveProductGroupRow[] = [];
  for (const row of result) {
    const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
    const criterionId = String(
      nestGet(row, "adGroupCriterion.criterionId") ?? "",
    );
    if (!adGroupId || !criterionId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      adGroupId,
      adGroupName: String(nestGet(row, "adGroup.name") ?? "") || undefined,
      criterionId,
      productGroupLabel: listingGroupLabel(row, criterionId),
      listingGroupType:
        String(nestGet(row, "adGroupCriterion.listingGroup.type") ?? "") ||
        undefined,
      status:
        String(nestGet(row, "adGroupCriterion.status") ?? "") || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros);
  return rows;
}

/** Shopping products via shopping_performance_view / shopping_product (top N by cost). */
export async function fetchLiveCampaignShoppingProducts(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  limit = 100,
): Promise<LiveProductRow[]> {
  const campaignResource =
    `customers/${customerId}/campaigns/${campaignId}`;
  const attempts = [
    `
    SELECT
      campaign.id,
      segments.product_item_id,
      segments.product_title,
      segments.product_brand,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM shopping_performance_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
    `
    SELECT
      segments.product_item_id,
      segments.product_title,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM shopping_performance_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
    `
    SELECT
      shopping_product.item_id,
      shopping_product.title,
      shopping_product.brand,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM shopping_product
    WHERE shopping_product.campaign = '${campaignResource}'
      AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    `,
  ];

  let result: GaqlRow[] = [];
  let lastError: unknown;
  for (const query of attempts) {
    try {
      result = await gaqlQuery(accessToken, customerId, query);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw lastError;

  const rows: LiveProductRow[] = [];
  for (const row of result) {
    const productItemId = String(
      nestGet(row, "segments.productItemId") ??
        nestGet(row, "shoppingProduct.itemId") ??
        "",
    ).trim();
    if (!productItemId) continue;
    const impressions = asInt(nestGet(row, "metrics.impressions"));
    const clicks = asInt(nestGet(row, "metrics.clicks"));
    rows.push({
      productItemId,
      productTitle:
        String(
          nestGet(row, "segments.productTitle") ??
            nestGet(row, "shoppingProduct.title") ??
            "",
        ) || undefined,
      productBrand:
        String(
          nestGet(row, "segments.productBrand") ??
            nestGet(row, "shoppingProduct.brand") ??
            "",
        ) || undefined,
      impressions,
      clicks,
      costMicros: asInt(nestGet(row, "metrics.costMicros")),
      conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
      ctr: withCtr(impressions, clicks),
    });
  }
  rows.sort((a, b) => b.costMicros - a.costMicros || b.impressions - a.impressions);
  return rows.slice(0, Math.max(limit, 1));
}

function emptyBreakdownResult(
  channelType: string,
  errors: string[],
): LiveCampaignBreakdownsResult {
  return {
    channelType,
    supported: false,
    adGroups: [],
    keywords: [],
    searchTerms: [],
    assetGroups: [],
    ads: [],
    assets: [],
    productGroups: [],
    products: [],
    errors,
  };
}

export async function fetchLiveCampaignBreakdowns(
  accessToken: string,
  customerId: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  channelTypeHint?: string | null,
): Promise<LiveCampaignBreakdownsResult> {
  const errors: string[] = [];
  let channelRaw = channelTypeHint?.trim() || "";
  if (!normalizeLiveBreakdownChannel(channelRaw)) {
    channelRaw =
      (await settleBreakdown(
        "campaign.channel",
        fetchCampaignAdvertisingChannelType(
          accessToken,
          customerId,
          campaignId,
        ),
        null,
        errors,
      )) || "";
  }

  const channel = normalizeLiveBreakdownChannel(channelRaw);
  if (!channel) {
    return emptyBreakdownResult(channelRaw || "UNKNOWN", errors);
  }

  if (channel === "SEARCH") {
    const [adGroups, keywords, searchTerms] = await Promise.all([
      settleBreakdown(
        "ad_group",
        fetchLiveCampaignAdGroups(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
        ),
        [] as LiveAdGroupRow[],
        errors,
      ),
      settleBreakdown(
        "keyword",
        fetchLiveCampaignKeywords(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
        ),
        [] as LiveKeywordRow[],
        errors,
      ),
      settleBreakdown(
        "search_term",
        fetchLiveCampaignSearchTerms(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
          100,
        ),
        [] as LiveSearchTermRow[],
        errors,
      ),
    ]);
    return {
      channelType: channel,
      supported: true,
      adGroups,
      keywords,
      searchTerms,
      assetGroups: [],
      ads: [],
      assets: [],
      productGroups: [],
      products: [],
      errors,
    };
  }

  if (channel === "DEMAND_GEN") {
    const [adGroups, ads, assets] = await Promise.all([
      settleBreakdown(
        "ad_group",
        fetchLiveCampaignAdGroups(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
        ),
        [] as LiveAdGroupRow[],
        errors,
      ),
      settleBreakdown(
        "ad_group_ad",
        fetchLiveCampaignAds(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
        ),
        [] as LiveAdRow[],
        errors,
      ),
      settleBreakdown(
        "ad_group_ad_asset_view",
        fetchLiveCampaignDemandGenAssets(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
          150,
        ),
        [] as LiveAssetRow[],
        errors,
      ),
    ]);
    return {
      channelType: channel,
      supported: true,
      adGroups,
      keywords: [],
      searchTerms: [],
      assetGroups: [],
      ads,
      assets,
      productGroups: [],
      products: [],
      errors,
    };
  }

  if (channel === "SHOPPING") {
    const [adGroups, productGroups, products] = await Promise.all([
      settleBreakdown(
        "ad_group",
        fetchLiveCampaignAdGroups(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
        ),
        [] as LiveAdGroupRow[],
        errors,
      ),
      settleBreakdown(
        "product_group_view",
        fetchLiveCampaignProductGroups(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
        ),
        [] as LiveProductGroupRow[],
        errors,
      ),
      settleBreakdown(
        "shopping_performance_view",
        fetchLiveCampaignShoppingProducts(
          accessToken,
          customerId,
          campaignId,
          dateFrom,
          dateTo,
          100,
        ),
        [] as LiveProductRow[],
        errors,
      ),
    ]);
    return {
      channelType: channel,
      supported: true,
      adGroups,
      keywords: [],
      searchTerms: [],
      assetGroups: [],
      ads: [],
      assets: [],
      productGroups,
      products,
      errors,
    };
  }

  // PERFORMANCE_MAX
  const [assetGroups, assets, searchTerms] = await Promise.all([
    settleBreakdown(
      "asset_group",
      fetchLiveCampaignAssetGroups(
        accessToken,
        customerId,
        campaignId,
        dateFrom,
        dateTo,
      ),
      [] as LiveAssetGroupRow[],
      errors,
    ),
    settleBreakdown(
      "asset_group_asset",
      fetchLiveCampaignPMaxAssets(
        accessToken,
        customerId,
        campaignId,
        dateFrom,
        dateTo,
        150,
      ),
      [] as LiveAssetRow[],
      errors,
    ),
    settleBreakdown(
      "campaign_search_term_view",
      fetchLiveCampaignSearchTermsPMax(
        accessToken,
        customerId,
        campaignId,
        dateFrom,
        dateTo,
        100,
      ),
      [] as LiveSearchTermRow[],
      errors,
    ),
  ]);
  return {
    channelType: channel,
    supported: true,
    adGroups: [],
    keywords: [],
    searchTerms,
    assetGroups,
    ads: [],
    assets,
    productGroups: [],
    products: [],
    errors,
  };
}

export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export function monthEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function countMonthsInclusive(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type CampaignUrlAgg = {
  campaignId: string;
  campaignName: string;
  urls: string[];
  urlSource: "final_url" | "landing_page";
  scanned: boolean;
  channelType: string;
  fromAssetGroup: boolean;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && !!x);
}

function ensureCampaignAgg(
  campaignMap: Map<string, CampaignUrlAgg>,
  campaignId: string,
  campaignName: string,
  scanned = false,
  channelType = "",
): CampaignUrlAgg {
  const existing = campaignMap.get(campaignId);
  if (!existing) {
    const created: CampaignUrlAgg = {
      campaignId,
      campaignName,
      urls: [],
      urlSource: "final_url",
      scanned,
      channelType: channelType.toUpperCase(),
      fromAssetGroup: false,
    };
    campaignMap.set(campaignId, created);
    return created;
  }
  if (campaignName && !existing.campaignName) existing.campaignName = campaignName;
  if (channelType && !existing.channelType) existing.channelType = channelType.toUpperCase();
  if (scanned) existing.scanned = true;
  return existing;
}

function addCampaignUrls(
  agg: CampaignUrlAgg,
  urls: string[],
  source: "final_url" | "landing_page",
): void {
  for (const u of urls) {
    if (u && !agg.urls.includes(u)) agg.urls.push(u);
  }
  if (!urls.length) return;
  if (source === "final_url" || agg.urls.length === urls.length) {
    agg.urlSource = source;
  }
}

async function seedCampaignsFromWarehouse(
  supabase: SupabaseClient,
  customerId: string,
  campaignMap: Map<string, CampaignUrlAgg>,
): Promise<void> {
  const { data, error } = await supabase
    .from("google_ads_campaigns")
    .select("campaign_id,campaign_name,advertising_channel_type")
    .eq("customer_id", customerId);
  if (error) throw new Error(error.message);
  for (const row of (
    data as {
      campaign_id: string;
      campaign_name: string | null;
      advertising_channel_type: string | null;
    }[] | null
  ) ?? []) {
    const campaignId = String(row.campaign_id || "");
    if (!campaignId) continue;
    ensureCampaignAgg(
      campaignMap,
      campaignId,
      String(row.campaign_name || ""),
      false,
      String(row.advertising_channel_type || ""),
    );
  }
}

/**
 * Discover final URLs / landing pages for Google campaigns and link them to
 * webandsystem_list rows by domain (with campaign/account name fallback).
 *
 * Performance Max has no ad_group_ad rows, so we also seed warehouse campaigns,
 * read asset_group.final_urls, and always query landing_page_view.
 */
export async function linkGoogleCampaignWebsites(
  supabase: SupabaseClient,
  accessToken: string,
  customerIds: string[],
  accountNameByCustomerId: Map<string, string>,
  nowIso: string,
): Promise<AdsLinkSummary> {
  const empty: AdsLinkSummary = {
    websites_linked: 0,
    domains_discovered: 0,
    domains_unmatched: 0,
    campaigns_with_links: 0,
    pmax_campaigns_scanned: 0,
    pmax_campaigns_with_links: 0,
    link_errors: [],
  };
  if (!customerIds.length) return empty;

  const websites = await loadWebsiteRows(supabase);
  const linkErrors: string[] = [];
  const allReplaceRowIds: string[] = [];
  const allLinkRows: GoogleCampaignWebsiteRow[] = [];
  const discoveredInputs: DiscoveredDomainInput[] = [];
  let pmaxScanned = 0;
  let pmaxLinked = 0;

  type CustomerResult = {
    replaceRowIds: string[];
    linkRows: GoogleCampaignWebsiteRow[];
    discovered: DiscoveredDomainInput[];
    pmaxScanned: number;
    pmaxLinked: number;
  };

  const results = await mapPool(
    customerIds,
    ACCOUNT_CONCURRENCY,
    async (customerId): Promise<CustomerResult | null> => {
      const campaignMap = new Map<string, CampaignUrlAgg>();
      const accountName = accountNameByCustomerId.get(customerId) || "";

      try {
        await seedCampaignsFromWarehouse(supabase, customerId, campaignMap);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        linkErrors.push(`${customerId} warehouse: ${msg.slice(0, 120)}`);
      }

      const liveQueries: Array<{
        label: string;
        query: string;
        apply: (row: GaqlRow) => void;
      }> = [
        {
          label: "campaigns",
          query: `
            SELECT campaign.id, campaign.name, campaign.advertising_channel_type
            FROM campaign
            WHERE campaign.status != 'REMOVED'
          `,
          apply: (row) => {
            const campaignId = String(nestGet(row, "campaign.id") ?? "");
            if (!campaignId) return;
            ensureCampaignAgg(
              campaignMap,
              campaignId,
              String(nestGet(row, "campaign.name") ?? ""),
              false,
              String(nestGet(row, "campaign.advertisingChannelType") ?? ""),
            );
          },
        },
        {
          label: "ads",
          query: `
            SELECT
              campaign.id,
              campaign.name,
              ad_group_ad.ad.final_urls,
              ad_group_ad.ad.final_mobile_urls
            FROM ad_group_ad
            WHERE campaign.status != 'REMOVED'
              AND ad_group_ad.status != 'REMOVED'
          `,
          apply: (row) => {
            const campaignId = String(nestGet(row, "campaign.id") ?? "");
            if (!campaignId) return;
            const agg = ensureCampaignAgg(
              campaignMap,
              campaignId,
              String(nestGet(row, "campaign.name") ?? ""),
              true,
            );
            addCampaignUrls(
              agg,
              [
                ...asStringArray(nestGet(row, "adGroupAd.ad.finalUrls")),
                ...asStringArray(nestGet(row, "adGroupAd.ad.finalMobileUrls")),
              ],
              "final_url",
            );
          },
        },
        {
          label: "asset_groups",
          query: `
            SELECT
              campaign.id,
              campaign.name,
              asset_group.final_urls,
              asset_group.final_mobile_urls
            FROM asset_group
            WHERE campaign.status != 'REMOVED'
              AND asset_group.status != 'REMOVED'
          `,
          apply: (row) => {
            const campaignId = String(nestGet(row, "campaign.id") ?? "");
            if (!campaignId) return;
            const agg = ensureCampaignAgg(
              campaignMap,
              campaignId,
              String(nestGet(row, "campaign.name") ?? ""),
              true,
            );
            const assetUrls = [
              ...asStringArray(nestGet(row, "assetGroup.finalUrls")),
              ...asStringArray(nestGet(row, "assetGroup.finalMobileUrls")),
            ];
            addCampaignUrls(agg, assetUrls, "final_url");
            if (assetUrls.length) {
              agg.fromAssetGroup = true;
              if (!agg.channelType) agg.channelType = "PERFORMANCE_MAX";
            }
          },
        },
        {
          label: "landing_pages",
          query: `
            SELECT
              campaign.id,
              campaign.name,
              landing_page_view.unexpanded_final_url
            FROM landing_page_view
            WHERE segments.date DURING LAST_30_DAYS
          `,
          apply: (row) => {
            const campaignId = String(nestGet(row, "campaign.id") ?? "");
            if (!campaignId) return;
            const agg = ensureCampaignAgg(
              campaignMap,
              campaignId,
              String(nestGet(row, "campaign.name") ?? ""),
              true,
            );
            const url = nestGet(row, "landingPageView.unexpandedFinalUrl");
            const urlStr = typeof url === "string" && url ? url : "";
            if (agg.urls.length === 0 && urlStr) {
              addCampaignUrls(agg, [urlStr], "landing_page");
            } else if (agg.urlSource === "landing_page" && urlStr) {
              addCampaignUrls(agg, [urlStr], "landing_page");
            }
          },
        },
      ];

      for (const live of liveQueries) {
        try {
          const rows = await gaqlQuery(accessToken, customerId, live.query);
          for (const row of rows) live.apply(row);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          linkErrors.push(`${customerId} ${live.label}: ${msg.slice(0, 140)}`);
        }
      }

      const replaceRowIds: string[] = [];
      const linkRows: GoogleCampaignWebsiteRow[] = [];
      const discovered: DiscoveredDomainInput[] = [];

      for (const agg of campaignMap.values()) {
        const campaignRowId = `${customerId}:${agg.campaignId}`;
        if (agg.scanned) replaceRowIds.push(campaignRowId);

        const urlDomains = extractDomainsFromUrls(agg.urls);
        let matchSource: GoogleCampaignWebsiteRow["match_source"] = agg.urlSource;
        let matches = matchDomainsToWebsites(urlDomains, websites);
        let domainsForDiscover = [...urlDomains];

        if (!matches.length) {
          const nameText = `${agg.campaignName} ${accountName}`;
          const nameDomains = [
            ...extractDomainsFromName(agg.campaignName),
            ...extractDomainsFromName(accountName),
          ];
          const uniqueNameDomains = [...new Set(nameDomains)];
          matches = matchDomainsToWebsites(uniqueNameDomains, websites);
          if (!matches.length) {
            matches = matchWebsitesFromText(nameText, websites);
          }
          if (!matches.length) {
            matches = matchWebsitesFromUniqueNameToken(nameText, websites);
          }
          if (matches.length) matchSource = "name";
          for (const d of uniqueNameDomains) {
            if (!domainsForDiscover.includes(d)) domainsForDiscover.push(d);
          }
        }

        const matchedWebsiteByDomain = new Map<string, string>();
        for (const m of matches) {
          matchedWebsiteByDomain.set(m.matched_domain, m.website_profile_id);
          linkRows.push({
            customer_id: customerId,
            campaign_id: agg.campaignId,
            website_profile_id: m.website_profile_id,
            campaign_row_id: campaignRowId,
            matched_domain: m.matched_domain,
            sample_final_url: pickSampleUrlForDomain(m.matched_domain, agg.urls),
            match_source: matchSource,
            last_seen_at: nowIso,
            updated_at: nowIso,
          });
        }

        for (const d of domainsForDiscover) {
          const websiteId = matchedWebsiteByDomain.get(d) ??
            matches.find((m) =>
              m.matched_domain === d ||
              d.endsWith("." + m.matched_domain) ||
              m.matched_domain.endsWith("." + d)
            )?.website_profile_id ??
            null;
          discovered.push({
            normalized_domain: d,
            sample_url: pickSampleUrlForDomain(d, agg.urls),
            source: "google",
            website_profile_id: websiteId,
            source_ref: {
              platform: "google",
              accountId: customerId,
              accountName: accountName || customerId,
              campaignId: agg.campaignId,
              campaignName: agg.campaignName || agg.campaignId,
            },
          });
        }
      }

      const pmaxIds = [...campaignMap.values()]
        .filter((agg) => agg.channelType === "PERFORMANCE_MAX" || agg.fromAssetGroup)
        .map((agg) => agg.campaignId);
      const linkedCampaignIds = new Set(linkRows.map((r) => r.campaign_id));
      return {
        replaceRowIds,
        linkRows,
        discovered,
        pmaxScanned: pmaxIds.length,
        pmaxLinked: pmaxIds.filter((id) => linkedCampaignIds.has(id)).length,
      };
    },
  );

  for (const r of results) {
    if (!r) continue;
    allReplaceRowIds.push(...r.replaceRowIds);
    allLinkRows.push(...r.linkRows);
    discoveredInputs.push(...r.discovered);
    pmaxScanned += r.pmaxScanned;
    pmaxLinked += r.pmaxLinked;
  }

  if (allReplaceRowIds.length || allLinkRows.length) {
    await replaceGoogleCampaignWebsiteLinks(
      supabase,
      allReplaceRowIds,
      allLinkRows,
    );
  }

  let domains_discovered = 0;
  let domains_unmatched = 0;
  if (discoveredInputs.length) {
    const upserted = await upsertDiscoveredDomains(
      supabase,
      discoveredInputs,
      nowIso,
    );
    domains_discovered = upserted.discovered;
    domains_unmatched = upserted.unmatched;
  }

  const websiteIds = new Set(allLinkRows.map((r) => r.website_profile_id));
  const campaignsWithLinks = new Set(allLinkRows.map((r) => r.campaign_row_id));

  return {
    websites_linked: websiteIds.size,
    domains_discovered,
    domains_unmatched,
    campaigns_with_links: campaignsWithLinks.size,
    pmax_campaigns_scanned: pmaxScanned,
    pmax_campaigns_with_links: pmaxLinked,
    link_errors: linkErrors,
  };
}
