import { useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useDataStore } from '@/context/DataStore';
import { useGoogleBusinessRegistrations } from '@/hooks/useGoogleBusinessRegistrations';
import type { GoogleBusinessRegistration } from '@/types/marketingOps';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FormState = {
  websiteProfileId: string;
  url: string;
  registeredAt: string;
  content: string;
};

const emptyForm: FormState = {
  websiteProfileId: '',
  url: '',
  registeredAt: '',
  content: '',
};

function truncate(text: string, max = 80) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function GoogleBusinessModule() {
  const { websites } = useDataStore();
  const {
    registrations: googleBusinessRegistrations,
    addRegistration,
    updateRegistration,
    deleteRegistration,
  } = useGoogleBusinessRegistrations();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<GoogleBusinessRegistration | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoogleBusinessRegistration | null>(null);
  const [saving, setSaving] = useState(false);

  const siteMap = useMemo(() => new Map(websites.map((w) => [w.id, w])), [websites]);

  const enriched = useMemo(
    () =>
      googleBusinessRegistrations.map((r) => ({
        ...r,
        siteName: r.websiteProfileId
          ? siteMap.get(r.websiteProfileId)?.websiteName || '—'
          : '—',
      })),
    [googleBusinessRegistrations, siteMap],
  );

  const filtered = enriched.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.url.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q) ||
      r.registeredAt.includes(q) ||
      r.siteName.toLowerCase().includes(q)
    );
  });

  const handleAdd = async () => {
    if (!form.websiteProfileId || !form.url.trim() || !form.registeredAt || !form.content.trim() || saving) return;
    setSaving(true);
    const { error } = await addRegistration({
      websiteProfileId: form.websiteProfileId,
      url: form.url.trim(),
      registeredAt: form.registeredAt,
      content: form.content.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(`新增失敗：${error.message}`);
      return;
    }
    setForm(emptyForm);
    setShowAddModal(false);
  };

  const handleEdit = (record: GoogleBusinessRegistration) => {
    setEditing({ ...record });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.websiteProfileId || !editing.url.trim() || !editing.registeredAt || !editing.content.trim() || saving) return;
    setSaving(true);
    const error = await updateRegistration(editing.id, {
      websiteProfileId: editing.websiteProfileId,
      url: editing.url.trim(),
      registeredAt: editing.registeredAt,
      content: editing.content.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(`更新失敗：${error.message}`);
      return;
    }
    setShowEditModal(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || saving) return;
    setSaving(true);
    const error = await deleteRegistration(deleteTarget.id);
    setSaving(false);
    if (error) {
      toast.error(`刪除失敗：${error.message}`);
      return;
    }
    setDeleteTarget(null);
  };

  const renderFields = (
    data: FormState | GoogleBusinessRegistration,
    onChange: (next: FormState | GoogleBusinessRegistration) => void,
  ) => (
    <div className="space-y-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬網站 *</label>
        <Select
          value={data.websiteProfileId || ''}
          onValueChange={(val) => onChange({ ...data, websiteProfileId: val })}
        >
          <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
          <SelectContent>
            {websites.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.websiteName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">Google Business 網址 *</label>
        <Input
          value={data.url}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          className="h-9 text-[13px]"
          placeholder="https://g.page/... 或 maps 連結"
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">登記日期 *</label>
        <Input
          type="date"
          value={data.registeredAt}
          onChange={(e) => onChange({ ...data, registeredAt: e.target.value })}
          className="h-9 text-[13px]"
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">登記內容 *</label>
        <textarea
          value={data.content}
          onChange={(e) => onChange({ ...data, content: e.target.value })}
          className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none"
          rows={4}
          placeholder="登記的業務資訊、地址、營業時間、服務說明等"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">登記筆數</span>
          <p className="text-[18px] font-bold">{googleBusinessRegistrations.length}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋網站、網址、內容、日期..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <button
          onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增登記
        </button>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">所屬網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Google Business 網址</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">登記日期</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">登記內容</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                <td className="px-4 py-3 font-medium whitespace-nowrap">{record.siteName}</td>
                <td className="px-4 py-3">
                  <a
                    href={record.url.startsWith('http') ? record.url : `https://${record.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-600 hover:underline inline-flex items-center gap-1 break-all"
                  >
                    {record.url}
                    <ExternalLink size={11} className="shrink-0" />
                  </a>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{record.registeredAt}</td>
                <td className="px-4 py-3 text-muted-foreground max-w-[360px]">{truncate(record.content)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(record)} className="p-1 hover:bg-muted rounded" title="編輯">
                      <Edit size={12} className="text-teal-600" />
                    </button>
                    <button onClick={() => setDeleteTarget(record)} className="p-1 hover:bg-muted rounded" title="刪除">
                      <Trash2 size={12} className="text-rose-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的 Google Business 登記</div>
        )}
      </div>

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 Google Business 登記" size="lg">
        {renderFields(form, (next) =>
          setForm({
            websiteProfileId: next.websiteProfileId || '',
            url: next.url,
            registeredAt: next.registeredAt,
            content: next.content,
          }),
        )}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => void handleAdd()}>新增</Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯 Google Business 登記" size="lg">
        {editing && renderFields(editing, (next) => setEditing(next as GoogleBusinessRegistration))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => void handleSaveEdit()}>儲存</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.url || ''}
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
