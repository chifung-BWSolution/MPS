import { useState, useMemo } from 'react';
import {
  Check, Building2, UserCircle, FileText, ChevronRight, ArrowLeft, Home,
  Sparkles, AlertCircle, Search, Plus, X, CalendarDays, Clock, DollarSign,
  Phone, Mail, Globe, Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectType, ProjectPriority, BillingModel, BillingFrequency, ClientInfo, ServiceItem } from '@/types/app';
import { projectTypeLabels } from '@/data/mockData';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/context/AppContext';
import { useClientProjects } from '@/hooks/useClientProjects';

// Client tag presets
const clientTagPresets = [
  { id: 'famous', label: '知名品牌', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'vip', label: 'VIP客戶', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { id: 'long_term', label: '長期合作', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { id: 'gba_potential', label: '大灣區潛力客戶', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'first_time', label: '首次合作', color: 'bg-slate-100 text-slate-800 border-slate-300' },
  { id: 'referral', label: '轉介紹客戶', color: 'bg-pink-100 text-pink-800 border-pink-300' },
  { id: 'corporate', label: '企業客戶', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
];

// Client project type options (subset for client projects)
const clientProjectTypes: { value: ProjectType; label: string; icon: string }[] = [
  { value: 'web_design', label: '網站設計', icon: '🌐' },
  { value: 'system', label: '系統設計', icon: '⚙️' },
  { value: 'graphic_design', label: '平面設計', icon: '🎨' },
  { value: 'branding', label: '品牌設計', icon: '✨' },
  { value: 'video', label: '影片製作', icon: '🎬' },
  { value: 'seo_upgrade', label: 'SEO升級', icon: '📈' },
  { value: 'marketing', label: '行銷推廣', icon: '📢' },
  { value: 'event', label: '活動策劃', icon: '🎪' },
  { value: 'other', label: '其他', icon: '📋' },
];

const billingModelLabels: Record<BillingModel, string> = {
  one_time: '一次性服務',
  recurring: '持續收費',
};

const billingFrequencyLabels: Record<BillingFrequency, string> = {
  monthly: '每月',
  quarterly: '每季（3個月）',
  semi_annual: '每半年',
  annual: '每年',
};

const priorityConfig: Record<ProjectPriority, { label: string; color: string; dotColor: string }> = {
  low: { label: '低', color: 'bg-green-100 text-green-700', dotColor: 'bg-green-500' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700', dotColor: 'bg-blue-500' },
  high: { label: '高', color: 'bg-amber-100 text-amber-700', dotColor: 'bg-amber-500' },
  urgent: { label: '緊急', color: 'bg-rose-100 text-rose-700', dotColor: 'bg-rose-500' },
};

const pmOptions = [
  { id: 'cfb_leo',     name: 'Leo Tse',       role: 'management' },
  { id: 'manual_super_admin_lowell', name: 'Lowell Lo', role: 'management' },
  { id: 'cfb_bis',     name: 'Bis Sit',       role: 'management' },
  { id: 'cfb_yoko',    name: 'Yoko Cheung',   role: 'management' },
  { id: 'cfb_mandy',   name: 'Mandy Mau',     role: 'management' },
  { id: 'cfb_dynamic', name: 'Rebecca Cheng', role: 'management' },
  { id: 'cfb_ivan',    name: 'Ivan Leung',    role: 'management' },
  { id: 'cfb_m04',     name: 'Ada Ou',        role: 'management' },
  { id: 'cfb_m10',     name: 'Frederick Lin', role: 'project_manager' },
  { id: 'cfb_c02',     name: 'Mirana Chan',   role: 'designer' },
  { id: 'cfb_c01',     name: 'KK Zhou',       role: 'designer' },
  { id: 'cfb_v01',     name: 'Jasky Li',      role: 'video_editor' },
  { id: 'cfb_m01',     name: 'Silvia Liang',  role: 'staff' },
  { id: 'cfb_m02',     name: 'Jane Long',     role: 'staff' },
  { id: 'cfb_m03',     name: 'Kisa Cen',      role: 'staff' },
  { id: 'cfb_m05',     name: 'Michelle Chen', role: 'staff' },
];

interface ClientFormData {
  // Step 1: Company & Brand
  companyId: string;
  brandId: string;
  // Step 2: Client Info
  clientCompanyName: string;
  clientContactPerson: string;
  clientPrimaryPhone: string;
  clientCompanyPhone: string;
  clientEmail: string;
  clientWebsite: string;
  clientTags: string[];
  existingClientId: string;
  // Step 3: Project Details
  name: string;
  projectType: ProjectType;
  billingModel: BillingModel;
  billingFrequency: BillingFrequency;
  contractStartDate: string;
  contractDuration: string;
  description: string;
  startDate: string;
  endDate: string;
  budgetTotal: string;
  assignedPm: string;
  priority: ProjectPriority;
  estimatedHours: string;
  // Service Items & Delivery Schedule (combined)
  serviceItems: ServiceItem[];
}

const emptyForm: ClientFormData = {
  companyId: '',
  brandId: '',
  clientCompanyName: '',
  clientContactPerson: '',
  clientPrimaryPhone: '',
  clientCompanyPhone: '',
  clientEmail: '',
  clientWebsite: '',
  clientTags: [],
  existingClientId: '',
  name: '',
  projectType: 'web_design',
  billingModel: 'one_time',
  billingFrequency: 'monthly',
  contractStartDate: '',
  contractDuration: '12',
  description: '',
  startDate: '',
  endDate: '',
  budgetTotal: '',
  assignedPm: '',
  priority: 'medium',
  estimatedHours: '',
  serviceItems: [],
};

// Mock existing clients
const existingClients = [
  { id: 'cl1', companyName: '環球貿易公司', contactPerson: '王大明', phone: '+852 2345 1111', email: 'wang@global-trade.hk' },
  { id: 'cl2', companyName: '創新科技有限公司', contactPerson: '李思恩', phone: '+852 2345 2222', email: 'li@innovation-tech.hk' },
  { id: 'cl3', companyName: '美麗人生集團', contactPerson: '張美美', phone: '+852 2345 3333', email: 'zhang@beautifullife.hk' },
];

export function ProjectNewClientWizard({ onBack }: { onBack: () => void }) {
  const { navigateTo } = useApp();
  const { addProject } = useClientProjects();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ClientFormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [showQuotationPrompt, setShowQuotationPrompt] = useState(false);

  const steps = [
    { number: 1, label: '選擇公司與品牌', icon: Building2 },
    { number: 2, label: '客戶資料', icon: UserCircle },
    { number: 3, label: '項目詳情', icon: FileText },
  ];

  const selectedCompany = companies.find(c => c.id === formData.companyId);
  const availableBrands = brands.filter(b => b.companyId === formData.companyId && b.isActive);
  const selectedBrand = brands.find(b => b.id === formData.brandId);

  const filteredClients = useMemo(() => {
    if (!clientSearchQuery) return existingClients;
    const q = clientSearchQuery.toLowerCase();
    return existingClients.filter(c =>
      c.companyName.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q)
    );
  }, [clientSearchQuery]);

  const canNext = () => {
    if (currentStep === 1) return !!formData.companyId && !!formData.brandId;
    if (currentStep === 2) return !!formData.clientCompanyName && !!formData.clientContactPerson && !!formData.clientPrimaryPhone;
    return true;
  };

  const handleNext = () => {
    if (currentStep === 2) {
      const newErrors: Record<string, string> = {};
      if (!formData.clientCompanyName.trim()) newErrors.clientCompanyName = '請輸入客戶公司名稱';
      if (!formData.clientContactPerson.trim()) newErrors.clientContactPerson = '請輸入聯絡人姓名';
      if (!formData.clientPrimaryPhone.trim()) newErrors.clientPrimaryPhone = '請輸入主要電話';
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const validateFinalForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = '請輸入項目名稱';
    if (!formData.startDate) newErrors.startDate = '請選擇開始日期';
    if (!formData.projectType) newErrors.projectType = '請選擇服務類型';
    if (formData.billingModel === 'recurring' && !formData.contractStartDate) {
      newErrors.contractStartDate = '持續收費需填寫合約起始日期';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateFinalForm()) return;

    const newProject = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: formData.name,
      clientName: formData.clientCompanyName,
      companyId: formData.companyId,
      brandId: formData.brandId,
      projectType: formData.projectType,
      projectCategory: 'client' as const,
      status: 'planning' as const,
      progress: 0,
      assignedPm: formData.assignedPm,
      brand: selectedBrand?.brandCode,
      company: selectedCompany?.companyCode,
      budgetTotal: parseFloat(formData.budgetTotal) || 0,
      budgetUsed: 0,
      startDate: formData.startDate,
      endDate: formData.endDate || undefined,
      description: formData.description,
      priority: formData.priority,
      billingModel: formData.billingModel,
      billingFrequency: formData.billingModel === 'recurring' ? formData.billingFrequency : undefined,
      contractStartDate: formData.billingModel === 'recurring' ? formData.contractStartDate : undefined,
      contractDuration: formData.billingModel === 'recurring' ? parseInt(formData.contractDuration) : undefined,
      estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
      clientInfo: {
        companyName: formData.clientCompanyName,
        contactPerson: formData.clientContactPerson,
        primaryPhone: formData.clientPrimaryPhone,
        companyPhone: formData.clientCompanyPhone,
        email: formData.clientEmail,
        website: formData.clientWebsite,
        tags: formData.clientTags,
      },
      serviceItems: formData.serviceItems.length > 0 ? formData.serviceItems : undefined,
    };

    const error = await addProject(newProject);
    if (error) {
      setErrors({ submit: `儲存失敗：${(error as { message?: string })?.message ?? '未知錯誤'}` });
      return;
    }

    setSubmitted(true);
    setShowQuotationPrompt(true);
    setTimeout(() => {
      navigateTo('project', 'client');
    }, 2000);
  };

  const handleSelectExistingClient = (client: typeof existingClients[0]) => {
    setFormData({
      ...formData,
      clientCompanyName: client.companyName,
      clientContactPerson: client.contactPerson,
      clientPrimaryPhone: client.phone,
      clientEmail: client.email,
      existingClientId: client.id,
    });
    setShowClientSearch(false);
    setClientSearchQuery('');
  };

  const handleToggleTag = (tagId: string) => {
    setFormData({
      ...formData,
      clientTags: formData.clientTags.includes(tagId)
        ? formData.clientTags.filter(t => t !== tagId)
        : [...formData.clientTags, tagId],
    });
  };

  const handleAddCustomTag = () => {
    if (newTagInput.trim() && !formData.clientTags.includes(newTagInput.trim())) {
      setFormData({ ...formData, clientTags: [...formData.clientTags, newTagInput.trim()] });
      setNewTagInput('');
    }
  };

  const generateProjectName = () => {
    const shortName = formData.clientCompanyName.slice(0, 6);
    const typeLabel = clientProjectTypes.find(t => t.value === formData.projectType)?.label || '';
    return `${shortName} - ${typeLabel}`;
  };

  const generateDescription = () => {
    const typeLabel = clientProjectTypes.find(t => t.value === formData.projectType)?.label || '';
    const billingLabel = billingModelLabels[formData.billingModel];
    return `為「${formData.clientCompanyName}」提供${typeLabel}服務。\n收費模式：${billingLabel}${formData.billingModel === 'recurring' ? `（${billingFrequencyLabels[formData.billingFrequency]}）` : ''}。\n預計工時：${formData.estimatedHours || '待定'}小時。\n負責品牌：${selectedBrand?.brandNameZh || ''}（${selectedCompany?.companyNameZh || ''}）`;
  };

  const isFormValid = formData.name && formData.companyId && formData.brandId && formData.startDate && formData.clientCompanyName;

  // Success State with Quotation Prompt
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="w-16 h-16 rounded-full bg-teal-600 text-white flex items-center justify-center animate-in fade-in zoom-in duration-300">
          <Check size={32} />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-[20px] font-bold text-[#0d1a2d]">客戶項目已成功新增！</h2>
          <p className="text-[13px] text-muted-foreground">
            {selectedCompany?.companyCode} → {selectedBrand?.brandCode} → {formData.name}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Badge className="bg-teal-50 text-teal-700 border border-teal-200">
              {formData.billingModel === 'one_time' ? '一次性服務' : `持續收費 (${billingFrequencyLabels[formData.billingFrequency]})`}
            </Badge>
            <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
              客戶: {formData.clientCompanyName}
            </Badge>
          </div>
        </div>

        {showQuotationPrompt && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 max-w-md w-full">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <DollarSign size={16} className="text-amber-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-bold text-amber-800">是否立即建立報價單？</h4>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  系統將預填客戶資料、項目類型及收費模式
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-[12px] h-7"
                    onClick={() => navigateTo('quotation', 'new')}
                  >
                    建立報價單
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[12px] h-7 text-amber-700"
                    onClick={() => setShowQuotationPrompt(false)}
                  >
                    稍後再說
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[12px]"
            onClick={() => navigateTo('project', 'detail')}
          >
            <FileText size={13} />
            查看項目詳情
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[12px]"
            onClick={() => navigateTo('project', 'client')}
          >
            <ArrowLeft size={13} />
            返回客戶項目列表
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Actions Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('dashboard', 'overview')}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-teal-600 transition-colors bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-2.5 py-1.5"
          >
            <Home size={13} />
            Dashboard
          </button>
          <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-teal-600 transition-colors">
            <ArrowLeft size={13} />
            返回項目列表
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-[22px] font-bold tracking-tight text-[#0d1a2d]">新增客戶項目</h2>
          <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-[11px]">
            客戶專屬流程
          </Badge>
        </div>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          三步驟完成客戶項目建立：選擇公司與品牌 → 填寫客戶資料 → 設定項目詳情與收費模式
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-0 bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.number;
          const isCompleted = currentStep > step.number;
          return (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                  isCompleted ? 'bg-teal-600 text-white' : isActive ? 'bg-teal-600 text-white shadow-[0_0_0_4px_rgba(13,148,136,0.15)]' : 'bg-muted text-muted-foreground'
                )}>
                  {isCompleted ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <div>
                  <span className={cn('text-[12px] font-medium block', isActive || isCompleted ? 'text-[#0d1a2d]' : 'text-muted-foreground')}>
                    Step {step.number}
                  </span>
                  <span className={cn('text-[11px]', isActive || isCompleted ? 'text-teal-600 font-medium' : 'text-muted-foreground')}>
                    {step.label}
                  </span>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 mx-4">
                  <div className={cn('h-[2px] rounded-full transition-all duration-300', isCompleted ? 'bg-teal-600' : 'bg-muted')} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-6">
        {/* Step 1: Select Company & Brand */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-[16px] font-bold text-[#0d1a2d]">選擇公司與品牌</h3>
              <p className="text-[12px] text-muted-foreground mt-1">選擇承接此客戶項目的公司與品牌。報價單將以所選公司的名義發出。</p>
            </div>

            {/* Company Selection */}
            <div className="space-y-3">
              <Label className="text-[13px] font-medium">
                所屬公司 <span className="text-rose-500">*</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {companies.filter(c => c.isActive).map(company => (
                  <button
                    key={company.id}
                    onClick={() => setFormData({ ...formData, companyId: company.id, brandId: '' })}
                    className={cn(
                      'text-left p-4 rounded-md border-2 transition-all duration-200 group',
                      formData.companyId === company.id
                        ? 'border-teal-600 bg-teal-50/50 shadow-[0_0_0_1px_rgba(13,148,136,0.1)]'
                        : 'border-border hover:border-teal-300 hover:bg-muted/30'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-teal-600 text-white flex items-center justify-center font-bold text-[12px]">
                        {company.companyCode}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[14px] font-bold text-[#0d1a2d] truncate">{company.companyNameZh}</h4>
                        <span className="text-[11px] text-muted-foreground">{company.companyNameEn}</span>
                      </div>
                      {formData.companyId === company.id && (
                        <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0">
                          <Check size={14} />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>BR: {company.brNo}</span>
                      <span>|</span>
                      <span>{company.bankName}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Brand Selection (only show if company selected) */}
            {formData.companyId && (
              <div className="space-y-3 pt-2 border-t border-dashed border-muted">
                <Label className="text-[13px] font-medium">
                  選擇品牌 <span className="text-rose-500">*</span>
                  <span className="text-[11px] text-muted-foreground font-normal ml-2">
                    公司: {selectedCompany?.companyCode} - {selectedCompany?.companyNameZh}
                  </span>
                </Label>
                {availableBrands.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-2">
                      <AlertCircle size={18} />
                    </div>
                    <p className="text-muted-foreground text-[12px]">此公司尚未建立任何品牌</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {availableBrands.map(brand => (
                      <button
                        key={brand.id}
                        onClick={() => setFormData({ ...formData, brandId: brand.id })}
                        className={cn(
                          'text-left p-3 rounded-md border-2 transition-all duration-200',
                          formData.brandId === brand.id
                            ? 'border-teal-600 bg-teal-50/50'
                            : 'border-border hover:border-teal-300'
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-[10px]" style={{ backgroundColor: brand.primaryColor }}>
                            {brand.brandCode}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[12px] font-bold text-[#0d1a2d]">{brand.brandNameZh}</h4>
                            <span className="text-[10px] text-muted-foreground">{brand.brandNameEn}</span>
                          </div>
                          {formData.brandId === brand.id && (
                            <Check size={14} className="text-teal-600 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Client Info */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-bold text-[#0d1a2d]">客戶資料</h3>
                <p className="text-[12px] text-muted-foreground mt-1">
                  填寫客戶公司資料，或從現有客戶中選擇
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-[12px] h-8"
                onClick={() => setShowClientSearch(!showClientSearch)}
              >
                <Search size={13} />
                從現有客戶選擇
              </Button>
            </div>

            {/* Existing Client Search Panel */}
            {showClientSearch && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      placeholder="搜尋客戶公司名稱或聯絡人..."
                      className="pl-8 h-8 text-[12px]"
                    />
                  </div>
                  <button onClick={() => setShowClientSearch(false)} className="text-muted-foreground hover:text-rose-500">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto">
                  {filteredClients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => handleSelectExistingClient(client)}
                      className="w-full text-left p-2.5 rounded border border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition-all text-[12px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#0d1a2d]">{client.companyName}</span>
                        <span className="text-muted-foreground">{client.contactPerson}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{client.phone} | {client.email}</div>
                    </button>
                  ))}
                  {filteredClients.length === 0 && (
                    <p className="text-center text-[12px] text-muted-foreground py-4">找不到相關客戶</p>
                  )}
                </div>
              </div>
            )}

            {/* Client Company Name */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">
                客戶公司名稱 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.clientCompanyName}
                onChange={(e) => {
                  setFormData({ ...formData, clientCompanyName: e.target.value });
                  if (errors.clientCompanyName) setErrors({ ...errors, clientCompanyName: '' });
                }}
                placeholder="例如：環球貿易有限公司"
                className={cn('text-[13px]', errors.clientCompanyName && 'border-rose-400')}
              />
              {errors.clientCompanyName && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.clientCompanyName}</p>}
            </div>

            {/* Contact Person & Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <UserCircle size={12} className="inline mr-1" />
                  聯絡人姓名 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={formData.clientContactPerson}
                  onChange={(e) => {
                    setFormData({ ...formData, clientContactPerson: e.target.value });
                    if (errors.clientContactPerson) setErrors({ ...errors, clientContactPerson: '' });
                  }}
                  placeholder="例如：王大明"
                  className={cn('text-[13px]', errors.clientContactPerson && 'border-rose-400')}
                />
                {errors.clientContactPerson && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.clientContactPerson}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <Phone size={12} className="inline mr-1" />
                  主要聯絡電話 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={formData.clientPrimaryPhone}
                  onChange={(e) => {
                    setFormData({ ...formData, clientPrimaryPhone: e.target.value });
                    if (errors.clientPrimaryPhone) setErrors({ ...errors, clientPrimaryPhone: '' });
                  }}
                  placeholder="例如：+852 9123 4567"
                  className={cn('text-[13px]', errors.clientPrimaryPhone && 'border-rose-400')}
                />
                {errors.clientPrimaryPhone && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.clientPrimaryPhone}</p>}
              </div>
            </div>

            {/* Company Phone & Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <Phone size={12} className="inline mr-1" />
                  公司電話
                </Label>
                <Input
                  value={formData.clientCompanyPhone}
                  onChange={(e) => setFormData({ ...formData, clientCompanyPhone: e.target.value })}
                  placeholder="例如：+852 2345 6789"
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <Mail size={12} className="inline mr-1" />
                  電郵地址
                </Label>
                <Input
                  value={formData.clientEmail}
                  onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                  placeholder="例如：info@company.com"
                  type="email"
                  className="text-[13px]"
                />
              </div>
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">
                <Globe size={12} className="inline mr-1" />
                公司網頁
              </Label>
              <Input
                value={formData.clientWebsite}
                onChange={(e) => setFormData({ ...formData, clientWebsite: e.target.value })}
                placeholder="例如：https://www.company.com"
                className="text-[13px]"
              />
            </div>

            {/* Client Tags */}
            <div className="space-y-3">
              <Label className="text-[13px] font-medium">
                <Tag size={12} className="inline mr-1" />
                客戶標籤
              </Label>
              <div className="flex flex-wrap gap-2">
                {clientTagPresets.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleToggleTag(tag.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150',
                      formData.clientTags.includes(tag.id)
                        ? `${tag.color} ring-1 ring-offset-1`
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    )}
                  >
                    {formData.clientTags.includes(tag.id) && <Check size={10} className="inline mr-1" />}
                    {tag.label}
                  </button>
                ))}
              </div>
              {/* Custom tag input */}
              <div className="flex items-center gap-2">
                <Input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="新增自訂標籤..."
                  className="text-[12px] h-7 w-[200px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={handleAddCustomTag}
                  disabled={!newTagInput.trim()}
                >
                  <Plus size={12} />
                </Button>
              </div>
              {/* Display custom tags */}
              {formData.clientTags.filter(t => !clientTagPresets.find(p => p.id === t)).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formData.clientTags
                    .filter(t => !clientTagPresets.find(p => p.id === t))
                    .map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1">
                        {tag}
                        <button onClick={() => setFormData({ ...formData, clientTags: formData.clientTags.filter(t => t !== tag) })}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Project Details */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[16px] font-bold text-[#0d1a2d]">項目詳情與收費模式</h3>
              <div className="mt-2 flex items-center gap-2 bg-teal-50/80 border border-teal-200 rounded-md px-3 py-2">
                <Sparkles size={14} className="text-teal-600 flex-shrink-0" />
                <p className="text-[12px] text-teal-700">
                  客戶：<span className="font-bold">{formData.clientCompanyName}</span>
                  &nbsp;|&nbsp;公司：<span className="font-bold">{selectedCompany?.companyCode}</span>
                  &nbsp;→&nbsp;品牌：<span className="font-bold" style={{ color: selectedBrand?.primaryColor }}>{selectedBrand?.brandCode}</span>
                </p>
              </div>
            </div>

            {/* Project Name */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-medium">
                  項目名稱 <span className="text-rose-500">*</span>
                </Label>
                <button
                  onClick={() => setFormData({ ...formData, name: generateProjectName() })}
                  className="text-[11px] text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  <Sparkles size={10} />
                  自動建議名稱
                </button>
              </div>
              <Input
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                placeholder="例如：環球貿易 - 網站設計"
                className={cn('text-[13px]', errors.name && 'border-rose-400')}
              />
              {errors.name && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.name}</p>}
            </div>

            {/* Service Type (Project Type) */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">
                服務類型 <span className="text-rose-500">*</span>
              </Label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {clientProjectTypes.map(type => (
                  <button
                    key={type.value}
                    onClick={() => setFormData({ ...formData, projectType: type.value })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-md border-2 transition-all duration-150 text-center',
                      formData.projectType === type.value
                        ? 'border-teal-600 bg-teal-50/50'
                        : 'border-border hover:border-teal-300'
                    )}
                  >
                    <span className="text-[18px]">{type.icon}</span>
                    <span className="text-[11px] font-medium text-[#0d1a2d]">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* Combined: 服務類型及數量 + 交付時間表 */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="space-y-3 bg-white rounded-md p-4 border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-bold flex items-center gap-1.5">
                  <FileText size={14} className="text-teal-600" />
                  服務項目及交付時間表
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-[11px] h-7"
                  onClick={() => {
                    const newItem: ServiceItem = {
                      id: `si_${Date.now()}`,
                      serviceType: formData.projectType,
                      quantity: 1,
                      unit: '項',
                      deliveryDate: formData.endDate || '',
                      notes: '',
                    };
                    setFormData({ ...formData, serviceItems: [...formData.serviceItems, newItem] });
                  }}
                >
                  <Plus size={12} />
                  新增服務項目
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                設定各項服務的數量與預計交付日期。此資料將同步顯示在「客戶項目列表」中。
              </p>

              {formData.serviceItems.length > 0 ? (
                <div className="overflow-x-auto border border-border rounded-md">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">#</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">服務類型</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">數量</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">單位</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">預計交付日期</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">備註</th>
                        <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-2.5">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.serviceItems.map((item, idx) => (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                          <td className="px-3 py-2 text-[12px] text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={item.serviceType}
                              onValueChange={(val) => {
                                const updated = [...formData.serviceItems];
                                updated[idx] = { ...updated[idx], serviceType: val as ProjectType };
                                setFormData({ ...formData, serviceItems: updated });
                              }}
                            >
                              <SelectTrigger className="h-7 text-[11px] w-[130px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {clientProjectTypes.map(t => (
                                  <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...formData.serviceItems];
                                updated[idx] = { ...updated[idx], quantity: parseInt(e.target.value) || 1 };
                                setFormData({ ...formData, serviceItems: updated });
                              }}
                              className="h-7 text-[11px] w-[60px]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={item.unit}
                              onValueChange={(val) => {
                                const updated = [...formData.serviceItems];
                                updated[idx] = { ...updated[idx], unit: val };
                                setFormData({ ...formData, serviceItems: updated });
                              }}
                            >
                              <SelectTrigger className="h-7 text-[11px] w-[70px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="項">項</SelectItem>
                                <SelectItem value="頁">頁</SelectItem>
                                <SelectItem value="條">條</SelectItem>
                                <SelectItem value="套">套</SelectItem>
                                <SelectItem value="個">個</SelectItem>
                                <SelectItem value="月">月</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="date"
                              value={item.deliveryDate}
                              onChange={(e) => {
                                const updated = [...formData.serviceItems];
                                updated[idx] = { ...updated[idx], deliveryDate: e.target.value };
                                setFormData({ ...formData, serviceItems: updated });
                              }}
                              className="h-7 text-[11px] w-[130px]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={item.notes || ''}
                              onChange={(e) => {
                                const updated = [...formData.serviceItems];
                                updated[idx] = { ...updated[idx], notes: e.target.value };
                                setFormData({ ...formData, serviceItems: updated });
                              }}
                              placeholder="備註..."
                              className="h-7 text-[11px] w-[100px]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => {
                                const updated = formData.serviceItems.filter((_, i) => i !== idx);
                                setFormData({ ...formData, serviceItems: updated });
                              }}
                              className="p-1 hover:bg-rose-50 rounded text-rose-500 transition-colors"
                              title="移除"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 bg-muted/20 rounded-md border border-dashed border-border">
                  <FileText size={20} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-[12px] text-muted-foreground">尚未新增服務項目</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">點擊「新增服務項目」來設定各項服務的數量與交付時間</p>
                </div>
              )}

              {formData.serviceItems.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">
                    共 {formData.serviceItems.length} 項服務，合計數量 {formData.serviceItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                  {formData.serviceItems.some(item => item.deliveryDate) && (
                    <span className="text-[11px] text-muted-foreground">
                      最後交付：{formData.serviceItems
                        .filter(item => item.deliveryDate)
                        .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))[0]?.deliveryDate || '-'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Billing Model - Key New Section */}
            <div className="space-y-3 bg-slate-50 rounded-md p-4 border border-slate-200">
              <Label className="text-[13px] font-bold flex items-center gap-1.5">
                <DollarSign size={14} className="text-teal-600" />
                收費模式 <span className="text-rose-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormData({ ...formData, billingModel: 'one_time' })}
                  className={cn(
                    'p-4 rounded-md border-2 text-left transition-all duration-150',
                    formData.billingModel === 'one_time'
                      ? 'border-teal-600 bg-white shadow-sm'
                      : 'border-slate-200 bg-white hover:border-teal-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      formData.billingModel === 'one_time' ? 'border-teal-600' : 'border-slate-300'
                    )}>
                      {formData.billingModel === 'one_time' && <div className="w-2 h-2 rounded-full bg-teal-600" />}
                    </div>
                    <span className="text-[13px] font-medium">一次性服務</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 ml-6">One-time Payment · 項目完成後一次收費</p>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, billingModel: 'recurring' })}
                  className={cn(
                    'p-4 rounded-md border-2 text-left transition-all duration-150',
                    formData.billingModel === 'recurring'
                      ? 'border-teal-600 bg-white shadow-sm'
                      : 'border-slate-200 bg-white hover:border-teal-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      formData.billingModel === 'recurring' ? 'border-teal-600' : 'border-slate-300'
                    )}>
                      {formData.billingModel === 'recurring' && <div className="w-2 h-2 rounded-full bg-teal-600" />}
                    </div>
                    <span className="text-[13px] font-medium">持續收費</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 ml-6">Recurring Subscription · 定期收費服務</p>
                </button>
              </div>

              {/* Recurring billing details */}
              {formData.billingModel === 'recurring' && (
                <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-medium">收費頻率</Label>
                      <Select value={formData.billingFrequency} onValueChange={(val) => setFormData({ ...formData, billingFrequency: val as BillingFrequency })}>
                        <SelectTrigger className="text-[12px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(billingFrequencyLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-medium">
                        合約起始日期 <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        value={formData.contractStartDate}
                        onChange={(e) => {
                          setFormData({ ...formData, contractStartDate: e.target.value });
                          if (errors.contractStartDate) setErrors({ ...errors, contractStartDate: '' });
                        }}
                        type="date"
                        className={cn('text-[12px] h-8', errors.contractStartDate && 'border-rose-400')}
                      />
                      {errors.contractStartDate && <p className="text-[10px] text-rose-500">{errors.contractStartDate}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-medium">合約期限（月數）</Label>
                      <Select value={formData.contractDuration} onValueChange={(val) => setFormData({ ...formData, contractDuration: val })}>
                        <SelectTrigger className="text-[12px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3">3 個月</SelectItem>
                          <SelectItem value="6">6 個月</SelectItem>
                          <SelectItem value="12">12 個月</SelectItem>
                          <SelectItem value="18">18 個月</SelectItem>
                          <SelectItem value="24">24 個月</SelectItem>
                          <SelectItem value="36">36 個月</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Priority, Budget & Hours */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">優先級</Label>
                <Select value={formData.priority} onValueChange={(val) => setFormData({ ...formData, priority: val as ProjectPriority })}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div className={cn('w-2 h-2 rounded-full', cfg.dotColor)} />
                          {cfg.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">預算總額 (HKD)</Label>
                <Input
                  value={formData.budgetTotal}
                  onChange={(e) => setFormData({ ...formData, budgetTotal: e.target.value })}
                  placeholder="例如 45000"
                  type="number"
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <Clock size={12} className="inline mr-1" />
                  預計工時（小時）
                </Label>
                <Input
                  value={formData.estimatedHours}
                  onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                  placeholder="例如 80"
                  type="number"
                  className="text-[13px]"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <CalendarDays size={12} className="inline mr-1" />
                  開始日期 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={formData.startDate}
                  onChange={(e) => {
                    setFormData({ ...formData, startDate: e.target.value });
                    if (errors.startDate) setErrors({ ...errors, startDate: '' });
                  }}
                  type="date"
                  className={cn('text-[13px]', errors.startDate && 'border-rose-400')}
                />
                {errors.startDate && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.startDate}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  <CalendarDays size={12} className="inline mr-1" />
                  結束日期
                </Label>
                <Input
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  type="date"
                  className="text-[13px]"
                />
              </div>
            </div>

            {/* Assigned PM */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">負責項目經理</Label>
              <Select value={formData.assignedPm} onValueChange={(val) => setFormData({ ...formData, assignedPm: val })}>
                <SelectTrigger className="text-[13px]"><SelectValue placeholder="選擇負責人" /></SelectTrigger>
                <SelectContent>
                  {pmOptions.map(pm => (
                    <SelectItem key={pm.id} value={pm.name}>
                      <div className="flex items-center gap-2">
                        <span>{pm.name}</span>
                        <span className="text-[10px] text-muted-foreground">({pm.role === 'management' ? '管理層' : '項目經理'})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-medium">項目描述</Label>
                <button
                  onClick={() => setFormData({ ...formData, description: generateDescription() })}
                  className="text-[11px] text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  <Sparkles size={10} />
                  AI 一鍵生成描述
                </button>
              </div>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="項目說明、目標、備注..."
                rows={4}
                className="text-[13px] resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <div>
          {currentStep > 1 && (
            <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1.5 text-[13px]">
              <ArrowLeft size={14} />
              上一步
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-[13px] text-muted-foreground">
            取消
          </Button>
          {currentStep < 3 ? (
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-[13px] transition-all duration-200 active:scale-[0.97]"
              onClick={handleNext}
              disabled={!canNext()}
            >
              下一步
              <ChevronRight size={14} />
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-[13px] transition-all duration-200 active:scale-[0.97]"
              onClick={handleSubmit}
              disabled={!isFormValid}
            >
              <Check size={14} />
              確認新增客戶項目
            </Button>
          )}
        </div>
      </div>
      {errors.submit && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-300 rounded-md">
          <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-rose-700">{errors.submit}</p>
        </div>
      )}
    </div>
  );
}
