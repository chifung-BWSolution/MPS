import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSupplierTypes } from '@/hooks/useSupplierTypes';
import { SUPPLIER_TYPE_CATEGORIES, type SupplierType, type SupplierTypeCategory } from '@/types/marketingOps';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { cn } from '@/lib/utils';

type TypeForm = {
  categories: SupplierTypeCategory;
  displayName: string;
  isActive: boolean;
};

const emptyForm = (): TypeForm => ({
  categories: '網站',
  displayName: '',
  isActive: true,
});

export function SupplierTypesSettings() {
  const { types, loading, error, addType, updateType, deleteType, countUsage } = useSupplierTypes();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierType | null>(null);
  const [form, setForm] = useState<TypeForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupplierType | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; reasons: string[] }>({
    canDelete: true,
    reasons: [],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return types.filter((type) =>
      !q
      || type.displayName.toLowerCase().includes(q)
      || type.categories.toLowerCase().includes(q),
    );
  }, [types, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (type: SupplierType) => {
    setEditing(type);
    setForm({
      categories: type.categories,
      displayName: type.displayName,
      isActive: type.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const displayName = form.displayName.trim();
    if (!displayName) {
      toast.error('請輸入顯示名稱');
      return;
    }
    setSaving(true);
    const result = editing
      ? await updateType(editing.id, {
          categories: form.categories,
          displayName,
          isActive: form.isActive,
        })
      : await addType({
          categories: form.categories,
          displayName,
          isActive: form.isActive,
        });
    setSaving(false);
    if (!result.ok) {
      toast.error(editing ? '更新類型失敗' : '新增類型失敗', { description: result.error });
      return;
    }
    toast.success(editing ? '已更新供應商類型' : '已新增供應商類型');
    setModalOpen(false);
    setEditing(null);
  };

  const handleToggleActive = async (type: SupplierType) => {
    const result = await updateType(type.id, { isActive: !type.isActive });
    if (!result.ok) {
      toast.error('更新狀態失敗', { description: result.error });
      return;
    }
    toast.success(type.isActive ? '已停用類型' : '已啟用類型');
  };

  const handleDeleteClick = async (type: SupplierType) => {
    const usage = await countUsage(type.id);
    if (usage.error) {
      toast.error('無法檢查使用狀況', { description: usage.error });
      return;
    }
    const reasons: string[] = [];
    if (usage.supplierCount > 0) {
      reasons.push(`仍有 ${usage.supplierCount} 個供應商使用此類型，無法刪除`);
    }
    if (usage.expenseCount > 0) {
      reasons.push(`仍有 ${usage.expenseCount} 筆支出使用此類型，無法刪除`);
    }
    setDeleteCheck({ canDelete: reasons.length === 0, reasons });
    setDeleteTarget(type);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !deleteCheck.canDelete) return;
    const result = await deleteType(deleteTarget.id);
    if (!result.ok) {
      toast.error('刪除類型失敗', { description: result.error });
      return;
    }
    toast.success('已刪除供應商類型');
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋分類、顯示名稱…"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <Button size="sm" className="ml-auto bg-teal-600 hover:bg-teal-700 text-white" onClick={openCreate}>
          <Plus size={14} className="mr-1.5" />
          新增類型
        </Button>
      </div>
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">分類</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">顯示名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  載入中…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {search.trim() ? '沒有符合的供應商類型' : '尚未建立供應商類型。請按「新增類型」。'}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((type) => (
                <tr key={type.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3 text-muted-foreground">{type.categories}</td>
                  <td className="px-4 py-3 font-medium">{type.displayName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={type.isActive}
                        onCheckedChange={() => void handleToggleActive(type)}
                      />
                      <span className={cn('text-[12px]', type.isActive ? 'text-teal-700' : 'text-amber-700')}>
                        {type.isActive ? '啟用' : '停用'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(type)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title="編輯"
                      >
                        <Pencil size={12} className="text-teal-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteClick(type)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title="刪除"
                      >
                        <Trash2 size={12} className="text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <CrudModal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? '編輯供應商類型' : '新增供應商類型'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">分類 *</label>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_TYPE_CATEGORIES.map((category) => {
                const selected = form.categories === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, categories: category }))}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-[13px] border transition-colors',
                      selected
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-foreground border-border hover:border-teal-600 hover:text-teal-700',
                    )}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">顯示名稱 *</label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="例如 網站插件"
              className="h-9 text-[13px]"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <div className="text-[13px] font-medium">狀態</div>
              <div className="text-[11px] text-muted-foreground">
                {form.isActive ? '啟用中，可在各模組選用' : '已停用，不會出現在新的選單'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('text-[12px] font-medium', form.isActive ? 'text-teal-700' : 'text-amber-700')}>
                {form.isActive ? '啟用' : '停用'}
              </span>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saving || !form.displayName.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        itemName={deleteTarget?.displayName || ''}
        canDelete={deleteCheck.canDelete}
        reasons={deleteCheck.reasons}
      />
    </div>
  );
}
