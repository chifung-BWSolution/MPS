import { useMemo } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import type { PitchingExpenseItem } from '@/data/pitchingData';
import { useQuotationExpenses } from '@/hooks/useQuotationExpenses';
import { useQuotationIncomes } from '@/hooks/useQuotationIncomes';
import { summarizeIncomes } from '@/lib/quotationIncomes';
import {
  buildCostAnalysis,
  buildIncomeDoughnut,
  costDeltaTone,
  costSliceColorMap,
  formatCostMoney,
  formatCostPercent,
  formatSignedMoney,
  formatSignedPercent,
  sliceSharePercent,
  type CostCompareRow,
  type CostDoughnutSlice,
} from '@/lib/quotationCostAnalysis';
import { formatQuotationListMoney } from '@/lib/quotationListMoney';

function DeltaCell({ row }: { row: CostCompareRow }) {
  const tone = costDeltaTone(row);
  const amountLabel = row.format === 'percent' ? formatSignedPercent(row.delta) : formatSignedMoney(row.delta);
  const percentLabel =
    row.format === 'percent' || row.deltaPercent == null ? null : formatSignedPercent(row.deltaPercent);

  return (
    <div
      className={cn(
        'text-right tabular-nums',
        tone === 'up' && 'text-emerald-600',
        tone === 'down' && 'text-rose-600',
        (tone === 'flat' || tone === 'empty') && 'text-muted-foreground',
      )}
    >
      <div className="text-[13px] font-medium">{amountLabel}</div>
      {percentLabel && <div className="text-[11px] mt-0.5">{percentLabel}</div>}
    </div>
  );
}

function formatRowValue(row: CostCompareRow, side: 'estimated' | 'actual'): string {
  const value = row[side];
  return row.format === 'percent' ? formatCostPercent(value) : formatCostMoney(value);
}

function CostStructureDoughnut({
  title,
  subtitle,
  emptyText,
  income,
  slices,
  overspend,
}: {
  title: string;
  subtitle: string;
  emptyText: string;
  income: number;
  slices: CostDoughnutSlice[];
  overspend: number;
}) {
  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <PieChartIcon size={16} className="text-teal-600" />
        <h3 className="text-[14px] font-semibold">{title}</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">{subtitle}</p>
      <div className="h-[240px] relative">
        {slices.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {slices.map((entry) => (
                    <Cell key={`${entry.kind}-${entry.name}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number, name: string) => [
                    formatQuotationListMoney(Number(value)),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[16px] font-bold tabular-nums">{formatQuotationListMoney(income)}</div>
              <div className="text-[10px] text-muted-foreground">收入</div>
            </div>
          </>
        )}
      </div>
      {slices.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          {slices.map((entry) => {
            const share = sliceSharePercent(entry.value, income);
            return (
              <div key={`${entry.kind}-${entry.name}`} className="flex items-center justify-between gap-3 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="text-muted-foreground truncate">{entry.name}</span>
                </div>
                <span className="tabular-nums shrink-0">
                  {formatQuotationListMoney(entry.value)}
                  {share != null ? ` · ${share.toFixed(1)}%` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {overspend > 0 && (
        <p className="text-[11px] text-rose-600 mt-3">支出超出收入 {formatQuotationListMoney(overspend)}</p>
      )}
    </div>
  );
}

export function PitchingCostAnalysisTab({
  projectId,
  estimatedIncome,
  estimatedExpenses,
}: {
  projectId: string;
  estimatedIncome?: number | null;
  estimatedExpenses: PitchingExpenseItem[];
}) {
  const { rows: incomeRows, loading: incomesLoading, error: incomesError } = useQuotationIncomes(projectId);
  const {
    rows: expenseRows,
    loading: expensesLoading,
    error: expensesError,
  } = useQuotationExpenses('quotation_client', projectId);

  const analysis = useMemo(() => {
    const incomeSummary = summarizeIncomes(incomeRows);
    return buildCostAnalysis({
      estimatedIncome,
      estimatedExpenses,
      actualIncome: incomeSummary.billed,
      actualExpenses: expenseRows.map((row) => ({ name: row.typeLabel, amount: row.billedAmount })),
      estimatedExpenseCount: estimatedExpenses.length,
      actualExpenseCount: expenseRows.length,
      actualIncomeCount: incomeRows.length,
    });
  }, [estimatedExpenses, estimatedIncome, expenseRows, incomeRows]);

  const colorByLabel = useMemo(
    () =>
      costSliceColorMap([
        ...analysis.estimatedCosts.map((item) => item.name),
        ...analysis.actualCosts.map((item) => item.name),
      ]),
    [analysis.actualCosts, analysis.estimatedCosts],
  );

  const estimatedDonut = useMemo(
    () => buildIncomeDoughnut(analysis.estimatedIncome, analysis.estimatedCosts, colorByLabel),
    [analysis.estimatedCosts, analysis.estimatedIncome, colorByLabel],
  );
  const actualDonut = useMemo(
    () => buildIncomeDoughnut(analysis.actualIncome, analysis.actualCosts, colorByLabel),
    [analysis.actualCosts, analysis.actualIncome, colorByLabel],
  );

  const loading = incomesLoading || expensesLoading;
  const error = incomesError || expensesError;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 h-[280px] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 h-[360px] animate-pulse" />
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 h-[360px] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2">
            <PieChartIcon size={16} className="text-teal-600" />
            <h3 className="text-[15px] font-semibold">成本結構</h3>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1">
            項目成本分析與對比 · 預計 = 預計收入支出 · 實際 = 收入 / 支出
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-y border-border/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-medium px-5 py-2.5">Type</th>
                <th className="text-right font-medium px-5 py-2.5">
                  Estimated 預計
                </th>
                <th className="text-right font-medium px-5 py-2.5">
                  Actual 實際
                </th>
                <th className="text-right font-medium px-5 py-2.5">差異 Diff</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rows.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    'border-b border-border/50',
                    row.kind === 'expense-total' && 'bg-rose-50/70',
                    row.kind === 'profit' && 'bg-emerald-50/70',
                  )}
                >
                  <td
                    className={cn(
                      'px-5 py-2.5',
                      (row.kind === 'expense-total' || row.kind === 'profit') && 'font-medium',
                      row.kind === 'cost' && 'text-muted-foreground pl-8',
                    )}
                  >
                    {row.label}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatRowValue(row, 'estimated')}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatRowValue(row, 'actual')}</td>
                  <td className="px-5 py-2.5">
                    <DeltaCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11px] text-muted-foreground">
          預計：{analysis.counts.estimatedExpenses} 筆預計支出 · 實際：{analysis.counts.actualExpenses} 筆支出 ·{' '}
          {analysis.counts.actualIncomes} 筆收入
        </p>
      </div>

      {error && <p className="text-[12px] text-rose-600">無法載入實際收支：{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CostStructureDoughnut
          title="預計成本結構"
          subtitle={`整個圓環 = 預計收入 ${formatCostMoney(analysis.estimatedIncome)}`}
          emptyText="請先設定預計收入"
          income={estimatedDonut.income}
          slices={estimatedDonut.slices}
          overspend={estimatedDonut.overspend}
        />
        <CostStructureDoughnut
          title="實際成本結構"
          subtitle={`整個圓環 = 實際收入 ${formatCostMoney(analysis.actualIncome)}`}
          emptyText="尚無實際收入"
          income={actualDonut.income}
          slices={actualDonut.slices}
          overspend={actualDonut.overspend}
        />
      </div>
    </div>
  );
}
