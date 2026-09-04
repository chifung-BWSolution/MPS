import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INCOMES_TABLE,
  INCOME_PAYMENT_RECORDS_BUCKET,
  incomePaymentRecordStoragePath,
  isAllowedPaymentRecordFile,
  isIncomePaymentMethod,
  isIncomePaymentStatus,
  optionalIsoDate,
  type PaymentRecordFileAction,
  type QuotationIncome,
  type QuotationIncomeInput,
} from '@/lib/quotationIncomes';

type DbRow = {
  id: string;
  quotation_client_project_id: string;
  type: string;
  installment_number: number | null;
  billed_amount: number | string;
  due_date: string | null;
  payment_amount: number | string;
  payment_date: string | null;
  payment_method: string | null;
  payment_status: string | null;
  outstanding: number | string;
  bad_debt: number | string;
  remarks: string | null;
  payment_record_file_name: string | null;
  payment_record_file_url: string | null;
  payment_record_storage_path: string | null;
  payment_record_file_size: number | string | null;
  payment_record_mime_type: string | null;
  created_at: string;
  updated_at: string;
};

export type QuotationIncomeWriteInput = QuotationIncomeInput & {
  file?: File | null;
  paymentRecordAction?: PaymentRecordFileAction;
};

function compareIncomes(a: QuotationIncome, b: QuotationIncome): number {
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

function mapRow(row: DbRow): QuotationIncome {
  return {
    id: row.id,
    quotationClientProjectId: row.quotation_client_project_id,
    type: row.type,
    installmentNumber: row.installment_number ?? undefined,
    billedAmount: toAmount(row.billed_amount),
    dueDate: optionalIsoDate(row.due_date),
    paymentAmount: toAmount(row.payment_amount),
    paymentDate: optionalIsoDate(row.payment_date),
    paymentMethod: isIncomePaymentMethod(row.payment_method) ? row.payment_method : undefined,
    paymentStatus: isIncomePaymentStatus(row.payment_status) ? row.payment_status : undefined,
    outstanding: toAmount(row.outstanding),
    badDebt: toAmount(row.bad_debt),
    remarks: optionalText(row.remarks),
    paymentRecordFileName: optionalText(row.payment_record_file_name),
    paymentRecordFileUrl: optionalText(row.payment_record_file_url),
    paymentRecordStoragePath: optionalText(row.payment_record_storage_path),
    paymentRecordFileSize: row.payment_record_file_size == null ? undefined : Number(row.payment_record_file_size) || undefined,
    paymentRecordMimeType: optionalText(row.payment_record_mime_type),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fileMetaColumns(input: QuotationIncomeInput) {
  return {
    payment_record_file_name: input.paymentRecordFileName?.trim() || null,
    payment_record_file_url: input.paymentRecordFileUrl?.trim() || null,
    payment_record_storage_path: input.paymentRecordStoragePath?.trim() || null,
    payment_record_file_size: input.paymentRecordFileSize ?? null,
    payment_record_mime_type: input.paymentRecordMimeType?.trim() || null,
  };
}

function inputToRow(
  input: QuotationIncomeInput,
  projectId: string,
  fileAction: PaymentRecordFileAction,
) {
  const row: Record<string, unknown> = {
    quotation_client_project_id: projectId,
    type: input.type.trim(),
    installment_number: input.installmentNumber ?? null,
    billed_amount: input.billedAmount,
    due_date: optionalIsoDate(input.dueDate ?? undefined) ?? null,
    payment_amount: input.paymentAmount,
    payment_date: optionalIsoDate(input.paymentDate ?? undefined) ?? null,
    payment_method: input.paymentMethod ?? null,
    payment_status: input.paymentStatus ?? null,
    bad_debt: input.badDebt,
    remarks: input.remarks?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (fileAction !== 'keep') {
    Object.assign(row, fileMetaColumns(input));
  }
  return row;
}

async function removeStorageObject(path: string | undefined) {
  const trimmed = path?.trim();
  if (!trimmed) return;
  await supabase.storage.from(INCOME_PAYMENT_RECORDS_BUCKET).remove([trimmed]);
}

export async function uploadIncomePaymentRecordFile(
  projectId: string,
  file: File,
): Promise<{ data: { path: string; url: string } | null; error: { message: string } | null }> {
  const fileError = isAllowedPaymentRecordFile(file);
  if (fileError) return { data: null, error: { message: fileError } };

  const uniqueId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const path = incomePaymentRecordStoragePath(projectId, file.name, uniqueId);
  const { error } = await supabase.storage.from(INCOME_PAYMENT_RECORDS_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) return { data: null, error: { message: error.message } };

  const { data: urlData } = supabase.storage.from(INCOME_PAYMENT_RECORDS_BUCKET).getPublicUrl(path);
  return { data: { path, url: urlData.publicUrl }, error: null };
}

async function attachPaymentRecord(
  projectId: string,
  file: File | null | undefined,
  action: PaymentRecordFileAction,
): Promise<{ data: Partial<QuotationIncomeInput>; error: { message: string } | null; uploadedPath?: string }> {
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

  const uploaded = await uploadIncomePaymentRecordFile(projectId, file);
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

export function useQuotationIncomes(projectId: string | undefined) {
  const [rows, setRows] = useState<QuotationIncome[]>([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from(INCOMES_TABLE)
      .select('*')
      .eq('quotation_client_project_id', projectId)
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setError(null);
      setRows(((data as DbRow[] | null) ?? []).map(mapRow).sort(compareIncomes));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addIncome = useCallback(
    async (input: QuotationIncomeWriteInput) => {
      if (!projectId) return { data: null, error: { message: '缺少項目' } };
      const fileAction: PaymentRecordFileAction = input.file ? 'replace' : 'keep';
      const attached = await attachPaymentRecord(projectId, input.file, fileAction);
      if (attached.error) return { data: null, error: attached.error };

      const { data, error: err } = await supabase
        .from(INCOMES_TABLE)
        .insert(inputToRow({ ...input, ...attached.data }, projectId, fileAction))
        .select('*')
        .single();
      if (err) {
        await removeStorageObject(attached.uploadedPath);
        return { data: null, error: { message: err.message } };
      }
      const mapped = mapRow(data as DbRow);
      setRows((prev) => [...prev, mapped].sort(compareIncomes));
      return { data: mapped, error: null };
    },
    [projectId],
  );

  const updateIncome = useCallback(async (id: string, input: QuotationIncomeWriteInput) => {
    if (!projectId) return { data: null, error: { message: '缺少項目' } };
    const current = rows.find((row) => row.id === id);
    const fileAction: PaymentRecordFileAction = input.file
      ? 'replace'
      : input.paymentRecordAction === 'clear'
        ? 'clear'
        : 'keep';
    const attached = await attachPaymentRecord(projectId, input.file, fileAction);
    if (attached.error) return { data: null, error: attached.error };

    const { data, error: err } = await supabase
      .from(INCOMES_TABLE)
      .update(inputToRow({ ...input, ...attached.data }, projectId, fileAction))
      .eq('id', id)
      .select('*')
      .single();
    if (err) {
      await removeStorageObject(attached.uploadedPath);
      return { data: null, error: { message: err.message } };
    }

    if (fileAction !== 'keep' && current?.paymentRecordStoragePath) {
      await removeStorageObject(current.paymentRecordStoragePath);
    }

    const mapped = mapRow(data as DbRow);
    setRows((prev) => prev.map((row) => (row.id === id ? mapped : row)).sort(compareIncomes));
    return { data: mapped, error: null };
  }, [projectId, rows]);

  const deleteIncome = useCallback(async (id: string) => {
    const current = rows.find((row) => row.id === id);
    const { error: err } = await supabase.from(INCOMES_TABLE).delete().eq('id', id);
    if (err) return { error: { message: err.message } };
    await removeStorageObject(current?.paymentRecordStoragePath);
    setRows((prev) => prev.filter((row) => row.id !== id));
    return { error: null };
  }, [rows]);

  return { rows, loading, error, refresh, addIncome, updateIncome, deleteIncome };
}
