import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { PitchingExpenseItem, PitchingStatus } from '@/data/pitchingData';
import { useQuotationProjectActualsFor } from '@/hooks/useQuotationProjectActuals';
import {
  clientProjectInfoMetrics,
  estimatedMoneyFor,
  formatProfitRatioPercent,
  formatQuotationListMoney,
  isActualClientProjectMetricsStatus,
  projectActualsFor,
  quotationListGpClass,
} from '@/lib/quotationListMoney';

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 min-w-0">
      <span className="text-[13px] font-medium text-muted-foreground tracking-wide">{label}</span>
      <span className={cn('text-[28px] font-bold leading-none block mt-2 tabular-nums truncate', valueClassName)}>
        {value}
      </span>
    </div>
  );
}

export function PitchingInfoMetricsRow({
  projectId,
  status,
  estimatedIncome,
  estimatedExpenses,
}: {
  projectId: string;
  status: PitchingStatus;
  estimatedIncome?: number | null;
  estimatedExpenses?: PitchingExpenseItem[] | null;
}) {
  const showActuals = isActualClientProjectMetricsStatus(status);
  const { actuals, loading, error } = useQuotationProjectActualsFor(showActuals ? projectId : undefined);

  const metrics = useMemo(
    () =>
      clientProjectInfoMetrics({
        status,
        estimated: estimatedMoneyFor({ estimatedIncome, estimatedExpenses }),
        actuals: showActuals ? projectActualsFor(projectId, actuals) : null,
      }),
    [actuals, estimatedExpenses, estimatedIncome, projectId, showActuals, status],
  );

  if (showActuals && loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 h-[96px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const moneyValue = (amount: number | null) =>
    amount == null ? '—' : formatQuotationListMoney(amount);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard label={metrics.labels.income} value={moneyValue(metrics.income)} />
        <MetricCard label={metrics.labels.expense} value={moneyValue(metrics.expense)} />
        <MetricCard
          label={metrics.labels.gp}
          value={moneyValue(metrics.gp)}
          valueClassName={quotationListGpClass(metrics.gp)}
        />
        <MetricCard
          label={metrics.labels.ratio}
          value={formatProfitRatioPercent(metrics.ratio)}
          valueClassName={quotationListGpClass(metrics.ratio)}
        />
      </div>
      {showActuals && error && (
        <p className="text-[12px] text-rose-600">無法載入實際收支：{error}</p>
      )}
    </div>
  );
}
