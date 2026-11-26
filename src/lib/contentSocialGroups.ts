/**
 * 社媒自動化營運 · 品牌組與帳號（P4／M4-02）
 *
 * 純函式層：型別、handle 正規化、批量新增解析、組名驗證、目錄索引。
 * 這支同時被 hook 與自測腳本載入，不得 import supabase 或瀏覽器 API。
 *
 * 資料表（public schema，已部署）：
 *   content_social_groups          id / name(unique) / description / archived
 *   content_social_accounts        id / platform / handle / display_name / login_status / notes / archived
 *                                  UNIQUE(platform, handle)
 *   content_social_group_members   (group_id, account_id)
 *
 * 語義沿用 B100：一個組＝一組跨平台帳號；一個帳號可以同時屬於多個組。
 */

import { platformOrder, type SocialPlatformKey } from './contentSocialGenerate.ts';

export type SocialLoginStatus = 'active' | 'expired' | 'unknown';

export const SOCIAL_GROUP_NAME_MAX = 40;
export const SOCIAL_HANDLE_MAX = 120;
export const SOCIAL_DESCRIPTION_MAX = 200;

export interface SocialGroupRow {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SocialAccountRow {
  id: string;
  brand_id: string | null;
  platform: SocialPlatformKey | string;
  handle: string;
  display_name: string | null;
  login_status: SocialLoginStatus | string;
  last_checked_at: string | null;
  archived: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /**
   * 憑證鏡像（非機密，可安全顯示；null = 未設定）。
   * 密文只存在 content_social_account_credentials，前端永遠拿不到。
   */
  credential_status?: string | null;
  credential_kind?: string | null;
  credential_expires_at?: string | null;
  credential_fingerprint?: string | null;
  credential_updated_at?: string | null;
}

export interface SocialGroupMemberRow {
  group_id: string;
  account_id: string;
  created_at?: string;
}

export interface SocialGroupRef {
  id: string;
  name: string;
  archived: boolean;
}

export interface SocialAccountWithGroups extends SocialAccountRow {
  /** 帳號所屬的所有組（含已歸檔，供編輯時辨識） */
  groups: SocialGroupRef[];
}

export interface SocialGroupWithAccounts extends SocialGroupRow {
  /** 組內帳號（不含已歸檔帳號；跨平台排序） */
  accounts: SocialAccountWithGroups[];
}

export interface SocialDirectory {
  /** 未歸檔組 */
  groups: SocialGroupWithAccounts[];
  /** 已歸檔組（頁面底部「已歸檔」區塊） */
  archivedGroups: SocialGroupWithAccounts[];
  /** 全部帳號（含已歸檔，帳號分頁要顯示） */
  accounts: SocialAccountWithGroups[];
}

// ============================================================
// 平台與登入狀態
// ============================================================

/** 平台圓點顏色（B100 對應色：IG 洋紅、Threads 墨黑、FB 藍） */
export const SOCIAL_PLATFORM_DOT: Record<string, string> = {
  instagram: 'bg-[#c13584]',
  threads: 'bg-[#0e0e12]',
  facebook: 'bg-[#1877f2]',
  xiaohongshu: 'bg-[#ff2442]',
  youtube: 'bg-[#ff0000]',
  other: 'bg-[#8a847b]',
};

export const SOCIAL_LOGIN_STATUS_META: Record<
  SocialLoginStatus,
  { label: string; tone: 'green' | 'red' | 'amber'; hint: string }
> = {
  active: { label: '已登入', tone: 'green', hint: '平台授權有效，可以交付內容' },
  expired: { label: '登入已過期', tone: 'red', hint: '需要重新登入平台帳號，否則無法交付' },
  unknown: { label: '未設定', tone: 'amber', hint: '尚未確認登入狀態，請人工核對' },
};

export function loginStatusMeta(status: string | null | undefined) {
  return SOCIAL_LOGIN_STATUS_META[(status || 'unknown') as SocialLoginStatus] ?? SOCIAL_LOGIN_STATUS_META.unknown;
}

export function platformDotClass(platform: string | null | undefined): string {
  return SOCIAL_PLATFORM_DOT[String(platform || 'other')] ?? SOCIAL_PLATFORM_DOT.other;
}

// ============================================================
// 登入憑證（半自動，M4-03）
//
// v1 不呼叫平台 API：只記錄加密後的憑證 + 到期日，
// 由「到期日」與「解密自檢」判斷狀態；前端只讀非機密鏡像。
// ============================================================

export type SocialCredentialStatus = 'none' | 'active' | 'expiring' | 'expired' | 'invalid';

/** 少於這個天數就顯示「即將到期」，讓負責人先重登，不要等到失效 */
export const CREDENTIAL_EXPIRING_DAYS = 7;

export interface SocialCredentialMeta {
  label: string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose';
  hint: string;
}

export const SOCIAL_CREDENTIAL_STATUS_META: Record<SocialCredentialStatus, SocialCredentialMeta> = {
  none: { label: '未設定憑證', tone: 'slate', hint: '尚未記錄登入憑證；到期檢測會略過此帳號' },
  active: { label: '憑證有效', tone: 'emerald', hint: '憑證已加密儲存，且未到期' },
  expiring: { label: '即將到期', tone: 'amber', hint: `${CREDENTIAL_EXPIRING_DAYS} 天內到期，請安排重新登入` },
  expired: { label: '憑證已過期', tone: 'rose', hint: '到期日已過，請重新登入並更新憑證' },
  invalid: { label: '憑證失效', tone: 'rose', hint: '無法解密（金鑰可能已輪換）或內容已失效，請重新貼上' },
};

export function credentialStatusMeta(status: string | null | undefined): SocialCredentialMeta {
  return SOCIAL_CREDENTIAL_STATUS_META[(status || 'none') as SocialCredentialStatus] ?? SOCIAL_CREDENTIAL_STATUS_META.none;
}

/** 剩餘天數：未到期進位、已過期退位；沒有到期日回 null（長效 token） */
export function credentialDaysLeft(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const value = new Date(expiresAt).getTime();
  if (!Number.isFinite(value)) return null;
  const days = (value - now.getTime()) / 86_400_000;
  return days >= 0 ? Math.ceil(days) : -Math.ceil(-days);
}

/**
 * 由帳號的鏡像欄位推導憑證狀態（前端即時計算，不依賴後端更新）。
 * 規則與 Edge Function `deriveCredentialMirror` 一致：
 *   invalid（後端標記）> 無到期日 = active > 已過期 expired > 7 天內 expiring > active
 */
export function deriveCredentialStatus(
  account: Pick<
    SocialAccountRow,
    'credential_status' | 'credential_expires_at'
  > | null | undefined,
  now: Date = new Date(),
): SocialCredentialStatus {
  if (!account) return 'none';
  if (account.credential_status === 'invalid') return 'invalid';
  const hasCredential =
    Boolean(account.credential_status) || Boolean(account.credential_expires_at);
  if (!hasCredential) return 'none';
  const daysLeft = credentialDaysLeft(account.credential_expires_at, now);
  if (daysLeft === null) return 'active';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= CREDENTIAL_EXPIRING_DAYS) return 'expiring';
  return 'active';
}

