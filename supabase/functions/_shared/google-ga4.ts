/** Shared Google Analytics 4 helpers for Edge Functions */

import { matchDomainsToWebsites, normalizeDomain } from "./website-match.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const LIVE_GA4_BREAKDOWN_MAX_DAYS = 92;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function normalizeGa4PropertyId(raw: string | null | undefined): string {
  return String(raw || "").trim().replace(/^properties\//i, "");
}

export function ga4DateToIso(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return "";
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function validateLiveGa4Range(
  from: string,
  to: string,
): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, error: "日期格式須為 YYYY-MM-DD" };
  }
  if (from > to) {
    return { ok: false, error: "開始日期不可晚於結束日期" };
  }
  const days = daysBetweenInclusive(from, to);
  if (days > LIVE_GA4_BREAKDOWN_MAX_DAYS) {
    return {
      ok: false,
      error: `即時細項最多 ${LIVE_GA4_BREAKDOWN_MAX_DAYS} 日（目前 ${days} 日）`,
    };
  }
  return { ok: true };
}

type Ga4TokenStore = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { refresh_token?: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
  };
};

function resolveGa4OAuthClient(): { clientId: string; clientSecret: string } {
  return {
    clientId: (
      Deno.env.get("GOOGLE_GA4_CLIENT_ID") ||
      Deno.env.get("GOOGLE_ADS_CLIENT_ID") ||
      ""
    ).trim(),
    clientSecret: (
      Deno.env.get("GOOGLE_GA4_CLIENT_SECRET") ||
      Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ||
      ""
    ).trim(),
  };
}

function nextRotatedRefreshToken(
  current: string,
  incoming: string | null | undefined,
): string | null {
  const next = String(incoming || "").trim();
  if (!next || next === current) return null;
  return next;
}

async function loadStoredGa4RefreshToken(
  supabase?: Ga4TokenStore,
): Promise<string> {
  if (!supabase) return "";
  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("provider", "ga4")
    .maybeSingle();
  if (error) {
    console.warn("[ga4-oauth] load stored refresh token:", error.message);
    return "";
  }
  return String(data?.refresh_token || "").trim();
}

async function persistGa4RefreshToken(
  supabase: Ga4TokenStore | undefined,
  refreshToken: string,
  rotated: boolean,
): Promise<void> {
  if (!supabase || !refreshToken) return;
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    provider: "ga4",
    refresh_token: refreshToken,
    last_used_at: nowIso,
    updated_at: nowIso,
  };
  if (rotated) row.last_rotated_at = nowIso;
  const { data: existing } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("provider", "ga4")
    .maybeSingle();
  if (!existing && !rotated) {
    row.last_rotated_at = nowIso;
  }
  const { error } = await supabase.from("google_oauth_tokens").upsert(row, {
    onConflict: "provider",
  });
  if (error) {
    console.warn("[ga4-oauth] persist refresh token:", error.message);
  }
}

/**
 * Exchange the stored / seed refresh token for an access token.
 * Reuses the Google Ads OAuth client by default.
 * If Google returns a new refresh token, persist it so the next call uses the rotated value.
 */
