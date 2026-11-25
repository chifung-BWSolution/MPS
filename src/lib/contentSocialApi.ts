/**
 * 社媒自動化營運 · 品牌組與帳號 CRUD（P4／M4-02、M4-03）
 *
 * 前端資料通道：supabase-js 直連（RLS：authenticated 對 social 三表全開）。
 * 不經過 content-social Edge Function —— 那支負責「產稿／審核／標記」，
 * 這裡是純 CRUD，直連能讓編輯即時生效，content-social 的 list 也會在下次輪詢反映。
 *
 * 錯誤一律轉成可顯示的中文訊息：
 *   - 組名重複 / 同平台 handle 重複 → 明確講是哪一個
 *   - 資料表未建立（42P01）→ isContentSchemaMissing 讓畫面降級
 */

import { supabase } from '@/lib/supabase';
import { ContentApiError, isContentApiError, isContentSchemaMissing } from '@/lib/contentApi.ts';
import {
  buildSocialDirectory,
  normalizeSocialGroupName,
  normalizeSocialHandle,
  type SocialAccountRow,
  type SocialGroupMemberRow,
  type SocialGroupRow,
  type SocialDirectory,
} from './contentSocialGroups.ts';

const GROUP_COLUMNS = 'id, name, description, archived, created_at, updated_at';
const ACCOUNT_COLUMNS =
  'id, brand_id, platform, handle, display_name, login_status, last_checked_at, archived, notes, created_at, updated_at';
const MEMBER_COLUMNS = 'group_id, account_id, created_at';

type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

/** 把 PostgREST 錯誤轉成使用者看得懂的訊息，同時保留 code 供上層判斷 */
export function socialApiErrorMessage(error: unknown): string {
  if (error instanceof ContentApiError) return error.message;
  const shape = (error ?? {}) as PostgrestLikeError;
  const text = [shape.message, shape.details, shape.hint].filter(Boolean).join(' ');
  if (String(shape.code) === '23505') {
    if (/content_social_groups_name_key|group.*name/i.test(text)) {
      return '已經有同名組，請換一個名稱';
    }
    if (/content_social_accounts_platform_handle_key|platform.*handle/i.test(text)) {
      return '這個平台已經有相同帳號（@handle），請確認是否已在其他組';
    }
    return '資料重複，請重新整理後再試';
  }
  if (String(shape.code) === '23503') {
    return '找不到對應的組或帳號（可能已被刪除），請重新整理';
  }
  if (isContentSchemaMissing(error)) {
    return '功能尚未啟用：請先執行 content_social migration';
  }
  return shape.message || '操作失敗，請稍後再試';
}

function toSocialApiError(error: unknown): ContentApiError {
  if (error instanceof ContentApiError) return error;
  const shape = (error ?? {}) as PostgrestLikeError;
  return new ContentApiError(shape.code || 'social_api_error', socialApiErrorMessage(error));
}

function ensureNoError(error: PostgrestLikeError | null): void {
  if (error) throw toSocialApiError(error);
}

// ============================================================
// 讀取
// ============================================================

export async function fetchSocialDirectory(): Promise<SocialDirectory> {
  try {
    const [groupsRes, accountsRes, membersRes] = await Promise.all([
      supabase.from('content_social_groups').select(GROUP_COLUMNS).order('name', { ascending: true }),
      supabase
        .from('content_social_accounts')
        .select(ACCOUNT_COLUMNS)
        .order('platform', { ascending: true })
        .order('handle', { ascending: true }),
      supabase.from('content_social_group_members').select(MEMBER_COLUMNS),
    ]);
    ensureNoError(groupsRes.error);
    ensureNoError(accountsRes.error);
    ensureNoError(membersRes.error);

    return buildSocialDirectory({
      groups: (groupsRes.data ?? []) as unknown as SocialGroupRow[],
      accounts: (accountsRes.data ?? []) as unknown as SocialAccountRow[],
      members: (membersRes.data ?? []) as unknown as SocialGroupMemberRow[],
    });
  } catch (error) {
    throw toSocialApiError(error);
  }
}

// ============================================================
// 組
// ============================================================

export async function createSocialGroup(input: {
  name: string;
  description?: string | null;
}): Promise<SocialGroupRow> {
  const name = normalizeSocialGroupName(input.name);
  const { data, error } = await supabase
    .from('content_social_groups')
    .insert({
      name,
      description: (input.description ?? '').trim() || null,
    })
    .select(GROUP_COLUMNS)
    .single();
  ensureNoError(error);
  return data as unknown as SocialGroupRow;
}

export async function updateSocialGroup(
  groupId: string,
  patch: { name?: string; description?: string | null },
): Promise<SocialGroupRow> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = normalizeSocialGroupName(patch.name);
  if (patch.description !== undefined) payload.description = (patch.description ?? '').trim() || null;
  if (Object.keys(payload).length === 0) {
    throw new ContentApiError('invalid_patch', '沒有要更新的欄位');
  }
  const { data, error } = await supabase
    .from('content_social_groups')
    .update(payload)
    .eq('id', groupId)
    .select(GROUP_COLUMNS)
    .single();
  ensureNoError(error);
  return data as unknown as SocialGroupRow;
}

