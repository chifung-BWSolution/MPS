import { supabase } from '@/lib/supabase';
import {
  bwaApiErrorMessage,
  isBwaProjectId,
  type BwaProjectYoutubeResponse,
  type BwaProjectsListResponse,
} from '@/lib/bwaProjects';

const FUNCTION_SLUG = 'bwa-projects';

type ErrorBody = { error?: string; code?: string; ok?: boolean };

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 設定，無法連線 BWA 項目 API');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('請先登入後再讀取 BWA 項目');

  const res = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_SLUG}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & ErrorBody;
  if (!res.ok || json.ok === false) {
    throw new Error(bwaApiErrorMessage(res.status, json));
  }
  return json;
}

export function fetchBwaProjects(): Promise<BwaProjectsListResponse> {
  return invoke<BwaProjectsListResponse>({ action: 'list' });
}

export function updateBwaProjectYoutube(
  id: string,
  youtubeUrl: string | null,
): Promise<BwaProjectYoutubeResponse> {
  if (!isBwaProjectId(id)) {
    return Promise.reject(new Error('項目編號不正確'));
  }
  return invoke<BwaProjectYoutubeResponse>({
    action: 'update_youtube',
    id,
    youtube_url: youtubeUrl,
  });
}
