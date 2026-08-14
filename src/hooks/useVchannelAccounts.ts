import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { VchannelAccount } from '@/types/vchannel';
import { accountToDbRow, mapAccountRow } from '@/lib/vchannelMappers';

const ACCOUNT_SELECT = 'id, vchannel_codes, account_label, platform, account_id, login_method, feedhive_managed, notes, created_at, updated_at';

export function useVchannelAccounts() {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<VchannelAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    let { data, error: fetchError } = await supabase
      .from('vchannel_accounts')
      .select(ACCOUNT_SELECT)
      .order('platform')
      .order('account_label');

    if (fetchError) {
      const retry = await supabase.from('vchannel_accounts').select(ACCOUNT_SELECT);
      data = retry.data;
      fetchError = retry.error;
    }

    if (fetchError) {
      setError(fetchError.message);
      setAccounts([]);
    } else {
      setError(null);
      setAccounts((data ?? []).map(row => mapAccountRow(row as never)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [session, fetchAccounts]);

  const addAccount = useCallback(async (input: Omit<VchannelAccount, 'id' | 'createdAt' | 'updatedAt'>) => {
    const row = accountToDbRow(input);
    const { data, error: insertError } = await supabase
      .from('vchannel_accounts')
      .insert(row)
      .select(ACCOUNT_SELECT)
      .single();

    if (insertError) return insertError;
    if (data) setAccounts(prev => [...prev, mapAccountRow(data as never)]);
    return null;
  }, []);

  const updateAccount = useCallback(async (id: string, updates: Partial<VchannelAccount>) => {
    const existing = accounts.find(a => a.id === id);
    if (!existing) return new Error('Account not found');

    const row = accountToDbRow({ ...existing, ...updates });
    const { data, error: updateError } = await supabase
      .from('vchannel_accounts')
      .update(row)
      .eq('id', id)
      .select(ACCOUNT_SELECT)
      .single();

    if (updateError) return updateError;
    if (data) setAccounts(prev => prev.map(a => a.id === id ? mapAccountRow(data as never) : a));
    return null;
  }, [accounts]);

  const deleteAccount = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('vchannel_accounts').delete().eq('id', id);
    if (!deleteError) setAccounts(prev => prev.filter(a => a.id !== id));
    return deleteError;
  }, []);

  const accountsForChannel = useCallback((channelCode: string) => {
    const code = channelCode.toUpperCase();
    return accounts.filter(a => Array.isArray(a.vchannelCodes) && a.vchannelCodes.some(c => c.toUpperCase() === code));
  }, [accounts]);

  return { accounts, loading, error, fetchAccounts, addAccount, updateAccount, deleteAccount, accountsForChannel };
}
