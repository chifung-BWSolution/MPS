/** Shared Meta / Facebook Ads helpers for Edge Functions (multi-credential). */

export const ACCOUNT_CONCURRENCY = 6;
/** Meta Insights rejects ranges older than ~37 months */
export const META_INSIGHTS_MAX_MONTHS = 36;

export type MetaCredential = {
  id: string;
  name: string;
  app_id: string;
  app_secret: string;
  access_token: string;
  api_version: string;
};

export type AccountRow = {
  ad_account_id: string;
  account_name: string;
  currency_code: string | null;
  time_zone: string | null;
  status: string;
  account_status: number | null;
  business_key: string;
  business_name: string;
  last_synced_at: string;
  updated_at: string;
};

export type CampaignMetaRow = {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string | null;
  last_synced_at: string;
  updated_at: string;
};

export type DailyMetricRow = {
  ad_account_id: string;
  campaign_id: string;
  metric_date: string;
  impressions: number;
  clicks: number;
  spend_micros: number;
  conversions: number;
  ctr: number;
  average_cpc_micros: number;
  last_synced_at: string;
  updated_at: string;
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function asInt(v: unknown): number {
  return Math.round(Number(v ?? 0)) || 0;
}

export function spendToMicros(spend: unknown): number {
  const n = Number(spend ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1_000_000);
}

export function mapAccountStatus(code: unknown): string {
  const n = Number(code);
  switch (n) {
    case 1:
    case 9:
    case 201:
      return "ENABLED";
    case 2:
    case 101:
    case 202:
      return "REMOVED";
    case 3:
    case 7:
    case 8:
    case 100:
      return "PAUSED";
    default:
      return Number.isFinite(n) ? `STATUS_${n}` : "UNKNOWN";
  }
}

export function mapCampaignStatus(effective: unknown, status?: unknown): string {
  const s = String(effective || status || "UNKNOWN").toUpperCase();
  if (s === "ACTIVE") return "ENABLED";
  if (s === "PAUSED") return "PAUSED";
  if (s === "DELETED" || s === "ARCHIVED") return "REMOVED";
  return s || "UNKNOWN";
}

/** Extract a single numeric value from an AdsActionStats / AdsInsightsResult row. */
function rowNumericValue(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const a = raw as Record<string, unknown>;
  if (a.value != null) return Number(a.value) || 0;
  if (Array.isArray(a.values)) {
    let sum = 0;
    for (const v of a.values) {
      if (v != null && typeof v === "object" && "value" in (v as object)) {
        sum += Number((v as { value?: unknown }).value) || 0;
      } else {
        sum += Number(v) || 0;
      }
    }
    return sum;
  }
  return 0;
}

/** Result indicators that are traffic/awareness — not Conv. column outcomes. */
function isNonConversionResultIndicator(indicator: string): boolean {
  const ind = indicator.toLowerCase();
  const soft = [
    "reach",
    "impressions",
    "link_click",
    "outbound_click",
    "landing_page_view",
    "omni_landing_page_view",
    "page_engagement",
    "post_engagement",
    "video_view",
    "video_thruplay",
    "like",
    "post_interaction",
    "estimated_ad_recallers",
  ];
  return soft.some((s) => ind === s || ind.endsWith(`:${s}`) || ind.endsWith(`.${s}`));
}

/**
 * Sum Insights `results` / `objective_results` lists.
 * Rows without `values` (indicator-only) contribute 0.
 * Skips traffic/awareness indicators so Conv. stays conversion-oriented.
 */
function sumResultsField(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  let sum = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const indicator = String((raw as Record<string, unknown>).indicator || "");
    if (indicator && isNonConversionResultIndicator(indicator)) continue;
    sum += rowNumericValue(raw);
  }
  return sum;
}

/**
 * Parse Insights `conversions` list without double-counting
 * `submit_application_total` + `submit_application_website` (same event).
 * Prefer `*_total` rows when present; otherwise take the max per event family.
 */