export async function getGa4AccessToken(supabase?: Ga4TokenStore): Promise<string> {
  const { clientId, clientSecret } = resolveGa4OAuthClient();
  const storedToken = await loadStoredGa4RefreshToken(supabase);
  const envToken = (Deno.env.get("GOOGLE_GA4_REFRESH_TOKEN") || "").trim();
  const refreshToken = storedToken || envToken;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google Ads / GA4 OAuth client (GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET) or GOOGLE_GA4_REFRESH_TOKEN",
    );
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
    throw new Error(`GA4 OAuth refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json() as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    throw new Error("GA4 OAuth refresh returned no access_token");
  }

  const rotated = nextRotatedRefreshToken(refreshToken, json.refresh_token);
  await persistGa4RefreshToken(supabase, rotated || refreshToken, !!rotated);

  return json.access_token;
}

export type Ga4AccountProperty = {
  propertyId: string;
  accountId: string;
  accountName: string;
  displayName: string;
  streamUri: string | null;
  measurementId: string | null;
};

type AccountSummary = {
  account?: string;
  displayName?: string;
  propertySummaries?: Array<{
    property?: string;
    displayName?: string;
  }>;
};

export async function listGa4Properties(
  accessToken: string,
): Promise<Ga4AccountProperty[]> {
  const out: Ga4AccountProperty[] = [];
  let pageToken = "";
  do {
    const qs = new URLSearchParams({ pageSize: "200" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${qs}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(
        `GA4 accountSummaries failed (${res.status}): ${await res.text()}`,
      );
    }
    const json = await res.json();
    const summaries = (json.accountSummaries || []) as AccountSummary[];
    for (const account of summaries) {
      const accountId = String(account.account || "").replace(/^accounts\//, "");
      const accountName = String(account.displayName || accountId);
      for (const property of account.propertySummaries || []) {
        const propertyId = normalizeGa4PropertyId(property.property);
        if (!propertyId) continue;
        out.push({
          propertyId,
          accountId,
          accountName,
          displayName: String(property.displayName || propertyId),
          streamUri: null,
          measurementId: null,
        });
      }
    }
    pageToken = String(json.nextPageToken || "");
  } while (pageToken);
  return out;
}

type DataStream = {
  type?: string;
  webStreamData?: {
    defaultUri?: string;
    measurementId?: string;
  };
};

export async function fetchPropertyStreamMeta(
  accessToken: string,
  propertyId: string,
): Promise<{ streamUri: string | null; measurementId: string | null; uris: string[] }> {
  const res = await fetch(
    `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(
      `GA4 dataStreams failed for ${propertyId} (${res.status}): ${(await res.text()).slice(0, 400)}`,
    );
  }
  const json = await res.json();
  const streams = (json.dataStreams || []) as DataStream[];
  const uris: string[] = [];
  let measurementId: string | null = null;
  for (const stream of streams) {
    const uri = stream.webStreamData?.defaultUri;
    if (uri) uris.push(uri);
    if (!measurementId && stream.webStreamData?.measurementId) {
      measurementId = stream.webStreamData.measurementId;
    }
  }
  return {
    streamUri: uris[0] || null,
    measurementId,
    uris,
  };
}

type ReportRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

async function runReport(
  accessToken: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<ReportRow[]> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(
      `GA4 runReport failed for ${propertyId} (${res.status}): ${(await res.text()).slice(0, 500)}`,
    );
  }
  const json = await res.json();
  return (json.rows || []) as ReportRow[];
}

export type Ga4DailyMetric = {
  property_id: string;
  metric_date: string;
  users: number;
  new_users: number;
  sessions: number;
  pageviews: number;
  engaged_sessions: number;
  conversions: number;
  avg_session_duration: number;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchDailyPropertyMetrics(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  nowIso: string,
): Promise<Ga4DailyMetric[]> {
  const rows = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "activeUsers" },
      { name: "newUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "engagedSessions" },
      { name: "conversions" },
      { name: "averageSessionDuration" },
    ],
    limit: 100000,
  });

  return rows
    .map((row) => {
      const metricDate = ga4DateToIso(row.dimensionValues?.[0]?.value);
      if (!metricDate) return null;
      return {
        property_id: propertyId,
        metric_date: metricDate,
        users: Number(row.metricValues?.[0]?.value || 0),
        new_users: Number(row.metricValues?.[1]?.value || 0),
        sessions: Number(row.metricValues?.[2]?.value || 0),
        pageviews: Number(row.metricValues?.[3]?.value || 0),
        engaged_sessions: Number(row.metricValues?.[4]?.value || 0),
        conversions: Number(row.metricValues?.[5]?.value || 0),
        avg_session_duration: Number(row.metricValues?.[6]?.value || 0),
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
    })
    .filter((row): row is Ga4DailyMetric => !!row);
}

export type Ga4ChannelDaily = {
  property_id: string;
  metric_date: string;
  channel: string;
  sessions: number;
  users: number;
  pageviews: number;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchDailyChannelMetrics(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  nowIso: string,
): Promise<Ga4ChannelDaily[]> {
  const rows = await runReport(accessToken, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "screenPageViews" },
    ],
    limit: 250000,
  });

  return rows
    .map((row) => {
      const metricDate = ga4DateToIso(row.dimensionValues?.[0]?.value);
      const channel = String(row.dimensionValues?.[1]?.value || "").trim() || "(not set)";
      if (!metricDate) return null;
      return {
        property_id: propertyId,
        metric_date: metricDate,
        channel,
        sessions: Number(row.metricValues?.[0]?.value || 0),
        users: Number(row.metricValues?.[1]?.value || 0),
        pageviews: Number(row.metricValues?.[2]?.value || 0),
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
    })
    .filter((row): row is Ga4ChannelDaily => !!row);
}

