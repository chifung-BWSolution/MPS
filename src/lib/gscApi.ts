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

export function invokeGscSync() {
  return invokeFunction<{
    success?: boolean;
    run_id?: string;
    duration_ms?: number;
    sites_listed?: number;
    sites_synced?: number;
    rows_upserted?: number;
    keywords_upserted?: number;
    date_from?: string;
    date_to?: string;
    errors?: string[];
  }>('sync-gsc', {});
}
