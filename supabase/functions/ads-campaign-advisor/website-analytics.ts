import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeDomain } from "../_shared/website-match.ts";
import type { AdvisorDateContext, ToolExecution } from "./tools.ts";

const PAGE_SIZE = 1000;
const SERIES_KEEP = 14;
const CHANNEL_KEEP = 12;
const GSC_QUERY_KEEP = 25;
const GSC_MAX_ROWS = 8000;
const SEO_KEYWORD_KEEP = 15;

type WebsiteHint = {
  websiteProfileId: string;
  domain: string;
};

type WebsiteTarget = {
  websiteProfileId: string;
  domain: string;
  websiteName: string;
  propertyId: string;
  propertyName: string;
  ga4LastSyncedAt: string | null;
  siteUrl: string;
  gscLastSyncedAt: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function pctDisplay(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function uniqueHints(hints: WebsiteHint[]): WebsiteHint[] {
  const seen = new Set<string>();
  const out: WebsiteHint[] = [];
  for (const hint of hints) {
    const websiteProfileId = asString(hint.websiteProfileId);
    const domain = normalizeDomain(hint.domain);
    const key = `${websiteProfileId}|${domain}`;
    if (!websiteProfileId && !domain) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ websiteProfileId, domain });
  }
  return out;
}

async function linkedHintsFromCampaign(
  supabase: SupabaseClient,
  ctx: AdvisorDateContext,
): Promise<WebsiteHint[]> {
  const platform = asString(ctx.platform).toLowerCase();
  const accountId = asString(ctx.accountId);
  const campaignId = asString(ctx.campaignId);
  if (platform === "google" && accountId && campaignId) {
    const { data, error } = await supabase
      .from("google_ads_campaign_websites")
      .select("website_profile_id,matched_domain")
      .eq("customer_id", accountId)
      .eq("campaign_id", campaignId)
      .limit(20);
    if (error) throw new Error(error.message);
    return uniqueHints(
      (data ?? []).map((row) => ({
        websiteProfileId: String(row.website_profile_id || ""),
        domain: String(row.matched_domain || ""),
      })),
    );
  }
  if (platform === "facebook" && accountId) {
    const { data, error } = await supabase
      .from("facebook_ads_account_websites")
      .select("website_profile_id,matched_domain")
      .eq("ad_account_id", accountId)
      .limit(20);
    if (error) throw new Error(error.message);
    return uniqueHints(
      (data ?? []).map((row) => ({
        websiteProfileId: String(row.website_profile_id || ""),
        domain: String(row.matched_domain || ""),
      })),
    );
  }
  return [];
}

async function hintsFromDomain(
  supabase: SupabaseClient,
  domain: string,
): Promise<WebsiteHint[]> {
  const needle = normalizeDomain(domain);
  if (!needle) return [];
  const [{ data: websites, error: websiteErr }, { data: ga4, error: ga4Err }, { data: gsc, error: gscErr }] =
    await Promise.all([
      supabase
        .from("webandsystem_list")
        .select("id,domain_url")
        .ilike("domain_url", `%${needle}%`)
        .limit(20),
      supabase
        .from("ga4_properties")
        .select("website_profile_id,matched_domain")
        .ilike("matched_domain", `%${needle}%`)
        .limit(20),
      supabase
        .from("gsc_sites")
        .select("website_profile_id,matched_domain,site_url")
        .or(`matched_domain.ilike.%${needle}%,site_url.ilike.%${needle}%`)
        .limit(20),
    ]);
  if (websiteErr) throw new Error(websiteErr.message);
  if (ga4Err) throw new Error(ga4Err.message);
  if (gscErr) throw new Error(gscErr.message);
  return uniqueHints([
    ...((websites ?? []).map((row) => ({
      websiteProfileId: String(row.id || ""),
      domain: String(row.domain_url || needle),
    }))),
    ...((ga4 ?? []).map((row) => ({
      websiteProfileId: String(row.website_profile_id || ""),
      domain: String(row.matched_domain || needle),
    }))),
    ...((gsc ?? []).map((row) => ({
      websiteProfileId: String(row.website_profile_id || ""),
      domain: String(row.matched_domain || needle),
    }))),
  ]);
}

