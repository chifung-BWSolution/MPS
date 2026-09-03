import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { WebPageSupplier } from '@/types/marketingOps';

type DbRow = {
  id: string;
  supplier_types_id: string | null;
  display_name: string;
  description: string | null;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  remarks: string | null;
  url: string;
  is_active: boolean | null;
  created_at: string | null;
};

function mapRow(row: DbRow): WebPageSupplier {
  return {
    id: row.id,
    supplierTypesId: row.supplier_types_id,
    displayName: row.display_name,
    description: row.description ?? '',
    companyName: row.company_name ?? '',
    contactPerson: row.contact_person ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    remarks: row.remarks ?? '',
    url: row.url ?? '',
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? undefined,
  };
}

function toRow(data: Omit<WebPageSupplier, 'id' | 'createdAt'> & { id: string }) {
  return {
    id: data.id,
    supplier_types_id: data.supplierTypesId || null,
    display_name: data.displayName,
    description: data.description,
    company_name: data.companyName,
    contact_person: data.contactPerson,
    phone: data.phone,
    email: data.email,
    remarks: data.remarks,
    url: data.url,
    is_active: data.isActive,
    updated_at: new Date().toISOString(),
  };
}

export function useWebPageSuppliers() {
  const [suppliers, setSuppliers] = useState<WebPageSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('suppliers')
      .select('*')
      .order('display_name', { ascending: true });
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
  }, [refresh]);

  const addSupplier = useCallback(async (data: Omit<WebPageSupplier, 'id' | 'createdAt'>) => {
    const id = `wps_${Date.now()}`;
    const row = { ...toRow({ ...data, id }), created_at: new Date().toISOString() };
    const { error: err } = await supabase.from('suppliers').insert(row);
    if (!err) {
      setSuppliers(prev => [...prev, { ...data, id, createdAt: row.created_at }]);
    }
    return { data: err ? null : { ...data, id }, error: err };
  }, []);

  const updateSupplier = useCallback(async (id: string, data: Partial<WebPageSupplier>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.supplierTypesId !== undefined) patch.supplier_types_id = data.supplierTypesId || null;
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.description !== undefined) patch.description = data.description;
    if (data.companyName !== undefined) patch.company_name = data.companyName;
    if (data.contactPerson !== undefined) patch.contact_person = data.contactPerson;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.email !== undefined) patch.email = data.email;
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (data.url !== undefined) patch.url = data.url;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const { error: err } = await supabase.from('suppliers').update(patch).eq('id', id);
    if (!err) {
      setSuppliers(prev => prev.map(s => (s.id === id ? { ...s, ...data } : s)));
    }
    return err;
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('suppliers').delete().eq('id', id);
    if (!err) {
      setSuppliers(prev => prev.filter(s => s.id !== id));
    }
    return err;
  }, []);

  return { suppliers, loading, error, refresh, addSupplier, updateSupplier, deleteSupplier };
}
