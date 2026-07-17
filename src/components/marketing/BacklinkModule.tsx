import { useMemo, useState } from 'react';
import { Plus, Search, ArrowLeft, Eye, Edit, Trash2 } from 'lucide-react';
import { useDataStore, BacklinkPurchase } from '@/context/DataStore';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PurchaseForm = {
  webSupplierId: string;
  cost: number;
  currency: 'USD' | 'HKD';
  purchaseDate: string;
  quantity: number;
  notes: string;
};

const emptyForm: PurchaseForm = {
  webSupplierId: '',
  cost: 0,
  currency: 'USD',
  purchaseDate: '',
  quantity: 1,
  notes: '',
};

function BacklinkDetail({
  record,
  supplierName,
  supplierUrl,
  onBack,
}: {
  record: BacklinkPurchase;
  supplierName: string;
  supplierUrl: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200"
      >
        <ArrowLeft size={14} /> 返回反向連結列表
      </button>

      <div className="bg-slate-50 rounded-md border border-slate-200 p-3 flex items-center gap-4 text-[12px] text-muted-foreground flex-wrap">
        <span><span className="font-medium text-foreground">供應商:</span> {supplierName}</span>
        <span className="mx-1">•</span>
        <span><span className="font-medium text-foreground">網站:</span> {supplierUrl}</span>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h3 className="text-[16px] font-bold mb-4">購買詳情</h3>
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <div><span className="text-muted-foreground">費用:</span> <span className="font-medium">{record.currency} ${record.cost.toLocaleString()}</span></div>
          <div><span className="text-muted-foreground">購買日期:</span> <span className="font-medium">{record.purchaseDate}</span></div>
          <div><span className="text-muted-foreground">反向連結數量:</span> <span className="font-medium">{record.quantity}</span></div>
          <div><span className="text-muted-foreground">備註:</span> <span className="font-medium">{record.notes || '—'}</span></div>
        </div>
      </div>
    </div>
  );
}

