import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { SupplierType, SupplierTypeCategory } from '@/types/marketingOps';
import { SUPPLIER_TYPE_CATEGORIES } from '@/types/marketingOps';

type DbRow = {
  id: string;
  categories: string;
  display_name: string;
  is_active: boolean;
  created_at: string | null;
};

function isCategory(value: string): value is SupplierTypeCategory {
  return (SUPPLIER_TYPE_CATEGORIES as readonly string[]).includes(value);
}

function mapRow(row: DbRow): SupplierType {
  return {
    id: row.id,
    categories: isCategory(row.categories) ? row.categories : '網站',
    displayName: row.display_name,
    isActive: row.is_active,
    createdAt: row.created_at ?? undefined,
  };
}

export function useSupplierTypes() {
  const [types, setTypes] = useState<SupplierType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('supplier_types')
      .select('*')
      .order('categories', { ascending: true })
      .order('display_name', { ascending: true });
    if (err) {
      setError(err.message);
      setTypes([]);
    } else {
      setError(null);
      setTypes((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { types, loading, error, refresh };
}
