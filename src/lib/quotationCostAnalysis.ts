import type { PitchingExpenseItem } from '../data/pitchingData';
import {
  computeGp,
  formatQuotationListMoney,
  profitRatioPercent,
  roundMoney,
  toMoneyAmount,
} from './quotationListMoney';

export const UNCATEGORIZED_COST_LABEL = '未能分類 Other';

export const COST_SLICE_COLORS = [
  '#f59e0b',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#e11d48',
] as const;

export const PROFIT_SLICE_COLOR = '#22c55e';
export const PROFIT_SLICE_LABEL = '毛利 Gross Profit';

export type CostAmountItem = {
  name: string;
  amount: number;
};

export type CostComparePolarity = 'higher-better' | 'lower-better';
export type CostRowKind = 'revenue' | 'cost' | 'expense-total' | 'profit' | 'margin';
export type CostRowFormat = 'money' | 'percent';

export type CostCompareRow = {
  key: string;
  label: string;
  estimated: number | null;
  actual: number | null;
  delta: number | null;
  deltaPercent: number | null;
  polarity: CostComparePolarity;
  kind: CostRowKind;
  format: CostRowFormat;
};

export type CostDoughnutSlice = {
  name: string;
  value: number;
  kind: 'cost' | 'profit';
  color: string;
};

export type CostAnalysisCounts = {
  estimatedExpenses: number;
  actualExpenses: number;
  actualIncomes: number;
};

export type CostAnalysis = {
  rows: CostCompareRow[];
  estimatedCosts: CostAmountItem[];
  actualCosts: CostAmountItem[];
  estimatedIncome: number | null;
  actualIncome: number | null;
  estimatedExpense: number;
  actualExpense: number;
  counts: CostAnalysisCounts;
};

export function normalizeCostLabel(name: string | null | undefined): string {
  const trimmed = name?.trim().replace(/\s+/g, ' ') ?? '';
  return trimmed || UNCATEGORIZED_COST_LABEL;
}

export function costLabelKey(name: string | null | undefined): string {
  return normalizeCostLabel(name).toLowerCase();
}

export function groupCostAmounts(
  items: Array<{ name?: string | null; amount: number | string | null | undefined }>,
): CostAmountItem[] {
  const map = new Map<string, CostAmountItem>();
  for (const item of items) {
    const amount = toMoneyAmount(item.amount);
    if (amount === 0) continue;
    const name = normalizeCostLabel(item.name);
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.amount = roundMoney(existing.amount + amount);
    else map.set(key, { name, amount });
  }
  return [...map.values()];
}

export function percentChange(estimated: number | null, actual: number | null): number | null {
  if (estimated == null || actual == null) return null;
  if (estimated === 0) return actual === 0 ? 0 : null;
  return roundMoney(((actual - estimated) / Math.abs(estimated)) * 100);
}

export function amountDelta(estimated: number | null, actual: number | null): number | null {
  if (estimated == null || actual == null) return null;
  return roundMoney(actual - estimated);
}

function compareRow(
  key: string,
  label: string,
  estimated: number | null,
  actual: number | null,
  polarity: CostComparePolarity,
  kind: CostRowKind,
  format: CostRowFormat,
): CostCompareRow {
  return {
    key,
    label,
    estimated,
    actual,
    delta: amountDelta(estimated, actual),
    deltaPercent: percentChange(estimated, actual),
    polarity,
    kind,
    format,
  };
}