export function BacklinkModule() {
  const {
    webPageSuppliers,
    backlinkPurchases,
    addBacklinkPurchase,
    updateBacklinkPurchase,
    deleteBacklinkPurchase,
    getWebPageSupplierById,
  } = useDataStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'HKD'>('all');
  const [selectedRecord, setSelectedRecord] = useState<BacklinkPurchase | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<PurchaseForm>(emptyForm);
  const [editing, setEditing] = useState<(BacklinkPurchase & { notes?: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BacklinkPurchase | null>(null);

  const supplierMap = useMemo(() => {
    const map = new Map(webPageSuppliers.map((s) => [s.id, s]));
    return map;
  }, [webPageSuppliers]);

  const enriched = useMemo(() => {
    return backlinkPurchases.map((p) => {
      const supplier = supplierMap.get(p.webSupplierId) || getWebPageSupplierById(p.webSupplierId);
      return {
        ...p,
        supplierName: supplier?.name || '—',
        supplierUrl: supplier?.url || '—',
        platform: supplier?.platform || '—',
      };
    });
  }, [backlinkPurchases, supplierMap, getWebPageSupplierById]);

  const filtered = enriched.filter((r) => {
    if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.supplierName.toLowerCase().includes(q) ||
        r.supplierUrl.toLowerCase().includes(q) ||
        r.platform.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const stats = useMemo(() => {
    const totalQty = backlinkPurchases.reduce((s, p) => s + p.quantity, 0);
    const usd = backlinkPurchases.filter((p) => p.currency === 'USD').reduce((s, p) => s + p.cost, 0);
    const hkd = backlinkPurchases.filter((p) => p.currency === 'HKD').reduce((s, p) => s + p.cost, 0);
    return { count: backlinkPurchases.length, totalQty, usd, hkd };
  }, [backlinkPurchases]);

  const selectedSupplier = form.webSupplierId
    ? supplierMap.get(form.webSupplierId)
    : undefined;

  const handleAdd = () => {
    if (!form.webSupplierId || !form.purchaseDate || form.quantity < 1) return;
    addBacklinkPurchase({
      webSupplierId: form.webSupplierId,
      cost: form.cost,
      currency: form.currency,
      purchaseDate: form.purchaseDate,
      quantity: form.quantity,
      notes: form.notes || undefined,
    });
    setForm(emptyForm);
    setShowAddModal(false);
  };

  const handleEdit = (record: BacklinkPurchase) => {
    setEditing({ ...record });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editing || !editing.webSupplierId || !editing.purchaseDate || editing.quantity < 1) return;
    updateBacklinkPurchase(editing.id, {
      webSupplierId: editing.webSupplierId,
      cost: editing.cost,
      currency: editing.currency,
      purchaseDate: editing.purchaseDate,
      quantity: editing.quantity,
      notes: editing.notes,
    });
    setShowEditModal(false);
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteBacklinkPurchase(deleteTarget.id);
    setDeleteTarget(null);
  };

  if (selectedRecord) {
    const supplier = supplierMap.get(selectedRecord.webSupplierId);
    return (
      <BacklinkDetail
        record={selectedRecord}
        supplierName={supplier?.name || '—'}
        supplierUrl={supplier?.url || '—'}
        onBack={() => setSelectedRecord(null)}
      />
    );
  }

  const renderPurchaseFields = (
    data: PurchaseForm | BacklinkPurchase,
    onChange: (next: PurchaseForm | BacklinkPurchase) => void,
  ) => {
    const supplier = data.webSupplierId ? supplierMap.get(data.webSupplierId) : undefined;
    return (
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">網站 *</label>
          <Select
            value={data.webSupplierId}
            onValueChange={(val) => onChange({ ...data, webSupplierId: val })}
          >
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="從網頁供應商選擇" /></SelectTrigger>
            <SelectContent>
              {webPageSuppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.url}（{s.name}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {webPageSuppliers.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1">請先至「供應商 → 網頁供應商」新增名單</p>
          )}
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商</label>
          <Input
            value={supplier?.name || ''}
            readOnly
            className="h-9 text-[13px] bg-muted/40"
            placeholder="選擇網站後自動帶出"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 *</label>
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">購買日期 *</label>
            <Input
              type="date"
              value={data.purchaseDate}
              onChange={(e) => onChange({ ...data, purchaseDate: e.target.value })}
              className="h-9 text-[13px]"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">反向連結數量 *</label>
            <Input
              type="number"
              min={1}
              value={data.quantity}
              onChange={(e) => onChange({ ...data, quantity: parseInt(e.target.value, 10) || 0 })}
              className="h-9 text-[13px]"
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
          <Input
            value={data.notes || ''}
            onChange={(e) => onChange({ ...data, notes: e.target.value })}
            className="h-9 text-[13px]"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">購買筆數</span>
          <p className="text-[18px] font-bold">{stats.count}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">總連結數</span>
          <p className="text-[18px] font-bold">{stats.totalQty}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">費用合計 (USD)</span>
          <p className="text-[18px] font-bold">USD ${stats.usd.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">費用合計 (HKD)</span>
          <p className="text-[18px] font-bold">HKD ${stats.hkd.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋供應商／網址..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value as 'all' | 'USD' | 'HKD')}
          className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">全部幣別</option>
          <option value="USD">USD</option>
          <option value="HKD">HKD</option>
        </select>
        <button
          onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增購買
        </button>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">費用</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">購買日期</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">數量</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                <td className="px-4 py-3">
                  <span className="font-medium break-all">{record.supplierUrl}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{record.supplierName}</td>
                <td className="px-4 py-3">{record.currency} ${record.cost.toLocaleString()}</td>
                <td className="px-4 py-3">{record.purchaseDate}</td>
                <td className="px-4 py-3">{record.quantity}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedRecord(record)}
                      className="text-[11px] text-teal-600 hover:underline flex items-center gap-1"
                    >
                      <Eye size={10} /> 詳情
                    </button>
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
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的反向連結紀錄</div>
      )}

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增反向連結購買" size="lg">
        {renderPurchaseFields(form, (next) => setForm(next as PurchaseForm))}
        {selectedSupplier && (
          <p className="text-[11px] text-muted-foreground mt-2">
            已選：{selectedSupplier.name} · {selectedSupplier.platform || '無平台'}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd}>新增</Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯反向連結購買" size="lg">
        {editing && renderPurchaseFields(editing, (next) => setEditing(next as BacklinkPurchase))}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={
          deleteTarget
            ? `${supplierMap.get(deleteTarget.webSupplierId)?.name || '紀錄'} · ${deleteTarget.purchaseDate}`
            : ''
        }
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
