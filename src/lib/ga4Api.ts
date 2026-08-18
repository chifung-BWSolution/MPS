import { supabase } from '@/lib/supabase';
import type { Ga4CountryRow, Ga4DeviceRow, Ga4PageRow, Ga4SourceRow } from '@/types/ga4';

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

export function invokeGa4Sync(lookbackDays = 90) {
  return invokeFunction<{
    success?: boolean;
    run_id?: string;
    duration_ms?: number;
    properties_listed?: number;
    properties_synced?: number;
    rows_upserted?: number;
    date_from?: string;
    date_to?: string;
    errors?: string[];
  }>('sync-ga4', { lookbackDays });
}

export type Ga4BreakdownsResponse = {
  success?: boolean;
  propertyId?: string;
  from?: string;
  to?: string;
  fetchedAt?: string;
  pages?: Ga4PageRow[];
  devices?: Ga4DeviceRow[];
  countries?: Ga4CountryRow[];
  sources?: Ga4SourceRow[];
  errors?: string[];
  error?: string;
  max_days?: number;
};

export function invokeGa4Breakdowns(
  opts: { propertyId: string; from: string; to: string },
  signal?: AbortSignal,
) {
  void signal;
  return invokeFunction<Ga4BreakdownsResponse>('supabase-functions-ga4-breakdowns', {
    propertyId: opts.propertyId,
    from: opts.from,
    to: opts.to,
  });
}
