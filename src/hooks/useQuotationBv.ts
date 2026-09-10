import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveRelatedProjectHubIds } from '@/lib/resolveProjectHub';
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
  project_id: string;
  staff_id: string;
  bv_ratio: number | string;
  created_at: string;
  updated_at: string;
  staff?: StaffEmbed;
};

function mapRow(row: DbRow): QuotationBvRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    staffId: row.staff_id,
    staffName: row.staff?.display_name?.trim() || '—',
    bvRatio: Number(row.bv_ratio),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useQuotationBv(relatedType: string | undefined, relatedId: string | undefined) {
  const [rows, setRows] = useState<QuotationBvRecord[]>([]);
  const [hubProjectId, setHubProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(relatedType && relatedId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!relatedType || !relatedId?.trim()) {
      setRows([]);
      setHubProjectId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const resolved = await resolveRelatedProjectHubIds(relatedType, relatedId);
    if (resolved.error || !resolved.data) {
      setError(resolved.error?.message ?? '找不到對應的 projects 紀錄');
      setRows([]);
      setHubProjectId(null);
      setLoading(false);
      return;
    }

    setHubProjectId(resolved.data.writeProjectId);
    const { data, error: err } = await supabase
      .from(QUOTATION_BV_TABLE)
      .select('*, staff:staffs!staff_id ( display_name )')
      .in('project_id', resolved.data.projectIds)
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setError(null);
      setRows(((data as DbRow[] | null) ?? []).map(mapRow));
    }
    setLoading(false);
  }, [relatedType, relatedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRow = useCallback(
    async (input: QuotationBvInput) => {
      if (!hubProjectId) return { data: null, error: { message: '缺少項目' } };
      const staffId = input.staffId.trim();
      const bvRatio = parseBvRatio(input.bvRatio);
      if (!staffId) return { data: null, error: { message: '請選擇協作者' } };
      if (bvRatio == null) return { data: null, error: { message: 'BV 比例須為 0 到 100 之間的數字' } };

      const now = new Date().toISOString();
      const { data, error: err } = await supabase
        .from(QUOTATION_BV_TABLE)
        .insert({
          project_id: hubProjectId,
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
    [hubProjectId],
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

  return { rows, hubProjectId, loading, error, refresh, addRow, updateRow, deleteRow };
}
