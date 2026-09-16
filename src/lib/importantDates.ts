import { formatLocalIsoDate, parseLocalIsoDate } from './quotationIncomes';
import { quotationProjectSubModule } from './quotationProjectNavigation';
import { projectTypeByIdOrCode, type QuotationProjectType } from './quotationProjectTypes';
import type { QuotationSectionModule } from './quotationSectionScope';

export const IMPORTANT_DATE_KINDS = ['project', 'income', 'expense', 'schedule'] as const;
export type ImportantDateKind = (typeof IMPORTANT_DATE_KINDS)[number];

export const IMPORTANT_DATE_BRANDS = ['BWL', 'BWT'] as const;
export type ImportantDateBrand = (typeof IMPORTANT_DATE_BRANDS)[number];

export const IMPORTANT_DATE_VIEWS = ['month', 'week', 'list'] as const;
export type ImportantDateView = (typeof IMPORTANT_DATE_VIEWS)[number];

export const IMPORTANT_DATE_KIND_LABELS: Record<ImportantDateKind, string> = {
  project: '項目日期',
  income: '收入到期',
  expense: '支出到期',
  schedule: '自訂排程',
};

export const PROJECT_DATE_FIELDS = [
  { key: 'inquiryDate', label: '詢價日期' },
  { key: 'signedDate', label: '簽約日期' },
  { key: 'handoverDate', label: '交付日期' },
  { key: 'contractStartDate', label: '合約開始' },
  { key: 'contractEndDate', label: '合約結束' },
] as const;

export type ProjectDateFieldKey = (typeof PROJECT_DATE_FIELDS)[number]['key'];

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;
export const WEEKDAY_FULL_LABELS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'] as const;
export const MONTH_LABELS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
] as const;

export type ImportantDateProject = {
  id: string;
  pitchingId?: string;
  displayName: string;
  clientName?: string;
  projectTypeId?: string;
  inquiryDate?: string;
  signedDate?: string;
  handoverDate?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  mainPmName?: string;
  assignedPmName?: string;
  status?: string;
};

export type ImportantDateIncome = {
  id: string;
  quotationClientProjectId: string;
  type?: string;
  installmentNumber?: number;
  dueDate?: string;
  billedAmount?: number;
  outstanding?: number;
  paymentStatus?: string;
  currency?: string;
};

export type ImportantDateExpense = {
  id: string;
  relatedId: string;
  typeLabel?: string;
  supplierLabel?: string;
  installmentNumber?: number;
  dueDate?: string;
  billedAmount?: number;
  outstanding?: number;
  paymentStatus?: string;
  currency?: string;
};

export type ImportantDateSchedule = {
  id: string;
  title: string;
  date: string;
  description?: string;
  relatedProjectId: string;
};

export type ImportantDateHubLink = {
  id: string;
  relatedId: string;
};

export type ImportantDateEvent = {
  id: string;
  date: string;
  kind: ImportantDateKind;
  brand: ImportantDateBrand | null;
  title: string;
  subtitle?: string;
  projectId: string;
  projectCode?: string;
  projectName: string;
  clientName?: string;
  pmName?: string;
  amount?: number;
  currency?: string;
  outstanding?: number;
  paymentStatus?: string;
  projectStatus?: string;
  section: QuotationSectionModule;
  overdue: boolean;
};

export type ImportantDateKindFilter = Record<ImportantDateKind, boolean>;
export type ImportantDateBrandFilter = Record<ImportantDateBrand, boolean>;

export type ImportantDateStats = {
  total: number;
  periodCount: number;
  projectCount: number;
  incomeCount: number;
  overdueIncomeCount: number;
};

function optionalDate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 10);
}

function todayIso(now = new Date()): string {
  return formatLocalIsoDate(now);
}

type ProjectTypeRef = Pick<QuotationProjectType, 'id' | 'code' | 'display' | 'section'>;