async function hydrateTarget(
  supabase: SupabaseClient,
  hint: WebsiteHint,
  extras?: { propertyId?: string; siteUrl?: string },
): Promise<WebsiteTarget | null> {
  const websiteProfileId = asString(hint.websiteProfileId);
  const propertyIdHint = asString(extras?.propertyId);
  const siteUrlHint = asString(extras?.siteUrl);

  const websitePromise = websiteProfileId
    ? supabase
      .from("webandsystem_list")
      .select("id,domain_url,website_name,ga4_property_id,gsc_site_url")
      .eq("id", websiteProfileId)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const ga4Promise = propertyIdHint
    ? supabase
      .from("ga4_properties")
      .select("property_id,display_name,matched_domain,website_profile_id,last_synced_at")
      .eq("property_id", propertyIdHint)
      .maybeSingle()
    : websiteProfileId
      ? supabase
        .from("ga4_properties")
        .select("property_id,display_name,matched_domain,website_profile_id,last_synced_at")
        .eq("website_profile_id", websiteProfileId)
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const gscPromise = siteUrlHint
    ? supabase
      .from("gsc_sites")
      .select("site_url,matched_domain,website_profile_id,last_synced_at")
      .eq("site_url", siteUrlHint)
      .maybeSingle()
    : websiteProfileId
      ? supabase
        .from("gsc_sites")
        .select("site_url,matched_domain,website_profile_id,last_synced_at")
        .eq("website_profile_id", websiteProfileId)
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [websiteRes, ga4Res, gscRes] = await Promise.all([websitePromise, ga4Promise, gscPromise]);
  if (websiteRes.error) throw new Error(websiteRes.error.message);
  if (ga4Res.error) throw new Error(ga4Res.error.message);
  if (gscRes.error) throw new Error(gscRes.error.message);

  const website = websiteRes.data as {
    id?: string;
    domain_url?: string | null;
    website_name?: string | null;
    ga4_property_id?: string | null;
    gsc_site_url?: string | null;
  } | null;
  const ga4 = ga4Res.data as {
    property_id?: string;
    display_name?: string | null;
    matched_domain?: string | null;
    website_profile_id?: string | null;
    last_synced_at?: string | null;
  } | null;
  const gsc = gscRes.data as {
    site_url?: string;
    matched_domain?: string | null;
    website_profile_id?: string | null;
    last_synced_at?: string | null;
  } | null;

  const resolvedId = websiteProfileId || asString(ga4?.website_profile_id) || asString(gsc?.website_profile_id);
  const domain = normalizeDomain(
    website?.domain_url || hint.domain || ga4?.matched_domain || gsc?.matched_domain || "",
  );
  if (!resolvedId && !domain && !asString(ga4?.property_id) && !asString(gsc?.site_url) && !propertyIdHint && !siteUrlHint) {
    return null;
  }

  return {
    websiteProfileId: resolvedId,
    domain,
    websiteName: asString(website?.website_name) || domain,
    propertyId: asString(ga4?.property_id) || asString(website?.ga4_property_id) || propertyIdHint,
    propertyName: asString(ga4?.display_name) || asString(ga4?.property_id) || asString(website?.ga4_property_id),
    ga4LastSyncedAt: ga4?.last_synced_at ?? null,
    siteUrl: asString(gsc?.site_url) || asString(website?.gsc_site_url) || siteUrlHint,
    gscLastSyncedAt: gsc?.last_synced_at ?? null,
  };
}

function compactTarget(target: WebsiteTarget) {
  return {
    websiteProfileId: target.websiteProfileId || undefined,
    domain: target.domain || undefined,
    websiteName: target.websiteName || undefined,
    propertyId: target.propertyId || undefined,
    propertyName: target.propertyName || undefined,
    ga4LastSyncedAt: target.ga4LastSyncedAt,
    siteUrl: target.siteUrl || undefined,
    gscLastSyncedAt: target.gscLastSyncedAt,
  };
}

