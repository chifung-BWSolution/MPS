/** Shared Meta / Facebook Ads helpers for Edge Functions (multi-credential). */

import {
  extractDomainsFromName,
  extractDomainsFromUrls,
  loadWebsiteRows,
  matchDomainsToWebsites,
  pickSampleUrlForDomain,
  replaceFacebookAccountWebsiteLinks,
  upsertDiscoveredDomains,
  type AdsLinkSummary,
  type DiscoveredDomainInput,
  type FacebookAccountWebsiteRow,
} from "./website-match.ts";

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

/** Split Page.website (sometimes comma/newline separated) into URL candidates. */
function parsePageWebsiteField(raw: unknown): string[] {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  return text
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s) || /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/i.test(s))
    .map((s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`));
}

function isFacebookHostedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return (
    d === "facebook.com" ||
    d.endsWith(".facebook.com") ||
    d === "fb.com" ||
    d.endsWith(".fb.com") ||
    d === "fb.me" ||
    d.endsWith(".fb.me") ||
    d === "instagram.com" ||
    d.endsWith(".instagram.com") ||
    d === "meta.com" ||
    d.endsWith(".meta.com")
  );
}

/** Collect unique fan-page IDs used by ads under an ad account (not CTA URLs). */
async function collectPageIdsFromAds(
  cred: MetaCredential,
  adAccountId: string,
): Promise<string[]> {
  const ads = await graphGetAll(
    cred,
    `/${adAccountId}/ads`,
    {
      // Only identity fields — do NOT scrape creative destination/CTA links
      fields: "creative{object_story_spec{page_id},actor_id,object_id}",
      limit: "100",
    },
    15,
  );
  const ids = new Set<string>();
  for (const ad of ads) {
    const creative = (ad.creative && typeof ad.creative === "object")
      ? (ad.creative as Record<string, unknown>)
      : null;
    if (!creative) continue;
    const spec = (creative.object_story_spec &&
        typeof creative.object_story_spec === "object")
      ? (creative.object_story_spec as Record<string, unknown>)
      : null;
    for (const raw of [spec?.page_id, creative.actor_id, creative.object_id]) {
      const id = String(raw || "").trim();
      // Page IDs are numeric strings; skip creative story ids that look like "pageId_postId"
      if (/^\d{5,}$/.test(id)) ids.add(id);
    }
  }
  return [...ids];
}

type PageWebsiteLookup = {
  id: string;
  name: string;
  website: string | null;
  access_token?: string;
};

/** Pages manageable by this token, often includes website + page access_token. */
async function loadManagedPages(
  cred: MetaCredential,
): Promise<Map<string, PageWebsiteLookup>> {
  const map = new Map<string, PageWebsiteLookup>();
  try {
    const rows = await graphGetAll(
      cred,
      "/me/accounts",
      { fields: "id,name,website,link,access_token", limit: "100" },
      10,
    );
    for (const row of rows) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      map.set(id, {
        id,
        name: String(row.name || id),
        website: row.website != null ? String(row.website) : null,
        access_token: row.access_token != null
          ? String(row.access_token)
          : undefined,
      });
    }
  } catch {
    // token may be system-user without /me/accounts
  }
  return map;
}

async function fetchPagesByIds(
  cred: MetaCredential,
  pageIds: string[],
  managed?: Map<string, PageWebsiteLookup>,
): Promise<Record<string, unknown>[]> {
  const unique = [...new Set(pageIds.filter(Boolean))];
  if (!unique.length) return [];
  const pages = await mapPool(unique, 4, async (pageId) => {
    const managedHit = managed?.get(pageId);
    if (managedHit && parsePageWebsiteField(managedHit.website).length) {
      return {
        id: managedHit.id,
        name: managedHit.name,
        website: managedHit.website,
      };
    }
    // Prefer page access token when available (can read Page.website)
    if (managedHit?.access_token) {
      try {
        const pageCred: MetaCredential = {
          ...cred,
          access_token: managedHit.access_token,
        };
        const detail = await graphGet(pageCred, `/${pageId}`, {
          fields: "id,name,website,link",
        });
        return detail;
      } catch {
        // fall through to app token
      }
    }
    try {
      return await graphGet(cred, `/${pageId}`, {
        fields: "id,name,website,link",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        id: pageId,
        name: managedHit?.name || pageId,
        website: managedHit?.website ?? null,
        _error: msg.slice(0, 120),
      };
    }
  });
  return pages.filter((p) => p && p.id);
}

/**
 * Discover company websites from ENABLED ad accounts via:
 *   Ad Account → fan pages → Page.website
 * Page discovery order:
 *   1) act_{id}/promote_pages
 *   2) fallback: page ids referenced by ads (object_story_spec.page_id / actor_id)
 * Never scrapes creative/CTA destination URLs (avoids wa.link / fbcdn noise).
 */
export async function linkFacebookAccountWebsites(
  supabase: {
    from: (table: string) => unknown;
  },
  credentials: MetaCredential[],
  accounts: AccountRow[],
  nowIso: string,
): Promise<AdsLinkSummary> {
  const linkErrors: string[] = [];
  const websites = await loadWebsiteRows(
    supabase as Parameters<typeof loadWebsiteRows>[0],
  );
  const credByKey = new Map(credentials.map((c) => [c.id, c]));
  const targets = accounts.filter(
    (a) => a.status === "ENABLED" || a.account_status === 1,
  );
  const successfulAccountIds: string[] = [];
  const allLinkRows: FacebookAccountWebsiteRow[] = [];
  const discovered: DiscoveredDomainInput[] = [];
  const accountsWithLinks = new Set<string>();
  const websitesLinked = new Set<string>();
  const pageDomainsThisRun = new Set<string>();
  let pagesScanned = 0;
  let pagesWithWebsite = 0;

  // Cache /me/accounts per credential (page tokens + website)
  const managedByCred = new Map<string, Map<string, PageWebsiteLookup>>();
  await mapPool(credentials, 2, async (cred) => {
    managedByCred.set(cred.id, await loadManagedPages(cred));
  });

  await mapPool(targets, ACCOUNT_CONCURRENCY, async (account) => {
    const cred = credByKey.get(account.business_key);
    if (!cred) {
      linkErrors.push(
        `${account.ad_account_id}: missing credential ${account.business_key}`,
      );
      return;
    }
    try {
      const managed = managedByCred.get(cred.id) || new Map();
      let pageSource = "promote_pages";
      let pages = await graphGetAll(
        cred,
        `/${account.ad_account_id}/promote_pages`,
        {
          fields: "id,name,website,link",
          limit: "100",
        },
        10,
      );

      // Token often lacks promote_pages access — fall back to pages used by ads
      if (pages.length === 0) {
        pageSource = "ads_page_ids";
        const pageIds = await collectPageIdsFromAds(cred, account.ad_account_id);
        pages = await fetchPagesByIds(cred, pageIds, managed);
      } else {
        // Enrich missing website via managed page token / Page node read
        pages = await fetchPagesByIds(
          cred,
          pages.map((p) => String(p.id || "")),
          managed,
        );
      }

      pagesScanned += pages.length;

      // domain -> sample urls + page refs
      const domainMeta = new Map<
        string,
        { urls: string[]; pages: Map<string, string> }
      >();

      for (const page of pages) {
        const pageId = String(page.id || "").trim();
        const pageName = String(page.name || pageId || "").trim();
        const websiteUrls = parsePageWebsiteField(page.website);
        if (websiteUrls.length) pagesWithWebsite += 1;
        for (const url of websiteUrls) {
          for (const domain of extractDomainsFromUrls([url])) {
            if (!domain || isFacebookHostedDomain(domain)) continue;
            pageDomainsThisRun.add(domain);
            let meta = domainMeta.get(domain);
            if (!meta) {
              meta = { urls: [], pages: new Map() };
              domainMeta.set(domain, meta);
            }
            if (!meta.urls.includes(url)) meta.urls.push(url);
            if (pageId) meta.pages.set(pageId, pageName || pageId);
          }
        }
      }

      if (pages.length === 0) {
        linkErrors.push(
          `${account.ad_account_id}: no fan pages via promote_pages or ads (managed_pages=${managed.size})`,
        );
      } else if ([...domainMeta.keys()].length === 0) {
        const sample = pages.slice(0, 3).map((p) => {
          const id = String(p.id || "");
          const name = String(p.name || "");
          const website = p.website == null ? "null" : JSON.stringify(p.website);
          const err = p._error != null ? ` err=${String(p._error).slice(0, 80)}` : "";
          return `${name || id}:website=${website}${err}`;
        });
        const needsPerm = sample.some((s) => s.includes("pages_read") || s.includes("(#10)"));
        linkErrors.push(
          `${account.ad_account_id}: ${pages.length} pages (${pageSource}, managed=${managed.size}) but none have website URL set` +
            (needsPerm
              ? " — Meta #10: regenerate tokens after granting pages_show_list + pages_read_engagement, and enable Page Public Metadata Access (website field). Also assign Pages to the System User so /me/accounts returns page tokens."
              : "") +
            ` | ${sample.join(" ; ")}`,
        );
      }

      const pageDomains = [...domainMeta.keys()];
      const allUrls = [...domainMeta.values()].flatMap((m) => m.urls);

      let matches = matchDomainsToWebsites(pageDomains, websites);
      let matchSource: "page_website" | "name" = "page_website";
      let domainsForDiscovery = pageDomains;

      // Name fallback only when no Page.website domains were found
      if (pageDomains.length === 0) {
        const nameDomains = extractDomainsFromName(account.account_name).filter(
          (d) => !isFacebookHostedDomain(d),
        );
        matches = matchDomainsToWebsites(nameDomains, websites);
        if (matches.length) matchSource = "name";
        domainsForDiscovery = nameDomains;
        for (const d of nameDomains) {
          pageDomainsThisRun.add(d);
          if (!domainMeta.has(d)) {
            domainMeta.set(d, { urls: [], pages: new Map() });
          }
        }
      }

      for (const domain of domainsForDiscovery) {
        const domainMatches = matchDomainsToWebsites([domain], websites);
        const meta = domainMeta.get(domain);
        const urls = meta?.urls?.length ? meta.urls : allUrls;
        const pageEntries = [...(meta?.pages?.entries() ?? [])];
        if (pageEntries.length === 0) {
          discovered.push({
            normalized_domain: domain,
            sample_url: pickSampleUrlForDomain(domain, urls),
            source: "facebook",
            website_profile_id: domainMatches[0]?.website_profile_id ?? null,
            source_ref: {
              platform: "facebook",
              accountId: account.ad_account_id,
              accountName: account.account_name || account.ad_account_id,
              campaignId: null,
              campaignName: null,
              pageId: null,
              pageName: null,
            },
          });
        } else {
          for (const [pageId, pageName] of pageEntries) {
            discovered.push({
              normalized_domain: domain,
              sample_url: pickSampleUrlForDomain(domain, urls),
              source: "facebook",
              website_profile_id: domainMatches[0]?.website_profile_id ?? null,
              source_ref: {
                platform: "facebook",
                accountId: account.ad_account_id,
                accountName: account.account_name || account.ad_account_id,
                campaignId: null,
                campaignName: null,
                pageId,
                pageName,
              },
            });
          }
        }
      }

      for (const m of matches) {
        allLinkRows.push({
          ad_account_id: account.ad_account_id,
          website_profile_id: m.website_profile_id,
          matched_domain: m.matched_domain,
          sample_final_url: pickSampleUrlForDomain(m.matched_domain, allUrls),
          match_source: matchSource,
          last_seen_at: nowIso,
          updated_at: nowIso,
        });
        accountsWithLinks.add(account.ad_account_id);
        websitesLinked.add(m.website_profile_id);
      }
      successfulAccountIds.push(account.ad_account_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      linkErrors.push(`${account.ad_account_id}: ${msg.slice(0, 180)}`);
    }
  });

  const sb = supabase as Parameters<typeof replaceFacebookAccountWebsiteLinks>[0];
  await replaceFacebookAccountWebsiteLinks(sb, successfulAccountIds, allLinkRows);
  const { discovered: domainsDiscovered, unmatched: domainsUnmatched } =
    await upsertDiscoveredDomains(
      supabase as Parameters<typeof upsertDiscoveredDomains>[0],
      discovered,
      nowIso,
    );

  // Drop stale Facebook-only unmatched rows left over from creative/CTA scraping
  // (wa.link, fbcdn, etc.) that are not Page.website domains from this run.
  try {
    // deno-lint-ignore no-explicit-any
    const client = supabase as any;
    const { data: unmatchedRows, error: listErr } = await client
      .from("ads_discovered_domains")
      .select("normalized_domain, sources, source_refs")
      .eq("status", "unmatched");
    if (!listErr && Array.isArray(unmatchedRows)) {
      const toDelete: string[] = [];
      for (const row of unmatchedRows as Array<{
        normalized_domain: string;
        sources: string[] | null;
        source_refs?: unknown;
      }>) {
        const domain = String(row.normalized_domain || "");
        if (!domain || pageDomainsThisRun.has(domain)) continue;
        const sources = Array.isArray(row.sources) ? row.sources : [];
        const onlyFacebook =
          sources.length > 0 && sources.every((s) => s === "facebook");
        if (!onlyFacebook) continue;
        const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
        const hasPageRef = refs.some(
          (r) =>
            r &&
            typeof r === "object" &&
            (r as Record<string, unknown>).platform === "facebook" &&
            String((r as Record<string, unknown>).pageId || ""),
        );
        if (hasPageRef) continue;
        toDelete.push(domain);
      }
      for (let i = 0; i < toDelete.length; i += 200) {
        const chunk = toDelete.slice(i, i + 200);
        if (!chunk.length) continue;
        await client
          .from("ads_discovered_domains")
          .delete()
          .in("normalized_domain", chunk);
      }
    }
  } catch {
    // cleanup is best-effort
  }

  return {
    accounts_with_links: accountsWithLinks.size,
    websites_linked: websitesLinked.size,
    domains_discovered: domainsDiscovered,
    domains_unmatched: domainsUnmatched,
    pages_scanned: pagesScanned,
    pages_with_website: pagesWithWebsite,
    link_errors: linkErrors,
  };
}
