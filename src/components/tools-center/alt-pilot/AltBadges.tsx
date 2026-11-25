import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ALT_LOCATION_LABELS,
  ALT_RISK_LABELS,
  ALT_SUGGESTION_STATUS_LABELS,
  type AltImageLocation,
  type AltIssue,
  type AltRisk,
  type AltSuggestionStatus,
} from '@/lib/altTypes.ts';
import { cn } from '@/lib/utils';

const STATUS_CLASS: Record<AltSuggestionStatus | 'empty', string> = {
  empty: 'border-slate-200 bg-slate-50 text-slate-500',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-teal-200 bg-teal-50 text-teal-700',
  rejected: 'border-slate-200 bg-slate-100 text-slate-500',
  exported: 'border-blue-200 bg-blue-50 text-blue-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
};

const RISK_CLASS: Record<AltRisk, string> = {
  low: 'border-teal-200 bg-teal-50 text-teal-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-rose-200 bg-rose-50 text-rose-700',
};

export function AltStatusPill({
  status,
  className,
}: {
  status: AltSuggestionStatus | 'empty';
  className?: string;
}) {
  const label = status === 'empty' ? '尚未生成' : ALT_SUGGESTION_STATUS_LABELS[status];
  return (
    <Badge
      variant="outline"
      className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CLASS[status], className)}
    >
      {label}
    </Badge>
  );
}

export function AltRiskBadge({ risk, className }: { risk: AltRisk; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', RISK_CLASS[risk], className)}
    >
      {ALT_RISK_LABELS[risk]}
    </Badge>
  );
}

export function AltLocationBadge({ location }: { location: AltImageLocation }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-[#f5f8fc] px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {ALT_LOCATION_LABELS[location]}
    </span>
  );
}

export function AltIssueHint({ issues }: { issues: AltIssue[] }) {
  if (!issues || issues.length === 0) return null;
  const hard = issues.filter((issue) => issue.severity === 'hard');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-full',
            hard.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600',
          )}
        >
          <AlertTriangle size={12} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-left">
        <ul className="space-y-1">
          {issues.slice(0, 4).map((issue, index) => (
            <li key={`${issue.id}-${index}`} className="text-[11px] leading-snug">
              {issue.message}
            </li>
          ))}
          {issues.length > 4 ? (
            <li className="text-[11px] opacity-70">＋{issues.length - 4} 項</li>
          ) : null}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