function sumConversionsField(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  const byType = new Map<string, number>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || "").toLowerCase();
    if (!type) continue;
    const val = rowNumericValue(raw);
    if (!val) continue;
    byType.set(type, (byType.get(type) || 0) + val);
  }
  if (byType.size === 0) return 0;

  const totals = [...byType.entries()].filter(([t]) => t.endsWith("_total"));
  if (totals.length) {
    return totals.reduce((s, [, v]) => s + v, 0);
  }

  // Group website/app/offline variants of the same event; keep max per family.
  const familyMax = new Map<string, number>();
  for (const [type, val] of byType) {
    const family = type
      .replace(/_website$/, "")
      .replace(/_app$/, "")
      .replace(/_offline$/, "")
      .replace(/_total$/, "");
    familyMax.set(family, Math.max(familyMax.get(family) || 0, val));
  }
  return [...familyMax.values()].reduce((s, v) => s + v, 0);
}

/**
 * Meta Insights `actions` names conversions differently per objective / pixel event.
 * Prefer rollup action_types when present to avoid double-counting pixel + omni variants.
 */
const CONVERSION_ROLLUP_PRIORITY: string[][] = [
  // Sales / purchase
  ["omni_purchase", "purchase", "web_in_store_purchase"],
  // Leads
  ["omni_complete_registration", "complete_registration"],
  ["lead", "onsite_conversion.lead_grouped", "omni_lead"],
  // Checkout funnel (when used as optimization)
  ["omni_initiated_checkout", "initiate_checkout"],
  ["omni_add_to_cart", "add_to_cart"],
  ["omni_add_payment_info", "add_payment_info"],
  // Other standard conversion events
  ["omni_subscribe", "subscribe"],
  ["omni_start_trial", "start_trial"],
  [
    "omni_submit_application",
    "submit_application",
    "submit_application_total",
    "submit_application_website",
    "submit_application_app",
  ],
  ["omni_schedule", "schedule"],
  ["omni_contact", "contact"],
  ["omni_donate", "donate"],
  ["find_location"],
  // Messaging (MESSAGES / many lead campaigns optimize for this)
  [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
    "onsite_conversion.messaging_first_reply",
  ],
  // App
  ["omni_app_install", "mobile_app_install", "app_install"],
];

function isPixelOrCustomConversion(type: string): boolean {
  if (type.startsWith("offsite_conversion.custom.")) return true;
  if (type.startsWith("offline_conversion.")) return true;
  if (type.startsWith("app_custom_event.")) return true;
  if (!type.startsWith("offsite_conversion.fb_pixel_")) return false;
  // Soft engagement pixel events — not treated as Conv.
  const soft = new Set([
    "offsite_conversion.fb_pixel_view_content",
    "offsite_conversion.fb_pixel_search",
    "offsite_conversion.fb_pixel_add_to_wishlist",
  ]);
  return !soft.has(type);
}

function groupMatchTokens(group: string[]): string[] {
  const tokens = new Set<string>();
  for (const name of group) {
    const base = name.includes(".") ? name.split(".").pop() || name : name;
    // normalize omni_ / web_in_store_ prefixes
    tokens.add(base.replace(/^omni_/, "").replace(/^web_in_store_/, ""));
    tokens.add(base);
  }
  return [...tokens].filter(Boolean);
}

function actionMatchesTokens(type: string, tokens: string[]): boolean {
  if (
    type.includes("click") ||
    type.includes("view_content") ||
    type.includes("video_view") ||
    type.includes("impression") ||
    type.includes("engaged_user") ||
    type.includes("page_engagement") ||
    type.includes("post_engagement")
  ) {
    return false;
  }
  for (const token of tokens) {
    // Exact / suffix matches only — avoid `meta_leads` matching token `lead`.
    if (
      type === token ||
      type.endsWith(`.${token}`) ||
      type.endsWith(`_${token}`) ||
      type === `offsite_conversion.fb_pixel_${token}` ||
      type === `offline_conversion.${token}` ||
      type === `onsite_conversion.${token}`
    ) {
      return true;
    }
  }
  return false;
}

