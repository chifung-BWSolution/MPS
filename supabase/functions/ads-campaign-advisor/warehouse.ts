import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchLiveCampaignBreakdowns,
  getAccessToken,
  LIVE_BREAKDOWN_MAX_DAYS as GOOGLE_BREAKDOWN_MAX_DAYS,
  validateLiveBreakdownRange as validateGoogleBreakdownRange,
} from "../_shared/google-ads.ts";
import {
  fetchLiveFacebookCampaignBreakdowns,
  LIVE_BREAKDOWN_MAX_DAYS as FACEBOOK_BREAKDOWN_MAX_DAYS,
  loadCredentials,
  resolveCredentialForCampaign,
  validateLiveBreakdownRange as validateFacebookBreakdownRange,
} from "../_shared/meta-ads.ts";
import type { AdvisorToolName } from "./tools.ts";

const PAGE_SIZE = 1000;
const SEARCH_LIMIT = 10;
const COMPARE_LIMIT = 3;
const SERIES_KEEP = 14;
const BREAKDOWN_KEEP = 20;
const BREAKDOWN_TIMEOUT_MS = 20_000;

export type AdvisorDateContext = {
  dateFrom: string;
  dateTo: string;
};

export type ToolExecution = {
  ok: boolean;
  data: unknown;
};

type Platform = "google" | "facebook";

function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_KEY") ||
    "";
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 未設定");
  }
  return createClient(url, key);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asPlatform(value: unknown): Platform | "both" | "" {
  const v = asString(value).toLowerCase();
  if (v === "google" || v === "facebook" || v === "both") return v;
  return "";
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function moneyFromMicros(micros: number) {
  const amount = micros / 1_000_000;
  return {
    micros,
    amount,
    display: `$${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

function deriveTotals(impressions: number, clicks: number, costMicros: number, conversions: number) {
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const averageCpcMicros = clicks > 0 ? Math.round(costMicros / clicks) : 0;
  const cpaMicros = conversions > 0 ? Math.round(costMicros / conversions) : null;
  return {
    impressions,
    clicks,
    conversions,
    ctr,
    ctrDisplay: `${(ctr * 100).toFixed(2)}%`,
    cost: moneyFromMicros(costMicros),
    averageCpc: moneyFromMicros(averageCpcMicros),
    cpa: cpaMicros == null ? null : moneyFromMicros(cpaMicros),
  };
}

function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function toIsoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoUtc(d);
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = parseIsoDate(from).getTime();
  const b = parseIsoDate(to).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = daysBetweenInclusive(from, to);
  const prevTo = addDaysIso(from, -1);
  const prevFrom = addDaysIso(prevTo, -(len - 1));
  return { from: prevFrom, to: prevTo };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 逾時（${ms / 1000}s）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function topByCost<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  costKey: "costMicros" | "spendMicros",
  keep = BREAKDOWN_KEEP,
): T[] {
  return [...(rows ?? [])]
    .sort((a, b) => Number(b[costKey] ?? 0) - Number(a[costKey] ?? 0))
    .slice(0, keep);
}

async function fetchDailyRows(
  supabase: SupabaseClient,
  platform: Platform,
  accountId: string,
  campaignId: string,
  from: string,
  to: string,
): Promise<{ date: string; impressions: number; clicks: number; costMicros: number; conversions: number }[]> {
  const mapped: { date: string; impressions: number; clicks: number; costMicros: number; conversions: number }[] = [];
  let offset = 0;
  for (;;) {
    if (platform === "google") {
      const { data, error } = await supabase
        .from("google_ads_campaign_daily_metrics")
        .select("metric_date,impressions,clicks,cost_micros,conversions")
        .eq("customer_id", accountId)
        .eq("campaign_id", campaignId)
        .gte("metric_date", from)
        .lte("metric_date", to)
        .order("metric_date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      for (const row of page) {
        mapped.push({
          date: String(row.metric_date).slice(0, 10),
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          costMicros: Number(row.cost_micros) || 0,
          conversions: Number(row.conversions) || 0,
        });
      }
      if (page.length < PAGE_SIZE) break;
    } else {
      const { data, error } = await supabase
        .from("facebook_ads_campaign_daily_metrics")
        .select("metric_date,impressions,clicks,spend_micros,conversions")
        .eq("ad_account_id", accountId)
        .eq("campaign_id", campaignId)
        .gte("metric_date", from)
        .lte("metric_date", to)
        .order("metric_date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = data ?? [];
      for (const row of page) {
        mapped.push({
          date: String(row.metric_date).slice(0, 10),
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          costMicros: Number(row.spend_micros) || 0,
          conversions: Number(row.conversions) || 0,
        });
      }
      if (page.length < PAGE_SIZE) break;
    }
    offset += PAGE_SIZE;
  }
  return mapped;
}

function compactSeries(
  rows: { date: string; impressions: number; clicks: number; costMicros: number; conversions: number }[],
) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.impressions += row.impressions;
      acc.clicks += row.clicks;
      acc.costMicros += row.costMicros;
      acc.conversions += row.conversions;
      return acc;
    },
    { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
  );
  const series = rows.slice(-SERIES_KEEP).map((row) => ({
    date: row.date,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    cost: moneyFromMicros(row.costMicros),
  }));
  return { totals: deriveTotals(totals.impressions, totals.clicks, totals.costMicros, totals.conversions), series };
}

async function resolveTagIds(supabase: SupabaseClient, tag: string): Promise<string[]> {
  const q = tag.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("ads_tags")
    .select("id,name")
    .ilike("name", `%${q}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.id));
}

