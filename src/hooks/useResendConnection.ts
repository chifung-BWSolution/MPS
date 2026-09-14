import { useCallback, useEffect, useState } from 'react';
import {
  getResendStatus,
  sendTestEmail,
  type ResendStatus,
  type SendEmailResult,
} from '@/lib/resendApi';
import { DEFAULT_TEST_TO } from '@/lib/resend';

export function useResendConnection() {
  const [status, setStatus] = useState<ResendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getResendStatus();
      setStatus(next);
      setError(null);
      return next;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sendHelloWorld = useCallback(async (to = DEFAULT_TEST_TO): Promise<SendEmailResult> => {
    setSending(true);
    setError(null);
    try {
      const result = await sendTestEmail(to);
      await refresh();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    } finally {
      setSending(false);
    }
  }, [refresh]);

  return { status, loading, sending, error, refresh, sendHelloWorld };
}
