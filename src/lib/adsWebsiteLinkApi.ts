import { supabase } from '@/lib/supabase';
import type { AdsDiscoveredDomain, AdsWebsiteSyncResult } from '@/types/adsWebsiteLink';

async function invokeAdsWebsiteLinks<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/supabase-functions-sync-ads-website-links`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || (json as { error?: string }).error) {
    throw new Error(String((json as { error?: string }).error || `${res.status} ${res.statusText}`));
  }
  return json;
}

export function invokeAdsWebsiteDomainSync() {
  return invokeAdsWebsiteLinks<AdsWebsiteSyncResult>({ action: 'sync' });
}

export function invokeAdsWebsiteRelink() {
  return invokeAdsWebsiteLinks<AdsWebsiteSyncResult>({ action: 'relink' });
}

export function invokeListUnmatchedAdsDomains() {
  return invokeAdsWebsiteLinks<{ success?: boolean; unmatched: AdsDiscoveredDomain[] }>({
    action: 'list_unmatched',
  });
}

export function invokeDismissAdsDomain(domain: string) {
  return invokeAdsWebsiteLinks<{ success?: boolean; unmatched: AdsDiscoveredDomain[] }>({
    action: 'dismiss',
    domain,
  });
}

export function invokeMarkAdsDomainLinked(domain: string, websiteProfileId: string) {
  return invokeAdsWebsiteLinks<AdsWebsiteSyncResult>({
    action: 'mark_linked',
    domain,
    websiteProfileId,
  });
}
