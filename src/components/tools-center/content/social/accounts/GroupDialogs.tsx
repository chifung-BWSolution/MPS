/**
 * 品牌與帳號 · 組的建立／改名／歸檔對話框，以及「純新增帳號」對話框。
 *
 * 設計語言：MPS（白卡、teal 主色、6px 圓角、shadcn 元件）。
 * 行為沿用 PRD §10 與 M4-02：組名唯一、批量新增逐行回報、成功才關閉。
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Loader2, Pencil, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  loginStatusMeta,
  normalizeSocialHandle,
  parseBulkAccountLines,
  validateSocialGroupName,
  type SocialLoginStatus,
} from '@/lib/contentSocialGroups.ts';
import {
  SOCIAL_PLATFORM_LABEL,
  SOCIAL_PLATFORM_ORDER,
  type SocialPlatformKey,
} from '@/lib/contentSocialGenerate.ts';
import type { CreateSocialAccountInput } from '@/lib/contentSocialApi.ts';
import { FormDialog, FormField, InlineAlert, MUTED } from './socialAccountsUi';

const CREATE_PLATFORMS: SocialPlatformKey[] = SOCIAL_PLATFORM_ORDER;
const LOGIN_STATUS_OPTIONS: SocialLoginStatus[] = ['unknown', 'active', 'expired'];

// ============================================================
// 新建組
// ============================================================

export function NewGroupDialog({
  open,
  onClose,
  existingNames,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  existingNames: readonly string[];
  onSubmit: (input: { name: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const nameProblem = useMemo(
    () => validateSocialGroupName(name, { existing: existingNames }),
    [name, existingNames],
  );

  const submit = async () => {
    if (nameProblem) {
      setError(nameProblem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name, description });
      onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '建立失敗');
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
      size="md"
      icon={<Plus size={16} className="text-teal-600" />}
      title="新建組"
      description="一個組＝一組跨平台帳號。建立後把帳號加進來，生成內容時整組交付。"
      footer={
        <>
          <span className={MUTED}>同一個帳號可以同時屬於多個組</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy || Boolean(nameProblem)}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              建立
            </Button>
          </div>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label="組名" hint={`最多 ${SOCIAL_GROUP_NAME_MAX} 字`}>
          <Input
            autoFocus
            value={name}
            maxLength={SOCIAL_GROUP_NAME_MAX}
            placeholder="例如：Beauty100 美妝組"
            onChange={(event) => setName(event.target.value)}
            className="h-9 bg-white text-[13px]"
            aria-label="組名"
          />
        </FormField>
        <FormField label="說明" hint="選填">
          <Input
            value={description}
            maxLength={SOCIAL_DESCRIPTION_MAX}
            placeholder="這組負責的內容方向（例：美妝、護膚、成分與保養話題）"
            onChange={(event) => setDescription(event.target.value)}
            className="h-9 bg-white text-[13px]"
            aria-label="組說明"
          />
        </FormField>
        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </FormDialog>
  );
}

// ============================================================
// 改名
// ============================================================

export function RenameGroupDialog({
  open,
  onClose,
  currentName,
  existingNames,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  currentName: string;
  existingNames: readonly string[];
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError('');
      setBusy(false);
    }
  }, [open, currentName]);

  const nameProblem = useMemo(
    () => validateSocialGroupName(name, { existing: existingNames, selfName: currentName }),
    [name, existingNames, currentName],
  );

  const submit = async () => {
    if (nameProblem) {
      setError(nameProblem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(name);
      onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '改名失敗');
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
      size="md"
      icon={<Pencil size={16} className="text-teal-600" />}
      title="組改名"
      description="改名後已生成的稿件不受影響，之後的內容會帶上新組名。"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={busy || Boolean(nameProblem) || name.trim() === currentName}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
            儲存
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label="新的組名">
          <Input
            autoFocus
            value={name}
            maxLength={SOCIAL_GROUP_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            className="h-9 bg-white text-[13px]"
            aria-label="新的組名"
          />
        </FormField>
        {error && <InlineAlert>{error}</InlineAlert>}
      </form>
    </FormDialog>
  );
}

// ============================================================
// 歸檔／還原
// ============================================================

export function ArchiveGroupDialog({
  open,
  onClose,
  groupName,
  accountCount,
  blockedReason,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  groupName: string;
  accountCount: number;
  /** 非空代表不能歸檔（例如只剩這一組） */
  blockedReason?: string | null;
  onSubmit: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (blockedReason) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit();
      onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '歸檔失敗');
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
      size="md"
      icon={<Archive size={16} className="text-rose-600" />}
      title={`歸檔「${groupName}」？`}
      description="帳號與歷史紀錄都會保留，但這個組之後不會再收到新內容。"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void submit()}
            disabled={busy || Boolean(blockedReason)}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
            確認歸檔
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          這組目前有 <strong className="font-semibold text-[#0d1a2d]">{accountCount}</strong> 個帳號。
          歸檔後可在頁面底部「已歸檔」把它還原；要移除帳號請用「編輯組」。
        </p>
        {blockedReason && <InlineAlert tone="warn">{blockedReason}</InlineAlert>}
        {error && <InlineAlert>{error}</InlineAlert>}
      </div>
    </FormDialog>
  );
}

