import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "";
const CLIENT_ID = Deno.env.get("GOOGLE_ADS_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") || "";
const REFRESH_TOKEN = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") || "";
const LOGIN_CUSTOMER_ID = (
  Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "5641404438"
).replace(/-/g, "");

/** Google Ads REST API version (must match a currently served version) */
const ADS_API_VERSION = "v25";

type GaqlRow = Record<string, unknown>;

async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth refresh failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function gaqlSearch(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<GaqlRow[]> {
  const url =
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;

  do {
    const payload: Record<string, unknown> = { query };
    if (pageToken) payload.pageToken = pageToken;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": DEVELOPER_TOKEN,
        "login-customer-id": LOGIN_CUSTOMER_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `GAQL failed for ${customerId} (${res.status}): ${text.slice(0, 800)}`,
      );
    }

    const json = await res.json();
    for (const r of json.results ?? []) rows.push(r);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return rows;
}

function nestGet(obj: GaqlRow, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `gads_${Date.now()}`;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (!DEVELOPER_TOKEN || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      throw new Error(
        "Missing Google Ads secrets. Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN",
      );
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    await supabase.from("google_ads_sync_runs").insert({
      id: runId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const accessToken = await getAccessToken();
    const now = new Date().toISOString();

    // Hierarchy under MCC
    const clientRows = await gaqlSearch(
      accessToken,
      LOGIN_CUSTOMER_ID,
      `
      SELECT
        customer_client.client_customer,
        customer_client.descriptive_name,
        customer_client.id,
        customer_client.manager,
        customer_client.status,
        customer_client.level,
        customer_client.currency_code,
        customer_client.time_zone
      FROM customer_client
      `,
    );

    const accounts = clientRows.map((row) => {
      const id = String(nestGet(row, "customerClient.id") ?? "");
      const isManager = Boolean(nestGet(row, "customerClient.manager"));
      return {
        customer_id: id,
        descriptive_name: String(
          nestGet(row, "customerClient.descriptiveName") ?? "",
        ),
        currency_code:
          (nestGet(row, "customerClient.currencyCode") as string) || null,
        time_zone: (nestGet(row, "customerClient.timeZone") as string) || null,
        status: String(nestGet(row, "customerClient.status") ?? "UNKNOWN"),
        is_manager: isManager,
        level: Number(nestGet(row, "customerClient.level") ?? 0),
        manager_customer_id: isManager ? null : LOGIN_CUSTOMER_ID,
        last_synced_at: now,
        updated_at: now,
      };
    });

    // Ensure MCC itself is present
    if (!accounts.some((a) => a.customer_id === LOGIN_CUSTOMER_ID)) {
      accounts.unshift({
        customer_id: LOGIN_CUSTOMER_ID,
        descriptive_name: "Franco Lee MCC",
        currency_code: null,
        time_zone: null,
        status: "ENABLED",
        is_manager: true,
        level: 0,
        manager_customer_id: null,
        last_synced_at: now,
        updated_at: now,
      });
    }

    const { error: accErr } = await supabase
      .from("google_ads_accounts")
      .upsert(accounts, { onConflict: "customer_id" });
    if (accErr) throw new Error(`Account upsert failed: ${accErr.message}`);

    const leafAccounts = accounts.filter((a) => !a.is_manager);
    let campaignsSynced = 0;
    const campaignErrors: string[] = [];

    // Last 30 days rollup per campaign
    const metricsQuery = `
      SELECT
        customer.id,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `;

    // End date for labeling
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const metricsStart = start.toISOString().slice(0, 10);
    const metricsEnd = end.toISOString().slice(0, 10);

    for (const account of leafAccounts) {
      try {
        const rows = await gaqlSearch(
          accessToken,
          account.customer_id,
          metricsQuery,
        );
        if (rows.length === 0) continue;

        const asInt = (v: unknown) => Math.round(Number(v ?? 0)) || 0;
        const campaigns = rows.map((row) => {
          const campaignId = String(nestGet(row, "campaign.id") ?? "");
          return {
            id: `${account.customer_id}:${campaignId}`,
            customer_id: account.customer_id,
            campaign_id: campaignId,
            campaign_name: String(nestGet(row, "campaign.name") ?? ""),
            status: String(nestGet(row, "campaign.status") ?? "UNKNOWN"),
            advertising_channel_type: String(
              nestGet(row, "campaign.advertisingChannelType") ?? "",
            ) || null,
            impressions: asInt(nestGet(row, "metrics.impressions")),
            clicks: asInt(nestGet(row, "metrics.clicks")),
            cost_micros: asInt(nestGet(row, "metrics.costMicros")),
            conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
            ctr: Number(nestGet(row, "metrics.ctr") ?? 0) || 0,
            // REST may return micros as float strings; column is bigint.
            average_cpc_micros: asInt(nestGet(row, "metrics.averageCpc")),
            metrics_start_date: metricsStart,
            metrics_end_date: metricsEnd,
            last_synced_at: now,
            updated_at: now,
          };
        });

        // Upsert in chunks
        for (let i = 0; i < campaigns.length; i += 200) {
          const chunk = campaigns.slice(i, i + 200);
          const { error } = await supabase
            .from("google_ads_campaigns")
            .upsert(chunk, { onConflict: "id" });
          if (error) {
            throw new Error(error.message);
          }
        }
        campaignsSynced += campaigns.length;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        campaignErrors.push(`${account.customer_id}: ${msg.slice(0, 200)}`);
      }
    }

    await supabase
      .from("google_ads_sync_runs")
      .update({
        status: campaignErrors.length && campaignsSynced === 0
          ? "error"
          : "success",
        finished_at: new Date().toISOString(),
        accounts_synced: accounts.length,
        campaigns_synced: campaignsSynced,
        error_message: campaignErrors.length
          ? campaignErrors.slice(0, 10).join(" | ")
          : null,
        meta: {
          login_customer_id: LOGIN_CUSTOMER_ID,
          leaf_accounts: leafAccounts.length,
          error_count: campaignErrors.length,
        },
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        accounts_synced: accounts.length,
        leaf_accounts: leafAccounts.length,
        campaigns_synced: campaignsSynced,
        errors: campaignErrors.slice(0, 20),
        synced_at: now,
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