async function campaignRowIdsForTags(
  supabase: SupabaseClient,
  tagIds: string[],
  platform?: Platform | "both" | "",
): Promise<Set<string>> {
  if (tagIds.length === 0) return new Set();
  let query = supabase
    .from("ads_campaign_tags")
    .select("platform,campaign_row_id,tag_id")
    .in("tag_id", tagIds);
  if (platform === "google" || platform === "facebook") {
    query = query.eq("platform", platform);
  }
  const { data, error } = await query.limit(2000);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => `${row.platform}:${row.campaign_row_id}`));
}

async function googleAccountNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("google_ads_accounts")
    .select("customer_id,descriptive_name")
    .in("customer_id", unique);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [String(row.customer_id), String(row.descriptive_name || row.customer_id)]));
}

async function facebookAccountNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("facebook_ads_accounts")
    .select("ad_account_id,account_name,business_name")
    .in("ad_account_id", unique);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => [
      String(row.ad_account_id),
      row.business_name
        ? `${row.account_name} · ${row.business_name}`
        : String(row.account_name || row.ad_account_id),
    ]),
  );
}

function rowIdsForPlatform(allowedRowIds: Set<string> | null, platform: Platform): string[] | null {
  if (!allowedRowIds) return null;
  const prefix = `${platform}:`;
  return [...allowedRowIds]
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

async function searchPlatform(
  supabase: SupabaseClient,
  platform: Platform,
  query: string,
  status: string,
  allowedRowIds: Set<string> | null,
  limit: number,
) {
  const taggedIds = rowIdsForPlatform(allowedRowIds, platform);
  if (allowedRowIds && taggedIds && taggedIds.length === 0) return [];

  if (platform === "google") {
    let q = supabase
      .from("google_ads_campaigns")
      .select("customer_id,campaign_id,campaign_name,status,advertising_channel_type")
      .order("campaign_name", { ascending: true })
      .limit(Math.max(limit, 80));
    if (taggedIds) q = q.in("id", taggedIds.slice(0, 200));
    if (query && query !== "*") q = q.ilike("campaign_name", `%${query}%`);
    if (status) q = q.ilike("status", status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const names = await googleAccountNames(
      supabase,
      (data ?? []).map((row) => String(row.customer_id)),
    );
    return (data ?? []).slice(0, limit).map((row) => ({
      platform: "google" as const,
      accountId: String(row.customer_id),
      campaignId: String(row.campaign_id),
      campaignName: String(row.campaign_name || row.campaign_id),
      accountName: names.get(String(row.customer_id)) || String(row.customer_id),
      status: String(row.status || "UNKNOWN"),
      extra: row.advertising_channel_type || undefined,
    }));
  }

  let q = supabase
    .from("facebook_ads_campaigns")
    .select("ad_account_id,campaign_id,campaign_name,status,objective")
    .order("campaign_name", { ascending: true })
    .limit(Math.max(limit, 80));
  if (taggedIds) q = q.in("id", taggedIds.slice(0, 200));
  if (query && query !== "*") q = q.ilike("campaign_name", `%${query}%`);
  if (status) q = q.ilike("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const names = await facebookAccountNames(
    supabase,
    (data ?? []).map((row) => String(row.ad_account_id)),
  );
  return (data ?? []).slice(0, limit).map((row) => ({
    platform: "facebook" as const,
    accountId: String(row.ad_account_id),
    campaignId: String(row.campaign_id),
    campaignName: String(row.campaign_name || row.campaign_id),
    accountName: names.get(String(row.ad_account_id)) || String(row.ad_account_id),
    status: String(row.status || "UNKNOWN"),
    extra: row.objective || undefined,
  }));
}

async function searchCampaigns(args: Record<string, unknown>): Promise<ToolExecution> {
  const query = asString(args.query);
  const platform = asPlatform(args.platform) || "both";
  const status = asString(args.status);
  const tag = asString(args.tag);
  const limit = clampLimit(args.limit, SEARCH_LIMIT, SEARCH_LIMIT);
  if (!query && !tag) {
    return { ok: false, data: { error: "search_campaigns 需要 query 或 tag" } };
  }

  const supabase = serviceClient();
  let allowed: Set<string> | null = null;
  if (tag) {
    const tagIds = await resolveTagIds(supabase, tag);
    if (tagIds.length === 0) {
      return { ok: true, data: { candidates: [], note: `找不到標籤「${tag}」` } };
    }
    allowed = await campaignRowIdsForTags(supabase, tagIds, platform);
  }

  const platforms: Platform[] =
    platform === "google" || platform === "facebook" ? [platform] : ["google", "facebook"];
  const results = [];
  for (const p of platforms) {
    results.push(...(await searchPlatform(supabase, p, query || "*", status, allowed, limit)));
  }
  const candidates = results.slice(0, limit);
  return {
    ok: true,
    data: {
      candidates,
      count: candidates.length,
      note:
        candidates.length === 0
          ? "沒有符合的 campaign。請向用戶列出選擇或請他們提供更完整名稱。"
          : candidates.length > 1
            ? "多個候選。請向用戶確認 A/B/C，不要自行假設。"
            : undefined,
    },
  };
}

async function campaignMeta(
  supabase: SupabaseClient,
  platform: Platform,
  accountId: string,
  campaignId: string,
) {
  if (platform === "google") {
    const [{ data: campaign }, names] = await Promise.all([
      supabase
        .from("google_ads_campaigns")
        .select("campaign_name,status,advertising_channel_type,objectives")
        .eq("id", `${accountId}:${campaignId}`)
        .maybeSingle(),
      googleAccountNames(supabase, [accountId]),
    ]);
    return {
      platform,
      accountId,
      campaignId,
      campaignName: campaign?.campaign_name || campaignId,
      status: campaign?.status || "UNKNOWN",
      extra: campaign?.advertising_channel_type || undefined,
      objectives: campaign?.objectives ?? undefined,
      accountName: names.get(accountId) || accountId,
    };
  }
  const [{ data: campaign }, names] = await Promise.all([
    supabase
      .from("facebook_ads_campaigns")
      .select("campaign_name,status,objective")
      .eq("id", `${accountId}:${campaignId}`)
      .maybeSingle(),
    facebookAccountNames(supabase, [accountId]),
  ]);
  return {
    platform,
    accountId,
    campaignId,
    campaignName: campaign?.campaign_name || campaignId,
    status: campaign?.status || "UNKNOWN",
    extra: campaign?.objective || undefined,
    accountName: names.get(accountId) || accountId,
  };
}

async function getCampaignMetrics(
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
): Promise<ToolExecution> {
  const platform = asPlatform(args.platform);
  const accountId = asString(args.accountId);
  const campaignId = asString(args.campaignId);
  const dateFrom = asString(args.dateFrom) || ctx.dateFrom;
  const dateTo = asString(args.dateTo) || ctx.dateTo;
  if (platform !== "google" && platform !== "facebook") {
    return { ok: false, data: { error: "platform 必須是 google 或 facebook" } };
  }
  if (!accountId || !campaignId) {
    return { ok: false, data: { error: "accountId 與 campaignId 必填" } };
  }

  const supabase = serviceClient();
  const prev = previousPeriod(dateFrom, dateTo);
  const [meta, currentRows, previousRows] = await Promise.all([
    campaignMeta(supabase, platform, accountId, campaignId),
    fetchDailyRows(supabase, platform, accountId, campaignId, dateFrom, dateTo),
    fetchDailyRows(supabase, platform, accountId, campaignId, prev.from, prev.to),
  ]);
  const current = compactSeries(currentRows);
  const previous = compactSeries(previousRows);
  return {
    ok: true,
    data: {
      ...meta,
      dateFrom,
      dateTo,
      previousDateFrom: prev.from,
      previousDateTo: prev.to,
      totals: current.totals,
      previousTotals: previous.totals,
      recentSeries: current.series,
    },
  };
}

async function compareCampaigns(
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
): Promise<ToolExecution> {
  const raw = Array.isArray(args.campaigns) ? args.campaigns : [];
  const dateFrom = asString(args.dateFrom) || ctx.dateFrom;
  const dateTo = asString(args.dateTo) || ctx.dateTo;
  const campaigns = raw.slice(0, COMPARE_LIMIT).map((item) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      platform: asPlatform(row.platform),
      accountId: asString(row.accountId),
      campaignId: asString(row.campaignId),
    };
  });
  if (campaigns.length === 0 || campaigns.some((c) => (c.platform !== "google" && c.platform !== "facebook") || !c.accountId || !c.campaignId)) {
    return { ok: false, data: { error: "compare_campaigns 需要 1–3 個有效 campaign（platform, accountId, campaignId）" } };
  }

  const results = [];
  for (const campaign of campaigns) {
    const one = await getCampaignMetrics(campaign, { dateFrom, dateTo });
    results.push(one.ok ? one.data : { error: (one.data as { error?: string })?.error, ...campaign });
  }
  return { ok: true, data: { dateFrom, dateTo, campaigns: results } };
}

