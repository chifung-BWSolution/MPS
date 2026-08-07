import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/types/app';
import { useAuth } from '@/context/AuthContext';
import { brands as staticBrands } from '@/data/mockData';

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

export function useBrands() {
  const { session } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('brand_list')
      .select('id, company_id, brand_code, display_name, is_active')
      .order('brand_code')
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setBrands(staticBrands as Brand[]);
        } else if (!data || data.length === 0) {
          setBrands(staticBrands as Brand[]);
        } else {
          setBrands((data as DbRow[]).map(mapRow));
        }
        setLoading(false);
      });
  }, [session]);

  const addBrand = useCallback(async (brand: Brand) => {
    const row = {
      id: brand.id,
      company_id: brand.companyId,
      brand_code: brand.brandCode,
      display_name: brand.displayName,
      is_active: brand.isActive,
    };
    const { error } = await supabase.from('brand_list').insert(row);
    if (!error) setBrands(prev => [...prev, brand]);
    return error;
  }, []);

  const updateBrand = useCallback(async (id: string, updates: Partial<Brand>) => {
    const row: Record<string, unknown> = {};
    if (updates.companyId !== undefined) row.company_id = updates.companyId;
    if (updates.brandCode !== undefined) row.brand_code = updates.brandCode;
    if (updates.displayName !== undefined) row.display_name = updates.displayName;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error } = await supabase.from('brand_list').update(row).eq('id', id);
    if (!error) setBrands(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    return error;
  }, []);

  const deleteBrand = useCallback(async (id: string) => {
    const { error } = await supabase.from('brand_list').delete().eq('id', id);
    if (!error) setBrands(prev => prev.filter(b => b.id !== id));
    return error;
  }, []);

  return { brands, loading, error, addBrand, updateBrand, deleteBrand };
}
