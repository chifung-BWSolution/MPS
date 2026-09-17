import { useCallback, useEffect, useState } from 'react';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import { EXPENSES_TABLE } from '@/lib/quotationExpenses';
import { INCOMES_TABLE, optionalIsoDate } from '@/lib/quotationIncomes';
import { PROJECTS_TABLE } from '@/lib/projectsHub';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/lib/resolveProjectHub';
import { parseSystemCurrency } from '@/lib/currency';
import { isAbortError } from '@/lib/queryCache';
import { supabase } from '@/lib/supabase';
import type { FinanceExpenseRow, FinanceIncomeRow } from '@/lib/financeLedgers';

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

type IncomeDbRow = {
  id: string;
  quotation_client_project_id: string;
  type: string | null;
  installment_number: number | null;
  currency: string | null;
  billed_amount: number | string | null;
  due_date: string | null;
  payment_amount: number | string | null;
  payment_date: string | null;
  payment_method: string | null;
  payment_status: string | null;
  outstanding: number | string | null;
  bad_debt: number | string | null;
  remarks: string | null;
  created_at: string;
};

type ExpenseDbRow = {
  id: string;
  related_type: string | null;
  related_id: string;
  supplier_types_id: string | null;
  supplier_id: string | null;
  installment_number: number | null;
  currency: string | null;
  billed_amount: number | string | null;
  due_date: string | null;
  payment_amount: number | string | null;
  payment_date: string | null;
  payment_method: string | null;
  payment_status: string | null;
  outstanding: number | string | null;
  bad_debt: number | string | null;
  remarks: string | null;
  credit_card_id: string | null;
  created_at: string;
};

type ProjectDbRow = {
  id: string;
  name: string | null;
  related_type: string | null;
  related_id: string | null;
};

type QcpDbRow = {
  id: string;
  display_name: string | null;
  client_name: string | null;
  status: string | null;
};

type LookupMaps = {
  projects: Map<string, ProjectDbRow>;
  qcps: Map<string, { displayName: string; clientName: string; status?: string }>;
  websites: Map<string, string>;
  types: Map<string, string>;
  suppliers: Map<string, string>;
  cards: Map<string, { label: string; lastFour: string; bank: string }>;
};

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function toAmount(value: number | string | null | undefined): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
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

