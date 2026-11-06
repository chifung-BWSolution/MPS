import { optionalIsoDate } from '@/data/pitchingData';
import { isIncomePaymentStatus, type IncomePaymentStatus } from '@/lib/quotationIncomes';
import { SERVICE_PERIOD_FIELDS, servicePeriodDate, type ServicePeriods } from '@/lib/servicePeriods';
import { parseSystemCurrency, type SystemCurrency } from '@/lib/currency';

export const CLIENT_PROJECT_DATE_FIELDS = [
  { key: 'inquiryDate', label: '查詢日期' },
  { key: 'signedDate', label: '簽約日期' },
  { key: 'handoverDate', label: '交付日期/活動日期' },
  { key: 'contractStartDate', label: '合約開始日期' },
  { key: 'contractEndDate', label: '合約結束日期' },
] as const;

export type ClientProjectDateFieldKey = (typeof CLIENT_PROJECT_DATE_FIELDS)[number]['key'];

export type ClientProjectDateSource = Partial<Record<ClientProjectDateFieldKey, string | null | undefined>> & {
  servicePeriods?: ServicePeriods | null;
};

export type SidePanelScheduleInput = {
  id: string;
  title?: string | null;
  date?: string | null;
};

export type KeyDateRow = {
  id: string;
  label: string;
  date: string;
  kind: 'project' | 'schedule';
};

export type SidePanelIncomeInput = {
  id: string;
  type?: string | null;
  installmentNumber?: number | null;
  billedAmount: number;
  dueDate?: string | null;
  outstanding: number;
  paymentStatus?: string | null;
  currency?: string | null;
};

export type BillingBriefRow = {
  id: string;
  label: string;
  installmentNumber?: number;
  dueDate?: string;
  billedAmount: number;
  outstanding: number;
  currency: SystemCurrency;
  paymentStatus?: IncomePaymentStatus;
  open: boolean;
  isNext: boolean;
  overdue: boolean;
};

