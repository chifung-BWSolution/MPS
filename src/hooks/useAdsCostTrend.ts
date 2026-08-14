import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { mergeWebsitesByDomain } from '@/lib/adsWebsiteDisplay';
import { todayIso } from '@/lib/adsDailySeries';
import {
  buildCostTrendBucketRanges,
  buildMonthlyBucketRanges,
  campaignTagMap,
  emptyCostTrendBuckets,
  sumCostTrendBuckets,
} from '@/lib/adsCostTrend';
import { normalizeGoogleAdsObjectives } from '@/types/googleAds';
import type { AdsPlatform, AdsTag } from '@/types/adsTags';
import type {
  AdsCostTrendBucketId,
  AdsCostTrendBucketRange,
  AdsCostTrendCampaign,
  AdsCostTrendPeriodMode,
} from '@/types/adsCostTrend';

type GoogleAggRow = {
  customer_id: string;
  campaign_id: string;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

type FacebookAggRow = {
  ad_account_id: string;
  campaign_id: string;
  impressions: number | string;
  clicks: number | string;
  spend_micros: number | string;
  conversions: number | string;
};

type GoogleCampaignRow = {
  id: string;
  customer_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objectives?: string[] | null;
};

type FacebookCampaignRow = {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string | null;
  brand_list_id: string | null;
};

type GoogleAccountRow = {
  customer_id: string;
  descriptive_name: string;
};

type FacebookAccountRow = {
  ad_account_id: string;
  account_name: string;
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

type TagRow = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
};

type AssignmentRow = {
  tag_id: string;
  platform: AdsPlatform;
  campaign_row_id: string;
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

function campaignKey(platform: AdsPlatform, accountId: string, campaignId: string): string {
  return `${platform}:${accountId}:${campaignId}`;
}

export function useAdsCostTrend(query: {
  mode: AdsCostTrendPeriodMode;
  monthFrom: string;
  monthTo: string;
}) {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<AdsCostTrendCampaign[]>([]);
  const [tags, setTags] = useState<AdsTag[]>([]);
  const [asOf, setAsOf] = useState(() => todayIso());
  const [ranges, setRanges] = useState<AdsCostTrendBucketRange[]>(() =>
    query.mode === 'monthly'
      ? buildMonthlyBucketRanges(query.monthFrom, query.monthTo, todayIso())
      : buildCostTrendBucketRanges(todayIso()),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const asOfDate = todayIso();
    const nextRanges =
      query.mode === 'monthly'
        ? buildMonthlyBucketRanges(query.monthFrom, query.monthTo, asOfDate)
        : buildCostTrendBucketRanges(asOfDate);
    const bucketIds = nextRanges.map((range) => range.id);

    try {
      const googleRangeReqs = nextRanges.map((range) =>
        supabase.rpc('google_ads_campaign_metrics_range', {
          p_from: range.from,
          p_to: range.to,
        }),
      );
      const facebookRangeReqs = nextRanges.map((range) =>
        supabase.rpc('facebook_ads_campaign_metrics_range', {
          p_from: range.from,
          p_to: range.to,
        }),
      );

      const [
        googleRangeResults,
        facebookRangeResults,
        googleCampRes,
        facebookCampRes,
        googleAccRes,
        facebookAccRes,
        websiteRes,
        websiteBrandRes,
        tagRes,
        assignRes,
      ] = await Promise.all([
        Promise.all(googleRangeReqs),
        Promise.all(facebookRangeReqs),
        fetchAllRows<GoogleCampaignRow>((from, to) =>
          supabase
            .from('google_ads_campaigns')
            .select('id,customer_id,campaign_id,campaign_name,status,objectives')
            .range(from, to),
        ).then((data) => ({ data, error: null as { message: string } | null })),
        fetchAllRows<FacebookCampaignRow>((from, to) =>
          supabase
            .from('facebook_ads_campaigns')
            .select('id,ad_account_id,campaign_id,campaign_name,status,objective,brand_list_id')
            .range(from, to),
        ).then((data) => ({ data, error: null as { message: string } | null })),
        supabase.from('google_ads_accounts').select('customer_id,descriptive_name'),
        supabase.from('facebook_ads_accounts').select('ad_account_id,account_name'),
        fetchAllRows<CampaignWebsiteRow>((from, to) =>
          supabase
            .from('google_ads_campaign_websites')
            .select('customer_id,campaign_id,campaign_row_id,matched_domain,website_profile_id')
            .range(from, to),
        ).then((data) => ({ data, error: null as { message: string } | null })),
        supabase.from('webandsystem_list').select('id, brand_list_id, brand_id, status'),
        supabase
          .from('ads_tags')
          .select('id, name, color, sort_order, is_active')
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        fetchAllRows<AssignmentRow>((from, to) =>
          supabase.from('ads_campaign_tags').select('tag_id, platform, campaign_row_id').range(from, to),
        ).then((data) => ({ data, error: null as { message: string } | null })),
      ]);

      const firstGoogleErr = googleRangeResults.find((r) => r.error)?.error;
      const firstFacebookErr = facebookRangeResults.find((r) => r.error)?.error;
      if (firstGoogleErr || firstFacebookErr || googleAccRes.error || facebookAccRes.error) {
        throw new Error(
          firstGoogleErr?.message ||
            firstFacebookErr?.message ||
            googleAccRes.error?.message ||
            facebookAccRes.error?.message ||
            'Load failed',
        );
      }

      const googleNameById = new Map(
        ((googleAccRes.data as GoogleAccountRow[] | null) ?? []).map((row) => [
          row.customer_id,
          row.descriptive_name,
        ]),
      );
      const facebookNameById = new Map(
        ((facebookAccRes.data as FacebookAccountRow[] | null) ?? []).map((row) => [
          row.ad_account_id,
          row.account_name,
        ]),
      );

      const googleMetaById = new Map(
        (googleCampRes.data ?? []).map((row) => [row.id, row]),
      );
      const facebookMetaById = new Map(
        (facebookCampRes.data ?? []).map((row) => [row.id, row]),
      );

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
      for (const link of websiteRes.data ?? []) {
        const key = link.campaign_row_id || `${link.customer_id}:${link.campaign_id}`;
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

      const mappedTags: AdsTag[] = ((tagRes.data as TagRow[] | null) ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        sortOrder: row.sort_order,
        isActive: row.is_active,
      }));
      const tagsByCampaign = campaignTagMap(
        (assignRes.data ?? []).map((row) => ({
          tagId: row.tag_id,
          platform: row.platform,
          campaignRowId: row.campaign_row_id,
        })),
        mappedTags,
      );

      const draft = new Map<
        string,
        {
          platform: AdsPlatform;
          accountId: string;
          campaignId: string;
          buckets: ReturnType<typeof emptyCostTrendBuckets>;
          impressions: number;
          clicks: number;
          conversions: number;
        }
      >();

      const upsert = (
        platform: AdsPlatform,
        accountId: string,
        campaignId: string,
        bucketId: AdsCostTrendBucketId,
        spendMicros: number,
        impressions: number,
        clicks: number,
        conversions: number,
      ) => {
        const key = campaignKey(platform, accountId, campaignId);
        const existing = draft.get(key) ?? {
          platform,
          accountId,
          campaignId,
          buckets: emptyCostTrendBuckets(bucketIds),
          impressions: 0,
          clicks: 0,
          conversions: 0,
        };
        existing.buckets[bucketId] = (existing.buckets[bucketId] ?? 0) + spendMicros;
        existing.impressions += impressions;
        existing.clicks += clicks;
        existing.conversions += conversions;
        draft.set(key, existing);
      };

      nextRanges.forEach((range, index) => {
        for (const row of (googleRangeResults[index]?.data as GoogleAggRow[] | null) ?? []) {
          upsert(
            'google',
            row.customer_id,
            row.campaign_id,
            range.id,
            Number(row.cost_micros) || 0,
            Number(row.impressions) || 0,
            Number(row.clicks) || 0,
            Number(row.conversions) || 0,
          );
        }
        for (const row of (facebookRangeResults[index]?.data as FacebookAggRow[] | null) ?? []) {
          upsert(
            'facebook',
            row.ad_account_id,
            row.campaign_id,
            range.id,
            Number(row.spend_micros) || 0,
            Number(row.impressions) || 0,
            Number(row.clicks) || 0,
            Number(row.conversions) || 0,
          );
        }
      });

      const mapped: AdsCostTrendCampaign[] = [...draft.values()].map((row) => {
        const rowId = `${row.accountId}:${row.campaignId}`;
        if (row.platform === 'google') {
          const meta = googleMetaById.get(rowId);
          const websites = websitesByCampaign.get(rowId) ?? [];
          return {
            key: campaignKey(row.platform, row.accountId, row.campaignId),
            platform: row.platform,
            accountId: row.accountId,
            campaignId: row.campaignId,
            campaignName: meta?.campaign_name || row.campaignId,
            accountName: googleNameById.get(row.accountId) || row.accountId,
            status: meta?.status || 'UNKNOWN',
            objectives: normalizeGoogleAdsObjectives(meta?.objectives),
            brandListIds: [
              ...new Set(
                websites
                  .map((website) => website.brandListId)
                  .filter((id): id is string => !!id),
              ),
            ],
            tags: tagsByCampaign.get(`google:${rowId}`) ?? [],
            buckets: row.buckets,
            totalMicros: sumCostTrendBuckets(row.buckets),
            impressions: row.impressions,
            clicks: row.clicks,
            conversions: row.conversions,
          };
        }

        const meta = facebookMetaById.get(rowId);
        const objective = (meta?.objective || '').trim();
        return {
          key: campaignKey(row.platform, row.accountId, row.campaignId),
          platform: row.platform,
          accountId: row.accountId,
          campaignId: row.campaignId,
          campaignName: meta?.campaign_name || row.campaignId,
          accountName: facebookNameById.get(row.accountId) || row.accountId,
          status: meta?.status || 'UNKNOWN',
          objectives: objective ? [objective] : [],
          brandListIds: meta?.brand_list_id ? [meta.brand_list_id] : [],
          tags: tagsByCampaign.get(`facebook:${rowId}`) ?? [],
          buckets: row.buckets,
          totalMicros: sumCostTrendBuckets(row.buckets),
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
        };
      });

      setAsOf(asOfDate);
      setRanges(nextRanges);
      setTags(mappedTags);
      setCampaigns(mapped.filter((campaign) => campaign.totalMicros > 0));
      setError(null);
    } catch (e) {
      setCampaigns([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query.mode, query.monthFrom, query.monthTo]);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  return { campaigns, tags, asOf, ranges, loading, error, refresh };
}
