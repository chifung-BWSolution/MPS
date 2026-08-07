import { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Plus, FileText, Eye, Download, Check, X, AlertTriangle, ChevronRight, Trash2, DollarSign, Award, Pencil, Save, RotateCcw, Layers, GripVertical, Clock, Users, ArrowLeft, ExternalLink, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CRMModule } from '@/components/crm/CRMModule';
import { useApp } from '@/context/AppContext';
import { QuotationItemsManagement } from '@/components/quotation/QuotationItemsManagement';
import { QuotationPreview } from '@/components/quotation/QuotationPreview';
import { PitchingModule } from '@/components/quotation/PitchingModule';
import { ProjectModule } from '@/components/quotation/ProjectModule';
import {
  quotationTypes,
  quotationEntries,
  clientProjects,
  presetQuotationItems,
  getQuotationTypeName,
  getStatusConfig,
  getClientProjectStatusConfig,
  QuotationType,
  QuotationServiceItem,
  PaymentStage,
  CostStructure,
  CostStructureItem,
  QuotationEntry,
  ClientProject,
  Milestone,
  termsTemplates,
} from '@/data/quotationData';
import { useQuotationClientProjects } from '@/hooks/useQuotationClientProjects';
import {
  formatProjectTypes,
  matchesProjectTypeFilter,
  PITCHING_PROJECT_TYPE_OPTIONS,
} from '@/data/pitchingData';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import { generateQuotationServices, getQuotationAiModelId, QUOTATION_AI_MODEL_OPTIONS, type QuotationAiCatalogItem, type QuotationAiProvider } from '@/lib/quotationAiApi';

// Supplier options for cost structure
const supplierOptions = [
  { id: 'sup-none', name: '無供應商 / 內部成本' },
  { id: 'sup1', name: '內部設計團隊' },
  { id: 'sup2', name: '內部開發團隊' },
  { id: 'sup3', name: '內部SEO團隊' },
  { id: 'sup4', name: '內部QA團隊' },
  { id: 'sup5', name: '內部行銷團隊' },
  { id: 'sup6', name: '內部策略團隊' },
  { id: 'sup7', name: '外包攝影團隊' },
  { id: 'sup8', name: '外包動畫師' },
  { id: 'sup9', name: '外包配音員' },
  { id: 'sup10', name: '外包SEO供應商' },
  { id: 'sup11', name: '佈置供應商A' },
  { id: 'sup12', name: '設備供應商B' },
];

