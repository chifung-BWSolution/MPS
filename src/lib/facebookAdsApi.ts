import { supabase } from '@/lib/supabase';
import type {
  FacebookAdsAdRow,
  FacebookAdsAdSetRow,
  FacebookAdsPlacementRow,
} from '@/types/facebookAds';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableInvokeError(status: number, message: string): boolean {
  if ([502, 503, 504, 520, 522, 524].includes(status)) return true;
  const m = message.toLowerCase();
  return (
    m.includes('bad gateway') ||
    m.includes('timeout') ||
    m.includes('network') ||
    m.includes('failed to fetch') ||
    m.includes('502') ||
    m.includes('503') ||
    m.includes('504')
  );
}

async function invokeFunction<T = Record<string, unknown>>(
  slug: string,
  body: Record<string, unknown>,
  opts?: { retries?: number; signal?: AbortSignal },
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/${slug}`;
  const retries = opts?.retries ?? 0;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: opts?.signal,
      });
      const json = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok || json.error) {
        const message = String(json.error || `${res.status} ${res.statusText}`);
        if (attempt < retries && isRetryableInvokeError(res.status, message)) {
          await sleep(1000 * (attempt + 1));
          lastError = new Error(message);
          continue;
        }
        throw new Error(message);
      }
      return json;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      const message = e instanceof Error ? e.message : String(e);
      lastError = e instanceof Error ? e : new Error(message);
      if (attempt < retries && isRetryableInvokeError(0, message)) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError || new Error('Invoke failed');
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
  }>('supabase-functions-sync-facebook-ads', {});
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

export const LIVE_BREAKDOWN_MAX_DAYS = 92;

export type LiveFacebookCampaignBreakdownsResponse = {
  success?: boolean;
  adAccountId?: string;
  campaignId?: string;
  from?: string;
  to?: string;
  fetchedAt?: string;
  supported?: boolean;
  adSets?: FacebookAdsAdSetRow[];
  ads?: FacebookAdsAdRow[];
  placements?: FacebookAdsPlacementRow[];
  errors?: string[];
  error?: string;
  max_days?: number;
};

export function invokeFacebookAdsCampaignBreakdowns(
  opts: {
    adAccountId: string;
    campaignId: string;
    from: string;
    to: string;
  },
  signal?: AbortSignal,
) {
  return invokeFunction<LiveFacebookCampaignBreakdownsResponse>(
    'supabase-functions-facebook-ads-campaign-breakdowns',
    {
      adAccountId: opts.adAccountId,
      campaignId: opts.campaignId,
      from: opts.from,
      to: opts.to,
    },
    { retries: 1, signal },
  );
}