export function RestoreGroupButton({ busy, onRestore }: { busy?: boolean; onRestore: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={busy} onClick={onRestore}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
      還原
    </Button>
  );
}

// ============================================================
// 純新增帳號（「帳號」分頁用；不加入任何組）
// ============================================================

export function CreateAccountsDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** 回傳成功建立的數量與逐筆錯誤；不負責 toast */
  onSubmit: (rows: CreateSocialAccountInput[]) => Promise<{
    created: number;
    errors: { handle: string; message: string }[];
  }>;
}) {
  const [platform, setPlatform] = useState<SocialPlatformKey>('instagram');
  const [loginStatus, setLoginStatus] = useState<SocialLoginStatus>('unknown');
  const [lines, setLines] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setPlatform('instagram');
      setLoginStatus('unknown');
      setLines('');
      setError('');
      setIssues([]);
      setBusy(false);
    }
  }, [open]);

  const parsed = useMemo(() => parseBulkAccountLines(lines, platform), [lines, platform]);

  /** 只移除「已成功建立」的行；格式錯誤與伺服器回報失敗的行留在原處 */
  const removeCreatedLines = (errors: { handle: string }[]) => {
    const failed = new Set(errors.map((entry) => normalizeSocialHandle(entry.handle).toLocaleLowerCase()));
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
    if (parsed.rows.length === 0) {
      setIssues(parsed.problems);
      setError(parsed.problems.length > 0 ? '新增帳號的內容有問題，請看下方說明。' : '請至少輸入一行平台帳號。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(parsed.rows.map((row) => ({ ...row, loginStatus })));
      const serverIssues = result.errors.map((entry) => `@${entry.handle}：${entry.message}`);
      const nextIssues = [...parsed.problems, ...serverIssues];
      setIssues(nextIssues);
      if (result.created > 0) removeCreatedLines(result.errors);
      if (result.created > 0 && nextIssues.length === 0) onClose();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : '新增失敗');
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
      icon={<Plus size={16} className="text-teal-600" />}
      title="新增帳號"
      description="每行一個平台帳號；也可以寫「顯示名稱 | 平台帳號」。新帳號預設標記「未設定」，之後在帳號列表確認登入狀態。"
      footer={
        <>
          <span className={MUTED}>
            {parsed.rows.length > 0 ? `將新增 ${parsed.rows.length} 個帳號` : '尚未輸入帳號'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy || parsed.rows.length === 0}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              新增
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
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
          <FormField label="登入狀態">
            <Select value={loginStatus} onValueChange={(value) => setLoginStatus(value as SocialLoginStatus)}>
              <SelectTrigger className="h-9 bg-white text-[13px]" aria-label="新帳號登入狀態">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOGIN_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {loginStatusMeta(status).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <FormField label="帳號清單" hint="支援「顯示名稱 | @handle」">
          <Textarea
            value={lines}
            onChange={(event) => setLines(event.target.value)}
            placeholder={'beauty100.hk\nBeauty100 編輯室 | beauty100.editor'}
            className="min-h-[96px] bg-white font-mono text-[12.5px]"
            aria-label="每行一個平台帳號"
          />
        </FormField>
        {error && <InlineAlert>{error}</InlineAlert>}
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