export function buildCostAnalysis(input: {
  estimatedIncome?: number | null;
  estimatedExpenses?: Array<Pick<PitchingExpenseItem, 'name' | 'amount'>> | null;
  actualIncome?: number | null;
  actualExpenses?: Array<{ name?: string | null; amount: number | string | null | undefined }>;
  estimatedExpenseCount?: number;
  actualExpenseCount?: number;
  actualIncomeCount?: number;
}): CostAnalysis {
  const estimatedIncome = input.estimatedIncome == null ? null : toMoneyAmount(input.estimatedIncome);
  const actualIncome = input.actualIncome == null ? null : toMoneyAmount(input.actualIncome);
  const estimatedCosts = groupCostAmounts(input.estimatedExpenses ?? []);
  const actualCosts = groupCostAmounts(input.actualExpenses ?? []);
  const estimatedExpense = roundMoney(estimatedCosts.reduce((sum, item) => sum + item.amount, 0));
  const actualExpense = roundMoney(actualCosts.reduce((sum, item) => sum + item.amount, 0));
  const hasEstimated = estimatedIncome != null || estimatedCosts.length > 0;
  const estimatedExpenseValue = hasEstimated ? estimatedExpense : null;
  const estimatedGp =
    estimatedIncome == null && estimatedExpenseValue == null
      ? null
      : computeGp(estimatedIncome ?? 0, estimatedExpense);
  const actualGp = actualIncome == null ? null : computeGp(actualIncome, actualExpense);
  const estimatedMargin = profitRatioPercent(estimatedIncome, estimatedGp);
  const actualMargin = profitRatioPercent(actualIncome, actualGp);

  const costKeys: string[] = [];
  const labelByKey = new Map<string, string>();
  for (const item of estimatedCosts) {
    const key = item.name.toLowerCase();
    costKeys.push(key);
    labelByKey.set(key, item.name);
  }
  for (const item of actualCosts) {
    const key = item.name.toLowerCase();
    if (!labelByKey.has(key)) {
      costKeys.push(key);
      labelByKey.set(key, item.name);
    }
  }
  const estimatedByKey = new Map(estimatedCosts.map((item) => [item.name.toLowerCase(), item.amount]));
  const actualByKey = new Map(actualCosts.map((item) => [item.name.toLowerCase(), item.amount]));

  const rows: CostCompareRow[] = [
    compareRow(
      'revenue',
      'Total Revenue 總營收',
      estimatedIncome,
      actualIncome,
      'higher-better',
      'revenue',
      'money',
    ),
    ...costKeys.map((key) =>
      compareRow(
        `cost:${key}`,
        `(-) ${labelByKey.get(key) ?? key}`,
        estimatedByKey.get(key) ?? null,
        actualByKey.get(key) ?? null,
        'lower-better',
        'cost',
        'money',
      ),
    ),
    compareRow(
      'expense',
      '- Total Expense 總支出',
      estimatedExpenseValue,
      actualIncome == null && actualCosts.length === 0 ? null : actualExpense,
      'lower-better',
      'expense-total',
      'money',
    ),
    compareRow(
      'profit',
      '= Gross Profit 毛利',
      estimatedGp,
      actualGp,
      'higher-better',
      'profit',
      'money',
    ),
    compareRow(
      'margin',
      'Gross Margin % 毛利率',
      estimatedMargin,
      actualMargin,
      'higher-better',
      'margin',
      'percent',
    ),
  ];

  return {
    rows,
    estimatedCosts,
    actualCosts,
    estimatedIncome,
    actualIncome,
    estimatedExpense,
    actualExpense,
    counts: {
      estimatedExpenses: input.estimatedExpenseCount ?? (input.estimatedExpenses?.length ?? 0),
      actualExpenses: input.actualExpenseCount ?? 0,
      actualIncomes: input.actualIncomeCount ?? 0,
    },
  };
}

export function costSliceColorMap(labels: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  let index = 0;
  for (const label of labels) {
    const key = costLabelKey(label);
    if (colors.has(key)) continue;
    colors.set(key, COST_SLICE_COLORS[index % COST_SLICE_COLORS.length]);
    index += 1;
  }
  return colors;
}

export function buildIncomeDoughnut(
  income: number | null,
  costs: CostAmountItem[],
  colorByLabel?: Map<string, string>,
): { slices: CostDoughnutSlice[]; overspend: number; income: number } {
  const incomeValue = income ?? 0;
  if (incomeValue <= 0) {
    return { slices: [], overspend: Math.max(0, roundMoney(costs.reduce((sum, item) => sum + item.amount, 0))), income: incomeValue };
  }

  const positiveCosts = costs.filter((item) => item.amount > 0);
  const totalCost = roundMoney(positiveCosts.reduce((sum, item) => sum + item.amount, 0));
  const overspend = totalCost > incomeValue ? roundMoney(totalCost - incomeValue) : 0;
  const scale = totalCost > incomeValue && totalCost > 0 ? incomeValue / totalCost : 1;
  const slices: CostDoughnutSlice[] = positiveCosts.map((item) => ({
    name: item.name,
    value: roundMoney(item.amount * scale),
    kind: 'cost',
    color: colorByLabel?.get(costLabelKey(item.name)) ?? COST_SLICE_COLORS[0],
  }));
  const used = roundMoney(slices.reduce((sum, item) => sum + item.value, 0));
  const profit = roundMoney(incomeValue - used);
  if (profit > 0) {
    slices.push({
      name: PROFIT_SLICE_LABEL,
      value: profit,
      kind: 'profit',
      color: PROFIT_SLICE_COLOR,
    });
  }
  return { slices: slices.filter((item) => item.value > 0), overspend, income: incomeValue };
}

export function formatCostMoney(amount: number | null): string {
  if (amount == null) return '—';
  return formatQuotationListMoney(amount);
}

export function formatCostPercent(amount: number | null): string {
  if (amount == null) return '—';
  return `${amount.toFixed(1)}%`;
}

export function formatSignedPercent(amount: number | null): string {
  if (amount == null) return '—';
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(1)}%`;
}

export function formatSignedMoney(amount: number | null): string {
  if (amount == null) return '—';
  const formatted = formatQuotationListMoney(Math.abs(amount));
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
}

export type CostDeltaTone = 'up' | 'down' | 'flat' | 'empty';

export function costDeltaTone(row: CostCompareRow): CostDeltaTone {
  if (row.delta == null && row.deltaPercent == null) return 'empty';
  if (row.delta == null || row.delta === 0) return 'flat';
  const value = row.delta;
  const improved = row.polarity === 'higher-better' ? value > 0 : value < 0;
  return improved ? 'up' : 'down';
}

export function sliceSharePercent(value: number, income: number): number | null {
  if (income <= 0) return null;
  return roundMoney((value / income) * 100);
}
