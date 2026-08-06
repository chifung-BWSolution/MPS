import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addMonths,
  corsHeaders,
  countMonthsInclusive,
  fetchAllAccounts,
  fetchDailyMetricsForRange,
  linkFacebookAccountVchannels,
  loadCredentials,
  metaHistoryStartDate,
  monthEnd,
  monthStart,
  toIsoDate,
  type AccountRow,
} from "../_shared/meta-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

type JobRow = {
  id: string;
  status: string;
  history_start_date: string;
  history_end_date: string;
  cursor_month: string;
  total_months: number;
  completed_months: number;
  rows_upserted: number;
  accounts_targeted: number;
  error_count: number;
  last_error: string | null;
  meta: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "step");

    if (action === "start") {
      const { data: active } = await supabase
        .from("facebook_ads_backfill_jobs")
        .select("id,status")
        .in("status", ["pending", "running", "paused"])
        .limit(1)
        .maybeSingle();
      if (active) {
        return json({
          error: `An active job already exists (${active.id}, ${active.status}). Pause/cancel it first or resume.`,
          job_id: active.id,
        }, 409);
      }

      const now = new Date();
      const endDate = toIsoDate(now);
      const startDate = metaHistoryStartDate(now);
      const startMonth = monthStart(new Date(`${startDate}T00:00:00Z`));
      const endMonth = monthStart(new Date(`${endDate}T00:00:00Z`));
      const totalMonths = countMonthsInclusive(startMonth, endMonth);
      const jobId = `fbf_${Date.now()}`;

      const { credentials, accounts } = await fetchAllAccounts(now.toISOString());
      await supabase.from("facebook_ads_accounts").upsert(accounts, {
        onConflict: "ad_account_id",
      });
      const liveIds = accounts.map((a) => a.ad_account_id);
      const { data: existingAccs } = await supabase
        .from("facebook_ads_accounts")
        .select("ad_account_id");
      const staleIds = ((existingAccs as { ad_account_id: string }[] | null) ?? [])
        .map((r) => r.ad_account_id)
        .filter((id) => !liveIds.includes(id));
      if (staleIds.length) {
        await supabase.from("facebook_ads_accounts").delete().in("ad_account_id", staleIds);
      }

      const nowIso = now.toISOString();
      const vchannelLinks = await linkFacebookAccountVchannels(
        supabase,
        accounts,
        nowIso,
      );

      const enabled = accounts.filter(
        (a) => a.status === "ENABLED" || a.account_status === 1,
      );

      const job = {
        id: jobId,
        status: "running",
        history_start_date: startDate,
        history_end_date: endDate,
        cursor_month: toIsoDate(startMonth),
        total_months: totalMonths,
        completed_months: 0,
        rows_upserted: 0,
        accounts_targeted: enabled.length,
        error_count: 0,
        last_error: null,
        started_at: nowIso,
        updated_at: nowIso,
        meta: {
          credentials_count: credentials.length,
          businesses: credentials.map((c) => c.name),
          enabled_ad_account_ids: enabled.map((a) => a.ad_account_id),
          account_business: Object.fromEntries(
            enabled.map((a) => [a.ad_account_id, a.business_key]),
          ),
          vchannel_links: vchannelLinks,
        },
      };
      const { error } = await supabase.from("facebook_ads_backfill_jobs").insert(job);
      if (error) throw new Error(error.message);
      return json({ success: true, action: "start", job });
    }

    if (action === "pause" || action === "resume" || action === "cancel") {
      const jobId = String(body.jobId || "");
      if (!jobId) throw new Error("jobId required");
      const { data: job, error } = await supabase
        .from("facebook_ads_backfill_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error || !job) throw new Error(error?.message || "Job not found");

      let nextStatus = job.status;
      if (action === "pause" && job.status === "running") nextStatus = "paused";
      if (action === "resume" && (job.status === "paused" || job.status === "failed")) {
        nextStatus = "running";
      }
      if (action === "cancel" && ["running", "paused", "pending", "failed"].includes(job.status)) {
        nextStatus = "cancelled";
      }

      const patch: Record<string, unknown> = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      };
      if (nextStatus === "cancelled") patch.finished_at = new Date().toISOString();

      const { data: updated, error: upErr } = await supabase
        .from("facebook_ads_backfill_jobs")
        .update(patch)
        .eq("id", jobId)
        .select("*")
        .single();
      if (upErr) throw new Error(upErr.message);
      return json({ success: true, action, job: updated });
    }

    // step
    const jobId = String(body.jobId || "");
    let job: JobRow | null = null;
    if (jobId) {
      const { data, error } = await supabase
        .from("facebook_ads_backfill_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error || !data) throw new Error(error?.message || "Job not found");
      job = data as JobRow;
    } else {
      const { data, error } = await supabase
        .from("facebook_ads_backfill_jobs")
        .select("*")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      job = (data as JobRow) || null;
    }

    if (!job) throw new Error("No running backfill job");
    if (job.status !== "running") {
      return json({ success: true, action: "step", skipped: true, job });
    }

    const cursor = monthStart(new Date(`${job.cursor_month}T00:00:00Z`));
    const endBound = monthStart(new Date(`${job.history_end_date}T00:00:00Z`));
    if (cursor > endBound) {
      const { data: done } = await supabase
        .from("facebook_ads_backfill_jobs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .select("*")
        .single();
      return json({ success: true, action: "step", completed: true, job: done });
    }

    const rangeFrom = toIsoDate(cursor);
    const rangeToRaw = monthEnd(cursor);
    const historyEnd = new Date(`${job.history_end_date}T00:00:00Z`);
    const rangeToDate = rangeToRaw > historyEnd ? historyEnd : rangeToRaw;
    const rangeTo = toIsoDate(rangeToDate);

    const nowIso = new Date().toISOString();
    const credentials = loadCredentials();

    let accounts: AccountRow[] = [];
    const savedIds =
      (job.meta?.enabled_ad_account_ids as string[] | undefined) || [];
    const businessMap =
      (job.meta?.account_business as Record<string, string> | undefined) || {};

    if (savedIds.length) {
      const { data } = await supabase
        .from("facebook_ads_accounts")
        .select("*")
        .in("ad_account_id", savedIds);
      accounts = (data as AccountRow[] | null) || [];
      // Ensure business_key present for credential routing
      accounts = accounts.map((a) => ({
        ...a,
        business_key: a.business_key || businessMap[a.ad_account_id] || "",
      }));
    }

    if (!accounts.length) {
      const fetched = await fetchAllAccounts(nowIso);
      await supabase.from("facebook_ads_accounts").upsert(fetched.accounts, {
        onConflict: "ad_account_id",
      });
      accounts = fetched.accounts.filter(
        (a) => a.status === "ENABLED" || a.account_status === 1,
      );
    }

    const { daily, campaigns, errors } = await fetchDailyMetricsForRange(
      credentials,
      accounts,
      rangeFrom,
      rangeTo,
      nowIso,
    );

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
      if (error) throw new Error(`Campaign upsert: ${error.message}`);
    }

    for (let i = 0; i < daily.length; i += 500) {
      const chunk = daily.slice(i, i + 500);
      const { error } = await supabase
        .from("facebook_ads_campaign_daily_metrics")
        .upsert(chunk, { onConflict: "ad_account_id,campaign_id,metric_date" });
      if (error) throw new Error(`Daily upsert: ${error.message}`);
    }

    const nextMonth = addMonths(cursor, 1);
    const completedMonths = job.completed_months + 1;
    const done = nextMonth > endBound;
    const prevMeta = (job.meta || {}) as Record<string, unknown>;
    const prevErrors = Array.isArray(prevMeta.recent_errors)
      ? (prevMeta.recent_errors as string[])
      : [];

    const { data: updated, error: upErr } = await supabase
      .from("facebook_ads_backfill_jobs")
      .update({
        cursor_month: toIsoDate(nextMonth > endBound ? endBound : nextMonth),
        completed_months: completedMonths,
        rows_upserted: job.rows_upserted + daily.length,
        accounts_targeted: accounts.length,
        error_count: job.error_count + errors.length,
        last_error: errors[0] || job.last_error,
        status: done ? "completed" : "running",
        finished_at: done ? nowIso : null,
        updated_at: nowIso,
        meta: {
          ...prevMeta,
          enabled_ad_account_ids: accounts.map((a) => a.ad_account_id),
          account_business: Object.fromEntries(
            accounts.map((a) => [a.ad_account_id, a.business_key]),
          ),
          last_month: `${rangeFrom}..${rangeTo}`,
          last_month_rows: daily.length,
          recent_errors: [...errors, ...prevErrors].slice(0, 30),
        },
      })
      .eq("id", job.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);

    return json({
      success: true,
      action: "step",
      month: `${rangeFrom}..${rangeTo}`,
      rows: daily.length,
      errors: errors.slice(0, 10),
      job: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[facebook-ads-backfill-step]", message);
    return json({ error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
