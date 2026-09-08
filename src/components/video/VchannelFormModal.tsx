import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useBrands } from '@/hooks/useBrands';
import { useVchannels } from '@/hooks/useVchannels';
import { useVchannelAccounts } from '@/hooks/useVchannelAccounts';
import type { Vchannel, VchannelImportance, VchannelStatus } from '@/types/vchannel';
import { CrudModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  accountLinkFingerprint,
  planAccountChannelLinkPatches,
  type AccountLinkPatch,
} from '@/lib/vchannelAccountLink';
import { ChannelAccountPicker } from '@/components/video/ChannelAccountPicker';
import {
  formatPlatformStatusNote,
  type PlatformStatusValue,
} from '@/lib/vchannelPlatformStatus';
import {
  VchannelAccountFormModal,
  accountToForm,
  emptyAccountForm,
  formToAccountPayload,
} from '@/components/video/VchannelAccountFormModal';

export const VCHANNEL_IMPORTANCE_CONFIG = {
  A1: { label: 'A1', color: 'text-rose-700', bg: 'bg-rose-100', description: '最高重要' },
  A2: { label: 'A2', color: 'text-amber-700', bg: 'bg-amber-100', description: '高重要' },
  A3: { label: 'A3', color: 'text-blue-700', bg: 'bg-blue-100', description: '中等' },
  A4: { label: 'A4', color: 'text-slate-700', bg: 'bg-slate-100', description: '低重要' },
  A5: { label: 'A5', color: 'text-gray-600', bg: 'bg-gray-100', description: '最低' },
};

export type VchannelFormState = {
  channelCode: string;
  internalName: string;
  publicName: string;
  importance: VchannelImportance;
  brandListId: string;
  status: VchannelStatus;
  platformStatus: Record<string, PlatformStatusValue>;
  notes: string;
};

export const emptyVchannelForm = (): VchannelFormState => ({
  channelCode: '',
  internalName: '',
  publicName: '',
  importance: 'A3',
  brandListId: '',
  status: 'active',
  platformStatus: {},
  notes: '',
});

export function vchannelFormFromChannel(channel: Vchannel): VchannelFormState {
  return {
    channelCode: channel.channelCode,
    internalName: channel.internalName,
    publicName: channel.publicName,
    importance: channel.importance,
    brandListId: channel.brandListId ?? '',
    status: channel.status,
    platformStatus: channel.platformStatus,
    notes: channel.notes ?? '',
  };
}

async function applyAccountLinkPatches(patches: AccountLinkPatch[]) {
  for (const patch of patches) {
    const { error } = await supabase
      .from('vchannel_accounts')
      .update({
        vchannel_codes: patch.vchannelCodes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patch.id);
    if (error) return error;
  }
  return null;
}

function PlatformStatusNote({ value }: { value: Record<string, PlatformStatusValue> }) {
  const text = formatPlatformStatusNote(value);
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
      <p className="text-[11px] text-muted-foreground mb-1">臨時顯示，稍後會移除</p>
      {text ? (
        <pre className="m-0 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-foreground">{text}</pre>
      ) : (
        <p className="text-[12px] text-muted-foreground">暫無平台狀態資料</p>
      )}
    </div>
  );
}

