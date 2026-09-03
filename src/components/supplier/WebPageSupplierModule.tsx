import { useMemo, useState } from 'react';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { useSupplierTypes } from '@/hooks/useSupplierTypes';
import { useBacklinkPurchases } from '@/hooks/useBacklinkPurchases';
import type { WebPageSupplier } from '@/types/marketingOps';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const emptyForm: Omit<WebPageSupplier, 'id'> = {
  supplierTypesId: null,
  displayName: '',
  description: '',
  companyName: '',
  contactPerson: '',
  phone: '',
  email: '',
  remarks: '',
  url: '',
  isActive: true,
};

export function WebPageSupplierModule() {
  const {
    suppliers: webPageSuppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
  } = useWebPageSuppliers();
  const { types: supplierTypes } = useSupplierTypes();
  const { purchases: backlinkPurchases } = useBacklinkPurchases();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState<WebPageSupplier | null>(null);
  const [form, setForm] = useState<Omit<WebPageSupplier, 'id'>>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<WebPageSupplier | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; reasons: string[] }>({
    canDelete: true,
    reasons: [],
  });
  const [saving, setSaving] = useState(false);

  const typeMap = useMemo(
    () => new Map(supplierTypes.map((t) => [t.id, t])),
    [supplierTypes],
  );

  const typeOptions = useMemo(
    () => supplierTypes.filter((t) => t.isActive || t.id === form.supplierTypesId || t.id === editing?.supplierTypesId),
    [supplierTypes, form.supplierTypesId, editing?.supplierTypesId],
  );

  const filtered = webPageSuppliers.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const type = s.supplierTypesId ? typeMap.get(s.supplierTypesId) : undefined;
    return (
      s.displayName.toLowerCase().includes(q) ||
      s.companyName.toLowerCase().includes(q) ||
      s.contactPerson.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      (type?.displayName || '').toLowerCase().includes(q)
    );
  });

  const handleAdd = async () => {
    if (!form.displayName.trim() || !form.supplierTypesId || saving) return;
    setSaving(true);
    const { error } = await addSupplier(form);
    setSaving(false);
    if (error) {
      toast.error(`新增失敗：${error.message}`);
      return;
    }
    setForm(emptyForm);
    setShowAddModal(false);
  };

  const handleEdit = (supplier: WebPageSupplier) => {
    setEditing({ ...supplier });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.displayName.trim() || !editing.supplierTypesId || saving) return;
    setSaving(true);
    const error = await updateSupplier(editing.id, editing);
    setSaving(false);
    if (error) {
      toast.error(`更新失敗：${error.message}`);
      return;
    }
    setShowEditModal(false);
    setEditing(null);
  };

  const handleDeleteClick = (supplier: WebPageSupplier) => {
    const refCount = backlinkPurchases.filter((p) => p.webSupplierId === supplier.id).length;
    if (refCount > 0) {
      setDeleteCheck({
        canDelete: false,
        reasons: [`此網頁供應商仍有 ${refCount} 筆反向連結購買紀錄，無法刪除`],
      });
    } else {
      setDeleteCheck({ canDelete: true, reasons: [] });
    }
    setDeleteTarget(supplier);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteCheck.canDelete || saving) return;
    setSaving(true);
    const error = await deleteSupplier(deleteTarget.id);
    setSaving(false);
    if (error) {
      toast.error(`刪除失敗：${error.message}`);
      return;
    }
    setDeleteTarget(null);
  };

  const renderFormFields = (
    data: Omit<WebPageSupplier, 'id'> | WebPageSupplier,
    onChange: (next: Omit<WebPageSupplier, 'id'> | WebPageSupplier) => void,
  ) => (
    <div className="space-y-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商類型 *</label>
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((t) => {
            const selected = data.supplierTypesId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ ...data, supplierTypesId: t.id })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[13px] border transition-colors',
                  selected
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-foreground border-border hover:border-teal-600 hover:text-teal-700',
                )}
              >
                {t.displayName}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">顯示名稱 *</label>
        <Input
          value={data.displayName}
          onChange={(e) => onChange({ ...data, displayName: e.target.value })}
          className="h-9 text-[13px]"
          placeholder="例如 Yoast SEO"
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">說明</label>
        <Textarea
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className="min-h-[80px] text-[13px]"
          placeholder="供應商說明"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司名稱</label>
          <Input
            value={data.companyName}
            onChange={(e) => onChange({ ...data, companyName: e.target.value })}
            className="h-9 text-[13px]"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">聯絡人</label>
          <Input
            value={data.contactPerson}
            onChange={(e) => onChange({ ...data, contactPerson: e.target.value })}
            className="h-9 text-[13px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">電話</label>
          <Input
            value={data.phone}
            onChange={(e) => onChange({ ...data, phone: e.target.value })}
            className="h-9 text-[13px]"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">電郵</label>
          <Input
            type="email"
            value={data.email}
            onChange={(e) => onChange({ ...data, email: e.target.value })}
            className="h-9 text-[13px]"
          />
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">網址</label>
        <Input
          value={data.url}
          onChange={(e) => onChange({ ...data, url: e.target.value })}
          className="h-9 text-[13px]"
          placeholder="https://..."
        />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
        <Textarea
          value={data.remarks}
          onChange={(e) => onChange({ ...data, remarks: e.target.value })}
          className="min-h-[80px] text-[13px]"
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div>
          <div className="text-[13px] font-medium">狀態</div>
          <div className="text-[11px] text-muted-foreground">
            {data.isActive ? '啟用中，可在各模組選用' : '已停用'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-[12px] font-medium', data.isActive ? 'text-teal-700' : 'text-amber-700')}>
            {data.isActive ? '啟用' : '停用'}
          </span>
          <Switch
            checked={data.isActive}
            onCheckedChange={(checked) => onChange({ ...data, isActive: checked })}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋名稱、公司、聯絡人、網址..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <button
          onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增供應商
        </button>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">類型</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">顯示名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">公司</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">聯絡人</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電話</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電郵</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((supplier) => {
              const type = supplier.supplierTypesId ? typeMap.get(supplier.supplierTypesId) : undefined;
              return (
                <tr key={supplier.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">{type?.displayName || '—'}</td>
                  <td className="px-4 py-3 font-medium">{supplier.displayName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{supplier.companyName || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{supplier.contactPerson || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{supplier.phone || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{supplier.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[12px]', supplier.isActive ? 'text-teal-700' : 'text-amber-700')}>
                      {supplier.isActive ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(supplier)} className="p-1 hover:bg-muted rounded transition-colors" title="編輯">
                        <Edit size={12} className="text-teal-600" />
                      </button>
                      <button onClick={() => handleDeleteClick(supplier)} className="p-1 hover:bg-muted rounded transition-colors" title="刪除">
                        <Trash2 size={12} className="text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的供應商</div>
        )}
      </div>

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增供應商" size="lg">
        {renderFormFields(form, setForm)}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleAdd}
            disabled={!form.displayName.trim() || !form.supplierTypesId || saving}
          >
            新增
          </Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯供應商" size="lg">
        {editing && renderFormFields(editing, (next) => setEditing(next as WebPageSupplier))}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSaveEdit}
            disabled={!editing?.displayName.trim() || !editing?.supplierTypesId || saving}
          >
            儲存
          </Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.displayName || ''}
        canDelete={deleteCheck.canDelete}
        reasons={deleteCheck.reasons}
      />
    </div>
  );
}