// ===== QUOTATION LIST =====
function QuotationList({ onViewQuote, onPreviewQuote }: { onViewQuote: (id: string) => void; onPreviewQuote?: (quote: QuotationEntry) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return quotationEntries.filter(q => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return q.quoteId.toLowerCase().includes(query) || q.client.toLowerCase().includes(query);
      }
      return true;
    });
  }, [searchQuery, statusFilter]);

  const totalAmount = quotationEntries.reduce((acc, q) => acc + q.amount, 0);
  const wonCount = quotationEntries.filter(q => q.status === 'won').length;
  const pendingCount = quotationEntries.filter(q => q.status === 'pending_approval').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">總報價金額</span>
          <span className="text-[22px] font-bold block mt-1">${totalAmount.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">報價單總數</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{quotationEntries.length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已成交</span>
          <span className="text-[22px] font-bold block mt-1 text-emerald-600">{wonCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">待批核</span>
          <span className="text-[22px] font-bold block mt-1 text-amber-600">{pendingCount}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[280px] bg-white">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            placeholder="搜尋報價單編號或客戶名稱..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">所有狀態</option>
          <option value="draft">草稿</option>
          <option value="pending_approval">待批核</option>
          <option value="approved">已批准</option>
          <option value="sent">已寄出</option>
          <option value="won">已成交</option>
          <option value="rejected">已退回</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">報價單號</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">客戶</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">報價類型</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">金額</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">毛利率</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">建立日期</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((quote) => {
              const config = getStatusConfig(quote.status);
              return (
                <tr key={quote.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-[14px] font-medium text-teal-600">{quote.quoteId}</td>
                  <td className="px-4 py-3 text-[14px]">{quote.client}</td>
                  <td className="px-4 py-3 text-[14px]">{getQuotationTypeName(quote.quotationType)}</td>
                  <td className="px-4 py-3 text-[14px] font-medium">${quote.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[14px]">
                    <span className={cn('font-medium', quote.grossMargin >= 50 ? 'text-emerald-600' : 'text-amber-600')}>
                      {quote.grossMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[14px] text-muted-foreground">{quote.createdDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onViewQuote(quote.id)} className="text-teal-600 hover:text-teal-700 text-[12px] font-medium" title="檢視">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => onPreviewQuote?.(quote)} className="text-muted-foreground hover:text-teal-600 text-[12px] font-medium" title="預覽">
                        <FileText size={14} />
                      </button>
                      {(quote.status === 'approved' || quote.status === 'won') && (
                        <button
                          onClick={() => {
                            onPreviewQuote?.(quote);
                          }}
                          className="text-muted-foreground hover:text-teal-600 text-[12px] font-medium"
                          title="生成 PDF"
                        >
                          <Download size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== NEW QUOTATION WIZARD =====
function NewQuotationWizard({ onClose }: { onClose: () => void }) {
  const { records: pitchingRecords, loading: pitchingLoading } = useQuotationClientProjects();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<QuotationType | null>(null);
  const [isComprehensive, setIsComprehensive] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedPitchingId, setSelectedPitchingId] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [clientName, setClientName] = useState('');
  const [requirementsText, setRequirementsText] = useState('');
  const [aiProvider, setAiProvider] = useState<QuotationAiProvider>('grok');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generationMeta, setGenerationMeta] = useState<{
    provider: string;
    model: string;
    fallback: boolean;
  } | null>(null);
  const [quotationDate, setQuotationDate] = useState('');
  const [manHoursEstimate, setManHoursEstimate] = useState<number>(0);
  const [asanaLink, setAsanaLink] = useState('');
  const [outputLink, setOutputLink] = useState('');
  const [services, setServices] = useState<QuotationServiceItem[]>([]);
  const [terms, setTerms] = useState('');
  const [paymentArrangement, setPaymentArrangement] = useState<PaymentStage[]>([]);
  const [overallDiscount, setOverallDiscount] = useState(0);
  const [overallDiscountType, setOverallDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [costStructure, setCostStructure] = useState<CostStructure>({
    totalRevenue: 0, laborCost: 0, supplierCost: 0, outsourcingCost: 0, otherCost: 0, grossProfit: 0, grossMargin: 0,
    items: [],
  });
  const [costErrors, setCostErrors] = useState<string[]>([]);

  const selectedPitching = useMemo(
    () => pitchingRecords.find((record) => record.id === selectedPitchingId),
    [pitchingRecords, selectedPitchingId],
  );

  const filteredPitchingRecords = useMemo(() => {
    return pitchingRecords.filter((record) => matchesProjectTypeFilter(record.projectTypes, projectTypeFilter));
  }, [pitchingRecords, projectTypeFilter]);

  const pitchingOptions = useMemo((): SearchableSelectOption[] => {
    return filteredPitchingRecords.map((record) => ({
      value: record.id,
      label: `${record.displayName} · ${record.clientName}`,
      keywords: [
        record.pitchingId,
        record.clientName,
        record.displayName,
        formatProjectTypes(record.projectTypes),
        record.assignedPmName,
        record.description,
      ].filter(Boolean).join(' '),
    }));
  }, [filteredPitchingRecords]);

  const catalogItems = useMemo((): QuotationAiCatalogItem[] => {
    const typeIds = isComprehensive ? selectedTypes : selectedType ? [selectedType.id] : [];
    if (!typeIds.length) return [];
    return presetQuotationItems
      .filter((item) => typeIds.includes(item.category) || (isComprehensive && item.category === 'comprehensive'))
      .map((item) => ({
        id: item.id,
        name: item.name,
        defaultPrice: item.defaultPrice,
        defaultCost: item.defaultCost,
        supplierName: item.supplierName,
        category: item.category,
      }));
  }, [isComprehensive, selectedType, selectedTypes]);

  useEffect(() => {
    if (!selectedPitchingId) return;
    if (!filteredPitchingRecords.some((record) => record.id === selectedPitchingId)) {
      setSelectedPitchingId('');
      setClientName('');
    }
  }, [filteredPitchingRecords, selectedPitchingId]);

  const handleSelectPitching = (pitchingId: string) => {
    setSelectedPitchingId(pitchingId);
    const record = pitchingRecords.find((item) => item.id === pitchingId);
    if (!record) {
      setClientName('');
      return;
    }
    setClientName(record.clientName);
    const seedText = [record.description, record.notes, record.displayName].filter(Boolean).join('\n');
    if (seedText) setRequirementsText(seedText);
    if (record.asanaLink) setAsanaLink(record.asanaLink);
  };

  const handleGenerateServices = async () => {
    if (!selectedPitchingId || (isComprehensive && selectedTypes.length === 0) || aiGenerating) return;
    setAiGenerating(true);
    try {
      const pitching = pitchingRecords.find((record) => record.id === selectedPitchingId);
      const result = await generateQuotationServices({
        provider: aiProvider,
        quotationTypeName: selectedType?.name,
        isComprehensive,
        selectedTypeNames: selectedTypes
          .map((typeId) => quotationTypes.find((type) => type.id === typeId)?.name)
          .filter(Boolean) as string[],
        pitchingRecord: pitching,
        requirements: requirementsText.trim(),
        catalogItems,
      });

      const mappedServices = result.services.map((service, idx) => {
        const catalog = catalogItems.find(
          (item) => item.name.toLowerCase() === service.name.toLowerCase(),
        );
        const typePrefix =
          catalog && catalog.category !== 'comprehensive'
            ? catalog.category
            : isComprehensive
              ? selectedTypes[idx % selectedTypes.length] || selectedTypes[0] || 'custom'
              : selectedType?.id || 'custom';
        return {
          ...service,
          id: isComprehensive ? `svc-${typePrefix}-${idx}` : `svc-${idx}`,
        };
      });

      setServices(mappedServices);
      setGenerationMeta({
        provider: result.provider,
        model: result.model || getQuotationAiModelId(aiProvider),
        fallback: result.fallback,
      });

      if (result.fallback) {
        toast.error(result.error || 'AI 生成失敗，已改用本地規則生成服務項目');
      }

      setStep(3);
    } catch (err) {
      toast.error(`生成失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSelectType = (type: QuotationType) => {
    setSelectedType(type);
    setIsComprehensive(false);
    // Use default terms template if available, otherwise fall back to type.defaultTerms
    const defaultTemplate = termsTemplates.find(t => t.quotationTypeId === type.id && t.isDefault);
    setTerms(defaultTemplate ? defaultTemplate.content : type.defaultTerms);
    setPaymentArrangement(type.paymentArrangement);
    const initialServices: QuotationServiceItem[] = type.defaultServices.map((ds, idx) => ({
      id: `svc-${idx}`, name: ds.name, price: ds.defaultPrice, cost: ds.defaultCost,
      supplierName: ds.supplierName, quantity: 1, discount: 0, discountType: 'percentage' as const,
      isVisible: true, isSelected: true,
    }));
    setServices(initialServices);
    setStep(2);
  };

  const handleSelectComprehensive = () => {
    setIsComprehensive(true);
    setSelectedType(null);
    setSelectedTypes([]);
    setServices([]);
    setTerms('1. 本報價為綜合方案，包含多個服務類別。\n2. 報價有效期為30天。\n3. 修改次數及付款條款依各項服務類別約定。');
    setPaymentArrangement([
      { id: 'ps1', label: '訂金', percentage: 30, description: '簽約後3個工作天內支付' },
      { id: 'ps2', label: '中期款', percentage: 40, description: '各項目中段完成時支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '全部交付完成後支付' },
    ]);
    setStep(2);
  };

  const toggleComprehensiveType = (typeId: string) => {
    const type = quotationTypes.find(t => t.id === typeId);
    if (!type) return;
    
    if (selectedTypes.includes(typeId)) {
      setSelectedTypes(selectedTypes.filter(id => id !== typeId));
      setServices(services.filter(s => !(s.id.startsWith(`svc-${typeId}-`))));
    } else {
      setSelectedTypes([...selectedTypes, typeId]);
      const newServices: QuotationServiceItem[] = type.defaultServices.map((ds, idx) => ({
        id: `svc-${typeId}-${idx}`, name: ds.name, price: ds.defaultPrice, cost: ds.defaultCost,
        supplierName: ds.supplierName, quantity: 1, discount: 0, discountType: 'percentage' as const,
        isVisible: true, isSelected: true,
      }));
      setServices([...services, ...newServices]);
    }
  };

  const calculateTotal = () => {
    const selectedServices = services.filter(s => s.isSelected);
    let subtotal = 0;
    selectedServices.forEach(s => {
      let itemTotal = s.price * s.quantity;
      if (s.discount > 0) {
        itemTotal = s.discountType === 'percentage' ? itemTotal * (1 - s.discount / 100) : itemTotal - s.discount;
      }
      subtotal += itemTotal;
    });
    if (overallDiscount > 0) {
      subtotal = overallDiscountType === 'percentage' ? subtotal * (1 - overallDiscount / 100) : subtotal - overallDiscount;
    }
    return Math.round(subtotal);
  };

  const updateCostRevenue = () => {
    const revenue = calculateTotal();
    const totalCosts = (costStructure.items || []).reduce((acc, item) => acc + item.amount, 0);
    const profit = revenue - totalCosts;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    setCostStructure(prev => ({ ...prev, totalRevenue: revenue, laborCost: totalCosts, supplierCost: 0, outsourcingCost: 0, otherCost: 0, grossProfit: profit, grossMargin: Math.round(margin * 10) / 10 }));
  };

  const validateCostStructure = (): boolean => {
    const errors: string[] = [];
    const items = costStructure.items || [];
    if (items.length === 0) {
      errors.push('請至少新增一項支出項目');
    }
    if (items.some(item => !item.name.trim())) {
      errors.push('所有支出項目必須填寫名稱');
    }
    if (items.some(item => item.amount <= 0)) {
      errors.push('所有支出金額必須大於 0');
    }
    setCostErrors(errors);
    return errors.length === 0;
  };

  const handleSubmit = () => {
    if (!validateCostStructure()) return;
    const modeLabel = isComprehensive ? '（綜合方案）' : '';
    alert(`報價單${modeLabel}已成功提交批核！`);
    onClose();
  };

  const handleAddCustomService = () => {
    setServices([...services, {
      id: `svc-custom-${Date.now()}`, name: '', price: 0, cost: 0, supplierName: '',
      quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true,
    }]);
  };

  const updateService = (id: string, field: keyof QuotationServiceItem, value: any) => {
    setServices(services.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeService = (id: string) => {
    setServices(services.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[18px] font-bold">新建報價單</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">✕</button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {['選擇報價類型', '選擇客戶', '編輯報價內容', 'Cost Structure'].map((label, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-200',
                  step > idx + 1 ? 'bg-teal-600 text-white' : step === idx + 1 ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {step > idx + 1 ? <Check size={14} /> : idx + 1}
                </div>
                <span className={cn('text-[12px] whitespace-nowrap', step === idx + 1 ? 'text-teal-600 font-medium' : 'text-muted-foreground')}>{label}</span>
              </div>
              {idx < 3 && <div className={cn('w-12 h-0.5 mt-[-16px]', step > idx + 1 ? 'bg-teal-600' : 'bg-muted')} />}
            </div>
          ))}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <p className="text-[14px] text-muted-foreground mb-4">選擇報價類型，系統將自動載入對應的預設項目、T&C 及付款安排：</p>
            
            {/* Comprehensive Option - Highlighted */}
            <div className="mb-6">
              <button onClick={handleSelectComprehensive}
                className="group w-full p-5 border-2 border-dashed border-amber-300 rounded-md text-left hover:border-amber-500 hover:bg-amber-50/50 transition-all duration-200 flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-50 rounded-md flex items-center justify-center group-hover:bg-amber-100 transition-colors shrink-0">
                  <Layers size={24} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold">綜合報價單</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Comprehensive</span>
                  </div>
                  <span className="text-[13px] text-muted-foreground block mt-1">一張報價單包含多種不同類型的服務項目，可自由組合網站設計、影片製作、SEO、行銷等</span>
                </div>
                <ChevronRight size={18} className="text-muted-foreground group-hover:text-amber-600 transition-colors" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[12px] text-muted-foreground font-medium">或選擇單一報價類型</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {quotationTypes.filter(t => t.isActive).map((type) => (
                <button key={type.id} onClick={() => handleSelectType(type)}
                  className="group p-5 border border-border rounded-md text-center hover:border-teal-600 hover:bg-teal-50/50 transition-all duration-200 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-teal-50 rounded-md flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                    <FileText size={20} className="text-teal-600" />
                  </div>
                  <div>
                    <span className="text-[14px] font-medium block">{type.name}</span>
                    <span className="text-[11px] text-muted-foreground">{type.nameEn}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{type.defaultServices.length} 項預設服務</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            {/* Comprehensive Type Selector */}
            {isComprehensive && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={16} className="text-amber-600" />
                  <h4 className="text-[14px] font-bold">綜合方案 — 選擇包含的服務類型</h4>
                  <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">可選多個</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {quotationTypes.filter(t => t.isActive).map((type) => (
                    <button key={type.id} onClick={() => toggleComprehensiveType(type.id)}
                      className={cn(
                        'p-3 border rounded-md text-center transition-all duration-200 flex flex-col items-center gap-2',
                        selectedTypes.includes(type.id)
                          ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-200'
                          : 'border-border hover:border-teal-300 hover:bg-teal-50/30'
                      )}>
                      <div className="flex items-center gap-1.5">
                        {selectedTypes.includes(type.id) && <Check size={12} className="text-teal-600" />}
                        <span className="text-[13px] font-medium">{type.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{type.defaultServices.length} 項</span>
                    </button>
                  ))}
                </div>
                {selectedTypes.length > 0 && (
                  <div className="p-3 bg-teal-50/50 border border-teal-200 rounded-md">
                    <span className="text-[12px] text-teal-700">已選擇 <strong>{selectedTypes.length}</strong> 個類型，共 <strong>{services.length}</strong> 項服務</span>
                  </div>
                )}
                <div className="border-b border-border my-4" />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">搜尋客戶</label>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <select
                    value={projectTypeFilter}
                    onChange={(e) => setProjectTypeFilter(e.target.value)}
                    className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 h-9"
                  >
                    <option value="all">全部項目類型</option>
                    {PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  {pitchingLoading && (
                    <span className="text-[12px] text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> 載入 Pitching 資料…
                    </span>
                  )}
                </div>
                <SearchableSelect
                  value={selectedPitchingId}
                  onValueChange={handleSelectPitching}
                  options={pitchingOptions}
                  placeholder="選擇 Pitching 客戶…"
                  searchPlaceholder="搜尋客戶、顯示名稱、項目類型、Pitching ID…"
                  emptyText={pitchingLoading ? '載入中…' : '找不到符合的 Pitching 紀錄'}
                />
                {selectedPitching && (
                  <div className="mt-2 text-[12px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    <span><span className="font-medium text-foreground">客戶：</span>{selectedPitching.clientName}</span>
                    <span><span className="font-medium text-foreground">項目類型：</span>{formatProjectTypes(selectedPitching.projectTypes)}</span>
                    <span><span className="font-medium text-foreground">Pitching ID：</span>{selectedPitching.pitchingId}</span>
                  </div>
                )}
              </div>

              {selectedPitchingId && (
                <div>
                  <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">客戶需求 / 報價說明</label>
                  <div className="flex gap-2 items-start">
                    <textarea
                      value={requirementsText}
                      onChange={(e) => setRequirementsText(e.target.value)}
                      rows={4}
                      placeholder="描述客戶需求、範圍、預算期望等，AI 將據此生成服務項目…"
                      className="flex-1 px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-y min-h-[96px]"
                    />
                    <div className="shrink-0 flex flex-col gap-2 w-[148px]">
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">AI 模型</label>
                        <select
                          value={aiProvider}
                          onChange={(e) => setAiProvider(e.target.value as QuotationAiProvider)}
                          disabled={aiGenerating}
                          className="w-full h-9 px-2 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:opacity-60"
                          aria-label="AI 模型"
                        >
                          {QUOTATION_AI_MODEL_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label} · {opt.modelId}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGenerateServices()}
                        disabled={aiGenerating || (isComprehensive && selectedTypes.length === 0)}
                        className={cn(
                          'flex-1 min-h-[56px] px-3 rounded-md text-[13px] font-medium transition-colors duration-200 flex flex-col items-center justify-center gap-1.5',
                          aiGenerating || (isComprehensive && selectedTypes.length === 0)
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-teal-600 text-white hover:bg-teal-700',
                        )}
                      >
                        {aiGenerating ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>生成中</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            <span>生成</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    目前選擇：<span className="font-medium text-foreground">{QUOTATION_AI_MODEL_OPTIONS.find((opt) => opt.id === aiProvider)?.label} · {getQuotationAiModelId(aiProvider)}</span>
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => { setStep(1); setIsComprehensive(false); setSelectedTypes([]); setSelectedPitchingId(''); setClientName(''); setRequirementsText(''); }} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors duration-200">上一步</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] text-muted-foreground">
                {isComprehensive ? (
                  <>報價模式：<span className="font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">綜合方案</span> | 包含 <span className="font-medium text-foreground">{selectedTypes.length}</span> 個類型</>
                ) : (
                  <>報價類型：<span className="font-medium text-foreground">{selectedType?.name}</span></>
                )}
                {' '}| 客戶：<span className="font-medium text-foreground">{selectedPitching?.displayName || clientName}</span>
              </p>
              {generationMeta && (
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border',
                  generationMeta.fallback
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-teal-200 bg-teal-50 text-teal-800',
                )}>
                  {generationMeta.fallback ? '本地規則' : 'AI 生成'} · {generationMeta.provider === 'grok' ? 'Grok' : generationMeta.provider === 'gemini' ? 'Gemini' : generationMeta.provider} · {generationMeta.model}
                </span>
              )}
            </div>

            {/* Comprehensive: Add items from other types */}
            {isComprehensive && (
              <div className="bg-amber-50/50 border border-amber-200 rounded-md p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={14} className="text-amber-600" />
                  <span className="text-[13px] font-bold text-amber-800">綜合方案包含的類型</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedTypes.map(typeId => {
                    const type = quotationTypes.find(t => t.id === typeId);
                    return type ? (
                      <span key={typeId} className="inline-flex items-center gap-1 text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-1 rounded-md font-medium">
                        <FileText size={10} /> {type.name}
                        <span className="text-muted-foreground ml-1">({services.filter(s => s.id.startsWith('svc-' + typeId + '-')).length} 項)</span>
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {/* Service Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[15px] font-bold">服務項目</h4>
                <button onClick={handleAddCustomService} className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700">
                  <Plus size={12} />新增自訂項目
                </button>
              </div>

              {/* Group by type in comprehensive mode */}
              {isComprehensive ? (
                <div className="space-y-4">
                  {selectedTypes.map(typeId => {
                    const type = quotationTypes.find(t => t.id === typeId);
                    const typeServices = services.filter(s => s.id.startsWith('svc-' + typeId + '-'));
                    if (!type || typeServices.length === 0) return null;
                    return (
                      <div key={typeId} className="border border-border rounded-md overflow-hidden">
                        <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center gap-2">
                          <FileText size={12} className="text-teal-600" />
                          <span className="text-[12px] font-bold">{type.name}</span>
                          <span className="text-[10px] text-muted-foreground">({typeServices.length} 項)</span>
                        </div>
                        <table className="w-full">
                          <thead>
                            <tr className="bg-muted/20 border-b border-border">
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-8">選</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">項目名稱</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-16">數量</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">售價</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-20">折扣%</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">小計</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-12">顯示</th>
                              <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeServices.map((svc) => {
                              let itemTotal = svc.price * svc.quantity;
                              if (svc.discount > 0) {
                                itemTotal = svc.discountType === 'percentage' ? itemTotal * (1 - svc.discount / 100) : itemTotal - svc.discount;
                              }
                              return (
                                <tr key={svc.id} className={cn('border-b border-border/50', !svc.isSelected && 'opacity-40')}>
                                  <td className="px-3 py-2">
                                    <input type="checkbox" checked={svc.isSelected} onChange={(e) => updateService(svc.id, 'isSelected', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input value={svc.name} onChange={(e) => updateService(svc.id, 'name', e.target.value)} className="w-full text-[13px] bg-transparent border-none outline-none" placeholder="服務名稱" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" value={svc.quantity} onChange={(e) => updateService(svc.id, 'quantity', parseInt(e.target.value) || 1)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" min={1} />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" value={svc.price} onChange={(e) => updateService(svc.id, 'price', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" value={svc.discount} onChange={(e) => updateService(svc.id, 'discount', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" placeholder="0" />
                                  </td>
                                  <td className="px-3 py-2 text-[13px] font-medium">${Math.round(itemTotal).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-center">
                                    <input type="checkbox" checked={svc.isVisible} onChange={(e) => updateService(svc.id, 'isVisible', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <button onClick={() => removeService(svc.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {/* Custom items (not tied to type) */}
                  {services.filter(s => !selectedTypes.some(t => s.id.startsWith('svc-' + t + '-'))).length > 0 && (
                    <div className="border border-border rounded-md overflow-hidden">
                      <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center gap-2">
                        <Plus size={12} className="text-teal-600" />
                        <span className="text-[12px] font-bold">自訂項目</span>
                      </div>
                      <table className="w-full">
                        <tbody>
                          {services.filter(s => !selectedTypes.some(t => s.id.startsWith('svc-' + t + '-'))).map((svc) => {
                            let itemTotal = svc.price * svc.quantity;
                            if (svc.discount > 0) {
                              itemTotal = svc.discountType === 'percentage' ? itemTotal * (1 - svc.discount / 100) : itemTotal - svc.discount;
                            }
                            return (
                              <tr key={svc.id} className={cn('border-b border-border/50', !svc.isSelected && 'opacity-40')}>
                                <td className="px-3 py-2 w-8">
                                  <input type="checkbox" checked={svc.isSelected} onChange={(e) => updateService(svc.id, 'isSelected', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                                </td>
                                <td className="px-3 py-2">
                                  <input value={svc.name} onChange={(e) => updateService(svc.id, 'name', e.target.value)} className="w-full text-[13px] bg-transparent border-none outline-none" placeholder="服務名稱" />
                                </td>
                                <td className="px-3 py-2 w-16">
                                  <input type="number" value={svc.quantity} onChange={(e) => updateService(svc.id, 'quantity', parseInt(e.target.value) || 1)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" min={1} />
                                </td>
                                <td className="px-3 py-2 w-24">
                                  <input type="number" value={svc.price} onChange={(e) => updateService(svc.id, 'price', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" />
                                </td>
                                <td className="px-3 py-2 w-20">
                                  <input type="number" value={svc.discount} onChange={(e) => updateService(svc.id, 'discount', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" placeholder="0" />
                                </td>
                                <td className="px-3 py-2 w-24 text-[13px] font-medium">${Math.round(itemTotal).toLocaleString()}</td>
                                <td className="px-3 py-2 w-12 text-center">
                                  <input type="checkbox" checked={svc.isVisible} onChange={(e) => updateService(svc.id, 'isVisible', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                                </td>
                                <td className="px-3 py-2 w-8">
                                  <button onClick={() => removeService(svc.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* Single type mode - original table */
                <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-8">選</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">項目名稱</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-16">數量</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">售價</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-20">折扣%</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">小計</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-12">顯示</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((svc) => {
                        let itemTotal = svc.price * svc.quantity;
                        if (svc.discount > 0) {
                          itemTotal = svc.discountType === 'percentage' ? itemTotal * (1 - svc.discount / 100) : itemTotal - svc.discount;
                        }
                        return (
                          <tr key={svc.id} className={cn('border-b border-border/50', !svc.isSelected && 'opacity-40')}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={svc.isSelected} onChange={(e) => updateService(svc.id, 'isSelected', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={svc.name} onChange={(e) => updateService(svc.id, 'name', e.target.value)} className="w-full text-[13px] bg-transparent border-none outline-none" placeholder="服務名稱" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" value={svc.quantity} onChange={(e) => updateService(svc.id, 'quantity', parseInt(e.target.value) || 1)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" min={1} />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" value={svc.price} onChange={(e) => updateService(svc.id, 'price', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" value={svc.discount} onChange={(e) => updateService(svc.id, 'discount', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" placeholder="0" />
                            </td>
                            <td className="px-3 py-2 text-[13px] font-medium">${Math.round(itemTotal).toLocaleString()}</td>
                            <td className="px-3 py-2 text-center">
                              <input type="checkbox" checked={svc.isVisible} onChange={(e) => updateService(svc.id, 'isVisible', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => removeService(svc.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Overall Discount & Total */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-[13px] font-medium">整體折扣：</label>
              <input type="number" value={overallDiscount} onChange={(e) => setOverallDiscount(parseInt(e.target.value) || 0)} className="w-20 px-2 py-1 border border-border rounded-md text-[13px]" />
              <select value={overallDiscountType} onChange={(e) => setOverallDiscountType(e.target.value as 'percentage' | 'fixed')} className="px-2 py-1 border border-border rounded-md text-[13px]">
                <option value="percentage">%</option>
                <option value="fixed">HKD</option>
              </select>
              <span className="text-[15px] font-bold ml-auto">總計：<span className="text-teal-600">${calculateTotal().toLocaleString()}</span></span>
            </div>

            {/* Terms */}
            <div>
              <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">Terms & Conditions</label>
              {/* Template selector */}
              <div className="mb-2">
                <select
                  onChange={(e) => {
                    const template = termsTemplates.find(t => t.id === e.target.value);
                    if (template) {
                      setTerms(prev => prev ? `${prev}\n${template.content}` : template.content);
                    }
                  }}
                  value=""
                  className="px-3 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                >
                  <option value="" disabled>套用條款範本...</option>
                  {termsTemplates
                    .filter(t => t.quotationTypeId === (selectedType?.id || '') || t.quotationTypeId === 'all')
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.isDefault ? ' (預設)' : ''}{t.quotationTypeId === 'all' ? ' [通用]' : ''}
                      </option>
                    ))
                  }
                </select>
              </div>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" rows={4} placeholder="輸入條款內容，或從上方選擇範本..." />
            </div>

            {/* Payment */}
            <div>
              <label className="text-[13px] font-medium text-muted-foreground block mb-2">付款安排</label>
              <div className="space-y-2">
                {paymentArrangement.map((stage) => (
                  <div key={stage.id} className="flex items-center gap-3 p-2 bg-muted/20 rounded-md">
                    <span className="text-[12px] font-medium w-20">{stage.label}</span>
                    <span className="text-[12px] text-teal-600 font-bold w-12">{stage.percentage}%</span>
                    <span className="text-[12px] text-muted-foreground flex-1">{stage.description}</span>
                    <span className="text-[12px] font-medium">${Math.round(calculateTotal() * stage.percentage / 100).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors duration-200">上一步</button>
              <button onClick={() => { updateCostRevenue(); setStep(4); }} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors duration-200">下一步：Cost Structure</button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={18} className="text-teal-600" />
              <h4 className="text-[15px] font-bold">Cost Structure（預算收入與支出）</h4>
            </div>
            <p className="text-[13px] text-muted-foreground">必須填寫完整 Cost Structure，否則無法提交報價單。</p>

            <div className="bg-teal-50/50 border border-teal-200 rounded-md p-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-medium">收入總額（自動計算）</span>
                <span className="text-[20px] font-bold text-teal-600">${calculateTotal().toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'laborCost', label: '人工成本' },
                { key: 'supplierCost', label: '供應商費用' },
                { key: 'outsourcingCost', label: '外包費用' },
                { key: 'otherCost', label: '其他費用' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">{label}</label>
                  <input
                    type="number"
                    value={(costStructure as any)[key] || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      const newCs = { ...costStructure, [key]: val };
                      const rev = calculateTotal();
                      const totalCosts = newCs.laborCost + newCs.supplierCost + newCs.outsourcingCost + newCs.otherCost;
                      newCs.totalRevenue = rev;
                      newCs.grossProfit = rev - totalCosts;
                      newCs.grossMargin = rev > 0 ? Math.round((rev - totalCosts) / rev * 1000) / 10 : 0;
                      setCostStructure(newCs);
                    }}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <div className="bg-white border border-border rounded-md p-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground block">總支出</span>
                  <span className="text-[18px] font-bold text-rose-600">
                    ${(costStructure.laborCost + costStructure.supplierCost + costStructure.outsourcingCost + costStructure.otherCost).toLocaleString()}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground block">預計毛利</span>
                  <span className={cn('text-[18px] font-bold', costStructure.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    ${costStructure.grossProfit.toLocaleString()}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground block">毛利率</span>
                  <span className={cn('text-[18px] font-bold', costStructure.grossMargin >= 50 ? 'text-emerald-600' : costStructure.grossMargin >= 30 ? 'text-amber-600' : 'text-rose-600')}>
                    {costStructure.grossMargin}%
                  </span>
                </div>
              </div>
            </div>

            {costErrors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-md p-3">
                {costErrors.map((err, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[12px] text-rose-700"><AlertTriangle size={12} />{err}</div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors duration-200">上一步</button>
              <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors duration-200">儲存草稿</button>
              <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors duration-200">提交批核</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== APPROVAL MODULE =====
function QuotationApproval({ onPreviewQuote }: { onPreviewQuote?: (quote: QuotationEntry) => void }) {
  const [selectedQuote, setSelectedQuote] = useState<QuotationEntry | null>(null);
  const [showWonModal, setShowWonModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editServices, setEditServices] = useState<QuotationServiceItem[]>([]);
  const [editTerms, setEditTerms] = useState('');
  const [editPayment, setEditPayment] = useState<PaymentStage[]>([]);
  const [editCostStructure, setEditCostStructure] = useState<CostStructure>({
    totalRevenue: 0, laborCost: 0, supplierCost: 0, outsourcingCost: 0, otherCost: 0, grossProfit: 0, grossMargin: 0,
  });
  const [editOverallDiscount, setEditOverallDiscount] = useState(0);
  const [editOverallDiscountType, setEditOverallDiscountType] = useState<'percentage' | 'fixed'>('percentage');

  const pendingQuotes = quotationEntries.filter(q => q.status === 'pending_approval' || q.status === 'approved');

  const handleApprove = () => { alert('報價單已批准！'); setSelectedQuote(null); setIsEditing(false); };
  const handleReject = () => { alert('報價單已退回。'); setSelectedQuote(null); setIsEditing(false); };
  const handleConfirmWon = () => { alert('已成交！客戶項目已自動建立。'); setShowWonModal(false); setSelectedQuote(null); };

  const startEditing = () => {
    if (!selectedQuote) return;
    setEditServices(JSON.parse(JSON.stringify(selectedQuote.services)));
    setEditTerms(selectedQuote.terms);
    setEditPayment(JSON.parse(JSON.stringify(selectedQuote.paymentArrangement)));
    setEditCostStructure({ ...selectedQuote.costStructure });
    setEditOverallDiscount(selectedQuote.overallDiscount);
    setEditOverallDiscountType(selectedQuote.overallDiscountType);
    setIsEditing(true);
  };

  const cancelEditing = () => { setIsEditing(false); };

  const saveEditing = () => {
    alert('報價單已更新！');
    setIsEditing(false);
  };

  const calculateEditTotal = () => {
    const selectedServices = editServices.filter(s => s.isSelected);
    let subtotal = 0;
    selectedServices.forEach(s => {
      let itemTotal = s.price * s.quantity;
      if (s.discount > 0) {
        itemTotal = s.discountType === 'percentage' ? itemTotal * (1 - s.discount / 100) : itemTotal - s.discount;
      }
      subtotal += itemTotal;
    });
    if (editOverallDiscount > 0) {
      subtotal = editOverallDiscountType === 'percentage' ? subtotal * (1 - editOverallDiscount / 100) : subtotal - editOverallDiscount;
    }
    return Math.round(subtotal);
  };

  const updateEditService = (id: string, field: keyof QuotationServiceItem, value: any) => {
    setEditServices(editServices.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeEditService = (id: string) => {
    setEditServices(editServices.filter(s => s.id !== id));
  };

  const addEditService = () => {
    setEditServices([...editServices, {
      id: `svc-edit-${Date.now()}`, name: '', price: 0, cost: 0, supplierName: '',
      quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true,
    }]);
  };

  if (selectedQuote) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setSelectedQuote(null); setIsEditing(false); }} className="flex items-center gap-1 text-[13px] text-teal-600 hover:text-teal-700 font-medium">← 返回報價批核列表</button>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[20px] font-bold">{selectedQuote.quoteId}</h3>
              <p className="text-[13px] text-muted-foreground mt-1">客戶：{selectedQuote.client} | 類型：{getQuotationTypeName(selectedQuote.quotationType)}{selectedQuote.quotationMode === 'comprehensive' && <span className="ml-2 text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">綜合方案</span>}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing && (
                <>
                  {(selectedQuote.status === 'approved' || selectedQuote.status === 'won') && (
                    <button
                      onClick={() => onPreviewQuote?.(selectedQuote)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
                    >
                      <Download size={12} />生成 PDF
                    </button>
                  )}
                  <button onClick={() => onPreviewQuote?.(selectedQuote)} className="flex items-center gap-1.5 px-3 py-1.5 border border-teal-200 text-teal-600 rounded-md text-[12px] font-medium hover:bg-teal-50 transition-colors">
                    <Eye size={12} />預覽
                  </button>
                  <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-1.5 border border-teal-200 text-teal-600 rounded-md text-[12px] font-medium hover:bg-teal-50 transition-colors">
                    <Pencil size={12} />編輯
                  </button>
                </>
              )}
              <span className={cn('text-[12px] font-medium px-3 py-1 rounded-sm', getStatusConfig(selectedQuote.status).bgColor, getStatusConfig(selectedQuote.status).color)}>
                {getStatusConfig(selectedQuote.status).label}
              </span>
            </div>
          </div>

          {/* Edit Mode Banner */}
          {isEditing && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md mb-6">
              <Pencil size={14} className="text-amber-600" />
              <span className="text-[13px] text-amber-700 font-medium flex-1">正在編輯模式 — 可修改服務項目、數量、售價、成本及付款安排</span>
              <button onClick={cancelEditing} className="flex items-center gap-1 px-3 py-1 text-[12px] border border-amber-300 rounded-md text-amber-700 hover:bg-amber-100 transition-colors"><RotateCcw size={11} />取消</button>
              <button onClick={saveEditing} className="flex items-center gap-1 px-3 py-1 text-[12px] bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"><Save size={11} />儲存變更</button>
            </div>
          )}

          {/* Services - View Mode */}
          {!isEditing && (
            <div className="mb-6">
              <h4 className="text-[14px] font-bold mb-3">服務項目</h4>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">項目</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">數量</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">售價</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">成本</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">供應商</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">小計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuote.services.filter(s => s.isSelected).map((svc) => (
                      <tr key={svc.id} className="border-b border-border/50">
                        <td className="px-3 py-2 text-[13px]">{svc.name}</td>
                        <td className="px-3 py-2 text-[13px]">{svc.quantity}</td>
                        <td className="px-3 py-2 text-[13px]">${svc.price.toLocaleString()}</td>
                        <td className="px-3 py-2 text-[13px] text-rose-600">${svc.cost.toLocaleString()}</td>
                        <td className="px-3 py-2 text-[13px] text-muted-foreground">{svc.supplierName}</td>
                        <td className="px-3 py-2 text-[13px] font-medium">${(svc.price * svc.quantity).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Services - Edit Mode */}
          {isEditing && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[14px] font-bold">服務項目（編輯中）</h4>
                <button onClick={addEditService} className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700">
                  <Plus size={12} />新增項目
                </button>
              </div>
              <div className="border border-border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-8">選</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">項目名稱</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-16">數量</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">售價</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">成本</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-20">折扣%</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">供應商</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-24">小計</th>
                      <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editServices.map((svc) => {
                      let itemTotal = svc.price * svc.quantity;
                      if (svc.discount > 0) {
                        itemTotal = svc.discountType === 'percentage' ? itemTotal * (1 - svc.discount / 100) : itemTotal - svc.discount;
                      }
                      return (
                        <tr key={svc.id} className={cn('border-b border-border/50', !svc.isSelected && 'opacity-40')}>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={svc.isSelected} onChange={(e) => updateEditService(svc.id, 'isSelected', e.target.checked)} className="w-3.5 h-3.5 rounded border-border text-teal-600 focus:ring-teal-600" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={svc.name} onChange={(e) => updateEditService(svc.id, 'name', e.target.value)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" placeholder="服務名稱" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={svc.quantity} onChange={(e) => updateEditService(svc.id, 'quantity', parseInt(e.target.value) || 1)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" min={1} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={svc.price} onChange={(e) => updateEditService(svc.id, 'price', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={svc.cost} onChange={(e) => updateEditService(svc.id, 'cost', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={svc.discount} onChange={(e) => updateEditService(svc.id, 'discount', parseInt(e.target.value) || 0)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" placeholder="0" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={svc.supplierName} onChange={(e) => updateEditService(svc.id, 'supplierName', e.target.value)} className="w-full text-[13px] bg-transparent border border-border rounded px-1.5 py-0.5" placeholder="供應商" />
                          </td>
                          <td className="px-3 py-2 text-[13px] font-medium">${Math.round(itemTotal).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeEditService(svc.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Overall Discount */}
              <div className="flex items-center gap-4 flex-wrap mt-4">
                <label className="text-[13px] font-medium">整體折扣：</label>
                <input type="number" value={editOverallDiscount} onChange={(e) => setEditOverallDiscount(parseInt(e.target.value) || 0)} className="w-20 px-2 py-1 border border-border rounded-md text-[13px]" />
                <select value={editOverallDiscountType} onChange={(e) => setEditOverallDiscountType(e.target.value as 'percentage' | 'fixed')} className="px-2 py-1 border border-border rounded-md text-[13px]">
                  <option value="percentage">%</option>
                  <option value="fixed">HKD</option>
                </select>
                <span className="text-[15px] font-bold ml-auto">總計：<span className="text-teal-600">${calculateEditTotal().toLocaleString()}</span></span>
              </div>
            </div>
          )}

          {/* Cost Structure - View Mode */}
          {!isEditing && (
            <div className="mb-6">
              <h4 className="text-[14px] font-bold mb-3">Cost Structure</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/20 rounded-md p-3 text-center">
                  <span className="text-[11px] text-muted-foreground block">收入總額</span>
                  <span className="text-[16px] font-bold text-teal-600">${selectedQuote.amount.toLocaleString()}</span>
                </div>
                <div className="bg-muted/20 rounded-md p-3 text-center">
                  <span className="text-[11px] text-muted-foreground block">總支出</span>
                  <span className="text-[16px] font-bold text-rose-600">${selectedQuote.costTotal.toLocaleString()}</span>
                </div>
                <div className="bg-muted/20 rounded-md p-3 text-center">
                  <span className="text-[11px] text-muted-foreground block">預計毛利</span>
                  <span className="text-[16px] font-bold text-emerald-600">${selectedQuote.grossProfit.toLocaleString()}</span>
                </div>
                <div className="bg-muted/20 rounded-md p-3 text-center">
                  <span className="text-[11px] text-muted-foreground block">毛利率</span>
                  <span className={cn('text-[16px] font-bold', selectedQuote.grossMargin >= 50 ? 'text-emerald-600' : 'text-amber-600')}>{selectedQuote.grossMargin}%</span>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div className="text-center p-2 border border-border/50 rounded"><span className="text-[10px] text-muted-foreground block">人工</span><span className="text-[13px] font-medium">${selectedQuote.costStructure.laborCost.toLocaleString()}</span></div>
                <div className="text-center p-2 border border-border/50 rounded"><span className="text-[10px] text-muted-foreground block">供應商</span><span className="text-[13px] font-medium">${selectedQuote.costStructure.supplierCost.toLocaleString()}</span></div>
                <div className="text-center p-2 border border-border/50 rounded"><span className="text-[10px] text-muted-foreground block">外包</span><span className="text-[13px] font-medium">${selectedQuote.costStructure.outsourcingCost.toLocaleString()}</span></div>
                <div className="text-center p-2 border border-border/50 rounded"><span className="text-[10px] text-muted-foreground block">其他</span><span className="text-[13px] font-medium">${selectedQuote.costStructure.otherCost.toLocaleString()}</span></div>
              </div>
            </div>
          )}

          {/* Cost Structure - Edit Mode */}
          {isEditing && (
            <div className="mb-6">
              <h4 className="text-[14px] font-bold mb-3">Cost Structure（編輯中）</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'laborCost', label: '人工成本' },
                  { key: 'supplierCost', label: '供應商費用' },
                  { key: 'outsourcingCost', label: '外包費用' },
                  { key: 'otherCost', label: '其他費用' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[13px] font-medium text-muted-foreground block mb-1.5">{label}</label>
                    <input
                      type="number"
                      value={(editCostStructure as any)[key] || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const newCs = { ...editCostStructure, [key]: val };
                        const rev = calculateEditTotal();
                        const totalCosts = newCs.laborCost + newCs.supplierCost + newCs.outsourcingCost + newCs.otherCost;
                        newCs.totalRevenue = rev;
                        newCs.grossProfit = rev - totalCosts;
                        newCs.grossMargin = rev > 0 ? Math.round((rev - totalCosts) / rev * 1000) / 10 : 0;
                        setEditCostStructure(newCs);
                      }}
                      className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <div className="bg-white border border-border rounded-md p-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <span className="text-[11px] text-muted-foreground block">總支出</span>
                    <span className="text-[18px] font-bold text-rose-600">
                      ${(editCostStructure.laborCost + editCostStructure.supplierCost + editCostStructure.outsourcingCost + editCostStructure.otherCost).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] text-muted-foreground block">預計毛利</span>
                    <span className={cn('text-[18px] font-bold', (calculateEditTotal() - (editCostStructure.laborCost + editCostStructure.supplierCost + editCostStructure.outsourcingCost + editCostStructure.otherCost)) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      ${(calculateEditTotal() - (editCostStructure.laborCost + editCostStructure.supplierCost + editCostStructure.outsourcingCost + editCostStructure.otherCost)).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[11px] text-muted-foreground block">毛利率</span>
                    <span className={cn('text-[18px] font-bold', editCostStructure.grossMargin >= 50 ? 'text-emerald-600' : editCostStructure.grossMargin >= 30 ? 'text-amber-600' : 'text-rose-600')}>
                      {calculateEditTotal() > 0 ? Math.round((calculateEditTotal() - (editCostStructure.laborCost + editCostStructure.supplierCost + editCostStructure.outsourcingCost + editCostStructure.otherCost)) / calculateEditTotal() * 1000) / 10 : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment & T&C - View Mode */}
          {!isEditing && (
            <>
              <div className="mb-6">
                <h4 className="text-[14px] font-bold mb-3">付款安排</h4>
                <div className="space-y-2">
                  {selectedQuote.paymentArrangement.map(stage => (
                    <div key={stage.id} className="flex items-center gap-3 p-2 bg-muted/20 rounded-md">
                      <span className="text-[12px] font-medium w-24">{stage.label}</span>
                      <span className="text-[12px] text-teal-600 font-bold w-12">{stage.percentage}%</span>
                      <span className="text-[12px] text-muted-foreground flex-1">{stage.description}</span>
                      <span className="text-[12px] font-medium">${Math.round(selectedQuote.amount * stage.percentage / 100).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-[14px] font-bold mb-2">Terms & Conditions</h4>
                <div className="bg-muted/20 rounded-md p-3">
                  <pre className="text-[12px] text-muted-foreground whitespace-pre-wrap">{selectedQuote.terms}</pre>
                </div>
              </div>
            </>
          )}

          {/* Payment & T&C - Edit Mode */}
          {isEditing && (
            <>
              <div className="mb-6">
                <h4 className="text-[14px] font-bold mb-3">付款安排（編輯中）</h4>
                <div className="space-y-2">
                  {editPayment.map((stage, idx) => (
                    <div key={stage.id} className="flex items-center gap-3 p-2 bg-muted/20 rounded-md">
                      <input value={stage.label} onChange={(e) => { const np = [...editPayment]; np[idx] = { ...np[idx], label: e.target.value }; setEditPayment(np); }} className="text-[12px] font-medium w-24 bg-transparent border border-border rounded px-1.5 py-0.5" />
                      <input type="number" value={stage.percentage} onChange={(e) => { const np = [...editPayment]; np[idx] = { ...np[idx], percentage: parseInt(e.target.value) || 0 }; setEditPayment(np); }} className="text-[12px] text-teal-600 font-bold w-16 bg-transparent border border-border rounded px-1.5 py-0.5" />
                      <span className="text-[12px]">%</span>
                      <input value={stage.description} onChange={(e) => { const np = [...editPayment]; np[idx] = { ...np[idx], description: e.target.value }; setEditPayment(np); }} className="text-[12px] text-muted-foreground flex-1 bg-transparent border border-border rounded px-1.5 py-0.5" />
                      <span className="text-[12px] font-medium">${Math.round(calculateEditTotal() * stage.percentage / 100).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <h4 className="text-[14px] font-bold mb-2">Terms & Conditions（編輯中）</h4>
                <div className="mb-2">
                  <select
                    onChange={(e) => {
                      const template = termsTemplates.find(t => t.id === e.target.value);
                      if (template) {
                        setEditTerms(template.content);
                      }
                    }}
                    value=""
                    className="px-3 py-1.5 border border-border rounded-md text-[12px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                  >
                    <option value="" disabled>套用條款範本...</option>
                    {termsTemplates
                      .filter(t => t.quotationTypeId === (selectedQuote?.quotationType || '') || t.quotationTypeId === 'all')
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.isDefault ? ' (預設)' : ''}{t.quotationTypeId === 'all' ? ' [通用]' : ''}
                        </option>
                      ))
                    }
                  </select>
                </div>
                <textarea value={editTerms} onChange={(e) => setEditTerms(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" rows={4} placeholder="輸入條款內容，或從上方選擇範本..." />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            {selectedQuote.status === 'pending_approval' && !isEditing && (
              <>
                <button onClick={() => onPreviewQuote?.(selectedQuote)} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"><Eye size={14} />預覽</button>
                <button onClick={handleReject} className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-600 rounded-md text-sm font-medium hover:bg-rose-100 transition-colors"><X size={14} />退回</button>
                <button onClick={handleApprove} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors"><Check size={14} />批准</button>
              </>
            )}
            {selectedQuote.status === 'approved' && !isEditing && (
              <>
                <button onClick={() => onPreviewQuote?.(selectedQuote)} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"><Eye size={14} />預覽</button>
                <button
                  onClick={() => onPreviewQuote?.(selectedQuote)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  <Download size={14} />生成 PDF
                </button>
                <button onClick={() => setShowWonModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-colors"><Award size={14} />確認成交</button>
              </>
            )}
            {(selectedQuote.status === 'won') && !isEditing && (
              <>
                <button onClick={() => onPreviewQuote?.(selectedQuote)} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"><Eye size={14} />預覽</button>
                <button
                  onClick={() => onPreviewQuote?.(selectedQuote)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors"
                >
                  <Download size={14} />生成 PDF
                </button>
              </>
            )}
            {(selectedQuote.status === 'draft' || selectedQuote.status === 'sent' || selectedQuote.status === 'rejected') && !isEditing && (
              <button onClick={() => onPreviewQuote?.(selectedQuote)} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"><Eye size={14} />預覽</button>
            )}
            {isEditing && (
              <>
                <button onClick={cancelEditing} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"><RotateCcw size={14} />取消編輯</button>
                <button onClick={saveEditing} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors"><Save size={14} />儲存變更</button>
              </>
            )}
          </div>
        </div>

        {/* Won Deal Modal */}
        {showWonModal && (
          <div className="fixed inset-0 m-0 bg-black/50 flex items-center justify-center z-[100]">
            <div className="bg-white rounded-md p-6 w-full max-w-md shadow-xl">
              <h3 className="text-[18px] font-bold mb-4">確認成交</h3>
              <p className="text-[13px] text-muted-foreground mb-4">請上載客戶簽署的 PDF 文件以確認成交。成交後系統將自動建立客戶項目記錄。</p>
              <div className="border-2 border-dashed border-border rounded-md p-6 text-center mb-4">
                <FileText size={24} className="mx-auto text-muted-foreground mb-2" />
                <span className="text-[13px] text-muted-foreground">拖拽檔案至此或點擊上傳</span>
                <button className="block mx-auto mt-2 text-[12px] text-teal-600 font-medium hover:text-teal-700">選擇檔案</button>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowWonModal(false)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors">取消</button>
                <button onClick={handleConfirmWon} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors">確認成交</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">待批核</span>
          <span className="text-[24px] font-bold block mt-1 text-amber-600">{quotationEntries.filter(q => q.status === 'pending_approval').length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已批准（可成交）</span>
          <span className="text-[24px] font-bold block mt-1 text-teal-600">{quotationEntries.filter(q => q.status === 'approved').length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已成交</span>
          <span className="text-[24px] font-bold block mt-1 text-emerald-600">{quotationEntries.filter(q => q.status === 'won').length}</span>
        </div>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h4 className="text-[14px] font-bold">報價批核列表</h4>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">報價單號</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">客戶</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">金額</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">毛利率</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">提交人</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {pendingQuotes.map(quote => {
              const config = getStatusConfig(quote.status);
              return (
                <tr key={quote.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-[14px] font-medium text-teal-600">{quote.quoteId}</td>
                  <td className="px-4 py-3 text-[14px]">{quote.client}</td>
                  <td className="px-4 py-3 text-[14px] font-medium">${quote.amount.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={cn('font-medium text-[14px]', quote.grossMargin >= 50 ? 'text-emerald-600' : 'text-amber-600')}>{quote.grossMargin}%</span></td>
                  <td className="px-4 py-3"><span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span></td>
                  <td className="px-4 py-3 text-[14px] text-muted-foreground">{quote.createdBy}</td>
                  <td className="px-4 py-3"><button onClick={() => setSelectedQuote(quote)} className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700">查看詳情 <ChevronRight size={12} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== CLIENT PROJECTS =====
function ClientProjectsList({ onPreviewQuote }: { onPreviewQuote?: (quote: QuotationEntry) => void }) {
  const [selectedProject, setSelectedProject] = useState<ClientProject | null>(null);

  if (selectedProject) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedProject(null)} className="flex items-center gap-1 text-[13px] text-teal-600 hover:text-teal-700 font-medium">← 返回客戶項目列表</button>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-[20px] font-bold">{selectedProject.clientName}</h3>
              <p className="text-[13px] text-muted-foreground mt-1">報價單：{selectedProject.quoteId} | 成交日期：{selectedProject.wonDate}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const quote = quotationEntries.find(q => q.quoteId === selectedProject.quoteId);
                  if (quote) onPreviewQuote?.(quote);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
              >
                <Download size={12} />生成 PDF
              </button>
              <span className={cn('text-[12px] font-medium px-3 py-1 rounded-sm', getClientProjectStatusConfig(selectedProject.status).bgColor, getClientProjectStatusConfig(selectedProject.status).color)}>
                {getClientProjectStatusConfig(selectedProject.status).label}
              </span>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium">交付進度</span>
              <span className="text-[13px] font-bold text-teal-600">{selectedProject.deliveryProgress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${selectedProject.deliveryProgress}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/20 rounded-md p-3"><span className="text-[11px] text-muted-foreground block">總金額</span><span className="text-[16px] font-bold">${selectedProject.totalAmount.toLocaleString()}</span></div>
            <div className="bg-muted/20 rounded-md p-3"><span className="text-[11px] text-muted-foreground block">收費模式</span><span className="text-[14px] font-medium">{selectedProject.billingModel}</span></div>
            <div className="bg-muted/20 rounded-md p-3"><span className="text-[11px] text-muted-foreground block">負責同事</span><span className="text-[14px] font-medium">{selectedProject.assignedStaff.join(', ')}</span></div>
            <div className="bg-muted/20 rounded-md p-3"><span className="text-[11px] text-muted-foreground block">里程碑</span><span className="text-[14px] font-medium">{selectedProject.milestones.filter(m => m.status === 'completed').length}/{selectedProject.milestones.length}</span></div>
          </div>

          <div className="mb-6">
            <h4 className="text-[14px] font-bold mb-3">服務類型及數量</h4>
            <div className="space-y-1.5">
              {selectedProject.serviceDetails.map((sd, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-muted/20 rounded text-[13px]">
                  <span>{sd.name}</span><span className="font-medium">x{sd.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[14px] font-bold mb-3">交付時間表</h4>
            <div className="space-y-2">
              {selectedProject.milestones.map((ms) => {
                const msConf = { pending: { label: '待開始', color: 'text-slate-600', bgColor: 'bg-slate-50' }, in_progress: { label: '進行中', color: 'text-teal-600', bgColor: 'bg-teal-50' }, completed: { label: '已完成', color: 'text-emerald-600', bgColor: 'bg-emerald-50' } }[ms.status];
                return (
                  <div key={ms.id} className="flex items-center justify-between p-3 border border-border/50 rounded-md">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-2 h-2 rounded-full', ms.status === 'completed' ? 'bg-emerald-500' : ms.status === 'in_progress' ? 'bg-teal-500' : 'bg-slate-300')} />
                      <span className="text-[13px] font-medium">{ms.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {ms.assignee && <span className="text-[11px] text-muted-foreground">{ms.assignee}</span>}
                      <span className="text-[11px] text-muted-foreground">{ms.dueDate}</span>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', msConf.bgColor, msConf.color)}>{msConf.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">進行中項目</span>
          <span className="text-[24px] font-bold block mt-1 text-teal-600">{clientProjects.filter(cp => cp.status === 'active').length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">總合約金額</span>
          <span className="text-[24px] font-bold block mt-1">${clientProjects.reduce((acc, cp) => acc + cp.totalAmount, 0).toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">平均交付進度</span>
          <span className="text-[24px] font-bold block mt-1 text-emerald-600">{Math.round(clientProjects.reduce((acc, cp) => acc + cp.deliveryProgress, 0) / (clientProjects.length || 1))}%</span>
        </div>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">客戶</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">報價單號</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">總金額</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">收費模式</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">交付進度</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {clientProjects.map(cp => {
              const config = getClientProjectStatusConfig(cp.status);
              return (
                <tr key={cp.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-[14px] font-medium">{cp.clientName}</td>
                  <td className="px-4 py-3 text-[14px] text-teal-600">{cp.quoteId}</td>
                  <td className="px-4 py-3 text-[14px] font-medium">${cp.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-[14px]">{cp.billingModel}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-teal-600 rounded-full" style={{ width: `${cp.deliveryProgress}%` }} /></div>
                      <span className="text-[12px] font-medium">{cp.deliveryProgress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span></td>
                  <td className="px-4 py-3"><button onClick={() => setSelectedProject(cp)} className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700">詳情 <ChevronRight size={12} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== MAIN MODULE =====
export function QuotationModule({ subModule }: { subModule?: string }) {
  const { navigateTo } = useApp();
  const [viewingQuoteId, setViewingQuoteId] = useState<string | null>(null);
  const [previewQuote, setPreviewQuote] = useState<typeof quotationEntries[0] | null>(null);

  const previewOverlay = previewQuote ? (
    <QuotationPreview quote={previewQuote} onClose={() => setPreviewQuote(null)} />
  ) : null;

  if (subModule === 'pitching') {
    return <PitchingModule />;
  }

  if (subModule === 'projects') {
    return <ProjectModule />;
  }

  if (subModule === 'items') {
    return <>{previewOverlay}<QuotationItemsManagement /></>;
  }

  if (subModule === 'clients') {
    return <>{previewOverlay}<CRMModule subModule="list" /></>;
  }

  if (subModule === 'client-projects') {
    return (
      <>{previewOverlay}
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">客戶項目</h1>
          <p className="text-[14px] text-muted-foreground mt-1">查看所有已成交的客戶項目及交付進度。</p>
        </div>
        <ClientProjectsList onPreviewQuote={(quote) => setPreviewQuote(quote)} />
      </div>
      </>
    );
  }

  if (subModule === 'new') {
    return (
      <>{previewOverlay}
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">新建報價單</h1>
          <p className="text-[14px] text-muted-foreground mt-1">建立新的報價單並提交批核。</p>
        </div>
        <NewQuotationWizard onClose={() => navigateTo('quotation', 'list')} />
      </div>
      </>
    );
  }

  if (subModule === 'approval') {
    return (
      <>{previewOverlay}
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">報價批核</h1>
          <p className="text-[14px] text-muted-foreground mt-1">審批待確認的報價單，查看 Cost Structure。</p>
        </div>
        <QuotationApproval onPreviewQuote={(quote) => setPreviewQuote(quote)} />
      </div>
      </>
    );
  }

  // Default: list
  return (
    <>{previewOverlay}
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">報價單列表</h1>
          <p className="text-[14px] text-muted-foreground mt-1">查看所有報價單及其狀態、金額與毛利率。</p>
        </div>
        <button onClick={() => navigateTo('quotation', 'new')}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]">
          <Plus size={14} />新建報價單
        </button>
      </div>
      <QuotationList onViewQuote={(id) => setViewingQuoteId(id)} onPreviewQuote={(quote) => setPreviewQuote(quote)} />
    </div>
    </>
  );
}
