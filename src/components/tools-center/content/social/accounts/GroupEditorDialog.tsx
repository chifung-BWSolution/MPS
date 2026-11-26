/**
 * 「編輯組」對話框（MPS 設計語言）。
 *
 * 功能（PRD §10、M4-02）：
 *   1. 改名＋說明
 *   2. 加入現有帳號：搜尋、按平台分組的勾選清單、全選／清除、顯示原有歸屬
 *   3. 按平台批量新增帳號：每行一個 handle（可「顯示名稱 | handle」），逐行問題回報
 *   4. 部分成功：成功的行移出輸入框，失敗的行留原處讓使用者修正
 *
 * v1 為手動交付（PRD D7），因此不提供發布模式切換；登入狀態在「編輯帳號」處理。
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SOCIAL_DESCRIPTION_MAX,
  SOCIAL_GROUP_NAME_MAX,
  deriveCredentialStatus,
  groupAccountsByPlatform,
  normalizeSocialGroupName,
  normalizeSocialHandle,
  parseBulkAccountLines,
  validateSocialGroupName,
  type BulkAccountRow,
  type SocialAccountWithGroups,
  type SocialGroupWithAccounts,
} from '@/lib/contentSocialGroups.ts';
import {
  SOCIAL_PLATFORM_LABEL,
  SOCIAL_PLATFORM_ORDER,
  socialPlatformLabel,
  type SocialPlatformKey,
} from '@/lib/contentSocialGenerate.ts';
import {
  CredentialStatusPill,
  FormDialog,
  FormField,
  InlineAlert,
  LoginStatusPill,
  MUTED,
  SECTION,
} from './socialAccountsUi';

const CREATE_PLATFORMS: SocialPlatformKey[] = SOCIAL_PLATFORM_ORDER;

export interface GroupEditorSubmitPayload {
  /** 非空 = 改名；呼叫端只需在有變更時傳 */
  renameTo?: string;
  /** 說明（有變更才傳） */
  description?: string;
  addAccountIds: string[];
  createRows: BulkAccountRow[];
}

export interface GroupEditorSubmitResult {
  added: number;
  created: number;
  errors: { handle: string; message: string }[];
}

