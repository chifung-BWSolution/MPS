import { useCallback, useEffect, useState } from 'react';
import { invokeGscOAuthReveal, invokeGscOAuthStart, invokeGscOAuthStatus } from '@/lib/gscApi';
import { isGscOAuthMessage, type GscOAuthStatus } from '@/lib/gscOAuth';

export function useGscOAuth() {
  const [status, setStatus] = useState<GscOAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const next = await invokeGscOAuthStatus();
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
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isGscOAuthMessage(event.data)) return;
      void refreshStatus();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshStatus]);

  const startConsent = useCallback(async () => {
    setWorking(true);
    setError(null);
    setRevealedToken(null);
    try {
      const { authorization_url } = await invokeGscOAuthStart();
      const popup = window.open(
        authorization_url,
        'mps-gsc-oauth',
        'width=520,height=740,menubar=no,toolbar=no',
      );
      if (!popup) {
        window.location.assign(authorization_url);
      }
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setWorking(false);
    }
  }, []);

  const revealToken = useCallback(async () => {
    setWorking(true);
    try {
      const json = await invokeGscOAuthReveal();
      setRevealedToken(json.refresh_token);
      setError(null);
      return { ok: true as const, token: json.refresh_token };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setWorking(false);
    }
  }, []);

  return {
    status,
    loading,
    working,
    error,
    revealedToken,
    hideToken: () => setRevealedToken(null),
    refreshStatus,
    startConsent,
    revealToken,
  };
}
