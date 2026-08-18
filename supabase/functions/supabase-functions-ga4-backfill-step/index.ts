import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  addMonths,
  corsHeaders,
  countMonthsInclusive,
  fetchGa4PropertyMonth,
  fetchPropertyStreamMeta,
  GA4_HISTORY_START,
  GA4_PROPERTY_CONCURRENCY,
  getGa4AccessToken,
  listGa4Properties,
  mapPool,
  matchWebsiteForGa4Property,
  monthEnd,
  monthStart,
  toIsoDate,
  type Ga4WebsiteRow,
} from "../_shared/google-ga4.ts";

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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let requestJobId = "";

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "step");
    requestJobId = String(body.jobId || "");

    if (action === "start") {
      const { data: active } = await supabase
        .from("ga4_backfill_jobs")
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
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const endDate = toIsoDate(yesterday);
      const startDate = GA4_HISTORY_START;
      const startMonth = monthStart(new Date(`${startDate}T00:00:00Z`));
      const endMonth = monthStart(new Date(`${endDate}T00:00:00Z`));
      const totalMonths = countMonthsInclusive(startMonth, endMonth);
      const jobId = `ga4bf_${Date.now()}`;
      const nowIso = now.toISOString();

      const accessToken = await getGa4AccessToken(supabase);
      const properties = await listGa4Properties(accessToken);

      const { data: websiteRows, error: wsErr } = await supabase
        .from("webandsystem_list")
        .select("id, domain_url, website_name, ga4_property_id, status");
      if (wsErr) throw new Error(`Load websites failed: ${wsErr.message}`);
      const websites = (websiteRows || []) as Ga4WebsiteRow[];

      const catalogResults = await mapPool(properties, GA4_PROPERTY_CONCURRENCY, async (property) => {
        let streamUri: string | null = null;
        let measurementId: string | null = null;
        let uris: string[] = [];
        const errors: string[] = [];
        try {
          const stream = await fetchPropertyStreamMeta(accessToken, property.propertyId);
          streamUri = stream.streamUri;
          measurementId = stream.measurementId;
          uris = stream.uris;
        } catch (err) {
          errors.push(
            `${property.propertyId} streams: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        const match = matchWebsiteForGa4Property(
          {
            propertyId: property.propertyId,
            displayName: property.displayName,
            streamUris: uris,
          },
          websites,
        );

        const { error: propErr } = await supabase.from("ga4_properties").upsert(
          {
            property_id: property.propertyId,
            account_id: property.accountId,
            account_name: property.accountName,
            display_name: property.displayName,
            stream_uri: streamUri,
            measurement_id: measurementId,
            website_profile_id: match?.website_profile_id || null,
            matched_domain: match?.matched_domain || null,
            last_synced_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "property_id" },
        );
        if (propErr) {
          errors.push(`${property.propertyId}: property upsert ${propErr.message}`);
          return { ok: false, matched: false, propertyId: property.propertyId, errors };
        }
        return { ok: true, matched: !!match, propertyId: property.propertyId, errors };
      });

      const propertyIds = catalogResults.filter((r) => r.ok).map((r) => r.propertyId);
      const matched = catalogResults.filter((r) => r.matched).length;
      const catalogErrors = catalogResults.flatMap((r) => r.errors);

      const job = {
        id: jobId,
        status: "running",
        history_start_date: startDate,
        history_end_date: endDate,
        cursor_month: toIsoDate(startMonth),
        total_months: totalMonths,
        completed_months: 0,
        rows_upserted: 0,
        accounts_targeted: propertyIds.length,
        error_count: catalogErrors.length,
        last_error: catalogErrors[0] || null,
        started_at: nowIso,
        updated_at: nowIso,
        meta: {
          property_ids: propertyIds,
          properties_listed: properties.length,
          websites_matched: matched,
          recent_errors: catalogErrors.slice(0, 30),
        },
      };
      const { error } = await supabase.from("ga4_backfill_jobs").insert(job);
      if (error) throw new Error(error.message);
      return json({ success: true, action: "start", job });
    }

    if (action === "pause" || action === "resume" || action === "cancel") {
      const jobId = String(body.jobId || "");
      if (!jobId) throw new Error("jobId required");
      const { data: job, error } = await supabase
        .from("ga4_backfill_jobs")
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
        .from("ga4_backfill_jobs")
        .update(patch)
        .eq("id", jobId)
        .select("*")
        .single();
      if (upErr) throw new Error(upErr.message);
      return json({ success: true, action, job: updated });
    }

    const jobId = String(body.jobId || "");
    let job: JobRow | null = null;
    if (jobId) {
      const { data, error } = await supabase
        .from("ga4_backfill_jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error || !data) throw new Error(error?.message || "Job not found");
      job = data as JobRow;
    } else {
      const { data, error } = await supabase
        .from("ga4_backfill_jobs")
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
        .from("ga4_backfill_jobs")
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
    const accessToken = await getGa4AccessToken(supabase);

    let propertyIds = (job.meta?.property_ids as string[] | undefined) || [];
    if (!propertyIds.length) {
      const { data: props } = await supabase.from("ga4_properties").select("property_id");
      propertyIds = ((props || []) as Array<{ property_id: string }>).map((p) => p.property_id);
    }

    const monthResults = await mapPool(propertyIds, GA4_PROPERTY_CONCURRENCY, async (propertyId) => {
      const errors: string[] = [];
      let rows = 0;
      try {
        const { daily, channels } = await fetchGa4PropertyMonth(
          accessToken,
          propertyId,
          rangeFrom,
          rangeTo,
          nowIso,
        );
        for (let i = 0; i < daily.length; i += 500) {
          const chunk = daily.slice(i, i + 500);
          const { error } = await supabase
            .from("ga4_property_daily_metrics")
            .upsert(chunk, { onConflict: "property_id,metric_date" });
          if (error) {
            errors.push(`${propertyId}: daily upsert ${error.message}`);
            return { rows, errors };
          }
          rows += chunk.length;
        }
        for (let i = 0; i < channels.length; i += 500) {
          const chunk = channels.slice(i, i + 500);
          const { error } = await supabase
            .from("ga4_channel_daily_metrics")
            .upsert(chunk, { onConflict: "property_id,metric_date,channel" });
          if (error) {
            errors.push(`${propertyId}: channel upsert ${error.message}`);
            return { rows, errors };
          }
          rows += chunk.length;
        }
      } catch (err) {
        errors.push(`${propertyId}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return { rows, errors };
    });

    const monthErrors = monthResults.flatMap((r) => r.errors);
    const monthRows = monthResults.reduce((sum, r) => sum + r.rows, 0);

    const nextMonth = addMonths(cursor, 1);
    const completedMonths = job.completed_months + 1;
    const done = nextMonth > endBound;
    const prevMeta = (job.meta || {}) as Record<string, unknown>;
    const prevErrors = Array.isArray(prevMeta.recent_errors)
      ? (prevMeta.recent_errors as string[])
      : [];

    const { data: updated, error: upErr } = await supabase
      .from("ga4_backfill_jobs")
      .update({
        cursor_month: toIsoDate(nextMonth > endBound ? endBound : nextMonth),
        completed_months: completedMonths,
        rows_upserted: job.rows_upserted + monthRows,
        accounts_targeted: propertyIds.length,
        error_count: job.error_count + monthErrors.length,
        last_error: monthErrors[0] || job.last_error,
        status: done ? "completed" : "running",
        finished_at: done ? nowIso : null,
        updated_at: nowIso,
        meta: {
          ...prevMeta,
          property_ids: propertyIds,
          last_month: `${rangeFrom}..${rangeTo}`,
          last_month_rows: monthRows,
          recent_errors: [...monthErrors, ...prevErrors].slice(0, 30),
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
      rows: monthRows,
      errors: monthErrors.slice(0, 10),
      job: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ga4-backfill-step]", message);
    if (requestJobId) {
      try {
        await supabase
          .from("ga4_backfill_jobs")
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
