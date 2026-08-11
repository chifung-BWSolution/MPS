/** Shared Google Ads helpers for Edge Functions */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractDomainsFromName,
  extractDomainsFromUrls,
  loadWebsiteRows,
  matchDomainsToWebsites,
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
      throw new Error(
        `GAQL failed for ${customerId} (${res.status}): ${(await res.text()).slice(0, 400)}`,
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

export type AdGroupDailyRow = {
  customer_id: string;
  campaign_id: string;
  ad_group_id: string;
  ad_group_name: string;
  status: string | null;
  ad_group_type: string | null;
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

export type KeywordDailyRow = {
  customer_id: string;
  campaign_id: string;
  ad_group_id: string;
  criterion_id: string;
  keyword_text: string;
  match_type: string | null;
  status: string | null;
  metric_date: string;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  quality_score: number | null;
  normalized_keyword: string;
  last_synced_at: string;
  updated_at: string;
};

export type SearchTermDailyRow = {
  customer_id: string;
  campaign_id: string;
  ad_group_id: string;
  search_term: string;
  metric_date: string;
  keyword_text: string | null;
  match_type: string | null;
  search_term_status: string | null;
  search_term_match_type: string | null;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  ctr: number;
  average_cpc_micros: number;
  last_synced_at: string;
  updated_at: string;
};

function normalizeKeyword(text: string): string {
  return text.trim().toLowerCase();
}

export async function fetchAdGroupDailyMetricsForRange(
  accessToken: string,
  customerIds: string[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ rows: AdGroupDailyRow[]; errors: string[] }> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM ad_group
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;

  const rows: AdGroupDailyRow[] = [];
  const errors: string[] = [];

  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const result = await gaqlQuery(accessToken, customerId, query);
      for (const row of result) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
        const metricDate = String(nestGet(row, "segments.date") ?? "");
        if (!campaignId || !adGroupId || !metricDate) continue;
        rows.push({
          customer_id: customerId,
          campaign_id: campaignId,
          ad_group_id: adGroupId,
          ad_group_name: String(nestGet(row, "adGroup.name") ?? ""),
          status: String(nestGet(row, "adGroup.status") ?? "") || null,
          ad_group_type: String(nestGet(row, "adGroup.type") ?? "") || null,
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
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`ad_group ${customerId}: ${msg.slice(0, 160)}`);
    }
  });

  return { rows, errors };
}

export async function fetchKeywordDailyMetricsForRange(
  accessToken: string,
  customerIds: string[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ rows: KeywordDailyRow[]; errors: string[] }> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
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
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;

  const rows: KeywordDailyRow[] = [];
  const errors: string[] = [];

  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const result = await gaqlQuery(accessToken, customerId, query);
      for (const row of result) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
        const criterionId = String(
          nestGet(row, "adGroupCriterion.criterionId") ?? "",
        );
        const metricDate = String(nestGet(row, "segments.date") ?? "");
        const keywordText = String(
          nestGet(row, "adGroupCriterion.keyword.text") ?? "",
        );
        if (!campaignId || !adGroupId || !criterionId || !metricDate) continue;
        const qsRaw = nestGet(row, "adGroupCriterion.qualityInfo.qualityScore");
        rows.push({
          customer_id: customerId,
          campaign_id: campaignId,
          ad_group_id: adGroupId,
          criterion_id: criterionId,
          keyword_text: keywordText,
          match_type:
            String(nestGet(row, "adGroupCriterion.keyword.matchType") ?? "") ||
            null,
          status:
            String(nestGet(row, "adGroupCriterion.status") ?? "") || null,
          metric_date: metricDate,
          impressions: asInt(nestGet(row, "metrics.impressions")),
          clicks: asInt(nestGet(row, "metrics.clicks")),
          cost_micros: asInt(nestGet(row, "metrics.costMicros")),
          conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
          quality_score:
            qsRaw === undefined || qsRaw === null || qsRaw === ""
              ? null
              : asInt(qsRaw),
          normalized_keyword: normalizeKeyword(keywordText),
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`keyword ${customerId}: ${msg.slice(0, 160)}`);
    }
  });

  return { rows, errors };
}

