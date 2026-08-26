import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  CREDIT_CARDS_TABLE,
  isValidExpiry,
  isValidLastFour,
  normalizeLastFour,
  type CreditCardInput,
  type CreditCardRecord,
} from '@/lib/creditCards';

type CompanyEmbed = {
  uuid: string | null;
  company_code: string | null;
  company_name_zh: string | null;
  company_name_en: string | null;
} | null;

type StaffEmbed = {
  id: string;
  display_name: string | null;
} | null;

type DbRow = {
  id: string;
  company_list_id: string;
  last_four: string;
  bank: string;
  purpose: string | null;
  holder: string | null;
  custodian_id: string | null;
  expiry: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  company?: CompanyEmbed;
  custodian?: StaffEmbed;
};

const SELECT_WITH_LABELS = [
  'id',
  'company_list_id',
  'last_four',
  'bank',
  'purpose',
  'holder',
  'custodian_id',
  'expiry',
  'is_active',
  'notes',
  'created_at',
  'updated_at',
  'company:company_list!credit_cards_company_list_id_fkey ( uuid, company_code, company_name_zh, company_name_en )',
  'custodian:staffs!credit_cards_custodian_id_fkey ( id, display_name )',
].join(', ');

function companyNameFromEmbed(company: CompanyEmbed): string {
  if (!company) return '';
  return (company.company_name_en || company.company_name_zh || company.company_code || '').trim();
}

function mapRow(row: DbRow): CreditCardRecord {
  return {
    id: row.id,
    companyListId: row.company_list_id,
    companyName: companyNameFromEmbed(row.company),
    lastFour: row.last_four,
    bank: row.bank,
    purpose: row.purpose || '',
    holder: row.holder || '',
    custodianId: row.custodian_id,
    custodianName: row.custodian?.display_name?.trim() || '',
    expiry: row.expiry,
    isActive: row.is_active,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateInput(input: CreditCardInput): string | null {
  if (!input.companyListId.trim()) return '請選擇所屬公司';
  const lastFour = normalizeLastFour(input.lastFour);
  if (!isValidLastFour(lastFour)) return '卡號末四位須為 4 位數字';
  if (!input.bank.trim()) return '請選擇銀行';
  if (!isValidExpiry(input.expiry.trim())) return '到期日須為 YYYY-MM';
  return null;
}

function toWriteRow(input: CreditCardInput): Record<string, unknown> {
  return {
    company_list_id: input.companyListId.trim(),
    last_four: normalizeLastFour(input.lastFour),
    bank: input.bank.trim(),
    purpose: (input.purpose || '').trim(),
    holder: (input.holder || '').trim(),
    custodian_id: input.custodianId?.trim() || null,
    expiry: input.expiry.trim(),
    is_active: input.isActive ?? true,
    notes: (input.notes || '').trim() || null,
  };
}

export function useCreditCards() {
  const [cards, setCards] = useState<CreditCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from(CREDIT_CARDS_TABLE)
      .select(SELECT_WITH_LABELS)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setCards([]);
    } else {
      setError(null);
      setCards(((data as unknown as DbRow[] | null) ?? []).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addCard = useCallback(async (input: CreditCardInput) => {
    const message = validateInput(input);
    if (message) return { data: null, error: { message } };

    const now = new Date().toISOString();
    const { data, error: err } = await supabase
      .from(CREDIT_CARDS_TABLE)
      .insert({
        ...toWriteRow(input),
        created_at: now,
        updated_at: now,
      })
      .select(SELECT_WITH_LABELS)
      .single();

    if (!err && data) {
      const mapped = mapRow(data as unknown as DbRow);
      setCards((prev) => [mapped, ...prev]);
      return { data: mapped, error: null };
    }
    return { data: null, error: err ?? { message: '新增失敗' } };
  }, []);

  const updateCard = useCallback(async (id: string, input: CreditCardInput) => {
    const message = validateInput(input);
    if (message) return { data: null, error: { message } };

    const { data, error: err } = await supabase
      .from(CREDIT_CARDS_TABLE)
      .update({
        ...toWriteRow(input),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT_WITH_LABELS)
      .single();

    if (!err && data) {
      const mapped = mapRow(data as unknown as DbRow);
      setCards((prev) => prev.map((card) => (card.id === id ? mapped : card)));
      return { data: mapped, error: null };
    }
    return { data: null, error: err ?? { message: '儲存失敗' } };
  }, []);

  const deleteCard = useCallback(async (id: string) => {
    const { error: err } = await supabase.from(CREDIT_CARDS_TABLE).delete().eq('id', id);
    if (!err) setCards((prev) => prev.filter((card) => card.id !== id));
    return { error: err };
  }, []);

  return { cards, loading, error, refresh, addCard, updateCard, deleteCard };
}
