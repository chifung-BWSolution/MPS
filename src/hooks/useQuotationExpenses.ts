import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CREATE_RECURRING_EXPENSE_RPC,
  EXPENSES_TABLE,
  EXPENSE_PAYMENT_RECORDS_BUCKET,
  EXPENSE_RELATED_TYPE_PROJECT,
  RECURRING_EXPENSES_TABLE,
  expenseCreditCardId,
  expenseGroupKey,
  expensePaymentRecordStoragePath,
  isAllowedPaymentRecordFile,
  isExpensePaymentMethod,
  isExpensePaymentStatus,
  isMissingRecurringRelationship,
  isRecurringExpenseFrequency,
  isRecurringExpenseStatus,
  nextRecurringDueDate,
  optionalIsoDate,
  paidRecurringExpenseFields,
  type PaymentRecordFileAction,
  type QuotationExpense,
  type QuotationExpenseInput,
  type RecurringExpenseFrequency,
  type RecurringExpenseStatus,
} from '@/lib/quotationExpenses';
import { formatCreditCardOptionLabel } from '@/lib/creditCards';

type SupplierTypeJoin = {
  id: string;
  display_name: string | null;
  categories?: string | null;
} | null;

type SupplierJoin = {
  id: string;
  display_name: string | null;
  supplier_types_id: string | null;
} | null;

type CreditCardJoin = {
  id: string;
  label: string | null;
  last_four: string;
  bank: string | null;
} | null;

type RecurringJoin = {
  id: string;
  frequency: string | null;
  next_occurrence_date: string | null;
  automation_run_count: number | string | null;
  status: string | null;
} | null;

type DbRow = {
  id: string;
  related_type: string;
  related_id: string;
  supplier_types_id: string;
  supplier_id: string;
  installment_number: number | null;
  billed_amount: number | string;
  due_date: string | null;
  payment_amount: number | string;
  payment_date: string | null;
  payment_method: string | null;
  credit_card_id: string | null;
  payment_status: string | null;
  outstanding: number | string;
  bad_debt: number | string;
  remarks: string | null;
  payment_record_file_name: string | null;
  payment_record_file_url: string | null;
  payment_record_storage_path: string | null;
  payment_record_file_size: number | string | null;
  payment_record_mime_type: string | null;
  recurring_expense_id: string | null;
  created_at: string;
  updated_at: string;
  supplier_types?: SupplierTypeJoin | SupplierTypeJoin[];
  suppliers?: SupplierJoin | SupplierJoin[];
  credit_card?: CreditCardJoin | CreditCardJoin[];
  recurring?: RecurringJoin | RecurringJoin[];
};

export type QuotationExpenseWriteInput = QuotationExpenseInput & {
  file?: File | null;
  paymentRecordAction?: PaymentRecordFileAction;
  frequency?: RecurringExpenseFrequency | null;
};

const EXPENSE_SELECT_CORE = `
  *,
  supplier_types:supplier_types_id (id, display_name, categories),
  suppliers:supplier_id (id, display_name, supplier_types_id),
  credit_card:credit_cards!expenses_credit_card_id_fkey (id, label, last_four, bank)
`;

const EXPENSE_SELECT = `${EXPENSE_SELECT_CORE},
  recurring:recurring_expenses!expenses_recurring_expense_id_fkey (
    id, frequency, next_occurrence_date, automation_run_count, status
  )
`;

async function selectExpenseRow<T>(
  run: (columns: string) => PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const withRecurring = await run(EXPENSE_SELECT);
  if (!withRecurring.error || !isMissingRecurringRelationship(withRecurring.error.message)) {
    return withRecurring;
  }
  return run(EXPENSE_SELECT_CORE);
}

function compareExpenses(a: QuotationExpense, b: QuotationExpense): number {
  const aN = a.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  const bN = b.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  if (aN !== bN) return aN - bN;
  return a.createdAt.localeCompare(b.createdAt);
}

