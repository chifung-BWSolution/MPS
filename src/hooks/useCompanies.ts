import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Company } from '@/types/app';
import { useAuth } from '@/context/AuthContext';
import { companies as staticCompanies } from '@/data/mockData';

type DbRow = {
  id: string;
  company_code: string;
  company_name_zh: string;
  company_name_en: string;
  br_no: string;
  bank_name: string;
  bank_account: string;
  address: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): Company {
  return {
    id: row.id,
    companyCode: row.company_code,
    companyNameZh: row.company_name_zh,
    companyNameEn: row.company_name_en,
    brNo: row.br_no,
    bankName: row.bank_name,
    bankAccount: row.bank_account,
    address: row.address,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    logoUrl: row.logo_url ?? '',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useCompanies() {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setCompanies(staticCompanies as Company[]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('company_list')
      .select('*')
      .order('company_code')
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          setCompanies(staticCompanies as Company[]);
        } else if (!data || data.length === 0) {
          setCompanies(staticCompanies as Company[]);
        } else {
          setCompanies((data as DbRow[]).map(mapRow));
        }
        setLoading(false);
      });
  }, [session]);

  const addCompany = useCallback(async (company: Company) => {
    const row = {
      id: company.id,
      company_code: company.companyCode,
      company_name_zh: company.companyNameZh,
      company_name_en: company.companyNameEn,
      br_no: company.brNo,
      bank_name: company.bankName,
      bank_account: company.bankAccount,
      address: company.address,
      contact_person: company.contactPerson,
      contact_phone: company.contactPhone,
      contact_email: company.contactEmail,
      logo_url: company.logoUrl || null,
      is_active: company.isActive,
    };
    const { error } = await supabase.from('company_list').insert(row);
    if (!error) setCompanies(prev => [...prev, company]);
    return error;
  }, []);

  const updateCompany = useCallback(async (id: string, updates: Partial<Company>) => {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.companyNameZh !== undefined) row.company_name_zh = updates.companyNameZh;
    if (updates.companyNameEn !== undefined) row.company_name_en = updates.companyNameEn;
    if (updates.brNo !== undefined) row.br_no = updates.brNo;
    if (updates.bankName !== undefined) row.bank_name = updates.bankName;
    if (updates.bankAccount !== undefined) row.bank_account = updates.bankAccount;
    if (updates.address !== undefined) row.address = updates.address;
    if (updates.contactPerson !== undefined) row.contact_person = updates.contactPerson;
    if (updates.contactPhone !== undefined) row.contact_phone = updates.contactPhone;
    if (updates.contactEmail !== undefined) row.contact_email = updates.contactEmail;
    if (updates.logoUrl !== undefined) row.logo_url = updates.logoUrl || null;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;

    const { error } = await supabase.from('company_list').update(row).eq('id', id);
    if (!error) setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    return error;
  }, []);

  const deleteCompany = useCallback(async (id: string) => {
    const { error } = await supabase.from('company_list').delete().eq('id', id);
    if (!error) setCompanies(prev => prev.filter(c => c.id !== id));
    return error;
  }, []);

  return { companies, loading, error, addCompany, updateCompany, deleteCompany };
}
