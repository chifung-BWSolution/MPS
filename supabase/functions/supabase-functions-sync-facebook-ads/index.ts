import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchAllAccounts,
  fetchDailyMetricsForRange,
  loadCredentials,
  probeInsightsConversions,
  toIsoDate,
  type AccountRow,
} from "../_shared/meta-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";
const LOOKBACK_DAYS = 7;

async function upsertAndPruneAccounts(
  supabase: ReturnType<typeof createClient>,
  accounts: AccountRow[],
) {
  const { error: accErr } = await supabase
    .from("facebook_ads_accounts")
    .upsert(accounts, { onConflict: "ad_account_id" });
  if (accErr) throw new Error(`Account upsert failed: ${accErr.message}`);

  const liveIds = accounts.map((a) => a.ad_account_id);
  let prunedAccounts = 0;
  const { data: existingAccs, error: listErr } = await supabase
    .from("facebook_ads_accounts")
    .select("ad_account_id");
  if (listErr) throw new Error(`Account list failed: ${listErr.message}`);
  const staleIds = ((existingAccs as { ad_account_id: string }[] | null) ?? [])
    .map((r) => r.ad_account_id)
    .filter((id) => !liveIds.includes(id));
  if (staleIds.length) {
    const { error: delErr, count } = await supabase
      .from("facebook_ads_accounts")
      .delete({ count: "exact" })
      .in("ad_account_id", staleIds);
    if (delErr) throw new Error(`Account prune failed: ${delErr.message}`);
    prunedAccounts = count ?? staleIds.length;
  }
  return prunedAccounts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `fads_${Date.now()}`;
  const startedMs = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    const body = (await req.json().catch(() => ({}))) as {
      probe?: boolean;
      adAccountId?: string;
      dateFrom?: string;
      dateTo?: string;
      businessKey?: string;
    };

    // Read-only Insights sample for debugging conversion action_type names.
    if (body.probe) {
      const credentials = loadCredentials();
      const adAccountId = String(body.adAccountId || "").trim();
      if (!adAccountId) {
        throw new Error("probe requires adAccountId");
      }
      const cred =
        credentials.find((c) => c.id === body.businessKey) || credentials[0];
      if (!cred) throw new Error("No Meta credentials configured");
      const dateTo = body.dateTo || toIsoDate(new Date());
      const from = new Date();
      from.setUTCDate(from.getUTCDate() - 6);
      const dateFrom = body.dateFrom || toIsoDate(from);
      const samples = await probeInsightsConversions(
        cred,
        adAccountId,
        dateFrom,
        dateTo,
      );
      return new Response(
        JSON.stringify({
          success: true,
          probe: true,
          business_key: cred.id,
          ad_account_id: adAccountId,
          date_from: dateFrom,
          date_to: dateTo,
          campaigns: samples,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    await supabase.from("facebook_ads_sync_runs").insert({
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

    const { credentials, accounts } = await fetchAllAccounts(nowIso);
    const prunedAccounts = await upsertAndPruneAccounts(supabase, accounts);

    const { daily, campaigns, errors } = await fetchDailyMetricsForRange(
      credentials,
      accounts,
      start,
      end,
      nowIso,
    );

    // Omit brand_list_id so manual brand assignments survive upserts
    for (let i = 0; i < campaigns.length; i += 500) {
      const chunk = campaigns.slice(i, i + 500).map((c) => ({
        ...c,
        impressions: 0,
        clicks: 0,
        spend_micros: 0,
        conversions: 0,
      }));
      const { error } = await supabase
        .from("facebook_ads_campaigns")
        .upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`Campaign upsert failed: ${error.message}`);
    }

    for (let i = 0; i < daily.length; i += 500) {
      const chunk = daily.slice(i, i + 500);
      const { error } = await supabase
        .from("facebook_ads_campaign_daily_metrics")
        .upsert(chunk, { onConflict: "ad_account_id,campaign_id,metric_date" });
      if (error) throw new Error(`Daily upsert failed: ${error.message}`);
    }

    const durationMs = Date.now() - startedMs;
    await supabase
      .from("facebook_ads_sync_runs")
      .update({
        status: errors.length && daily.length === 0 ? "error" : "success",
        finished_at: new Date().toISOString(),
        accounts_synced: accounts.length,
        campaigns_synced: campaigns.length,
        error_message: errors.length ? errors.slice(0, 10).join(" | ") : null,
        meta: {
          credentials_count: credentials.length,
          businesses: credentials.map((c) => c.name),
          business_keys: credentials.map((c) => c.id),
          date_from: start,
          date_to: end,
          daily_rows: daily.length,
          duration_ms: durationMs,
          error_count: errors.length,
          pruned_accounts: prunedAccounts,
          mode: "incremental_7d",
        },
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        credentials_count: credentials.length,
        accounts_synced: accounts.length,
        businesses: credentials.map((c) => c.name),
        business_keys: credentials.map((c) => c.id),
        campaigns_synced: campaigns.length,
        daily_rows: daily.length,
        pruned_accounts: prunedAccounts,
        date_from: start,
        date_to: end,
        duration_ms: durationMs,
        errors: errors.slice(0, 20),
        synced_at: nowIso,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-facebook-ads]", message);
    try {
      await supabase
        .from("facebook_ads_sync_runs")
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
