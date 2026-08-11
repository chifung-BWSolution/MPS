import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsKeywordRow,
  GoogleAdsSearchTermRow,
} from '@/types/googleAds';

type AdGroupRpc = {
  ad_group_id: string;
  ad_group_name: string;
  status: string | null;
  ad_group_type: string | null;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

type KeywordRpc = {
  ad_group_id: string;
  criterion_id: string;
  keyword_text: string;
  match_type: string | null;
  status: string | null;
  quality_score: number | null;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

type SearchTermRpc = {
  ad_group_id: string;
  search_term: string;
  keyword_text: string | null;
  match_type: string | null;
  search_term_status: string | null;
  search_term_match_type: string | null;
  impressions: number | string;
  clicks: number | string;
  cost_micros: number | string;
  conversions: number | string;
};

function withCtr(
  impressions: number,
  clicks: number,
): { impressions: number; clicks: number; ctr: number } {
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}

export function useGoogleAdsCampaignBreakdowns(
  customerId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  const { session } = useAuth();
  const [adGroups, setAdGroups] = useState<GoogleAdsAdGroupRow[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeywordRow[]>([]);
  const [searchTerms, setSearchTerms] = useState<GoogleAdsSearchTermRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!customerId || !campaignId || !dateFrom || !dateTo) {
      setAdGroups([]);
      setKeywords([]);
      setSearchTerms([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const [agRes, kwRes, stRes] = await Promise.all([
        supabase.rpc('google_ads_ad_group_metrics_for_campaign', {
          p_customer_id: customerId,
          p_campaign_id: campaignId,
          p_from: dateFrom,
          p_to: dateTo,
        }),
        supabase.rpc('google_ads_keyword_metrics_for_campaign', {
          p_customer_id: customerId,
          p_campaign_id: campaignId,
          p_from: dateFrom,
          p_to: dateTo,
        }),
        supabase.rpc('google_ads_search_term_metrics_for_campaign', {
          p_customer_id: customerId,
          p_campaign_id: campaignId,
          p_from: dateFrom,
          p_to: dateTo,
          p_limit: 100,
        }),
      ]);

      if (agRes.error || kwRes.error || stRes.error) {
        throw new Error(
          agRes.error?.message ||
            kwRes.error?.message ||
            stRes.error?.message ||
            'Load breakdowns failed',
        );
      }

      setAdGroups(
        ((agRes.data as AdGroupRpc[] | null) ?? []).map((row) => {
          const impressions = Number(row.impressions) || 0;
          const clicks = Number(row.clicks) || 0;
          return {
            adGroupId: row.ad_group_id,
            adGroupName: row.ad_group_name || row.ad_group_id,
            status: row.status ?? undefined,
            adGroupType: row.ad_group_type ?? undefined,
            costMicros: Number(row.cost_micros) || 0,
            conversions: Number(row.conversions) || 0,
            ...withCtr(impressions, clicks),
          };
        }),
      );

      setKeywords(
        ((kwRes.data as KeywordRpc[] | null) ?? []).map((row) => {
          const impressions = Number(row.impressions) || 0;
          const clicks = Number(row.clicks) || 0;
          return {
            adGroupId: row.ad_group_id,
            criterionId: row.criterion_id,
            keywordText: row.keyword_text || row.criterion_id,
            matchType: row.match_type ?? undefined,
            status: row.status ?? undefined,
            qualityScore: row.quality_score,
            costMicros: Number(row.cost_micros) || 0,
            conversions: Number(row.conversions) || 0,
            ...withCtr(impressions, clicks),
          };
        }),
      );

      setSearchTerms(
        ((stRes.data as SearchTermRpc[] | null) ?? []).map((row) => {
          const impressions = Number(row.impressions) || 0;
          const clicks = Number(row.clicks) || 0;
          return {
            adGroupId: row.ad_group_id,
            searchTerm: row.search_term,
            keywordText: row.keyword_text ?? undefined,
            matchType: row.match_type ?? undefined,
            searchTermStatus: row.search_term_status ?? undefined,
            searchTermMatchType: row.search_term_match_type ?? undefined,
            costMicros: Number(row.cost_micros) || 0,
            conversions: Number(row.conversions) || 0,
            ...withCtr(impressions, clicks),
          };
        }),
      );
      setError(null);
    } catch (e) {
      setAdGroups([]);
      setKeywords([]);
      setSearchTerms([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [customerId, campaignId, dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  return { adGroups, keywords, searchTerms, loading, error, refresh };
}
