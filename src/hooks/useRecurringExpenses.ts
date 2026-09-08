import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import {
  RECURRING_EXPENSES_TABLE,
  isRecurringExpenseFrequency,
  isRecurringExpenseStatus,
  optionalIsoDate,
} from '@/lib/quotationExpenses';
import type { RecurringExpenseListRow } from '@/lib/recurringExpensesList';

type DbRow = {
  id: string;
  related_type: string;
  related_id: string;
  supplier_types_id: string;
  supplier_id: string;
  credit_card_id: string;
  billed_amount: number | string;
  remarks: string | null;
  frequency: string;
  anchor_date: string | null;
  next_occurrence_date: string | null;
  automation_run_count: number | string | null;
  last_generated_at: string | null;
  last_generated_due_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type LookupMaps = {
  projects: Map<string, string>;
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

async function loadLookups(rows: DbRow[]): Promise<LookupMaps> {
  const projectIds = uniqueIds(rows.map((row) => row.related_id));
  const typeIds = uniqueIds(rows.map((row) => row.supplier_types_id));
  const supplierIds = uniqueIds(rows.map((row) => row.supplier_id));
  const cardIds = uniqueIds(rows.map((row) => row.credit_card_id));

  const [projectsRes, typesRes, suppliersRes, cardsRes] = await Promise.all([
    projectIds.length
      ? supabase.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    typeIds.length
      ? supabase.from('supplier_types').select('id, display_name').in('id', typeIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? supabase.from('suppliers').select('id, display_name').in('id', supplierIds)
      : Promise.resolve({ data: [], error: null }),
    cardIds.length
      ? supabase.from('credit_cards').select('id, label, last_four, bank').in('id', cardIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (typesRes.error) throw new Error(typesRes.error.message);
  if (suppliersRes.error) throw new Error(suppliersRes.error.message);
  if (cardsRes.error) throw new Error(cardsRes.error.message);

  return {
    projects: new Map(
      (projectsRes.data ?? []).map((item) => [String(item.id), optionalText(item.name) ?? '']),
    ),
    types: new Map(
      (typesRes.data ?? []).map((item) => [String(item.id), optionalText(item.display_name) ?? '']),
    ),
    suppliers: new Map(
      (suppliersRes.data ?? []).map((item) => [String(item.id), optionalText(item.display_name) ?? '']),
    ),
    cards: new Map(
      (cardsRes.data ?? []).map((item) => [
        String(item.id),
        {
          label: item.label ?? '',
          lastFour: item.last_four,
          bank: item.bank ?? '',
        },
      ]),
    ),
  };
}

function mapRow(row: DbRow, lookups: LookupMaps): RecurringExpenseListRow {
  const card = lookups.cards.get(row.credit_card_id);
  return {
    id: row.id,
    relatedType: row.related_type,
    relatedId: row.related_id,
    projectName: lookups.projects.get(row.related_id)?.trim() || '未指定項目',
    supplierTypesId: row.supplier_types_id,
    supplierId: row.supplier_id,
    typeLabel: lookups.types.get(row.supplier_types_id)?.trim() || '未分類',
    supplierLabel: lookups.suppliers.get(row.supplier_id)?.trim() || '未指定供應商',
    creditCardId: row.credit_card_id,
    creditCardLabel: card ? formatCreditCardOptionLabel(card) : '—',
    billedAmount: toAmount(row.billed_amount),
    remarks: optionalText(row.remarks),
    frequency: isRecurringExpenseFrequency(row.frequency) ? row.frequency : 'monthly',
    anchorDate: optionalIsoDate(row.anchor_date),
    nextOccurrenceDate: optionalIsoDate(row.next_occurrence_date),
    automationRunCount: row.automation_run_count == null ? 0 : Number(row.automation_run_count) || 0,
    lastGeneratedAt: optionalText(row.last_generated_at),
    lastGeneratedDueDate: optionalIsoDate(row.last_generated_due_date),
    status: isRecurringExpenseStatus(row.status) ? row.status : 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useRecurringExpenses() {
  const [rows, setRows] = useState<RecurringExpenseListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from(RECURRING_EXPENSES_TABLE)
      .select('*')
      .order('next_occurrence_date', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    try {
      const lookups = await loadLookups((data ?? []) as DbRow[]);
      setError(null);
      setRows(((data ?? []) as DbRow[]).map((row) => mapRow(row, lookups)));
      setLastSyncedAt(new Date().toISOString());
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : '載入關聯資料失敗');
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, lastSyncedAt, refresh };
}