export function brandFromProjectType(
  projectTypeId: string | null | undefined,
  types: readonly ProjectTypeRef[],
): ImportantDateBrand | null {
  const type = projectTypeByIdOrCode(projectTypeId, types);
  if (!type) return null;
  return type.section === 'system-dev' ? 'BWT' : 'BWL';
}

export function sectionFromBrand(brand: ImportantDateBrand | null): QuotationSectionModule {
  return brand === 'BWT' ? 'system-dev' : 'quotation';
}

export function defaultBrandFilters(section: QuotationSectionModule): ImportantDateBrandFilter {
  return {
    BWL: section === 'quotation',
    BWT: section === 'system-dev',
  };
}

export function defaultKindFilters(): ImportantDateKindFilter {
  return {
    project: true,
    income: true,
    expense: true,
    schedule: true,
  };
}

export function selectedKeys<T extends string>(filter: Record<T, boolean>): T[] {
  return (Object.keys(filter) as T[]).filter((key) => filter[key]);
}

function projectPmName(project: ImportantDateProject): string | undefined {
  return project.mainPmName?.trim() || project.assignedPmName?.trim() || undefined;
}

function incomeTitle(row: ImportantDateIncome): string {
  const type = row.type?.trim() || '收入';
  return row.installmentNumber != null ? `${type} 第${row.installmentNumber}期` : type;
}

function expenseTitle(row: ImportantDateExpense): string {
  const label = row.supplierLabel?.trim() || row.typeLabel?.trim() || '支出';
  return row.installmentNumber != null ? `${label} 第${row.installmentNumber}期` : label;
}

function isIncomeOverdue(row: ImportantDateIncome, today: string): boolean {
  const due = optionalDate(row.dueDate);
  if (!due || due >= today) return false;
  if (row.paymentStatus === 'Received') return false;
  return (row.outstanding ?? 0) > 0 || row.paymentStatus === 'Not Received';
}

function isExpenseOverdue(row: ImportantDateExpense, today: string): boolean {
  const due = optionalDate(row.dueDate);
  if (!due || due >= today) return false;
  if (row.paymentStatus === 'Paid') return false;
  return (row.outstanding ?? 0) > 0 || row.paymentStatus === 'Not Paid';
}

function eventBase(
  project: ImportantDateProject,
  types: readonly ProjectTypeRef[],
): Pick<
  ImportantDateEvent,
  'brand' | 'projectId' | 'projectCode' | 'projectName' | 'clientName' | 'pmName' | 'projectStatus' | 'section'
> {
  const brand = brandFromProjectType(project.projectTypeId, types);
  return {
    brand,
    projectId: project.id,
    projectCode: project.pitchingId?.trim() || undefined,
    projectName: project.displayName,
    clientName: project.clientName?.trim() || undefined,
    pmName: projectPmName(project),
    projectStatus: project.status,
    section: sectionFromBrand(brand),
  };
}

export function buildProjectDateEvents(
  projects: readonly ImportantDateProject[],
  types: readonly ProjectTypeRef[],
): ImportantDateEvent[] {
  const events: ImportantDateEvent[] = [];
  for (const project of projects) {
    const base = eventBase(project, types);
    for (const field of PROJECT_DATE_FIELDS) {
      const date = optionalDate(project[field.key]);
      if (!date) continue;
      events.push({
        ...base,
        id: `project:${project.id}:${field.key}`,
        date,
        kind: 'project',
        title: field.label,
        subtitle: project.displayName,
        overdue: false,
      });
    }
  }
  return events;
}