async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function loadLookups(incomes: IncomeDbRow[], expenses: ExpenseDbRow[]): Promise<LookupMaps> {
  const projectIds = uniqueIds(
    expenses.filter((row) => (row.related_type ?? 'project') === 'project').map((row) => row.related_id),
  );
  const projects = await fetchInChunks<ProjectDbRow>(projectIds, (chunk) =>
    supabase.from(PROJECTS_TABLE).select('id, name, related_type, related_id').in('id', chunk),
  );

  const qcpIds = uniqueIds([
    ...incomes.map((row) => row.quotation_client_project_id),
    ...expenses.filter((row) => row.related_type === 'quotation_client').map((row) => row.related_id),
    ...projects.filter((row) => row.related_type === 'quotation_client').map((row) => row.related_id),
  ]);
  const websiteIds = uniqueIds([
    ...expenses.filter((row) => row.related_type === 'webandsystem').map((row) => row.related_id),
    ...projects.filter((row) => row.related_type === 'webandsystem').map((row) => row.related_id),
  ]);
  const typeIds = uniqueIds(expenses.map((row) => row.supplier_types_id));
  const supplierIds = uniqueIds(expenses.map((row) => row.supplier_id));
  const cardIds = uniqueIds(expenses.map((row) => row.credit_card_id));

  const [qcps, websites, types, suppliers, cards] = await Promise.all([
    fetchInChunks<QcpDbRow>(qcpIds, (chunk) =>
      supabase
        .from(QUOTATION_CLIENT_PROJECT_TABLE)
        .select('id, display_name, client_name, status')
        .in('id', chunk),
    ),
    fetchInChunks<{ id: string; website_name: string | null }>(websiteIds, (chunk) =>
      supabase.from('webandsystem_list').select('id, website_name').in('id', chunk),
    ),
    fetchInChunks<{ id: string; display_name: string | null }>(typeIds, (chunk) =>
      supabase.from('supplier_types').select('id, display_name').in('id', chunk),
    ),
    fetchInChunks<{ id: string; display_name: string | null }>(supplierIds, (chunk) =>
      supabase.from('suppliers').select('id, display_name').in('id', chunk),
    ),
    fetchInChunks<{ id: string; label: string | null; last_four: string; bank: string | null }>(cardIds, (chunk) =>
      supabase.from('credit_cards').select('id, label, last_four, bank').in('id', chunk),
    ),
  ]);

  return {
    projects: new Map(projects.map((row) => [String(row.id), row])),
    qcps: new Map(
      qcps.map((row) => [
        String(row.id),
        {
          displayName: optionalText(row.display_name) ?? '',
          clientName: optionalText(row.client_name) ?? '',
          status: optionalText(row.status),
        },
      ]),
    ),
    websites: new Map(
      websites.map((row) => [String(row.id), optionalText(row.website_name) ?? '']),
    ),
    types: new Map(types.map((row) => [String(row.id), optionalText(row.display_name) ?? ''])),
    suppliers: new Map(suppliers.map((row) => [String(row.id), optionalText(row.display_name) ?? ''])),
    cards: new Map(
      cards.map((row) => [
        String(row.id),
        { label: row.label ?? '', lastFour: row.last_four, bank: row.bank ?? '' },
      ]),
    ),
  };
}

function resolveExpenseProject(row: ExpenseDbRow, lookups: LookupMaps) {
  if (row.related_type === 'quotation_client') {
    const qcp = lookups.qcps.get(row.related_id);
    return {
      projectName: qcp?.displayName.trim() || '未指定項目',
      clientName: qcp?.clientName.trim() || undefined,
      quotationClientProjectId: row.related_id,
      projectStatus: qcp?.status,
    };
  }
  if (row.related_type === 'webandsystem') {
    return {
      projectName: lookups.websites.get(row.related_id)?.trim() || '未指定項目',
      websiteId: row.related_id,
    };
  }

  const project = lookups.projects.get(row.related_id);
  if (!project) return { projectName: '未指定項目' };
  if (project.related_type === 'quotation_client' && project.related_id) {
    const qcp = lookups.qcps.get(project.related_id);
    return {
      projectName: qcp?.displayName.trim() || optionalText(project.name) || '未指定項目',
      clientName: qcp?.clientName.trim() || undefined,
      quotationClientProjectId: project.related_id,
      projectStatus: qcp?.status,
    };
  }
  if (project.related_type === 'webandsystem' && project.related_id) {
    return {
      projectName: lookups.websites.get(project.related_id)?.trim() || optionalText(project.name) || '未指定項目',
      websiteId: project.related_id,
    };
  }
  return { projectName: optionalText(project.name) || '未指定項目' };
}

function mapIncome(row: IncomeDbRow, lookups: LookupMaps): FinanceIncomeRow {
  const qcp = lookups.qcps.get(row.quotation_client_project_id);
  return {
    kind: 'income',
    id: row.id,
    projectName: qcp?.displayName.trim() || '未指定項目',
    clientName: qcp?.clientName.trim() || '—',
    quotationClientProjectId: row.quotation_client_project_id,
    projectStatus: qcp?.status,
    typeLabel: optionalText(row.type) || '未分類',
    installmentNumber: row.installment_number ?? undefined,
    currency: parseSystemCurrency(row.currency),
    billedAmount: toAmount(row.billed_amount),
    paymentAmount: toAmount(row.payment_amount),
    outstanding: toAmount(row.outstanding),
    badDebt: toAmount(row.bad_debt),
    dueDate: optionalIsoDate(row.due_date),
    paymentDate: optionalIsoDate(row.payment_date),
    paymentMethod: optionalText(row.payment_method),
    paymentStatus: optionalText(row.payment_status),
    remarks: optionalText(row.remarks),
    createdAt: row.created_at,
  };
}

