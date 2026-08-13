import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { AdsCompareCampaignOption, AdsCompareCatalog, AdsComparePlatform } from '@/types/adsComparison';

type GoogleCampaignRow = {
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
};

type GoogleAccountRow = {
  customer_id: string;
  descriptive_name: string;
};

type FacebookCampaignRow = {
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string | null;
};

type FacebookAccountRow = {
  ad_account_id: string;
  account_name: string;
  business_name: string;
};

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

function compareCampaigns(a: AdsCompareCampaignOption, b: AdsCompareCampaignOption): number {
  const aOn = a.status.toUpperCase() === 'ENABLED' ? 0 : 1;
  const bOn = b.status.toUpperCase() === 'ENABLED' ? 0 : 1;
  if (aOn !== bOn) return aOn - bOn;
  return a.campaignName.localeCompare(b.campaignName, 'zh-Hant', {
    sensitivity: 'base',
    numeric: true,
  });
}

function campaignKey(platform: AdsComparePlatform, accountId: string, campaignId: string): string {
  return `${platform}:${accountId}:${campaignId}`;
}

const emptyCatalog: AdsCompareCatalog = {
  google: [],
  facebook: [],
  googleMinDate: null,
  googleMaxDate: null,
  facebookMinDate: null,
  facebookMaxDate: null,
};

export function useAdsCampaignCatalog() {
  const { session } = useAuth();
  const [catalog, setCatalog] = useState<AdsCompareCatalog>(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [
        googleAccounts,
        googleCampaigns,
        facebookAccounts,
        facebookCampaigns,
        googleMinRes,
        googleMaxRes,
        facebookMinRes,
        facebookMaxRes,
      ] = await Promise.all([
        fetchAllRows<GoogleAccountRow>((from, to) =>
          supabase
            .from('google_ads_accounts')
            .select('customer_id,descriptive_name')
            .order('descriptive_name', { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<GoogleCampaignRow>((from, to) =>
          supabase
            .from('google_ads_campaigns')
            .select('customer_id,campaign_id,campaign_name,status')
            .order('campaign_name', { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<FacebookAccountRow>((from, to) =>
          supabase
            .from('facebook_ads_accounts')
            .select('ad_account_id,account_name,business_name')
            .order('account_name', { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<FacebookCampaignRow>((from, to) =>
          supabase
            .from('facebook_ads_campaigns')
            .select('ad_account_id,campaign_id,campaign_name,status,objective')
            .order('campaign_name', { ascending: true })
            .range(from, to),
        ),
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
      ]);

      const googleNameById = new Map(googleAccounts.map((a) => [a.customer_id, a.descriptive_name]));
      const facebookNameById = new Map(
        facebookAccounts.map((a) => [
          a.ad_account_id,
          a.business_name ? `${a.account_name} · ${a.business_name}` : a.account_name,
        ]),
      );

      const google: AdsCompareCampaignOption[] = googleCampaigns
        .map((c) => {
          const accountName = googleNameById.get(c.customer_id) || c.customer_id;
          return {
            key: campaignKey('google', c.customer_id, c.campaign_id),
            platform: 'google' as const,
            accountId: c.customer_id,
            campaignId: c.campaign_id,
            campaignName: c.campaign_name || c.campaign_id,
            accountName,
            status: c.status || 'UNKNOWN',
          };
        })
        .sort(compareCampaigns);

      const facebook: AdsCompareCampaignOption[] = facebookCampaigns
        .map((c) => {
          const accountName = facebookNameById.get(c.ad_account_id) || c.ad_account_id;
          return {
            key: campaignKey('facebook', c.ad_account_id, c.campaign_id),
            platform: 'facebook' as const,
            accountId: c.ad_account_id,
            campaignId: c.campaign_id,
            campaignName: c.campaign_name || c.campaign_id,
            accountName,
            status: c.status || 'UNKNOWN',
            extra: c.objective || undefined,
          };
        })
        .sort(compareCampaigns);

      setCatalog({
        google,
        facebook,
        googleMinDate: (googleMinRes.data as { metric_date?: string } | null)?.metric_date ?? null,
        googleMaxDate: (googleMaxRes.data as { metric_date?: string } | null)?.metric_date ?? null,
        facebookMinDate: (facebookMinRes.data as { metric_date?: string } | null)?.metric_date ?? null,
        facebookMaxDate: (facebookMaxRes.data as { metric_date?: string } | null)?.metric_date ?? null,
      });
      setError(null);
    } catch (e) {
      setCatalog(emptyCatalog);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  return { catalog, loading, error, refresh };
}
