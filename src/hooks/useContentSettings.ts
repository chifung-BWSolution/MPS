/**
 * 社媒自動化營運 · 全域設定（M2-01、PRD §6.2.7／§9.2.4）
 *
 * 契約（IMPLEMENTATION-CONTRACT §5）：
 *   useContentSettings(): { settings, loading, error, missingSchema, refresh, save }
 *
 * 資料來源：`content_settings` 單列（id = 'default'），RLS 允許 authenticated 讀寫。
 * 缺列時沿用 `contentApi.fetchContentSettings()` 的 FALLBACK_SETTINGS（出廠
 * daily_article_limit = 0，裝好不等於開跑），不主動寫入。
 *
 * 權限只由頁面 gating（canManageSettings）；這裡不重複判斷，
 * 後端／RLS 仍是最終防線。
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  ContentApiError,
  contentErrorMessage,
  fetchContentSettings,
  isContentSchemaMissing,
  normalizeSettings,
} from '@/lib/contentApi.ts';
import { isValidDigestTime, normalizeRecipients } from '@/lib/contentDigest.ts';
import type { ContentSettings } from '@/lib/contentTypes.ts';

const SETTINGS_ROW_ID = 'default';

function integerOrZero(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

/**
 * 只允許合約內的欄位寫入 `content_settings`。
 * `id` / `created_at` / `updated_at` 由 DB 管理，不從前端送。
 */
function buildUpdatePayload(patch: Partial<ContentSettings>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (patch.model !== undefined) {
    const model = String(patch.model || '').trim();
    if (!model) throw new ContentApiError('invalid_model', '生成模型不可為空白。');
    payload.model = model;
  }

  if (patch.daily_article_limit !== undefined) {
    payload.daily_article_limit = integerOrZero(patch.daily_article_limit);
  }

  if (patch.daily_llm_call_limit !== undefined) {
    payload.daily_llm_call_limit = integerOrZero(patch.daily_llm_call_limit);
  }

  if (patch.digest_time !== undefined) {
    const digestTime = String(patch.digest_time || '').trim();
    if (!isValidDigestTime(digestTime)) {
      throw new ContentApiError('invalid_digest_time', '日報時間格式需為 HH:mm（00:00–23:59）。');
    }
    payload.digest_time = digestTime;
  }

  if (patch.digest_enabled !== undefined) {
    payload.digest_enabled = Boolean(patch.digest_enabled);
  }

  if (patch.digest_recipients !== undefined) {
    payload.digest_recipients = normalizeRecipients(patch.digest_recipients);
  }

  if (patch.breaker_mode !== undefined) {
    const allowed: ContentSettings['breaker_mode'][] = [
      'full',
      'single_score',
      'vector_only',
      'fetch_only',
    ];
    const mode = patch.breaker_mode as ContentSettings['breaker_mode'];
    if (!allowed.includes(mode)) {
      throw new ContentApiError('invalid_breaker_mode', '未知的熔斷模式。');
    }
    payload.breaker_mode = mode;
  }

  if (patch.feature_flags !== undefined) {
    payload.feature_flags =
      patch.feature_flags && typeof patch.feature_flags === 'object' ? patch.feature_flags : {};
  }

  return payload;
}

export function useContentSettings(): {
  settings: ContentSettings | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  refresh: () => Promise<void>;
  save: (patch: Partial<ContentSettings>) => Promise<void>;
} {
  const [settings, setSettings] = useState<ContentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchContentSettings();
      setSettings(next);
      setError(null);
      setMissingSchema(false);
    } catch (err) {
      if (isContentSchemaMissing(err)) {
        setMissingSchema(true);
        setError(null);
      } else {
        setError(contentErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (patch: Partial<ContentSettings>) => {
      let payload: Record<string, unknown>;
      try {
        payload = buildUpdatePayload(patch);
      } catch (err) {
        toast.error('設定未儲存', { description: contentErrorMessage(err) });
        throw err;
      }

      if (Object.keys(payload).length === 0) return;

      const { data, error: updateError } = await supabase
        .from('content_settings')
        .update(payload)
        .eq('id', SETTINGS_ROW_ID)
        .select('*');

      if (updateError) {
        const message = contentErrorMessage(updateError);
        toast.error('儲存設定失敗', { description: message });
        throw updateError;
      }

      // update 被 RLS 或「資料列不存在」擋下時不會拋錯，只會回空陣列；
      // 這種情況若不提示，使用者會以為設定已生效。
      if (!data || data.length === 0) {
        const notWritten = new ContentApiError(
          'settings_not_written',
          '設定沒有寫入。請確認 content_settings 存在 id = default 的資料列，且目前帳號有管理層權限。',
        );
        toast.error('儲存設定失敗', { description: notWritten.message });
        throw notWritten;
      }

      setSettings(normalizeSettings(data[0] as Partial<ContentSettings>));
      toast.success('已儲存內容自動化設定');
      // 重新載入以拿到 trigger 更新後的 updated_at，也確保其他欄位一致。
      await refresh();
    },
    [refresh],
  );

  return { settings, loading, error, missingSchema, refresh, save };
}
