import { useCallback, useEffect, useState } from 'react';
import { contentErrorMessage, invokeContentFunction } from '@/lib/contentApi.ts';

export interface UseSocialAutopilotResult {
  enabled: boolean;
  updatedAt: string | null;
  loading: boolean;
  acting: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
}

const POLL_MS = 60_000;

/**
 * 自動營運總開關（存在 content_settings.feature_flags.social_autopilot）。
 * 關閉時：RSS 抓取與 cron 自動產稿停止；手動「立即生成」仍可用。
 */
export function useSocialAutopilot(): UseSocialAutopilotResult {
  const [enabled, setEnabledState] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await invokeContentFunction<{ enabled: boolean; updatedAt: string | null }>(
        'content-social',
        { action: 'autopilot_status' },
      );
      setEnabledState(status.enabled !== false);
      setUpdatedAt(status.updatedAt ?? null);
      setError(null);
    } catch (thrown) {
      setError(contentErrorMessage(thrown));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      setActing(true);
      try {
        const status = await invokeContentFunction<{ enabled: boolean; updatedAt: string | null }>(
          'content-social',
          { action: 'set_autopilot', enabled: next },
        );
        setEnabledState(status.enabled !== false);
        setUpdatedAt(status.updatedAt ?? null);
        setError(null);
      } finally {
        setActing(false);
      }
    },
    [],
  );

  return { enabled, updatedAt, loading, acting, error, refresh, setEnabled };
}
