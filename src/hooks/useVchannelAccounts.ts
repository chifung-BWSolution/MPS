import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { VchannelAccount, VchannelAccountLinkedLoginMethod } from '@/types/vchannel';
import { accountToDbRow, mapAccountRow } from '@/lib/vchannelMappers';

const ACCOUNT_SELECT = 'id, vchannel_codes, account_label, platform, account_id, login_method, feedhive_managed, notes, is_active, created_at, updated_at';
const JOIN_TABLE = 'vchannel_account_login_methods';

type JoinRow = {
  vchannel_account_id: string;
  login_method_id: string;
};

type LoginMethodSlimRow = {
  id: string;
  display_name: string;
  login_method: string;
  is_active: boolean | null;
};

function mapLinkedMethod(row: LoginMethodSlimRow): VchannelAccountLinkedLoginMethod {
  return {
    id: row.id,
    displayName: row.display_name,
    loginMethod: row.login_method,
    isActive: row.is_active !== false,
  };
}

function linkedForAccount(
  accountId: string,
  joins: JoinRow[],
  methodsById: Map<string, VchannelAccountLinkedLoginMethod>,
): VchannelAccountLinkedLoginMethod[] {
  return joins
    .filter(row => row.vchannel_account_id === accountId)
    .map(row => methodsById.get(row.login_method_id))
    .filter((method): method is VchannelAccountLinkedLoginMethod => Boolean(method));
}

async function fetchJoinState(): Promise<{
  joins: JoinRow[];
  methodsById: Map<string, VchannelAccountLinkedLoginMethod>;
}> {
  const [joinRes, methodRes] = await Promise.all([
    supabase.from(JOIN_TABLE).select('vchannel_account_id, login_method_id'),
    supabase.from('vchannel_login_methods').select('id, display_name, login_method, is_active'),
  ]);

  const joins = ((joinRes.data as JoinRow[] | null) ?? []);
  const methodsById = new Map(
    ((methodRes.data as LoginMethodSlimRow[] | null) ?? []).map(row => [row.id, mapLinkedMethod(row)]),
  );
  return { joins, methodsById };
}

async function syncAccountLoginMethods(accountId: string, loginMethodIds: string[]) {
  const uniqueIds = [...new Set(loginMethodIds.filter(Boolean))];
  const { data, error: fetchError } = await supabase
    .from(JOIN_TABLE)
    .select('login_method_id')
    .eq('vchannel_account_id', accountId);

  if (fetchError) return fetchError;

  const currentIds = ((data as { login_method_id: string }[] | null) ?? []).map(row => row.login_method_id);
  const currentSet = new Set(currentIds);
  const nextSet = new Set(uniqueIds);
  const toAdd = uniqueIds.filter(id => !currentSet.has(id));
  const toRemove = currentIds.filter(id => !nextSet.has(id));

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from(JOIN_TABLE)
      .delete()
      .eq('vchannel_account_id', accountId)
      .in('login_method_id', toRemove);
    if (deleteError) return deleteError;
  }

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase.from(JOIN_TABLE).insert(
      toAdd.map(loginMethodId => ({
        vchannel_account_id: accountId,
        login_method_id: loginMethodId,
      })),
    );
    if (insertError) return insertError;
  }

  return null;
}

export function useVchannelAccounts() {
  
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
      setLoading(false);
      return;
    }

    const { joins, methodsById } = await fetchJoinState();
    setError(null);
    setAccounts(
      (data ?? []).map(row => mapAccountRow(row as never, linkedForAccount((row as { id: string }).id, joins, methodsById))),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const addAccount = useCallback(async (input: Omit<VchannelAccount, 'id' | 'createdAt' | 'updatedAt' | 'linkedLoginMethods'> & { loginMethodIds?: string[] }) => {
    const row = accountToDbRow(input);
    const { data, error: insertError } = await supabase
      .from('vchannel_accounts')
      .insert(row)
      .select(ACCOUNT_SELECT)
      .single();

    if (insertError) return insertError;
    if (!data) return new Error('新增帳號失敗');

    const loginMethodIds = input.loginMethodIds ?? [];
    const joinError = await syncAccountLoginMethods((data as { id: string }).id, loginMethodIds);
    if (joinError) return joinError;

    const { joins, methodsById } = await fetchJoinState();
    setAccounts(prev => [
      ...prev,
      mapAccountRow(data as never, linkedForAccount((data as { id: string }).id, joins, methodsById)),
    ]);
    return null;
  }, []);

  const updateAccount = useCallback(async (id: string, updates: Partial<VchannelAccount>) => {
    const existing = accounts.find(a => a.id === id);
    if (!existing) return new Error('Account not found');

    const next = { ...existing, ...updates };
    const row = accountToDbRow(next);
    const { data, error: updateError } = await supabase
      .from('vchannel_accounts')
      .update(row)
      .eq('id', id)
      .select(ACCOUNT_SELECT)
      .single();

    if (updateError) return updateError;
    if (!data) return new Error('更新帳號失敗');

    if (updates.loginMethodIds !== undefined) {
      const joinError = await syncAccountLoginMethods(id, updates.loginMethodIds);
      if (joinError) return joinError;
    }

    const { joins, methodsById } = await fetchJoinState();
    setAccounts(prev => prev.map(a => (
      a.id === id
        ? mapAccountRow(data as never, linkedForAccount(id, joins, methodsById))
        : a
    )));
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
