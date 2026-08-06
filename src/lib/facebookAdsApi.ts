import { supabase } from '@/lib/supabase';

async function invokeFunction<T = Record<string, unknown>>(
  slug: string,
  body: Record<string, unknown>,
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/${slug}`;
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
  if (!res.ok || json.error) {
    throw new Error(String(json.error || `${res.status} ${res.statusText}`));
  }
  return json;
}

export function invokeFacebookAdsIncrementalSync() {
  return invokeFunction<{
    success?: boolean;
    duration_ms?: number;
    campaigns_synced?: number;
    daily_rows?: number;
    date_from?: string;
    date_to?: string;
    credentials_count?: number;
    businesses?: string[];
    business_keys?: string[];
    pruned_accounts?: number;
    vchannel_links?: {
      accounts_processed?: number;
      accounts_linked?: number;
      vchannels_linked?: number;
      vchannels_created?: number;
      matched_explicit?: number;
      matched_name?: number;
      link_errors?: string[];
    };
  }>('supabase-functions-sync-facebook-ads', {});
}

/** Refresh facebook_ads_accounts (optional) and sync → vchannel_accounts (platform=Facebook). */
export function invokeFacebookAdsVchannelLink(refreshFromApi = true) {
  return invokeFunction<{
    success?: boolean;
    action?: string;
    accounts_processed?: number;
    credentials_count?: number;
    businesses?: string[];
    vchannel_links?: {
      accounts_processed?: number;
      accounts_linked?: number;
      vchannels_linked?: number;
      vchannels_created?: number;
      matched_explicit?: number;
      matched_name?: number;
      link_errors?: string[];
    };
  }>('supabase-functions-sync-facebook-ads', {
    action: 'link_vchannels',
    refreshFromApi,
  });
}

export function invokeFacebookAdsBackfill(action: string, jobId?: string) {
  return invokeFunction<{
    success?: boolean;
    job?: Record<string, unknown>;
    month?: string;
    rows?: number;
    errors?: string[];
    skipped?: boolean;
    completed?: boolean;
  }>('supabase-functions-facebook-ads-backfill-step', {
    action,
    ...(jobId ? { jobId } : {}),
  });
}
