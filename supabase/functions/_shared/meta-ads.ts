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

function sumConversions(actions: unknown): number {
  if (!Array.isArray(actions)) return 0;
  let sum = 0;
  let matched = false;
  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || "").toLowerCase();
    const val = Number(a.value ?? 0) || 0;
    if (
      type === "purchase" ||
      type === "omni_purchase" ||
      type === "web_in_store_purchase" ||
      type.includes("purchase") ||
      type === "lead" ||
      type.endsWith(".lead") ||
      type.includes("lead_grouped")
    ) {
      sum += val;
      matched = true;
    }
  }
  return matched ? sum : 0;
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
        "campaign_id,campaign_name,impressions,clicks,spend,cpc,ctr,actions,date_start",
      limit: "500",
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
    const conversions = sumConversions(row.actions);
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
