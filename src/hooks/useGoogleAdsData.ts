import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { invokeGoogleAdsIncrementalSync } from '@/lib/googleAdsApi';
import { mergeWebsitesByDomain } from '@/lib/adsWebsiteDisplay';
import { normalizeGoogleAdsObjectives, type DateRangePreset, type GoogleAdsAccount, type GoogleAdsCampaign, type GoogleAdsSyncRun } from '@/types/googleAds';

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

type CampaignMetaRow = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  advertising_channel_type: string | null;
  objectives?: string[] | null;
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

type AggRow = {
  customer_id: string;
  campaign_id: string;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

type CampaignWebsiteRow = {
  customer_id: string;
  campaign_id: string;
  campaign_row_id: string;
  matched_domain: string;
  website_profile_id: string;
};

type WebsiteBrandRow = {
  id: string;
  brand_list_id: string | null;
  brand_id: string | null;
  status: string | null;
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

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveDateRange(
  preset: DateRangePreset,
  customFrom: string,
  customTo: string,
  dataMin?: string | null,
  dataMax?: string | null,
): { from: string; to: string } {
  const today = new Date();
  const to = toIso(today);
  if (preset === 'custom') {
    return {
      from: customFrom || to,
      to: customTo || to,
    };
  }
  if (preset === 'all') {
    return {
      from: dataMin || '2019-01-01',
      to: dataMax || to,
    };
  }
  if (preset === 'ytd') {
    return { from: `${today.getUTCFullYear()}-01-01`, to };
  }
  const days = preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '90d' ? 90 : 30;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: toIso(from), to };
}

export function useGoogleAdsData(
  dateFrom: string,
  dateTo: string,
) {
  const [accounts, setAccounts] = useState<GoogleAdsAccount[]>([]);
  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [lastSync, setLastSync] = useState<GoogleAdsSyncRun | null>(null);
  const [dataMinDate, setDataMinDate] = useState<string | null>(null);
  const [dataMaxDate, setDataMaxDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [accRes, campRes, syncRes, minRes, maxRes, aggRes, websiteRes, websiteBrandRes] =
      await Promise.all([
      supabase
        .from('google_ads_accounts')
        .select('*')
        .order('descriptive_name', { ascending: true }),
      supabase.from('google_ads_campaigns').select(
        'id,customer_id,campaign_id,campaign_name,status,advertising_channel_type,objectives,last_synced_at',
      ),
      supabase
        .from('google_ads_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('google_ads_campaign_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('google_ads_campaign_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('google_ads_campaign_metrics_range', {
        p_from: dateFrom,
        p_to: dateTo,
      }),
      supabase
        .from('google_ads_campaign_websites')
        .select('customer_id,campaign_id,campaign_row_id,matched_domain,website_profile_id'),
      supabase.from('webandsystem_list').select('id, brand_list_id, brand_id, status'),
    ]);

    if (accRes.error || campRes.error || aggRes.error) {
      setError(
        accRes.error?.message ||
          campRes.error?.message ||
          aggRes.error?.message ||
          'Load failed',
      );
      setAccounts([]);
      setCampaigns([]);
      setLoading(false);
      return;
    }

    setError(null);
    const mappedAccounts = (accRes.data as AccountRow[] | null)?.map(mapAccount) ?? [];
    setAccounts(mappedAccounts);
    const nameById = new Map(mappedAccounts.map((a) => [a.customerId, a.descriptiveName]));

    const brandByWebsiteId = new Map<string, string>();
    const statusByWebsiteId = new Map<string, string>();
    for (const row of (websiteBrandRes.data as WebsiteBrandRow[] | null) ?? []) {
      const brandId = (row.brand_list_id || row.brand_id || '').trim();
      if (brandId) brandByWebsiteId.set(row.id, brandId);
      if (row.status) statusByWebsiteId.set(row.id, row.status.toLowerCase());
    }

    const websitesByCampaign = new Map<
      string,
      { domain: string; websiteProfileId: string; brandListId: string | null }[]
    >();
    for (const link of (websiteRes.data as CampaignWebsiteRow[] | null) ?? []) {
      const key =
        link.campaign_row_id || `${link.customer_id}:${link.campaign_id}`;
      const domain = (link.matched_domain || '').trim();
      const websiteProfileId = (link.website_profile_id || '').trim();
      if (!domain || !websiteProfileId) continue;
      const existing = websitesByCampaign.get(key) ?? [];
      existing.push({
        domain,
        websiteProfileId,
        brandListId: brandByWebsiteId.get(websiteProfileId) ?? null,
      });
      websitesByCampaign.set(key, existing);
    }
    for (const [key, websites] of websitesByCampaign) {
      websitesByCampaign.set(
        key,
        mergeWebsitesByDomain(websites, (candidate, current) => {
          const candidateLive = statusByWebsiteId.get(candidate.websiteProfileId) === 'live';
          const currentLive = statusByWebsiteId.get(current.websiteProfileId) === 'live';
          if (candidateLive !== currentLive) return candidateLive;
          if (!!candidate.brandListId !== !!current.brandListId) return !!candidate.brandListId;
          return false;
        }),
      );
    }

    const metaByKey = new Map(
      ((campRes.data as CampaignMetaRow[] | null) ?? []).map((c) => [c.id, c]),
    );
    const agg = (aggRes.data as AggRow[] | null) ?? [];
    const mappedCampaigns: GoogleAdsCampaign[] = agg
      .map((row) => {
        const id = `${row.customer_id}:${row.campaign_id}`;
        const meta = metaByKey.get(id);
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        return {
          id,
          customerId: row.customer_id,
          campaignId: row.campaign_id,
          campaignName: meta?.campaign_name || row.campaign_id,
          status: meta?.status || 'UNKNOWN',
          advertisingChannelType: meta?.advertising_channel_type ?? undefined,
          objectives: normalizeGoogleAdsObjectives(meta?.objectives),
          impressions,
          clicks,
          costMicros: Number(row.cost_micros) || 0,
          conversions: Number(row.conversions) || 0,
          ctr: impressions > 0 ? clicks / impressions : 0,
          lastSyncedAt: meta?.last_synced_at ?? undefined,
          accountName: nameById.get(row.customer_id),
          matchedWebsites: websitesByCampaign.get(id) ?? [],
          brandListIds: [
            ...new Set(
              (websitesByCampaign.get(id) ?? [])
                .map((w) => w.brandListId)
                .filter((brandId): brandId is string => !!brandId),
            ),
          ],
        };
      })
      .sort((a, b) => b.costMicros - a.costMicros);

    setCampaigns(mappedCampaigns);
    setDataMinDate((minRes.data as { metric_date?: string } | null)?.metric_date ?? null);
    setDataMaxDate((maxRes.data as { metric_date?: string } | null)?.metric_date ?? null);

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
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const json = await invokeGoogleAdsIncrementalSync();
      await refresh();
      return {
        ok: true as const,
        durationMs: json.duration_ms,
        campaignsSynced: json.campaigns_synced,
        dailyRows: json.daily_rows,
      };
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
    dataMinDate,
    dataMaxDate,
    loading,
    syncing,
    error,
    refresh,
    triggerSync,
  };
}
