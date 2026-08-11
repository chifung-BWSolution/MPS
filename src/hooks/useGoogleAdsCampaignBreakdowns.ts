import { useEffect, useRef, useState } from 'react';
import {
  invokeGoogleAdsCampaignBreakdowns,
  LIVE_BREAKDOWN_MAX_DAYS,
} from '@/lib/googleAdsApi';
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsAdRow,
  GoogleAdsAssetGroupRow,
  GoogleAdsAssetRow,
  GoogleAdsBreakdownChannel,
  GoogleAdsKeywordRow,
  GoogleAdsSearchTermRow,
} from '@/types/googleAds';
import { normalizeGoogleAdsBreakdownChannel } from '@/types/googleAds';

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
    adGroups: [] as GoogleAdsAdGroupRow[],
    keywords: [] as GoogleAdsKeywordRow[],
    searchTerms: [] as GoogleAdsSearchTermRow[],
    assetGroups: [] as GoogleAdsAssetGroupRow[],
    ads: [] as GoogleAdsAdRow[],
    assets: [] as GoogleAdsAssetRow[],
  };
}

export function useGoogleAdsCampaignBreakdowns(
  customerId: string | null,
  campaignId: string | null,
  dateFrom: string,
  dateTo: string,
  channelTypeHint?: string | null,
) {
  const [adGroups, setAdGroups] = useState<GoogleAdsAdGroupRow[]>([]);
  const [keywords, setKeywords] = useState<GoogleAdsKeywordRow[]>([]);
  const [searchTerms, setSearchTerms] = useState<GoogleAdsSearchTermRow[]>([]);
  const [assetGroups, setAssetGroups] = useState<GoogleAdsAssetGroupRow[]>([]);
  const [ads, setAds] = useState<GoogleAdsAdRow[]>([]);
  const [assets, setAssets] = useState<GoogleAdsAssetRow[]>([]);
  const [channelType, setChannelType] = useState<string | null>(
    channelTypeHint ?? null,
  );
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const normalizedHint = normalizeGoogleAdsBreakdownChannel(channelTypeHint);

  useEffect(() => {
    const syncKey = `${customerId || ''}:${campaignId || ''}:${dateFrom}:${dateTo}:${channelTypeHint || ''}`;

    const clearRows = () => {
      const empty = emptyState();
      setAdGroups(empty.adGroups);
      setKeywords(empty.keywords);
      setSearchTerms(empty.searchTerms);
      setAssetGroups(empty.assetGroups);
      setAds(empty.ads);
      setAssets(empty.assets);
    };

    if (!customerId || !campaignId || !dateFrom || !dateTo) {
      abortRef.current?.abort();
      clearRows();
      setChannelType(channelTypeHint ?? null);
      setSupported(false);
      setLoading(false);
      setError(null);
      return;
    }

    // Wait for campaign meta so we know whether this channel has panels.
    // Unsupported channels: hide cards (no live call).
    if (channelTypeHint == null || channelTypeHint === '') {
      abortRef.current?.abort();
      clearRows();
      setChannelType(null);
      setSupported(false);
      setLoading(false);
      setError(null);
      return;
    }

    if (!normalizedHint) {
      abortRef.current?.abort();
      clearRows();
      setChannelType(channelTypeHint);
      setSupported(false);
      setLoading(false);
      setError(null);
      return;
    }

    const days = rangeDayCount(dateFrom, dateTo);
    if (days == null) {
      abortRef.current?.abort();
      clearRows();
      setLoading(false);
      setError('日期區間無效');
      return;
    }
    if (days > LIVE_BREAKDOWN_MAX_DAYS) {
      abortRef.current?.abort();
      clearRows();
      setLoading(false);
      setError(`日期區間過長，即時細項最多 ${LIVE_BREAKDOWN_MAX_DAYS} 日`);
      return;
    }

    setLoading(true);
    setError(null);
    setSupported(true);
    setChannelType(normalizedHint);

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
              channelType: normalizedHint,
            },
            controller.signal,
          );
          if (requestId !== requestIdRef.current) return;
          if (
            expectedKey !==
            `${customerId}:${campaignId}:${dateFrom}:${dateTo}:${channelTypeHint || ''}`
          ) {
            return;
          }
          const resolvedChannel =
            normalizeGoogleAdsBreakdownChannel(res.channelType) ||
            (normalizedHint as GoogleAdsBreakdownChannel);
          setChannelType(res.channelType || resolvedChannel);
          setSupported(res.supported !== false && !!resolvedChannel);
          setAdGroups(res.adGroups ?? []);
          setKeywords(res.keywords ?? []);
          setSearchTerms(res.searchTerms ?? []);
          setAssetGroups(res.assetGroups ?? []);
          setAds(res.ads ?? []);
          setAssets(res.assets ?? []);
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
  }, [customerId, campaignId, dateFrom, dateTo, channelTypeHint, normalizedHint]);

  return {
    channelType,
    supported,
    adGroups,
    keywords,
    searchTerms,
    assetGroups,
    ads,
    assets,
    loading,
    error,
  };
}