async function resolveWebsiteTarget(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
): Promise<ToolExecution | { ok: true; target: WebsiteTarget }> {
  const websiteProfileId = asString(args.websiteProfileId);
  const domain = asString(args.domain);
  const propertyId = asString(args.propertyId);
  const siteUrl = asString(args.siteUrl);

  if (propertyId) {
    const target = await hydrateTarget(supabase, { websiteProfileId, domain }, { propertyId, siteUrl });
    if (target?.propertyId) return { ok: true, target };
    return { ok: false, data: { error: `找不到 GA4 property ${propertyId}` } };
  }
  if (siteUrl) {
    const target = await hydrateTarget(supabase, { websiteProfileId, domain }, { propertyId, siteUrl });
    if (target?.siteUrl) return { ok: true, target };
    return { ok: false, data: { error: `找不到 GSC site ${siteUrl}` } };
  }
  if (websiteProfileId) {
    const target = await hydrateTarget(supabase, { websiteProfileId, domain }, { propertyId, siteUrl });
    if (target) return { ok: true, target };
    return { ok: false, data: { error: `找不到網站 ${websiteProfileId}` } };
  }

  let hints = uniqueHints([
    ...(domain ? await hintsFromDomain(supabase, domain) : []),
    ...ctx.websites.map((w) => ({
      websiteProfileId: asString(w.websiteProfileId),
      domain: asString(w.domain),
    })),
  ]);
  if (hints.length === 0) {
    hints = await linkedHintsFromCampaign(supabase, ctx);
  }
  if (domain && hints.length === 0) {
    hints = [{ websiteProfileId: "", domain }];
  }

  const hydrated: WebsiteTarget[] = [];
  for (const hint of hints.slice(0, 8)) {
    const target = await hydrateTarget(supabase, hint, { propertyId, siteUrl });
    if (target) hydrated.push(target);
  }

  if (hydrated.length === 0) {
    return {
      ok: false,
      data: {
        error: "找不到關聯網站的 GA4／GSC 資料。請提供 websiteProfileId 或 domain。",
      },
    };
  }
  if (hydrated.length > 1) {
    return {
      ok: true,
      data: {
        candidates: hydrated.map(compactTarget),
        note: "多個關聯網站。請向用戶確認後，用 websiteProfileId 或 domain 再查一次。",
      },
    };
  }
  return { ok: true, target: hydrated[0] };
}

function deriveGa4Totals(input: {
  users: number;
  newUsers: number;
  sessions: number;
  pageviews: number;
  engagedSessions: number;
  conversions: number;
  durationSecondsWeighted: number;
}) {
  const sessions = input.sessions;
  const engaged = input.engagedSessions;
  const engagementRate = sessions > 0 ? engaged / sessions : 0;
  return {
    users: input.users,
    newUsers: input.newUsers,
    sessions,
    pageviews: input.pageviews,
    engagedSessions: engaged,
    conversions: input.conversions,
    bounceRate: sessions > 0 ? Math.max(0, 1 - engagementRate) : 0,
    bounceRateDisplay: pctDisplay(sessions > 0 ? Math.max(0, 1 - engagementRate) : 0),
    engagementRate,
    engagementRateDisplay: pctDisplay(engagementRate),
    avgSessionDuration: sessions > 0 ? input.durationSecondsWeighted / sessions : 0,
    pagesPerSession: sessions > 0 ? input.pageviews / sessions : 0,
  };
}

function emptyGa4Totals() {
  return deriveGa4Totals({
    users: 0,
    newUsers: 0,
    sessions: 0,
    pageviews: 0,
    engagedSessions: 0,
    conversions: 0,
    durationSecondsWeighted: 0,
  });
}

async function fetchGa4Daily(
  supabase: SupabaseClient,
  propertyId: string,
  from: string,
  to: string,
) {
  const { data, error } = await supabase
    .from("ga4_property_daily_metrics")
    .select(
      "metric_date,users,new_users,sessions,pageviews,engaged_sessions,conversions,avg_session_duration",
    )
    .eq("property_id", propertyId)
    .gte("metric_date", from)
    .lte("metric_date", to)
    .order("metric_date", { ascending: true })
    .limit(400);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const sessions = Number(row.sessions) || 0;
    return {
      date: String(row.metric_date).slice(0, 10),
      users: Number(row.users) || 0,
      newUsers: Number(row.new_users) || 0,
      sessions,
      pageviews: Number(row.pageviews) || 0,
      engagedSessions: Number(row.engaged_sessions) || 0,
      conversions: Number(row.conversions) || 0,
      avgSessionDuration: Number(row.avg_session_duration) || 0,
    };
  });
}

