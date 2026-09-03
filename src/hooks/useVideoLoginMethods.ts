import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  isVideoLoginMethodKind,
  normalizeTwoFaMethods,
  type VideoLoginMethod,
  type VideoLoginMethodInput,
  type VideoLoginMethodKind,
} from '@/types/videoLoginMethod';

type VideoLoginMethodRow = {
  id: string;
  login_method: string;
  display_name: string;
  account_name: string | null;
  phone_number: string | null;
  email: string | null;
  password: string | null;
  two_fa_methods: string[] | null;
  note: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

const TABLE = 'vchannel_login_methods';

const SELECT_COLUMNS =
  'id, login_method, display_name, account_name, phone_number, email, password, two_fa_methods, note, is_active, created_at, updated_at';

function mapRow(row: VideoLoginMethodRow): VideoLoginMethod {
  const loginMethod: VideoLoginMethodKind = isVideoLoginMethodKind(row.login_method)
    ? row.login_method
    : 'account_password';

  return {
    id: row.id,
    loginMethod,
    displayName: row.display_name,
    accountName: row.account_name ?? '',
    phoneNumber: row.phone_number ?? '',
    email: row.email ?? '',
    password: row.password ?? '',
    twoFaMethods: normalizeTwoFaMethods(row.two_fa_methods ?? []),
    note: row.note ?? '',
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDbRow(input: VideoLoginMethodInput) {
  return {
    login_method: input.loginMethod,
    display_name: input.displayName.trim(),
    account_name: input.accountName?.trim() || null,
    phone_number: input.phoneNumber?.trim() || null,
    email: input.email?.trim() || null,
    password: input.password || null,
    two_fa_methods: normalizeTwoFaMethods(input.twoFaMethods ?? []),
    note: input.note?.trim() || null,
    is_active: input.isActive ?? true,
    updated_at: new Date().toISOString(),
  };
}

export function useVideoLoginMethods() {
  
  const [items, setItems] = useState<VideoLoginMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    setError(null);
    setItems(((data as VideoLoginMethodRow[] | null) ?? []).map(mapRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(async (input: VideoLoginMethodInput) => {
    const displayName = input.displayName.trim();
    if (!input.loginMethod) return { ok: false as const, error: '請選擇登入方式' };
    if (!displayName) return { ok: false as const, error: '請輸入顯示名稱' };

    const { data, error: insertError } = await supabase
      .from(TABLE)
      .insert(toDbRow({ ...input, displayName }))
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) return { ok: false as const, error: insertError.message };
    if (!data) return { ok: false as const, error: '新增登入方式失敗' };
    const item = mapRow(data as VideoLoginMethodRow);
    setItems((prev) => [item, ...prev]);
    return { ok: true as const, item };
  }, []);

  const updateItem = useCallback(async (id: string, input: VideoLoginMethodInput) => {
    const displayName = input.displayName.trim();
    if (!input.loginMethod) return { ok: false as const, error: '請選擇登入方式' };
    if (!displayName) return { ok: false as const, error: '請輸入顯示名稱' };

    const { data, error: updateError } = await supabase
      .from(TABLE)
      .update(toDbRow({ ...input, displayName }))
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .single();

    if (updateError) return { ok: false as const, error: updateError.message };
    if (data) {
      const mapped = mapRow(data as VideoLoginMethodRow);
      setItems((prev) => [mapped, ...prev.filter((item) => item.id !== id)]);
    }
    return { ok: true as const };
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', id);
    if (deleteError) return { ok: false as const, error: deleteError.message };
    setItems((prev) => prev.filter((item) => item.id !== id));
    return { ok: true as const };
  }, []);

  return { items, loading, error, refresh, addItem, updateItem, deleteItem };
}
