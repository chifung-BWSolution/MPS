import { useMemo, useRef, useState } from 'react';
import { Plus, Search, ArrowLeft, Eye, Edit, Trash2, Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useDataStore } from '@/context/DataStore';
import { useBacklinkPurchases } from '@/hooks/useBacklinkPurchases';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { useGoogleAdsAccounts } from '@/hooks/useGoogleAdsAccounts';
import { enrichBacklinkImports, parseBacklinkExcelBuffer } from '@/lib/backlinkExcelImport';
import type { BacklinkImportResult } from '@/lib/backlinkExcelImport';
import type { BacklinkPurchase } from '@/types/marketingOps';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EXCEL_IMPORT_SUPPLIER_ID = 'wps_excel_import';

type PurchaseForm = {
  websiteProfileId: string;
  webSupplierId: string;
  cost: number;
  currency: 'USD' | 'HKD';
  purchaseDate: string;
  quantity: number;
  notes: string;
};

const emptyForm: PurchaseForm = {
  websiteProfileId: '',
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
  siteLabel,
  onBack,
}: {
  record: BacklinkPurchase;
  supplierName: string;
  supplierUrl: string;
  siteLabel: string;
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
        <span><span className="font-medium text-foreground">所屬網站:</span> {siteLabel}</span>
        <span className="mx-1">•</span>
        <span><span className="font-medium text-foreground">供應商:</span> {supplierName}</span>
        <span className="mx-1">•</span>
        <span><span className="font-medium text-foreground">供應商網址:</span> {supplierUrl}</span>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h3 className="text-[16px] font-bold mb-4">購買詳情</h3>
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <div><span className="text-muted-foreground">費用:</span> <span className="font-medium">{record.currency} ${record.cost.toLocaleString()}</span></div>
          <div><span className="text-muted-foreground">購買日期:</span> <span className="font-medium">{record.purchaseDate}</span></div>
          <div><span className="text-muted-foreground">反向連結數量:</span> <span className="font-medium">{record.quantity}</span></div>
          <div><span className="text-muted-foreground">備註:</span> <span className="font-medium">{record.notes || '—'}</span></div>
          {record.sourceDomain && (
            <div><span className="text-muted-foreground">Excel Domain:</span> <span className="font-medium">{record.sourceDomain}</span></div>
          )}
          {record.excelSheet && (
            <div><span className="text-muted-foreground">工作表:</span> <span className="font-medium">{record.excelSheet}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}

function SiteCell({
  record,
  siteName,
}: {
  record: BacklinkPurchase & { siteLabel: string };
  siteName: string;
}) {
  if (record.googleAdsAccountName) {
    return (
      <div>
        <div className="font-medium">{record.googleAdsAccountName}</div>
        {record.googleAdsCustomerId && (
          <div className="text-[11px] text-muted-foreground">{record.googleAdsCustomerId}</div>
        )}
      </div>
    );
  }
  if (record.sourceDomain && !record.googleAdsCustomerId) {
    return (
      <div>
        <div className="font-medium text-amber-700">{record.sourceDomain}</div>
        <div className="text-[11px] text-amber-600">未匹配 Google Ads 帳戶</div>
      </div>
    );
  }
  return <span className="font-medium">{siteName}</span>;
}

export function BacklinkModule() {
  const { websites } = useDataStore();
  const { suppliers: webPageSuppliers } = useWebPageSuppliers();
  const { clientAccounts: googleAdsAccounts } = useGoogleAdsAccounts();
  const {
    purchases: backlinkPurchases,
    addPurchase,
    updatePurchase,
    deletePurchase,
    bulkImport,
    refresh,
  } = useBacklinkPurchases();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | 'USD' | 'HKD'>('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<BacklinkPurchase | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<BacklinkImportResult | null>(null);
  const [form, setForm] = useState<PurchaseForm>(emptyForm);
  const [editing, setEditing] = useState<(BacklinkPurchase & { notes?: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BacklinkPurchase | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const supplierMap = useMemo(() => new Map(webPageSuppliers.map((s) => [s.id, s])), [webPageSuppliers]);
  const siteMap = useMemo(() => new Map(websites.map((w) => [w.id, w])), [websites]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of backlinkPurchases) {
      const y = parseInt(p.purchaseDate.slice(0, 4), 10);
      if (Number.isFinite(y)) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [backlinkPurchases]);

  const enriched = useMemo(() => {
    return backlinkPurchases.map((p) => {
      const supplier = supplierMap.get(p.webSupplierId);
      const site = p.websiteProfileId ? siteMap.get(p.websiteProfileId) : undefined;
      const siteLabel =
        p.googleAdsAccountName ||
        site?.websiteName ||
        p.sourceDomain ||
        '—';
      return {
        ...p,
        supplierName: supplier?.name || '—',
        supplierUrl: supplier?.url || '—',
        platform: supplier?.platform || '—',
        siteName: site?.websiteName || '—',
        siteLabel,
      };
    });
  }, [backlinkPurchases, supplierMap, siteMap]);

  const filtered = useMemo(() => {
    return enriched
      .filter((r) => {
        if (currencyFilter !== 'all' && r.currency !== currencyFilter) return false;
        if (accountFilter !== 'all') {
          if (accountFilter === 'unmatched') return !r.googleAdsCustomerId && !!r.sourceDomain;
          if (r.googleAdsCustomerId !== accountFilter) return false;
        }
        if (yearFilter !== 'all') {
          if (!r.purchaseDate.startsWith(`${yearFilter}-`)) return false;
        }
        if (dateFrom && r.purchaseDate < dateFrom) return false;
        if (dateTo && r.purchaseDate > dateTo) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            r.supplierName.toLowerCase().includes(q) ||
            r.supplierUrl.toLowerCase().includes(q) ||
            r.platform.toLowerCase().includes(q) ||
            r.siteName.toLowerCase().includes(q) ||
            (r.googleAdsAccountName || '').toLowerCase().includes(q) ||
            (r.sourceDomain || '').toLowerCase().includes(q) ||
            (r.notes || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [enriched, currencyFilter, accountFilter, yearFilter, dateFrom, dateTo, searchQuery]);

  const stats = useMemo(() => {
    const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);
    const usd = filtered.filter((p) => p.currency === 'USD').reduce((s, p) => s + p.cost, 0);
    const hkd = filtered.filter((p) => p.currency === 'HKD').reduce((s, p) => s + p.cost, 0);
    return { count: filtered.length, totalQty, usd, hkd };
  }, [filtered]);

  const unmatchedDomains = useMemo(() => {
    const map = new Map<string, { domain: string; sheetName?: string; count: number }>();
    for (const p of backlinkPurchases) {
      if (p.googleAdsCustomerId || !p.sourceDomain) continue;
      const key = p.sourceDomain.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { domain: p.sourceDomain, sheetName: p.excelSheet, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }, [backlinkPurchases]);

  const selectedSupplier = form.webSupplierId ? supplierMap.get(form.webSupplierId) : undefined;

  const handleAdd = async () => {
    if (!form.websiteProfileId || !form.webSupplierId || !form.purchaseDate || form.quantity < 1 || saving) return;
    setSaving(true);
    const { error } = await addPurchase({
      websiteProfileId: form.websiteProfileId,
      webSupplierId: form.webSupplierId,
      cost: form.cost,
      currency: form.currency,
      purchaseDate: form.purchaseDate,
      quantity: form.quantity,
      notes: form.notes || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error(`新增失敗：${error.message}`);
      return;
    }
    setForm(emptyForm);
    setShowAddModal(false);
  };

  const handleEdit = (record: BacklinkPurchase) => {
    setEditing({ ...record });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.websiteProfileId || !editing.webSupplierId || !editing.purchaseDate || editing.quantity < 1 || saving) return;
    setSaving(true);
    const error = await updatePurchase(editing.id, {
      websiteProfileId: editing.websiteProfileId,
      webSupplierId: editing.webSupplierId,
      cost: editing.cost,
      currency: editing.currency,
      purchaseDate: editing.purchaseDate,
      quantity: editing.quantity,
      notes: editing.notes,
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
    const error = await deletePurchase(deleteTarget.id);
    setSaving(false);
    if (error) {
      toast.error(`刪除失敗：${error.message}`);
      return;
    }
    setDeleteTarget(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseBacklinkExcelBuffer(buffer);
      if (!parsed.length) {
        toast.error('未能從 Excel 解析到任何購買紀錄，請確認檔案格式。');
        return;
      }
      const result = enrichBacklinkImports(
        parsed,
        googleAdsAccounts.map((a) => ({ customerId: a.customerId, descriptiveName: a.descriptiveName })),
        websites.map((w) => ({ id: w.id, domainUrl: w.domainUrl })),
      );
      setImportPreview(result);
      setShowImportModal(true);
    } catch (err) {
      toast.error(`解析 Excel 失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!importPreview || importing) return;
    const supplierId =
      webPageSuppliers.find((s) => s.id === EXCEL_IMPORT_SUPPLIER_ID)?.id ||
      webPageSuppliers[0]?.id;
    if (!supplierId) {
      toast.error('請先至「供應商 → 網頁供應商」新增名單，或執行資料庫 migration。');
      return;
    }

    setImporting(true);
    const items = importPreview.records.map((r) => ({
      webSupplierId: supplierId,
      websiteProfileId: r.websiteProfileId,
      cost: r.cost,
      currency: r.currency,
      purchaseDate: r.purchaseDate,
      quantity: r.quantity,
      notes: r.actionText,
      googleAdsCustomerId: r.googleAdsCustomerId,
      googleAdsAccountName: r.googleAdsAccountName,
      sourceDomain: r.sourceDomain,
      excelSheet: r.sheetName,
    }));

    const { inserted, error } = await bulkImport(items);
    setImporting(false);
    if (error) {
      toast.error(`匯入失敗：${error.message}`);
      return;
    }
    setShowImportModal(false);
    setImportPreview(null);
    await refresh();
    toast.success(
      `已匯入 ${inserted} 筆紀錄（${importPreview.stats.sheetsProcessed.length} 個工作表）` +
        (importPreview.unmatchedDomains.length
          ? `，${importPreview.unmatchedDomains.length} 個 Domain 未能匹配 Google Ads 帳戶`
          : ''),
    );
  };

  if (selectedRecord) {
    const supplier = supplierMap.get(selectedRecord.webSupplierId);
    const site = selectedRecord.websiteProfileId ? siteMap.get(selectedRecord.websiteProfileId) : undefined;
    const siteLabel =
      selectedRecord.googleAdsAccountName ||
      site?.websiteName ||
      selectedRecord.sourceDomain ||
      '—';
    return (
      <BacklinkDetail
        record={selectedRecord}
        supplierName={supplier?.name || '—'}
        supplierUrl={supplier?.url || '—'}
        siteLabel={siteLabel}
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
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商網址 *</label>
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
            placeholder="選擇供應商網址後自動帶出"
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
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[280px]">
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <span className="text-[11px] text-muted-foreground">購買筆數</span>
              <p className="text-[18px] font-bold">{stats.count}</p>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <span className="text-[11px] text-muted-foreground">總連結數</span>
              <p className="text-[18px] font-bold">{stats.totalQty}</p>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <span className="text-[11px] text-muted-foreground">費用合計 (USD)</span>
              <p className="text-[18px] font-bold">USD ${stats.usd.toLocaleString()}</p>
            </div>
            <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2">
              <span className="text-[11px] text-muted-foreground">費用合計 (HKD)</span>
              <p className="text-[18px] font-bold">HKD ${stats.hkd.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[110px] h-9 text-[13px]">
              <SelectValue placeholder="年份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部年份</SelectItem>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-[140px] h-9 text-[13px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="開始日期"
          />
          <span className="text-[12px] text-muted-foreground">至</span>
          <Input
            type="date"
            className="w-[140px] h-9 text-[13px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="結束日期"
          />
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋網站／供應商／網址..."
              className="pl-8 h-9 text-[13px]"
            />
          </div>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[200px] h-9 text-[13px]">
              <SelectValue placeholder="帳戶" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部帳戶</SelectItem>
              <SelectItem value="unmatched">未匹配 Domain</SelectItem>
              {googleAdsAccounts.map((a) => (
                <SelectItem key={a.customerId} value={a.customerId}>
                  {a.descriptiveName || a.customerId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as 'all' | 'USD' | 'HKD')}
            className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 h-9"
          >
            <option value="all">全部幣別</option>
            <option value="USD">USD</option>
            <option value="HKD">HKD</option>
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} className="mr-1.5" />
            匯入 Excel
          </Button>
          <button
            onClick={() => { setForm(emptyForm); setShowAddModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200 h-9"
          >
            <Plus size={12} /> 新增購買
          </button>
        </div>

        {unmatchedDomains.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-amber-800 mb-2">
              <AlertTriangle size={14} />
              未能匹配 Google Ads 帳戶的 Domain（{unmatchedDomains.length} 個）
            </div>
            <div className="flex flex-wrap gap-2">
              {unmatchedDomains.map((u) => (
                <span
                  key={u.domain}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-200 bg-white text-[11px] text-amber-900"
                  title={u.sheetName ? `工作表：${u.sheetName} · ${u.count} 筆` : `${u.count} 筆`}
                >
                  {u.domain}
                  <span className="text-amber-600">({u.count})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">所屬網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商網址</th>
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
                  <SiteCell record={record} siteName={record.siteName} />
                </td>
                <td className="px-4 py-3">
                  <span className="break-all text-muted-foreground">{record.supplierUrl}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{record.supplierName}</td>
                <td className="px-4 py-3">{record.currency} ${record.cost.toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums">{record.purchaseDate}</td>
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

      <CrudModal
        isOpen={showImportModal}
        onClose={() => { setShowImportModal(false); setImportPreview(null); }}
        title="匯入 Excel 預覽"
        size="lg"
      >
        {importPreview && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border p-3">
                <div className="text-muted-foreground text-[11px]">解析紀錄</div>
                <div className="text-[18px] font-bold">{importPreview.stats.totalParsed}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-muted-foreground text-[11px]">已匹配 Google Ads 帳戶</div>
                <div className="text-[18px] font-bold text-emerald-700">{importPreview.stats.matched}</div>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">
              工作表：{importPreview.stats.sheetsProcessed.join('、')}
            </p>
            {importPreview.unmatchedDomains.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="font-medium text-amber-800 mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={14} />
                  未能匹配的 Domain（{importPreview.unmatchedDomains.length}）
                </div>
                <ul className="space-y-1 max-h-40 overflow-y-auto text-[12px]">
                  {importPreview.unmatchedDomains.map((u) => (
                    <li key={`${u.sheetName}-${u.domain}`} className="text-amber-900">
                      <span className="font-medium">{u.domain}</span>
                      <span className="text-amber-700 ml-2">· {u.sheetName} · {u.brand}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => { setShowImportModal(false); setImportPreview(null); }}>
                取消
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={importing}
                onClick={() => void confirmImport()}
              >
                {importing ? '匯入中…' : `確認匯入 ${importPreview.stats.totalParsed} 筆`}
              </Button>
            </div>
          </div>
        )}
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
