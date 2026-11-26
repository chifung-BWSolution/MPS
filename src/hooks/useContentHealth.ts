import { useCallback, useEffect, useState } from 'react';
import { contentErrorMessage, invokeContentFunction } from '@/lib/contentApi.ts';
import type { SocialAlertItem, SocialHealth } from '@/hooks/useSocialWorkspace.ts';

export interface UseContentHealthResult {
  alerts: SocialAlertItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 60_000;

/**
 * 營運健康告警（M5-04）。
 *
 * 來源是 `content-sources:health`：憑證失效、待審逾期、job dead、發布失敗、抓取來源異常。
 * 函式未部署或沒有權限時只顯示錯誤，不影響主畫面。
 */
export function useContentHealth(enabled = true): UseContentHealthResult {
  const [alerts, setAlerts] = useState<SocialAlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const health = await invokeContentFunction<SocialHealth>('content-sources', {
        action: 'health',
      });
      setAlerts(Array.isArray(health?.alerts) ? health.alerts : []);
      setError(null);
    } catch (thrown) {
      setError(contentErrorMessage(thrown));
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  return { alerts, loading, error, refresh };
}
