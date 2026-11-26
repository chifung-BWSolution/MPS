/**
 * 「編輯帳號」對話框（MPS 設計語言，M4-02／M4-03）。
 *
 * 功能：顯示名稱、平台／handle（同平台不可重複）、登入狀態（v1 手動標記）、
 * 多選所屬組、備註、歸檔／還原（不刪除歷史與歸屬）。
 */

import { useEffect, useMemo, useState } from 'react';
import { Archive, ExternalLink, KeyRound, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatZoneDateTime } from '@/lib/contentFormat.ts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SOCIAL_HANDLE_MAX,
  SOCIAL_LOGIN_STATUS_META,
  credentialDaysLeft,
  credentialExpiryLabel,
  deriveCredentialStatus,
  loginStatusMeta,
  normalizeSocialHandle,
  type SocialAccountWithGroups,
  type SocialGroupWithAccounts,
  type SocialLoginStatus,
} from '@/lib/contentSocialGroups.ts';
import { SOCIAL_PLATFORM_LABEL, SOCIAL_PLATFORM_ORDER, type SocialPlatformKey } from '@/lib/contentSocialGenerate.ts';
import type { SocialCredentialKind } from '@/lib/contentSocialApi.ts';
import {
  oauthProviderForPlatform,
  type SocialOAuthProviderStatus,
} from '@/lib/contentSocialOAuth.ts';
import {
  CredentialStatusPill,
  FormDialog,
  FormField,
  InlineAlert,
  LoginStatusPill,
  MUTED,
  PlatformBadge,
  SECTION,
} from './socialAccountsUi';

const PLATFORMS = SOCIAL_PLATFORM_ORDER;
const LOGIN_STATUSES: SocialLoginStatus[] = ['active', 'expired', 'unknown'];
const CREDENTIAL_KIND_LABEL: Record<SocialCredentialKind, string> = {
  oauth_token: 'OAuth access token',
  app_password: '應用程式密碼',
  manual_note: '手動登入備註（不支援自動判斷）',
};

export interface AccountEditorPayload {
  platform: string;
  handle: string;
  display_name: string | null;
  login_status: SocialLoginStatus;
  notes: string | null;
  groupIds: string[];
}

