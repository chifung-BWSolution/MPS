import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, invalidateCachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';
import {
  QUOTATION_DOC_TYPES_TABLE,
  type QuotationDocType,
  type QuotationDocTypeInput,
} from '@/lib/quotationDocs';

const SELECT_COLUMNS = 'id, display, is_active, created_at, updated_at';

type DbRow = {
  id: string;
  display: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): QuotationDocType {
  return {
    id: row.id,
    display: row.display,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function uniqueConstraintMessage(error: string): string {
  if (/quotation_doc_types_display|unique/i.test(error)) {
    return '已有相同的顯示名稱';
  }
  return error;
}

async function fetchQuotationDocTypes(): Promise<QuotationDocType[]> {
  const { data, error: err } = await supabase
    .from(QUOTATION_DOC_TYPES_TABLE)
    .select(SELECT_COLUMNS)
    .order('display', { ascending: true });
  if (err) throw err;
  return (data as DbRow[] | null)?.map(mapRow) ?? [];
}

export function useQuotationDocTypes() {
  const cached = peekCachedQuery<QuotationDocType[]>(QUERY_CACHE_KEYS.quotationDocTypes);
  const [types, setTypes] = useState<QuotationDocType[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (force) invalidateCachedQuery(QUERY_CACHE_KEYS.quotationDocTypes);
    if (!peekCachedQuery(QUERY_CACHE_KEYS.quotationDocTypes)) setLoading(true);
    try {
      const rows = await cachedQuery(QUERY_CACHE_KEYS.quotationDocTypes, fetchQuotationDocTypes);
      setError(null);
      setTypes(rows);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : String(err));
      setTypes([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addType = useCallback(async (input: QuotationDocTypeInput) => {
    const display = input.display.trim();
    if (!display) return { ok: false as const, error: '請輸入顯示名稱' };

    const { data, error: insertError } = await supabase
      .from(QUOTATION_DOC_TYPES_TABLE)
      .insert({
        display,
        is_active: input.isActive ?? true,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) return { ok: false as const, error: uniqueConstraintMessage(insertError.message) };
    invalidateCachedQuery(QUERY_CACHE_KEYS.quotationDocTypes);
    if (data) setTypes((prev) => [...prev, mapRow(data as DbRow)].sort((a, b) => a.display.localeCompare(b.display, 'zh-Hant')));
    return { ok: true as const };
  }, []);

  const updateType = useCallback(async (id: string, updates: Partial<QuotationDocTypeInput>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.display !== undefined) {
      const display = updates.display.trim();
      if (!display) return { ok: false as const, error: '請輸入顯示名稱' };
      row.display = display;
    }
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error: updateError } = await supabase.from(QUOTATION_DOC_TYPES_TABLE).update(row).eq('id', id);
    if (updateError) return { ok: false as const, error: uniqueConstraintMessage(updateError.message) };
    invalidateCachedQuery(QUERY_CACHE_KEYS.quotationDocTypes);
    setTypes((prev) =>
      prev
        .map((type) =>
          type.id === id
            ? {
                ...type,
                display: updates.display?.trim() ?? type.display,
                isActive: updates.isActive ?? type.isActive,
                updatedAt: String(row.updated_at),
              }
            : type,
        )
        .sort((a, b) => a.display.localeCompare(b.display, 'zh-Hant')),
    );
    return { ok: true as const };
  }, []);

  const deleteType = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from(QUOTATION_DOC_TYPES_TABLE).delete().eq('id', id);
    if (deleteError) {
      if (/foreign key|quotation_docs_doc_type/i.test(deleteError.message)) {
        return { ok: false as const, error: '仍有文件使用此類型，無法刪除' };
      }
      return { ok: false as const, error: deleteError.message };
    }
    invalidateCachedQuery(QUERY_CACHE_KEYS.quotationDocTypes);
    setTypes((prev) => prev.filter((type) => type.id !== id));
    return { ok: true as const };
  }, []);

  const countUsage = useCallback(async (id: string): Promise<{ docCount: number; error: string | null }> => {
    const { count, error: countError } = await supabase
      .from('quotation_docs')
      .select('id', { count: 'exact', head: true })
      .eq('doc_type', id);
    if (countError) {
      if (/does not exist|relation/i.test(countError.message)) {
        return { docCount: 0, error: null };
      }
      return { docCount: 0, error: countError.message };
    }
    return { docCount: count ?? 0, error: null };
  }, []);

  return { types, loading, error, refresh, addType, updateType, deleteType, countUsage };
}
