import type { SystemCurrency } from './currency.ts';
import {
  formatIncomeDate,
  formatLocalIsoDate,
  INCOME_PAYMENT_STATUS_LABELS,
  parseLocalIsoDate,
  type IncomePaymentStatus,
} from './quotationIncomes.ts';

export type AnnualFeeIncomeRow = {
  id: string;
  projectName: string;
  clientName: string;
  quotationClientProjectId?: string;
  projectStatus?: string;
  projectTypeKey?: string;
  typeLabel: string;
  installmentNumber?: number;
  currency: SystemCurrency;
  billedAmount: number;
  paymentAmount: number;
  outstanding: number;
  dueDate?: string;
  paymentStatus?: string | null;
};

export const ANNUAL_FEE_PROJECT_TYPE_KEYS = ['bwt_system', 'bwt_web'] as const;
export type AnnualFeeProjectTypeKey = (typeof ANNUAL_FEE_PROJECT_TYPE_KEYS)[number];

export type AnnualFeeGroup = {
  projectId: string;
  projectName: string;
  clientName: string;
  projectTypeKey: AnnualFeeProjectTypeKey;
  projectStatus?: string;
  totalBilled: number;
  installmentCount: number;
  nextDueDate?: string;
  nextBilledAmount: number;
  expiredOutstanding: number;
  upcomingAmount: number;
  rows: AnnualFeeIncomeRow[];
  defaultRows: AnnualFeeIncomeRow[];
};

export type AnnualFeeListOptions = {
  search?: string;
  projectType?: string | null;
  asOf?: string;
};

export type AnnualFeeSummary = {
  projectCount: number;
  totalBilled: number;
  upcomingAmount: number;
};

export function formatAnnualFeeNextDueLabel(
  group: Pick<AnnualFeeGroup, 'nextDueDate' | 'expiredOutstanding'>,
): string {
  if (group.nextDueDate) return formatIncomeDate(group.nextDueDate);
  if (group.expiredOutstanding > 0) return '已逾期';
  return '—';
}

export function annualFeePaymentStatusLabel(row: {
  paymentStatus?: string | null;
  paymentAmount?: number | null;
}): string {
  const status = row.paymentStatus?.trim();
  const paid = Number(row.paymentAmount);
  if (!status && !(Number.isFinite(paid) && paid > 0)) return '未付款';
  return incomeStatusLabel(status || undefined);
}

function todayIso(now = new Date()): string {
  return formatLocalIsoDate(now);
}

