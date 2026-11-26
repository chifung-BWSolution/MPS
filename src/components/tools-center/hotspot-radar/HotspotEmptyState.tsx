import type { ReactNode } from 'react';
import { Radar } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HotspotEmptyState({
  title,
  description,
  action,
  tone = 'default',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'default' | 'warning' | 'error';
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border bg-white px-6 py-12 text-center shadow-card',
        tone === 'default' && 'border-[rgba(13,26,45,0.08)]',
        tone === 'warning' && 'border-amber-200 bg-amber-50/40',
        tone === 'error' && 'border-rose-200 bg-rose-50/40',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          tone === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-teal-50 text-teal-600',
        )}
      >
        <Radar size={18} />
      </span>
      <div className="text-[15px] font-semibold text-[#0d1a2d]">{title}</div>
      {description && (
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
