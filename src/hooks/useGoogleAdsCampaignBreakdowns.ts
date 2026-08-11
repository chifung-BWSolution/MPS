import { useEffect, useRef, useState } from 'react';
import {
  invokeGoogleAdsCampaignBreakdowns,
  LIVE_BREAKDOWN_MAX_DAYS,
} from '@/lib/googleAdsApi';
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsKeywordRow,
  GoogleAdsSearchTermRow,
} from '@/types/googleAds';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 400;

function rangeDayCount(from: string, to: string): number | null {
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to) return null;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000) + 1;
}

export function useGoogleAdsCampaignBreakdowns(
  customerId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
) {
  const [adGroups, setAdGroups] = useState<GoogleAdsAdGroupRow[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeywordRow[]>([]);
  const [searchTerms, setSearchTerms] = useState<GoogleAdsSearchTermRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const syncKey = `${customerId || ''}:${campaignId || ''}:${dateFrom}:${dateTo}`;
    if (!customerId || !campaignId || !dateFrom || !dateTo) {
      abortRef.current?.abort();
      setAdGroups([]);
      setKeywords([]);
      setSearchTerms([]);
      setLoading(false);
      setError(null);
      return;
    }

    const days = rangeDayCount(dateFrom, dateTo);
    if (days == null) {
      abortRef.current?.abort();
      setAdGroups([]);
      setKeywords([]);
      setSearchTerms([]);
      setLoading(false);
      setError('日期區間無效');
      return;
    }
    if (days > LIVE_BREAKDOWN_MAX_DAYS) {
      abortRef.current?.abort();
      setAdGroups([]);
      setKeywords([]);
      setSearchTerms([]);
      setLoading(false);
      setError(`日期區間過長，即時細項最多 ${LIVE_BREAKDOWN_MAX_DAYS} 日`);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const expectedKey = syncKey;

      void (async () => {
        try {
          const res = await invokeGoogleAdsCampaignBreakdowns(
            {
              customerId,
              campaignId,
              from: dateFrom,
              to: dateTo,
            },
            controller.signal,
          );
          if (requestId !== requestIdRef.current) return;
          if (
            expectedKey !==
            `${customerId}:${campaignId}:${dateFrom}:${dateTo}`
          ) {
            return;
          }
          setAdGroups(res.adGroups ?? []);
          setKeywords(res.keywords ?? []);
          setSearchTerms(res.searchTerms ?? []);
          const partial = (res.errors || []).filter(Boolean);
          setError(partial.length ? partial.slice(0, 2).join(' · ') : null);
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          if (requestId !== requestIdRef.current) return;
          setAdGroups([]);
          setKeywords([]);
          setSearchTerms([]);
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
  }, [customerId, campaignId, dateFrom, dateTo]);

  return {
    adGroups,
    keywords,
    searchTerms,
    loading,
    error,
  };
}
