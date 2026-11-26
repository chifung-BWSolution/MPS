import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FramerSiteSnapshot, SourceType } from '@/types/readdyFramer';

interface SiteHistoryMenuProps {
  siteSnapshots: FramerSiteSnapshot[];
  activeSiteId: string | null;
  onSelectSite: (site: FramerSiteSnapshot) => void;
}

function siteSourceLabel(sourceType: SourceType): string {
  if (sourceType === 'github') return 'GitHub';
  if (sourceType === 'upload') return '上傳';
  return '貼上';
}

function formatSiteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-HK', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const MENU_WIDTH = 384;
const VIEWPORT_MARGIN = 8;

function placeMenu(rect: DOMRect) {
  const width = Math.min(MENU_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, rect.right - width),
    window.innerWidth - VIEWPORT_MARGIN - width,
  );
  const top = rect.bottom + 6;
  const panelMax = Math.max(160, window.innerHeight - top - VIEWPORT_MARGIN);
  return { top, left, width, listMaxHeight: Math.max(96, panelMax - 52) };
}

export function SiteHistoryMenu({
  siteSnapshots,
  activeSiteId,
  onSelectSite,
}: SiteHistoryMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<ReturnType<typeof placeMenu> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor(placeMenu(rect));
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor(placeMenu(rect));
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title="載入已導入的網站資料"
        className={cn(
          'inline-flex h-full items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-semibold whitespace-nowrap transition-colors',
          open
            ? 'border-[#0BB59B] bg-teal-50 text-[#08967F]'
            : 'border-slate-200 bg-white text-[#101B2D] hover:bg-slate-50',
        )}
      >
        <History size={13} className={open ? 'text-[#0BB59B]' : 'text-slate-500'} />
        <span>網站記錄 ({siteSnapshots.length})</span>
      </button>
      {open &&
        anchor &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[60] overflow-hidden rounded-lg border border-slate-200 bg-white text-[#101B2D] shadow-xl"
            style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <div className="text-[11px] font-semibold text-slate-600">網站記錄</div>
                <div className="text-[10px] text-slate-400">已導入的整站資料</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] text-slate-400 hover:text-slate-700"
              >
                關閉
              </button>
            </div>
            {siteSnapshots.length === 0 ? (
              <div className="p-4 text-center text-[12px] leading-relaxed text-slate-400">
                尚無網站記錄。分析 GitHub 倉庫或上傳壓縮包後，整站資料會留在這裡。
              </div>
            ) : (
              <div
                className="divide-y divide-slate-100 overflow-y-auto"
                style={{ maxHeight: anchor.listMaxHeight }}
              >
                {siteSnapshots.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => {
                      onSelectSite(site);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
                      activeSiteId === site.id && 'bg-teal-50/70',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium">{site.project_name}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                        {site.page_count} 頁
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-400">
                      {siteSourceLabel(site.source_type)}
                      {site.source_label ? ` · ${site.source_label}` : ''}
                      {site.created_at ? ` · ${formatSiteTime(site.created_at)}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
