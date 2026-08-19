import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  listActionBreakdownRows,
  type ActionBreakdown,
} from '@/lib/facebookAdsConversions';
import { cn } from '@/lib/utils';

export function FacebookAdsConversionHover({
  children,
  breakdown,
  dateLabel,
  className,
}: {
  children: ReactNode;
  breakdown?: ActionBreakdown | null;
  dateLabel: string;
  className?: string;
}) {
  const rows = listActionBreakdownRows(breakdown);

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            'cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 p-3">
        <div className="text-[12px] font-semibold text-foreground">Conversions / 轉換明細</div>
        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{dateLabel}</div>
        {rows.length === 0 ? (
          <p className="text-[12px] text-muted-foreground mt-2">此期間尚無事件明細</p>
        ) : (
          <dl className="mt-2 space-y-1">
            {rows.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-foreground">{row.label}</dt>
                <dd className="text-[12px] tabular-nums font-medium">
                  {row.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-[10px] text-muted-foreground mt-2.5 leading-snug">
          Conv. 欄為 Ads Manager 成果。其他列為同期像素／漏斗事件，不計入 Conv.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