export async function fetchSearchTermDailyMetricsForRange(
  accessToken: string,
  customerIds: string[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ rows: SearchTermDailyRow[]; errors: string[] }> {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      ad_group.id,
      search_term_view.search_term,
      search_term_view.status,
      segments.keyword.info.text,
      segments.keyword.info.match_type,
      segments.search_term_match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM search_term_view
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;

  const rows: SearchTermDailyRow[] = [];
  const errors: string[] = [];

  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const result = await gaqlQuery(accessToken, customerId, query);
      for (const row of result) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        const adGroupId = String(nestGet(row, "adGroup.id") ?? "");
        const searchTerm = String(
          nestGet(row, "searchTermView.searchTerm") ?? "",
        ).trim();
        const metricDate = String(nestGet(row, "segments.date") ?? "");
        if (!campaignId || !adGroupId || !searchTerm || !metricDate) continue;
        rows.push({
          customer_id: customerId,
          campaign_id: campaignId,
          ad_group_id: adGroupId,
          search_term: searchTerm,
          metric_date: metricDate,
          keyword_text:
            String(nestGet(row, "segments.keyword.info.text") ?? "") || null,
          match_type:
            String(nestGet(row, "segments.keyword.info.matchType") ?? "") ||
            null,
          search_term_status:
            String(nestGet(row, "searchTermView.status") ?? "") || null,
          search_term_match_type:
            String(nestGet(row, "segments.searchTermMatchType") ?? "") || null,
          impressions: asInt(nestGet(row, "metrics.impressions")),
          clicks: asInt(nestGet(row, "metrics.clicks")),
          cost_micros: asInt(nestGet(row, "metrics.costMicros")),
          conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
          ctr: Number(nestGet(row, "metrics.ctr") ?? 0) || 0,
          average_cpc_micros: asInt(nestGet(row, "metrics.averageCpc")),
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`search_term ${customerId}: ${msg.slice(0, 160)}`);
    }
  });

  return { rows, errors };
}