function metricNum(row: ReportRow, index: number): number {
  return Number(row.metricValues?.[index]?.value || 0);
}

export type Ga4Breakdowns = {
  pages: Array<{
    pagePath: string;
    pageTitle: string;
    sessions: number;
    users: number;
    pageviews: number;
    bounceRate: number;
    avgSessionDuration: number;
  }>;
  devices: Array<{
    device: string;
    sessions: number;
    users: number;
    pageviews: number;
  }>;
  countries: Array<{
    country: string;
    sessions: number;
    users: number;
    pageviews: number;
  }>;
  sources: Array<{
    source: string;
    medium: string;
    sessions: number;
    users: number;
    pageviews: number;
  }>;
  errors: string[];
};

export async function fetchGa4Breakdowns(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4Breakdowns> {
  const errors: string[] = [];
  const empty: Ga4Breakdowns = {
    pages: [],
    devices: [],
    countries: [],
    sources: [],
    errors,
  };

  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  const [pages, devices, countries, sources] = await Promise.all([
    safe("pages", async () => {
      const rows = await runReport(accessToken, propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 100,
      });
      return rows.map((row) => ({
        pagePath: String(row.dimensionValues?.[0]?.value || ""),
        pageTitle: String(row.dimensionValues?.[1]?.value || ""),
        sessions: metricNum(row, 0),
        users: metricNum(row, 1),
        pageviews: metricNum(row, 2),
        bounceRate: metricNum(row, 3),
        avgSessionDuration: metricNum(row, 4),
      }));
    }, []),
    safe("devices", async () => {
      const rows = await runReport(accessToken, propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      });
      return rows.map((row) => ({
        device: String(row.dimensionValues?.[0]?.value || "(not set)"),
        sessions: metricNum(row, 0),
        users: metricNum(row, 1),
        pageviews: metricNum(row, 2),
      }));
    }, []),
    safe("countries", async () => {
      const rows = await runReport(accessToken, propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "country" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      });
      return rows.map((row) => ({
        country: String(row.dimensionValues?.[0]?.value || "(not set)"),
        sessions: metricNum(row, 0),
        users: metricNum(row, 1),
        pageviews: metricNum(row, 2),
      }));
    }, []),
    safe("sources", async () => {
      const rows = await runReport(accessToken, propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      });
      return rows.map((row) => ({
        source: String(row.dimensionValues?.[0]?.value || "(direct)"),
        medium: String(row.dimensionValues?.[1]?.value || "(none)"),
        sessions: metricNum(row, 0),
        users: metricNum(row, 1),
        pageviews: metricNum(row, 2),
      }));
    }, []),
  ]);

  return { ...empty, pages, devices, countries, sources, errors };
}

export type Ga4WebsiteRow = {
  id: string;
  domain_url: string | null;
  website_name: string | null;
  ga4_property_id?: string | null;
  status?: string | null;
};

export function matchWebsiteForGa4Property(
  property: {
    propertyId: string;
    displayName?: string | null;
    streamUris?: string[];
  },
  websites: Ga4WebsiteRow[],
): { website_profile_id: string; matched_domain: string } | null {
  const propertyId = normalizeGa4PropertyId(property.propertyId);
  if (!propertyId) return null;

  const explicit = websites.find(
    (w) => normalizeGa4PropertyId(w.ga4_property_id) === propertyId,
  );
  if (explicit) {
    return {
      website_profile_id: explicit.id,
      matched_domain: normalizeDomain(explicit.domain_url) || propertyId,
    };
  }

  const streamMatches = matchDomainsToWebsites(property.streamUris || [], websites);
  if (streamMatches[0]) return streamMatches[0];

  const nameAsDomain = normalizeDomain(property.displayName);
  if (nameAsDomain) {
    const nameMatches = matchDomainsToWebsites([nameAsDomain], websites);
    if (nameMatches[0]) return nameMatches[0];
  }

  const name = String(property.displayName || "").trim().toLowerCase();
  if (name.length >= 3) {
    const named = websites.find((w) => {
      const websiteName = String(w.website_name || "").trim().toLowerCase();
      return websiteName.length >= 3 &&
        (websiteName === name || name.includes(websiteName) || websiteName.includes(name));
    });
    if (named) {
      return {
        website_profile_id: named.id,
        matched_domain: normalizeDomain(named.domain_url) || name,
      };
    }
  }

  return null;
}