export const BILLING_STATUS_SHORT_LABELS: Record<IncomePaymentStatus, string> = {
  'Pending Check': '待核對',
  Received: '已收款',
  'Not Received': '未收款',
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function scheduleLabel(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed || '排程';
}

/**
 * Project dates stay in the form's order. Empty values are left out.
 * Schedule rows follow, earliest date first. A schedule with no date is left out.
 */
export function buildKeyDateRows(
  project: ClientProjectDateSource,
  schedules: readonly SidePanelScheduleInput[],
): KeyDateRow[] {
  const rows: KeyDateRow[] = [];

  for (const field of CLIENT_PROJECT_DATE_FIELDS) {
    const date = optionalIsoDate(project[field.key]);
    if (!date) continue;
    rows.push({ id: field.key, label: field.label, date, kind: 'project' });
  }

  for (const field of SERVICE_PERIOD_FIELDS) {
    const start = optionalIsoDate(servicePeriodDate(project.servicePeriods ?? {}, field.key, 'startDate'));
    const end = optionalIsoDate(servicePeriodDate(project.servicePeriods ?? {}, field.key, 'endDate'));
    if (start) {
      rows.push({
        id: `${field.key}-start`,
        label: `${field.labelZh}開始日期`,
        date: start,
        kind: 'project',
      });
    }
    if (end) {
      rows.push({
        id: `${field.key}-end`,
        label: `${field.labelZh}結束日期`,
        date: end,
        kind: 'project',
      });
    }
  }

  const scheduleRows: KeyDateRow[] = [];
  for (const row of schedules) {
    const date = optionalIsoDate(row.date);
    if (!date || !row.id) continue;
    scheduleRows.push({
      id: `schedule:${row.id}`,
      label: scheduleLabel(row.title),
      date,
      kind: 'schedule',
    });
  }
  scheduleRows.sort((a, b) => compareText(a.date, b.date) || compareText(a.label, b.label) || compareText(a.id, b.id));
  rows.push(...scheduleRows);
  return rows;
}

export function incomeBriefLabel(
  type: string | null | undefined,
  installmentNumber: number | null | undefined,
): string {
  const name = type?.trim() || '收入';
  return installmentNumber != null ? `${name} 第${installmentNumber}期` : name;
}

function incomeIsOpen(status: IncomePaymentStatus | undefined, outstanding: number): boolean {
  if (status === 'Received') return false;
  return outstanding > 0;
}

function compareBilling(a: BillingBriefRow, b: BillingBriefRow): number {
  const aDate = a.dueDate ?? '9999-99-99';
  const bDate = b.dueDate ?? '9999-99-99';
  const aN = a.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  const bN = b.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  return compareText(aDate, bDate) || aN - bN || compareText(a.id, b.id);
}

function toBillingRow(row: SidePanelIncomeInput, today: string): BillingBriefRow | null {
  if (!row.id) return null;
  const billedAmount = Number.isFinite(row.billedAmount) ? row.billedAmount : 0;
  const outstanding = Number.isFinite(row.outstanding) ? row.outstanding : 0;
  const paymentStatus = isIncomePaymentStatus(row.paymentStatus) ? row.paymentStatus : undefined;
  const dueDate = optionalIsoDate(row.dueDate);
  const open = incomeIsOpen(paymentStatus, outstanding);
  return {
    id: row.id,
    label: incomeBriefLabel(row.type, row.installmentNumber ?? null),
    installmentNumber: row.installmentNumber ?? undefined,
    dueDate,
    billedAmount,
    outstanding,
    currency: parseSystemCurrency(row.currency),
    paymentStatus,
    open,
    isNext: false,
    overdue: Boolean(open && dueDate && dueDate < today),
  };
}

/**
 * Every income is listed. The next billing is the earliest still-open income
 * whose due date is today or later. If every open due date is already past,
 * the earliest of those is next. An open income with no due date is next only
 * when nothing open has a date.
 */
export function buildBillingBrief(
  rows: readonly SidePanelIncomeInput[],
  today: string,
): { rows: BillingBriefRow[]; next: BillingBriefRow | null } {
  const asOf = optionalIsoDate(today) ?? today;
  const brief = rows
    .map((row) => toBillingRow(row, asOf))
    .filter((row): row is BillingBriefRow => row != null)
    .sort(compareBilling);

  const openDated = brief.filter((row) => row.open && row.dueDate);
  const upcoming = openDated.filter((row) => row.dueDate! >= asOf);
  const next = upcoming[0] ?? openDated[0] ?? brief.find((row) => row.open) ?? null;
  if (!next) return { rows: brief, next: null };

  const marked = brief.map((row) => (row.id === next.id ? { ...row, isNext: true } : row));
  return { rows: marked, next: { ...next, isNext: true } };
}

export function billingStillShort(row: Pick<BillingBriefRow, 'outstanding' | 'billedAmount'>): boolean {
  return row.outstanding + 0.001 < row.billedAmount;
}

export const DELIVERABLE_PHOTO_PREVIEW_LIMIT = 3;

/** At most three thumbnails. `extraCount` is the number of photos left unseen. */
export function deliverablePhotoPreview<T>(
  photos: readonly T[],
  limit = DELIVERABLE_PHOTO_PREVIEW_LIMIT,
): { visible: T[]; extraCount: number } {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DELIVERABLE_PHOTO_PREVIEW_LIMIT;
  const visible = photos.slice(0, count);
  return { visible, extraCount: Math.max(0, photos.length - visible.length) };
}

export function deliverableExtraLabel(extraCount: number): string {
  return `+${extraCount}張`;
}

/** The section stays up when either links or completion photos exist. */
export function deliverablesSectionVisible(hasPublications: boolean, photoCount: number): boolean {
  return hasPublications || photoCount > 0;
}

export function hasMediaPublications(
  items: readonly { url?: string | null }[] | null | undefined,
): boolean {
  if (!items || items.length === 0) return false;
  return items.some((item) => Boolean(item.url?.trim()));
}
