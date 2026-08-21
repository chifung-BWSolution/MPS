import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/hooks/useQuotationClientProjects';
import {
  parseBrandIds,
  selectLatestProjectsByClient,
  serializeBrandIds,
  type LatestQuotationClientProject,
  type QuotationClient,
  type QuotationClientInput,
} from '@/data/quotationClientList';

export const QUOTATION_CLIENT_LIST_TABLE = 'quotation_client_list';

type DbRow = {
  id: string;
  display_name: string;
  company_name_zh: string;
  company_name_en: string | null;
  brand_id: string | null;
  contact_person: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  inquiry_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow, latestProject: LatestQuotationClientProject | null = null): QuotationClient {
  return {
    id: row.id,
    displayName: row.display_name || row.company_name_zh,
    companyNameZh: row.company_name_zh,
    companyNameEn: row.company_name_en ?? '',
    brandIds: parseBrandIds(row.brand_id),
    contactPerson: row.contact_person,
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    inquiryDate: String(row.inquiry_date).slice(0, 10),
    status: (['active', 'inactive', 'prospect'].includes(row.status)
      ? row.status
      : 'prospect') as QuotationClient['status'],
    notes: row.notes ?? undefined,
    latestProject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inputToRow(input: QuotationClientInput, id?: string) {
  return {
    ...(id ? { id } : {}),
    display_name: input.displayName.trim() || input.companyNameZh.trim(),
    company_name_zh: input.companyNameZh.trim(),
    company_name_en: input.companyNameEn.trim() || null,
    brand_id: serializeBrandIds(input.brandIds) || null,
    contact_person: input.contactPerson.trim(),
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    address: input.address.trim() || null,
    inquiry_date: input.inquiryDate,
    status: input.status,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

type ProjectDbRow = {
  id: string;
  client_id: string | null;
  display_name: string;
  status: string | null;
  inquiry_date: string | null;
  updated_at: string | null;
  created_at: string | null;
};

async function fetchLatestProjects(
  clientIds: string[],
): Promise<Record<string, LatestQuotationClientProject>> {
  if (clientIds.length === 0) return {};
  const { data } = await supabase
    .from(QUOTATION_CLIENT_PROJECT_TABLE)
    .select('id, client_id, display_name, status, inquiry_date, updated_at, created_at')
    .in('client_id', clientIds);
  return selectLatestProjectsByClient(
    ((data as ProjectDbRow[] | null) ?? []).map((row) => ({
      id: row.id,
      clientId: row.client_id ?? '',
      displayName: row.display_name,
      status: row.status,
      inquiryDate: row.inquiry_date,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    })),
  );
}

export function useQuotationClientList() {
  const { session } = useAuth();
  const [records, setRecords] = useState<QuotationClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from(QUOTATION_CLIENT_LIST_TABLE)
      .select('*')
      .order('updated_at', { ascending: false });

    if (err) {
      setError(err.message);
      setRecords([]);
      setLoading(false);
      return;
    }

    const rows = (data as DbRow[] | null) ?? [];
    const ids = rows.map((r) => r.id);
    const latest = await fetchLatestProjects(ids);
    setError(null);
    setRecords(rows.map((row) => mapRow(row, latest[row.id] ?? null)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addClient = useCallback(
    async (input: QuotationClientInput): Promise<QuotationClient | null> => {
      const now = new Date().toISOString();
      const row = { ...inputToRow(input), created_at: now };
      const { data, error: err } = await supabase
        .from(QUOTATION_CLIENT_LIST_TABLE)
        .insert(row)
        .select('*')
        .single();
      if (err) {
        setError(err.message);
        return null;
      }
      const client = mapRow(data as DbRow, null);
      setRecords((prev) => [client, ...prev]);
      return client;
    },
    [],
  );

  const updateClient = useCallback(
    async (id: string, input: QuotationClientInput): Promise<QuotationClient | null> => {
      const row = inputToRow(input);
      const { data, error: err } = await supabase
        .from(QUOTATION_CLIENT_LIST_TABLE)
        .update(row)
        .eq('id', id)
        .select('*')
        .single();
      if (err) {
        setError(err.message);
        return null;
      }
      const existing = records.find((r) => r.id === id);
      const client = mapRow(data as DbRow, existing?.latestProject ?? null);
      setRecords((prev) => prev.map((r) => (r.id === id ? client : r)));
      return client;
    },
    [records],
  );

  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from(QUOTATION_CLIENT_LIST_TABLE).delete().eq('id', id);
    if (err) {
      setError(err.message);
      return false;
    }
    setRecords((prev) => prev.filter((r) => r.id !== id));
    return true;
  }, []);

  return { records, loading, error, refresh, addClient, updateClient, deleteClient };
}