export function buildIncomeDateEvents(
  incomes: readonly ImportantDateIncome[],
  projectsById: ReadonlyMap<string, ImportantDateProject>,
  types: readonly ProjectTypeRef[],
  today = todayIso(),
): ImportantDateEvent[] {
  const events: ImportantDateEvent[] = [];
  for (const row of incomes) {
    const date = optionalDate(row.dueDate);
    const project = projectsById.get(row.quotationClientProjectId);
    if (!date || !project) continue;
    events.push({
      ...eventBase(project, types),
      id: `income:${row.id}`,
      date,
      kind: 'income',
      title: incomeTitle(row),
      subtitle: project.displayName,
      amount: row.billedAmount,
      currency: row.currency,
      outstanding: row.outstanding,
      paymentStatus: row.paymentStatus,
      overdue: isIncomeOverdue(row, today),
    });
  }
  return events;
}

export function buildExpenseDateEvents(
  expenses: readonly ImportantDateExpense[],
  hubByProjectId: ReadonlyMap<string, string>,
  projectsById: ReadonlyMap<string, ImportantDateProject>,
  types: readonly ProjectTypeRef[],
  today = todayIso(),
): ImportantDateEvent[] {
  const events: ImportantDateEvent[] = [];
  for (const row of expenses) {
    const date = optionalDate(row.dueDate);
    const projectId = hubByProjectId.get(row.relatedId);
    const project = projectId ? projectsById.get(projectId) : undefined;
    if (!date || !project) continue;
    events.push({
      ...eventBase(project, types),
      id: `expense:${row.id}`,
      date,
      kind: 'expense',
      title: expenseTitle(row),
      subtitle: project.displayName,
      amount: row.billedAmount,
      currency: row.currency,
      outstanding: row.outstanding,
      paymentStatus: row.paymentStatus,
      overdue: isExpenseOverdue(row, today),
    });
  }
  return events;
}

export function buildScheduleDateEvents(
  schedules: readonly ImportantDateSchedule[],
  hubByProjectId: ReadonlyMap<string, string>,
  projectsById: ReadonlyMap<string, ImportantDateProject>,
  types: readonly ProjectTypeRef[],
): ImportantDateEvent[] {
  const events: ImportantDateEvent[] = [];
  for (const row of schedules) {
    const date = optionalDate(row.date);
    const projectId = hubByProjectId.get(row.relatedProjectId);
    const project = projectId ? projectsById.get(projectId) : undefined;
    if (!date || !project) continue;
    events.push({
      ...eventBase(project, types),
      id: `schedule:${row.id}`,
      date,
      kind: 'schedule',
      title: row.title,
      subtitle: row.description?.trim() || project.displayName,
      overdue: false,
    });
  }
  return events;
}

export function buildImportantDateEvents(input: {
  projects: readonly ImportantDateProject[];
  types: readonly ProjectTypeRef[];
  incomes: readonly ImportantDateIncome[];
  expenses: readonly ImportantDateExpense[];
  schedules: readonly ImportantDateSchedule[];
  hubLinks: readonly ImportantDateHubLink[];
  today?: string;
}): ImportantDateEvent[] {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const hubByProjectId = new Map(
    input.hubLinks
      .map((link) => [link.id.trim(), link.relatedId.trim()] as const)
      .filter(([id, relatedId]) => id && relatedId),
  );
  const today = input.today ?? todayIso();
  return [
    ...buildProjectDateEvents(input.projects, input.types),
    ...buildIncomeDateEvents(input.incomes, projectsById, input.types, today),
    ...buildExpenseDateEvents(input.expenses, hubByProjectId, projectsById, input.types, today),
    ...buildScheduleDateEvents(input.schedules, hubByProjectId, projectsById, input.types),
  ].sort(compareImportantDateEvents);
}

export function compareImportantDateEvents(a: ImportantDateEvent, b: ImportantDateEvent): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const kindOrder: Record<ImportantDateKind, number> = {
    project: 0,
    schedule: 1,
    income: 2,
    expense: 3,
  };
  if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
  return a.title.localeCompare(b.title, 'zh-Hant');
}

export function filterImportantDateEvents(
  events: readonly ImportantDateEvent[],
  brands: ImportantDateBrandFilter,
  kinds: ImportantDateKindFilter,
): ImportantDateEvent[] {
  const brandOn = selectedKeys(brands);
  return events.filter((event) => {
    if (!kinds[event.kind]) return false;
    if (brandOn.length === 0) return false;
    if (event.brand == null) return true;
    return brands[event.brand];
  });
}

