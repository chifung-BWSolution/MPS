/** Shared Google Ads helpers for Edge Functions */

export const LOGIN_CUSTOMER_ID = (
  Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || "5641404438"
).replace(/-/g, "");

export const ADS_API_VERSION = "v25";
export const ACCOUNT_CONCURRENCY = 12;

export type GaqlRow = Record<string, unknown>;

export function asInt(v: unknown): number {
  return Math.round(Number(v ?? 0)) || 0;
}

export function nestGet(obj: GaqlRow, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_ADS_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google Ads OAuth secrets");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

function adsHeaders(accessToken: string): HeadersInit {
  const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") || "";
  if (!developerToken) throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN");
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "login-customer-id": LOGIN_CUSTOMER_ID,
    "Content-Type": "application/json",
  };
}

export async function gaqlQuery(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<GaqlRow[]> {
  const streamUrl =
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  const streamRes = await fetch(streamUrl, {
    method: "POST",
    headers: adsHeaders(accessToken),
    body: JSON.stringify({ query }),
  });

  if (streamRes.ok) {
    const payload = await streamRes.json();
    const rows: GaqlRow[] = [];
    if (Array.isArray(payload)) {
      for (const chunk of payload) {
        for (const r of chunk?.results ?? []) rows.push(r);
      }
    } else {
      for (const r of payload?.results ?? []) rows.push(r);
    }
    return rows;
  }

  const searchUrl =
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`;
  const rows: GaqlRow[] = [];
  let pageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: adsHeaders(accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `GAQL failed for ${customerId} (${res.status}): ${(await res.text()).slice(0, 400)}`,
      );
    }
    const json = await res.json();
    for (const r of json.results ?? []) rows.push(r);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return rows;
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => run()),
  );
  return results;
}

export type AccountRow = {
  customer_id: string;
  descriptive_name: string;
  currency_code: string | null;
  time_zone: string | null;
  status: string;
  is_manager: boolean;
  level: number;
  manager_customer_id: string | null;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchAccounts(
  accessToken: string,
  nowIso: string,
): Promise<AccountRow[]> {
  const clientRows = await gaqlQuery(
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
      descriptive_name: String(nestGet(row, "customerClient.descriptiveName") ?? ""),
      currency_code: (nestGet(row, "customerClient.currencyCode") as string) || null,
      time_zone: (nestGet(row, "customerClient.timeZone") as string) || null,
      status: String(nestGet(row, "customerClient.status") ?? "UNKNOWN"),
      is_manager: isManager,
      level: Number(nestGet(row, "customerClient.level") ?? 0),
      manager_customer_id: isManager ? null : LOGIN_CUSTOMER_ID,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };
  });

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
      last_synced_at: nowIso,
      updated_at: nowIso,
    });
  }
  return accounts;
}

export type DailyMetricRow = {
  customer_id: string;
  campaign_id: string;
  metric_date: string;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  ctr: number;
  average_cpc_micros: number;
  last_synced_at: string;
  updated_at: string;
};

export type CampaignMetaRow = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string | null;
  last_synced_at: string;
  updated_at: string;
};

export async function fetchDailyMetricsForRange(
  accessToken: string,
  customerIds: string[],
  dateFrom: string,
  dateTo: string,
  nowIso: string,
): Promise<{ daily: DailyMetricRow[]; campaigns: CampaignMetaRow[]; errors: string[] }> {
  const query = `
    SELECT
      segments.date,
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
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
  `;

  const daily: DailyMetricRow[] = [];
  const campaignMap = new Map<string, CampaignMetaRow>();
  const errors: string[] = [];

  await mapPool(customerIds, ACCOUNT_CONCURRENCY, async (customerId) => {
    try {
      const rows = await gaqlQuery(accessToken, customerId, query);
      for (const row of rows) {
        const campaignId = String(nestGet(row, "campaign.id") ?? "");
        const metricDate = String(nestGet(row, "segments.date") ?? "");
        if (!campaignId || !metricDate) continue;
        daily.push({
          customer_id: customerId,
          campaign_id: campaignId,
          metric_date: metricDate,
          impressions: asInt(nestGet(row, "metrics.impressions")),
          clicks: asInt(nestGet(row, "metrics.clicks")),
          cost_micros: asInt(nestGet(row, "metrics.costMicros")),
          conversions: Number(nestGet(row, "metrics.conversions") ?? 0) || 0,
          ctr: Number(nestGet(row, "metrics.ctr") ?? 0) || 0,
          average_cpc_micros: asInt(nestGet(row, "metrics.averageCpc")),
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
        const key = `${customerId}:${campaignId}`;
        campaignMap.set(key, {
          id: key,
          customer_id: customerId,
          campaign_id: campaignId,
          campaign_name: String(nestGet(row, "campaign.name") ?? ""),
          status: String(nestGet(row, "campaign.status") ?? "UNKNOWN"),
          advertising_channel_type:
            String(nestGet(row, "campaign.advertisingChannelType") ?? "") || null,
          last_synced_at: nowIso,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${customerId}: ${msg.slice(0, 160)}`);
    }
  });

  return { daily, campaigns: [...campaignMap.values()], errors };
}

export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export function monthEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function countMonthsInclusive(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  );
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
