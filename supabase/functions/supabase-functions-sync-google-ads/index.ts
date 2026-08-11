import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchAccounts,
  fetchDailyMetricsForRange,
  getAccessToken,
  linkGoogleCampaignWebsites,
  LOGIN_CUSTOMER_ID,
  syncBreakdownDailyMetrics,
  toIsoDate,
} from "../_shared/google-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

/** Incremental sync window (days) — covers Google restatements */
const LOOKBACK_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `gads_${Date.now()}`;
  const startedMs = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    await supabase.from("google_ads_sync_runs").insert({
      id: runId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const end = toIsoDate(now);
    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - (LOOKBACK_DAYS - 1));
    const start = toIsoDate(startDate);

    const accessToken = await getAccessToken();
    const accounts = await fetchAccounts(accessToken, nowIso);
    const { error: accErr } = await supabase
      .from("google_ads_accounts")
      .upsert(accounts, { onConflict: "customer_id" });
    if (accErr) throw new Error(`Account upsert failed: ${accErr.message}`);

    const enabledIds = accounts
      .filter((a) => !a.is_manager && a.status.toUpperCase() === "ENABLED")
      .map((a) => a.customer_id);

    const { daily, campaigns, errors } = await fetchDailyMetricsForRange(
      accessToken,
      enabledIds,
      start,
      end,
      nowIso,
    );

    for (let i = 0; i < campaigns.length; i += 500) {
      const chunk = campaigns.slice(i, i + 500).map((c) => ({
        ...c,
        impressions: 0,
        clicks: 0,
        cost_micros: 0,
        conversions: 0,
      }));
      const { error } = await supabase
        .from("google_ads_campaigns")
        .upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`Campaign upsert failed: ${error.message}`);
    }

    const accountNameByCustomerId = new Map(
      accounts.map((a) => [a.customer_id, a.descriptive_name]),
    );
    const linkSummary = await linkGoogleCampaignWebsites(
      supabase,
      accessToken,
      enabledIds,
      accountNameByCustomerId,
      nowIso,
    );

    for (let i = 0; i < daily.length; i += 500) {
      const chunk = daily.slice(i, i + 500);
      const { error } = await supabase
        .from("google_ads_campaign_daily_metrics")
        .upsert(chunk, { onConflict: "customer_id,campaign_id,metric_date" });
      if (error) throw new Error(`Daily upsert failed: ${error.message}`);
    }

    const breakdown = await syncBreakdownDailyMetrics(
      supabase,
      accessToken,
      enabledIds,
      start,
      end,
      nowIso,
    );
    const allErrors = [...errors, ...breakdown.errors];

    const durationMs = Date.now() - startedMs;
    await supabase
      .from("google_ads_sync_runs")
      .update({
        status: allErrors.length && daily.length === 0 ? "error" : "success",
        finished_at: new Date().toISOString(),
        accounts_synced: accounts.length,
        campaigns_synced: campaigns.length,
        error_message: allErrors.length ? allErrors.slice(0, 10).join(" | ") : null,
        meta: {
          login_customer_id: LOGIN_CUSTOMER_ID,
          date_from: start,
          date_to: end,
          daily_rows: daily.length,
          ad_group_rows: breakdown.adGroupRows,
          keyword_rows: breakdown.keywordRows,
          search_term_rows: breakdown.searchTermRows,
          duration_ms: durationMs,
          error_count: allErrors.length,
          mode: "incremental_7d",
          websites_linked: linkSummary.websites_linked,
          domains_discovered: linkSummary.domains_discovered,
          domains_unmatched: linkSummary.domains_unmatched,
          campaigns_with_links: linkSummary.campaigns_with_links,
          link_errors: linkSummary.link_errors,
        },
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        accounts_synced: accounts.length,
        leaf_accounts: enabledIds.length,
        campaigns_synced: campaigns.length,
        daily_rows: daily.length,
        ad_group_rows: breakdown.adGroupRows,
        keyword_rows: breakdown.keywordRows,
        search_term_rows: breakdown.searchTermRows,
        date_from: start,
        date_to: end,
        duration_ms: durationMs,
        errors: allErrors.slice(0, 20),
        synced_at: nowIso,
        websites_linked: linkSummary.websites_linked,
        domains_discovered: linkSummary.domains_discovered,
        domains_unmatched: linkSummary.domains_unmatched,
        campaigns_with_links: linkSummary.campaigns_with_links,
        link_errors: linkSummary.link_errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-google-ads]", message);
    try {
      await supabase
        .from("google_ads_sync_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          error_message: message,
          meta: { duration_ms: Date.now() - startedMs },
        })
        .eq("id", runId);
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ error: message, run_id: runId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
