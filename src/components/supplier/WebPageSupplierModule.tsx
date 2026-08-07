import { useState } from 'react';
import { Search, Star, Plus, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { useBacklinkPurchases } from '@/hooks/useBacklinkPurchases';
import type { WebPageSupplier } from '@/types/marketingOps';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function RatingStars({ rating, interactive, onChange }: {
  rating: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const display = interactive && hover > 0 ? hover : rating;

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onChange?.(star)}
          className={cn(!interactive && 'cursor-default')}
        >
          <Star
            size={interactive ? 18 : 11}
            className={cn(
              star <= display ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
              interactive && 'hover:scale-110 transition-transform',
            )}
          />
        </button>
      ))}
      {!interactive && (
        <span className="ml-1 text-[12px] text-muted-foreground">{rating.toFixed(0)}</span>
      )}
    </div>
  );
}

const emptyForm: Omit<WebPageSupplier, 'id'> = {
  name: '',
  platform: '',
  url: '',
  cost: 0,
  currency: 'USD',
  rating: 3,
};

export function WebPageSupplierModule() {
  const {
    suppliers: webPageSuppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
  } = useWebPageSuppliers();
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

  const filtered = webPageSuppliers.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.platform.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q)
    );
  });

  const handleAdd = async () => {
    if (!form.name.trim() || !form.url.trim() || saving) return;
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
    if (!editing || !editing.name.trim() || !editing.url.trim() || saving) return;
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
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商名稱 *</label>
        <Input
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          className="h-9 text-[13px]"
          placeholder="例如 LinkBuilder HK"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">購買平台</label>
          <Input
            value={data.platform}
            onChange={(e) => onChange({ ...data, platform: e.target.value })}
            className="h-9 text-[13px]"
            placeholder="例如 GuestPost.io"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">網址 *</label>
          <Input
            value={data.url}
            onChange={(e) => onChange({ ...data, url: e.target.value })}
            className="h-9 text-[13px]"
            placeholder="https://..."
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">購買費用</label>
          <Input
            type="number"
            value={data.cost}
            onChange={(e) => onChange({ ...data, cost: parseFloat(e.target.value) || 0 })}
            className="h-9 text-[13px]"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">幣別</label>
          <Select
            value={data.currency}
            onValueChange={(val) => onChange({ ...data, currency: val as 'USD' | 'HKD' })}
          >
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="HKD">HKD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">評分 (1–5)</label>
        <RatingStars
          rating={data.rating}
          interactive
          onChange={(value) => onChange({ ...data, rating: value })}
        />
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
            placeholder="搜尋名稱、平台、網址..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <button
          onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增網頁供應商
        </button>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">購買平台</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網址</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">購買費用</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">評分</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((supplier) => (
              <tr key={supplier.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                <td className="px-4 py-3 font-medium">{supplier.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{supplier.platform || '—'}</td>
                <td className="px-4 py-3">
                  <a
                    href={supplier.url.startsWith('http') ? supplier.url : `https://${supplier.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-600 hover:underline break-all"
                  >
                    {supplier.url}
                  </a>
                </td>
                <td className="px-4 py-3">{supplier.currency} ${supplier.cost.toLocaleString()}</td>
                <td className="px-4 py-3"><RatingStars rating={supplier.rating} /></td>
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
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的網頁供應商</div>
        )}
      </div>

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增網頁供應商" size="lg">
        {renderFormFields(form, setForm)}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd}>新增</Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯網頁供應商" size="lg">
        {editing && renderFormFields(editing, (next) => setEditing(next as WebPageSupplier))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.name || ''}
        canDelete={deleteCheck.canDelete}
        reasons={deleteCheck.reasons}
      />
    </div>
  );
}
