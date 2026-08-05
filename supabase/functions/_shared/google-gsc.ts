/** Shared Google Search Console helpers for Edge Functions */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function normalizeKeyword(raw: string): string {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Extract hostname-like key from GSC siteUrl (domain or URL-prefix). */
export function siteUrlToDomainKey(siteUrl: string): string {
  let s = String(siteUrl || "").trim().toLowerCase();
  if (s.startsWith("sc-domain:")) {
    return s.slice("sc-domain:".length).replace(/^www\./, "");
  }
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  return s.split(/[/?#]/)[0] || "";
}

export function normalizeDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  return s.split(/[/?#]/)[0] || "";
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getGscAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_GSC_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_GSC_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_GSC_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing GOOGLE_GSC_CLIENT_ID / GOOGLE_GSC_CLIENT_SECRET / GOOGLE_GSC_REFRESH_TOKEN",
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
    throw new Error(`GSC OAuth refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
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
    },
  );
  if (!res.ok) {
    throw new Error(`GSC sites.list failed (${res.status}): ${await res.text()}`);
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

  while (true) {
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
