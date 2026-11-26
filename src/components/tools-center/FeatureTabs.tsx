import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface FeatureTabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** 只有大於 0 才顯示；不再用固定寬度的隱形槽位。 */
  badge?: number;
  /** 社媒分區用的左側小圓點。 */
  dot?: boolean;
  title?: string;
}

export interface FeatureTabsProps<T extends string> {
  items: ReadonlyArray<FeatureTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * 工具中心的分區／子功能切換。
 *
 * 寬度規則：外框 w-fit、按鈕 shrink-0 + whitespace-nowrap，
 * 所以「文字多寬、按鈕多寬」；badge 只在有值時出現，不再保留固定寬度槽位。
 * 小螢幕時外框可橫向捲動，不會撐爆頁面。
 */
export function FeatureTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: FeatureTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-fit max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-card',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        const badge = item.badge ?? 0;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            title={item.title}
            className={cn(
              'group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors',
              active
                ? 'bg-[#0d1a2d] text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
            )}
          >
            {item.dot && (
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full transition-colors',
                  active ? 'bg-teal-300' : 'bg-slate-300 group-hover:bg-slate-400',
                )}
              />
            )}
            {Icon && (
              <Icon
                size={14}
                strokeWidth={2}
                className={active ? 'text-teal-300' : 'text-slate-400'}
              />
            )}
            {item.label}
            {badge > 0 && (
              <span
                aria-label={`${badge} 項待處理`}
                className={cn(
                  'inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-4 tabular-nums',
                  active ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700',
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
