import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';
import {
  financeProjectTypeFromRef,
  financeProjectTypeKeyFromType,
  indexFinanceProjectTypes,
  pickFinanceProjectType,
  resolveFinanceProjectTypeKey,
  type FinanceProjectTypeKey,
} from '@/lib/financeProjectType';
import { QUOTATION_PROJECT_TYPES_TABLE } from '@/lib/quotationProjectTypes';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/lib/resolveProjectHub';
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

type ProjectLookupRow = {
  id: string;
  name: string | null;
  related_type: string | null;
  related_id: string | null;
};

type LookupMaps = {
  projects: Map<string, { name: string; projectTypeKey?: FinanceProjectTypeKey }>;
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

  const [projectsRes, typesRes, suppliersRes, cardsRes, projectTypesRes] = await Promise.all([
    projectIds.length
      ? supabase.from('projects').select('id, name, related_type, related_id').in('id', projectIds)
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
    supabase.from(QUOTATION_PROJECT_TYPES_TABLE).select('id, code, display'),
  ]);

  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (typesRes.error) throw new Error(typesRes.error.message);
  if (suppliersRes.error) throw new Error(suppliersRes.error.message);
  if (cardsRes.error) throw new Error(cardsRes.error.message);
  if (projectTypesRes.error) throw new Error(projectTypesRes.error.message);

  const projects = (projectsRes.data ?? []) as ProjectLookupRow[];
  const projectTypeByRef = indexFinanceProjectTypes(
    (projectTypesRes.data ?? []) as { id: string; code: string; display: string }[],
  );
  const qcpIds = uniqueIds(
    projects.filter((row) => row.related_type === 'quotation_client').map((row) => row.related_id),
  );
  const websiteIds = uniqueIds(
    projects.filter((row) => row.related_type === 'webandsystem').map((row) => row.related_id),
  );
  const [qcpRes, websiteRes, websiteProjectRes] = await Promise.all([
    qcpIds.length
      ? supabase.from(QUOTATION_CLIENT_PROJECT_TABLE).select('id, project_types').in('id', qcpIds)
      : Promise.resolve({ data: [], error: null }),
    websiteIds.length
      ? supabase.from('webandsystem_list').select('id, profile_type').in('id', websiteIds)
      : Promise.resolve({ data: [], error: null }),
    websiteIds.length
      ? supabase
          .from(QUOTATION_CLIENT_PROJECT_TABLE)
          .select('webandsystem_list_id, project_types')
          .in('webandsystem_list_id', websiteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (qcpRes.error) throw new Error(qcpRes.error.message);
  if (websiteRes.error) throw new Error(websiteRes.error.message);
  if (websiteProjectRes.error) throw new Error(websiteProjectRes.error.message);

  const qcpTypeById = new Map<string, FinanceProjectTypeKey | undefined>();
  for (const row of qcpRes.data ?? []) {
    qcpTypeById.set(
      String(row.id),
      financeProjectTypeKeyFromType(financeProjectTypeFromRef(row.project_types, projectTypeByRef)),
    );
  }
  const linkedTypesByWebsite = new Map<string, Array<{ code: string; display: string }>>();
  for (const row of websiteProjectRes.data ?? []) {
    const websiteId = optionalText(row.webandsystem_list_id);
    const projectType =
      financeProjectTypeFromRef(row.project_types, projectTypeByRef) ??
      (optionalText(row.project_types) ? { code: String(row.project_types).trim(), display: '' } : undefined);
    if (!websiteId || !projectType) continue;
    const list = linkedTypesByWebsite.get(websiteId) ?? [];
    list.push(projectType);
    linkedTypesByWebsite.set(websiteId, list);
  }
  const websiteTypeById = new Map<string, FinanceProjectTypeKey | undefined>();
  for (const row of websiteRes.data ?? []) {
    const picked = pickFinanceProjectType(linkedTypesByWebsite.get(String(row.id)) ?? []);
    websiteTypeById.set(
      String(row.id),
      resolveFinanceProjectTypeKey({
        projectType: picked.projectType,
        profileType: row.profile_type,
        allowProfileFallback: picked.allowProfileFallback,
      }),
    );
  }

  return {
    projects: new Map(
      projects.map((item) => {
        const relatedId = optionalText(item.related_id);
        const projectTypeKey =
          item.related_type === 'quotation_client'
            ? qcpTypeById.get(relatedId ?? '')
            : item.related_type === 'webandsystem'
              ? websiteTypeById.get(relatedId ?? '')
              : undefined;
        return [String(item.id), { name: optionalText(item.name) ?? '', projectTypeKey }];
      }),
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
    projectName: lookups.projects.get(row.related_id)?.name.trim() || '未指定項目',
    projectTypeKey: lookups.projects.get(row.related_id)?.projectTypeKey,
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
