import { useState, useMemo } from 'react';
import {
  Search, Plus, GripVertical, ChevronDown, ChevronRight, Package, AlertTriangle,
  Trash2, Copy, Power, PowerOff, Settings2, Clock, X, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  quotationTypes,
  presetQuotationItems,
  PresetQuotationItem,
} from '@/data/quotationData';
import { QuotationInlineEditor } from './QuotationInlineEditor';

// === Types ===
interface ManagedItem extends PresetQuotationItem {
  itemCode: string;
  description: string;
  isEnabled: boolean;
  sortOrder: number;
  isExpanded?: boolean;
}

interface ComprehensiveBundle {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
  totalPrice: number;
  totalCost: number;
  isExpanded?: boolean;
}

// === Supplier Data ===
const supplierOptions = [
  { id: 'sup-none', name: '無供應商 / 內部成本' },
  { id: 'sup1', name: '內部設計團隊' },
  { id: 'sup2', name: '內部開發團隊' },
  { id: 'sup3', name: '內部SEO團隊' },
  { id: 'sup4', name: '內部QA團隊' },
  { id: 'sup5', name: '內部行銷團隊' },
  { id: 'sup6', name: '內部策略團隊' },
  { id: 'sup7', name: '內部活動團隊' },
  { id: 'sup8', name: '內部創意團隊' },
  { id: 'sup9', name: '內部剪輯師' },
  { id: 'sup10', name: '內部分析師' },
  { id: 'sup11', name: '內部架構師' },
  { id: 'sup12', name: '內部DevOps' },
  { id: 'sup13', name: '內部文案團隊' },
  { id: 'sup14', name: '外包攝影團隊' },
  { id: 'sup15', name: '外包動畫師' },
  { id: 'sup16', name: '外包配音員' },
  { id: 'sup17', name: '外包SEO供應商' },
  { id: 'sup18', name: '外包主持人' },
  { id: 'sup19', name: '佈置供應商A' },
  { id: 'sup20', name: '設備供應商B' },
];

// Generate item code based on category
function generateItemCode(category: string, index: number): string {
  const prefixMap: Record<string, string> = {
    'qt1': 'WD',
    'qt2': 'SD',
    'qt3': 'GD',
    'qt4': 'BD',
    'qt5': 'VP',
    'qt6': 'SE',
    'qt7': 'MK',
    'qt8': 'EP',
    'comprehensive': 'CP',
  };
  const prefix = prefixMap[category] || 'IT';
  return `${prefix}-${String(index + 1).padStart(3, '0')}`;
}

