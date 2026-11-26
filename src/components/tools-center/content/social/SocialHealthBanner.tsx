import { AlertTriangle, Info, OctagonAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SocialAlertItem } from '@/hooks/useSocialWorkspace.ts';

const SEVERITY_STYLE = {
  critical: 'border-rose-200 bg-rose-50/70 text-rose-800',
  warning: 'border-amber-200 bg-amber-50/70 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

const SEVERITY_ICON = {
  critical: OctagonAlert,
  warning: AlertTriangle,
  info: Info,
} as const;

export interface SocialHealthBannerProps {
  alerts: SocialAlertItem[];
  loading?: boolean;
  onRefresh?: () => void;
  className?: string;
}

/**
 * 營運告警橫幅（M5-04）：只在有事時出現，不佔版位。
 * 每條都有「是什麼、幾個、怎麼處理」的短句，避免只丟一個紅點。
 */
export function SocialHealthBanner({
  alerts,
  loading,
  onRefresh,
  className,
}: SocialHealthBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label="營運告警"
      className={cn(
        'rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#0d1a2d]">
          <AlertTriangle size={14} className="text-amber-500" />
          需要你處理（{alerts.length}）
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
            重新檢查
          </Button>
        )}
      </div>
      <ul className="space-y-1.5">
        {alerts.map((alert) => {
          const Icon = SEVERITY_ICON[alert.severity] ?? Info;
          return (
            <li
              key={alert.kind}
              className={cn(
                'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[11.5px] leading-relaxed',
                SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info,
              )}
            >
              <Icon size={13} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold">
                  {alert.title}
                  {alert.count > 0 ? `（${alert.count}）` : ''}
                </span>
                <span className="ml-1 opacity-80">{alert.detail}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
