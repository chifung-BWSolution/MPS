import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type ContentMetricTone = 'default' | 'ok' | 'warn' | 'danger' | 'info';

export interface ContentMetricItem {
  label: string;
  value: number | string;
  tone?: ContentMetricTone;
  /** 可點擊跳轉（例如「待審 5」→ 文章佇列） */
  onClick?: () => void;
  hint?: string;
}

const VALUE_TONE: Record<ContentMetricTone, string> = {
  default: 'text-[#0d1a2d]',
  ok: 'text-teal-700',
  warn: 'text-amber-600',
  danger: 'text-rose-600',
  info: 'text-blue-600',
};

export interface ContentMetricBarProps {
  items: ContentMetricItem[];
  loading?: boolean;
  className?: string;
  /** 右側附加動作（例如「重新整理」） */
  actions?: React.ReactNode;
}

/**
 * 今日／待處理指標條（PRD §8.2.1、M3-14）。
 * 數字本身就是入口：可點的項目會顯示 hover 態。
 */
export function ContentMetricBar({ items, loading, className, actions }: ContentMetricBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-stretch gap-x-1 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-1.5 py-1 shadow-card',
        className,
      )}
    >
      {items.map((item) => {
        const content = (
          <>
            <span className={cn('text-[17px] font-bold leading-6 tabular-nums', VALUE_TONE[item.tone || 'default'])}>
              {item.value}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
          </>
        );

        const baseClass =
          'flex min-w-[74px] flex-col items-start gap-0 rounded-md px-3 py-1.5';

        return item.onClick ? (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            title={item.hint}
            className={cn(baseClass, 'text-left transition-colors hover:bg-slate-50')}
          >
            {content}
          </button>
        ) : (
          <div key={item.label} title={item.hint} className={baseClass}>
            {content}
          </div>
        );
      })}
      {loading && (
        <div className="flex items-center px-2 text-muted-foreground">
          <Loader2 size={13} className="animate-spin" />
        </div>
      )}
      {actions && <div className="ml-auto flex items-center gap-2 self-center pr-2">{actions}</div>}
    </div>
  );
}
