import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  CHANGE_HISTORY_MAX_DAYS,
  attachSessionNames,
  changeEventWindow,
  corsHeaders,
  fetchCampaignChangeHistory,
  getAccessToken,
  groupChangeEventsIntoSessions,
} from "../_shared/google-ads.ts";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    if (!/^\d+$/.test(customerId) || !/^\d+$/.test(campaignId)) {
      return json({ error: "customerId and campaignId must be numeric" }, 400);
    }
    if (!ISO_DATE_RE.test(dateFrom) || !ISO_DATE_RE.test(dateTo) || dateFrom > dateTo) {
      return json({ error: "日期區間無效" }, 400);
    }

    const detailWindow = changeEventWindow(dateFrom, dateTo);
    if (!detailWindow) {
      return json({
        success: true,
        customerId,
        campaignId,
        from: dateFrom,
        to: dateTo,
        queriedFrom: null,
        queriedTo: null,
        clamped: true,
        detailAvailable: false,
        maxDays: CHANGE_HISTORY_MAX_DAYS,
        fetchedAt: new Date().toISOString(),
        sessions: [],
      });
    }

    const accessToken = await getAccessToken();
    const events = await fetchCampaignChangeHistory(
      accessToken,
      customerId,
      campaignId,
      detailWindow.from,
      detailWindow.to,
    );
    const sessions = await attachSessionNames(
      accessToken,
      customerId,
      campaignId,
      groupChangeEventsIntoSessions(events),
    );

    return json({
      success: true,
      customerId,
      campaignId,
      from: dateFrom,
      to: dateTo,
      queriedFrom: detailWindow.from,
      queriedTo: detailWindow.to,
      clamped: detailWindow.from !== dateFrom || detailWindow.to !== dateTo,
      detailAvailable: true,
      maxDays: CHANGE_HISTORY_MAX_DAYS,
      fetchedAt: new Date().toISOString(),
      sessions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[google-ads-campaign-change-history]", message);
    return json({ error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
