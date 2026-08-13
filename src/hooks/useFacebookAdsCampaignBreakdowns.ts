import { useEffect, useRef, useState } from 'react';
import {
  invokeFacebookAdsCampaignBreakdowns,
  LIVE_BREAKDOWN_MAX_DAYS,
} from '@/lib/facebookAdsApi';
import type {
  FacebookAdsAdRow,
  FacebookAdsAdSetRow,
  FacebookAdsPlacementRow,
} from '@/types/facebookAds';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 400;

function rangeDayCount(from: string, to: string): number | null {
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) return null;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000) + 1;
}

function emptyState() {
  return {
    adSets: [] as FacebookAdsAdSetRow[],
    ads: [] as FacebookAdsAdRow[],
    placements: [] as FacebookAdsPlacementRow[],
  };
}

export function useFacebookAdsCampaignBreakdowns(
  adAccountId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  const [adSets, setAdSets] = useState<FacebookAdsAdSetRow[]>([]);
  const [ads, setAds] = useState<FacebookAdsAdRow[]>([]);
  const [placements, setPlacements] = useState<FacebookAdsPlacementRow[]>([]);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const syncKey = `${adAccountId || ''}:${campaignId || ''}:${dateFrom}:${dateTo}`;

    const clearRows = () => {
      const empty = emptyState();
      setAdSets(empty.adSets);
      setAds(empty.ads);
      setPlacements(empty.placements);
    };

    if (!adAccountId || !campaignId || !dateFrom || !dateTo) {
      abortRef.current?.abort();
      clearRows();
      setSupported(false);
      setLoading(false);
      setError(null);
      return;
    }

    const days = rangeDayCount(dateFrom, dateTo);
    if (days == null) {
      abortRef.current?.abort();
      clearRows();
      setSupported(false);
      setLoading(false);
      setError('日期區間無效');
      return;
    }
    if (days > LIVE_BREAKDOWN_MAX_DAYS) {
      abortRef.current?.abort();
      clearRows();
      setSupported(false);
      setLoading(false);
      setError(`日期區間過長，即時細項最多 ${LIVE_BREAKDOWN_MAX_DAYS} 日`);
      return;
    }

    setLoading(true);
    setError(null);
    setSupported(true);

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const expectedKey = syncKey;

      void (async () => {
        try {
          const res = await invokeFacebookAdsCampaignBreakdowns(
            {
              adAccountId,
              campaignId,
              from: dateFrom,
              to: dateTo,
            },
            controller.signal,
          );
          if (requestId !== requestIdRef.current) return;
          if (expectedKey !== `${adAccountId}:${campaignId}:${dateFrom}:${dateTo}`) {
            return;
          }
          setSupported(res.supported !== false);
          setAdSets(res.adSets ?? []);
          setAds(res.ads ?? []);
          setPlacements(res.placements ?? []);
          const partial = (res.errors || []).filter(Boolean);
          setError(partial.length ? partial.slice(0, 2).join(' · ') : null);
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          if (requestId !== requestIdRef.current) return;
          clearRows();
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (requestId === requestIdRef.current) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [adAccountId, campaignId, dateFrom, dateTo]);

  return {
    supported,
    adSets,
    ads,
    placements,
    loading,
    error,
  };
}
