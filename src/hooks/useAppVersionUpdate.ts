import { useEffect, useState } from 'react';
import {
  APP_VERSION_POLL_MS,
  fetchRemoteAppVersion,
  getRunningAppVersion,
  isNewerAppVersion,
} from '@/lib/appVersion';

export function useAppVersionUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let cancelled = false;
    let found = false;
    let baseline = getRunningAppVersion();

    const check = async () => {
      if (cancelled || found) return;
      const remote = await fetchRemoteAppVersion(fetch, import.meta.env.BASE_URL);
      if (cancelled || !remote) return;
      if (!baseline) {
        baseline = remote;
        return;
      }
      if (isNewerAppVersion(baseline, remote)) {
        found = true;
        setUpdateAvailable(true);
      }
    };

    void check();
    const id = window.setInterval(() => {
      void check();
    }, APP_VERSION_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return updateAvailable;
}