export function GroupEditorDialog({
  open,
  onClose,
  group,
  accounts,
  groups,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  group: SocialGroupWithAccounts;
  /** 全部帳號（含其他組；已歸檔帳號不會出現在可加入清單） */
  accounts: readonly SocialAccountWithGroups[];
  /** 未歸檔的組（組名重複檢查用） */
  groups: readonly SocialGroupWithAccounts[];
  onSubmit: (payload: GroupEditorSubmitPayload) => Promise<GroupEditorSubmitResult>;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<SocialPlatformKey>('instagram');
  const [lines, setLines] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setDescription(group.description ?? '');
    setSearch('');
    setSelected(new Set());
    setPlatform('instagram');
    setLines('');
    setBusy(false);
    setError('');
    setIssues([]);
  }, [open, group.id, group.name, group.description]);

  const nameProblem = useMemo(
    () =>
      validateSocialGroupName(name, {
        existing: groups.map((item) => item.name),
        selfName: group.name,
      }),
    [name, groups, group.name],
  );

  const inGroup = useMemo(() => new Set(group.accounts.map((account) => account.id)), [group.accounts]);

  const available = useMemo(
    () => accounts.filter((account) => !account.archived && !inGroup.has(account.id)),
    [accounts, inGroup],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return available;
    return available.filter((account) => {
      const haystack = [
        account.handle,
        account.display_name ?? '',
        account.groups.map((entry) => entry.name).join(' '),
        socialPlatformLabel(account.platform),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return haystack.includes(needle);
    });
  }, [available, search]);

  const visibleByPlatform = useMemo(() => groupAccountsByPlatform(visible), [visible]);
  const parsed = useMemo(() => parseBulkAccountLines(lines, platform), [lines, platform]);

  const toggle = (accountId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const clearCreatedLines = (serverErrors: { handle: string }[]) => {
    const failed = new Set(
      serverErrors.map((entry) => normalizeSocialHandle(entry.handle).toLocaleLowerCase()),
    );
    const createdHandles = new Set(
      parsed.rows
        .map((row) => normalizeSocialHandle(row.handle).toLocaleLowerCase())
        .filter((handle) => !failed.has(handle)),
    );
    setLines(
      lines
        .split(/\r?\n/)
        .filter((line) => {
          const text = line.trim();
          if (!text) return false;
          const parts = text.split(/[|｜]/);
          const handle = normalizeSocialHandle(parts.length > 1 ? parts[parts.length - 1] : text).toLocaleLowerCase();
          return !createdHandles.has(handle);
        })
        .join('\n'),
    );
  };

  const submit = async () => {
    setError('');
    setIssues([]);

    if (nameProblem) {
      setError(nameProblem);
      return;
    }

    const trimmedDescription = description.trim();
    const baselineDescription = group.description ?? '';
    const renameTo = normalizeSocialGroupName(name) !== group.name ? normalizeSocialGroupName(name) : undefined;
    const descriptionChanged = trimmedDescription !== baselineDescription;
    const addAccountIds = [...selected];
    const createRows = parsed.rows;

    if (!renameTo && !descriptionChanged && addAccountIds.length === 0 && createRows.length === 0) {
      if (parsed.problems.length > 0) {
        setIssues(parsed.problems);
        setError('新增帳號的內容有問題，請看下方說明。');
      } else {
        setError('沒有變更。請改名、勾選現有帳號，或新增帳號。');
      }
      return;
    }

    setBusy(true);
    try {
      const result = await onSubmit({
        renameTo,
        description: descriptionChanged ? trimmedDescription : undefined,
        addAccountIds,
        createRows,
      });

      const serverIssues = result.errors.map((entry) => `@${entry.handle}：${entry.message}`);
      const nextIssues = [...parsed.problems, ...serverIssues];
      setIssues(nextIssues);
      if (result.created > 0) clearCreatedLines(result.errors);
      if (result.added > 0) setSelected(new Set());

      if (nextIssues.length === 0) onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy && !next) onClose();
      }}
      icon={<UserRoundCog size={16} className="text-teal-600" />}
      title={`編輯組：${group.name}`}
      description="組決定「誰會收到內容」。這裡可以改名、把其他組的帳號加進來，或按平台一次過新增帳號。"
      footer={
        <>
          <span className={MUTED}>
            {selected.size > 0 ? `已選 ${selected.size} 個現有帳號` : '未選現有帳號'} · 儲存後即時生效
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}
              儲存
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <InlineAlert>{error}</InlineAlert>}

        <div className="grid gap-2 sm:grid-cols-2">
          <FormField label="組名" hint={`最多 ${SOCIAL_GROUP_NAME_MAX} 字`}>
            <Input
              autoFocus
              value={name}
              maxLength={SOCIAL_GROUP_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              className="h-9 bg-white text-[13px]"
              aria-label="組名"
            />
            {nameProblem ? (
              <span className="text-[11px] font-semibold text-rose-600">{nameProblem}</span>
            ) : (
              <span className={MUTED}>改名後已生成的稿件不受影響。</span>
            )}
          </FormField>
          <FormField label="說明" hint={`選填，最多 ${SOCIAL_DESCRIPTION_MAX} 字`}>
            <Input
              value={description}
              maxLength={SOCIAL_DESCRIPTION_MAX}
              placeholder="這組負責的內容方向"
              onChange={(event) => setDescription(event.target.value)}
              className="h-9 bg-white text-[13px]"
              aria-label="組說明"
            />
          </FormField>
        </div>

        {/* ---- 加入現有帳號 ---- */}
        <section className={SECTION}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-bold text-[#0d1a2d]">加入現有帳號</h3>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                勾選其他組的帳號，儲存後會加入本組；同一個帳號同時在多組時，同一則熱點只會收到一份文案。
              </p>
            </div>
            <span className={MUTED}>{available.length} 個可加入</span>
          </div>

          <div className="mt-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋 @handle、顯示名或所屬組"
              className="h-9 bg-white text-[13px]"
              aria-label="搜尋可加入的帳號"
            />
          </div>

          <div className={MUTED + ' mt-1.5 flex items-center justify-between'}>
            <span>已選 {selected.size} 個</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11.5px]"
                disabled={visible.length === 0}
                onClick={() => setSelected(new Set([...selected, ...visible.map((account) => account.id)]))}
              >
                全選
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11.5px]"
                disabled={selected.size === 0}
                onClick={() => setSelected(new Set())}
              >
                清除
              </Button>
            </div>
          </div>

          <div className="mt-1.5 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
            {visibleByPlatform.map((bucket) => (
              <div key={bucket.platform}>
                <p className="sticky top-0 border-b border-slate-200 bg-slate-100/90 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  {socialPlatformLabel(bucket.platform)} · {bucket.accounts.length}
                </p>
                {bucket.accounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex cursor-pointer items-start gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-b-0 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selected.has(account.id)}
                      onCheckedChange={() => toggle(account.id)}
                      className="mt-0.5"
                      aria-label={`加入 @${account.handle}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="truncate font-mono text-[12.5px] font-semibold text-[#0d1a2d]">
                          @{account.handle}
                        </span>
                        {account.display_name && (
                          <span className="truncate text-[12px] text-slate-500">{account.display_name}</span>
                        )}
                        {deriveCredentialStatus(account) === 'none' ? (
                          <LoginStatusPill status={account.login_status} />
                        ) : (
                          <CredentialStatusPill status={deriveCredentialStatus(account)} />
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                        所屬組：
                        {account.groups.length === 0
                          ? '未分組'
                          : account.groups
                              .map((entry) => `${entry.name}${entry.archived ? '（已歸檔）' : ''}`)
                              .join('、')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
            {visible.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                {available.length === 0 ? '所有帳號都已在本組。' : '沒有符合搜尋的帳號。'}
              </p>
            )}
          </div>
        </section>

        {/* ---- 批量新增帳號 ---- */}
        <section className={SECTION}>
          <h3 className="text-[13px] font-bold text-[#0d1a2d]">新增帳號（可批量）</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            每行一個平台帳號；也可以寫「顯示名稱 | 平台帳號」。新帳號會標記「未設定」，之後在「編輯帳號」設定登入狀態。
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <FormField label="平台">
              <Select value={platform} onValueChange={(value) => setPlatform(value as SocialPlatformKey)}>
                <SelectTrigger className="h-9 bg-white text-[13px]" aria-label="新帳號平台">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_PLATFORMS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {SOCIAL_PLATFORM_LABEL[key] ?? key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="flex items-end">
              <p className="text-[11px] leading-4 text-muted-foreground">
                v1 一律手動交付：不設平台 API，登入狀態只用來提醒負責人。
              </p>
            </div>
          </div>

          <Textarea
            className="mt-2 min-h-[88px] bg-white font-mono text-[12.5px]"
            value={lines}
            onChange={(event) => setLines(event.target.value)}
            placeholder={'beauty100.hk\nBeauty100 編輯室 | beauty100.editor'}
            aria-label="每行一個平台帳號"
          />
          {parsed.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] leading-5 text-amber-700">
              {parsed.problems.slice(0, 6).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            平台帳號全站唯一（同平台不可重複）；已存在的帳號會被跳過並逐行顯示原因。
          </p>
        </section>

        {issues.length > 0 && (
          <InlineAlert tone="warn" title="以下項目未能加入">
            <ul className="mt-1 list-disc pl-4">
              {issues.slice(0, 8).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </InlineAlert>
        )}
      </div>
    </FormDialog>
  );
}