function daysUntilDue(dueDate: string | undefined, asOf: string): number | null {
  const due = parseLocalIsoDate(dueDate);
  const today = parseLocalIsoDate(asOf);
  if (!due || !today) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function isOutstandingAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

function isOverdueDueDate(dueDate: string | undefined, asOf: string): boolean {
  const days = daysUntilDue(dueDate, asOf);
  return days != null && days < 0;
}

function incomeStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  return INCOME_PAYMENT_STATUS_LABELS[status as IncomePaymentStatus] ?? status;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function isAnnualFeeProjectType(
  key: string | null | undefined,
): key is AnnualFeeProjectTypeKey {
  return key === 'bwt_system' || key === 'bwt_web';
}

export function isAnnualFeeDefaultRow(row: AnnualFeeIncomeRow, asOf = todayIso()): boolean {
  if (!row.dueDate) return false;
  if (isOverdueDueDate(row.dueDate, asOf)) return isOutstandingAmount(row.outstanding);
  return daysUntilDue(row.dueDate, asOf) != null;
}

function compareInstallments(a: AnnualFeeIncomeRow, b: AnnualFeeIncomeRow): number {
  const dueA = a.dueDate ?? '9999-99-99';
  const dueB = b.dueDate ?? '9999-99-99';
  if (dueA !== dueB) return dueA.localeCompare(dueB);
  const installmentA = a.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  const installmentB = b.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  if (installmentA !== installmentB) return installmentA - installmentB;
  return a.id.localeCompare(b.id);
}

function compareGroups(a: AnnualFeeGroup, b: AnnualFeeGroup): number {
  if (a.nextDueDate && b.nextDueDate && a.nextDueDate !== b.nextDueDate) {
    return a.nextDueDate.localeCompare(b.nextDueDate);
  }
  if (a.nextDueDate && !b.nextDueDate) return -1;
  if (!a.nextDueDate && b.nextDueDate) return 1;
  const byName = a.projectName.localeCompare(b.projectName, 'zh-HK');
  if (byName !== 0) return byName;
  return a.projectId.localeCompare(b.projectId);
}

function matchesSearch(group: Pick<AnnualFeeGroup, 'projectName' | 'clientName'>, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return (
    group.projectName.toLowerCase().includes(query) || group.clientName.toLowerCase().includes(query)
  );
}

function buildGroup(projectId: string, rows: AnnualFeeIncomeRow[], asOf: string): AnnualFeeGroup {
  const sorted = [...rows].sort(compareInstallments);
  const first = sorted[0];
  const projectTypeKey = first.projectTypeKey;
  if (!isAnnualFeeProjectType(projectTypeKey)) {
    throw new Error(`年度收費分組收到非 BWT 項目：${projectTypeKey ?? ''}`);
  }

  let totalBilled = 0;
  let expiredOutstanding = 0;
  let nextDueDate: string | undefined;
  for (const row of sorted) {
    totalBilled = roundMoney(totalBilled + row.billedAmount);
    if (row.dueDate && isOverdueDueDate(row.dueDate, asOf) && isOutstandingAmount(row.outstanding)) {
      expiredOutstanding = roundMoney(expiredOutstanding + row.outstanding);
    }
    if (row.dueDate && !isOverdueDueDate(row.dueDate, asOf)) {
      if (!nextDueDate || row.dueDate < nextDueDate) nextDueDate = row.dueDate;
    }
  }

  let nextBilledAmount = 0;
  if (nextDueDate) {
    for (const row of sorted) {
      if (row.dueDate === nextDueDate) nextBilledAmount = roundMoney(nextBilledAmount + row.billedAmount);
    }
  }

  return {
    projectId,
    projectName: first.projectName,
    clientName: first.clientName,
    projectTypeKey,
    projectStatus: first.projectStatus,
    totalBilled,
    installmentCount: sorted.length,
    nextDueDate,
    nextBilledAmount,
    expiredOutstanding,
    upcomingAmount: roundMoney(nextBilledAmount + expiredOutstanding),
    rows: sorted,
    defaultRows: sorted.filter((row) => isAnnualFeeDefaultRow(row, asOf)),
  };
}

export function buildAnnualFeeGroups(
  rows: readonly AnnualFeeIncomeRow[],
  options: AnnualFeeListOptions = {},
): AnnualFeeGroup[] {
  const asOf = options.asOf ?? todayIso();
  const projectType = options.projectType && options.projectType !== 'all' ? options.projectType : null;
  const byProject = new Map<string, AnnualFeeIncomeRow[]>();

  for (const row of rows) {
    if (!isAnnualFeeProjectType(row.projectTypeKey)) continue;
    if (projectType && row.projectTypeKey !== projectType) continue;
    const projectId = row.quotationClientProjectId?.trim();
    if (!projectId) continue;
    const list = byProject.get(projectId) ?? [];
    list.push(row);
    byProject.set(projectId, list);
  }

  return [...byProject.entries()]
    .map(([projectId, projectRows]) => buildGroup(projectId, projectRows, asOf))
    .filter((group) => group.defaultRows.length > 0 && matchesSearch(group, options.search ?? ''))
    .sort(compareGroups);
}

export function summarizeAnnualFeeGroups(groups: readonly AnnualFeeGroup[]): AnnualFeeSummary {
  return groups.reduce<AnnualFeeSummary>(
    (summary, group) => ({
      projectCount: summary.projectCount + 1,
      totalBilled: roundMoney(summary.totalBilled + group.totalBilled),
      upcomingAmount: roundMoney(summary.upcomingAmount + group.upcomingAmount),
    }),
    { projectCount: 0, totalBilled: 0, upcomingAmount: 0 },
  );
}
