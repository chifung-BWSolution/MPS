import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  fetchLiveFacebookCampaignBreakdowns,
  LIVE_BREAKDOWN_MAX_DAYS,
  loadCredentials,
  resolveCredentialForCampaign,
  validateLiveBreakdownRange,
} from "../_shared/meta-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAdAccountId(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (s.startsWith("act_")) return s;
  if (/^\d+$/.test(s)) return `act_${s}`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const adAccountId = normalizeAdAccountId(String(body.adAccountId || ""));
    const campaignId = String(body.campaignId || "").trim();
    const dateFrom = String(body.from || "").trim();
    const dateTo = String(body.to || "").trim();

    if (!adAccountId || !campaignId) {
      return json({ error: "adAccountId and campaignId are required" }, 400);
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

    const credentials = loadCredentials();
    let businessKey: string | null = null;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from("facebook_ads_accounts")
        .select("business_key")
        .eq("ad_account_id", adAccountId)
        .maybeSingle();
      if (!error && data?.business_key) {
        businessKey = String(data.business_key);
      }
    }

    const cred = await resolveCredentialForCampaign(
      credentials,
      campaignId,
      businessKey,
    );
    const result = await fetchLiveFacebookCampaignBreakdowns(
      cred,
      adAccountId,
      campaignId,
      dateFrom,
      dateTo,
    );

    return json({
      success: true,
      adAccountId,
      campaignId,
      from: dateFrom,
      to: dateTo,
      fetchedAt: new Date().toISOString(),
      supported: true,
      adSets: result.adSets,
      ads: result.ads,
      placements: result.placements,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[facebook-ads-campaign-breakdowns]", message);
    return json({ error: message }, 500);
  }
});
