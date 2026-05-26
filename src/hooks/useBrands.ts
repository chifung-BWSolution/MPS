import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/types/app';
import { useAuth } from '@/context/AuthContext';
import { brands as staticBrands } from '@/data/mockData';

type DbRow = {
  id: string;
  company_id: string;
  brand_code: string;
  brand_name_zh: string;
  brand_name_en: string;
  industry: string | null;
  logo_url: string | null;
  primary_color: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): Brand {
  return {
    id: row.id,
    companyId: row.company_id,
    brandCode: row.brand_code,
    brandNameZh: row.brand_name_zh,
    brandNameEn: row.brand_name_en,
    industry: row.industry ?? '',
    logoUrl: row.logo_url ?? '',
    primaryColor: row.primary_color,
    description: row.description ?? '',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
      .select('*')
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
      brand_name_zh: brand.brandNameZh,
      brand_name_en: brand.brandNameEn,
      industry: brand.industry || null,
      logo_url: brand.logoUrl || null,
      primary_color: brand.primaryColor,
      description: brand.description || null,
      is_active: brand.isActive,
    };
    const { error } = await supabase.from('brand_list').insert(row);
    if (!error) setBrands(prev => [...prev, brand]);
    return error;
  }, []);

  const updateBrand = useCallback(async (id: string, updates: Partial<Brand>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.companyId !== undefined) row.company_id = updates.companyId;
    if (updates.brandCode !== undefined) row.brand_code = updates.brandCode;
    if (updates.brandNameZh !== undefined) row.brand_name_zh = updates.brandNameZh;
    if (updates.brandNameEn !== undefined) row.brand_name_en = updates.brandNameEn;
    if (updates.industry !== undefined) row.industry = updates.industry || null;
    if (updates.logoUrl !== undefined) row.logo_url = updates.logoUrl || null;
    if (updates.primaryColor !== undefined) row.primary_color = updates.primaryColor;
    if (updates.description !== undefined) row.description = updates.description || null;
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