function sumConversionsFromActions(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  const byType = new Map<string, number>();
  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || "").toLowerCase();
    if (!type) continue;
    const val = Number(a.value ?? 0) || 0;
    if (!val) continue;
    byType.set(type, (byType.get(type) || 0) + val);
  }
  if (byType.size === 0) return 0;

  const consumed = new Set<string>();

  // First matching category in priority order wins (purchase before ATC, etc.).
  for (const group of CONVERSION_ROLLUP_PRIORITY) {
    const tokens = groupMatchTokens(group);
    let picked = 0;

    for (const candidate of group) {
      if (byType.has(candidate)) {
        picked = byType.get(candidate) || 0;
        break;
      }
    }

    if (!picked) {
      for (const [type, val] of byType) {
        if (consumed.has(type)) continue;
        if (actionMatchesTokens(type, tokens)) {
          picked = val;
          break;
        }
      }
    }

    if (picked) return picked;
  }

  // Custom / remaining pixel conversion events (e.g. offsite_conversion.fb_pixel_custom)
  let customSum = 0;
  for (const [type, val] of byType) {
    if (consumed.has(type)) continue;
    if (isPixelOrCustomConversion(type)) {
      customSum += val;
    }
  }
  return customSum;
}

/**
 * Resolve Conv. count for an insights row.
 * Order matches Ads Manager “Results” / conversion reporting across objectives:
 * 1) `results` (objective outcome — purchase, lead, messaging, etc.)
 * 2) dedicated `conversions` list (custom + standard conversion events)
 * 3) filtered `actions` for common conversion action_type names
 */
function sumConversions(row: Record<string, unknown>): number {
  const fromResults = sumResultsField(row.results);
  if (fromResults > 0) return fromResults;

  const fromObjectiveResults = sumResultsField(row.objective_results);
  if (fromObjectiveResults > 0) return fromObjectiveResults;

  const fromConversions = sumConversionsField(row.conversions);
  if (fromConversions > 0) return fromConversions;

  return sumConversionsFromActions(row.actions);
}

/** Debug helper: sample raw conversion-related fields from Insights. */
export async function probeInsightsConversions(
  cred: MetaCredential,
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, unknown>[]> {
  const rows = await graphGetAll(
    cred,
    `/${adAccountId}/insights`,
    {
      level: "campaign",
      time_increment: "all_days",
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      fields:
        "campaign_id,campaign_name,objective,spend,actions,conversions,results,objective_results",
      limit: "100",
      use_unified_attribution_setting: "true",
    },
    5,
  );
  return rows.map((row) => {
    const actions = Array.isArray(row.actions) ? row.actions : [];
    const actionTypes = actions
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        action_type: String(a.action_type || ""),
        value: Number(a.value ?? 0) || 0,
      }))
      .sort((a, b) => b.value - a.value);
    return {
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      objective: row.objective,
      spend: row.spend,
      conversions_field: row.conversions ?? null,
      results_field: row.results ?? null,
      objective_results_field: row.objective_results ?? null,
      action_types: actionTypes,
      parsed_from_actions: sumConversionsFromActions(row.actions),
      parsed_total: sumConversions(row),
    };
  });
}

function slugifyId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function pickString(o: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = o[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

/** Load N Meta app credentials from META_CREDENTIALS_JSON (array). */
export function loadCredentials(): MetaCredential[] {
  const raw = Deno.env.get("META_CREDENTIALS_JSON") || "";
  if (!raw.trim()) {
    throw new Error("Missing META_CREDENTIALS_JSON secret");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("META_CREDENTIALS_JSON is not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("META_CREDENTIALS_JSON must be a non-empty array");
  }
  const seen = new Set<string>();
  return parsed.map((item, i) => {
    const o = (item || {}) as Record<string, unknown>;
    const name = pickString(o, ["name", "business_name", "businessName", "label"]) ||
      `Credential ${i + 1}`;
    const id = slugifyId(
      pickString(o, ["id", "key", "business_key", "businessKey"]) || name,
      `cred_${i}`,
    );
    if (seen.has(id)) {
      throw new Error(`Duplicate credential id "${id}" in META_CREDENTIALS_JSON`);
    }
    seen.add(id);
    const access_token = pickString(o, [
      "access_token",
      "accessToken",
      "token",
      "META_ACCESS_TOKEN",
    ]);
    const app_id = pickString(o, ["app_id", "appId", "META_APP_ID"]);
    const app_secret = pickString(o, ["app_secret", "appSecret", "META_APP_SECRET"]);
    const api_version =
      pickString(o, ["api_version", "apiVersion", "META_API_VERSION"]) || "v25.0";
    if (!access_token) {
      throw new Error(`Credential ${id} missing access_token`);
    }
    return { id, name, app_id, app_secret, access_token, api_version };
  });
}

async function graphGet(
  cred: MetaCredential,
  path: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = new URL(
    `https://graph.facebook.com/${cred.api_version}${path.startsWith("/") ? path : `/${path}`}`,
  );
  url.searchParams.set("access_token", cred.access_token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  // Optional: only when META_USE_APPSECRET_PROOF=true (some tokens fail with proof)
  if (cred.app_secret && (Deno.env.get("META_USE_APPSECRET_PROOF") || "").toLowerCase() === "true") {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(cred.app_secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(cred.access_token));
    const proof = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    url.searchParams.set("appsecret_proof", proof);
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url.toString());
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: { message: text.slice(0, 300) } };
    }
    if (res.ok && !json.error) return json;

    const err = (json.error || {}) as Record<string, unknown>;
    const code = Number(err.code ?? res.status);
    const msg = String(err.message || res.statusText || "Graph API error");
    // rate limit / transient
    if ([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004].includes(code) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * attempt * attempt));
      continue;
    }
    throw new Error(`${cred.name} ${path}: (${code}) ${msg.slice(0, 220)}`);
  }
}