export function credentialNeedsAttention(status: SocialCredentialStatus): boolean {
  return status === 'expiring' || status === 'expired' || status === 'invalid';
}

export interface CredentialSummary {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  invalid: number;
  none: number;
  /** 過期／失效／即將到期 */
  needsAttention: number;
}

export function summarizeCredentials(
  accounts: readonly Pick<SocialAccountRow, 'credential_status' | 'credential_expires_at'>[],
  now: Date = new Date(),
): CredentialSummary {
  const summary: CredentialSummary = {
    total: accounts.length,
    active: 0,
    expiring: 0,
    expired: 0,
    invalid: 0,
    none: 0,
    needsAttention: 0,
  };
  for (const account of accounts) {
    const status = deriveCredentialStatus(account, now);
    summary[status] += 1;
    if (credentialNeedsAttention(status)) summary.needsAttention += 1;
  }
  return summary;
}

/** 到期日顯示（YYYY-MM-DD，站點一律香港時間） */
export function credentialExpiryLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ============================================================
// 正規化與驗證
// ============================================================

/** 與 B100 `normalizeHandle()` 對齊：全形轉半形、去空白、去開頭 @。 */
export function normalizeSocialHandle(raw: string | null | undefined): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/^@+/, '')
    .trim();
}

export function normalizeSocialGroupName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ValidateGroupNameOptions {
  /** 其他組名（會忽略大小寫與頭尾空白） */
  existing?: readonly string[];
  /** 改名時自己的名稱，不列為重複 */
  selfName?: string | null;
}

