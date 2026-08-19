import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { invokeFacebookAdsIncrementalSync } from '@/lib/facebookAdsApi';
import { resolveFacebookBrandListId } from '@/lib/facebookAdsBrand';
import { parseActionBreakdown } from '@/lib/facebookAdsConversions';
import type {
  DateRangePreset,
  FacebookAdsAccount,
  FacebookAdsCampaign,
  FacebookAdsSyncRun,
} from '@/types/facebookAds';

type AccountRow = {
  ad_account_id: string;
  account_name: string;
  currency_code: string | null;
  time_zone: string | null;
  status: string;
  account_status: number | null;
  business_key: string;
  business_name: string;
  brand_list_id?: string | null;
  last_synced_at: string | null;
};

type CampaignMetaRow = {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string | null;
  brand_list_id: string | null;
  last_synced_at: string | null;
};

type BrandRow = {
  id: string;
  brand_code: string;
  display_name: string;
};

type SyncRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  accounts_synced: number;
  campaigns_synced: number;
  error_message: string | null;
  meta?: {
    businesses?: string[];
    credentials_count?: number;
  } | null;
};

type AggRow = {
  ad_account_id: string;
  campaign_id: string;
  impressions: number | string;
  clicks: number | string;
  spend_micros: number | string;
  conversions: number | string;
  action_breakdown?: unknown;
};

function mapAccount(row: AccountRow): FacebookAdsAccount {
  return {
    adAccountId: row.ad_account_id,
    accountName: row.account_name,
    currencyCode: row.currency_code ?? undefined,
    timeZone: row.time_zone ?? undefined,
    status: row.status,
    accountStatus: row.account_status ?? undefined,
    businessKey: row.business_key,
    businessName: row.business_name,
    brandListId: row.brand_list_id ?? null,
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
      from: dataMin || '2023-01-01',
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

export function useFacebookAdsData(dateFrom: string, dateTo: string) {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<FacebookAdsAccount[]>([]);
  const [campaigns, setCampaigns] = useState<FacebookAdsCampaign[]>([]);
  const [lastSync, setLastSync] = useState<FacebookAdsSyncRun | null>(null);
  const [dataMinDate, setDataMinDate] = useState<string | null>(null);
  const [dataMaxDate, setDataMaxDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [accRes, campRes, brandRes, syncRes, minRes, maxRes, aggRes] = await Promise.all([
      supabase
        .from('facebook_ads_accounts')
        .select('*')
        .order('account_name', { ascending: true }),
      supabase.from('facebook_ads_campaigns').select(
        'id,ad_account_id,campaign_id,campaign_name,status,objective,brand_list_id,last_synced_at',
      ),
      supabase
        .from('brand_list')
        .select('id, brand_code, display_name')
        .eq('is_active', true)
        .order('brand_code'),
      supabase
        .from('facebook_ads_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('facebook_ads_campaign_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('facebook_ads_campaign_daily_metrics')
        .select('metric_date')
        .order('metric_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('facebook_ads_campaign_metrics_range', {
        p_from: dateFrom,
        p_to: dateTo,
      }),
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
    const nameById = new Map(mappedAccounts.map((a) => [a.adAccountId, a.accountName]));
    const bizById = new Map(mappedAccounts.map((a) => [a.adAccountId, a.businessName]));

    const brandById = new Map(
      ((brandRes.data as BrandRow[] | null) ?? []).map((b) => [b.id, b]),
    );
    const brandIdByCode = new Map(
      ((brandRes.data as BrandRow[] | null) ?? []).map((b) => [b.brand_code, b.id]),
    );
    const accountById = new Map(mappedAccounts.map((a) => [a.adAccountId, a]));
    const metaByKey = new Map(
      ((campRes.data as CampaignMetaRow[] | null) ?? []).map((c) => [c.id, c]),
    );
    const agg = (aggRes.data as AggRow[] | null) ?? [];
    const mappedCampaigns: FacebookAdsCampaign[] = agg
      .map((row) => {
        const id = `${row.ad_account_id}:${row.campaign_id}`;
        const meta = metaByKey.get(id);
        const account = accountById.get(row.ad_account_id);
        const brandId = resolveFacebookBrandListId(
          meta?.brand_list_id,
          account?.brandListId,
          {
            accountName: account?.accountName,
            businessName: account?.businessName,
            businessKey: account?.businessKey,
          },
          brandIdByCode,
        );
        const brand = brandId ? brandById.get(brandId) : undefined;
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        return {
          id,
          adAccountId: row.ad_account_id,
          campaignId: row.campaign_id,
          campaignName: meta?.campaign_name || row.campaign_id,
          status: meta?.status || 'UNKNOWN',
          objective: meta?.objective ?? undefined,
          brandListId: brandId,
          brandCode: brand?.brand_code,
          brandDisplayName: brand?.display_name,
          impressions,
          clicks,
          spendMicros: Number(row.spend_micros) || 0,
          conversions: Number(row.conversions) || 0,
          actionBreakdown: parseActionBreakdown(row.action_breakdown),
          ctr: impressions > 0 ? clicks / impressions : 0,
          lastSyncedAt: meta?.last_synced_at ?? undefined,
          accountName: nameById.get(row.ad_account_id),
          businessName: bizById.get(row.ad_account_id),
        };
      })
      .sort((a, b) => b.spendMicros - a.spendMicros);

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
        businesses: s.meta?.businesses,
        credentialsCount: s.meta?.credentials_count,
      });
    } else {
      setLastSync(null);
    }

    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const json = await invokeFacebookAdsIncrementalSync();
      await refresh();
      return {
        ok: true as const,
        durationMs: json.duration_ms,
        campaignsSynced: json.campaigns_synced,
        dailyRows: json.daily_rows,
        credentialsCount: json.credentials_count,
        businesses: json.businesses,
        prunedAccounts: json.pruned_accounts,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const updateCampaignBrand = useCallback(
    async (campaignId: string, brandListId: string | null) => {
      const { error: updErr } = await supabase
        .from('facebook_ads_campaigns')
        .update({
          brand_list_id: brandListId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
      if (updErr) return { ok: false as const, error: updErr.message };
      await refresh();
      return { ok: true as const };
    },
    [refresh],
  );

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
    updateCampaignBrand,
  };
}
