import { useState } from 'react';
import { X } from 'lucide-react';
import { useBrands } from '@/hooks/useBrands';
import type { Vchannel, VchannelImportance, VchannelStatus } from '@/types/vchannel';

export type ProjectVchannelForm = {
  channelCode: string;
  internalName: string;
  publicName: string;
  importance: VchannelImportance;
  brandListId: string;
  status: VchannelStatus;
  notes: string;
};

export const emptyVchannelForm = (): ProjectVchannelForm => ({
  channelCode: '',
  internalName: '',
  publicName: '',
  importance: 'A3',
  brandListId: '',
  status: 'active',
  notes: '',
});

export function vchannelFormFromChannel(channel: Vchannel): ProjectVchannelForm {
  return {
    channelCode: channel.channelCode,
    internalName: channel.internalName,
    publicName: channel.publicName,
    importance: channel.importance,
    brandListId: channel.brandListId || '',
    status: channel.status,
    notes: channel.notes || '',
  };
}

export function ProjectVchannelFormModal({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  initial?: ProjectVchannelForm;
  onClose: () => void;
  onSave: (form: ProjectVchannelForm) => void | Promise<void>;
}) {
  const [form, setForm] = useState<ProjectVchannelForm>(initial ?? emptyVchannelForm());
  const [saving, setSaving] = useState(false);
  const { brands } = useBrands();
  const canSave = !!form.channelCode.trim() && !!form.internalName.trim() && !!form.publicName.trim() && !!form.brandListId;

  const handleChange = <K extends keyof ProjectVchannelForm>(field: K, value: ProjectVchannelForm[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">{mode === 'add' ? '新增影片頻道' : '編輯影片頻道'}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道編號 *</label>
              <input
                value={form.channelCode}
                onChange={e => handleChange('channelCode', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="V01"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬品牌 *</label>
              <select
                value={form.brandListId}
                onChange={e => handleChange('brandListId', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇品牌</option>
                {brands.filter(b => b.isActive).map(b => (
                  <option key={b.id} value={b.id}>{b.brandCode} — {b.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">內部名稱 *</label>
            <input
              value={form.internalName}
              onChange={e => handleChange('internalName', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder="內部使用名稱"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">公開頻道名稱 *</label>
            <input
              value={form.publicName}
              onChange={e => handleChange('publicName', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder="對外顯示名稱"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">重要性</label>
              <select
                value={form.importance}
                onChange={e => handleChange('importance', e.target.value as VchannelImportance)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="A1">A1 最高重要</option>
                <option value="A2">A2 高重要</option>
                <option value="A3">A3 中等</option>
                <option value="A4">A4 低重要</option>
                <option value="A5">A5 最低</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <select
                value={form.status}
                onChange={e => handleChange('status', e.target.value as VchannelStatus)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="active">進行中</option>
                <option value="paused">暫停</option>
                <option value="archived">已封存</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
            <textarea
              value={form.notes}
              onChange={e => handleChange('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600 bg-white resize-none"
              placeholder="（選填）"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80">
            取消
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(form);
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {mode === 'add' ? '新增' : '儲存變更'}
          </button>
        </div>
      </div>
    </div>
  );
}