/** 回傳錯誤訊息；null 代表合法。 */
export function validateSocialGroupName(
  raw: string | null | undefined,
  options: ValidateGroupNameOptions = {},
): string | null {
  const name = normalizeSocialGroupName(raw);
  if (!name) return '請輸入組名';
  if ([...name].length > SOCIAL_GROUP_NAME_MAX) {
    return `組名最多 ${SOCIAL_GROUP_NAME_MAX} 個字`;
  }
  const normalized = name.toLocaleLowerCase();
  const self = normalizeSocialGroupName(options.selfName).toLocaleLowerCase();
  const duplicated = (options.existing ?? []).some(
    (existing) => normalizeSocialGroupName(existing).toLocaleLowerCase() === normalized && normalized !== self,
  );
  return duplicated ? '已經有同名組，請換一個名稱' : null;
}

// ============================================================
// 批量新增帳號（組編輯器「按平台批量新增」）
// ============================================================

export interface BulkAccountRow {
  platform: SocialPlatformKey;
  handle: string;
  displayName: string | null;
}

export interface ParsedBulkAccounts {
  rows: BulkAccountRow[];
  /** 逐行問題（行號 + 原因），不會阻擋其他合法的行 */
  problems: string[];
}

/**
 * 每行一個平台帳號；可寫「顯示名稱 | 平台帳號」。
 * 與 B100 一致：合法的行照樣送出，問題行逐行回報留在輸入框讓使用者修正。
 */
export function parseBulkAccountLines(
  raw: string | null | undefined,
  platform: SocialPlatformKey,
): ParsedBulkAccounts {
  const rows: BulkAccountRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  String(raw ?? '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const text = line.trim();
      if (!text) return;
      const parts = text.split(/[|｜]/);
      const displayName = parts.length > 1 ? parts.slice(0, -1).join(' ').trim() : '';
      const handle = normalizeSocialHandle(parts.length > 1 ? parts[parts.length - 1] : text);
      if (!handle) {
        problems.push(`第 ${index + 1} 行：缺少平台帳號`);
        return;
      }
      if ([...handle].length > SOCIAL_HANDLE_MAX) {
        problems.push(`第 ${index + 1} 行：平台帳號太長（上限 ${SOCIAL_HANDLE_MAX} 字元）`);
        return;
      }
      const key = handle.toLocaleLowerCase();
      if (seen.has(key)) {
        problems.push(`第 ${index + 1} 行：@${handle} 在本批重複`);
        return;
      }
      seen.add(key);
      rows.push({ platform, handle, displayName: displayName || null });
    });

  return { rows, problems };
}

// ============================================================
// 目錄索引（組 ↔ 帳號 多對多）
// ============================================================