async function getCampaignsByTag(args: Record<string, unknown>): Promise<ToolExecution> {
  const tag = asString(args.tag);
  const platform = asPlatform(args.platform) || "both";
  const limit = clampLimit(args.limit, SEARCH_LIMIT, 20);
  if (!tag) return { ok: false, data: { error: "tag 必填" } };

  const supabase = serviceClient();
  const tagIds = await resolveTagIds(supabase, tag);
  if (tagIds.length === 0) {
    return { ok: true, data: { tag, campaigns: [], note: `找不到標籤「${tag}」` } };
  }
  const allowed = await campaignRowIdsForTags(supabase, tagIds, platform);
  const platforms: Platform[] =
    platform === "google" || platform === "facebook" ? [platform] : ["google", "facebook"];
  const results = [];
  for (const p of platforms) {
    results.push(...(await searchPlatform(supabase, p, "*", "", allowed, limit)));
  }
  return { ok: true, data: { tag, campaigns: results.slice(0, limit), count: Math.min(results.length, limit) } };
}

async function getCampaignBreakdowns(
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
): Promise<ToolExecution> {
  const platform = asPlatform(args.platform);
  const accountId = asString(args.accountId);
  const campaignId = asString(args.campaignId);
  const dateFrom = asString(args.dateFrom) || ctx.dateFrom;
  const dateTo = asString(args.dateTo) || ctx.dateTo;
  const channelType = asString(args.channelType) || undefined;
  if (platform !== "google" && platform !== "facebook") {
    return { ok: false, data: { error: "platform 必須是 google 或 facebook" } };
  }
  if (!accountId || !campaignId) {
    return { ok: false, data: { error: "accountId 與 campaignId 必填" } };
  }

  if (platform === "google") {
    const range = validateGoogleBreakdownRange(dateFrom, dateTo);
    if (!range.ok) {
      return {
        ok: false,
        data: {
          error: range.error,
          maxDays: GOOGLE_BREAKDOWN_MAX_DAYS,
          dateFrom,
          dateTo,
        },
      };
    }
    try {
      const accessToken = await getAccessToken();
      const result = await withTimeout(
        fetchLiveCampaignBreakdowns(accessToken, accountId, campaignId, dateFrom, dateTo, channelType),
        BREAKDOWN_TIMEOUT_MS,
        "Google 即時細項",
      );
      return {
        ok: true,
        data: {
          platform,
          accountId,
          campaignId,
          dateFrom,
          dateTo,
          channelType: result.channelType,
          supported: result.supported,
          adGroups: topByCost(result.adGroups as Record<string, unknown>[], "costMicros"),
          keywords: topByCost(result.keywords as Record<string, unknown>[], "costMicros"),
          searchTerms: topByCost(result.searchTerms as Record<string, unknown>[], "costMicros"),
          ads: topByCost(result.ads as Record<string, unknown>[], "costMicros"),
          assetGroups: topByCost(result.assetGroups as Record<string, unknown>[], "costMicros"),
          errors: (result.errors ?? []).slice(0, 5),
        },
      };
    } catch (err) {
      return { ok: false, data: { error: String(err) } };
    }
  }

  const range = validateFacebookBreakdownRange(dateFrom, dateTo);
  if (!range.ok) {
    return {
      ok: false,
      data: {
        error: range.error,
        maxDays: FACEBOOK_BREAKDOWN_MAX_DAYS,
        dateFrom,
        dateTo,
      },
    };
  }
  try {
    const supabase = serviceClient();
    const { data: account } = await supabase
      .from("facebook_ads_accounts")
      .select("business_key")
      .eq("ad_account_id", accountId)
      .maybeSingle();
    const cred = await resolveCredentialForCampaign(
      loadCredentials(),
      campaignId,
      account?.business_key ? String(account.business_key) : null,
    );
    const result = await withTimeout(
      fetchLiveFacebookCampaignBreakdowns(cred, accountId, campaignId, dateFrom, dateTo),
      BREAKDOWN_TIMEOUT_MS,
      "Facebook 即時細項",
    );
    return {
      ok: true,
      data: {
        platform,
        accountId,
        campaignId,
        dateFrom,
        dateTo,
        supported: true,
        adSets: topByCost(result.adSets as Record<string, unknown>[], "spendMicros"),
        ads: topByCost(result.ads as Record<string, unknown>[], "spendMicros"),
        placements: topByCost(result.placements as Record<string, unknown>[], "spendMicros"),
        errors: (result.errors ?? []).slice(0, 5),
      },
    };
  } catch (err) {
    return { ok: false, data: { error: String(err) } };
  }
}

export async function executeAdvisorTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
): Promise<ToolExecution> {
  const tool = name as AdvisorToolName;
  try {
    switch (tool) {
      case "search_campaigns":
        return await searchCampaigns(args);
      case "get_campaign_metrics":
        return await getCampaignMetrics(args, ctx);
      case "compare_campaigns":
        return await compareCampaigns(args, ctx);
      case "get_campaigns_by_tag":
        return await getCampaignsByTag(args);
      case "get_campaign_breakdowns":
        return await getCampaignBreakdowns(args, ctx);
      default:
        return { ok: false, data: { error: `未知工具：${name}` } };
    }
  } catch (err) {
    return { ok: false, data: { error: String(err) } };
  }
}