function ChannelForm({
  form,
  setForm,
  brandOptions,
  accounts,
  selectedAccountIds,
  onSelectedAccountIdsChange,
  onAddAccount,
}: {
  form: VchannelFormState;
  setForm: Dispatch<SetStateAction<VchannelFormState>>;
  brandOptions: { id: string; brandCode: string; displayName: string }[];
  accounts: ReturnType<typeof useVchannelAccounts>['accounts'];
  selectedAccountIds: string[];
  onSelectedAccountIdsChange: (ids: string[]) => void;
  onAddAccount: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道編號 *</label>
          <Input
            value={form.channelCode}
            onChange={e => setForm({ ...form, channelCode: e.target.value.toUpperCase() })}
            className="h-9 text-[13px]"
            placeholder="V01"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌分類 *</label>
          <Select
            value={form.brandListId || undefined}
            onValueChange={val => setForm({ ...form, brandListId: val })}
          >
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇品牌" /></SelectTrigger>
            <SelectContent>
              {brandOptions.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.brandCode}{b.displayName !== b.brandCode ? ` — ${b.displayName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">內部名稱 *</label>
        <Input value={form.internalName} onChange={e => setForm({ ...form, internalName: e.target.value })} className="h-9 text-[13px]" />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">公開頻道名稱 *</label>
        <Input value={form.publicName} onChange={e => setForm({ ...form, publicName: e.target.value })} className="h-9 text-[13px]" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">重要性</label>
          <Select value={form.importance} onValueChange={(val: VchannelImportance) => setForm({ ...form, importance: val })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(VCHANNEL_IMPORTANCE_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{k} - {v.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
          <Select value={form.status} onValueChange={(val: VchannelStatus) => setForm({ ...form, status: val })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">活躍</SelectItem>
              <SelectItem value="paused">暫停</SelectItem>
              <SelectItem value="archived">已歸檔</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
        <Textarea
          value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })}
          rows={4}
          className="text-[13px]"
          placeholder="頻道備註"
        />
      </div>
      <ChannelAccountPicker
        accounts={accounts}
        selectedIds={selectedAccountIds}
        onChange={onSelectedAccountIdsChange}
        onAddAccount={onAddAccount}
        disabled={!form.channelCode.trim()}
        disabledReason="請先填寫頻道編號，才能搜尋或新增關聯的平台帳戶"
      />
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-2">平台狀態矩陣</label>
        <PlatformStatusNote value={form.platformStatus} />
      </div>
    </div>
  );
}

export function VchannelFormModal({
  isOpen,
  mode,
  channel,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  mode: 'add' | 'edit';
  channel?: Vchannel | null;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const { brands } = useBrands();
  const { addChannel, updateChannel } = useVchannels();
  const { accounts, addAccount, updateAccount, fetchAccounts, accountsForChannel } = useVchannelAccounts();
  const [form, setForm] = useState<VchannelFormState>(emptyVchannelForm());
  const [saving, setSaving] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [savingAccount, setSavingAccount] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [initialLinkedAccountIds, setInitialLinkedAccountIds] = useState<string[]>([]);
  const [linkedDuringSessionIds, setLinkedDuringSessionIds] = useState<string[]>([]);
  const [initialChannelCode, setInitialChannelCode] = useState('');
  const [pendingCreatedFingerprint, setPendingCreatedFingerprint] = useState<string | null>(null);

  const brandOptions = useMemo(
    () => brands.filter(b => b.isActive).map(b => ({ id: b.id, brandCode: b.brandCode, displayName: b.displayName })),
    [brands],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && channel) {
      const linked = accountsForChannel(channel.channelCode);
      const linkedIds = linked.map(account => account.id);
      setForm(vchannelFormFromChannel(channel));
      setSelectedAccountIds(linkedIds);
      setInitialLinkedAccountIds(linkedIds);
      setInitialChannelCode(channel.channelCode);
    } else {
      setForm(emptyVchannelForm());
      setSelectedAccountIds([]);
      setInitialLinkedAccountIds([]);
      setInitialChannelCode('');
    }
    setLinkedDuringSessionIds([]);
    setPendingCreatedFingerprint(null);
    setShowAccountModal(false);
    setEditingAccountId(null);
  }, [isOpen, mode, channel?.id]);

  useEffect(() => {
    if (!pendingCreatedFingerprint) return;
    const created = accounts.find(account => (
      accountLinkFingerprint(account) === pendingCreatedFingerprint
      && !selectedAccountIds.includes(account.id)
    ));
    if (!created) return;
    setSelectedAccountIds(ids => (ids.includes(created.id) ? ids : [...ids, created.id]));
    setLinkedDuringSessionIds(ids => (ids.includes(created.id) ? ids : [...ids, created.id]));
    setPendingCreatedFingerprint(null);
  }, [accounts, pendingCreatedFingerprint, selectedAccountIds]);

  const syncSelectedAccountLinks = async (channelCode: string, previousChannelCode?: string) => {
    const patches = planAccountChannelLinkPatches({
      accounts,
      selectedIds: selectedAccountIds,
      initialLinkedIds: [...initialLinkedAccountIds, ...linkedDuringSessionIds],
      channelCode,
      previousChannelCode,
    });
    if (patches.length === 0) return null;
    const linkError = await applyAccountLinkPatches(patches);
    if (!linkError) await fetchAccounts();
    return linkError;
  };

  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!form.channelCode.trim() || !form.internalName.trim() || !form.publicName.trim() || !form.brandListId) return;
    setSaving(true);
    const payload = {
      channelCode: form.channelCode.trim(),
      internalName: form.internalName.trim(),
      publicName: form.publicName.trim(),
      importance: form.importance,
      brandListId: form.brandListId || null,
      status: form.status,
      platformStatus: form.platformStatus,
      notes: form.notes.trim() || undefined,
    };
    const err = mode === 'edit' && channel
      ? await updateChannel(channel.id, payload)
      : await addChannel(payload);
    if (err) {
      setSaving(false);
      toast.error(mode === 'edit' ? '儲存失敗' : '新增失敗', {
        description: typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err),
      });
      return;
    }
    const linkError = await syncSelectedAccountLinks(
      payload.channelCode,
      mode === 'edit' ? initialChannelCode : undefined,
    );
    setSaving(false);
    if (linkError) {
      toast.error('頻道已儲存，但平台帳戶關聯失敗', { description: linkError.message });
    } else {
      toast.success(mode === 'edit' ? '影片頻道已更新' : '影片頻道已新增');
    }
    await onSaved?.();
    onClose();
  };

  const openAddAccount = () => {
    const code = form.channelCode.trim().toUpperCase();
    if (!code) {
      toast.error('請先填寫頻道編號');
      return;
    }
    setEditingAccountId(null);
    setAccountForm({
      ...emptyAccountForm,
      vchannelCodesRaw: code,
      vchannelCodes: [code],
    });
    setShowAccountModal(true);
  };

  const saveAccount = async () => {
    const payload = formToAccountPayload(accountForm);
    if (!payload) return;
    setSavingAccount(true);
    const err = editingAccountId
      ? await updateAccount(editingAccountId, payload)
      : await addAccount(payload);
    setSavingAccount(false);
    if (err) {
      toast.error('帳戶儲存失敗', {
        description: typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err),
      });
      return;
    }
    if (!editingAccountId) {
      setPendingCreatedFingerprint(accountLinkFingerprint(payload));
    }
    setShowAccountModal(false);
  };

  return (
    <>
      <CrudModal
        isOpen={isOpen}
        onClose={handleClose}
        title={mode === 'edit' ? `編輯 ${form.channelCode || '影片頻道'}` : '新增 Vchannel'}
        size="lg"
      >
        <ChannelForm
          form={form}
          setForm={setForm}
          brandOptions={brandOptions}
          accounts={accounts}
          selectedAccountIds={selectedAccountIds}
          onSelectedAccountIdsChange={setSelectedAccountIds}
          onAddAccount={openAddAccount}
        />
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={handleClose}>取消</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => { void handleSave(); }}
            disabled={saving || savingAccount}
          >
            {saving ? '儲存中...' : mode === 'edit' ? '儲存' : '新增'}
          </Button>
        </div>
      </CrudModal>

      <VchannelAccountFormModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        editing={!!editingAccountId}
        form={accountForm}
        setForm={setAccountForm}
        saving={savingAccount}
        onSave={() => { void saveAccount(); }}
      />
    </>
  );
}