function compactGa4Series(
  rows: Array<{
    date: string;
    users: number;
    newUsers: number;
    sessions: number;
    pageviews: number;
    engagedSessions: number;
    conversions: number;
    avgSessionDuration: number;
  }>,
) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.users += row.users;
      acc.newUsers += row.newUsers;
      acc.sessions += row.sessions;
      acc.pageviews += row.pageviews;
      acc.engagedSessions += row.engagedSessions;
      acc.conversions += row.conversions;
      acc.durationSecondsWeighted += row.avgSessionDuration * row.sessions;
      return acc;
    },
    {
      users: 0,
      newUsers: 0,
      sessions: 0,
      pageviews: 0,
      engagedSessions: 0,
      conversions: 0,
      durationSecondsWeighted: 0,
    },
  );
  return {
    totals: deriveGa4Totals(totals),
    series: rows.slice(-SERIES_KEEP).map((row) => ({
      date: row.date,
      users: row.users,
      sessions: row.sessions,
      pageviews: row.pageviews,
      conversions: row.conversions,
      engagementRate: row.sessions > 0 ? row.engagedSessions / row.sessions : 0,
    })),
  };
}

async function fetchGa4Channels(
  supabase: SupabaseClient,
  propertyId: string,
  from: string,
  to: string,
) {
  const { data, error } = await supabase
    .from("ga4_channel_daily_metrics")
    .select("channel,sessions,users,pageviews")
    .eq("property_id", propertyId)
    .gte("metric_date", from)
    .lte("metric_date", to)
    .limit(4000);
  if (error) throw new Error(error.message);
  const map = new Map<string, { channel: string; sessions: number; users: number; pageviews: number }>();
  for (const row of data ?? []) {
    const channel = String(row.channel || "(not set)");
    const prev = map.get(channel) || { channel, sessions: 0, users: 0, pageviews: 0 };
    prev.sessions += Number(row.sessions) || 0;
    prev.users += Number(row.users) || 0;
    prev.pageviews += Number(row.pageviews) || 0;
    map.set(channel, prev);
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions).slice(0, CHANNEL_KEEP);
}

export async function getGa4Metrics(
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
  supabase: SupabaseClient,
): Promise<ToolExecution> {
  const resolved = await resolveWebsiteTarget(supabase, args, ctx);
  if (!("target" in resolved)) return resolved;
  const target = resolved.target;
  const dateFrom = asString(args.dateFrom) || ctx.dateFrom;
  const dateTo = asString(args.dateTo) || ctx.dateTo;
  if (!target.propertyId) {
    return {
      ok: true,
      data: {
        ...compactTarget(target),
        dateFrom,
        dateTo,
        note: "此網站尚未對應已同步的 GA4 property。",
      },
    };
  }

  const prev = {
    from: ctx.dateFrom,
    to: ctx.dateTo,
  };
  // previousPeriod is computed in warehouse; keep this file self-contained.
  const fromDate = new Date(`${dateFrom}T00:00:00Z`);
  const toDate = new Date(`${dateTo}T00:00:00Z`);
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(fromDate);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  prev.from = prevFrom.toISOString().slice(0, 10);
  prev.to = prevTo.toISOString().slice(0, 10);

  const [currentRows, previousRows, channels] = await Promise.all([
    fetchGa4Daily(supabase, target.propertyId, dateFrom, dateTo),
    fetchGa4Daily(supabase, target.propertyId, prev.from, prev.to),
    fetchGa4Channels(supabase, target.propertyId, dateFrom, dateTo),
  ]);
  const current = compactGa4Series(currentRows);
  const previous = previousRows.length ? compactGa4Series(previousRows) : { totals: emptyGa4Totals(), series: [] };
  return {
    ok: true,
    data: {
      ...compactTarget(target),
      dateFrom,
      dateTo,
      previousDateFrom: prev.from,
      previousDateTo: prev.to,
      totals: current.totals,
      previousTotals: previous.totals,
      channels,
      recentSeries: current.series,
      note: currentRows.length === 0 ? "此區間沒有 GA4 每日列，可能尚未同步。" : undefined,
    },
  };
}

type GscDailyRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

