import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  aggregateAdsMonthlySpend,
  groupAdsMonthlySpends,
  type AdsDailySpendInput,
  type AdsMonthlyExpenseMonth,
} from '@/lib/adsMonthlyExpenses';

type GoogleLinkRow = {
  customer_id: string | null;
  campaign_id: string | null;
};

type FacebookCampaignRow = {
  ad_account_id: string | null;
  campaign_id: string | null;
};

type GoogleMetricRow = {
  customer_id: string | null;
  campaign_id: string | null;
  metric_date: string | null;
  cost_micros: number | string | null;
};

type FacebookMetricRow = {
  ad_account_id: string | null;
  campaign_id: string | null;
  metric_date: string | null;
  spend_micros: number | string | null;
};

const PAGE_SIZE = 1000;
const IN_CHUNK = 100;

async function fetchAll<T>(
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function campaignsByAccount(rows: Array<{ accountId: string; campaignId: string }>): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const list = map.get(row.accountId) ?? new Set<string>();
    list.add(row.campaignId);
    map.set(row.accountId, list);
  }
  return new Map([...map.entries()].map(([accountId, ids]) => [accountId, [...ids]]));
}

async function fetchCurrencies(
  table: 'google_ads_accounts' | 'facebook_ads_accounts',
  idColumn: 'customer_id' | 'ad_account_id',
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const idsChunk of chunk(ids, IN_CHUNK)) {
    const { data, error } = await supabase
      .from(table)
      .select(`${idColumn},currency_code`)
      .in(idColumn, idsChunk);
    if (error) throw new Error(error.message);
    for (const row of (data as Array<Record<string, string | null>> | null) ?? []) {
      const id = String(row[idColumn] || '').trim();
      if (!id) continue;
      map.set(id, String(row.currency_code || '').trim());
    }
  }
  return map;
}

export type WebsiteAdsMonthlyExpenses = {
  hasCampaigns: boolean;
  platforms: { google: boolean; facebook: boolean };
  months: AdsMonthlyExpenseMonth[];
};

const EMPTY_ADS_MONTHS: WebsiteAdsMonthlyExpenses = {
  hasCampaigns: false,
  platforms: { google: false, facebook: false },
  months: [],
};