export async function setSocialGroupArchived(groupId: string, archived: boolean): Promise<SocialGroupRow> {
  const { data, error } = await supabase
    .from('content_social_groups')
    .update({ archived })
    .eq('id', groupId)
    .select(GROUP_COLUMNS)
    .single();
  ensureNoError(error);
  return data as unknown as SocialGroupRow;
}

// ============================================================
// 組成員
// ============================================================

export async function addSocialGroupMembers(groupId: string, accountIds: readonly string[]): Promise<void> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('content_social_group_members')
    .upsert(
      ids.map((accountId) => ({ group_id: groupId, account_id: accountId })),
      { onConflict: 'group_id,account_id', ignoreDuplicates: true },
    );
  ensureNoError(error);
}

export async function removeSocialGroupMember(groupId: string, accountId: string): Promise<void> {
  const { error } = await supabase
    .from('content_social_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('account_id', accountId);
  ensureNoError(error);
}

// ============================================================
// 帳號
// ============================================================

export interface CreateSocialAccountInput {
  platform: SocialAccountRow['platform'];
  handle: string;
  displayName?: string | null;
}

export interface CreateSocialAccountsResult {
  created: SocialAccountRow[];
  errors: { handle: string; message: string }[];
}

/**
 * 批量新增帳號（逐筆 insert，單筆重複不影響其他筆）。
 * 若給了 groupId，成功建立的帳號會同時加入該組。
 */
export async function createSocialAccounts(
  rows: readonly CreateSocialAccountInput[],
  options: { groupId?: string | null } = {},
): Promise<CreateSocialAccountsResult> {
  const created: SocialAccountRow[] = [];
  const errors: CreateSocialAccountsResult['errors'] = [];

  for (const row of rows) {
    const handle = normalizeSocialHandle(row.handle);
    if (!handle) {
      errors.push({ handle: row.handle, message: '缺少平台帳號' });
      continue;
    }
    const { data, error } = await supabase
      .from('content_social_accounts')
      .insert({
        platform: row.platform,
        handle,
        display_name: (row.displayName ?? '').trim() || null,
        login_status: 'unknown',
      })
      .select(ACCOUNT_COLUMNS)
      .single();
    if (error) {
      errors.push({ handle, message: socialApiErrorMessage(error) });
      continue;
    }
    created.push(data as unknown as SocialAccountRow);
  }

  const groupId = options.groupId || '';
  if (groupId && created.length > 0) {
    await addSocialGroupMembers(groupId, created.map((account) => account.id));
  }

  return { created, errors };
}

export async function updateSocialAccount(
  accountId: string,
  patch: {
    platform?: SocialAccountRow['platform'];
    handle?: string;
    display_name?: string | null;
    login_status?: SocialAccountRow['login_status'];
    notes?: string | null;
    archived?: boolean;
  },
): Promise<SocialAccountRow> {
  const payload: Record<string, unknown> = {};
  if (patch.platform !== undefined) payload.platform = patch.platform;
  if (patch.handle !== undefined) payload.handle = normalizeSocialHandle(patch.handle);
  if (patch.display_name !== undefined) payload.display_name = (patch.display_name ?? '').trim() || null;
  if (patch.login_status !== undefined) {
    payload.login_status = patch.login_status;
    payload.last_checked_at = new Date().toISOString();
  }
  if (patch.notes !== undefined) payload.notes = (patch.notes ?? '').trim() || null;
  if (patch.archived !== undefined) payload.archived = patch.archived;
  if (Object.keys(payload).length === 0) {
    throw new ContentApiError('invalid_patch', '沒有要更新的欄位');
  }

  const { data, error } = await supabase
    .from('content_social_accounts')
    .update(payload)
    .eq('id', accountId)
    .select(ACCOUNT_COLUMNS)
    .single();
  ensureNoError(error);
  return data as unknown as SocialAccountRow;
}

/**
 * 設定帳號所屬組（多選）。
 * 以 diff 方式只做必要的 add／remove，避免「先刪後插」中途失敗造成歸屬全失。
 */
export async function syncSocialAccountGroups(
  accountId: string,
  nextGroupIds: readonly string[],
): Promise<void> {
  const { data, error } = await supabase
    .from('content_social_group_members')
    .select('group_id')
    .eq('account_id', accountId);
  ensureNoError(error);

  const current = new Set((data ?? []).map((row) => String((row as { group_id: string }).group_id)));
  const next = new Set(nextGroupIds.filter(Boolean));
  const toAdd = [...next].filter((groupId) => !current.has(groupId));
  const toRemove = [...current].filter((groupId) => !next.has(groupId));

  for (const groupId of toAdd) {
    const { error: addError } = await supabase
      .from('content_social_group_members')
      .insert({ group_id: groupId, account_id: accountId });
    if (addError && String(addError.code) !== '23505') ensureNoError(addError);
  }
  for (const groupId of toRemove) {
    await removeSocialGroupMember(groupId, accountId);
  }
}

export function isSocialSchemaMissingError(error: unknown): boolean {
  return isContentSchemaMissing(error);
}

export function isSocialApiError(error: unknown): error is ContentApiError {
  return isContentApiError(error);
}
