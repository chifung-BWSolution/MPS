import { supabase } from '@/lib/supabase';
import type { AdsAdvisorRequest, AdsAdvisorResponse } from '@/types/adsAdvisor';

export async function invokeAdsCampaignAdvisor(
  input: AdsAdvisorRequest,
  opts?: { signal?: AbortSignal },
): Promise<AdsAdvisorResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('請先登入後再使用 AI 廣告顧問');
  }

  const url = `${supabaseUrl}/functions/v1/ads-campaign-advisor`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: opts?.signal,
  });

  const json = (await res.json().catch(() => ({}))) as Partial<AdsAdvisorResponse> & {
    error?: string;
  };
  const reply = typeof json.reply === 'string' ? json.reply : '';
  const message = String(json.error || `${res.status} ${res.statusText}`);

  if (!res.ok || (json.error && !reply)) {
    throw new Error(message);
  }

  return {
    reply,
    toolsUsed: Array.isArray(json.toolsUsed) ? json.toolsUsed : [],
    provider: json.provider === 'gemini' ? 'gemini' : 'grok',
    ...(json.error ? { error: json.error } : {}),
  };
}