function mapExpense(row: ExpenseDbRow, lookups: LookupMaps): FinanceExpenseRow {
  const project = resolveExpenseProject(row, lookups);
  const card = row.credit_card_id ? lookups.cards.get(row.credit_card_id) : undefined;
  return {
    kind: 'expense',
    id: row.id,
    projectName: project.projectName,
    clientName: project.clientName,
    quotationClientProjectId: project.quotationClientProjectId,
    websiteId: project.websiteId,
    projectStatus: project.projectStatus,
    typeLabel: (row.supplier_types_id && lookups.types.get(row.supplier_types_id)?.trim()) || '未分類',
    supplierLabel: (row.supplier_id && lookups.suppliers.get(row.supplier_id)?.trim()) || '未指定供應商',
    installmentNumber: row.installment_number ?? undefined,
    currency: parseSystemCurrency(row.currency),
    billedAmount: toAmount(row.billed_amount),
    paymentAmount: toAmount(row.payment_amount),
    outstanding: toAmount(row.outstanding),
    badDebt: toAmount(row.bad_debt),
    dueDate: optionalIsoDate(row.due_date),
    paymentDate: optionalIsoDate(row.payment_date),
    paymentMethod: optionalText(row.payment_method),
    paymentStatus: optionalText(row.payment_status),
    creditCardLabel: card ? formatCreditCardOptionLabel(card) : undefined,
    remarks: optionalText(row.remarks),
    createdAt: row.created_at,
  };
}

export type UseFinanceLedgersOptions = {
  incomes?: boolean;
  expenses?: boolean;
};

export function useFinanceLedgers(options: UseFinanceLedgersOptions = { incomes: true, expenses: true }) {
  const loadIncomes = options.incomes !== false;
  const loadExpenses = options.expenses !== false;
  const [incomes, setIncomes] = useState<FinanceIncomeRow[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [incomeRows, expenseRows] = await Promise.all([
        loadIncomes
          ? fetchAllRows<IncomeDbRow>((from, to) =>
              supabase
                .from(INCOMES_TABLE)
                .select(
                  'id, quotation_client_project_id, type, installment_number, currency, billed_amount, due_date, payment_amount, payment_date, payment_method, payment_status, outstanding, bad_debt, remarks, created_at',
                )
                .order('due_date', { ascending: true })
                .range(from, to),
            )
          : Promise.resolve([]),
        loadExpenses
          ? fetchAllRows<ExpenseDbRow>((from, to) =>
              supabase
                .from(EXPENSES_TABLE)
                .select(
                  'id, related_type, related_id, supplier_types_id, supplier_id, installment_number, currency, billed_amount, due_date, payment_amount, payment_date, payment_method, payment_status, outstanding, bad_debt, remarks, credit_card_id, created_at',
                )
                .order('due_date', { ascending: true })
                .range(from, to),
            )
          : Promise.resolve([]),
      ]);

      const lookups = await loadLookups(incomeRows, expenseRows);
      setIncomes(incomeRows.map((row) => mapIncome(row, lookups)));
      setExpenses(expenseRows.map((row) => mapExpense(row, lookups)));
      setError(null);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : '載入帳務資料失敗');
      setIncomes([]);
      setExpenses([]);
    }
    setLoading(false);
  }, [loadIncomes, loadExpenses]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { incomes, expenses, loading, error, lastSyncedAt, refresh };
}

export function useFinanceIncomes() {
  return useFinanceLedgers({ incomes: true, expenses: false });
}

export function useFinanceExpenses() {
  return useFinanceLedgers({ incomes: false, expenses: true });
}
