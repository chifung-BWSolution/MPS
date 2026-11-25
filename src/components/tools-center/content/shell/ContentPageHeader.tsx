import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContentPageHeaderProps {
  title: string;
  subtitle?: string | null;
  /** 小型標籤（例如站點名稱、zone 標籤） */
  eyebrow?: ReactNode;
  /** 右側主要動作 */
  actions?: ReactNode;
  /** 標題下方的補充資訊（例如統計、篩選） */
  meta?: ReactNode;
  className?: string;
}

/**
 * 頁標題（PRD §8.1）：32px bold 標題 + 14px muted 副標，右側動作。
 * 全部 content 頁面共用，避免標題樣式漂移。
 */
export function ContentPageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  className,
}: ContentPageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-teal-700">{eyebrow}</div>}
        <h1 className="truncate text-[32px] font-bold leading-tight tracking-tight text-[#0d1a2d]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">{subtitle}</p>
        )}
        {meta && <div className="mt-3">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
