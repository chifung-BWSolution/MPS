/**
 * 社媒自動化營運 · 品牌組／帳號目錄 hook（P4／M4-02）
 *
 * 一次抓三張表組成 `SocialDirectory`（組 ↔ 帳號多對多）。
 * 所有 mutation 成功後都會 refresh，讓「編輯組」對話框、帳號分頁與組卡片同步；
 * 產業面的「今日工作」由 content-social 每 20 秒輪詢，最慢 20 秒也會看到新組。
 *
 * 錯誤處理：
 *   - 讀取失敗 → `error`（頁面顯示可重試卡片）
 *   - mutation 失敗 → 往外拋，頁面 toast；不把整頁打成錯誤狀態
 *   - 42P01 → `missingSchema=true`（顯示「功能尚未啟用」）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import {
  addSocialGroupMembers,
  createSocialAccounts,
  createSocialGroup,
  fetchSocialDirectory,
  isSocialSchemaMissingError,
  removeSocialGroupMember,
  setSocialGroupArchived,
  socialApiErrorMessage,
  syncSocialAccountGroups,
  updateSocialAccount,
  updateSocialGroup,
  type CreateSocialAccountInput,
  type CreateSocialAccountsResult,
} from '@/lib/contentSocialApi.ts';
import type {
  SocialAccountRow,
  SocialDirectory,
  SocialGroupRow,
} from '@/lib/contentSocialGroups.ts';

export interface UseSocialDirectoryResult {
  directory: SocialDirectory | null;
  loading: boolean;
  error: string | null;
  missingSchema: boolean;
  /** 正在執行的 mutation key（按鈕 loading 用）；null = 閒置 */
  acting: string | null;
  refresh: () => Promise<void>;
  createGroup: (input: { name: string; description?: string | null }) => Promise<SocialGroupRow>;
  updateGroup: (
    groupId: string,
    patch: { name?: string; description?: string | null },
  ) => Promise<SocialGroupRow>;
  setGroupArchived: (groupId: string, archived: boolean) => Promise<void>;
  addMembers: (groupId: string, accountIds: readonly string[]) => Promise<void>;
  removeMember: (groupId: string, accountId: string) => Promise<void>;
  createAccounts: (
    rows: readonly CreateSocialAccountInput[],
    options?: { groupId?: string | null },
  ) => Promise<CreateSocialAccountsResult>;
  updateAccount: (
    accountId: string,
    patch: Parameters<typeof updateSocialAccount>[1],
  ) => Promise<SocialAccountRow>;
  syncAccountGroups: (accountId: string, groupIds: readonly string[]) => Promise<void>;
  setAccountArchived: (accountId: string, archived: boolean) => Promise<void>;
}

export function useSocialDirectory(): UseSocialDirectoryResult {
  const [directory, setDirectory] = useState<SocialDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await fetchSocialDirectory();
      if (!mountedRef.current) return;
      setDirectory(next);
      setError(null);
      setMissingSchema(false);
    } catch (loadError) {
      if (!mountedRef.current) return;
      if (isSocialSchemaMissingError(loadError)) {
        setMissingSchema(true);
        setError(null);
        setDirectory(null);
      } else {
        setError(contentErrorMessage(loadError) || socialApiErrorMessage(loadError));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await load();
    } finally {
      inFlightRef.current = false;
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 回到頁面時補一次（另一個人可能剛改過組）
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const runMutation = useCallback(
    async <T,>(key: string, action: () => Promise<T>): Promise<T> => {
      setActing(key);
      try {
        const result = await action();
        await load();
        return result;
      } catch (mutationError) {
        if (isSocialSchemaMissingError(mutationError)) {
          setMissingSchema(true);
          setError(null);
        }
        throw mutationError;
      } finally {
        if (mountedRef.current) setActing(null);
      }
    },
    [load],
  );

  const createGroup = useCallback(
    (input: { name: string; description?: string | null }) =>
      runMutation('create_group', () => createSocialGroup(input)),
    [runMutation],
  );

  const updateGroup = useCallback(
    (groupId: string, patch: { name?: string; description?: string | null }) =>
      runMutation(`update_group:${groupId}`, () => updateSocialGroup(groupId, patch)),
    [runMutation],
  );

  const setGroupArchived = useCallback(
    (groupId: string, archived: boolean) =>
      runMutation(`archive_group:${groupId}:${archived}`, async () => {
        await setSocialGroupArchived(groupId, archived);
      }),
    [runMutation],
  );

  const addMembers = useCallback(
    (groupId: string, accountIds: readonly string[]) =>
      runMutation(`add_members:${groupId}`, () => addSocialGroupMembers(groupId, accountIds)),
    [runMutation],
  );

  const removeMember = useCallback(
    (groupId: string, accountId: string) =>
      runMutation(`remove_member:${groupId}:${accountId}`, () => removeSocialGroupMember(groupId, accountId)),
    [runMutation],
  );

  const createAccounts = useCallback(
    (rows: readonly CreateSocialAccountInput[], options?: { groupId?: string | null }) =>
      runMutation('create_accounts', () => createSocialAccounts(rows, options)),
    [runMutation],
  );

  const updateAccount = useCallback(
    (accountId: string, patch: Parameters<typeof updateSocialAccount>[1]) =>
      runMutation(`update_account:${accountId}`, () => updateSocialAccount(accountId, patch)),
    [runMutation],
  );

  const syncAccountGroups = useCallback(
    (accountId: string, groupIds: readonly string[]) =>
      runMutation(`sync_groups:${accountId}`, () => syncSocialAccountGroups(accountId, groupIds)),
    [runMutation],
  );

  const setAccountArchived = useCallback(
    (accountId: string, archived: boolean) =>
      runMutation(`archive_account:${accountId}:${archived}`, async () => {
        await updateSocialAccount(accountId, { archived });
      }),
    [runMutation],
  );

  return {
    directory,
    loading,
    error,
    missingSchema,
    acting,
    refresh,
    createGroup,
    updateGroup,
    setGroupArchived,
    addMembers,
    removeMember,
    createAccounts,
    updateAccount,
    syncAccountGroups,
    setAccountArchived,
  };
}
