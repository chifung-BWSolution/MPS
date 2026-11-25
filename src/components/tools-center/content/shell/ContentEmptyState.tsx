import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContentEmptyStateProps {
  icon?: ComponentType<LucideProps>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'warning' | 'error';
  className?: string;
  /** 附加內容（例如範例、文件連結清單） */
  children?: ReactNode;
}

const TONE_CLASS = {
  default: 'border-[rgba(13,26,45,0.08)] bg-white',
  warning: 'border-amber-200 bg-amber-50/60',
  error: 'border-rose-200 bg-rose-50/60',
};

const ICON_TONE = {
  default: 'bg-slate-50 text-slate-400',
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-rose-100 text-rose-600',
};

/**
 * 空狀態引導（PRD §8.3）：永遠告訴使用者「下一步做什麼」，
 * 而不是丟一張空表格。
 */
export function ContentEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  tone = 'default',
  className,
  children,
}: ContentEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border px-6 py-14 text-center shadow-card',
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', ICON_TONE[tone])}>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <h3 className="mt-4 text-[16px] font-bold text-[#0d1a2d]">{title}</h3>
      {description && (
        <div className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </div>
      )}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
      {children && <div className="mt-5 w-full max-w-xl text-left">{children}</div>}
    </div>
  );
}
