import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isContentSchemaMissing } from '@/lib/contentApi.ts';

export interface ContentInboxCounts {
  pendingReview: number;
  manualPending: number;
  failed: number;
  held: number;
  missingKeywords: number;
}

const EMPTY_COUNTS: ContentInboxCounts = {
  pendingReview: 0,
  manualPending: 0,
  failed: 0,
  held: 0,
  missingKeywords: 0,
};

async function countRows(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await build();
  if (error) throw error;
  return count ?? 0;
}

/**
 * 收件匣數字（M3-14）：頂部「待審 N · 待回填 M · 失敗 K」。
 * 資料表不存在時回傳 0，不讓外殼因此白屏。
 */
export function useContentInbox(enabled = true) {
  const [counts, setCounts] = useState<ContentInboxCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const articles = () =>
        supabase.from('content_articles').select('id', { count: 'exact', head: true });
      const slots = () =>
        supabase.from('content_slots').select('id', { count: 'exact', head: true });

      const [pendingReview, manualPending, failed, held, missingKeywords] = await Promise.all([
        countRows(() => articles().in('status', ['pending_review', 'changes_requested'])),
        countRows(() => articles().eq('status', 'publishing')),
        countRows(() => articles().in('status', ['publish_failed', 'verify_failed'])),
        countRows(() => articles().eq('status', 'held')),
        countRows(() => slots().is('keyword_id', null).in('status', ['planned', 'generating'])),
      ]);

      setCounts({ pendingReview, manualPending, failed, held, missingKeywords });
      setAvailable(true);
    } catch (error) {
      if (isContentSchemaMissing(error)) {
        setAvailable(false);
        setCounts(EMPTY_COUNTS);
      } else {
        setCounts(EMPTY_COUNTS);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { counts, loading, available, refresh };
}
