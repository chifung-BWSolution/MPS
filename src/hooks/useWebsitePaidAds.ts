import { useCallback, useEffect, useState } from 'react';
import { resolveDateRange } from '@/hooks/useGoogleAdsData';
import { fetchWebsitePaidAds } from '@/services/websitePaidAdsService';
import type { DateRangePreset } from '@/types/googleAds';
import type { WebsitePaidAdsData } from '@/types/websitePaidAds';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

const EMPTY: WebsitePaidAdsData = { googleCampaigns: [], facebookCampaigns: [] };

export function useWebsitePaidAds(
  websiteProfileId: string,
  preset: DateRangePreset = '30d',
  brandListId?: string | null,
) {
  
  const [data, setData] = useState<WebsitePaidAdsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = resolveDateRange(preset, daysAgoIso(30), todayIso());

  const refresh = useCallback(async () => {
    if (!websiteProfileId) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWebsitePaidAds(
        websiteProfileId,
        range.from,
        range.to,
        brandListId,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入付費廣告失敗');
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [websiteProfileId, brandListId, range.from, range.to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    googleCampaigns: data.googleCampaigns,
    facebookCampaigns: data.facebookCampaigns,
    loading,
    error,
    dateFrom: range.from,
    dateTo: range.to,
    refresh,
  };
}
