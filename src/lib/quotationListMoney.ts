import type { PitchingExpenseItem } from '../data/pitchingData';
import { formatMoneyAmount } from './formatMoney';

export const QUOTATION_LIST_MONEY_COLUMN_COUNT = 3;
export const QUOTATION_LIST_BASE_COLUMN_COUNT = 8;
export const QUOTATION_LIST_COLUMN_COUNT =
  QUOTATION_LIST_BASE_COLUMN_COUNT + QUOTATION_LIST_MONEY_COLUMN_COUNT;

export type QuotationListMoney = {
  income: number | null;
  expense: number | null;
  gp: number | null;
};

export type QuotationProjectActuals = {
  income: number;
  expense: number;
  gp: number;
};

export type IncomeAmountRow = {
  quotation_client_project_id: string | null;
  billed_amount: number | string | null;
};

export type ProjectLinkRow = {
  id: string;
  related_id: string | null;
};

export type ExpenseAmountRow = {
  related_id: string | null;
  billed_amount: number | string | null;
};

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function toMoneyAmount(value: number | string | null | undefined): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeGp(income: number, expense: number): number {
  return roundMoney(income - expense);
}

export function sumEstimatedExpenses(
  expenses: Array<Pick<PitchingExpenseItem, 'amount'>> | null | undefined,
): number {
  if (!expenses?.length) return 0;
  return roundMoney(expenses.reduce((sum, item) => sum + toMoneyAmount(item.amount), 0));
}

export function estimatedMoneyFor(record: {
  estimatedIncome?: number | null;
  estimatedExpenses?: Array<Pick<PitchingExpenseItem, 'amount'>> | null;
}): QuotationListMoney {
  const expense = sumEstimatedExpenses(record.estimatedExpenses);
  const income = record.estimatedIncome;
  if (income == null && expense === 0) {
    return { income: null, expense: null, gp: null };
  }
  const incomeValue = income ?? 0;
  return {
    income: income ?? null,
    expense,
    gp: computeGp(incomeValue, expense),
  };
}

export function aggregateIncomeByProject(rows: IncomeAmountRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = row.quotation_client_project_id?.trim();
    if (!id) continue;
    totals.set(id, roundMoney((totals.get(id) ?? 0) + toMoneyAmount(row.billed_amount)));
  }
  return totals;
}

export function aggregateExpenseByRelatedId(rows: ExpenseAmountRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const id = row.related_id?.trim();
    if (!id) continue;
    totals.set(id, roundMoney((totals.get(id) ?? 0) + toMoneyAmount(row.billed_amount)));
  }
  return totals;
}

export function buildProjectActuals(
  incomes: IncomeAmountRow[],
  projectLinks: ProjectLinkRow[],
  expenses: ExpenseAmountRow[],
): Record<string, QuotationProjectActuals> {
  const incomeByProject = aggregateIncomeByProject(incomes);
  const expenseByMaster = aggregateExpenseByRelatedId(expenses);
  const expenseByQuotation = new Map<string, number>();

  for (const link of projectLinks) {
    const quotationId = link.related_id?.trim();
    if (!quotationId) continue;
    const linkedExpense = expenseByMaster.get(link.id);
    if (linkedExpense == null) continue;
    expenseByQuotation.set(
      quotationId,
      roundMoney((expenseByQuotation.get(quotationId) ?? 0) + linkedExpense),
    );
  }

  const result: Record<string, QuotationProjectActuals> = {};
  for (const id of new Set([...incomeByProject.keys(), ...expenseByQuotation.keys()])) {
    const income = incomeByProject.get(id) ?? 0;
    const expense = expenseByQuotation.get(id) ?? 0;
    result[id] = { income, expense, gp: computeGp(income, expense) };
  }
  return result;
}

export function projectActualsFor(
  quotationClientProjectId: string,
  actuals: Record<string, QuotationProjectActuals>,
): QuotationProjectActuals {
  return actuals[quotationClientProjectId] ?? { income: 0, expense: 0, gp: 0 };
}

export function formatQuotationListMoney(amount: number): string {
  return formatMoneyAmount(amount);
}

export function quotationListGpClass(amount: number | null): string {
  if (amount == null || amount === 0) return '';
  return amount > 0 ? 'text-emerald-600' : 'text-rose-600';
}
