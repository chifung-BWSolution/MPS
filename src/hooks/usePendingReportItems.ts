import { useCallback, useEffect, useState } from 'react';
import { countPendingItems } from '@/services/reportLinkService';

export function usePendingReportItems(staffId: string | null, reportDate: string) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!staffId) {
      setCount(0);
      return;
    }
    setLoading(true);
    try {
      setCount(await countPendingItems(staffId, reportDate));
    } catch (err) {
      console.warn('[usePendingReportItems] count failed:', err);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [staffId, reportDate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { count, loading, refresh };
}
