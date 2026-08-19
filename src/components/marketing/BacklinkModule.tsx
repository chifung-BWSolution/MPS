import { useMemo, useState } from 'react';
import { Plus, Search, ArrowLeft, Eye, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useBacklinkPurchases } from '@/hooks/useBacklinkPurchases';
import { useBrands } from '@/hooks/useBrands';
import { useWebPageSuppliers } from '@/hooks/useWebPageSuppliers';
import { useGoogleAdsAccounts } from '@/hooks/useGoogleAdsAccounts';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { resolveBacklinkBrandLabel, resolveBacklinkBrandListId } from '@/lib/backlinkBrand';
import { getManualDisplayName } from '@/lib/domainMatch';
import { formatBacklinkHkd, formatBacklinkUsd, normalizeBacklinkCosts } from '@/lib/backlinkCurrency';
import type { BacklinkBrand, BacklinkPurchase } from '@/types/marketingOps';
import { BACKLINK_BRANDS } from '@/types/marketingOps';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';

type PurchaseForm = {
  websiteProfileId: string;
  webSupplierId: string;
  costUsd: number;
  costHkd: number;
  brand?: BacklinkBrand;
  purchaseDate: string;
  quantity: number;
  notes: string;
  googleAdsCustomerId?: string;
  googleAdsAccountName?: string;
};

const emptyForm: PurchaseForm = {
  websiteProfileId: '',
  webSupplierId: '',
  costUsd: 0,
  costHkd: 0,
  brand: undefined,
  purchaseDate: '',
  quantity: 1,
  notes: '',
};

function siteSelectValue(data: {
  websiteProfileId?: string;
  googleAdsCustomerId?: string;
  googleAdsAccountName?: string;
}): string {
  if (data.googleAdsCustomerId) return `gads:${data.googleAdsCustomerId}`;
  if (data.websiteProfileId) return `site:${data.websiteProfileId}`;
  if (data.googleAdsAccountName) return `name:${data.googleAdsAccountName}`;
  return '';
}

function applySiteSelection(
  data: PurchaseForm | BacklinkPurchase,
  selected: string,
): PurchaseForm | BacklinkPurchase {
  if (!selected) {
    return {
      ...data,
      websiteProfileId: '',
      googleAdsCustomerId: undefined,
      googleAdsAccountName: undefined,
    };
  }
  if (selected.startsWith('gads:')) {
    const customerId = selected.slice(5);
    return {
      ...data,
      websiteProfileId: '',
      googleAdsCustomerId: customerId,
      googleAdsAccountName: undefined,
    };
  }
  if (selected.startsWith('name:')) {
    return {
      ...data,
      websiteProfileId: '',
      googleAdsCustomerId: undefined,
      googleAdsAccountName: selected.slice(5),
    };
  }
  if (selected.startsWith('site:')) {
    return {
      ...data,
      websiteProfileId: selected.slice(5),
      googleAdsCustomerId: undefined,
      googleAdsAccountName: undefined,
    };
  }
  return { ...data, websiteProfileId: selected };
}

function hasSiteSelection(data: {
  websiteProfileId?: string;
  googleAdsCustomerId?: string;
  googleAdsAccountName?: string;
  sourceDomain?: string;
}): boolean {
  return !!(data.websiteProfileId || data.googleAdsCustomerId || data.googleAdsAccountName || data.sourceDomain);
}

