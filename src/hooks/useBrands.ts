import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/types/app';
import { brands as staticBrands } from '@/data/mockData';
import { QUERY_CACHE_KEYS, cachedQuery, invalidateCachedQuery, isAbortError, peekCachedQuery } from '@/lib/queryCache';

type DbRow = {
  id: string;
  company_id: string;
  brand_code: string;
  display_name: string;
  is_active: boolean;
};

function mapRow(row: DbRow): Brand {
  return {
    id: row.id,
    companyId: row.company_id,
    brandCode: row.brand_code,
    displayName: row.display_name,
    isActive: row.is_active,
  };
}

type WriteError = { message: string };

function noRowError(action: string): WriteError {
  return { message: `${action}未寫入資料庫（0 列）。請重新整理後再試。` };
}

async function fetchBrands(): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('brand_list')
    .select('id, company_id, brand_code, display_name, is_active')
    .order('brand_code');
  if (error) throw error;
  if (!data || data.length === 0) return staticBrands as Brand[];
  return (data as DbRow[]).map(mapRow);
}

export function useBrands() {
  const cached = peekCachedQuery<Brand[]>(QUERY_CACHE_KEYS.brands);
  const [brands, setBrands] = useState<Brand[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void cachedQuery(QUERY_CACHE_KEYS.brands, fetchBrands)
      .then((rows) => {
        if (cancelled) return;
        setBrands(rows);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (!isAbortError(err)) {
          setError(err.message);
          setBrands(staticBrands as Brand[]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addBrand = useCallback(async (brand: Brand) => {
    const row = {
      id: brand.id,
      company_id: brand.companyId,
      brand_code: brand.brandCode,
      display_name: brand.displayName,
      is_active: brand.isActive,
    };
    const { data, error } = await supabase.from('brand_list').insert(row).select('id').maybeSingle();
    if (error) return error;
    if (!data) return noRowError('新增');
    invalidateCachedQuery(QUERY_CACHE_KEYS.brands);
    setBrands(prev => [...prev, brand]);
    return null;
  }, []);

  const updateBrand = useCallback(async (id: string, updates: Partial<Brand>) => {
    const row: Record<string, unknown> = {};
    if (updates.companyId !== undefined) row.company_id = updates.companyId;
    if (updates.brandCode !== undefined) row.brand_code = updates.brandCode;
    if (updates.displayName !== undefined) row.display_name = updates.displayName;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('brand_list')
      .update(row)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) return error;
    if (!data) return noRowError('更新');
    invalidateCachedQuery(QUERY_CACHE_KEYS.brands);
    setBrands(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    return null;
  }, []);

  const deleteBrand = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('brand_list')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) return error;
    if (!data) return noRowError('刪除');
    invalidateCachedQuery(QUERY_CACHE_KEYS.brands);
    setBrands(prev => prev.filter(b => b.id !== id));
    return null;
  }, []);

  return { brands, loading, error, addBrand, updateBrand, deleteBrand };
}
