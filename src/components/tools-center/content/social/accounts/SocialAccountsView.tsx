/**
 * 社媒自動化營運 · 品牌與帳號（`social/accounts`）—— MPS 設計語言
 *
 * 對映 PRD §10「品牌／帳號組（一帳號多組）」、M4-02／M4-03：
 *   兩個分頁：組管理（每組一張卡＋帳號列）／編輯帳號（全量帳號、登入狀態、歸屬）
 *   操作：新建組、編輯組（改名／加現有帳號／批量新增）、改名、歸檔／還原
 *   帳號：編輯（顯示名／handle／平台／登入狀態／備註／多組）、歸檔／還原
 *
 * 設計：MPS（白卡、teal 主色、`#f5f8fc` 底、6px 圓角、shadow-card、shadcn 元件）。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  DatabaseZap,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/contentPermissions.ts';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import { formatZoneDateTime } from '@/lib/contentFormat.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { useSocialDirectory } from '@/hooks/useSocialDirectory';
import {
  canArchiveSocialGroup,
  credentialExpiryLabel,
  deriveCredentialStatus,
  summarizeCredentials,
  summarizeGroupHealth,
  type SocialAccountWithGroups,
  type SocialGroupWithAccounts,
} from '@/lib/contentSocialGroups.ts';
import { SOCIAL_OAUTH_MESSAGE, oauthProviderForPlatform } from '@/lib/contentSocialOAuth.ts';
import { socialPlatformLabel } from '@/lib/contentSocialGenerate.ts';
import type { CreateSocialAccountInput } from '@/lib/contentSocialApi.ts';
import { ContentEmptyState } from '../../shell/ContentEmptyState';
import { ContentMetricBar, type ContentMetricItem } from '../../shell/ContentMetricBar';
import { ContentPageHeader } from '../../shell/ContentPageHeader';
import {
  AccountsCard,
  AccountsCardHeader,
  CredentialStatusPill,
  InlineAlert,
  LoginStatusPill,
  MUTED,
  PlatformLabel,
} from './socialAccountsUi';
import {
  ArchiveGroupDialog,
  CreateAccountsDialog,
  NewGroupDialog,
  RenameGroupDialog,
  RestoreGroupButton,
} from './GroupDialogs';
import { GroupEditorDialog, type GroupEditorSubmitPayload } from './GroupEditorDialog';
import { AccountEditorDialog, type AccountEditorPayload } from './AccountEditorDialog';

type AccountsTab = 'groups' | 'accounts';

function checkedAtLabel(iso: string | null | undefined): string {
  if (!iso) return '未檢查';
  return formatZoneDateTime(iso, 'Asia/Hong_Kong');
}

/** 統計用的小顆粒（MPS 色票：emerald／amber／slate） */
function CountPill({
  tone,
  children,
}: {
  tone: 'emerald' | 'amber' | 'slate';
  children: ReactNode;
}) {
  const classes = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-[3px] text-[11px] font-semibold leading-4 ${classes}`}
    >
      {children}
    </span>
  );
}

// ============================================================
// 帳號列（組卡內）
// ============================================================

function AccountLine({
  account,
  canWrite,
  onEdit,
  onOAuth,
}: {
  account: SocialAccountWithGroups;
  canWrite: boolean;
  onEdit: () => void;
  onOAuth?: (account: SocialAccountWithGroups) => void;
}) {
  const credentialStatus = deriveCredentialStatus(account);
  const credentialExpiry = credentialExpiryLabel(account.credential_expires_at);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <PlatformLabel platform={account.platform} />
            <span className="truncate font-mono text-[12px] text-slate-500">@{account.handle}</span>
            {account.display_name && (
              <span className="truncate text-[12px] text-muted-foreground">{account.display_name}</span>
            )}
            {account.groups.length > 1 && (
              <CountPill tone="slate">同時在 {account.groups.length} 組</CountPill>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {credentialStatus === 'none' ? (
              <>
                <LoginStatusPill status={account.login_status} withHint />
                <span className={MUTED}>手動標記</span>
              </>
            ) : (
              <>
                <CredentialStatusPill status={credentialStatus} />
                <span className={MUTED}>
                  {credentialExpiry ? `到期 ${credentialExpiry}` : '長效 token'}
                </span>
              </>
            )}
            <span className={MUTED}>{checkedAtLabel(account.last_checked_at)}</span>
            {account.notes && (
              <span className={`${MUTED} truncate`} title={account.notes}>
                · {account.notes}
              </span>
            )}
          </div>
        </div>
      </div>
      {oauthProviderForPlatform(account.platform) && onOAuth && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[11.5px] text-teal-700 hover:bg-teal-50 hover:text-teal-800"
          disabled={!canWrite}
          onClick={() => onOAuth(account)}
          title="用平台 OAuth 重新登入（token 只會加密存在後端）"
        >
          <ExternalLink size={11} />
          平台登入
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-[11.5px]"
        disabled={!canWrite}
        onClick={onEdit}
      >
        <Pencil size={11} />
        編輯
      </Button>
    </div>
  );
}

// ============================================================
// 組卡片
// ============================================================

function GroupCard({
  group,
  canWrite,
  onEditGroup,
  onRename,
  onArchive,
  onEditAccount,
  onOAuth,
}: {
  group: SocialGroupWithAccounts;
  canWrite: boolean;
  onEditGroup: () => void;
  onRename: () => void;
  onArchive: () => void;
  onEditAccount: (account: SocialAccountWithGroups) => void;
  onOAuth: (account: SocialAccountWithGroups) => void;
}) {
  const health = summarizeGroupHealth(group.accounts);
  const description = (group.description || '').trim();

  return (
    <AccountsCard>
      <AccountsCardHeader
        title={group.name}
        badge={
          <>
            {health.needsAttention > 0 ? (
              <CountPill tone="amber">
                <AlertTriangle size={11} />
                {health.needsAttention} 個需處理
              </CountPill>
            ) : health.total > 0 ? (
              <CountPill tone="emerald">登入正常</CountPill>
            ) : (
              <CountPill tone="slate">尚無帳號</CountPill>
            )}
            {health.total > 0 && <CountPill tone="slate">{health.total} 個帳號</CountPill>}
          </>
        }
        subtitle={
          <>
            {health.connected} 個可交付
            {description ? ` · ${description}` : ' · 尚未填寫說明'}
          </>
        }
        actions={
          <>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={!canWrite}
              onClick={onEditGroup}
              title="改名、加入現有帳號或批量新增帳號"
            >
              <Users size={13} />
              編輯組
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={!canWrite}
              onClick={onRename}
            >
              <Pencil size={12} />
              改名
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              disabled={!canWrite}
              onClick={onArchive}
            >
              <Archive size={12} />
              歸檔
            </Button>
          </>
        }
      />

      <div className="divide-y divide-slate-100">
        {group.accounts.map((account) => (
          <AccountLine
            key={account.id}
            account={account}
            canWrite={canWrite}
            onEdit={() => onEditAccount(account)}
            onOAuth={onOAuth}
          />
        ))}
        {group.accounts.length === 0 && (
          <p className="px-4 py-4 text-[12px] leading-relaxed text-muted-foreground">
            這個組還沒有帳號。按右上角「編輯組」，勾選其他組的帳號或按平台批量新增；新帳號會先標記「未設定」，
            之後到「編輯帳號」確認登入狀態。
          </p>
        )}
      </div>
    </AccountsCard>
  );
}

// ============================================================
// 帳號表格（「編輯帳號」分頁）
// ============================================================

function AccountsTable({
  accounts,
  canWrite,
  onEdit,
  onOAuth,
}: {
  accounts: readonly SocialAccountWithGroups[];
  canWrite: boolean;
  onEdit: (account: SocialAccountWithGroups) => void;
  onOAuth: (account: SocialAccountWithGroups) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[150px]">平台</TableHead>
            <TableHead className="min-w-[180px]">帳號</TableHead>
            <TableHead className="min-w-[140px]">顯示名稱</TableHead>
            <TableHead className="w-[170px]">憑證／登入</TableHead>
            <TableHead className="min-w-[160px]">所屬組</TableHead>
            <TableHead className="w-[150px]">最近檢查</TableHead>
            <TableHead className="w-[80px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id} className="cursor-default">
              <TableCell>
                <PlatformLabel platform={account.platform} />
              </TableCell>
              <TableCell>
                <span className="font-mono text-[12.5px] text-slate-600">@{account.handle}</span>
                {account.archived && <CountPill tone="slate">已歸檔</CountPill>}
              </TableCell>
              <TableCell className="text-[12.5px] text-slate-600">
                {account.display_name || <span className="text-slate-400">—</span>}
              </TableCell>
              <TableCell>
                {(() => {
                  const status = deriveCredentialStatus(account);
                  if (status === 'none') {
                    return (
                      <div className="flex flex-col gap-0.5">
                        <LoginStatusPill status={account.login_status} withHint />
                        <span className="text-[11px] text-muted-foreground">手動標記</span>
                      </div>
                    );
                  }
                  const expiry = credentialExpiryLabel(account.credential_expires_at);
                  return (
                    <div className="flex flex-col gap-0.5">
                      <CredentialStatusPill status={status} />
                      <span className="text-[11px] text-muted-foreground">
                        {expiry ? `到期 ${expiry}` : '長效 token'}
                      </span>
                    </div>
                  );
                })()}
              </TableCell>
              <TableCell>
                <span className="text-[12px] text-muted-foreground">
                  {account.groups.length === 0
                    ? '未分組'
                    : account.groups
                        .map((group) => `${group.name}${group.archived ? '（已歸檔）' : ''}`)
                        .join('、')}
                </span>
              </TableCell>
              <TableCell className="text-[12px] text-muted-foreground">
                {checkedAtLabel(account.last_checked_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {oauthProviderForPlatform(account.platform) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-[11.5px] text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                      disabled={!canWrite}
                      onClick={() => onOAuth(account)}
                      title="用平台 OAuth 重新登入"
                    >
                      <ExternalLink size={11} />
                      登入
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-[11.5px]"
                    disabled={!canWrite}
                    onClick={() => onEdit(account)}
                  >
                    <Pencil size={11} />
                    編輯
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================
// 主頁
// ============================================================

export function SocialAccountsView({ route, navigate }: ContentViewProps) {
  const { systemUser } = useAuth();
  const canWrite = can({ role: systemUser?.role ?? null }, 'write');
  const tab: AccountsTab = route.id === 'accounts' ? 'accounts' : 'groups';
  const setTab = (next: AccountsTab) => {
    navigate('social', 'accounts', next === 'accounts' ? 'accounts' : null);
  };

  const {
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
    createAccounts,
    updateAccount,
    syncAccountGroups,
    setAccountArchived,
    saveCredential,
    clearCredential,
    diagnoseCredentials,
    oauthProviders,
    startOAuth,
  } = useSocialDirectory();

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [renameGroup, setRenameGroup] = useState<SocialGroupWithAccounts | null>(null);
  const [archiveGroup, setArchiveGroup] = useState<SocialGroupWithAccounts | null>(null);
  const [editorGroupId, setEditorGroupId] = useState<string | null>(null);
  const [createAccountsOpen, setCreateAccountsOpen] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);

  const groups = directory?.groups ?? [];
  const archivedGroups = directory?.archivedGroups ?? [];
  const allGroups = useMemo(() => [...groups, ...archivedGroups], [groups, archivedGroups]);
  const accounts = directory?.accounts ?? [];
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts]);
  const archivedAccounts = useMemo(() => accounts.filter((account) => account.archived), [accounts]);

  const editorGroup = useMemo(
    () => (editorGroupId ? allGroups.find((group) => group.id === editorGroupId) ?? null : null),
    [editorGroupId, allGroups],
  );
  const currentEditAccount = useMemo(
    () => (editAccountId ? accounts.find((account) => account.id === editAccountId) ?? null : null),
    [editAccountId, accounts],
  );

  const credentialSummary = useMemo(() => summarizeCredentials(activeAccounts), [activeAccounts]);

  const metricItems = useMemo<ContentMetricItem[]>(
    () => [
      { label: '品牌組', value: groups.length, hint: '未歸檔的組數', onClick: () => setTab('groups') },
      {
        label: '帳號',
        value: activeAccounts.length,
        hint: '未歸檔的社群帳號',
        onClick: () => setTab('accounts'),
      },
      {
        label: '憑證有效',
        value: credentialSummary.active,
        tone: credentialSummary.active > 0 ? 'ok' : 'default',
        hint: '憑證已加密儲存且未到期',
        onClick: () => setTab('accounts'),
      },
      {
        label: '憑證待處理',
        value: credentialSummary.needsAttention,
        tone: credentialSummary.needsAttention > 0 ? 'warn' : 'default',
        hint: '即將到期／已過期／已失效，需要重新登入',
        onClick: () => setTab('accounts'),
      },
      {
        label: '未設定憑證',
        value: credentialSummary.none,
        hint: '尚未記錄登入憑證（純手動交付可略）',
        onClick: () => setTab('accounts'),
      },
    ],
    [
      activeAccounts.length,
      credentialSummary.active,
      credentialSummary.needsAttention,
      credentialSummary.none,
      groups.length,
    ],
  );

  const notifyError = (thrown: unknown, fallback = '操作失敗') => {
    toast.error(thrown instanceof Error ? thrown.message : contentErrorMessage(thrown) || fallback);
  };

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success('已重新整理');
    } catch (thrown) {
      notifyError(thrown, '重新整理失敗');
    }
  };

  // ---- 組 ----------------------------------------------------

  const handleCreateGroup = async ({ name, description }: { name: string; description: string }) => {
    await createGroup({ name, description });
    toast.success(`已建立組「${name.trim()}」`, {
      description: '按「編輯組」把帳號加進來，生成內容時就會包含它。',
    });
  };

  const handleRenameGroup = async (name: string) => {
    if (!renameGroup) return;
    await updateGroup(renameGroup.id, { name });
    toast.success(`已改名為「${name.trim()}」`);
  };

  const handleArchiveGroup = async () => {
    if (!archiveGroup) return;
    await setGroupArchived(archiveGroup.id, true);
    toast.success(`已歸檔「${archiveGroup.name}」`, { description: '可在頁面底部「已歸檔」還原。' });
  };

  const handleRestoreGroup = async (group: SocialGroupWithAccounts) => {
    try {
      await setGroupArchived(group.id, false);
      toast.success(`已還原「${group.name}」`);
    } catch (thrown) {
      notifyError(thrown, '還原失敗');
    }
  };

  const handleGroupEditorSubmit = async (payload: GroupEditorSubmitPayload) => {
    if (!editorGroup) return { added: 0, created: 0, errors: [] };
    const groupId = editorGroup.id;
    let added = 0;
    let created = 0;
    let errors: { handle: string; message: string }[] = [];

    if (payload.renameTo !== undefined || payload.description !== undefined) {
      await updateGroup(groupId, {
        ...(payload.renameTo !== undefined ? { name: payload.renameTo } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
      });
    }
    if (payload.addAccountIds.length > 0) {
      await addMembers(groupId, payload.addAccountIds);
      added = payload.addAccountIds.length;
    }
    if (payload.createRows.length > 0) {
      const result = await createAccounts(payload.createRows, { groupId });
      created = result.created.length;
      errors = result.errors;
    }

    if (added > 0 || created > 0) {
      const parts: string[] = [];
      if (payload.renameTo !== undefined) parts.push('組名已更新');
      if (added > 0) parts.push(`加入 ${added} 個帳號`);
      if (created > 0) parts.push(`新增 ${created} 個帳號`);
      toast.success(`「${payload.renameTo || editorGroup.name}」已更新`, { description: parts.join('、') });
    }
    return { added, created, errors };
  };

  // ---- 帳號 --------------------------------------------------

  const handleCreateAccounts = async (rows: CreateSocialAccountInput[]) => {
    const result = await createAccounts(rows);
    if (result.created.length > 0) {
      toast.success(`已新增 ${result.created.length} 個帳號`, {
        description: result.errors.length > 0 ? `另有 ${result.errors.length} 個未能新增` : '記得確認登入狀態。',
      });
    }
    return { created: result.created.length, errors: result.errors };
  };

  const handleAccountSubmit = async (payload: AccountEditorPayload) => {
    if (!currentEditAccount) return;
    await updateAccount(currentEditAccount.id, {
      platform: payload.platform,
      handle: payload.handle,
      display_name: payload.display_name,
      login_status: payload.login_status,
      notes: payload.notes,
    });
    await syncAccountGroups(currentEditAccount.id, payload.groupIds);
    toast.success(`已更新 @${payload.handle}`);
  };

  const handleAccountArchive = async (archived: boolean) => {
    if (!currentEditAccount) return;
    await setAccountArchived(currentEditAccount.id, archived);
    toast.success(archived ? '帳號已歸檔' : '帳號已還原');
  };

  // ---- 登入憑證（半自動） ------------------------------------

  const handleSaveCredential = async (input: {
    secret: string;
    expiresAt: string | null;
    kind: 'oauth_token' | 'app_password' | 'manual_note';
  }) => {
    if (!currentEditAccount) return;
    const meta = await saveCredential({
      accountId: currentEditAccount.id,
      secret: input.secret,
      expiresAt: input.expiresAt,
      kind: input.kind,
    });
    const expiry = credentialExpiryLabel(meta.credential_expires_at);
    toast.success('憑證已加密儲存', {
      description: expiry
        ? `到期日 ${expiry}${meta.days_left != null ? `（剩 ${meta.days_left} 天）` : ''}`
        : '長效 token（無到期日）',
    });
  };

  const handleClearCredential = async () => {
    if (!currentEditAccount) return;
    await clearCredential(currentEditAccount.id);
    toast.success('已清除憑證', { description: '帳號回到「未設定憑證」，不會再被到期檢測。' });
  };

  const handleDiagnoseAll = async () => {
    if (!canWrite) {
      toast.error('沒有檢測憑證的權限（需要生成／編輯權限）');
      return;
    }
    try {
      const result = await diagnoseCredentials();
      const summary = result.summary;
      toast.success('憑證檢測完成', {
        description: `有效 ${summary.active} · 即將到期 ${summary.expiring} · 已過期 ${summary.expired} · 失效 ${summary.invalid} · 未設定 ${summary.missing}`,
      });
    } catch (thrown) {
      notifyError(thrown, '憑證檢測失敗');
    }
  };

  // ---- 平台 OAuth 登入 ---------------------------------------

  const handleStartOAuth = async (accountId: string) => {
    if (!canWrite) {
      toast.error('沒有平台登入的權限（需要生成／編輯權限）');
      return;
    }
    const account = accounts.find((item) => item.id === accountId);
    const provider = account ? oauthProviderForPlatform(account.platform) : null;
    if (!provider) {
      toast.error('此平台沒有公開 OAuth，請手動貼上憑證');
      return;
    }
    const status = oauthProviders.find((item) => item.provider === provider);
    if (!status?.configured) {
      toast.error(`尚未設定 ${status?.label ?? provider} OAuth`, {
        description: `缺少 ${(status?.missing_env ?? []).join('／') || '相關 secrets'}；請管理層補 secrets 與平台 redirect URI。`,
      });
      return;
    }
    try {
      const result = await startOAuth(accountId);
      const popup = window.open(
        result.authorization_url,
        'mps-social-oauth',
        'width=620,height=760,menubar=no,toolbar=no,status=no',
      );
      if (!popup) {
        toast.error('瀏覽器封鎖了授權視窗', { description: '請允許彈出視窗後再按一次「平台登入」。' });
      }
    } catch (thrown) {
      notifyError(thrown, '無法開始平台登入');
    }
  };

  // OAuth callback 頁完成後會 postMessage 回主視窗
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; ok?: boolean; message?: string } | null;
      if (!data || data.type !== SOCIAL_OAUTH_MESSAGE) return;
      if (data.ok) {
        toast.success('平台登入完成', { description: data.message });
        void refresh();
      } else {
        toast.error('平台登入未完成', { description: data.message });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  // ---- 畫面 --------------------------------------------------

  const header = (
    <ContentPageHeader
      eyebrow={<span className="text-teal-700">社媒營運 · 設定</span>}
      title="品牌與帳號"
      subtitle="組＝一組跨平台帳號；組管理決定誰會收到內容，同一個帳號可以同時屬於多個組。"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('social', 'overview')}>
            <Users size={13} />
            今日工作
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={acting !== null} onClick={() => void handleRefresh()}>
            <RefreshCw size={13} className={acting !== null ? 'animate-spin' : undefined} />
            重新整理
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!canWrite || acting !== null}
            onClick={() => void handleDiagnoseAll()}
            title="解密自檢＋到期日檢查（不呼叫平台 API）"
          >
            {acting === 'diagnose_credentials' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ShieldCheck size={13} />
            )}
            檢測全部
          </Button>
          <Button
            size="sm"
            className="gap-1"
            disabled={!canWrite}
            onClick={() => setNewGroupOpen(true)}
            title={canWrite ? '建立新的品牌組' : '需要生成／編輯權限'}
          >
            <Plus size={13} />
            新建組
          </Button>
        </>
      }
    />
  );

  const renderGroups = () => {
    if (groups.length === 0) {
      return (
        <ContentEmptyState
          icon={Users}
          title="還沒有品牌組"
          description="先建立一個組（例如「Beauty100 美妝組」），再把帳號加進來；之後生成內容就能整組交付。"
          action={
            <Button size="sm" className="gap-1" disabled={!canWrite} onClick={() => setNewGroupOpen(true)}>
              <Plus size={13} />
              新建組
            </Button>
          }
        />
      );
    }

    return (
      <div className="space-y-3">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            canWrite={canWrite}
            onEditGroup={() => setEditorGroupId(group.id)}
            onRename={() => setRenameGroup(group)}
            onArchive={() => setArchiveGroup(group)}
            onEditAccount={(account) => setEditAccountId(account.id)}
            onOAuth={(account) => void handleStartOAuth(account.id)}
          />
        ))}

        {archivedGroups.length > 0 && (
          <AccountsCard>
            <AccountsCardHeader
              title={<span className="text-slate-500">已歸檔</span>}
              subtitle={`${archivedGroups.length} 個組 · 可還原`}
            />
            <div className="divide-y divide-slate-100">
              {archivedGroups.map((group) => (
                <div key={group.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-600">{group.name}</p>
                    <p className={`${MUTED} mt-0.5`}>
                      {group.accounts.length} 個帳號{group.description ? ` · ${group.description}` : ''}
                    </p>
                  </div>
                  <RestoreGroupButton
                    busy={acting === `archive_group:${group.id}:false`}
                    onRestore={() => void handleRestoreGroup(group)}
                  />
                </div>
              ))}
            </div>
          </AccountsCard>
        )}
      </div>
    );
  };

  const renderAccounts = () => (
    <div className="space-y-3">
      <AccountsCard>
        <AccountsCardHeader
          title="全部帳號"
          subtitle={`${activeAccounts.length} 個未歸檔帳號${archivedAccounts.length > 0 ? ` · ${archivedAccounts.length} 個已歸檔` : ''}`}
          actions={
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={!canWrite}
              onClick={() => setCreateAccountsOpen(true)}
            >
              <Plus size={13} />
              新增帳號
            </Button>
          }
        />
        {activeAccounts.length === 0 ? (
          <div className="px-4">
            <ContentEmptyState
              icon={Users}
              title="還沒有帳號"
              description="按「新增帳號」批量貼上平台帳號；建立後再到各組把它們加進來。"
              action={
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={!canWrite}
                  onClick={() => setCreateAccountsOpen(true)}
                >
                  <Plus size={13} />
                  新增帳號
                </Button>
              }
              className="border-0 shadow-none"
            />
          </div>
        ) : (
          <AccountsTable
            accounts={activeAccounts}
            canWrite={canWrite}
            onEdit={(account) => setEditAccountId(account.id)}
            onOAuth={(account) => void handleStartOAuth(account.id)}
          />
        )}
      </AccountsCard>

      {archivedAccounts.length > 0 && (
        <AccountsCard>
          <AccountsCardHeader
            title={<span className="text-slate-500">已歸檔帳號</span>}
            subtitle={`${archivedAccounts.length} 個帳號 · 可還原`}
          />
          <AccountsTable
            accounts={archivedAccounts}
            canWrite={canWrite}
            onEdit={(account) => setEditAccountId(account.id)}
            onOAuth={(account) => void handleStartOAuth(account.id)}
          />
        </AccountsCard>
      )}
    </div>
  );

  const renderBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="品牌與帳號需要 content_social_* 資料表。請先執行 migration，再重新載入。"
          action={
            <Button size="sm" variant="outline" onClick={() => void handleRefresh()}>
              <RefreshCw size={13} />
              重新檢查
            </Button>
          }
        />
      );
    }

    if (error && !directory) {
      return (
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="讀取品牌與帳號失敗"
          description={error}
          action={
            <Button size="sm" onClick={() => void handleRefresh()}>
              <RefreshCw size={13} />
              重試
            </Button>
          }
        />
      );
    }

    if (loading && !directory) {
      return (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="h-[132px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card"
            />
          ))}
        </div>
      );
    }

    return (
      <Tabs value={tab} onValueChange={(value) => setTab(value as AccountsTab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="groups">組管理（{groups.length}）</TabsTrigger>
            <TabsTrigger value="accounts">編輯帳號（{activeAccounts.length}）</TabsTrigger>
          </TabsList>
          <span className="text-[12px] text-muted-foreground">
            {tab === 'groups'
              ? '每個組決定帳號集合；同一個帳號可以同時屬於多個組（用「編輯組」多選）。'
              : '全量帳號的登入狀態、所屬組與歸檔；v1 手動交付，不會呼叫平台 API。'}
          </span>
        </div>

        {!canWrite && (
          <div className="mt-3">
            <InlineAlert tone="warn">
              你的角色可以查看品牌與帳號，但不能編輯（需要生成／編輯權限）。
            </InlineAlert>
          </div>
        )}

        <TabsContent value="groups" className="mt-3 space-y-3">
          {renderGroups()}
        </TabsContent>
        <TabsContent value="accounts" className="mt-3">
          {renderAccounts()}
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="space-y-5">
      {header}
      <ContentMetricBar
        items={metricItems}
        loading={loading || acting !== null}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground"
            onClick={() => void handleRefresh()}
            title="重新整理品牌與帳號"
          >
            <RefreshCw size={13} className={loading || acting !== null ? 'animate-spin' : undefined} />
          </Button>
        }
      />
      {renderBody()}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        資料表：content_social_groups／content_social_accounts／content_social_group_members。
        變更即時生效，「今日工作」最多 20 秒後同步。
      </p>

      {/* ---- 對話框 ---- */}
      <NewGroupDialog
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        existingNames={allGroups.map((group) => group.name)}
        onSubmit={handleCreateGroup}
      />

      {renameGroup && (
        <RenameGroupDialog
          open
          onClose={() => setRenameGroup(null)}
          currentName={renameGroup.name}
          existingNames={allGroups.map((group) => group.name)}
          onSubmit={handleRenameGroup}
        />
      )}

      {archiveGroup && (
        <ArchiveGroupDialog
          open
          onClose={() => setArchiveGroup(null)}
          groupName={archiveGroup.name}
          accountCount={archiveGroup.accounts.length}
          blockedReason={
            canArchiveSocialGroup(allGroups, archiveGroup.id)
              ? null
              : '至少保留一個未歸檔的組；請先建立或還原另一個組。'
          }
          onSubmit={handleArchiveGroup}
        />
      )}

      {editorGroup && (
        <GroupEditorDialog
          open
          onClose={() => setEditorGroupId(null)}
          group={editorGroup}
          accounts={accounts}
          groups={groups}
          onSubmit={handleGroupEditorSubmit}
        />
      )}

      <CreateAccountsDialog
        open={createAccountsOpen}
        onClose={() => setCreateAccountsOpen(false)}
        onSubmit={handleCreateAccounts}
      />

      {currentEditAccount && (
        <AccountEditorDialog
          open
          onClose={() => setEditAccountId(null)}
          account={currentEditAccount}
          groups={groups}
          onSubmit={handleAccountSubmit}
          onArchive={canWrite ? handleAccountArchive : undefined}
          onSaveCredential={canWrite ? handleSaveCredential : undefined}
          onClearCredential={canWrite ? handleClearCredential : undefined}
          oauthProviders={oauthProviders}
          onStartOAuth={canWrite ? handleStartOAuth : undefined}
        />
      )}
    </div>
  );
}
