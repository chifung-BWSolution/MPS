import { useEffect, useMemo, useState } from 'react';
import { useQuotationClientProjects } from '@/hooks/useQuotationClientProjects';
import { useQuotationProjectTypes } from '@/hooks/useQuotationProjectTypes';
import { supabase } from '@/lib/supabase';
import { EXPENSE_RELATED_TYPE_PROJECT, EXPENSES_TABLE } from '@/lib/quotationExpenses';
import { INCOMES_TABLE, optionalIsoDate } from '@/lib/quotationIncomes';
import { PROJECTS_TABLE } from '@/lib/projectsHub';
import { SCHEDULES_TABLE } from '@/lib/schedules';
import { isAbortError } from '@/lib/queryCache';
import {
  buildImportantDateEvents,
  type ImportantDateEvent,
  type ImportantDateExpense,
  type ImportantDateHubLink,
  type ImportantDateIncome,
  type ImportantDateSchedule,
} from '@/lib/importantDates';

const PAGE_SIZE = 1000;

type IncomeRow = {
  id: string;
  quotation_client_project_id: string;
  type: string | null;
  installment_number: number | null;
  due_date: string | null;
  billed_amount: number | string | null;
  outstanding: number | string | null;
  payment_status: string | null;
  currency: string | null;
};

type ExpenseRow = {
  id: string;
  related_id: string;
  installment_number: number | null;
  due_date: string | null;
  billed_amount: number | string | null;
  outstanding: number | string | null;
  payment_status: string | null;
  currency: string | null;
  supplier_types?: { display_name: string | null } | { display_name: string | null }[] | null;
  suppliers?: { display_name: string | null } | { display_name: string | null }[] | null;
};

type ScheduleRow = {
  id: string;
  title: string;
  date: string;
  description: string | null;
  related_project_id: string;
};

type HubRow = {
  id: string;
  related_id: string | null;
};

function toAmount(value: number | string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function mapIncome(row: IncomeRow): ImportantDateIncome {
  return {
    id: row.id,
    quotationClientProjectId: row.quotation_client_project_id,
    type: row.type ?? undefined,
    installmentNumber: row.installment_number ?? undefined,
    dueDate: optionalIsoDate(row.due_date),
    billedAmount: toAmount(row.billed_amount),
    outstanding: toAmount(row.outstanding),
    paymentStatus: row.payment_status ?? undefined,
    currency: row.currency ?? undefined,
  };
}

function mapExpense(row: ExpenseRow): ImportantDateExpense {
  return {
    id: row.id,
    relatedId: row.related_id,
    typeLabel: firstJoin(row.supplier_types)?.display_name ?? undefined,
    supplierLabel: firstJoin(row.suppliers)?.display_name ?? undefined,
    installmentNumber: row.installment_number ?? undefined,
    dueDate: optionalIsoDate(row.due_date),
    billedAmount: toAmount(row.billed_amount),
    outstanding: toAmount(row.outstanding),
    paymentStatus: row.payment_status ?? undefined,
    currency: row.currency ?? undefined,
  };
}

function mapSchedule(row: ScheduleRow): ImportantDateSchedule {
  return {
    id: row.id,
    title: row.title,
    date: optionalIsoDate(row.date) ?? row.date,
    description: row.description?.trim() || undefined,
    relatedProjectId: row.related_project_id,
  };
}

async function fetchCalendarRows(): Promise<{
  incomes: ImportantDateIncome[];
  expenses: ImportantDateExpense[];
  schedules: ImportantDateSchedule[];
  hubLinks: ImportantDateHubLink[];
}> {
  const [incomes, expenses, schedules, hubs] = await Promise.all([
    fetchAllRows<IncomeRow>((from, to) =>
      supabase
        .from(INCOMES_TABLE)
        .select(
          'id, quotation_client_project_id, type, installment_number, due_date, billed_amount, outstanding, payment_status, currency',
        )
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<ExpenseRow>((from, to) =>
      supabase
        .from(EXPENSES_TABLE)
        .select(
          'id, related_id, installment_number, due_date, billed_amount, outstanding, payment_status, currency, supplier_types:supplier_types_id (display_name), suppliers:supplier_id (display_name)',
        )
        .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<ScheduleRow>((from, to) =>
      supabase
        .from(SCHEDULES_TABLE)
        .select('id, title, date, description, related_project_id')
        .order('date', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<HubRow>((from, to) =>
      supabase
        .from(PROJECTS_TABLE)
        .select('id, related_id')
        .eq('related_type', 'quotation_client')
        .range(from, to),
    ),
  ]);

  return {
    incomes: incomes.map(mapIncome),
    expenses: expenses.map(mapExpense),
    schedules: schedules.map(mapSchedule),
    hubLinks: hubs
      .map((row) => ({ id: row.id, relatedId: row.related_id?.trim() || '' }))
      .filter((row) => row.id && row.relatedId),
  };
}

export function useImportantDates() {
  const { records: projects, loading: projectsLoading, error: projectsError } = useQuotationClientProjects();
  const { types, loading: typesLoading, error: typesError } = useQuotationProjectTypes();
  const [incomes, setIncomes] = useState<ImportantDateIncome[]>([]);
  const [expenses, setExpenses] = useState<ImportantDateExpense[]>([]);
  const [schedules, setSchedules] = useState<ImportantDateSchedule[]>([]);
  const [hubLinks, setHubLinks] = useState<ImportantDateHubLink[]>([]);
  const [extraLoading, setExtraLoading] = useState(true);
  const [extraError, setExtraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setExtraLoading(true);
    void fetchCalendarRows()
      .then((next) => {
        if (cancelled) return;
        setIncomes(next.incomes);
        setExpenses(next.expenses);
        setSchedules(next.schedules);
        setHubLinks(next.hubLinks);
        setExtraError(null);
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) return;
        setExtraError(err instanceof Error ? err.message : String(err));
        setIncomes([]);
        setExpenses([]);
        setSchedules([]);
        setHubLinks([]);
      })
      .finally(() => {
        if (!cancelled) setExtraLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const events = useMemo<ImportantDateEvent[]>(
    () =>
      buildImportantDateEvents({
        projects,
        types,
        incomes,
        expenses,
        schedules,
        hubLinks,
      }),
    [projects, types, incomes, expenses, schedules, hubLinks],
  );

  return {
    events,
    loading: projectsLoading || typesLoading || extraLoading,
    error: projectsError || typesError || extraError,
  };
}
