import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PLATFORM_KEYS,
  PLATFORM_LABELS,
  normalizeAccountPlatform,
  type PlatformKey,
} from '@/lib/vchannelPlatformStatus';
import type { AccountFormState } from '@/lib/vchannelAccountForm';

export type { AccountFormState } from '@/lib/vchannelAccountForm';
export { accountToForm, emptyAccountForm, formToAccountPayload } from '@/lib/vchannelAccountForm';

export function VchannelAccountFormModal({
  isOpen,
  onClose,
  editing,
  form,
  setForm,
  saving,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: boolean;
  form: AccountFormState;
  setForm: (form: AccountFormState) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <CrudModal isOpen={isOpen} onClose={onClose} title={editing ? '編輯平台帳號' : '新增平台帳號'}>
      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">Vchannel *（可多選，如 V12/V14）</label>
          <Input value={form.vchannelCodesRaw} onChange={e => setForm({ ...form, vchannelCodesRaw: e.target.value })} className="h-9 text-[13px]" placeholder="V11 或 V12/V14" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">名稱</label>
            <Input value={form.accountLabel} onChange={e => setForm({ ...form, accountLabel: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台 *</label>
            <Select
              value={normalizeAccountPlatform(form.platform) ?? ''}
              onValueChange={(value: PlatformKey) => setForm({ ...form, platform: value })}
            >
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇平台" /></SelectTrigger>
              <SelectContent>
                {PLATFORM_KEYS.map(key => (
                  <SelectItem key={key} value={key}>{PLATFORM_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">賬號 ID</label>
          <Input value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })} className="h-9 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">登入方式</label>
          <Input value={form.loginMethod} onChange={e => setForm({ ...form, loginMethod: e.target.value })} className="h-9 text-[13px]" />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-9 text-[13px]" />
        </div>
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={form.feedhiveManaged} onChange={e => setForm({ ...form, feedhiveManaged: e.target.checked })} />
          FeedHive 統一管理
        </label>
      </div>
      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={onSave} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
      </div>
    </CrudModal>
  );
}

export function VchannelAccountDeleteModal({
  target,
  onClose,
  onConfirm,
}: {
  target: { id: string; label: string } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DeleteConfirmModal
      isOpen={!!target}
      onClose={onClose}
      onConfirm={onConfirm}
      itemName={target?.label || ''}
      canDelete={true}
      reasons={[]}
    />
  );
}
