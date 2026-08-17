import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Vchannel, VchannelAccount } from '@/types/vchannel';
import { videoLoginMethodLabel, videoTwoFaLabel, type VideoLoginMethod } from '@/types/videoLoginMethod';
import { useVideoLoginMethods } from '@/hooks/useVideoLoginMethods';
import { accountPickerLabel } from '@/lib/vchannelAccountLink';
import {
  collectRelatedLoginMethods,
  otherAccountLinksForMethod,
  planBulkLoginMethodLinks,
  planLoginMethodAccountLinkPatches,
  type LoginMethodLinkPatch,
} from '@/lib/vchannelAccountLoginMethods';
import {
  emptyLoginMethodForm,
  loginMethodFormFromItem,
  loginMethodFormToInput,
  type LoginMethodForm,
} from '@/lib/videoLoginMethodForm';
import { accountPlatformLabel } from '@/lib/vchannelPlatformStatus';
import { formatLinkedLoginMethods } from '@/types/vchannel';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { VchannelLoginMethodPicker } from './VchannelLoginMethodPicker';
import { VideoLoginMethodFormFields } from './VideoLoginMethodFormFields';

type EditorMode = 'idle' | 'create' | 'edit' | 'link';

function maskPassword(password: string) {
  return password ? '••••••••' : '—';
}

async function applyLinkPatches(
  patches: LoginMethodLinkPatch[],
  updateAccount: (id: string, updates: Partial<VchannelAccount>) => Promise<Error | null>,
) {
  for (const patch of patches) {
    const error = await updateAccount(patch.accountId, { loginMethodIds: patch.loginMethodIds });
    if (error) return error;
  }
  return null;
}

