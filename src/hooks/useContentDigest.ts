/**
 * 社媒自動化營運 · 每日日報（M2-13、PRD §8.2.6／§9.2.4）
 *
 * 契約（IMPLEMENTATION-CONTRACT §5）：
 *   useContentDigests(): { digests, loading, error, refresh }
 *     → content_email_digests，order digest_date desc limit 30。
 *
 * 本 owner 頁面私有 API（IMPLEMENTATION-CONTRACT §6 content-digest）：
 *   previewContentDigest(date?)  → { action: 'preview' }  ContentDigestEmail（不寄）
 *   sendContentDigest({ date?, resend? })
 *                                → { action: 'send' | 'resend' } ContentEmailDigest
 *
 * 日報 HTML 的組裝／統計全在 `src/lib/contentDigest.ts`（前後端共用），
 * 這一層只負責呼叫 Edge Function 與讀寄送紀錄，不重算統計。
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CONTENT_FUNCTIONS,
  contentErrorMessage,
  invokeContentFunction,
  isContentSchemaMissing,
} from '@/lib/contentApi.ts';
import type {
  ContentDigestEmail,
  ContentDigestStats,
  ContentDigestStatus,
  ContentEmailDigest,
} from '@/lib/contentTypes.ts';

const DIGEST_STATUSES: ContentDigestStatus[] = ['draft', 'sending', 'sent', 'failed', 'skipped'];
const DIGEST_LIST_LIMIT = 30;

const DIGEST_SELECT =
  'id, digest_date, recipients, subject, html, summary, status, sent_at, error, created_at, updated_at';

function normalizeDigestRow(row: Record<string, unknown>): ContentEmailDigest {
  const status = String(row.status || 'draft') as ContentDigestStatus;
  return {
    id: String(row.id || ''),
    digest_date: String(row.digest_date || '').slice(0, 10),
    recipients: Array.isArray(row.recipients)
      ? row.recipients.map((item) => String(item ?? '')).filter(Boolean)
      : [],
    subject: String(row.subject || ''),
    html: String(row.html || ''),
    summary:
      row.summary && typeof row.summary === 'object'
        ? (row.summary as ContentDigestStats)
        : {},
    status: DIGEST_STATUSES.includes(status) ? status : 'draft',
    sent_at: row.sent_at ? String(row.sent_at) : null,
    error: row.error ? String(row.error) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

export interface ContentDigestsResult {
  digests: ContentEmailDigest[];
  loading: boolean;
  error: string | null;
  /** 資料表尚未建立（42P01）→ 頁面顯示「功能尚未啟用」 */
  missingSchema: boolean;
  refresh: () => Promise<void>;
}

export function useContentDigests(): ContentDigestsResult {
  const [digests, setDigests] = useState<ContentEmailDigest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from('content_email_digests')
        .select(DIGEST_SELECT)
        .order('digest_date', { ascending: false })
        .limit(DIGEST_LIST_LIMIT);

      if (queryError) throw queryError;

      setDigests(((data || []) as Record<string, unknown>[]).map(normalizeDigestRow));
      setError(null);
      setMissingSchema(false);
    } catch (err) {
      if (isContentSchemaMissing(err)) {
        setMissingSchema(true);
        setError(null);
        setDigests([]);
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

  return { digests, loading, error, missingSchema, refresh };
}

// ============================================================
// Edge Function（content-digest）— 頁面私有 API
// ============================================================

/** 預覽指定日期（預設今天）的日報；不寄信、不寫寄送紀錄。 */
export async function previewContentDigest(date?: string): Promise<ContentDigestEmail> {
  return invokeContentFunction<ContentDigestEmail>(CONTENT_FUNCTIONS.digest, {
    action: 'preview',
    ...(date ? { date } : {}),
  });
}

export interface SendContentDigestParams {
  date?: string;
  /** true = 重寄（action: 'resend'），會保留原本的寄送紀錄 */
  resend?: boolean;
}

/**
 * 寄出／重寄指定日期的日報。
 * `resend: false` → action 'send'；true → action 'resend'（同日已存在紀錄時使用）。
 */
export async function sendContentDigest(
  params: SendContentDigestParams = {},
): Promise<ContentEmailDigest> {
  const resend = params.resend === true;
  return invokeContentFunction<ContentEmailDigest>(CONTENT_FUNCTIONS.digest, {
    action: resend ? 'resend' : 'send',
    ...(params.date ? { date: params.date } : {}),
    ...(resend ? { resend: true } : {}),
  });
}