export function AccountEditorDialog({
  open,
  onClose,
  account,
  groups,
  onSubmit,
  onArchive,
  onSaveCredential,
  onClearCredential,
  oauthProviders,
  onStartOAuth,
}: {
  open: boolean;
  onClose: () => void;
  account: SocialAccountWithGroups;
  /** 未歸檔的組（可勾選）；已歸檔的歸屬只顯示不可勾 */
  groups: readonly SocialGroupWithAccounts[];
  onSubmit: (payload: AccountEditorPayload) => Promise<void>;
  onArchive?: (archived: boolean) => Promise<void>;
  /** 儲存登入憑證（會先送到 Edge Function 加密） */
  onSaveCredential?: (input: {
    secret: string;
    expiresAt: string | null;
    kind: SocialCredentialKind;
  }) => Promise<void>;
  onClearCredential?: () => Promise<void>;
  /** 各平台 OAuth 是否已設定（缺哪些 secrets） */
  oauthProviders?: readonly SocialOAuthProviderStatus[];
  /** 發起平台 OAuth（由父層開 popup） */
  onStartOAuth?: (accountId: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(account.display_name ?? '');
  const [platform, setPlatform] = useState(String(account.platform));
  const [handle, setHandle] = useState(account.handle);
  const [loginStatus, setLoginStatus] = useState<SocialLoginStatus>(
    (account.login_status as SocialLoginStatus) || 'unknown',
  );
  const [notes, setNotes] = useState(account.notes ?? '');
  const [groupIds, setGroupIds] = useState<Set<string>>(
    new Set(account.groups.filter((group) => !group.archived).map((group) => group.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // ---- 憑證（半自動） ----
  const [secret, setSecret] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [credentialKind, setCredentialKind] = useState<SocialCredentialKind>('oauth_token');
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialError, setCredentialError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDisplayName(account.display_name ?? '');
    setPlatform(String(account.platform));
    setHandle(account.handle);
    setLoginStatus((account.login_status as SocialLoginStatus) || 'unknown');
    setNotes(account.notes ?? '');
    setGroupIds(new Set(account.groups.filter((group) => !group.archived).map((group) => group.id)));
    const kind = (account.credential_kind as SocialCredentialKind) || 'oauth_token';
    setCredentialKind(['oauth_token', 'app_password', 'manual_note'].includes(kind) ? kind : 'oauth_token');
    setExpiryDate(account.credential_expires_at ? account.credential_expires_at.slice(0, 10) : '');
    setSecret('');
    setCredentialError('');
    setBusy(false);
    setError('');
  }, [open, account]);

  const archivedGroups = useMemo(
    () => account.groups.filter((group) => group.archived),
    [account.groups],
  );

  const credentialStatus = deriveCredentialStatus(account);
  const credentialExpiry = credentialExpiryLabel(account.credential_expires_at);
  const credentialDays = credentialDaysLeft(account.credential_expires_at);
  const oauthProvider = oauthProviderForPlatform(account.platform);
  const oauthStatus = oauthProvider
    ? oauthProviders?.find((item) => item.provider === oauthProvider)
    : undefined;

  const saveCredential = async () => {
    if (!onSaveCredential) return;
    const value = secret.trim();
    if (!value) {
      setCredentialError('請貼上平台憑證（access token／應用程式密碼）');
      return;
    }
    setCredentialBusy(true);
    setCredentialError('');
    try {
      await onSaveCredential({ secret: value, expiresAt: expiryDate || null, kind: credentialKind });
      setSecret('');
    } catch (thrown) {
      setCredentialError(thrown instanceof Error ? thrown.message : '儲存憑證失敗');
    } finally {
      setCredentialBusy(false);
    }
  };

  const clearCredential = async () => {
    if (!onClearCredential) return;
    setCredentialBusy(true);
    setCredentialError('');
    try {
      await onClearCredential();
      setSecret('');
      setExpiryDate('');
    } catch (thrown) {
      setCredentialError(thrown instanceof Error ? thrown.message : '清除憑證失敗');
    } finally {
      setCredentialBusy(false);
    }
  };

  const handleProblem = normalizeSocialHandle(handle) ? null : '請輸入平台帳號';

  const toggleGroup = (groupId: string) => {
    setGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const submit = async () => {
    if (handleProblem) {
      setError(handleProblem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        platform,
        handle: normalizeSocialHandle(handle),
        display_name: displayName.trim() || null,
        login_status: loginStatus,
        notes: notes.trim() || null,
        groupIds: [...groupIds],
      });
      onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!onArchive) return;
    setBusy(true);
    setError('');
    try {
      await onArchive(!account.archived);
      onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '操作失敗');
    } finally {
      setBusy(false);
    }
  };

  const loginMeta = loginStatusMeta(loginStatus);

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy && !next) onClose();
      }}
      icon={<PlatformBadge platform={platform} />}
      title={`編輯帳號：@${account.handle}`}
      description="v1 為手動交付：登入狀態只作提醒，不會自動呼叫平台 API。"
      footer={
        <>
          {onArchive ? (
            <Button
              variant={account.archived ? 'outline' : 'ghost'}
              size="sm"
              className={
                account.archived
                  ? 'h-8 gap-1.5'
                  : 'h-8 gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700'
              }
              disabled={busy}
              onClick={() => void archive()}
            >
              {account.archived ? <RotateCcw size={12} /> : <Archive size={12} />}
              {account.archived ? '還原帳號' : '歸檔帳號'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button size="sm" disabled={busy || Boolean(handleProblem)} onClick={() => void submit()}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              儲存
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <InlineAlert>{error}</InlineAlert>}

        <div className="grid gap-2 sm:grid-cols-2">
          <FormField label="平台">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-9 bg-white text-[13px]" aria-label="平台">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {SOCIAL_PLATFORM_LABEL[key] ?? key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="平台帳號" hint={`上限 ${SOCIAL_HANDLE_MAX} 字元`}>
            <Input
              value={handle}
              maxLength={SOCIAL_HANDLE_MAX}
              onChange={(event) => setHandle(event.target.value)}
              className="h-9 bg-white font-mono text-[12.5px]"
              aria-label="平台帳號"
            />
          </FormField>
          <FormField label="顯示名稱">
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="例如：Beauty100 美妝誌"
              className="h-9 bg-white text-[13px]"
              aria-label="顯示名稱"
            />
          </FormField>
          <FormField label="登入狀態" hint={loginMeta.hint}>
            <Select
              value={loginStatus}
              onValueChange={(value) => setLoginStatus(value as SocialLoginStatus)}
            >
              <SelectTrigger className="h-9 bg-white text-[13px]" aria-label="登入狀態">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOGIN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {SOCIAL_LOGIN_STATUS_META[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
          <LoginStatusPill status={loginStatus} />
          <span className={MUTED}>{loginMeta.hint}</span>
        </div>

        {/* ---- 登入憑證（半自動）---- */}
        <section className={SECTION}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-bold text-[#0d1a2d]">登入憑證（半自動）</h3>
              <CredentialStatusPill status={credentialStatus} />
            </div>
            <span className={MUTED}>加密儲存 · 不回傳明文</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
            <span>到期日：{credentialExpiry ?? '未設定（長效 token）'}</span>
            {credentialDays !== null && (
              <span className={credentialDays < 0 ? 'font-semibold text-rose-600' : undefined}>
                {credentialDays < 0 ? `已過期 ${Math.abs(credentialDays)} 天` : `剩 ${credentialDays} 天`}
              </span>
            )}
            {account.credential_fingerprint && <span>尾碼 {account.credential_fingerprint}</span>}
            {account.credential_updated_at && (
              <span>更新於 {formatZoneDateTime(account.credential_updated_at, 'Asia/Hong_Kong')}</span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            v1 不呼叫平台 API：憑證只用於到期提醒與「全部檢測」的解密自檢，不會自動發文。
          </p>

          {/* ---- 平台 OAuth 登入 ---- */}
          {oauthProvider ? (
            <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#0d1a2d]">平台登入（OAuth）</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {oauthStatus?.note ?? '用官方授權登入；token 只會加密存在後端，前端拿不到明文。'}
                  </p>
                </div>
                {onStartOAuth && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    disabled={credentialBusy || !oauthStatus?.configured}
                    onClick={() => void onStartOAuth(account.id)}
                    title={
                      oauthStatus?.configured
                        ? `開啟 ${oauthStatus.label} 授權視窗`
                        : `尚未設定 OAuth；缺少 ${(oauthStatus?.missing_env ?? []).join('／') || '相關 secrets'}`
                    }
                  >
                    <ExternalLink size={12} />
                    使用 {oauthStatus?.label ?? oauthProvider} 登入
                  </Button>
                )}
              </div>
              {oauthStatus && !oauthStatus.configured && (
                <p className="mt-1.5 text-[11px] leading-4 text-amber-700">
                  尚未設定 OAuth：缺少 {oauthStatus.missing_env.join('／')}（需管理層補 secrets，並在平台後台登記 redirect
                  URI）。
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
              此平台（{SOCIAL_PLATFORM_LABEL[account.platform] ?? account.platform}）沒有公開 OAuth，請手動貼上憑證。
            </p>
          )}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <FormField label="憑證類型">
              <Select
                value={credentialKind}
                onValueChange={(value) => setCredentialKind(value as SocialCredentialKind)}
              >
                <SelectTrigger className="h-9 bg-white text-[13px]" aria-label="憑證類型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CREDENTIAL_KIND_LABEL) as SocialCredentialKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {CREDENTIAL_KIND_LABEL[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="到期日" hint="留空＝長效 token">
              <Input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                className="h-9 bg-white text-[13px]"
                aria-label="憑證到期日"
              />
            </FormField>
            <FormField label="憑證內容" hint="只會送往 Edge Function 加密" className="sm:col-span-2">
              <Input
                type="password"
                autoComplete="new-password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="貼上 access token／應用程式密碼"
                className="h-9 bg-white font-mono text-[12.5px]"
                aria-label="憑證內容"
              />
            </FormField>
          </div>
          {credentialError && (
            <div className="mt-2">
              <InlineAlert>{credentialError}</InlineAlert>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={credentialBusy || !secret.trim()}
              onClick={() => void saveCredential()}
            >
              {credentialBusy ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
              {credentialStatus === 'none' ? '儲存憑證' : '更新憑證'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              disabled={credentialBusy || credentialStatus === 'none'}
              onClick={() => void clearCredential()}
            >
              <Trash2 size={12} />
              清除憑證
            </Button>
          </div>
        </section>

        <section className={SECTION}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-bold text-[#0d1a2d]">所屬組（可多選）</h3>
            <span className={MUTED}>已選 {groupIds.size} 組</span>
          </div>
          {groups.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              目前沒有未歸檔的組，請先在「組管理」建立。
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {groups.map((group) => {
                const active = groupIds.has(group.id);
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleGroup(group.id)}
                    className={
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ' +
                      (active
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700')
                    }
                  >
                    {group.name}
                    <span className={active ? 'text-white/70' : 'text-slate-400'}>{group.accounts.length}</span>
                  </button>
                );
              })}
            </div>
          )}
          {archivedGroups.length > 0 && (
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              已歸檔的歸屬：
              {archivedGroups.map((group) => (
                <span
                  key={group.id}
                  className="ml-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px]"
                >
                  {group.name}
                </span>
              ))}
            </p>
          )}
        </section>

        <FormField label="備註" hint="選填">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="例如：由 Amy 負責、每週三更新、登入需要公司 VPN"
            className="min-h-[64px] bg-white text-[13px]"
            aria-label="帳號備註"
          />
        </FormField>
      </div>
    </FormDialog>
  );
}