export function VchannelAccountLoginMethodsDialog({
  isOpen,
  onClose,
  channel,
  accounts,
  allAccounts,
  updateAccount,
}: {
  isOpen: boolean;
  onClose: () => void;
  channel: Vchannel | null;
  accounts: VchannelAccount[];
  allAccounts: VchannelAccount[];
  updateAccount: (id: string, updates: Partial<VchannelAccount>) => Promise<Error | null>;
}) {
  const { items, loading, error, refresh, addItem, updateItem, deleteItem } = useVideoLoginMethods();
  const [mode, setMode] = useState<EditorMode>('idle');
  const [editing, setEditing] = useState<VideoLoginMethod | null>(null);
  const [form, setForm] = useState<LoginMethodForm>(emptyLoginMethodForm());
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [linkMethodIds, setLinkMethodIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VideoLoginMethod | null>(null);

  const relatedRows = useMemo(
    () => collectRelatedLoginMethods(accounts, items),
    [accounts, items],
  );

  const accountLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) map.set(account.id, accountPickerLabel(account));
    return map;
  }, [accounts]);

  const resetEditor = () => {
    setMode('idle');
    setEditing(null);
    setForm(emptyLoginMethodForm());
    setShowPassword(false);
    setSelectedAccountIds([]);
    setLinkMethodIds([]);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyLoginMethodForm());
    setShowPassword(false);
    setSelectedAccountIds(accounts.map(account => account.id));
    setLinkMethodIds([]);
    setMode('create');
  };

  const openEdit = (item: VideoLoginMethod) => {
    const linkedIds = accounts
      .filter(account => account.loginMethodIds.includes(item.id))
      .map(account => account.id);
    setEditing(item);
    setForm(loginMethodFormFromItem(item));
    setShowPassword(false);
    setSelectedAccountIds(linkedIds);
    setLinkMethodIds([]);
    setMode('edit');
  };

  const openLinkExisting = () => {
    setEditing(null);
    setForm(emptyLoginMethodForm());
    setShowPassword(false);
    setSelectedAccountIds(accounts.map(account => account.id));
    setLinkMethodIds([]);
    setMode('link');
  };

  const toggleAccount = (accountId: string, checked: boolean) => {
    setSelectedAccountIds(ids => (
      checked
        ? (ids.includes(accountId) ? ids : [...ids, accountId])
        : ids.filter(id => id !== accountId)
    ));
  };

  const handleSaveMethod = async () => {
    const payload = loginMethodFormToInput(form);
    if (!payload) {
      toast.error(!form.loginMethod ? '請選擇登入方式' : '請輸入顯示名稱');
      return;
    }
    if (selectedAccountIds.length === 0) {
      toast.error('請至少選擇一個平台帳戶');
      return;
    }

    setSaving(true);
    let methodId = editing?.id ?? '';
    if (editing) {
      const result = await updateItem(editing.id, payload);
      if (result.ok === false) {
        setSaving(false);
        toast.error('更新登入方式失敗', { description: result.error });
        return;
      }
    } else {
      const result = await addItem(payload);
      if (result.ok === false) {
        setSaving(false);
        toast.error('新增登入方式失敗', { description: result.error });
        return;
      }
      methodId = result.item.id;
    }
    const patches = planLoginMethodAccountLinkPatches(accounts, methodId, selectedAccountIds);
    const linkError = await applyLinkPatches(patches, updateAccount);
    setSaving(false);

    if (linkError) {
      toast.error('登入方式已儲存，但帳戶關聯失敗', { description: linkError.message });
      return;
    }

    toast.success(editing ? '已更新登入方式' : '已新增登入方式');
    resetEditor();
  };

  const handleLinkExisting = async () => {
    if (linkMethodIds.length === 0) {
      toast.error('請選擇要連結的登入方式');
      return;
    }
    if (selectedAccountIds.length === 0) {
      toast.error('請至少選擇一個平台帳戶');
      return;
    }

    setSaving(true);
    const patches = planBulkLoginMethodLinks(accounts, linkMethodIds, selectedAccountIds);
    const linkError = await applyLinkPatches(patches, updateAccount);
    await refresh();
    setSaving(false);

    if (linkError) {
      toast.error('連結登入方式失敗', { description: linkError.message });
      return;
    }

    toast.success('已連結登入方式');
    resetEditor();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteItem(deleteTarget.id);
    if (!result.ok) {
      toast.error('刪除登入方式失敗', { description: result.error });
      return;
    }
    toast.success('已刪除登入方式');
    if (editing?.id === deleteTarget.id) resetEditor();
    setDeleteTarget(null);
  };

  const otherLinks = deleteTarget
    ? otherAccountLinksForMethod(allAccounts, accounts.map(account => account.id), deleteTarget.id)
    : [];

  const canMutate = accounts.length > 0;

  return (
    <>
      <CrudModal
        isOpen={isOpen}
        onClose={() => {
          if (saving) return;
          resetEditor();
          onClose();
        }}
        title="帳戶登入方式"
        size="2xl"
      >
        <div className="space-y-5">
          {channel && (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <div className="text-[13px] font-medium">
                {channel.channelCode}
                <span className="text-muted-foreground font-normal"> · {channel.internalName}</span>
              </div>
              {channel.publicName ? (
                <div className="text-[12px] text-muted-foreground mt-0.5">{channel.publicName}</div>
              ) : null}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              無法載入登入方式：{error}
            </div>
          )}

          <section className="rounded-md border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
              <h3 className="text-[13px] font-bold">平台帳戶</h3>
              <span className="text-[11px] text-muted-foreground">{accounts.length} 個</span>
            </div>
            {accounts.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-muted-foreground">
                此頻道尚未關聯平台帳戶。請先在頻道編輯中關聯帳戶，才能管理登入方式。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-t border-border/50 text-muted-foreground">
                      <th className="text-left px-3 py-1.5 font-medium">平台</th>
                      <th className="text-left px-3 py-1.5 font-medium">名稱</th>
                      <th className="text-left px-3 py-1.5 font-medium">賬號 ID</th>
                      <th className="text-left px-3 py-1.5 font-medium">登入方式</th>
                      <th className="text-left px-3 py-1.5 font-medium">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map(account => (
                      <tr key={account.id} className={cn('border-t border-border/50', !account.isActive && 'opacity-60')}>
                        <td className="px-3 py-2 whitespace-nowrap">{accountPlatformLabel(account.platform)}</td>
                        <td className="px-3 py-2">{account.accountLabel || '—'}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{account.accountId || '—'}</td>
                        <td className="px-3 py-2">
                          {account.linkedLoginMethods.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {account.linkedLoginMethods.map(method => (
                                <span
                                  key={method.id}
                                  className={cn(
                                    'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]',
                                    method.isActive
                                      ? 'border-teal-200 bg-teal-50 text-teal-800'
                                      : 'border-slate-200 bg-slate-50 text-slate-600',
                                  )}
                                >
                                  {method.displayName}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{formatLinkedLoginMethods(account) || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={account.isActive ? 'text-teal-700' : 'text-amber-700'}>
                            {account.isActive ? '啟用' : '停用'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-md border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-[13px] font-bold">登入方式</h3>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 text-[12px]"
                  disabled={!canMutate || saving}
                  onClick={openLinkExisting}
                >
                  連結現有
                </Button>
                <Button
                  type="button"
                  className="h-7 text-[12px] bg-teal-600 hover:bg-teal-700 text-white"
                  disabled={!canMutate || saving}
                  onClick={openCreate}
                >
                  <Plus size={12} className="mr-1" />
                  新增
                </Button>
              </div>
            </div>

            {mode !== 'idle' && (
              <div className="border-t border-border px-3 py-3 space-y-4 bg-slate-50/60">
                <div className="text-[12px] font-medium text-teal-800">
                  {mode === 'create' ? '新增登入方式' : mode === 'edit' ? '編輯登入方式' : '連結現有登入方式'}
                </div>

                {mode === 'link' ? (
                  <div>
                    <label className="text-[12px] font-medium text-muted-foreground block mb-1">登入方式</label>
                    <VchannelLoginMethodPicker
                      value={linkMethodIds}
                      onChange={setLinkMethodIds}
                      items={items}
                      addItem={addItem}
                    />
                  </div>
                ) : (
                  <VideoLoginMethodFormFields
                    form={form}
                    setForm={setForm}
                    showPassword={showPassword}
                    onTogglePassword={() => setShowPassword(prev => !prev)}
                  />
                )}

                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-2">
                    關聯平台帳戶 *
                  </label>
                  <div className="space-y-1.5">
                    {accounts.map(account => {
                      const checked = selectedAccountIds.includes(account.id);
                      return (
                        <label
                          key={account.id}
                          className={cn(
                            'flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] cursor-pointer bg-white',
                            checked ? 'border-teal-200 bg-teal-50/50' : 'border-border hover:bg-muted/30',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={value => toggleAccount(account.id, value === true)}
                          />
                          <span className="min-w-0">
                            <span className="font-medium">{accountPickerLabel(account)}</span>
                            {account.accountId ? (
                              <span className="text-[11px] text-muted-foreground ml-1.5 font-mono">{account.accountId}</span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" disabled={saving} onClick={resetEditor}>
                    取消
                  </Button>
                  <Button
                    type="button"
                    className="bg-teal-600 hover:bg-teal-700 text-white"
                    disabled={saving}
                    onClick={() => void (mode === 'link' ? handleLinkExisting() : handleSaveMethod())}
                  >
                    {saving ? '儲存中…' : mode === 'link' ? '連結' : '儲存'}
                  </Button>
                </div>
              </div>
            )}

            {loading && relatedRows.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-muted-foreground">載入登入方式…</p>
            ) : relatedRows.length === 0 && mode === 'idle' ? (
              <p className="px-3 py-4 text-[12px] text-muted-foreground">
                {canMutate ? '尚未關聯登入方式。可新增或連結現有登入方式。' : '沒有可關聯的平台帳戶。'}
              </p>
            ) : relatedRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-t border-border/50 text-muted-foreground">
                      <th className="text-left px-3 py-1.5 font-medium">顯示名稱</th>
                      <th className="text-left px-3 py-1.5 font-medium">方式</th>
                      <th className="text-left px-3 py-1.5 font-medium">帳號 / 電郵</th>
                      <th className="text-left px-3 py-1.5 font-medium">密碼</th>
                      <th className="text-left px-3 py-1.5 font-medium">關聯帳戶</th>
                      <th className="text-left px-3 py-1.5 font-medium">狀態</th>
                      <th className="text-right px-3 py-1.5 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedRows.map(({ method, accountIds }) => (
                      <tr
                        key={method.id}
                        className={cn('border-t border-border/50', !method.isActive && 'opacity-60')}
                      >
                        <td className="px-3 py-2 font-medium">{method.displayName}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-700">
                            {videoLoginMethodLabel(method.loginMethod)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {method.email || method.accountName || method.phoneNumber || '—'}
                          {method.twoFaMethods.length > 0 ? (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              2FA：{method.twoFaMethods.map(videoTwoFaLabel).join('、')}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{maskPassword(method.password)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {accountIds.map(accountId => (
                              <span
                                key={accountId}
                                className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700"
                              >
                                {accountLabelById.get(accountId) ?? '帳戶'}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={method.isActive ? 'text-teal-700' : 'text-amber-700'}>
                            {method.isActive ? '啟用' : '停用'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(method)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-teal-50 hover:text-teal-700"
                              title="編輯"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(method)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                              title="刪除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        itemName={deleteTarget?.displayName || ''}
        canDelete
        description={
          otherLinks.length > 0
            ? `此登入方式亦關聯其他頻道的 ${otherLinks.length} 個帳戶，刪除後會一併移除。`
            : undefined
        }
      />
    </>
  );
}