export function startOfLocalWeek(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = next.getDay();
  const offset = day === 0 ? 6 : day - 1;
  next.setDate(next.getDate() - offset);
  return next;
}

export function endOfLocalWeek(date: Date): Date {
  const start = startOfLocalWeek(date);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function periodRange(cursor: Date, view: ImportantDateView): { start: string; end: string } {
  if (view === 'week') {
    return {
      start: formatLocalIsoDate(startOfLocalWeek(cursor)),
      end: formatLocalIsoDate(endOfLocalWeek(cursor)),
    };
  }
  return {
    start: formatLocalIsoDate(startOfLocalMonth(cursor)),
    end: formatLocalIsoDate(endOfLocalMonth(cursor)),
  };
}

export function shiftPeriod(cursor: Date, view: ImportantDateView, delta: number): Date {
  if (view === 'week') return addLocalDays(cursor, delta * 7);
  return new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
}

export function eventsInRange(
  events: readonly ImportantDateEvent[],
  start: string,
  end: string,
): ImportantDateEvent[] {
  return events.filter((event) => event.date >= start && event.date <= end);
}

export function groupEventsByDate(
  events: readonly ImportantDateEvent[],
): Array<{ date: string; events: ImportantDateEvent[] }> {
  const groups = new Map<string, ImportantDateEvent[]>();
  for (const event of events) {
    const list = groups.get(event.date);
    if (list) list.push(event);
    else groups.set(event.date, [event]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, events: list }));
}

export function monthGridDays(cursor: Date): Date[] {
  const start = startOfLocalWeek(startOfLocalMonth(cursor));
  const end = endOfLocalWeek(endOfLocalMonth(cursor));
  const days: Date[] = [];
  for (let day = start; day <= end; day = addLocalDays(day, 1)) {
    days.push(day);
  }
  return days;
}

export function weekDays(cursor: Date): Date[] {
  const start = startOfLocalWeek(cursor);
  return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
}

export function weekdayIndex(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function periodTitle(cursor: Date, view: ImportantDateView): string {
  if (view === 'week') {
    const start = startOfLocalWeek(cursor);
    const end = endOfLocalWeek(cursor);
    return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getFullYear()}`;
}

export function listDateTitle(iso: string): string {
  const date = parseLocalIsoDate(iso);
  if (!date) return iso;
  return `${date.getMonth() + 1}/${date.getDate()} ${WEEKDAY_FULL_LABELS[weekdayIndex(date)]}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function summarizeImportantDates(
  events: readonly ImportantDateEvent[],
  periodStart: string,
  periodEnd: string,
  today = todayIso(),
): ImportantDateStats {
  const inPeriod = eventsInRange(events, periodStart, periodEnd);
  const projectIds = new Set(inPeriod.map((event) => event.projectId));
  const incomes = inPeriod.filter((event) => event.kind === 'income');
  return {
    total: events.length,
    periodCount: inPeriod.length,
    projectCount: projectIds.size,
    incomeCount: incomes.length,
    overdueIncomeCount: events.filter(
      (event) => event.kind === 'income' && event.overdue && event.date <= today,
    ).length,
  };
}

export function importantDateProjectHash(
  event: Pick<ImportantDateEvent, 'section' | 'projectId' | 'projectStatus'>,
): string {
  const page = quotationProjectSubModule(event.projectStatus);
  const params = new URLSearchParams();
  params.set('id', event.projectId);
  return `${event.section}/${page}?${params.toString()}`;
}

export function formatImportantDateAmount(amount: number | undefined, currency?: string): string | undefined {
  if (amount == null || !Number.isFinite(amount)) return undefined;
  const value = `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return currency ? `${value} ${currency}` : value;
}