export function buildSocialDirectory(input: {
  groups: readonly SocialGroupRow[];
  accounts: readonly SocialAccountRow[];
  members: readonly SocialGroupMemberRow[];
}): SocialDirectory {
  const accountRows = [...input.accounts];
  const accountById = new Map(accountRows.map((account) => [account.id, account]));

  const groupRefsByAccount = new Map<string, SocialGroupRef[]>();
  const accountIdsByGroup = new Map<string, Set<string>>();

  for (const member of input.members) {
    const account = accountById.get(member.account_id);
    if (!account) continue;
    const group = input.groups.find((item) => item.id === member.group_id);
    if (!group) continue;

    const refs = groupRefsByAccount.get(account.id) ?? [];
    refs.push({ id: group.id, name: group.name, archived: group.archived });
    groupRefsByAccount.set(account.id, refs);

    const ids = accountIdsByGroup.get(group.id) ?? new Set<string>();
    ids.add(account.id);
    accountIdsByGroup.set(group.id, ids);
  }

  const accounts: SocialAccountWithGroups[] = accountRows
    .map((account) => ({
      ...account,
      groups: (groupRefsByAccount.get(account.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort(
      (a, b) =>
        platformOrder(a.platform) - platformOrder(b.platform) ||
        String(a.handle).localeCompare(String(b.handle)),
    );

  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  const hydrateGroup = (group: SocialGroupRow): SocialGroupWithAccounts => {
    const ids = accountIdsByGroup.get(group.id) ?? new Set<string>();
    const groupAccounts = [...ids]
      .map((id) => accountsById.get(id))
      .filter((account): account is SocialAccountWithGroups => Boolean(account) && !account!.archived)
      .sort(
        (a, b) =>
          platformOrder(a.platform) - platformOrder(b.platform) ||
          String(a.handle).localeCompare(String(b.handle)),
      );
    return { ...group, accounts: groupAccounts };
  };

  const groups = input.groups
    .filter((group) => !group.archived)
    .map(hydrateGroup)
    .sort((a, b) => a.name.localeCompare(b.name));
  const archivedGroups = input.groups
    .filter((group) => group.archived)
    .map(hydrateGroup)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { groups, archivedGroups, accounts };
}

// ============================================================
// 檢視用衍生資料
// ============================================================

export interface GroupHealthSummary {
  total: number;
  /** 已登入（可交付） */
  connected: number;
  /** 過期或未設定，需要人工處理 */
  needsAttention: number;
}

export function summarizeGroupHealth(accounts: readonly Pick<SocialAccountRow, 'login_status'>[]): GroupHealthSummary {
  let connected = 0;
  let needsAttention = 0;
  for (const account of accounts) {
    if (account.login_status === 'active') connected += 1;
    else needsAttention += 1;
  }
  return { total: accounts.length, connected, needsAttention };
}

/** M4-02：歸檔前至少保留一個未歸檔的組（避免首頁沒有可交付的組） */
export function canArchiveSocialGroup(
  groups: readonly Pick<SocialGroupRow, 'id' | 'archived'>[],
  targetId: string,
): boolean {
  const target = groups.find((group) => group.id === targetId);
  if (!target || target.archived) return true;
  return groups.some((group) => group.id !== targetId && !group.archived);
}

/** 同平台帳號分桶，供編輯器分組顯示 */
export function groupAccountsByPlatform<T extends Pick<SocialAccountRow, 'platform'>>(
  accounts: readonly T[],
): { platform: string; accounts: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const account of accounts) {
    const bucket = buckets.get(account.platform) ?? [];
    bucket.push(account);
    buckets.set(account.platform, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => platformOrder(a[0]) - platformOrder(b[0]))
    .map(([platform, rows]) => ({ platform, accounts: rows }));
}

/** 帳號在畫面上的顯示名稱：顯示名稱 → @handle */
export function accountDisplayLabel(account: Pick<SocialAccountRow, 'handle' | 'display_name'>): string {
  const display = (account.display_name || '').trim();
  return display || `@${account.handle}`;
}