export async function fetchWebsiteAdsMonthlyExpenses(websiteId: string): Promise<WebsiteAdsMonthlyExpenses> {
  const id = websiteId.trim();
  if (!id) return EMPTY_ADS_MONTHS;

  const [websiteRes, googleLinkRes] = await Promise.all([
    supabase
      .from('webandsystem_list')
      .select('brand_list_id, brand_id')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('google_ads_campaign_websites')
      .select('customer_id, campaign_id')
      .eq('website_profile_id', id),
  ]);
  if (websiteRes.error) throw new Error(websiteRes.error.message);
  if (googleLinkRes.error) throw new Error(googleLinkRes.error.message);

  const website = websiteRes.data as { brand_list_id: string | null; brand_id: string | null } | null;
  const brandId = String(website?.brand_list_id || website?.brand_id || '').trim();
  const googleLinks = ((googleLinkRes.data as GoogleLinkRow[] | null) ?? [])
    .map((row) => ({
      accountId: String(row.customer_id || '').trim(),
      campaignId: String(row.campaign_id || '').trim(),
    }))
    .filter((row) => row.accountId && row.campaignId);

  const facebookCampaigns: Array<{ accountId: string; campaignId: string }> = [];
  const seenFacebook = new Set<string>();
  const pushFacebook = (row: FacebookCampaignRow) => {
    const accountId = String(row.ad_account_id || '').trim();
    const campaignId = String(row.campaign_id || '').trim();
    if (!accountId || !campaignId) return;
    const key = `${accountId}:${campaignId}`;
    if (seenFacebook.has(key)) return;
    seenFacebook.add(key);
    facebookCampaigns.push({ accountId, campaignId });
  };

  if (brandId) {
    const branded = await fetchAll<FacebookCampaignRow>((from, to) =>
      supabase
        .from('facebook_ads_campaigns')
        .select('ad_account_id, campaign_id')
        .eq('brand_list_id', brandId)
        .range(from, to),
    );
    branded.forEach(pushFacebook);
  }

  const platforms = {
    google: googleLinks.length > 0,
    facebook: facebookCampaigns.length > 0,
  };
  const hasCampaigns = platforms.google || platforms.facebook;
  if (!hasCampaigns) return EMPTY_ADS_MONTHS;

  const googleByAccount = campaignsByAccount(googleLinks);
  const facebookByAccount = campaignsByAccount(facebookCampaigns);
  const [googleCurrencies, facebookCurrencies] = await Promise.all([
    fetchCurrencies('google_ads_accounts', 'customer_id', [...googleByAccount.keys()]),
    fetchCurrencies('facebook_ads_accounts', 'ad_account_id', [...facebookByAccount.keys()]),
  ]);

  const daily: AdsDailySpendInput[] = [];

  for (const [customerId, campaignIds] of googleByAccount) {
    const currencyCode = googleCurrencies.get(customerId) ?? '';
    for (const idsChunk of chunk(campaignIds, IN_CHUNK)) {
      const metrics = await fetchAll<GoogleMetricRow>((from, to) =>
        supabase
          .from('google_ads_campaign_daily_metrics')
          .select('customer_id, campaign_id, metric_date, cost_micros')
          .eq('customer_id', customerId)
          .in('campaign_id', idsChunk)
          .gt('cost_micros', 0)
          .range(from, to),
      );
      for (const row of metrics) {
        daily.push({
          platform: 'google',
          accountId: String(row.customer_id || customerId),
          campaignId: String(row.campaign_id || ''),
          metricDate: String(row.metric_date || ''),
          spendMicros: Number(row.cost_micros) || 0,
          currencyCode,
        });
      }
    }
  }

  for (const [accountId, campaignIds] of facebookByAccount) {
    const currencyCode = facebookCurrencies.get(accountId) ?? '';
    for (const idsChunk of chunk(campaignIds, IN_CHUNK)) {
      const metrics = await fetchAll<FacebookMetricRow>((from, to) =>
        supabase
          .from('facebook_ads_campaign_daily_metrics')
          .select('ad_account_id, campaign_id, metric_date, spend_micros')
          .eq('ad_account_id', accountId)
          .in('campaign_id', idsChunk)
          .gt('spend_micros', 0)
          .range(from, to),
      );
      for (const row of metrics) {
        daily.push({
          platform: 'facebook',
          accountId: String(row.ad_account_id || accountId),
          campaignId: String(row.campaign_id || ''),
          metricDate: String(row.metric_date || ''),
          spendMicros: Number(row.spend_micros) || 0,
          currencyCode,
        });
      }
    }
  }

  return {
    hasCampaigns: true,
    platforms,
    months: groupAdsMonthlySpends(aggregateAdsMonthlySpend(daily)),
  };
}

export function useWebsiteAdsMonthlyExpenses(websiteId: string) {
  const [months, setMonths] = useState<AdsMonthlyExpenseMonth[]>([]);
  const [platforms, setPlatforms] = useState({ google: false, facebook: false });
  const [hasCampaigns, setHasCampaigns] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = websiteId.trim();
    if (!id) {
      setMonths([]);
      setPlatforms({ google: false, facebook: false });
      setHasCampaigns(false);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchWebsiteAdsMonthlyExpenses(id)
      .then((result) => {
        if (cancelled) return;
        setHasCampaigns(result.hasCampaigns);
        setPlatforms(result.platforms);
        setMonths(result.months);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setHasCampaigns(false);
        setPlatforms({ google: false, facebook: false });
        setMonths([]);
        setError(e instanceof Error ? e.message : '載入廣告月費失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [websiteId]);

  return { months, platforms, hasCampaigns, loading, error };
}
