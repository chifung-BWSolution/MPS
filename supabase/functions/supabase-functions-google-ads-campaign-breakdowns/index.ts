import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  fetchLiveCampaignBreakdowns,
  getAccessToken,
  LIVE_BREAKDOWN_MAX_DAYS,
  validateLiveBreakdownRange,
} from "../_shared/google-ads.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId || "").replace(/-/g, "").trim();
    const campaignId = String(body.campaignId || "").trim();
    const dateFrom = String(body.from || "").trim();
    const dateTo = String(body.to || "").trim();

    if (!customerId || !campaignId) {
      return json({ error: "customerId and campaignId are required" }, 400);
    }
    if (!/^\d+$/.test(campaignId)) {
      return json({ error: "campaignId must be numeric" }, 400);
    }

    const rangeCheck = validateLiveBreakdownRange(dateFrom, dateTo);
    if (!rangeCheck.ok) {
      return json(
        {
          error: rangeCheck.error,
          max_days: LIVE_BREAKDOWN_MAX_DAYS,
          from: dateFrom,
          to: dateTo,
        },
        400,
      );
    }

    const accessToken = await getAccessToken();
    const { adGroups, keywords, searchTerms, errors } =
      await fetchLiveCampaignBreakdowns(
        accessToken,
        customerId,
        campaignId,
        dateFrom,
        dateTo,
      );

    return json({
      success: true,
      customerId,
      campaignId,
      from: dateFrom,
      to: dateTo,
      fetchedAt: new Date().toISOString(),
      adGroups,
      keywords,
      searchTerms,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[google-ads-campaign-breakdowns]", message);
    return json({ error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
