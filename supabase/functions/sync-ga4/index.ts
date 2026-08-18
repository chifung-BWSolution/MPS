import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchDailyChannelMetrics,
  fetchDailyPropertyMetrics,
  fetchPropertyStreamMeta,
  getGa4AccessToken,
  jsonResponse,
  listGa4Properties,
  matchWebsiteForGa4Property,
  toIsoDate,
  type Ga4WebsiteRow,
} from "../_shared/google-ga4.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const DEFAULT_LOOKBACK_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `ga4_${Date.now()}`;
  const startedMs = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const propertyErrors: string[] = [];

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    const body = await req.json().catch(() => ({}));
    const lookbackDays = Math.min(
      400,
      Math.max(7, Number(body.lookbackDays) || DEFAULT_LOOKBACK_DAYS),
    );

    await supabase.from("ga4_sync_runs").insert({
      id: runId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const end = new Date(now);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (lookbackDays - 1));
    const startStr = toIsoDate(start);
    const endStr = toIsoDate(end);

    const accessToken = await getGa4AccessToken(supabase);
    const properties = await listGa4Properties(accessToken);

    const { data: websiteRows, error: wsErr } = await supabase
      .from("webandsystem_list")
      .select("id, domain_url, website_name, ga4_property_id, status");
    if (wsErr) throw new Error(`Load websites failed: ${wsErr.message}`);
    const websites = (websiteRows || []) as Ga4WebsiteRow[];

    let rowsUpserted = 0;
    let propertiesSynced = 0;

    for (const property of properties) {
      let streamUri: string | null = null;
      let measurementId: string | null = null;
      let uris: string[] = [];
      try {
        const stream = await fetchPropertyStreamMeta(accessToken, property.propertyId);
        streamUri = stream.streamUri;
        measurementId = stream.measurementId;
        uris = stream.uris;
      } catch (err) {
        propertyErrors.push(
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
        propertyErrors.push(`${property.propertyId}: property upsert ${propErr.message}`);
        continue;
      }

      try {
        const daily = await fetchDailyPropertyMetrics(
          accessToken,
          property.propertyId,
          startStr,
          endStr,
          nowIso,
        );
        for (let i = 0; i < daily.length; i += 500) {
          const chunk = daily.slice(i, i + 500);
          const { error } = await supabase
            .from("ga4_property_daily_metrics")
            .upsert(chunk, { onConflict: "property_id,metric_date" });
          if (error) {
            propertyErrors.push(`${property.propertyId}: daily upsert ${error.message}`);
            break;
          }
          rowsUpserted += chunk.length;
        }

        const channels = await fetchDailyChannelMetrics(
          accessToken,
          property.propertyId,
          startStr,
          endStr,
          nowIso,
        );
        for (let i = 0; i < channels.length; i += 500) {
          const chunk = channels.slice(i, i + 500);
          const { error } = await supabase
            .from("ga4_channel_daily_metrics")
            .upsert(chunk, { onConflict: "property_id,metric_date,channel" });
          if (error) {
            propertyErrors.push(`${property.propertyId}: channel upsert ${error.message}`);
            break;
          }
          rowsUpserted += chunk.length;
        }
        propertiesSynced += 1;
      } catch (err) {
        propertyErrors.push(
          `${property.propertyId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await supabase
      .from("ga4_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        properties_synced: propertiesSynced,
        rows_upserted: rowsUpserted,
        meta: {
          date_from: startStr,
          date_to: endStr,
          properties_listed: properties.length,
          errors: propertyErrors.slice(0, 40),
        },
      })
      .eq("id", runId);

    return jsonResponse({
      success: true,
      run_id: runId,
      duration_ms: Date.now() - startedMs,
      properties_listed: properties.length,
      properties_synced: propertiesSynced,
      rows_upserted: rowsUpserted,
      date_from: startStr,
      date_to: endStr,
      errors: propertyErrors.slice(0, 20),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("ga4_sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: message.slice(0, 1000),
        meta: { errors: propertyErrors.slice(0, 30) },
      })
      .eq("id", runId);

    return jsonResponse({ error: message, run_id: runId }, 500);
  }
});
