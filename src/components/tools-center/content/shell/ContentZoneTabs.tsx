import { cn } from '@/lib/utils';
import {
  ZONE_DESCRIPTION,
  ZONE_LABEL,
} from '@/lib/contentNavigation.ts';
import type { ContentZone } from '@/lib/contentTypes.ts';

export interface ContentZoneTabsProps {
  zone: ContentZone;
  onChange: (zone: ContentZone) => void;
  /** 待處理數量（可選，顯示在 tab 上） */
  counts?: Partial<Record<ContentZone, number>>;
  className?: string;
}

/**
 * 兩區切換（PRD §5.1）：社媒營運 / 網站內容自動化。
 * 樣式對映 MPS：白卡 + teal 選中態 + 4px 圓角。
 */
export function ContentZoneTabs({ zone, onChange, counts, className }: ContentZoneTabsProps) {
  const zones: ContentZone[] = ['social', 'seo'];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-card',
        className,
      )}
      role="tablist"
      aria-label="內容自動化分區"
    >
      {zones.map((item) => {
        const active = item === zone;
        const count = counts?.[item] ?? 0;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item)}
            className={cn(
              'group inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors',
              active
                ? 'bg-[#0d1a2d] text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
            )}
            title={ZONE_DESCRIPTION[item]}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors',
                active ? 'bg-teal-300' : 'bg-slate-300 group-hover:bg-slate-400',
              )}
            />
            {ZONE_LABEL[item]}
            {count > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-4',
                  active ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700',
                )}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
