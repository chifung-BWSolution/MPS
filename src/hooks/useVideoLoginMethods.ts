import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { planLoginMethodGroupWrite } from '@/lib/videoLoginMethodForm';
import {
  composeLoginMethodDisplayName,
  isVideoLoginMethodKind,
  normalizeLoginMethods,
  normalizeTwoFaMethods,
  stripLoginMethodDisplayPrefix,
  type VideoLoginMethod,
  type VideoLoginMethodInput,
  type VideoLoginMethodKind,
} from '@/types/videoLoginMethod';

type VideoLoginMethodRow = {
  id: string;
  login_method: string;
  credential_group_id: string | null;
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

const TABLE = 'login_methods';

const SELECT_COLUMNS =
  'id, login_method, credential_group_id, display_name, account_name, phone_number, email, password, two_fa_methods, note, is_active, created_at, updated_at';

function mapRow(row: VideoLoginMethodRow): VideoLoginMethod {
  const loginMethod: VideoLoginMethodKind = isVideoLoginMethodKind(row.login_method)
    ? row.login_method
    : 'account_password';

  return {
    id: row.id,
    loginMethod,
    credentialGroupId: row.credential_group_id ?? undefined,
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
    display_name: composeLoginMethodDisplayName(input.loginMethod, input.displayName),
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

  const saveGroup = useCallback(async (
    inputs: VideoLoginMethodInput[],
    options?: { groupId?: string; anchorId?: string },
  ) => {
    const prepared = inputs.flatMap((input) => {
      const displayNameRest = stripLoginMethodDisplayPrefix(input.displayName);
      if (!input.loginMethod || !displayNameRest) return [];
      return [{ ...input, displayName: displayNameRest }];
    });
    const kinds = normalizeLoginMethods(prepared.map((input) => input.loginMethod));
    if (kinds.length === 0 || prepared.length === 0) {
      return { ok: false as const, error: inputs.some((input) => input.loginMethod) ? '請輸入顯示名稱' : '請選擇登入方式' };
    }
    const byKind = new Map(prepared.map((input) => [input.loginMethod, input]));
    const normalized = kinds.flatMap((kind) => {
      const input = byKind.get(kind);
      return input ? [input] : [];
    });

    let groupId = options?.groupId;
    if (!groupId && options?.anchorId) {
      const { data, error: lookupError } = await supabase
        .from(TABLE)
        .select('credential_group_id')
        .eq('id', options.anchorId)
        .maybeSingle();
      if (lookupError) return { ok: false as const, error: lookupError.message };
      groupId = (data as { credential_group_id?: string | null } | null)?.credential_group_id ?? undefined;
      if (!groupId) return { ok: false as const, error: '找不到登入方式' };
    }

    if (!groupId) {
      const credentialGroupId = crypto.randomUUID();
      const { data, error: insertError } = await supabase
        .from(TABLE)
        .insert(normalized.map((input) => ({ ...toDbRow(input), credential_group_id: credentialGroupId })))
        .select(SELECT_COLUMNS);
      if (insertError) return { ok: false as const, error: insertError.message };
      const items = ((data as VideoLoginMethodRow[] | null) ?? []).map(mapRow);
      if (items.length === 0) return { ok: false as const, error: '新增登入方式失敗' };
      setItems((prev) => [...items, ...prev]);
      return { ok: true as const, items, removedIds: [] as string[] };
    }

    const { data: existingData, error: existingError } = await supabase
      .from(TABLE)
      .select('id, login_method')
      .eq('credential_group_id', groupId);
    if (existingError) return { ok: false as const, error: existingError.message };

    const existing = ((existingData as { id: string; login_method: string }[] | null) ?? []).map((row) => ({
      id: row.id,
      loginMethod: row.login_method,
    }));
    const plan = planLoginMethodGroupWrite(existing, normalized.map((input) => input.loginMethod));
    const saved: VideoLoginMethod[] = [];

    for (const id of plan.updateIds) {
      const current = existing.find((row) => row.id === id);
      const input = current ? byKind.get(current.loginMethod as VideoLoginMethodKind) : undefined;
      if (!input) continue;
      const { data, error: updateError } = await supabase
        .from(TABLE)
        .update(toDbRow(input))
        .eq('id', id)
        .select(SELECT_COLUMNS)
        .single();
      if (updateError) return { ok: false as const, error: updateError.message };
      if (data) saved.push(mapRow(data as VideoLoginMethodRow));
    }

    if (plan.insertKinds.length > 0) {
      const { data, error: insertError } = await supabase
        .from(TABLE)
        .insert(plan.insertKinds.flatMap((kind) => {
          const input = byKind.get(kind);
          return input ? [{ ...toDbRow(input), credential_group_id: groupId }] : [];
        }))
        .select(SELECT_COLUMNS);
      if (insertError) return { ok: false as const, error: insertError.message };
      saved.push(...((data as VideoLoginMethodRow[] | null) ?? []).map(mapRow));
    }

    if (plan.removeIds.length > 0) {
      const { error: deleteError } = await supabase.from(TABLE).delete().in('id', plan.removeIds);
      if (deleteError) return { ok: false as const, error: deleteError.message };
    }

    const removed = new Set(plan.removeIds);
    const savedIds = new Set(saved.map((item) => item.id));
    setItems((prev) => [
      ...saved,
      ...prev.filter((item) => !removed.has(item.id) && !savedIds.has(item.id)),
    ]);
    return { ok: true as const, items: saved, removedIds: plan.removeIds };
  }, []);

  const setGroupActive = useCallback(async (item: VideoLoginMethod, isActive: boolean) => {
    const patch = { is_active: isActive, updated_at: new Date().toISOString() };
    const query = supabase.from(TABLE).update(patch).select(SELECT_COLUMNS);
    const { data, error: updateError } = item.credentialGroupId
      ? await query.eq('credential_group_id', item.credentialGroupId)
      : await query.eq('id', item.id);
    if (updateError) return { ok: false as const, error: updateError.message };
    const mapped = ((data as VideoLoginMethodRow[] | null) ?? []).map(mapRow);
    const byId = new Map(mapped.map((row) => [row.id, row]));
    setItems((prev) => prev.map((row) => byId.get(row.id) ?? row));
    return { ok: true as const };
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', id);
    if (deleteError) return { ok: false as const, error: deleteError.message };
    setItems((prev) => prev.filter((item) => item.id !== id));
    return { ok: true as const };
  }, []);

  return { items, loading, error, refresh, saveGroup, setGroupActive, deleteItem };
}
