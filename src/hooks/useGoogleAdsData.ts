import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { GoogleAdsAccount, GoogleAdsCampaign, GoogleAdsSyncRun } from '@/types/googleAds';

type AccountRow = {
  customer_id: string;
  descriptive_name: string;
  currency_code: string | null;
  time_zone: string | null;
  status: string;
  is_manager: boolean;
  level: number;
  manager_customer_id: string | null;
  last_synced_at: string | null;
};

type CampaignRow = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string | null;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
  ctr: number | string | null;
  average_cpc_micros: number | string | null;
  metrics_start_date: string | null;
  metrics_end_date: string | null;
  last_synced_at: string | null;
};

type SyncRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  accounts_synced: number;
  campaigns_synced: number;
  error_message: string | null;
};

function mapAccount(row: AccountRow): GoogleAdsAccount {
  return {
    customerId: row.customer_id,
    descriptiveName: row.descriptive_name,
    currencyCode: row.currency_code ?? undefined,
    timeZone: row.time_zone ?? undefined,
    status: row.status,
    isManager: row.is_manager,
    level: row.level,
    managerCustomerId: row.manager_customer_id ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

function mapCampaign(row: CampaignRow, accountName?: string): GoogleAdsCampaign {
  return {
    id: row.id,
    customerId: row.customer_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    status: row.status,
    advertisingChannelType: row.advertising_channel_type ?? undefined,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    costMicros: Number(row.cost_micros) || 0,
    conversions: Number(row.conversions) || 0,
    ctr: row.ctr == null ? undefined : Number(row.ctr),
    averageCpcMicros: row.average_cpc_micros == null
      ? undefined
      : Number(row.average_cpc_micros),
    metricsStartDate: row.metrics_start_date ?? undefined,
    metricsEndDate: row.metrics_end_date ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    accountName,
  };
}

export function useGoogleAdsData() {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<GoogleAdsAccount[]>([]);
  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [lastSync, setLastSync] = useState<GoogleAdsSyncRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [accRes, campRes, syncRes] = await Promise.all([
      supabase
        .from('google_ads_accounts')
        .select('*')
        .order('descriptive_name', { ascending: true }),
      supabase
        .from('google_ads_campaigns')
        .select('*')
        .order('cost_micros', { ascending: false }),
      supabase
        .from('google_ads_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (accRes.error || campRes.error) {
      setError(accRes.error?.message || campRes.error?.message || 'Load failed');
      setAccounts([]);
      setCampaigns([]);
    } else {
      setError(null);
      const mappedAccounts = (accRes.data as AccountRow[] | null)?.map(mapAccount) ?? [];
      setAccounts(mappedAccounts);
      const nameById = new Map(
        mappedAccounts.map((a) => [a.customerId, a.descriptiveName]),
      );
      setCampaigns(
        (campRes.data as CampaignRow[] | null)?.map((row) =>
          mapCampaign(row, nameById.get(row.customer_id)),
        ) ?? [],
      );
    }

    if (syncRes.data) {
      const s = syncRes.data as SyncRow;
      setLastSync({
        id: s.id,
        startedAt: s.started_at,
        finishedAt: s.finished_at ?? undefined,
        status: s.status,
        accountsSynced: s.accounts_synced,
        campaignsSynced: s.campaigns_synced,
        errorMessage: s.error_message ?? undefined,
      });
    } else {
      setLastSync(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || supabaseAnonKey;
      const endpoints = [
        `${supabaseUrl}/functions/v1/supabase-functions-sync-google-ads`,
        `${supabaseUrl}/functions/v1/sync-google-ads`,
      ];

      let lastErr = 'Sync failed';
      let ok = false;
      for (const url of endpoints) {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: '{}',
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && !json.error) {
          ok = true;
          break;
        }
        lastErr = json.error || `${res.status} ${res.statusText}`;
      }
      if (!ok) throw new Error(String(lastErr));
      await refresh();
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  return {
    accounts,
    campaigns,
    lastSync,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  };
}
