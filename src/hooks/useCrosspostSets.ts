import { useCallback, useEffect, useState } from 'react';
import {
  deleteCrosspostSet,
  isMissingTableError,
  listCrosspostSets,
  type SavedCopySet,
} from '@/lib/crosspostApi';

export function useCrosspostSets() {
  const [sets, setSets] = useState<SavedCopySet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const rows = await listCrosspostSets();
      setSets(rows);
      setError(null);
      setAvailable(true);
    } catch (err) {
      const missing = isMissingTableError(err);
      setAvailable(!missing);
      setError(
        missing
          ? '歷史功能尚未啟用（資料表未建立）'
          : err instanceof Error
            ? err.message
            : '載入歷史失敗',
      );
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deleteCrosspostSet(id);
    setSets((prev) => prev.filter((row) => row.id !== id));
  }, []);

  return { sets, loading, error, available, refresh, remove };
}
