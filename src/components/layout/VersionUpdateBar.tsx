import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppVersionUpdate } from '@/hooks/useAppVersionUpdate';
import {
  VERSION_UPDATE_ACTION_LABEL,
  VERSION_UPDATE_BAR_HEIGHT_PX,
  VERSION_UPDATE_MESSAGE,
} from '@/lib/appVersion';

export function VersionUpdateBar() {
  const updateAvailable = useAppVersionUpdate();

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-banner-h',
      updateAvailable ? `${VERSION_UPDATE_BAR_HEIGHT_PX}px` : '0px',
    );
    return () => {
      document.documentElement.style.setProperty('--app-banner-h', '0px');
    };
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[60] flex h-10 items-center justify-center gap-3 bg-amber-400 px-4 text-[13px] font-medium text-[#0d1a2d]"
    >
      <span>{VERSION_UPDATE_MESSAGE}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#0d1a2d] px-2.5 text-[12px] font-semibold text-white hover:bg-[#0d1a2d]/90 transition-colors duration-200"
      >
        <RefreshCw size={12} />
        {VERSION_UPDATE_ACTION_LABEL}
      </button>
    </div>
  );
}
