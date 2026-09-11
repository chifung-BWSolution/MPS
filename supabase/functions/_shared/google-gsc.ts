/** Shared Google Search Console helpers for Edge Functions */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function normalizeKeyword(raw: string): string {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split(/[/?#]/)[0] || "";
  return s.replace(/:\d+$/, "");
}

/** Extract hostname-like key from GSC siteUrl (domain or URL-prefix). */
export function siteUrlToDomainKey(siteUrl: string): string {
  const s = String(siteUrl || "").trim().toLowerCase();
  if (s.startsWith("sc-domain:")) {
    return normalizeDomain(s.slice("sc-domain:".length));
  }
  return normalizeDomain(s);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const GSC_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
export const GSC_OAUTH_LOGIN_HINT = "chifung.login@gmail.com";

export function getGscOAuthRedirectUri(): string {
  const override = (Deno.env.get("GOOGLE_GSC_OAUTH_REDIRECT_URI") || "").trim();
  if (override) return override;
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  return base ? `${base}/functions/v1/gsc-oauth` : "";
}

export function maskRefreshToken(token: string): string {
  const t = String(token || "").trim();
  if (!t) return "";
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

export function hasWebmastersScope(scope: string | null | undefined): boolean {
  return /webmasters/i.test(String(scope || ""));
}

type GscTokenStore = {
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

/** Same client chain as GA4: GSC override → GA4 override → live Ads client. */
export function resolveGscOAuthClient(): { clientId: string; clientSecret: string } {
  return {
    clientId: (
      Deno.env.get("GOOGLE_GSC_CLIENT_ID") ||
      Deno.env.get("GOOGLE_GA4_CLIENT_ID") ||
      Deno.env.get("GOOGLE_ADS_CLIENT_ID") ||
      ""
    ).trim(),
    clientSecret: (
      Deno.env.get("GOOGLE_GSC_CLIENT_SECRET") ||
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

type GscTokenSource = "gsc" | "ga4";

async function loadStoredRefreshToken(
  supabase: GscTokenStore | undefined,
  provider: GscTokenSource,
): Promise<string> {
  if (!supabase) return "";
  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("provider", provider)
    .maybeSingle();
  if (error) {
    console.warn(`[gsc-oauth] load stored ${provider} refresh token:`, error.message);
    return "";
  }
  return String(data?.refresh_token || "").trim();
}

async function collectGscRefreshTokens(
  supabase?: GscTokenStore,
): Promise<Array<{ token: string; source: GscTokenSource }>> {
  const out: Array<{ token: string; source: GscTokenSource }> = [];
  const seen = new Set<string>();
  const add = (raw: string, source: GscTokenSource) => {
    const token = String(raw || "").trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    out.push({ token, source });
  };
  add(await loadStoredRefreshToken(supabase, "gsc"), "gsc");
  add(Deno.env.get("GOOGLE_GSC_REFRESH_TOKEN") || "", "gsc");
  add(await loadStoredRefreshToken(supabase, "ga4"), "ga4");
  add(Deno.env.get("GOOGLE_GA4_REFRESH_TOKEN") || "", "ga4");
  return out;
}

export async function persistRefreshToken(
  supabase: GscTokenStore | undefined,
  provider: GscTokenSource,
  refreshToken: string,
  rotated: boolean,
): Promise<void> {
  if (!supabase || !refreshToken) return;
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    provider,
    refresh_token: refreshToken,
    last_used_at: nowIso,
    updated_at: nowIso,
  };
  if (rotated) row.last_rotated_at = nowIso;
  const { data: existing } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("provider", provider)
    .maybeSingle();
  if (!existing && !rotated) {
    row.last_rotated_at = nowIso;
  }
  const { error } = await supabase.from("google_oauth_tokens").upsert(row, {
    onConflict: "provider",
  });
  if (error) {
    console.warn(`[gsc-oauth] persist ${provider} refresh token:`, error.message);
  }
}

function isClientMismatchRefreshError(detail: string): boolean {
  return /unauthorized_client|invalid_grant/i.test(detail);
}

async function exchangeRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken?: string } | { error: string }> {
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
    signal: AbortSignal.timeout(20_000),
  });
  const detail = await res.text();
  if (!res.ok) {
    return { error: `GSC OAuth refresh failed (${res.status}): ${detail}` };
  }
  const json = JSON.parse(detail) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    return { error: "GSC OAuth refresh returned no access_token" };
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

/**
 * Same pattern as GA4: exchange refresh_token → access_token.
 * Reuses the Ads / GA4 OAuth client. Tries GSC token first, then the working
 * GA4 refresh token (Playground tokens are often issued for Google's client).
 */
export async function getGscAccessToken(supabase?: GscTokenStore): Promise<string> {
  const { clientId, clientSecret } = resolveGscOAuthClient();
  const candidates = await collectGscRefreshTokens(supabase);
  if (!clientId || !clientSecret || candidates.length === 0) {
    throw new Error(
      "Missing Google Ads / GA4 OAuth client (GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET) or GOOGLE_GA4_REFRESH_TOKEN / GOOGLE_GSC_REFRESH_TOKEN",
    );
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    const result = await exchangeRefreshToken(
      clientId,
      clientSecret,
      candidate.token,
    );
    if ("error" in result) {
      if (isClientMismatchRefreshError(result.error) && candidates.length > 1) {
        console.warn(
          `[gsc-oauth] ${candidate.source} refresh token rejected, trying next:`,
          result.error.slice(0, 180),
        );
        failures.push(`${candidate.source}: ${result.error.slice(0, 180)}`);
        continue;
      }
      throw new Error(
        result.error +
          (isClientMismatchRefreshError(result.error)
            ? " — refresh token was not issued by this OAuth client. GSC now also tries the GA4 token; if both fail, re-authorize webmasters.readonly with the Ads client via scripts/get-gsc-refresh-token.py (not Playground's default client)."
            : ""),
      );
    }

    const rotated = nextRotatedRefreshToken(candidate.token, result.refreshToken);
    await persistRefreshToken(
      supabase,
      candidate.source,
      rotated || candidate.token,
      !!rotated,
    );
    return result.accessToken;
  }

  throw new Error(
    "GSC OAuth refresh failed for GSC and GA4 tokens. " + failures.join(" | "),
  );
}

export type GscSite = {
  siteUrl: string;
  permissionLevel?: string;
};

export async function listGscSites(accessToken: string): Promise<GscSite[]> {
  const res = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    const missingScope = res.status === 403 || /insufficient.?permission|accessNotConfigured|PERMISSION_DENIED/i.test(detail);
    throw new Error(
      `GSC sites.list failed (${res.status}): ${detail}` +
        (missingScope
          ? " — this access token has no Search Console scope. The GA4 grant is analytics.readonly only; add webmasters.readonly with the Ads client via scripts/get-gsc-refresh-token.py (do not use Playground's default client)."
          : ""),
    );
  }
  const json = await res.json();
  const entries = (json.siteEntry || []) as Array<{
    siteUrl?: string;
    permissionLevel?: string;
  }>;
  return entries
    .filter((e) => e.siteUrl)
    .map((e) => ({
      siteUrl: String(e.siteUrl),
      permissionLevel: e.permissionLevel,
    }));
}

export type GscDailyMetric = {
  site_url: string;
  query: string;
  metric_date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchDailyQueryMetrics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  nowIso: string,
): Promise<GscDailyMetric[]> {
  const encoded = encodeURIComponent(siteUrl);
  const url =
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`;
  const out: GscDailyMetric[] = [];
  let startRow = 0;
  const pageSize = 25000;
  const maxRows = 50_000;

  while (startRow < maxRows) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query", "date"],
        rowLimit: pageSize,
        startRow,
        dataState: "final",
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(
        `GSC searchAnalytics failed for ${siteUrl} (${res.status}): ${(await res.text()).slice(0, 400)}`,
      );
    }
    const json = await res.json();
    const batch = (json.rows || []) as Array<{
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }>;
    if (batch.length === 0) break;

    for (const r of batch) {
      const query = String(r.keys?.[0] || "").trim();
      const metricDate = String(r.keys?.[1] || "");
      if (!query || !metricDate) continue;
      out.push({
        site_url: siteUrl,
        query,
        metric_date: metricDate,
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(r.ctr || 0),
        position: Number(r.position || 0),
        last_synced_at: nowIso,
        updated_at: nowIso,
      });
    }

    startRow += batch.length;
    if (batch.length < pageSize) break;
  }

  return out;
}

export type WebsiteRow = {
  id: string;
  domain_url: string | null;
  gsc_site_url: string | null;
  website_name: string | null;
};

/** Match GSC site to webandsystem_list by explicit gsc_site_url or domain. */
export function matchWebsiteForSite(
  siteUrl: string,
  websites: WebsiteRow[],
): { website_profile_id: string; matched_domain: string } | null {
  const explicit = websites.find((w) => w.gsc_site_url && w.gsc_site_url === siteUrl);
  if (explicit) {
    return {
      website_profile_id: explicit.id,
      matched_domain: siteUrlToDomainKey(siteUrl),
    };
  }
  const key = siteUrlToDomainKey(siteUrl);
  if (!key) return null;
  for (const w of websites) {
    const d = normalizeDomain(w.domain_url);
    if (!d) continue;
    if (d === key || d.endsWith("." + key) || key.endsWith("." + d)) {
      return { website_profile_id: w.id, matched_domain: d };
    }
  }
  return null;
}
