import { useEffect, useRef, useState } from 'react';
import { invokeGoogleAdsCampaignChangeHistory } from '@/lib/googleAdsApi';
import type { GoogleAdsChangeHistorySession } from '@/types/googleAds';

const DEBOUNCE_MS = 400;

export function useGoogleAdsCampaignChangeHistory(
  customerId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
  enabled: boolean,
) {
  const [sessions, setSessions] = useState<GoogleAdsChangeHistorySession[]>([]);
  const [queriedFrom, setQueriedFrom] = useState<string | null>(null);
  const [queriedTo, setQueriedTo] = useState<string | null>(null);
  const [clamped, setClamped] = useState(false);
  const [detailAvailable, setDetailAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !customerId || !campaignId || !dateFrom || !dateTo) {
      abortRef.current?.abort();
      if (!enabled) return;
      setSessions([]);
      setQueriedFrom(null);
      setQueriedTo(null);
      setClamped(false);
      setDetailAvailable(false);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;

      void (async () => {
        try {
          const res = await invokeGoogleAdsCampaignChangeHistory(
            { customerId, campaignId, from: dateFrom, to: dateTo },
            controller.signal,
          );
          if (requestId !== requestIdRef.current) return;
          setSessions(res.sessions ?? []);
          setQueriedFrom(res.queriedFrom ?? null);
          setQueriedTo(res.queriedTo ?? null);
          setClamped(Boolean(res.clamped));
          setDetailAvailable(Boolean(res.detailAvailable));
          setError(null);
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          if (requestId !== requestIdRef.current) return;
          setSessions([]);
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
  }, [enabled, customerId, campaignId, dateFrom, dateTo]);

  return { sessions, queriedFrom, queriedTo, clamped, detailAvailable, loading, error };
}