function aggregateGscRows(rows: GscDailyRow[], keep: number) {
  const totals = { clicks: 0, impressions: 0, positionWeighted: 0 };
  const byQuery = new Map<string, GscDailyRow & { positionWeighted: number }>();
  for (const row of rows) {
    totals.clicks += row.clicks;
    totals.impressions += row.impressions;
    totals.positionWeighted += row.position * row.impressions;
    const prev = byQuery.get(row.query) || {
      query: row.query,
      clicks: 0,
      impressions: 0,
      position: 0,
      positionWeighted: 0,
    };
    prev.clicks += row.clicks;
    prev.impressions += row.impressions;
    prev.positionWeighted += row.position * row.impressions;
    byQuery.set(row.query, prev);
  }
  const queries = [...byQuery.values()]
    .map((row) => {
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
      const position = row.impressions > 0 ? row.positionWeighted / row.impressions : 0;
      return {
        query: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr,
        ctrDisplay: pctDisplay(ctr),
        position: Number(position.toFixed(1)),
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, keep);
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const position = totals.impressions > 0 ? totals.positionWeighted / totals.impressions : 0;
  return {
    totals: {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr,
      ctrDisplay: pctDisplay(ctr),
      position: Number(position.toFixed(1)),
    },
    queries,
  };
}

async function fetchGscDailyRows(
  supabase: SupabaseClient,
  siteUrl: string,
  from: string,
  to: string,
  query: string,
): Promise<{ rows: GscDailyRow[]; truncated: boolean }> {
  const rows: GscDailyRow[] = [];
  let offset = 0;
  let truncated = false;
  for (;;) {
    let q = supabase
      .from("gsc_query_daily_metrics")
      .select("query,clicks,impressions,position")
      .eq("site_url", siteUrl)
      .gte("metric_date", from)
      .lte("metric_date", to)
      .order("clicks", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (query) q = q.ilike("query", `%${query}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      rows.push({
        query: String(row.query || ""),
        clicks: Number(row.clicks) || 0,
        impressions: Number(row.impressions) || 0,
        position: Number(row.position) || 0,
      });
    }
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (rows.length >= GSC_MAX_ROWS) {
      truncated = true;
      break;
    }
  }
  return { rows: rows.slice(0, GSC_MAX_ROWS), truncated };
}

export async function getGscQueries(
  args: Record<string, unknown>,
  ctx: AdvisorDateContext,
  supabase: SupabaseClient,
): Promise<ToolExecution> {
  const resolved = await resolveWebsiteTarget(supabase, args, ctx);
  if (!("target" in resolved)) return resolved;
  const target = resolved.target;
  const dateFrom = asString(args.dateFrom) || ctx.dateFrom;
  const dateTo = asString(args.dateTo) || ctx.dateTo;
  const query = asString(args.query);
  const limit = clampLimit(args.limit, GSC_QUERY_KEEP, 50);
  if (!target.siteUrl) {
    return {
      ok: true,
      data: {
        ...compactTarget(target),
        dateFrom,
        dateTo,
        note: "此網站尚未對應已同步的 GSC site。",
      },
    };
  }

  const [{ rows, truncated }, keywordsRes] = await Promise.all([
    fetchGscDailyRows(supabase, target.siteUrl, dateFrom, dateTo, query),
    target.websiteProfileId
      ? supabase
        .from("seo_keywords")
        .select("keyword,current_ranking,status,target_page,search_volume,source")
        .eq("website_profile_id", target.websiteProfileId)
        .order("keyword", { ascending: true })
        .limit(SEO_KEYWORD_KEEP)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (keywordsRes.error) throw new Error(keywordsRes.error.message);
  const aggregated = aggregateGscRows(rows, limit);
  const keywords = (keywordsRes.data ?? []).map((row) => ({
    keyword: String(row.keyword || ""),
    currentRanking: row.current_ranking == null ? null : Number(row.current_ranking),
    status: String(row.status || ""),
    targetPage: row.target_page ? String(row.target_page) : null,
    searchVolume: row.search_volume == null ? null : Number(row.search_volume),
    source: String(row.source || ""),
  }));

  return {
    ok: true,
    data: {
      ...compactTarget(target),
      dateFrom,
      dateTo,
      query: query || undefined,
      totals: aggregated.totals,
      queries: aggregated.queries,
      keywords,
      truncated,
      note: rows.length === 0
        ? "此區間沒有 GSC 查詢列，可能尚未同步。"
        : truncated
          ? `僅根據點擊最高的 ${GSC_MAX_ROWS} 列估算；完整合計可能更高。`
          : undefined,
    },
  };
}
