import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchDailyQueryMetrics,
  getGscAccessToken,
  listGscSites,
  matchWebsiteForSite,
  normalizeKeyword,
  toIsoDate,
  type WebsiteRow,
} from "../_shared/google-gsc.ts";
import { isGscPermissionError, resumeSkipSiteUrls } from "../_shared/gsc-sync-progress.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

/** GSC data lags ~2–3 days; pull a 28-day window by default. */
const LOOKBACK_DAYS = 28;
/** Auto-create seo_keywords for queries with at least this many impressions in-window. */
const MIN_IMPRESSIONS_FOR_KEYWORD = 10;
/** Leave headroom under the ~150s Edge Function limit. */
const DEADLINE_MS = 120_000;

type LastRun = {
  started_at?: string;
  meta?: {
    incomplete?: boolean;
    timed_out?: boolean;
    processed_site_urls?: string[];
    skipped_site_urls?: string[];
  } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let hop = 0;
  try {
    const body = await req.json().catch(() => ({})) as { hop?: number };
    hop = Math.max(0, Number(body.hop) || 0);
  } catch {
    hop = 0;
  }

  const runId = `gsc_${Date.now()}`;
  const startedMs = Date.now();
  const deadlineAt = startedMs + DEADLINE_MS;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const siteErrors: string[] = [];
  const skippedUrls: string[] = [];
  const processedUrls: string[] = [];

  const finishRun = async (patch: Record<string, unknown>) => {
    await supabase.from("gsc_sync_runs").update(patch).eq("id", runId);
  };

  const runMeta = (extra: Record<string, unknown> = {}) => ({
    errors: siteErrors.slice(0, 40),
    skipped: skippedUrls.slice(0, 40),
    processed_site_urls: processedUrls,
    skipped_site_urls: skippedUrls,
    ...extra,
  });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    const { data: lastRow } = await supabase
      .from("gsc_sync_runs")
      .select("started_at, meta")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const alreadyDone = new Set(resumeSkipSiteUrls((lastRow || null) as LastRun));
    if (alreadyDone.size === 0 && (lastRow as LastRun | null)?.meta?.timed_out) {
      const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: recentSites } = await supabase
        .from("gsc_sites")
        .select("site_url, last_synced_at")
        .gte("last_synced_at", since);
      for (const row of recentSites || []) {
        if (row.site_url) alreadyDone.add(String(row.site_url));
      }
    }

    await supabase.from("gsc_sync_runs").insert({
      id: runId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (LOOKBACK_DAYS - 1));
    const startStr = toIsoDate(start);
    const endStr = toIsoDate(end);

    const accessToken = await getGscAccessToken(supabase);
    const sites = await listGscSites(accessToken);
    for (const url of alreadyDone) {
      if (!processedUrls.includes(url)) processedUrls.push(url);
    }

    const { data: websiteRows, error: wsErr } = await supabase
      .from("webandsystem_list")
      .select("id, domain_url, gsc_site_url, website_name");
    if (wsErr) throw new Error(`Load websites failed: ${wsErr.message}`);
    const websites = (websiteRows || []) as WebsiteRow[];

    await finishRun({
      meta: runMeta({
        date_from: startStr,
        date_to: endStr,
        sites_listed: sites.length,
        resumed: alreadyDone.size > 0,
      }),
    });

    let rowsUpserted = 0;
    let keywordsUpserted = 0;
    let sitesSynced = 0;
    let timedOut = false;

    for (const site of sites) {
      if (alreadyDone.has(site.siteUrl)) continue;
      if (Date.now() >= deadlineAt) {
        timedOut = true;
        siteErrors.push(`尚餘站點未跑完，再按「開始同步」會從下一站繼續（停在 ${site.siteUrl}）`);
        break;
      }

      const match = matchWebsiteForSite(site.siteUrl, websites);
      const siteRow = {
        site_url: site.siteUrl,
        permission_level: site.permissionLevel || null,
        website_profile_id: match?.website_profile_id || null,
        matched_domain: match?.matched_domain || null,
        updated_at: nowIso,
      };
      const { error: siteUpsertErr } = await supabase
        .from("gsc_sites")
        .upsert(siteRow, { onConflict: "site_url" });
      if (siteUpsertErr) {
        siteErrors.push(`${site.siteUrl}: site upsert ${siteUpsertErr.message}`);
        continue;
      }

      let metrics;
      try {
        metrics = await fetchDailyQueryMetrics(
          accessToken,
          site.siteUrl,
          startStr,
          endStr,
          nowIso,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isGscPermissionError(message)) {
          skippedUrls.push(site.siteUrl);
          processedUrls.push(site.siteUrl);
          siteErrors.push(`${site.siteUrl}: 無權限，已略過`);
          continue;
        }
        siteErrors.push(`${site.siteUrl}: ${message.slice(0, 280)}`);
        continue;
      }

      for (let i = 0; i < metrics.length; i += 500) {
        if (Date.now() >= deadlineAt) {
          timedOut = true;
          break;
        }
        const chunk = metrics.slice(i, i + 500);
        const { error } = await supabase
          .from("gsc_query_daily_metrics")
          .upsert(chunk, { onConflict: "site_url,query,metric_date" });
        if (error) {
          siteErrors.push(`${site.siteUrl}: metrics upsert ${error.message}`);
          break;
        }
        rowsUpserted += chunk.length;
      }
      if (timedOut) {
        siteErrors.push(`尚餘站點未跑完，再按「開始同步」會從下一站繼續（停在 ${site.siteUrl}）`);
        break;
      }

      await supabase
        .from("gsc_sites")
        .update({ last_synced_at: nowIso, updated_at: nowIso })
        .eq("site_url", site.siteUrl);

      sitesSynced += 1;
      processedUrls.push(site.siteUrl);

      if (match?.website_profile_id) {
        const byQuery = new Map<
          string,
          { display: string; impressions: number; positionWeighted: number; lastDate: string; lastPos: number }
        >();
        for (const m of metrics) {
          const key = normalizeKeyword(m.query);
          if (!key) continue;
          const prev = byQuery.get(key) || {
            display: m.query,
            impressions: 0,
            positionWeighted: 0,
            lastDate: m.metric_date,
            lastPos: m.position,
          };
          prev.impressions += m.impressions;
          prev.positionWeighted += m.position * m.impressions;
          if (m.metric_date >= prev.lastDate) {
            prev.lastDate = m.metric_date;
            prev.lastPos = m.position;
          }
          byQuery.set(key, prev);
        }

        const keywordRows = [];
        for (const [normalized, agg] of byQuery) {
          if (agg.impressions < MIN_IMPRESSIONS_FOR_KEYWORD) continue;
          const avgPos = agg.impressions > 0
            ? Math.round((agg.positionWeighted / agg.impressions) * 10) / 10
            : agg.lastPos;
          keywordRows.push({
            id: crypto.randomUUID(),
            website_profile_id: match.website_profile_id,
            keyword: agg.display,
            normalized_keyword: normalized,
            level: "level_3",
            current_ranking: String(avgPos),
            status: "monitoring",
            source: "gsc",
            gsc_site_url: site.siteUrl,
            last_gsc_sync_at: nowIso,
            updated_at: nowIso,
          });
        }

        for (let i = 0; i < keywordRows.length; i += 400) {
          const chunk = keywordRows.slice(i, i + 400);
          const { data: upserted, error: kwErr } = await supabase.rpc(
            "upsert_gsc_seo_keywords",
            { payload: chunk },
          );
          if (kwErr) {
            siteErrors.push(`${site.siteUrl} keyword upsert: ${kwErr.message}`);
            break;
          }
          keywordsUpserted += Number(upserted) || chunk.length;
        }
      }

      await finishRun({
        sites_synced: sitesSynced,
        rows_upserted: rowsUpserted,
        keywords_upserted: keywordsUpserted,
        meta: runMeta({
          date_from: startStr,
          date_to: endStr,
          sites_listed: sites.length,
          sites_remaining: Math.max(0, sites.length - processedUrls.length),
        }),
      });
    }

    const remaining = Math.max(0, sites.length - processedUrls.length);
    const incomplete = timedOut && remaining > 0;
    await finishRun({
      status: "success",
      finished_at: new Date().toISOString(),
      sites_synced: sitesSynced,
      rows_upserted: rowsUpserted,
      keywords_upserted: keywordsUpserted,
      error_message: incomplete
        ? `已寫入目前進度，尚餘 ${remaining} 站。再按一次「開始同步」繼續。`
        : null,
      meta: runMeta({
        date_from: startStr,
        date_to: endStr,
        sites_listed: sites.length,
        sites_remaining: remaining,
        incomplete,
        timed_out: timedOut,
      }),
    });

    if (incomplete && hop < 8 && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const next = fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/sync-gsc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hop: hop + 1 }),
      }).catch((err) => {
        console.warn("[sync-gsc] continue hop failed", err);
      });
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
        .EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(next);
    }

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        duration_ms: Date.now() - startedMs,
        sites_listed: sites.length,
        sites_synced: sitesSynced,
        rows_upserted: rowsUpserted,
        keywords_upserted: keywordsUpserted,
        date_from: startStr,
        date_to: endStr,
        errors: siteErrors.slice(0, 20),
        skipped: skippedUrls.slice(0, 20),
        incomplete,
        timed_out: timedOut,
        hop,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("gsc_sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: message.slice(0, 1000),
        meta: runMeta({ errors: [message, ...siteErrors].slice(0, 30) }),
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ error: message, run_id: runId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
