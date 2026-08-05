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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

/** GSC data lags ~2–3 days; pull a 28-day window by default. */
const LOOKBACK_DAYS = 28;
/** Auto-create seo_keywords for queries with at least this many impressions in-window. */
const MIN_IMPRESSIONS_FOR_KEYWORD = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `gsc_${Date.now()}`;
  const startedMs = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const siteErrors: string[] = [];

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    await supabase.from("gsc_sync_runs").insert({
      id: runId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const now = new Date();
    const nowIso = now.toISOString();
    // End 3 days ago to prefer finalized GSC rows
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (LOOKBACK_DAYS - 1));
    const startStr = toIsoDate(start);
    const endStr = toIsoDate(end);

    const accessToken = await getGscAccessToken();
    const sites = await listGscSites(accessToken);

    const { data: websiteRows, error: wsErr } = await supabase
      .from("webandsystem_list")
      .select("id, domain_url, gsc_site_url, website_name");
    if (wsErr) throw new Error(`Load websites failed: ${wsErr.message}`);
    const websites = (websiteRows || []) as WebsiteRow[];

    let rowsUpserted = 0;
    let keywordsUpserted = 0;
    let sitesSynced = 0;

    for (const site of sites) {
      const match = matchWebsiteForSite(site.siteUrl, websites);
      const siteRow = {
        site_url: site.siteUrl,
        permission_level: site.permissionLevel || null,
        website_profile_id: match?.website_profile_id || null,
        matched_domain: match?.matched_domain || null,
        last_synced_at: nowIso,
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
        siteErrors.push(
          `${site.siteUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      for (let i = 0; i < metrics.length; i += 500) {
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

      sitesSynced += 1;

      if (!match?.website_profile_id) continue;

      // Aggregate impressions by query over the window; upsert keywords + history
      const byQuery = new Map<
        string,
        { impressions: number; clicks: number; positionWeighted: number; lastDate: string; lastPos: number; lastClicks: number; lastImpr: number; lastCtr: number }
      >();
      for (const m of metrics) {
        const key = normalizeKeyword(m.query);
        if (!key) continue;
        const prev = byQuery.get(key) || {
          impressions: 0,
          clicks: 0,
          positionWeighted: 0,
          lastDate: m.metric_date,
          lastPos: m.position,
          lastClicks: m.clicks,
          lastImpr: m.impressions,
          lastCtr: m.ctr,
        };
        prev.impressions += m.impressions;
        prev.clicks += m.clicks;
        prev.positionWeighted += m.position * m.impressions;
        if (m.metric_date >= prev.lastDate) {
          prev.lastDate = m.metric_date;
          prev.lastPos = m.position;
          prev.lastClicks = m.clicks;
          prev.lastImpr = m.impressions;
          prev.lastCtr = m.ctr;
        }
        byQuery.set(key, prev);
      }

      for (const [normalized, agg] of byQuery) {
        if (agg.impressions < MIN_IMPRESSIONS_FOR_KEYWORD) continue;
        const display = metrics.find((m) => normalizeKeyword(m.query) === normalized)?.query ||
          normalized;
        const avgPos = agg.impressions > 0
          ? Math.round((agg.positionWeighted / agg.impressions) * 10) / 10
          : agg.lastPos;

        const { data: existing } = await supabase
          .from("seo_keywords")
          .select("id")
          .eq("website_profile_id", match.website_profile_id)
          .eq("normalized_keyword", normalized)
          .maybeSingle();

        let keywordId = existing?.id as string | undefined;
        if (keywordId) {
          // Preserve manual level/status; only refresh GSC rank fields.
          const { error: updErr } = await supabase
            .from("seo_keywords")
            .update({
              current_ranking: avgPos,
              gsc_site_url: site.siteUrl,
              last_gsc_sync_at: nowIso,
              updated_at: nowIso,
            })
            .eq("id", keywordId);
          if (updErr) {
            siteErrors.push(`${site.siteUrl} keyword update ${normalized}: ${updErr.message}`);
            continue;
          }
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("seo_keywords")
            .insert({
              website_profile_id: match.website_profile_id,
              keyword: display,
              normalized_keyword: normalized,
              level: "level_3",
              current_ranking: avgPos,
              status: "monitoring",
              source: "gsc",
              gsc_site_url: site.siteUrl,
              last_gsc_sync_at: nowIso,
              updated_at: nowIso,
            })
            .select("id")
            .maybeSingle();
          if (insErr || !inserted?.id) {
            siteErrors.push(
              `${site.siteUrl} keyword insert ${normalized}: ${insErr?.message || "no id"}`,
            );
            continue;
          }
          keywordId = inserted.id as string;
        }

        // Full daily history for charts (not only latest day)
        const dailyForKeyword = metrics.filter(
          (m) => normalizeKeyword(m.query) === normalized,
        );
        for (let i = 0; i < dailyForKeyword.length; i += 200) {
          const chunk = dailyForKeyword.slice(i, i + 200).map((m) => ({
            keyword_id: keywordId,
            metric_date: m.metric_date,
            ranking_position: m.position,
            clicks: m.clicks,
            impressions: m.impressions,
            ctr: m.ctr,
            source: "gsc",
          }));
          const { error: histErr } = await supabase
            .from("seo_ranking_history")
            .upsert(chunk, { onConflict: "keyword_id,metric_date,source" });
          if (histErr) {
            siteErrors.push(
              `${site.siteUrl} history ${normalized}: ${histErr.message}`,
            );
            break;
          }
        }
        keywordsUpserted += 1;
      }
    }

    await supabase
      .from("gsc_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        sites_synced: sitesSynced,
        rows_upserted: rowsUpserted,
        keywords_upserted: keywordsUpserted,
        meta: {
          date_from: startStr,
          date_to: endStr,
          sites_listed: sites.length,
          errors: siteErrors.slice(0, 30),
        },
      })
      .eq("id", runId);

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
        meta: { errors: siteErrors.slice(0, 30) },
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