function BrandBadge({ label }: { label?: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-[11px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{label}</span>
  );
}

function BacklinkDetail({
  record,
  supplierName,
  supplierUrl,
  siteLabel,
  brandLabel,
  onBack,
}: {
  record: BacklinkPurchase;
  supplierName: string;
  supplierUrl: string;
  siteLabel: string;
  brandLabel: string;
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
          <div><span className="text-muted-foreground">費用 USD:</span> <span className="font-medium">{formatBacklinkUsd(record.costUsd)}</span></div>
          <div><span className="text-muted-foreground">費用 HKD:</span> <span className="font-medium">{formatBacklinkHkd(record.costHkd)}</span></div>
          <div><span className="text-muted-foreground">品牌:</span> <BrandBadge label={brandLabel} /></div>
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

function formatSupplierUrl(url: string | undefined): string {
  if (!url || url.includes('import.local')) return '';
  return url;
}

function SiteCell({
  record,
  siteName,
}: {
  record: BacklinkPurchase & { siteLabel: string };
  siteName: string;
}) {
  const displayName =
    record.googleAdsAccountName ||
    (record.sourceDomain ? getManualDisplayName(record.sourceDomain) : null);

  if (displayName) {
    return (
      <div>
        <div className="font-medium">{displayName}</div>
        {record.googleAdsCustomerId && (
          <div className="text-[11px] text-muted-foreground">{record.googleAdsCustomerId}</div>
        )}
      </div>
    );
  }
  if (record.sourceDomain) {
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
  const { profiles: websites } = useWebsiteProfiles();
  const { brands } = useBrands();
  const { suppliers: webPageSuppliers } = useWebPageSuppliers();
  const { clientAccounts: googleAdsAccounts } = useGoogleAdsAccounts();
  const {
    purchases: backlinkPurchases,
    addPurchase,
    updatePurchase,
    deletePurchase,
  } = useBacklinkPurchases();

  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<BacklinkPurchase | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<PurchaseForm>(emptyForm);
  const [editing, setEditing] = useState<(BacklinkPurchase & { notes?: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BacklinkPurchase | null>(null);
  const [saving, setSaving] = useState(false);

  const supplierMap = useMemo(() => new Map(webPageSuppliers.map((s) => [s.id, s])), [webPageSuppliers]);
  const siteMap = useMemo(() => new Map(websites.map((w) => [w.id, w])), [websites]);

  const siteOptions = useMemo((): SearchableSelectOption[] => {
    const gadsOptions: SearchableSelectOption[] = googleAdsAccounts.map((a) => ({
      value: `gads:${a.customerId}`,
      label: a.descriptiveName || a.customerId,
      keywords: a.customerId,
    }));
    const manualNames = new Set<string>();
    for (const p of backlinkPurchases) {
      if (p.googleAdsAccountName && !p.googleAdsCustomerId) {
        manualNames.add(p.googleAdsAccountName);
      }
    }
    const manualOptions: SearchableSelectOption[] = [...manualNames].map((name) => ({
      value: `name:${name}`,
      label: name,
      keywords: name,
    }));
    const profileOptions: SearchableSelectOption[] = websites.map((w) => ({
      value: `site:${w.id}`,
      label: w.websiteName,
      keywords: [w.domainUrl, w.brand, w.company, w.id].filter(Boolean).join(' '),
    }));
    return [...gadsOptions, ...manualOptions, ...profileOptions];
  }, [googleAdsAccounts, websites, backlinkPurchases]);

  const supplierOptions = useMemo((): SearchableSelectOption[] => {
    return webPageSuppliers.map((s) => ({
      value: s.id,
      label: s.url ? `${s.url}（${s.name}）` : s.name,
      keywords: [s.name, s.platform, s.url].filter(Boolean).join(' '),
    }));
  }, [webPageSuppliers]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of backlinkPurchases) {
      const y = parseInt(p.purchaseDate.slice(0, 4), 10);
      if (Number.isFinite(y)) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [backlinkPurchases]);

  const activeBrands = useMemo(
    () => brands.filter((b) => b.isActive).sort((a, b) => a.brandCode.localeCompare(b.brandCode)),
    [brands],
  );

  const enriched = useMemo(() => {
    return backlinkPurchases.map((p) => {
      const supplier = supplierMap.get(p.webSupplierId);
      const site = p.websiteProfileId ? siteMap.get(p.websiteProfileId) : undefined;
      const manualSiteName = p.sourceDomain ? getManualDisplayName(p.sourceDomain) : null;
      const resolvedSiteName = p.googleAdsAccountName || manualSiteName;
      const siteLabel =
        resolvedSiteName ||
        site?.websiteName ||
        p.sourceDomain ||
        '—';
      const brandListId = resolveBacklinkBrandListId(p, websites);
      const brandLabel = resolveBacklinkBrandLabel(p, websites, brands);
      return {
        ...p,
        supplierName: supplier?.name || '—',
        supplierUrl: formatSupplierUrl(supplier?.url),
        platform: supplier?.platform || '—',
        siteName: site?.websiteName || '—',
        siteLabel,
        resolvedSiteName,
        brandListId,
        brandLabel,
      };
    });
  }, [backlinkPurchases, supplierMap, siteMap, websites, brands]);

  const filtered = useMemo(() => {
    return enriched
      .filter((r) => {
        if (brandFilter === 'none') return !r.brandListId;
        if (brandFilter !== 'all' && r.brandListId !== brandFilter) return false;
        if (accountFilter !== 'all') {
          if (accountFilter === 'unmatched') return !r.resolvedSiteName && !!r.sourceDomain;
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
            (r.resolvedSiteName || r.googleAdsAccountName || '').toLowerCase().includes(q) ||
            (r.sourceDomain || '').toLowerCase().includes(q) ||
            (r.brandLabel || '').toLowerCase().includes(q) ||
            (r.brand || '').toLowerCase().includes(q) ||
            (r.notes || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [enriched, brandFilter, accountFilter, yearFilter, dateFrom, dateTo, searchQuery]);

  const stats = useMemo(() => {
    const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);
    const usd = filtered.reduce((s, p) => s + p.costUsd, 0);
    const hkd = filtered.reduce((s, p) => s + p.costHkd, 0);
    return { count: filtered.length, totalQty, usd, hkd };
  }, [filtered]);

  const unmatchedDomains = useMemo(() => {
    const map = new Map<string, { domain: string; sheetName?: string; count: number }>();
    for (const p of backlinkPurchases) {
      const resolved = p.googleAdsAccountName || (p.sourceDomain ? getManualDisplayName(p.sourceDomain) : null);
      if (resolved || !p.sourceDomain) continue;
      const key = p.sourceDomain.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { domain: p.sourceDomain, sheetName: p.excelSheet, count: 1 });
    }
    return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }, [backlinkPurchases]);

  const selectedSupplier = form.webSupplierId ? supplierMap.get(form.webSupplierId) : undefined;

  const handleAdd = async () => {
    if (!hasSiteSelection(form) || !form.webSupplierId || !form.purchaseDate || form.quantity < 1 || saving) return;
    setSaving(true);
    const accountName =
      form.googleAdsCustomerId
        ? googleAdsAccounts.find((a) => a.customerId === form.googleAdsCustomerId)?.descriptiveName
        : undefined;
    const { error } = await addPurchase({
      websiteProfileId: form.websiteProfileId || undefined,
      webSupplierId: form.webSupplierId,
      ...normalizeBacklinkCosts(form.costUsd, form.costHkd),
      brand: form.brand,
      purchaseDate: form.purchaseDate,
      quantity: form.quantity,
      notes: form.notes || undefined,
      googleAdsCustomerId: form.googleAdsCustomerId,
      googleAdsAccountName: accountName ?? form.googleAdsAccountName,
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
    if (!editing || !hasSiteSelection(editing) || !editing.webSupplierId || !editing.purchaseDate || editing.quantity < 1 || saving) return;
    setSaving(true);
    const accountName =
      editing.googleAdsCustomerId && !editing.googleAdsAccountName
        ? googleAdsAccounts.find((a) => a.customerId === editing.googleAdsCustomerId)?.descriptiveName
        : editing.googleAdsAccountName;
    const normalized = normalizeBacklinkCosts(editing.costUsd, editing.costHkd);
    const error = await updatePurchase(editing.id, {
      websiteProfileId: editing.websiteProfileId || undefined,
      webSupplierId: editing.webSupplierId,
      costUsd: normalized.costUsd,
      costHkd: normalized.costHkd,
      brand: editing.brand,
      purchaseDate: editing.purchaseDate,
      quantity: editing.quantity,
      notes: editing.notes,
      googleAdsCustomerId: editing.googleAdsCustomerId,
      googleAdsAccountName: accountName,
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

  if (selectedRecord) {
    const supplier = supplierMap.get(selectedRecord.webSupplierId);
    const site = selectedRecord.websiteProfileId ? siteMap.get(selectedRecord.websiteProfileId) : undefined;
    const siteLabel =
      selectedRecord.googleAdsAccountName ||
      (selectedRecord.sourceDomain ? getManualDisplayName(selectedRecord.sourceDomain) : null) ||
      site?.websiteName ||
      selectedRecord.sourceDomain ||
      '—';
    return (
      <BacklinkDetail
        record={selectedRecord}
        supplierName={supplier?.name || '—'}
        supplierUrl={formatSupplierUrl(supplier?.url) || '—'}
        siteLabel={siteLabel}
        brandLabel={resolveBacklinkBrandLabel(selectedRecord, websites, brands)}
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
          <SearchableSelect
            value={siteSelectValue(data)}
            onValueChange={(val) => {
              let next = applySiteSelection(data, val);
              if (val.startsWith('gads:')) {
                const customerId = val.slice(5);
                const account = googleAdsAccounts.find((a) => a.customerId === customerId);
                next = {
                  ...next,
                  googleAdsCustomerId: customerId,
                  googleAdsAccountName: account?.descriptiveName,
                };
              }
              onChange(next);
            }}
            options={siteOptions}
            placeholder="選擇網站或 Google Ads 帳戶"
            searchPlaceholder="搜尋網站名稱、網域、Google Ads 帳戶…"
            emptyText="找不到符合的網站或帳戶"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌</label>
          <Select
            value={data.brand || '__none__'}
            onValueChange={(val) => onChange({ ...data, brand: val === '__none__' ? undefined : (val as BacklinkBrand) })}
          >
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇品牌" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">未指定</SelectItem>
              {BACKLINK_BRANDS.map((brand) => (
                <SelectItem key={brand} value={brand}>{brand}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商網址 *</label>
          <SearchableSelect
            value={data.webSupplierId}
            onValueChange={(val) => onChange({ ...data, webSupplierId: val })}
            options={supplierOptions}
            placeholder="從網頁供應商選擇"
            searchPlaceholder="搜尋供應商名稱、網址…"
            emptyText="找不到符合的供應商"
          />
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
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 USD</label>
            <Input
              type="number"
              min={0}
              value={data.costUsd || ''}
              onChange={(e) => {
                const costUsd = parseFloat(e.target.value) || 0;
                const next = { ...data, costUsd };
                if (costUsd > 0 && !data.costHkd) {
                  const normalized = normalizeBacklinkCosts(costUsd, null);
                  onChange({ ...next, costHkd: normalized.costHkd });
                } else {
                  onChange(next);
                }
              }}
              className="h-9 text-[13px]"
              placeholder="USD"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 HKD</label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={data.costHkd || ''}
              onChange={(e) => {
                const costHkd = parseFloat(e.target.value) || 0;
                const next = { ...data, costHkd };
                if (costHkd > 0 && !data.costUsd) {
                  const normalized = normalizeBacklinkCosts(null, costHkd);
                  onChange({ ...next, costUsd: normalized.costUsd });
                } else {
                  onChange(next);
                }
              }}
              className="h-9 text-[13px]"
              placeholder="HKD"
            />
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
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[160px] h-9 text-[13px]">
              <SelectValue placeholder="品牌" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品牌</SelectItem>
              <SelectItem value="none">未設定品牌</SelectItem>
              {activeBrands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>{brand.brandCode}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">品牌</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">費用 USD</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">費用 HKD</th>
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
                  <BrandBadge label={record.brandLabel} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{record.supplierName}</td>
                <td className="px-4 py-3 tabular-nums">{formatBacklinkUsd(record.costUsd)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBacklinkHkd(record.costHkd)}</td>
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