/** Fetch + upsert ad group / keyword / search term daily metrics for a date range. */
export async function syncBreakdownDailyMetrics(
  supabase: SupabaseClient,
  accessToken: string,
  customerIds: string[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{
  adGroupRows: number;
  keywordRows: number;
  searchTermRows: number;
  errors: string[];
}> {
  const [adGroups, keywords, searchTerms] = await Promise.all([
    fetchAdGroupDailyMetricsForRange(
      accessToken,
      customerIds,
      dateFrom,
      dateTo,
      nowIso,
    ),
    fetchKeywordDailyMetricsForRange(
      accessToken,
      customerIds,
      dateFrom,
      dateTo,
      nowIso,
    ),
    fetchSearchTermDailyMetricsForRange(
      accessToken,
      customerIds,
      dateFrom,
      dateTo,
      nowIso,
    ),
  ]);

  const errors = [
    ...adGroups.errors,
    ...keywords.errors,
    ...searchTerms.errors,
  ];

  for (let i = 0; i < adGroups.rows.length; i += 500) {
    const chunk = adGroups.rows.slice(i, i + 500);
    const { error } = await supabase
      .from("google_ads_ad_group_daily_metrics")
      .upsert(chunk, {
        onConflict: "customer_id,campaign_id,ad_group_id,metric_date",
      });
    if (error) throw new Error(`Ad group daily upsert: ${error.message}`);
  }

  for (let i = 0; i < keywords.rows.length; i += 500) {
    const chunk = keywords.rows.slice(i, i + 500);
    const { error } = await supabase
      .from("google_ads_keyword_daily_metrics")
      .upsert(chunk, {
        onConflict:
          "customer_id,campaign_id,ad_group_id,criterion_id,metric_date",
      });
    if (error) throw new Error(`Keyword daily upsert: ${error.message}`);
  }

  for (let i = 0; i < searchTerms.rows.length; i += 500) {
    const chunk = searchTerms.rows.slice(i, i + 500);
    const { error } = await supabase
      .from("google_ads_search_term_daily_metrics")
      .upsert(chunk, {
        onConflict:
          "customer_id,campaign_id,ad_group_id,search_term,metric_date",
      });
    if (error) throw new Error(`Search term daily upsert: ${error.message}`);
  }

  return {
    adGroupRows: adGroups.rows.length,
    keywordRows: keywords.rows.length,
    searchTermRows: searchTerms.rows.length,
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
};

type CampaignUrlAgg = {
  campaignId: string;
  campaignName: string;
  urls: string[];
  urlSource: "final_url" | "landing_page";
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && !!x);
}

/**
 * Discover final URLs / landing pages for Google campaigns and link them to
 * webandsystem_list rows by domain (with campaign/account name fallback).
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
    link_errors: [],
  };
  if (!customerIds.length) return empty;

  const websites = await loadWebsiteRows(supabase);
  const linkErrors: string[] = [];
  const allCampaignRowIds: string[] = [];
  const allLinkRows: GoogleCampaignWebsiteRow[] = [];
  const discoveredInputs: DiscoveredDomainInput[] = [];

  type CustomerResult = {
    campaignRowIds: string[];
    linkRows: GoogleCampaignWebsiteRow[];
    discovered: DiscoveredDomainInput[];
  };

  const results = await mapPool(
    customerIds,
    ACCOUNT_CONCURRENCY,
    async (customerId): Promise<CustomerResult | null> => {
      try {
        const adRows = await gaqlQuery(
          accessToken,
          customerId,
          `
          SELECT
            campaign.id,
            campaign.name,
            ad_group_ad.ad.final_urls,
            ad_group_ad.ad.final_mobile_urls
          FROM ad_group_ad
          WHERE campaign.status != 'REMOVED'
            AND ad_group_ad.status != 'REMOVED'
          `,
        );

        const campaignMap = new Map<string, CampaignUrlAgg>();
        for (const row of adRows) {
          const campaignId = String(nestGet(row, "campaign.id") ?? "");
          if (!campaignId) continue;
          const campaignName = String(nestGet(row, "campaign.name") ?? "");
          const urls = [
            ...asStringArray(nestGet(row, "adGroupAd.ad.finalUrls")),
            ...asStringArray(nestGet(row, "adGroupAd.ad.finalMobileUrls")),
          ];
          const existing = campaignMap.get(campaignId);
          if (!existing) {
            campaignMap.set(campaignId, {
              campaignId,
              campaignName,
              urls: [...urls],
              urlSource: "final_url",
            });
          } else {
            if (campaignName && !existing.campaignName) {
              existing.campaignName = campaignName;
            }
            for (const u of urls) {
              if (!existing.urls.includes(u)) existing.urls.push(u);
            }
          }
        }

        const needsLanding = [...campaignMap.values()].some((c) => c.urls.length === 0);
        if (needsLanding) {
          try {
            const lpRows = await gaqlQuery(
              accessToken,
              customerId,
              `
              SELECT
                campaign.id,
                campaign.name,
                landing_page_view.unexpanded_final_url
              FROM landing_page_view
              WHERE segments.date DURING LAST_30_DAYS
              `,
            );
            for (const row of lpRows) {
              const campaignId = String(nestGet(row, "campaign.id") ?? "");
              if (!campaignId) continue;
              const campaignName = String(nestGet(row, "campaign.name") ?? "");
              const url = nestGet(row, "landingPageView.unexpandedFinalUrl");
              const urlStr = typeof url === "string" && url ? url : null;
              const existing = campaignMap.get(campaignId);
              if (!existing) {
                campaignMap.set(campaignId, {
                  campaignId,
                  campaignName,
                  urls: urlStr ? [urlStr] : [],
                  urlSource: "landing_page",
                });
              } else if (existing.urls.length === 0) {
                if (campaignName && !existing.campaignName) {
                  existing.campaignName = campaignName;
                }
                existing.urlSource = "landing_page";
                if (urlStr) existing.urls.push(urlStr);
              } else if (existing.urlSource === "landing_page" && urlStr) {
                if (!existing.urls.includes(urlStr)) existing.urls.push(urlStr);
              }
            }
          } catch {
            // Landing page view is optional fallback; ignore per-customer LP failures
          }
        }

        const campaignRowIds: string[] = [];
        const linkRows: GoogleCampaignWebsiteRow[] = [];
        const discovered: DiscoveredDomainInput[] = [];
        const accountName = accountNameByCustomerId.get(customerId) || "";

        for (const agg of campaignMap.values()) {
          const campaignRowId = `${customerId}:${agg.campaignId}`;
          campaignRowIds.push(campaignRowId);

          const urlDomains = extractDomainsFromUrls(agg.urls);
          let matchSource: GoogleCampaignWebsiteRow["match_source"] = agg.urlSource;
          let matches = matchDomainsToWebsites(urlDomains, websites);
          let domainsForDiscover = [...urlDomains];

          if (!matches.length) {
            const nameDomains = [
              ...extractDomainsFromName(agg.campaignName),
              ...extractDomainsFromName(accountName),
            ];
            const uniqueNameDomains = [...new Set(nameDomains)];
            if (uniqueNameDomains.length) {
              matches = matchDomainsToWebsites(uniqueNameDomains, websites);
              if (matches.length) matchSource = "name";
              for (const d of uniqueNameDomains) {
                if (!domainsForDiscover.includes(d)) domainsForDiscover.push(d);
              }
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

        return { campaignRowIds, linkRows, discovered };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        linkErrors.push(`${customerId}: ${msg.slice(0, 160)}`);
        return null;
      }
    },
  );

  for (const r of results) {
    if (!r) continue;
    allCampaignRowIds.push(...r.campaignRowIds);
    allLinkRows.push(...r.linkRows);
    discoveredInputs.push(...r.discovered);
  }

  if (allCampaignRowIds.length) {
    await replaceGoogleCampaignWebsiteLinks(
      supabase,
      allCampaignRowIds,
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
    link_errors: linkErrors,
  };
}
