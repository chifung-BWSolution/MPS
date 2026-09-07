import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { SupplierType, SupplierTypeCategory } from '@/types/marketingOps';
import { SUPPLIER_TYPE_CATEGORIES } from '@/types/marketingOps';

const SELECT_COLUMNS = 'id, categories, display_name, is_active, created_at';

type DbRow = {
  id: string;
  categories: string;
  display_name: string;
  is_active: boolean;
  created_at: string | null;
};

export type SupplierTypeInput = {
  categories: SupplierTypeCategory;
  displayName: string;
  isActive?: boolean;
};

export type SupplierTypeUsage = {
  supplierCount: number;
  expenseCount: number;
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

function uniqueConstraintMessage(error: string): string {
  if (/supplier_types_categories_display_name|unique/i.test(error)) {
    return '同一分類下已有相同的顯示名稱';
  }
  return error;
}

async function countExact(table: string, id: string): Promise<{ count: number; error: string | null }> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('supplier_types_id', id);
  if (error) {
    if (/does not exist|relation/i.test(error.message)) {
      return { count: 0, error: null };
    }
    return { count: 0, error: error.message };
  }
  return { count: count ?? 0, error: null };
}

export function useSupplierTypes() {
  const [types, setTypes] = useState<SupplierType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('supplier_types')
      .select(SELECT_COLUMNS)
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

  const addType = useCallback(async (input: SupplierTypeInput) => {
    const displayName = input.displayName.trim();
    if (!displayName) return { ok: false as const, error: '請輸入顯示名稱' };
    if (!isCategory(input.categories)) return { ok: false as const, error: '請選擇分類' };

    const { data, error: insertError } = await supabase
      .from('supplier_types')
      .insert({
        categories: input.categories,
        display_name: displayName,
        is_active: input.isActive ?? true,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) return { ok: false as const, error: uniqueConstraintMessage(insertError.message) };
    if (data) setTypes((prev) => [...prev, mapRow(data as DbRow)]);
    return { ok: true as const };
  }, []);

  const updateType = useCallback(async (id: string, updates: Partial<SupplierTypeInput>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.categories !== undefined) {
      if (!isCategory(updates.categories)) return { ok: false as const, error: '請選擇分類' };
      row.categories = updates.categories;
    }
    if (updates.displayName !== undefined) {
      const displayName = updates.displayName.trim();
      if (!displayName) return { ok: false as const, error: '請輸入顯示名稱' };
      row.display_name = displayName;
    }
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error: updateError } = await supabase.from('supplier_types').update(row).eq('id', id);
    if (updateError) return { ok: false as const, error: uniqueConstraintMessage(updateError.message) };
    setTypes((prev) =>
      prev.map((type) =>
        type.id === id
          ? {
              ...type,
              categories: updates.categories ?? type.categories,
              displayName: updates.displayName?.trim() ?? type.displayName,
              isActive: updates.isActive ?? type.isActive,
            }
          : type,
      ),
    );
    return { ok: true as const };
  }, []);

  const deleteType = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('supplier_types').delete().eq('id', id);
    if (deleteError) return { ok: false as const, error: deleteError.message };
    setTypes((prev) => prev.filter((type) => type.id !== id));
    return { ok: true as const };
  }, []);

  const countUsage = useCallback(async (id: string): Promise<SupplierTypeUsage & { error: string | null }> => {
    const [suppliers, expenses] = await Promise.all([
      countExact('suppliers', id),
      countExact('expenses', id),
    ]);
    return {
      supplierCount: suppliers.count,
      expenseCount: expenses.count,
      error: suppliers.error || expenses.error,
    };
  }, []);

  return { types, loading, error, refresh, addType, updateType, deleteType, countUsage };
}
