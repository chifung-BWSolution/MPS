import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  countMonthsInclusive,
  fetchAccounts,
  fetchDailyMetricsForRange,
  getAccessToken,
  linkGoogleCampaignWebsites,
  monthEnd,
  monthStart,
  addMonths,
  syncCampaignObjectives,
  toIsoDate,
} from "../_shared/google-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const HISTORY_START = "2019-01-01";

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
  // Keep preflight cheap and reliable — never do work on OPTIONS.
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain",
      },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let requestJobId = "";

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "step");
    requestJobId = String(body.jobId || "");

    if (action === "start") {
      const { data: active } = await supabase
        .from("google_ads_backfill_jobs")
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
      const startDate = HISTORY_START;
      const startMonth = monthStart(new Date(`${startDate}T00:00:00Z`));
      const endMonth = monthStart(new Date(`${endDate}T00:00:00Z`));
      const totalMonths = countMonthsInclusive(startMonth, endMonth);
      const jobId = `bf_${Date.now()}`;

      // Snapshot ENABLED accounts for progress display
      const accessToken = await getAccessToken();
      const accounts = await fetchAccounts(accessToken, now.toISOString());
      const enabled = accounts.filter(
        (a) => !a.is_manager && a.status.toUpperCase() === "ENABLED",
      );
      await supabase.from("google_ads_accounts").upsert(accounts, {
        onConflict: "customer_id",
      });

      const enabledIds = enabled.map((a) => a.customer_id);
      const accountNameByCustomerId = new Map(
        accounts.map((a) => [a.customer_id, a.descriptive_name]),
      );
      const linkSummary = await linkGoogleCampaignWebsites(
        supabase,
        accessToken,
        enabledIds,
        accountNameByCustomerId,
        now.toISOString(),
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
        started_at: now.toISOString(),
        updated_at: now.toISOString(),
        meta: {
          enabled_customer_ids: enabledIds,
          websites_linked: linkSummary.websites_linked,
          domains_discovered: linkSummary.domains_discovered,
          domains_unmatched: linkSummary.domains_unmatched,
          campaigns_with_links: linkSummary.campaigns_with_links,
          pmax_campaigns_scanned: linkSummary.pmax_campaigns_scanned,
          pmax_campaigns_with_links: linkSummary.pmax_campaigns_with_links,
          link_errors: linkSummary.link_errors,
        },
      };
      const { error } = await supabase.from("google_ads_backfill_jobs").insert(job);
      if (error) throw new Error(error.message);
      return json({ success: true, action: "start", job });
    }

    if (action === "pause" || action === "resume" || action === "cancel") {
      const jobId = String(body.jobId || "");
      if (!jobId) throw new Error("jobId required");
      const { data: job, error } = await supabase
        .from("google_ads_backfill_jobs")
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
        .from("google_ads_backfill_jobs")
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
        .from("google_ads_backfill_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error || !data) throw new Error(error?.message || "Job not found");
      job = data as JobRow;
    } else {
      const { data, error } = await supabase
        .from("google_ads_backfill_jobs")
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
        .from("google_ads_backfill_jobs")
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
    const accessToken = await getAccessToken();

    let customerIds =
      (job.meta?.enabled_customer_ids as string[] | undefined) || [];
    if (!customerIds.length) {
      const accounts = await fetchAccounts(accessToken, nowIso);
      await supabase.from("google_ads_accounts").upsert(accounts, {
        onConflict: "customer_id",
      });
      customerIds = accounts
        .filter((a) => !a.is_manager && a.status.toUpperCase() === "ENABLED")
        .map((a) => a.customer_id);
    }

    const { daily, campaigns, errors } = await fetchDailyMetricsForRange(
      accessToken,
      customerIds,
      rangeFrom,
      rangeTo,
      nowIso,
    );

    // Upsert campaigns metadata (no metric snapshot dependency)
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
      if (error) throw new Error(`Campaign upsert: ${error.message}`);
    }

    for (let i = 0; i < daily.length; i += 500) {
      const chunk = daily.slice(i, i + 500);
      const { error } = await supabase
        .from("google_ads_campaign_daily_metrics")
        .upsert(chunk, { onConflict: "customer_id,campaign_id,metric_date" });
      if (error) throw new Error(`Daily upsert: ${error.message}`);
    }

    // Campaign metrics only in monthly backfill.
    // Ad groups / keywords / search terms are synced by the daily incremental
    // job — including them here overloads the Edge Function and causes 502s
    // on the next CORS preflight after denser months (~2020+).
    const nextMonth = addMonths(cursor, 1);
    const completedMonths = job.completed_months + 1;
    const done = nextMonth > endBound;
    const prevMeta = (job.meta || {}) as Record<string, unknown>;
    const prevErrors = Array.isArray(prevMeta.recent_errors)
      ? (prevMeta.recent_errors as string[])
      : [];

    const { data: updated, error: upErr } = await supabase
      .from("google_ads_backfill_jobs")
      .update({
        cursor_month: toIsoDate(nextMonth > endBound ? endBound : nextMonth),
        completed_months: completedMonths,
        rows_upserted: job.rows_upserted + daily.length,
        accounts_targeted: customerIds.length,
        error_count: job.error_count + errors.length,
        last_error: errors[0] || job.last_error,
        status: done ? "completed" : "running",
        finished_at: done ? nowIso : null,
        updated_at: nowIso,
        meta: {
          ...prevMeta,
          enabled_customer_ids: customerIds,
          last_month: `${rangeFrom}..${rangeTo}`,
          last_month_rows: daily.length,
          breakdown_sync: "deferred_to_incremental",
          recent_errors: [...errors, ...prevErrors].slice(0, 30),
        },
      })
      .eq("id", job.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);

    let objectiveSummary: { campaigns: number; updated: number } | undefined;
    if (done) {
      const objectiveErrors: string[] = [];
      objectiveSummary = await syncCampaignObjectives(
        supabase,
        accessToken,
        customerIds,
        objectiveErrors,
      );
      errors.push(...objectiveErrors);
      await supabase
        .from("google_ads_backfill_jobs")
        .update({
          last_error: objectiveErrors[0] || updated?.last_error,
          error_count: (updated?.error_count ?? job.error_count) + objectiveErrors.length,
          meta: {
            ...((updated?.meta || prevMeta) as Record<string, unknown>),
            objectives_campaigns: objectiveSummary.campaigns,
            objectives_updated: objectiveSummary.updated,
            recent_errors: [...errors, ...prevErrors].slice(0, 30),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    return json({
      success: true,
      action: "step",
      month: `${rangeFrom}..${rangeTo}`,
      rows: daily.length,
      errors: errors.slice(0, 10),
      objectives: objectiveSummary,
      job: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[google-ads-backfill-step]", message);
    // Persist the error so the UI shows why progress stopped (do not wipe meta).
    if (requestJobId) {
      try {
        await supabase
          .from("google_ads_backfill_jobs")
          .update({
            last_error: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", requestJobId)
          .eq("status", "running");
      } catch {
        // ignore secondary failure
      }
    }
    return json({ error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