// === Main Component ===
export function QuotationItemsManagement() {
  const [viewMode, setViewMode] = useState<'management' | 'inline-editor'>('inline-editor');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isComprehensiveMode, setIsComprehensiveMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
  const [showCopyToTypeModal, setShowCopyToTypeModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [copyTargetTypes, setCopyTargetTypes] = useState<Set<string>>(new Set());

  // Build managed items from preset data
  const managedItems: ManagedItem[] = useMemo(() => {
    const category = selectedTypeId || 'qt1';
    return presetQuotationItems
      .filter(item => item.category === category || (isComprehensiveMode && item.category === 'comprehensive'))
      .map((item, idx) => ({
        ...item,
        itemCode: generateItemCode(item.category, idx),
        description: `${item.name} — 預設售價 $${item.defaultPrice.toLocaleString()}，預設成本 $${item.defaultCost.toLocaleString()}`,
        isEnabled: true,
        sortOrder: idx + 1,
      }));
  }, [selectedTypeId, isComprehensiveMode]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!searchQuery) return managedItems;
    const q = searchQuery.toLowerCase();
    return managedItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.supplierName.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.itemCode.toLowerCase().includes(q)
    );
  }, [managedItems, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const totalPrice = filteredItems.reduce((acc, item) => acc + item.defaultPrice, 0);
    const totalCost = filteredItems.reduce((acc, item) => acc + item.defaultCost, 0);
    const margin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice * 100) : 0;
    return { totalPrice, totalCost, margin: Math.round(margin * 10) / 10 };
  }, [filteredItems]);

  // Comprehensive bundles
  const bundles: ComprehensiveBundle[] = useMemo(() => {
    if (!isComprehensiveMode) return [];
    const pkgItems = presetQuotationItems.filter(i => i.isPackage && i.category === 'comprehensive');
    return pkgItems.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      description: `包含 ${pkg.packageItems?.length || 0} 個項目`,
      itemIds: pkg.packageItems || [],
      totalPrice: pkg.defaultPrice,
      totalCost: pkg.defaultCost,
    }));
  }, [isComprehensiveMode]);

  // Handle select all
  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleToggleItem = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItems(next);
  };

  // Selected type info
  const selectedType = quotationTypes.find(t => t.id === selectedTypeId) || quotationTypes[0];

  // All types for the left panel
  const allTypes = [
    ...quotationTypes.map(t => ({ ...t, isComprehensive: false })),
    { id: 'comprehensive', name: '綜合方案', nameEn: 'Comprehensive Package', isActive: true, isComprehensive: true, defaultTerms: '', paymentArrangement: [], defaultServices: [], logoUrl: '' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">報價項目管理</h1>
          <p className="text-[14px] text-muted-foreground mt-1">管理各報價類型的預設項目、綜合方案及供應商連結。</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('inline-editor')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                viewMode === 'inline-editor' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileText size={12} /> 報價編輯
            </button>
            <button
              onClick={() => setViewMode('management')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
                viewMode === 'management' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Settings2 size={12} /> 項目管理
            </button>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Clock size={12} />
            <span>最後修改：2024-12-20 15:32</span>
            <span className="text-foreground font-medium">陳小華</span>
          </div>
        </div>
      </div>

      {/* === INLINE EDITOR VIEW (v2.3) === */}
      {viewMode === 'inline-editor' && (
        <QuotationInlineEditor
          quotationId="qt-demo-001"
          currency="HKD"
        />
      )}

      {/* === MANAGEMENT VIEW === */}
      {viewMode === 'management' && (
      <>
      {/* Main Layout: Left Type List + Right Items Table */}
      <div className="flex gap-6">
        {/* Left Panel: Quotation Types */}
        <div className="w-[240px] shrink-0">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h4 className="text-[13px] font-bold">報價類型</h4>
            </div>
            <div className="p-2 space-y-1">
              {allTypes.map(type => (
                <button
                  key={type.id}
                  onClick={() => {
                    if (type.id === 'comprehensive') {
                      setSelectedTypeId(null);
                      setIsComprehensiveMode(true);
                    } else {
                      setSelectedTypeId(type.id);
                      setIsComprehensiveMode(false);
                    }
                    setSelectedItems(new Set());
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-all duration-150',
                    (type.id === selectedTypeId || (type.id === 'comprehensive' && isComprehensiveMode))
                      ? 'bg-teal-50 border border-teal-200'
                      : 'hover:bg-muted/50 border border-transparent'
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
                    (type.id === selectedTypeId || (type.id === 'comprehensive' && isComprehensiveMode)) ? 'bg-teal-100' : 'bg-muted/50'
                  )}>
                    {type.id === 'comprehensive' ? (
                      <Package size={14} className="text-amber-600" />
                    ) : (
                      <Settings2 size={14} className={cn(
                        (type.id === selectedTypeId) ? 'text-teal-600' : 'text-muted-foreground'
                      )} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        'text-[13px] font-medium truncate',
                        (type.id === selectedTypeId || (type.id === 'comprehensive' && isComprehensiveMode)) ? 'text-teal-700' : 'text-foreground'
                      )}>
                        {type.name}
                      </span>
                      {type.id === 'comprehensive' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                          綜合
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{type.nameEn}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {presetQuotationItems.filter(i => i.category === type.id).length}項
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Items Table */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Comprehensive mode toggle */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-[16px] font-bold">
                  {isComprehensiveMode ? '綜合方案管理' : selectedType.name}
                </h3>
                <span className="text-[12px] text-muted-foreground">
                  {isComprehensiveMode ? '管理打包方案' : `${filteredItems.length} 個項目`}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {/* Comprehensive mode toggle */}
                {!isComprehensiveMode && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-[12px] text-muted-foreground">此報價類型為綜合方案</span>
                    <div
                      onClick={() => setIsComprehensiveMode(!isComprehensiveMode)}
                      className={cn(
                        'w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer',
                        isComprehensiveMode ? 'bg-amber-500' : 'bg-slate-200'
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm',
                        isComprehensiveMode ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </div>
                  </label>
                )}
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]">
                  <Plus size={12} />新增項目
                </button>
              </div>
            </div>
          </div>

          {/* Search & Bulk Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[320px] bg-white">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-muted-foreground"
                placeholder="搜尋項目名稱、供應商、描述..."
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Bulk action buttons - shown when items are selected */}
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                <span className="text-[12px] text-muted-foreground">已選 {selectedItems.size} 項</span>
                <button
                  onClick={() => alert('已批量啟用')}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-teal-50 text-teal-700 rounded-md border border-teal-200 hover:bg-teal-100 transition-colors"
                >
                  <Power size={10} />啟用
                </button>
                <button
                  onClick={() => alert('已批量停用')}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-50 text-slate-700 rounded-md border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <PowerOff size={10} />停用
                </button>
                <button
                  onClick={() => setShowCopyToTypeModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-blue-50 text-blue-700 rounded-md border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                  <Copy size={10} />複製到...
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-rose-50 text-rose-700 rounded-md border border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  <Trash2 size={10} />刪除
                </button>
              </div>
            )}
          </div>

          {/* Comprehensive Bundles Section */}
          {isComprehensiveMode && bundles.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[14px] font-bold flex items-center gap-2">
                <Package size={14} className="text-amber-600" />
                綜合打包方案
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                  {bundles.length} 個方案
                </span>
              </h4>
              {bundles.map(bundle => (
                <BundleCard key={bundle.id} bundle={bundle} />
              ))}
            </div>
          )}

          {/* Items Table */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-8 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
                      onChange={handleSelectAll}
                      className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600"
                    />
                  </th>
                  <th className="w-8 px-1 py-3">
                    <GripVertical size={12} className="text-muted-foreground mx-auto" />
                  </th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-20">編號</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3">項目名稱</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-28">供應商</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-24">售價</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-24">成本</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-16">毛利率</th>
                  <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-14">啟用</th>
                  <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const margin = item.defaultPrice > 0
                    ? ((item.defaultPrice - item.defaultCost) / item.defaultPrice * 100)
                    : 0;
                  const isCostOverPrice = item.defaultCost > item.defaultPrice;
                  const isSelected = selectedItems.has(item.id);

                  return (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={idx}
                      margin={margin}
                      isCostOverPrice={isCostOverPrice}
                      isSelected={isSelected}
                      onToggleSelect={() => handleToggleItem(item.id)}
                      supplierOptions={supplierOptions}
                      onAddSupplier={() => setShowNewSupplierModal(true)}
                    />
                  );
                })}
              </tbody>
            </table>

            {filteredItems.length === 0 && (
              <div className="py-12 text-center">
                <Package size={32} className="mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-[14px] text-muted-foreground">暫無項目</p>
                <p className="text-[12px] text-muted-foreground mt-1">請新增預設報價項目</p>
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <span className="text-[11px] text-muted-foreground block mb-0.5">預設總售價</span>
                <span className="text-[20px] font-bold text-teal-600">${stats.totalPrice.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-[11px] text-muted-foreground block mb-0.5">預設總成本</span>
                <span className="text-[20px] font-bold text-rose-600">${stats.totalCost.toLocaleString()}</span>
              </div>
              <div className="text-center">
                <span className="text-[11px] text-muted-foreground block mb-0.5">預估毛利率</span>
                <span className={cn(
                  'text-[20px] font-bold',
                  stats.margin >= 50 ? 'text-emerald-600' : stats.margin >= 30 ? 'text-amber-600' : 'text-rose-600'
                )}>
                  {stats.margin}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center">
                <AlertTriangle size={20} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold">確認刪除</h3>
                <p className="text-[12px] text-muted-foreground">此操作無法復原</p>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground mb-6">
              確定要刪除已選取的 <strong>{selectedItems.size}</strong> 個項目嗎？此操作無法復原。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">取消</button>
              <button onClick={() => { alert('已刪除'); setShowDeleteConfirm(false); setSelectedItems(new Set()); }}
                className="px-4 py-2 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors">確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* Copy to Type Modal */}
      {showCopyToTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-[16px] font-bold mb-4">複製到其他報價類型</h3>
            <p className="text-[12px] text-muted-foreground mb-4">選擇要複製 {selectedItems.size} 個項目到的目標類型：</p>
            <div className="space-y-2 max-h-[240px] overflow-y-auto mb-4">
              {quotationTypes.filter(t => t.id !== selectedTypeId).map(type => (
                <label key={type.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border hover:bg-muted/30 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={copyTargetTypes.has(type.id)}
                    onChange={() => {
                      const next = new Set(copyTargetTypes);
                      if (next.has(type.id)) next.delete(type.id);
                      else next.add(type.id);
                      setCopyTargetTypes(next);
                    }}
                    className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600"
                  />
                  <span className="text-[13px] font-medium">{type.name}</span>
                  <span className="text-[11px] text-muted-foreground ml-auto">{type.nameEn}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCopyToTypeModal(false); setCopyTargetTypes(new Set()); }} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">取消</button>
              <button onClick={() => { alert(`已複製到 ${copyTargetTypes.size} 個類型`); setShowCopyToTypeModal(false); setCopyTargetTypes(new Set()); setSelectedItems(new Set()); }}
                disabled={copyTargetTypes.size === 0}
                className={cn('px-4 py-2 text-sm rounded-md transition-colors', copyTargetTypes.size > 0 ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                確認複製
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Supplier Modal */}
      {showNewSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-[16px] font-bold mb-4">快速新增供應商</h3>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商名稱</label>
                <input
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
                  placeholder="輸入供應商名稱"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewSupplierModal(false)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">取消</button>
              <button onClick={() => { alert(`已新增供應商：${newSupplierName}`); setShowNewSupplierModal(false); setNewSupplierName(''); }}
                disabled={!newSupplierName}
                className={cn('px-4 py-2 text-sm rounded-md transition-colors', newSupplierName ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
                新增
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Bundle Card Component ===
function BundleCard({ bundle }: { bundle: ComprehensiveBundle }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const margin = bundle.totalPrice > 0 ? ((bundle.totalPrice - bundle.totalCost) / bundle.totalPrice * 100) : 0;
  const bundleItems = presetQuotationItems.filter(i => bundle.itemIds.includes(i.id));

  return (
    <div className="bg-white rounded-md border border-amber-200 shadow-card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Package size={16} className="text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold">{bundle.name}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              方案
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">{bundle.description}</span>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground block">方案總售價</span>
            <span className="text-[14px] font-bold text-teal-600">${bundle.totalPrice.toLocaleString()}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground block">方案總成本</span>
            <span className="text-[14px] font-bold text-rose-600">${bundle.totalCost.toLocaleString()}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground block">毛利率</span>
            <span className={cn('text-[14px] font-bold', margin >= 50 ? 'text-emerald-600' : 'text-amber-600')}>
              {Math.round(margin * 10) / 10}%
            </span>
          </div>
          {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-amber-200 px-4 py-3 space-y-1.5">
          {bundleItems.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 py-1.5 px-2 rounded bg-muted/20 text-[12px]">
              <span className="text-muted-foreground w-4">{idx + 1}.</span>
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="text-muted-foreground">{item.supplierName}</span>
              <span className="text-teal-600 font-medium w-20 text-right">${item.defaultPrice.toLocaleString()}</span>
              <span className="text-rose-600 font-medium w-20 text-right">${item.defaultCost.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Item Row Component ===
function ItemRow({
  item,
  index,
  margin,
  isCostOverPrice,
  isSelected,
  onToggleSelect,
  supplierOptions,
  onAddSupplier,
}: {
  item: ManagedItem;
  index: number;
  margin: number;
  isCostOverPrice: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  supplierOptions: { id: string; name: string }[];
  onAddSupplier: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEnabled, setIsEnabled] = useState(item.isEnabled);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [localSupplierSearch, setLocalSupplierSearch] = useState('');

  const filteredLocalSuppliers = supplierOptions.filter(s =>
    s.name.toLowerCase().includes(localSupplierSearch.toLowerCase())
  );

  return (
    <>
      <tr className={cn(
        'border-b border-border/50 transition-colors duration-150',
        isCostOverPrice ? 'bg-rose-50/50' : 'hover:bg-muted/20',
        isSelected && 'bg-teal-50/30',
        !isEnabled && 'opacity-50'
      )}>
        <td className="px-2 py-2.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600"
          />
        </td>
        <td className="px-1 py-2.5 cursor-grab active:cursor-grabbing">
          <GripVertical size={12} className="text-muted-foreground/60 mx-auto" />
        </td>
        <td className="px-3 py-2.5">
          <span className="text-[12px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
            {item.itemCode}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            <span className="text-[13px] font-medium">{item.name}</span>
            {item.isPackage && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                方案
              </span>
            )}
            {isCostOverPrice && (
              <div className="flex items-center gap-1 ml-1" title="成本高於售價">
                <AlertTriangle size={12} className="text-rose-500" />
                <span className="text-[10px] text-rose-600 font-medium">成本超標</span>
              </div>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 relative">
          <div className="relative">
            <button
              onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
              className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1 max-w-full truncate"
            >
              <span className="truncate">{item.supplierName}</span>
              <ChevronDown size={10} className="shrink-0" />
            </button>

            {showSupplierDropdown && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-border rounded-md shadow-lg z-50">
                <div className="p-2 border-b border-border">
                  <input
                    value={localSupplierSearch}
                    onChange={(e) => setLocalSupplierSearch(e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder="搜尋供應商..."
                    autoFocus
                  />
                </div>
                <div className="max-h-[160px] overflow-y-auto py-1">
                  {filteredLocalSuppliers.map(sup => (
                    <button
                      key={sup.id}
                      onClick={() => { setShowSupplierDropdown(false); setLocalSupplierSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted/50 transition-colors"
                    >
                      {sup.name}
                    </button>
                  ))}
                </div>
                <div className="border-t border-border p-2">
                  <button
                    onClick={() => { setShowSupplierDropdown(false); onAddSupplier(); }}
                    className="flex items-center gap-1 text-[11px] text-teal-600 font-medium hover:text-teal-700"
                  >
                    <Plus size={10} />快速新增供應商
                  </button>
                </div>
              </div>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className="text-[13px] font-medium">${item.defaultPrice.toLocaleString()}</span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className={cn('text-[13px] font-medium', isCostOverPrice ? 'text-rose-600' : '')}>
            ${item.defaultCost.toLocaleString()}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right">
          <span className={cn(
            'text-[12px] font-bold',
            margin >= 50 ? 'text-emerald-600' : margin >= 30 ? 'text-amber-600' : 'text-rose-600'
          )}>
            {Math.round(margin * 10) / 10}%
          </span>
        </td>
        <td className="px-3 py-2.5 text-center">
          <div
            onClick={() => setIsEnabled(!isEnabled)}
            className={cn(
              'w-7 h-4 rounded-full relative transition-colors duration-200 cursor-pointer mx-auto',
              isEnabled ? 'bg-teal-500' : 'bg-slate-200'
            )}
          >
            <div className={cn(
              'w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform duration-200 shadow-sm',
              isEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
            )} />
          </div>
        </td>
        <td className="px-2 py-2.5 text-center">
          <button className="text-muted-foreground hover:text-rose-500 transition-colors">
            <Trash2 size={12} />
          </button>
        </td>
      </tr>

      {/* Expanded description row */}
      {isExpanded && (
        <tr className="border-b border-border/30">
          <td colSpan={10} className="px-4 py-3 bg-muted/10">
            <div className="pl-14 space-y-2">
              <div>
                <span className="text-[11px] font-medium text-muted-foreground block mb-1">項目描述</span>
                <p className="text-[12px] text-foreground">{item.description}</p>
              </div>
              {item.isPackage && item.packageItems && (
                <div>
                  <span className="text-[11px] font-medium text-muted-foreground block mb-1">包含項目 ({item.packageItems.length})</span>
                  <div className="flex flex-wrap gap-1.5">
                    {item.packageItems.map(pid => {
                      const pItem = presetQuotationItems.find(i => i.id === pid);
                      return pItem ? (
                        <span key={pid} className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                          {pItem.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
