import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { QUERY_CACHE_KEYS, cachedQuery, invalidateCachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';
import { setProjectTypeLabelOverrides, setProjectTypeWebsiteRefs } from '@/data/pitchingData';
import {
  QUOTATION_PROJECT_TYPES_TABLE,
  isQuotationProjectTypeSection,
  setProjectTypeCodeMap,
  normalizeProjectTypeCode,
  normalizeProjectTypeCodeInitial,
  validateProjectTypeCode,
  validateProjectTypeCodeInitial,
  type QuotationProjectType,
  type QuotationProjectTypeInput,
  type QuotationProjectTypeSection,
} from '@/lib/quotationProjectTypes';

const SELECT_COLUMNS = 'id, code, display, code_initial, section, is_active, created_at, updated_at';

type DbRow = {
  id: string;
  code: string;
  display: string;
  code_initial: string;
  section: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): QuotationProjectType {
  return {
    id: row.id,
    code: row.code,
    display: row.display,
    codeInitial: row.code_initial,
    section: isQuotationProjectTypeSection(row.section) ? row.section : 'quotation',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function uniqueConstraintMessage(error: string): string {
  if (/quotation_project_types_display|unique/i.test(error)) {
    return '已有相同的顯示名稱';
  }
  if (/quotation_project_types_code_key|quotation_project_types_code|duplicate key.*code/i.test(error)) {
    return '已有相同的識別碼';
  }
  if (/code_initial_format|quotation_project_types_code_initial/i.test(error)) {
    return '代碼前綴格式須為 XXX-X，例如 BWT-W';
  }
  if (/code_format|quotation_project_types_code_format/i.test(error)) {
    return '識別碼須為小寫英數與底線，例如 bwt_web';
  }
  return error;
}

function applyCatalogOverrides(rows: QuotationProjectType[]) {
  const labels = rows.flatMap((type) => [
    { id: type.id, label: type.display },
    { id: type.code, label: type.display },
  ]);
  setProjectTypeLabelOverrides(labels);
  setProjectTypeCodeMap(rows);
  const websiteRefs = rows
    .filter((type) => type.section === 'system-dev' || type.code === 'bwt_web' || type.code === 'bwt_system')
    .flatMap((type) => [type.id, type.code]);
  setProjectTypeWebsiteRefs(websiteRefs);
}

async function fetchQuotationProjectTypes(): Promise<QuotationProjectType[]> {
  const { data, error: err } = await supabase
    .from(QUOTATION_PROJECT_TYPES_TABLE)
    .select(SELECT_COLUMNS)
    .order('section', { ascending: true })
    .order('display', { ascending: true });
  if (err) throw err;
  return (data as DbRow[] | null)?.map(mapRow) ?? [];
}

export function useQuotationProjectTypes() {
  const cached = peekCachedQuery<QuotationProjectType[]>(QUERY_CACHE_KEYS.quotationProjectTypes);
  const [types, setTypes] = useState<QuotationProjectType[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (force) invalidateCachedQuery(QUERY_CACHE_KEYS.quotationProjectTypes);
    if (!peekCachedQuery(QUERY_CACHE_KEYS.quotationProjectTypes)) setLoading(true);
    try {
      const rows = await cachedQuery(QUERY_CACHE_KEYS.quotationProjectTypes, fetchQuotationProjectTypes);
      setError(null);
      setTypes(rows);
      applyCatalogOverrides(rows);
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
        setTypes([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addType = useCallback(async (input: QuotationProjectTypeInput) => {
    const display = input.display.trim();
    if (!display) return { ok: false as const, error: '請輸入顯示名稱' };
    const code = normalizeProjectTypeCode(input.code ?? '');
    const codeError = validateProjectTypeCode(code);
    if (codeError) return { ok: false as const, error: codeError };
    const codeInitial = normalizeProjectTypeCodeInitial(input.codeInitial);
    const prefixError = validateProjectTypeCodeInitial(codeInitial);
    if (prefixError) return { ok: false as const, error: prefixError };

    const { data, error: insertError } = await supabase
      .from(QUOTATION_PROJECT_TYPES_TABLE)
      .insert({
        code,
        display,
        code_initial: codeInitial,
        section: input.section,
        is_active: input.isActive ?? true,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) return { ok: false as const, error: uniqueConstraintMessage(insertError.message) };
    invalidateCachedQuery(QUERY_CACHE_KEYS.quotationProjectTypes);
    if (data) {
      setTypes((prev) => {
        const next = [...prev, mapRow(data as DbRow)].sort((a, b) => {
          if (a.section !== b.section) return a.section.localeCompare(b.section);
          return a.display.localeCompare(b.display, 'zh-Hant');
        });
        applyCatalogOverrides(next);
        return next;
      });
    }
    return { ok: true as const };
  }, []);

  const updateType = useCallback(async (id: string, updates: Partial<QuotationProjectTypeInput>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.display !== undefined) {
      const display = updates.display.trim();
      if (!display) return { ok: false as const, error: '請輸入顯示名稱' };
      row.display = display;
    }
    if (updates.code !== undefined) {
      const code = normalizeProjectTypeCode(updates.code);
      const codeError = validateProjectTypeCode(code);
      if (codeError) return { ok: false as const, error: codeError };
      row.code = code;
    }
    if (updates.codeInitial !== undefined) {
      const codeInitial = normalizeProjectTypeCodeInitial(updates.codeInitial);
      const prefixError = validateProjectTypeCodeInitial(codeInitial);
      if (prefixError) return { ok: false as const, error: prefixError };
      row.code_initial = codeInitial;
    }
    if (updates.section !== undefined) row.section = updates.section;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error: updateError } = await supabase.from(QUOTATION_PROJECT_TYPES_TABLE).update(row).eq('id', id);
    if (updateError) return { ok: false as const, error: uniqueConstraintMessage(updateError.message) };
    invalidateCachedQuery(QUERY_CACHE_KEYS.quotationProjectTypes);
    setTypes((prev) => {
      const next = prev
        .map((type) =>
          type.id === id
            ? {
                ...type,
                code: updates.code ? normalizeProjectTypeCode(updates.code) : type.code,
                display: updates.display?.trim() ?? type.display,
                codeInitial: updates.codeInitial
                  ? normalizeProjectTypeCodeInitial(updates.codeInitial)
                  : type.codeInitial,
                section: updates.section ?? type.section,
                isActive: updates.isActive ?? type.isActive,
                updatedAt: String(row.updated_at),
              }
            : type,
        )
        .sort((a, b) => {
          if (a.section !== b.section) return a.section.localeCompare(b.section);
          return a.display.localeCompare(b.display, 'zh-Hant');
        });
      applyCatalogOverrides(next);
      return next;
    });
    return { ok: true as const };
  }, []);

  const deleteType = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from(QUOTATION_PROJECT_TYPES_TABLE).delete().eq('id', id);
    if (deleteError) {
      if (/23503|foreign key|still used|quotation_client_project/i.test(deleteError.message)) {
        return { ok: false as const, error: '仍有項目使用此類型，無法刪除' };
      }
      return { ok: false as const, error: deleteError.message };
    }
    invalidateCachedQuery(QUERY_CACHE_KEYS.quotationProjectTypes);
    setTypes((prev) => {
      const next = prev.filter((type) => type.id !== id);
      applyCatalogOverrides(next);
      return next;
    });
    return { ok: true as const };
  }, []);

  const countUsage = useCallback(async (id: string): Promise<{ projectCount: number; error: string | null }> => {
    const { count, error: countError } = await supabase
      .from('quotation_client_project')
      .select('id', { count: 'exact', head: true })
      .eq('project_types', id);
    if (countError) {
      if (/does not exist|relation/i.test(countError.message)) {
        return { projectCount: 0, error: null };
      }
      return { projectCount: 0, error: countError.message };
    }
    return { projectCount: count ?? 0, error: null };
  }, []);

  return { types, loading, error, refresh, addType, updateType, deleteType, countUsage };
}

export function projectTypesForSection(
  types: QuotationProjectType[],
  section: QuotationProjectTypeSection,
  activeOnly = false,
): QuotationProjectType[] {
  return types.filter((type) => type.section === section && (!activeOnly || type.isActive));
}
