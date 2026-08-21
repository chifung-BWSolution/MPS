import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/hooks/useQuotationClientProjects';
import type { QuotationClient, QuotationClientInput } from '@/data/quotationClientList';

export const QUOTATION_CLIENT_LIST_TABLE = 'quotation_client_list';

type DbRow = {
  id: string;
  display_name: string;
  company_name_zh: string;
  company_name_en: string | null;
  brand_id: string | null;
  brand_code: string | null;
  brand_name: string | null;
  contact_person: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  inquiry_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow, projectCount = 0): QuotationClient {
  return {
    id: row.id,
    displayName: row.display_name || row.company_name_zh,
    companyNameZh: row.company_name_zh,
    companyNameEn: row.company_name_en ?? '',
    brandId: row.brand_id ?? '',
    brandCode: row.brand_code ?? '',
    brandName: row.brand_name ?? '',
    contactPerson: row.contact_person,
    phone: row.phone ?? '',
    whatsapp: row.whatsapp ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    inquiryDate: String(row.inquiry_date).slice(0, 10),
    status: (['active', 'inactive', 'prospect'].includes(row.status)
      ? row.status
      : 'prospect') as QuotationClient['status'],
    notes: row.notes ?? undefined,
    projectCount,
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
    brand_id: input.brandId || null,
    brand_code: input.brandCode || null,
    brand_name: input.brandName || null,
    contact_person: input.contactPerson.trim(),
    phone: input.phone.trim() || null,
    whatsapp: input.whatsapp.trim() || null,
    email: input.email.trim() || null,
    address: input.address.trim() || null,
    inquiry_date: input.inquiryDate,
    status: input.status,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

async function fetchProjectCounts(clientIds: string[]): Promise<Record<string, number>> {
  if (clientIds.length === 0) return {};
  const { data } = await supabase
    .from(QUOTATION_CLIENT_PROJECT_TABLE)
    .select('client_id')
    .in('client_id', clientIds);
  const counts: Record<string, number> = {};
  ((data as { client_id: string | null }[] | null) ?? []).forEach((row) => {
    if (!row.client_id) return;
    counts[row.client_id] = (counts[row.client_id] ?? 0) + 1;
  });
  return counts;
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
    const counts = await fetchProjectCounts(ids);
    setError(null);
    setRecords(rows.map((row) => mapRow(row, counts[row.id] ?? 0)));
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
      const client = mapRow(data as DbRow, 0);
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
      const client = mapRow(data as DbRow, existing?.projectCount ?? 0);
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
