import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { SupplierLinkedLoginMethod, WebPageSupplier } from '@/types/marketingOps';

const JOIN_TABLE = 'supplier_login_methods';

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

type JoinRow = {
  supplier_id: string;
  login_method_id: string;
};

type LoginMethodSlimRow = {
  id: string;
  display_name: string;
  login_method: string;
  is_active: boolean | null;
};

function mapLinkedMethod(row: LoginMethodSlimRow): SupplierLinkedLoginMethod {
  return {
    id: row.id,
    displayName: row.display_name,
    loginMethod: row.login_method,
    isActive: row.is_active !== false,
  };
}

function linkedForSupplier(
  supplierId: string,
  joins: JoinRow[],
  methodsById: Map<string, SupplierLinkedLoginMethod>,
): SupplierLinkedLoginMethod[] {
  return joins
    .filter((row) => row.supplier_id === supplierId)
    .map((row) => methodsById.get(row.login_method_id))
    .filter((method): method is SupplierLinkedLoginMethod => Boolean(method));
}

function mapRow(row: DbRow, linked: SupplierLinkedLoginMethod[] = []): WebPageSupplier {
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
    loginMethodIds: linked.map((method) => method.id),
    linkedLoginMethods: linked,
    createdAt: row.created_at ?? undefined,
  };
}

function toRow(data: Omit<WebPageSupplier, 'id' | 'createdAt' | 'loginMethodIds' | 'linkedLoginMethods'> & { id: string }) {
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

async function fetchJoinState(): Promise<{
  joins: JoinRow[];
  methodsById: Map<string, SupplierLinkedLoginMethod>;
}> {
  const [joinRes, methodRes] = await Promise.all([
    supabase.from(JOIN_TABLE).select('supplier_id, login_method_id'),
    supabase.from('vchannel_login_methods').select('id, display_name, login_method, is_active'),
  ]);

  const joins = (joinRes.data as JoinRow[] | null) ?? [];
  const methodsById = new Map(
    ((methodRes.data as LoginMethodSlimRow[] | null) ?? []).map((row) => [row.id, mapLinkedMethod(row)]),
  );
  return { joins, methodsById };
}

async function syncSupplierLoginMethods(supplierId: string, loginMethodIds: string[]) {
  const uniqueIds = [...new Set(loginMethodIds.filter(Boolean))];
  const { data, error: fetchError } = await supabase
    .from(JOIN_TABLE)
    .select('login_method_id')
    .eq('supplier_id', supplierId);

  if (fetchError) return fetchError;

  const currentIds = ((data as { login_method_id: string }[] | null) ?? []).map((row) => row.login_method_id);
  const currentSet = new Set(currentIds);
  const nextSet = new Set(uniqueIds);
  const toAdd = uniqueIds.filter((id) => !currentSet.has(id));
  const toRemove = currentIds.filter((id) => !nextSet.has(id));

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from(JOIN_TABLE)
      .delete()
      .eq('supplier_id', supplierId)
      .in('login_method_id', toRemove);
    if (deleteError) return deleteError;
  }

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase.from(JOIN_TABLE).insert(
      toAdd.map((loginMethodId) => ({
        supplier_id: supplierId,
        login_method_id: loginMethodId,
      })),
    );
    if (insertError) return insertError;
  }

  return null;
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
      setLoading(false);
      return;
    }

    const { joins, methodsById } = await fetchJoinState();
    setError(null);
    setSuppliers((data as DbRow[] | null)?.map((row) => mapRow(row, linkedForSupplier(row.id, joins, methodsById))) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSupplier = useCallback(async (data: Omit<WebPageSupplier, 'id' | 'createdAt' | 'linkedLoginMethods'> & { loginMethodIds?: string[] }) => {
    const id = `wps_${Date.now()}`;
    const row = { ...toRow({ ...data, id }), created_at: new Date().toISOString() };
    const { error: err } = await supabase.from('suppliers').insert(row);
    if (err) return { data: null, error: err };

    const loginMethodIds = data.loginMethodIds ?? [];
    const joinError = await syncSupplierLoginMethods(id, loginMethodIds);
    if (joinError) return { data: null, error: joinError };

    const { joins, methodsById } = await fetchJoinState();
    const mapped = mapRow({ ...row, is_active: data.isActive }, linkedForSupplier(id, joins, methodsById));
    setSuppliers((prev) => [...prev, mapped]);
    return { data: mapped, error: null };
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
    if (err) return err;

    if (data.loginMethodIds !== undefined) {
      const joinError = await syncSupplierLoginMethods(id, data.loginMethodIds);
      if (joinError) return joinError;
    }

    const { joins, methodsById } = await fetchJoinState();
    const linked = linkedForSupplier(id, joins, methodsById);
    setSuppliers((prev) => prev.map((s) => (
      s.id === id
        ? { ...s, ...data, loginMethodIds: linked.map((method) => method.id), linkedLoginMethods: linked }
        : s
    )));
    return null;
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('suppliers').delete().eq('id', id);
    if (!err) {
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
    }
    return err;
  }, []);

  return { suppliers, loading, error, refresh, addSupplier, updateSupplier, deleteSupplier };
}