async function graphGetAll(
  cred: MetaCredential,
  path: string,
  params: Record<string, string> = {},
  maxPages = 50,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let nextPath: string | null = path;
  let nextParams: Record<string, string> | null = { ...params, limit: params.limit || "200" };
  let pages = 0;

  while (nextPath && pages < maxPages) {
    pages++;
    let json: Record<string, unknown>;
    if (nextPath.startsWith("http")) {
      const res = await fetch(nextPath);
      json = await res.json();
      if (!res.ok || json.error) {
        const err = (json.error || {}) as Record<string, unknown>;
        throw new Error(
          `${cred.name} page: (${err.code || res.status}) ${String(err.message || "").slice(0, 220)}`,
        );
      }
    } else {
      json = await graphGet(cred, nextPath, nextParams || {});
    }
    const data = json.data;
    if (Array.isArray(data)) {
      for (const row of data) {
        if (row && typeof row === "object") rows.push(row as Record<string, unknown>);
      }
    }
    const paging = json.paging as { next?: string } | undefined;
    nextPath = paging?.next || null;
    nextParams = null;
  }
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

export async function fetchAccountsForCredential(
  cred: MetaCredential,
  nowIso: string,
): Promise<AccountRow[]> {
  const rows = await graphGetAll(cred, "/me/adaccounts", {
    fields: "id,name,account_status,currency,timezone_name",
    limit: "100",
  });
  return rows.map((row) => {
    const id = String(row.id || "");
    const accountStatus = row.account_status == null ? null : Number(row.account_status);
    return {
      ad_account_id: id,
      account_name: String(row.name || id),
      currency_code: (row.currency as string) || null,
      time_zone: (row.timezone_name as string) || null,
      status: mapAccountStatus(accountStatus),
      account_status: accountStatus,
      business_key: cred.id,
      business_name: cred.name,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };
  });
}

export async function fetchAllAccounts(nowIso: string): Promise<{
  credentials: MetaCredential[];
  accounts: AccountRow[];
}> {
  const credentials = loadCredentials();
  const accounts: AccountRow[] = [];
  for (const cred of credentials) {
    const part = await fetchAccountsForCredential(cred, nowIso);
    accounts.push(...part);
  }
  // Deduplicate by ad_account_id (prefer first credential)
  const seen = new Set<string>();
  const unique = accounts.filter((a) => {
    if (!a.ad_account_id || seen.has(a.ad_account_id)) return false;
    seen.add(a.ad_account_id);
    return true;
  });
  return { credentials, accounts: unique };
}

async function fetchCampaignMeta(
  cred: MetaCredential,
  adAccountId: string,
  nowIso: string,
): Promise<CampaignMetaRow[]> {
  const rows = await graphGetAll(cred, `/${adAccountId}/campaigns`, {
    fields: "id,name,status,effective_status,objective",
    limit: "200",
  });
  return rows.map((row) => {
    const campaignId = String(row.id || "");
    return {
      id: `${adAccountId}:${campaignId}`,
      ad_account_id: adAccountId,
      campaign_id: campaignId,
      campaign_name: String(row.name || campaignId),
      status: mapCampaignStatus(row.effective_status, row.status),
      objective: (row.objective as string) || null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };
  });
}

async function fetchDailyInsights(
  cred: MetaCredential,
  adAccountId: string,
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ daily: DailyMetricRow[]; campaigns: CampaignMetaRow[] }> {
  const rows = await graphGetAll(
    cred,
    `/${adAccountId}/insights`,
    {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      fields:
        "campaign_id,campaign_name,impressions,clicks,spend,cpc,ctr,actions,conversions,results,objective_results,date_start",
      limit: "500",
      // Match Ads Manager attribution so Results/conversions align with UI
      use_unified_attribution_setting: "true",
    },
    100,
  );

  const daily: DailyMetricRow[] = [];
  const campaignMap = new Map<string, CampaignMetaRow>();

  for (const row of rows) {
    const campaignId = String(row.campaign_id || "");
    const metricDate = String(row.date_start || "");
    if (!campaignId || !metricDate) continue;
    const impressions = asInt(row.impressions);
    const clicks = asInt(row.clicks);
    const spendMicros = spendToMicros(row.spend);
    const conversions = sumConversions(row);
    const ctr = Number(row.ctr ?? 0) || (impressions > 0 ? clicks / impressions : 0);
    const cpcMicros = spendToMicros(row.cpc);
    daily.push({
      ad_account_id: adAccountId,
      campaign_id: campaignId,
      metric_date: metricDate,
      impressions,
      clicks,
      spend_micros: spendMicros,
      conversions,
      ctr,
      average_cpc_micros: cpcMicros,
      last_synced_at: nowIso,
      updated_at: nowIso,
    });
    const key = `${adAccountId}:${campaignId}`;
    if (!campaignMap.has(key)) {
      campaignMap.set(key, {
        id: key,
        ad_account_id: adAccountId,
        campaign_id: campaignId,
        campaign_name: String(row.campaign_name || campaignId),
        status: "UNKNOWN",
        objective: null,
        last_synced_at: nowIso,
        updated_at: nowIso,
      });
    }
  }

  return { daily, campaigns: [...campaignMap.values()] };
}

export async function fetchDailyMetricsForRange(
  credentials: MetaCredential[],
  accounts: AccountRow[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ daily: DailyMetricRow[]; campaigns: CampaignMetaRow[]; errors: string[] }> {
  const credByKey = new Map(credentials.map((c) => [c.id, c]));
  const daily: DailyMetricRow[] = [];
  const campaignMap = new Map<string, CampaignMetaRow>();
  const errors: string[] = [];

  const targets = accounts.filter((a) => a.status === "ENABLED" || a.account_status === 1);

  await mapPool(targets, ACCOUNT_CONCURRENCY, async (account) => {
    const cred = credByKey.get(account.business_key);
    if (!cred) {
      errors.push(`${account.ad_account_id}: missing credential ${account.business_key}`);
      return;
    }
    try {
      const meta = await fetchCampaignMeta(cred, account.ad_account_id, nowIso);
      for (const c of meta) campaignMap.set(c.id, c);

      const insights = await fetchDailyInsights(
        cred,
        account.ad_account_id,
        dateFrom,
        dateTo,
        nowIso,
      );
      for (const d of insights.daily) daily.push(d);
      for (const c of insights.campaigns) {
        const existing = campaignMap.get(c.id);
        if (existing) {
          campaignMap.set(c.id, {
            ...existing,
            campaign_name: existing.campaign_name || c.campaign_name,
            last_synced_at: nowIso,
            updated_at: nowIso,
          });
        } else {
          campaignMap.set(c.id, c);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${account.ad_account_id}: ${msg.slice(0, 180)}`);
    }
  });

  return { daily, campaigns: [...campaignMap.values()], errors };
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

/** Earliest date Meta Insights typically allows (~37 months). */
export function metaHistoryStartDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return toIsoDate(addMonths(d, -(META_INSIGHTS_MAX_MONTHS - 1)));
}