function toAmount(value: number | string | null | undefined): number {
  const n = value == null ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapRow(row: DbRow): QuotationExpense {
  const typeJoin = firstJoin(row.supplier_types);
  const supplierJoin = firstJoin(row.suppliers);
  const cardJoin = firstJoin(row.credit_card);
  const recurringJoin = firstJoin(row.recurring);
  const supplierTypesId = row.supplier_types_id;
  const supplierId = row.supplier_id;
  const creditCardId = expenseCreditCardId(row.payment_method, row.credit_card_id);
  const recurringExpenseId = row.recurring_expense_id?.trim() || undefined;
  return {
    id: row.id,
    relatedType: row.related_type,
    relatedId: row.related_id,
    supplierTypesId,
    supplierId,
    typeLabel: optionalText(typeJoin?.display_name) ?? '未分類',
    supplierLabel: optionalText(supplierJoin?.display_name) ?? '未指定供應商',
    groupKey: expenseGroupKey(supplierTypesId, supplierId),
    installmentNumber: row.installment_number ?? undefined,
    billedAmount: toAmount(row.billed_amount),
    dueDate: optionalIsoDate(row.due_date),
    paymentAmount: toAmount(row.payment_amount),
    paymentDate: optionalIsoDate(row.payment_date),
    paymentMethod: isExpensePaymentMethod(row.payment_method) ? row.payment_method : undefined,
    creditCardId: creditCardId ?? undefined,
    creditCardLabel: cardJoin
      ? formatCreditCardOptionLabel({
          label: cardJoin.label ?? '',
          lastFour: cardJoin.last_four,
          bank: cardJoin.bank ?? '',
        })
      : undefined,
    paymentStatus: isExpensePaymentStatus(row.payment_status) ? row.payment_status : undefined,
    outstanding: toAmount(row.outstanding),
    badDebt: toAmount(row.bad_debt),
    remarks: optionalText(row.remarks),
    paymentRecordFileName: optionalText(row.payment_record_file_name),
    paymentRecordFileUrl: optionalText(row.payment_record_file_url),
    paymentRecordStoragePath: optionalText(row.payment_record_storage_path),
    paymentRecordFileSize: row.payment_record_file_size == null ? undefined : Number(row.payment_record_file_size) || undefined,
    paymentRecordMimeType: optionalText(row.payment_record_mime_type),
    recurringExpenseId,
    recurringFrequency: isRecurringExpenseFrequency(recurringJoin?.frequency)
      ? recurringJoin?.frequency
      : undefined,
    recurringNextOccurrenceDate: optionalIsoDate(recurringJoin?.next_occurrence_date),
    recurringAutomationRunCount: recurringJoin?.automation_run_count == null
      ? undefined
      : Number(recurringJoin.automation_run_count) || 0,
    recurringStatus: isRecurringExpenseStatus(recurringJoin?.status) ? recurringJoin?.status : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fileMetaColumns(input: QuotationExpenseInput) {
  return {
    payment_record_file_name: input.paymentRecordFileName?.trim() || null,
    payment_record_file_url: input.paymentRecordFileUrl?.trim() || null,
    payment_record_storage_path: input.paymentRecordStoragePath?.trim() || null,
    payment_record_file_size: input.paymentRecordFileSize ?? null,
    payment_record_mime_type: input.paymentRecordMimeType?.trim() || null,
  };
}

function inputToRow(
  input: QuotationExpenseInput,
  relatedId: string,
  fileAction: PaymentRecordFileAction,
) {
  const row: Record<string, unknown> = {
    related_type: EXPENSE_RELATED_TYPE_PROJECT,
    related_id: relatedId,
    supplier_types_id: input.supplierTypesId.trim(),
    supplier_id: input.supplierId.trim(),
    installment_number: input.installmentNumber ?? null,
    billed_amount: input.billedAmount,
    due_date: optionalIsoDate(input.dueDate ?? undefined) ?? null,
    payment_amount: input.paymentAmount,
    payment_date: optionalIsoDate(input.paymentDate ?? undefined) ?? null,
    payment_method: input.paymentMethod ?? null,
    credit_card_id: expenseCreditCardId(input.paymentMethod, input.creditCardId),
    payment_status: input.paymentStatus ?? null,
    bad_debt: input.badDebt,
    remarks: input.remarks?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.recurringExpenseId !== undefined) {
    row.recurring_expense_id = input.recurringExpenseId?.trim() || null;
  }
  if (fileAction !== 'keep') {
    Object.assign(row, fileMetaColumns(input));
  }
  return row;
}

async function insertRecurringTemplate(input: {
  projectId: string;
  supplierTypesId: string;
  supplierId: string;
  creditCardId: string;
  billedAmount: number;
  remarks?: string | null;
  frequency: RecurringExpenseFrequency;
  dueDate: string;
}): Promise<{ data: string | null; error: { message: string } | null }> {
  const nextDate = nextRecurringDueDate(input.frequency, input.dueDate, input.dueDate);
  if (!nextDate) return { data: null, error: { message: '無法計算下一次週期' } };

  const row = {
    related_type: EXPENSE_RELATED_TYPE_PROJECT,
    related_id: input.projectId,
    supplier_types_id: input.supplierTypesId.trim(),
    supplier_id: input.supplierId.trim(),
    credit_card_id: input.creditCardId,
    billed_amount: input.billedAmount,
    remarks: input.remarks?.trim() || null,
    frequency: input.frequency,
    anchor_date: input.dueDate,
    next_occurrence_date: nextDate,
    automation_run_count: 0,
    status: 'active' as const,
  };

  const inserted = await supabase.from(RECURRING_EXPENSES_TABLE).insert(row).select('id').single();
  if (!inserted.error && inserted.data && 'id' in inserted.data && inserted.data.id) {
    return { data: String(inserted.data.id), error: null };
  }

  const rpc = await supabase.rpc(CREATE_RECURRING_EXPENSE_RPC, {
    p_related_id: input.projectId,
    p_supplier_types_id: input.supplierTypesId.trim(),
    p_supplier_id: input.supplierId.trim(),
    p_credit_card_id: input.creditCardId,
    p_billed_amount: input.billedAmount,
    p_remarks: input.remarks?.trim() || null,
    p_frequency: input.frequency,
    p_anchor_date: input.dueDate,
    p_next_occurrence_date: nextDate,
  });
  if (rpc.error || rpc.data == null) {
    return {
      data: null,
      error: { message: inserted.error?.message ?? rpc.error?.message ?? '建立週期失敗' },
    };
  }
  return { data: String(rpc.data), error: null };
}

async function removeStorageObject(path: string | undefined) {
  const trimmed = path?.trim();
  if (!trimmed) return;
  await supabase.storage.from(EXPENSE_PAYMENT_RECORDS_BUCKET).remove([trimmed]);
}

export async function resolveExpenseProjectId(
  quotationClientProjectId: string,
): Promise<{ data: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('related_type', 'quotation_client')
    .eq('related_id', quotationClientProjectId)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data?.id) return { data: null, error: { message: '找不到對應的 projects 紀錄' } };
  return { data: data.id as string, error: null };
}

export async function uploadExpensePaymentRecordFile(
  projectId: string,
  file: File,
): Promise<{ data: { path: string; url: string } | null; error: { message: string } | null }> {
  const fileError = isAllowedPaymentRecordFile(file);
  if (fileError) return { data: null, error: { message: fileError } };

  const uniqueId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const path = expensePaymentRecordStoragePath(projectId, file.name, uniqueId);
  const { error } = await supabase.storage.from(EXPENSE_PAYMENT_RECORDS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { data: null, error: { message: error.message } };

  const { data: urlData } = supabase.storage.from(EXPENSE_PAYMENT_RECORDS_BUCKET).getPublicUrl(path);
  return { data: { path, url: urlData.publicUrl }, error: null };
}

async function attachPaymentRecord(
  projectId: string,
  file: File | null | undefined,
  action: PaymentRecordFileAction,
): Promise<{ data: Partial<QuotationExpenseInput>; error: { message: string } | null; uploadedPath?: string }> {
  if (action === 'clear') {
    return {
      data: {
        paymentRecordFileName: null,
        paymentRecordFileUrl: null,
        paymentRecordStoragePath: null,
        paymentRecordFileSize: null,
        paymentRecordMimeType: null,
      },
      error: null,
    };
  }
  if (action !== 'replace' || !file) {
    return { data: {}, error: null };
  }

  const uploaded = await uploadExpensePaymentRecordFile(projectId, file);
  if (uploaded.error || !uploaded.data) {
    return { data: {}, error: uploaded.error ?? { message: '上傳失敗' } };
  }
  return {
    data: {
      paymentRecordFileName: file.name,
      paymentRecordFileUrl: uploaded.data.url,
      paymentRecordStoragePath: uploaded.data.path,
      paymentRecordFileSize: file.size,
      paymentRecordMimeType: file.type || null,
    },
    error: null,
    uploadedPath: uploaded.data.path,
  };
}

export function useQuotationExpenses(quotationClientProjectId: string | undefined) {
  const [rows, setRows] = useState<QuotationExpense[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>();
  const [loading, setLoading] = useState(Boolean(quotationClientProjectId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!quotationClientProjectId) {
      setRows([]);
      setProjectId(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    const resolved = await resolveExpenseProjectId(quotationClientProjectId);
    if (resolved.error || !resolved.data) {
      setError(resolved.error?.message ?? '找不到對應的 projects 紀錄');
      setProjectId(undefined);
      setRows([]);
      setLoading(false);
      return;
    }
    setProjectId(resolved.data);

    const { data, error: err } = await selectExpenseRow((columns) =>
      supabase
        .from(EXPENSES_TABLE)
        .select(columns)
        .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT)
        .eq('related_id', resolved.data)
        .order('created_at', { ascending: true }),
    );

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setError(null);
      setRows(((data as DbRow[] | null) ?? []).map(mapRow).sort(compareExpenses));
    }
    setLoading(false);
  }, [quotationClientProjectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addExpense = useCallback(
    async (input: QuotationExpenseWriteInput) => {
      if (!projectId) return { data: null, error: { message: '缺少項目' } };
      const frequency = isRecurringExpenseFrequency(input.frequency) ? input.frequency : null;
      const creditCardId = expenseCreditCardId(input.paymentMethod, input.creditCardId);
      const dueDate = optionalIsoDate(input.dueDate ?? undefined);
      let recurringId = input.recurringExpenseId?.trim() || null;

      if (frequency) {
        if (!creditCardId) return { data: null, error: { message: '週期支出須選擇信用卡' } };
        if (!dueDate) return { data: null, error: { message: '請選擇到期日' } };
        const created = await insertRecurringTemplate({
          projectId,
          supplierTypesId: input.supplierTypesId,
          supplierId: input.supplierId,
          creditCardId,
          billedAmount: input.billedAmount,
          remarks: input.remarks,
          frequency,
          dueDate,
        });
        if (created.error || !created.data) {
          return { data: null, error: created.error ?? { message: '建立週期失敗' } };
        }
        recurringId = created.data;
      }

      const fileAction: PaymentRecordFileAction = input.file ? 'replace' : 'keep';
      const attached = await attachPaymentRecord(projectId, input.file, fileAction);
      if (attached.error) {
        if (frequency && recurringId) {
          await supabase.from(RECURRING_EXPENSES_TABLE).delete().eq('id', recurringId);
        }
        return { data: null, error: attached.error };
      }

      const paid = frequency && dueDate
        ? paidRecurringExpenseFields(input.billedAmount, dueDate)
        : null;
      const { data, error: err } = await selectExpenseRow((columns) =>
        supabase
          .from(EXPENSES_TABLE)
          .insert(inputToRow({
            ...input,
            ...attached.data,
            ...(paid ?? {}),
            creditCardId,
            recurringExpenseId: recurringId,
          }, projectId, fileAction))
          .select(columns)
          .single(),
      );
      if (err) {
        await removeStorageObject(attached.uploadedPath);
        if (frequency && recurringId) {
          await supabase.from(RECURRING_EXPENSES_TABLE).delete().eq('id', recurringId);
        }
        return { data: null, error: { message: err.message } };
      }
      const mapped = mapRow(data as DbRow);
      setRows((prev) => [...prev, mapped].sort(compareExpenses));
      return { data: mapped, error: null };
    },
    [projectId],
  );

  const updateExpense = useCallback(async (id: string, input: QuotationExpenseWriteInput) => {
    if (!projectId) return { data: null, error: { message: '缺少項目' } };
    const current = rows.find((row) => row.id === id);
    const frequency = isRecurringExpenseFrequency(input.frequency) ? input.frequency : null;
    const creditCardId = expenseCreditCardId(input.paymentMethod, input.creditCardId);
    const dueDate = optionalIsoDate(input.dueDate ?? undefined);
    let recurringId = current?.recurringExpenseId?.trim()
      || input.recurringExpenseId?.trim()
      || null;

    if (frequency && !recurringId) {
      if (!creditCardId) return { data: null, error: { message: '週期支出須選擇信用卡' } };
      if (!dueDate) return { data: null, error: { message: '請選擇到期日' } };
      const created = await insertRecurringTemplate({
        projectId,
        supplierTypesId: input.supplierTypesId,
        supplierId: input.supplierId,
        creditCardId,
        billedAmount: input.billedAmount,
        remarks: input.remarks,
        frequency,
        dueDate,
      });
      if (created.error || !created.data) {
        return { data: null, error: created.error ?? { message: '建立週期失敗' } };
      }
      recurringId = created.data;
    }

    const fileAction: PaymentRecordFileAction = input.file
      ? 'replace'
      : input.paymentRecordAction === 'clear'
        ? 'clear'
        : 'keep';
    const attached = await attachPaymentRecord(projectId, input.file, fileAction);
    if (attached.error) {
      if (frequency && recurringId && recurringId !== current?.recurringExpenseId) {
        await supabase.from(RECURRING_EXPENSES_TABLE).delete().eq('id', recurringId);
      }
      return { data: null, error: attached.error };
    }

    const paid = frequency && dueDate && !current?.recurringExpenseId
      ? paidRecurringExpenseFields(input.billedAmount, dueDate)
      : null;
    const { data, error: err } = await selectExpenseRow((columns) =>
      supabase
        .from(EXPENSES_TABLE)
        .update(inputToRow({
          ...input,
          ...attached.data,
          ...(paid ?? {}),
          creditCardId,
          recurringExpenseId: recurringId ?? undefined,
        }, projectId, fileAction))
        .eq('id', id)
        .select(columns)
        .single(),
    );
    if (err) {
      await removeStorageObject(attached.uploadedPath);
      if (frequency && recurringId && recurringId !== current?.recurringExpenseId) {
        await supabase.from(RECURRING_EXPENSES_TABLE).delete().eq('id', recurringId);
      }
      return { data: null, error: { message: err.message } };
    }

    if (fileAction !== 'keep' && current?.paymentRecordStoragePath) {
      await removeStorageObject(current.paymentRecordStoragePath);
    }

    const mapped = mapRow(data as DbRow);
    setRows((prev) => prev.map((row) => (row.id === id ? mapped : row)).sort(compareExpenses));
    return { data: mapped, error: null };
  }, [projectId, rows]);

  const deleteExpense = useCallback(async (id: string) => {
    const current = rows.find((row) => row.id === id);
    const { error: err } = await supabase.from(EXPENSES_TABLE).delete().eq('id', id);
    if (err) return { error: { message: err.message } };
    await removeStorageObject(current?.paymentRecordStoragePath);
    setRows((prev) => prev.filter((row) => row.id !== id));
    return { error: null };
  }, [rows]);

  const saveBulkExpenses = useCallback(async (
    items: Array<{ id?: string; input: QuotationExpenseWriteInput }>,
    deleteIds: string[] = [],
  ) => {
    if (!projectId) return { data: null, error: { message: '缺少項目' } };

    const updated: QuotationExpense[] = [];
    for (const item of items) {
      if (!item.id) continue;
      const { data, error: err } = await selectExpenseRow((columns) =>
        supabase
          .from(EXPENSES_TABLE)
          .update(inputToRow(item.input, projectId, 'keep'))
          .eq('id', item.id)
          .select(columns)
          .single(),
      );
      if (err) return { data: null, error: { message: err.message } };
      updated.push(mapRow(data as DbRow));
    }

    const creates = items.filter((item) => !item.id);
    let created: QuotationExpense[] = [];
    if (creates.length > 0) {
      const { data, error: err } = await selectExpenseRow((columns) =>
        supabase
          .from(EXPENSES_TABLE)
          .insert(creates.map((item) => inputToRow(item.input, projectId, 'keep')))
          .select(columns),
      );
      if (err) return { data: null, error: { message: err.message } };
      created = ((data as DbRow[] | null) ?? []).map(mapRow);
    }

    if (deleteIds.length > 0) {
      const removing = rows.filter((row) => deleteIds.includes(row.id));
      const { error: err } = await supabase.from(EXPENSES_TABLE).delete().in('id', deleteIds);
      if (err) return { data: null, error: { message: err.message } };
      await Promise.all(removing.map((row) => removeStorageObject(row.paymentRecordStoragePath)));
    }

    const deleted = new Set(deleteIds);
    const byId = new Map(updated.map((row) => [row.id, row]));
    setRows((prev) => [
      ...prev.filter((row) => !deleted.has(row.id)).map((row) => byId.get(row.id) ?? row),
      ...created,
    ].sort(compareExpenses));

    return { data: [...updated, ...created], error: null };
  }, [projectId, rows]);

  const setRecurringExpenseStatus = useCallback(async (
    recurringExpenseId: string,
    status: RecurringExpenseStatus,
  ) => {
    const id = recurringExpenseId.trim();
    if (!id) return { error: { message: '缺少週期' } };
    const { data, error: err } = await supabase
      .from(RECURRING_EXPENSES_TABLE)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, frequency, next_occurrence_date, automation_run_count, status')
      .single();
    if (err || !data) return { error: { message: err?.message ?? '更新週期失敗' } };

    setRows((prev) => prev.map((row) => {
      if (row.recurringExpenseId !== id) return row;
      return {
        ...row,
        recurringFrequency: isRecurringExpenseFrequency(data.frequency)
          ? data.frequency
          : row.recurringFrequency,
        recurringNextOccurrenceDate: optionalIsoDate(data.next_occurrence_date),
        recurringAutomationRunCount: data.automation_run_count == null
          ? row.recurringAutomationRunCount
          : Number(data.automation_run_count) || 0,
        recurringStatus: isRecurringExpenseStatus(data.status) ? data.status : row.recurringStatus,
      };
    }));
    return { error: null };
  }, []);

  return {
    rows,
    projectId,
    loading,
    error,
    refresh,
    addExpense,
    updateExpense,
    deleteExpense,
    saveBulkExpenses,
    setRecurringExpenseStatus,
  };
}
