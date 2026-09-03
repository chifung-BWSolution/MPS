import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdsAppliedStatus, AdsDiscoveredDomain, AdsSourceRef } from '@/types/adsWebsiteLink';

function mapSourceRefs(raw: unknown): AdsSourceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const platform = r.platform === 'facebook'
        ? 'facebook'
        : r.platform === 'ga4'
        ? 'ga4'
        : r.platform === 'google'
        ? 'google'
        : null;
      const accountId = String(r.accountId || '').trim();
      if (!platform || !accountId) return null;
      return {
        platform,
        accountId,
        accountName: String(r.accountName || accountId),
        campaignId: r.campaignId != null && String(r.campaignId) ? String(r.campaignId) : null,
        campaignName: r.campaignName != null && String(r.campaignName) ? String(r.campaignName) : null,
        pageId: r.pageId != null && String(r.pageId) ? String(r.pageId) : null,
        pageName: r.pageName != null && String(r.pageName) ? String(r.pageName) : null,
      } satisfies AdsSourceRef;
    })
    .filter((x): x is AdsSourceRef => !!x);
}
import {
  invokeAdsWebsiteDomainSync,
  invokeDismissAdsDomain,
  invokeListUnmatchedAdsDomains,
  invokeMarkAdsDomainLinked,
} from '@/lib/adsWebsiteLinkApi';

export type WebsiteAdsStatusMap = Record<string, AdsAppliedStatus>;

export function useAdsWebsiteLinks() {
  
  const [statusByWebsiteId, setStatusByWebsiteId] = useState<WebsiteAdsStatusMap>({});
  const [unmatched, setUnmatched] = useState<AdsDiscoveredDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const gRes = await supabase
      .from('google_ads_campaign_websites')
      .select('website_profile_id');
    const googleIds = new Set(
      ((gRes.data as { website_profile_id: string }[] | null) ?? []).map((r) => r.website_profile_id),
    );
    const map: WebsiteAdsStatusMap = {};
    for (const id of googleIds) {
      map[id] = 'google';
    }
    setStatusByWebsiteId(map);
    if (gRes.error) {
      setError(gRes.error.message);
    }
  }, []);

  const refreshUnmatched = useCallback(async () => {
    try {
      const res = await invokeListUnmatchedAdsDomains();
      setUnmatched(res.unmatched || []);
    } catch {
      // Table may not exist yet / function not deployed — fall back to direct select
      const { data } = await supabase
        .from('ads_discovered_domains')
        .select('normalized_domain, sample_url, sources, status, website_profile_id, first_seen_at, last_seen_at, source_refs')
        .eq('status', 'unmatched')
        .order('last_seen_at', { ascending: false });
      setUnmatched(
        ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
          normalizedDomain: String(r.normalized_domain || ''),
          sampleUrl: (r.sample_url as string) || null,
          sources: (Array.isArray(r.sources) ? r.sources : []) as AdsDiscoveredDomain['sources'],
          status: 'unmatched' as const,
          websiteProfileId: (r.website_profile_id as string) || null,
          firstSeenAt: (r.first_seen_at as string) || undefined,
          lastSeenAt: (r.last_seen_at as string) || undefined,
          sourceRefs: mapSourceRefs(r.source_refs),
        })),
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([refreshStatus(), refreshUnmatched()]);
    setLoading(false);
  }, [refreshStatus, refreshUnmatched]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const syncDomains = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await invokeAdsWebsiteDomainSync();
      setUnmatched(result.unmatched || []);
      await refreshStatus();
      return { ok: true as const, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return { ok: false as const, error: msg };
    } finally {
      setSyncing(false);
    }
  }, [refreshStatus]);

  const dismissDomain = useCallback(async (domain: string) => {
    try {
      const res = await invokeDismissAdsDomain(domain);
      setUnmatched(res.unmatched || []);
      return { ok: true as const };
    } catch (e) {
      // Direct update fallback
      const { error: err } = await supabase
        .from('ads_discovered_domains')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('normalized_domain', domain);
      if (err) return { ok: false as const, error: err.message };
      setUnmatched((prev) => prev.filter((d) => d.normalizedDomain !== domain));
      return { ok: true as const };
    }
  }, []);

  const markLinkedAndRelink = useCallback(
    async (domain: string, websiteProfileId: string) => {
      setSyncing(true);
      try {
        const result = await invokeMarkAdsDomainLinked(domain, websiteProfileId);
        setUnmatched(result.unmatched || []);
        await refreshStatus();
        return { ok: true as const, result };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: msg };
      } finally {
        setSyncing(false);
      }
    },
    [refreshStatus],
  );

  return {
    statusByWebsiteId,
    unmatched,
    loading,
    syncing,
    error,
    refresh,
    syncDomains,
    dismissDomain,
    markLinkedAndRelink,
  };
}

export function adsStatusLabel(status: AdsAppliedStatus | undefined): string {
  switch (status) {
    case 'google':
      return 'Google';
    default:
      return '—';
  }
}
