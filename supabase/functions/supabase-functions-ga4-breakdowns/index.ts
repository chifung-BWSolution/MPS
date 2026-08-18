import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchGa4Breakdowns,
  getGa4AccessToken,
  jsonResponse,
  LIVE_GA4_BREAKDOWN_MAX_DAYS,
  normalizeGa4PropertyId,
  validateLiveGa4Range,
} from "../_shared/google-ga4.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const propertyId = normalizeGa4PropertyId(body.propertyId);
    const dateFrom = String(body.from || "").trim();
    const dateTo = String(body.to || "").trim();

    if (!propertyId) {
      return jsonResponse({ error: "propertyId is required" }, 400);
    }

    const rangeCheck = validateLiveGa4Range(dateFrom, dateTo);
    if (!rangeCheck.ok) {
      return jsonResponse(
        {
          error: rangeCheck.error,
          max_days: LIVE_GA4_BREAKDOWN_MAX_DAYS,
          from: dateFrom,
          to: dateTo,
        },
        400,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken = await getGa4AccessToken(supabase);
    const result = await fetchGa4Breakdowns(accessToken, propertyId, dateFrom, dateTo);

    return jsonResponse({
      success: true,
      propertyId,
      from: dateFrom,
      to: dateTo,
      fetchedAt: new Date().toISOString(),
      pages: result.pages,
      devices: result.devices,
      countries: result.countries,
      sources: result.sources,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ga4-breakdowns]", message);
    return jsonResponse({ error: message }, 500);
  }
});
