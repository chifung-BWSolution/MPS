import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  QUOTATION_BV_TABLE,
  parseBvRatio,
  type QuotationBvInput,
  type QuotationBvRecord,
} from '@/lib/quotationBv';

type StaffEmbed = {
  display_name: string | null;
} | null;

type DbRow = {
  id: string;
  quotation_client_project_id: string;
  staff_id: string;
  bv_ratio: number | string;
  created_at: string;
  updated_at: string;
  staff?: StaffEmbed;
};

function mapRow(row: DbRow): QuotationBvRecord {
  return {
    id: row.id,
    quotationClientProjectId: row.quotation_client_project_id,
    staffId: row.staff_id,
    staffName: row.staff?.display_name?.trim() || '—',
    bvRatio: Number(row.bv_ratio),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useQuotationBv(projectId: string | undefined) {
  const [rows, setRows] = useState<QuotationBvRecord[]>([]);
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
      .from(QUOTATION_BV_TABLE)
      .select('*, staff:staffs!staff_id ( display_name )')
      .eq('quotation_client_project_id', projectId)
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setError(null);
      setRows(((data as DbRow[] | null) ?? []).map(mapRow));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRow = useCallback(
    async (input: QuotationBvInput) => {
      if (!projectId) return { data: null, error: { message: '缺少項目' } };
      const staffId = input.staffId.trim();
      const bvRatio = parseBvRatio(input.bvRatio);
      if (!staffId) return { data: null, error: { message: '請選擇協作者' } };
      if (bvRatio == null) return { data: null, error: { message: 'BV 比例須為 0 到 100 之間的數字' } };

      const now = new Date().toISOString();
      const { data, error: err } = await supabase
        .from(QUOTATION_BV_TABLE)
        .insert({
          quotation_client_project_id: projectId,
          staff_id: staffId,
          bv_ratio: bvRatio,
          created_at: now,
          updated_at: now,
        })
        .select('*, staff:staffs!staff_id ( display_name )')
        .single();

      if (!err && data) {
        const mapped = mapRow(data as DbRow);
        setRows((prev) => [...prev, mapped]);
        return { data: mapped, error: null };
      }
      return { data: null, error: err };
    },
    [projectId],
  );

  const updateRow = useCallback(async (id: string, input: Partial<QuotationBvInput>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.staffId !== undefined) {
      const staffId = input.staffId.trim();
      if (!staffId) return { error: { message: '請選擇協作者' } };
      patch.staff_id = staffId;
    }
    if (input.bvRatio !== undefined) {
      const bvRatio = parseBvRatio(input.bvRatio);
      if (bvRatio == null) return { error: { message: 'BV 比例須為 0 到 100 之間的數字' } };
      patch.bv_ratio = bvRatio;
    }

    const { data, error: err } = await supabase
      .from(QUOTATION_BV_TABLE)
      .update(patch)
      .eq('id', id)
      .select('*, staff:staffs!staff_id ( display_name )')
      .single();

    if (!err && data) {
      const mapped = mapRow(data as DbRow);
      setRows((prev) => prev.map((row) => (row.id === id ? mapped : row)));
    }
    return { error: err };
  }, []);

  const deleteRow = useCallback(async (id: string) => {
    const { error: err } = await supabase.from(QUOTATION_BV_TABLE).delete().eq('id', id);
    if (!err) setRows((prev) => prev.filter((row) => row.id !== id));
    return { error: err };
  }, []);

  return { rows, loading, error, refresh, addRow, updateRow, deleteRow };
}
