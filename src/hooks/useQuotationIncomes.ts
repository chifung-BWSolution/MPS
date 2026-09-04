import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INCOMES_TABLE,
  isIncomePaymentMethod,
  isIncomePaymentStatus,
  optionalIsoDate,
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
  payment_method: string | null;
  payment_status: string;
  outstanding: number | string;
  bad_debt: number | string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
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

function mapRow(row: DbRow): QuotationIncome {
  return {
    id: row.id,
    quotationClientProjectId: row.quotation_client_project_id,
    type: row.type,
    installmentNumber: row.installment_number ?? undefined,
    billedAmount: toAmount(row.billed_amount),
    dueDate: optionalIsoDate(row.due_date),
    paymentAmount: toAmount(row.payment_amount),
    paymentMethod: isIncomePaymentMethod(row.payment_method) ? row.payment_method : undefined,
    paymentStatus: isIncomePaymentStatus(row.payment_status) ? row.payment_status : 'Not Received',
    outstanding: toAmount(row.outstanding),
    badDebt: toAmount(row.bad_debt),
    remarks: row.remarks?.trim() || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToRow(input: QuotationIncomeInput, projectId: string) {
  return {
    quotation_client_project_id: projectId,
    type: input.type.trim(),
    installment_number: input.installmentNumber ?? null,
    billed_amount: input.billedAmount,
    due_date: optionalIsoDate(input.dueDate ?? undefined) ?? null,
    payment_amount: input.paymentAmount,
    payment_method: input.paymentMethod ?? null,
    payment_status: input.paymentStatus,
    bad_debt: input.badDebt,
    remarks: input.remarks?.trim() || null,
    updated_at: new Date().toISOString(),
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
    async (input: QuotationIncomeInput) => {
      if (!projectId) return { data: null, error: { message: '缺少項目' } };
      const { data, error: err } = await supabase
        .from(INCOMES_TABLE)
        .insert(inputToRow(input, projectId))
        .select('*')
        .single();
      if (err) return { data: null, error: { message: err.message } };
      const mapped = mapRow(data as DbRow);
      setRows((prev) => [...prev, mapped].sort(compareIncomes));
      return { data: mapped, error: null };
    },
    [projectId],
  );

  const updateIncome = useCallback(async (id: string, input: QuotationIncomeInput) => {
    if (!projectId) return { data: null, error: { message: '缺少項目' } };
    const { data, error: err } = await supabase
      .from(INCOMES_TABLE)
      .update(inputToRow(input, projectId))
      .eq('id', id)
      .select('*')
      .single();
    if (err) return { data: null, error: { message: err.message } };
    const mapped = mapRow(data as DbRow);
    setRows((prev) => prev.map((row) => (row.id === id ? mapped : row)).sort(compareIncomes));
    return { data: mapped, error: null };
  }, [projectId]);

  const deleteIncome = useCallback(async (id: string) => {
    const { error: err } = await supabase.from(INCOMES_TABLE).delete().eq('id', id);
    if (err) return { error: { message: err.message } };
    setRows((prev) => prev.filter((row) => row.id !== id));
    return { error: null };
  }, []);

  return { rows, loading, error, refresh, addIncome, updateIncome, deleteIncome };
}
