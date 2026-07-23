import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { WebPageSupplier } from '@/types/marketingOps';

type DbRow = {
  id: string;
  name: string;
  platform: string;
  url: string;
  cost: number | string;
  currency: string;
  rating: number | string;
  created_at: string | null;
};

function mapRow(row: DbRow): WebPageSupplier {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform ?? '',
    url: row.url,
    cost: Number(row.cost) || 0,
    currency: row.currency === 'HKD' ? 'HKD' : 'USD',
    rating: Number(row.rating) || 0,
    createdAt: row.created_at ?? undefined,
  };
}

function toRow(data: Omit<WebPageSupplier, 'id' | 'createdAt'> & { id: string }) {
  return {
    id: data.id,
    name: data.name,
    platform: data.platform,
    url: data.url,
    cost: data.cost,
    currency: data.currency,
    rating: data.rating,
    updated_at: new Date().toISOString(),
  };
}

export function useWebPageSuppliers() {
  const { session } = useAuth();
  const [suppliers, setSuppliers] = useState<WebPageSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('web_page_suppliers')
      .select('*')
      .order('name', { ascending: true });
    if (err) {
      setError(err.message);
      setSuppliers([]);
    } else {
      setError(null);
      setSuppliers((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addSupplier = useCallback(async (data: Omit<WebPageSupplier, 'id' | 'createdAt'>) => {
    const id = `wps_${Date.now()}`;
    const row = { ...toRow({ ...data, id }), created_at: new Date().toISOString() };
    const { error: err } = await supabase.from('web_page_suppliers').insert(row);
    if (!err) {
      setSuppliers(prev => [...prev, { ...data, id, createdAt: row.created_at }]);
    }
    return { data: err ? null : { ...data, id }, error: err };
  }, []);

  const updateSupplier = useCallback(async (id: string, data: Partial<WebPageSupplier>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.platform !== undefined) patch.platform = data.platform;
    if (data.url !== undefined) patch.url = data.url;
    if (data.cost !== undefined) patch.cost = data.cost;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.rating !== undefined) patch.rating = data.rating;
    const { error: err } = await supabase.from('web_page_suppliers').update(patch).eq('id', id);
    if (!err) {
      setSuppliers(prev => prev.map(s => (s.id === id ? { ...s, ...data } : s)));
    }
    return err;
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('web_page_suppliers').delete().eq('id', id);
    if (!err) {
      setSuppliers(prev => prev.filter(s => s.id !== id));
    }
    return err;
  }, []);

  return { suppliers, loading, error, refresh, addSupplier, updateSupplier, deleteSupplier };
}
