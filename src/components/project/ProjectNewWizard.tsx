import { useState, useMemo } from 'react';
import { Check, Tags, FileText, ChevronRight, ArrowLeft, Home, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectType, ProjectCategory, ProjectPriority } from '@/types/app';
import { projectTypeLabels } from '@/data/mockData';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApp } from '@/context/AppContext';
import { useCompanyProjects } from '@/hooks/useCompanyProjects';
import { useClientProjects } from '@/hooks/useClientProjects';

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

interface ProjectFormData {
  companyId: string;
  brandId: string;
  name: string;
  clientName: string;
  projectType: ProjectType;
  projectCategory: ProjectCategory;
  priority: ProjectPriority;
  startDate: string;
  endDate: string;
  budgetTotal: string;
  assignedPm: string;
  description: string;
}

const emptyForm: ProjectFormData = {
  companyId: '',
  brandId: '',
  name: '',
  clientName: '',
  projectType: 'web_design',
  projectCategory: 'internal',
  priority: 'medium',
  startDate: '',
  endDate: '',
  budgetTotal: '',
  assignedPm: '',
  description: '',
};

export function ProjectNewWizard({ onBack }: { onBack: () => void }) {
  const { navigateTo } = useApp();
  const { addProject: addCompanyProject, projects: companyProjects } = useCompanyProjects();
  const { addProject: addClientProject } = useClientProjects();
  const { companies } = useCompanies();
  const { brands } = useBrands();

  const getActiveProjectCount = (brandCode: string) =>
    companyProjects.filter(p => {
      const b = brands.find(br => br.id === p.brandId);
      return b?.brandCode === brandCode && p.status === 'active';
    }).length;
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProjectFormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const steps = [
    { number: 1, label: '所屬品牌', icon: Tags },
    { number: 2, label: '項目資料', icon: FileText },
  ];

  // Dedupe brands by brand_code so each brand_code only appears once.
  const dedupedBrands = useMemo(() => {
    const map = new Map<string, typeof brands[number]>();
    brands.filter(b => b.isActive).forEach(b => {
      if (!map.has(b.brandCode)) map.set(b.brandCode, b);
    });
    return Array.from(map.values());
  }, [brands]);

  const selectedCompany = companies.find(c => c.id === formData.companyId);
  const selectedBrand = brands.find(b => b.id === formData.brandId);

  const canNext = () => {
    if (currentStep === 1) return !!formData.brandId && !!formData.companyId;
    return true;
  };

  const handleNext = () => {
    if (currentStep < 2) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = '請輸入項目名稱';
    if (!formData.startDate) newErrors.startDate = '請選擇開始日期';
    if (formData.projectCategory === 'client' && !formData.clientName.trim()) {
      newErrors.clientName = '客戶項目須填寫客戶名稱';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const selectedBrandData = brands.find(b => b.id === formData.brandId);
    const selectedCompanyData = companies.find(c => c.id === formData.companyId);
    const newProject = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: formData.name,
      clientName: formData.clientName || undefined,
      companyId: formData.companyId,
      brandId: formData.brandId,
      projectType: formData.projectType,
      projectCategory: formData.projectCategory,
      status: 'planning' as const,
      progress: 0,
      assignedPm: formData.assignedPm || undefined,
      brand: selectedBrandData?.brandCode || '',
      company: selectedCompanyData?.companyCode || '',
      budgetTotal: parseFloat(formData.budgetTotal) || 0,
      budgetUsed: 0,
      startDate: formData.startDate,
      endDate: formData.endDate || undefined,
      description: formData.description || undefined,
      priority: formData.priority,
    };

    const error = formData.projectCategory === 'client'
      ? await addClientProject(newProject)
      : await addCompanyProject(newProject);

    if (error) {
      setErrors({ submit: `儲存失敗：${(error as { message?: string })?.message ?? '未知錯誤'}` });
      return;
    }

    setSubmitted(true);
    setTimeout(() => {
      navigateTo('project', formData.projectCategory === 'client' ? 'client' : 'internal');
    }, 1500);
  };

  const isFormValid = formData.name && formData.companyId && formData.brandId && formData.startDate;

  // Success State
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-full bg-teal-600 text-white flex items-center justify-center animate-in fade-in zoom-in duration-300">
          <Check size={32} />
        </div>
        <h2 className="text-[20px] font-bold text-[#0d1a2d]">項目已成功新增！</h2>
        <p className="text-[13px] text-muted-foreground">
          {selectedBrand?.brandCode} → {formData.name}
        </p>
        <p className="text-[12px] text-muted-foreground">正在跳轉至項目列表...</p>
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
        <h2 className="text-[22px] font-bold tracking-tight text-[#0d1a2d]">新增內部項目</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          按照兩步驟完成項目新增：選擇所屬品牌 → 填寫項目資料
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
        {/* Step 1: Select Brand */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[16px] font-bold text-[#0d1a2d]">所屬品牌</h3>
              <p className="text-[12px] text-muted-foreground mt-1">所有項目必須歸屬一個品牌，請選擇此項目的所屬品牌。</p>
            </div>
            {dedupedBrands.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle size={20} />
                </div>
                <p className="text-muted-foreground text-[13px] font-medium">尚未建立任何品牌</p>
                <p className="text-muted-foreground text-[12px] mt-1">請先前往品牌管理新增品牌。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {dedupedBrands.map(brand => {
                  const company = companies.find(c => c.id === brand.companyId);
                  const companyName = company?.companyNameZh || company?.companyNameEn || '—';
                  const isSelected = formData.brandId === brand.id;
                  return (
                    <button
                      key={brand.id}
                      onClick={() => setFormData({ ...formData, brandId: brand.id, companyId: brand.companyId })}
                      className={cn(
                        'text-left p-4 rounded-md border-2 transition-all duration-200',
                        isSelected
                          ? 'border-teal-600 bg-teal-50/50 shadow-[0_0_0_1px_rgba(13,148,136,0.1)]'
                          : 'border-border hover:border-teal-300 hover:bg-muted/30'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
                          style={{ backgroundColor: brand.primaryColor }}
                        >
                          {brand.brandCode}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[14px] font-bold text-[#0d1a2d] truncate">{brand.brandCode}</h4>
                          <p className="text-[11px] text-muted-foreground/80 font-light truncate">所屬公司 : {companyName}</p>
                        </div>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center flex-shrink-0">
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px]">
                        {brand.industry && (
                          <span className="text-muted-foreground">{brand.industry}</span>
                        )}
                        <span className="text-blue-600 font-medium ml-auto">
                          {getActiveProjectCount(brand.brandCode)} 個活躍項目
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Project Details */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[16px] font-bold text-[#0d1a2d]">填寫項目資料</h3>
              <div className="mt-2 flex items-center gap-2 bg-teal-50/80 border border-teal-200 rounded-md px-3 py-2">
                <Sparkles size={14} className="text-teal-600 flex-shrink-0" />
                <p className="text-[12px] text-teal-700">
                  所屬品牌：<span className="font-bold" style={{ color: selectedBrand?.primaryColor }}>{selectedBrand?.brandCode}</span>
                  &nbsp;|&nbsp;所屬公司：<span className="font-bold">{selectedCompany?.companyNameZh || selectedCompany?.companyNameEn}</span>
                </p>
              </div>
            </div>

            {/* Project Name */}
            <div className="space-y-2">
              <Label className="text-[13px] font-medium">
                項目名稱 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (errors.name) setErrors({ ...errors, name: '' });
                }}
                placeholder="輸入項目名稱"
                className={cn('text-[13px]', errors.name && 'border-rose-400 focus:ring-rose-400')}
              />
              {errors.name && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.name}</p>}
            </div>

            {/* Type & Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">項目類型</Label>
                <Select value={formData.projectType} onValueChange={(val) => setFormData({ ...formData, projectType: val as ProjectType })}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(projectTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">項目類別</Label>
                <Select value={formData.projectCategory} onValueChange={(val) => setFormData({ ...formData, projectCategory: val as ProjectCategory })}>
                  <SelectTrigger className="text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">內部發展</SelectItem>
                    <SelectItem value="client">客戶項目</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Client Name (conditional) */}
            {formData.projectCategory === 'client' && (
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  客戶名稱 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={formData.clientName}
                  onChange={(e) => {
                    setFormData({ ...formData, clientName: e.target.value });
                    if (errors.clientName) setErrors({ ...errors, clientName: '' });
                  }}
                  placeholder="輸入客戶名稱"
                  className={cn('text-[13px]', errors.clientName && 'border-rose-400 focus:ring-rose-400')}
                />
                {errors.clientName && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.clientName}</p>}
              </div>
            )}

            {/* Priority & Budget */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">
                  開始日期 <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={formData.startDate}
                  onChange={(e) => {
                    setFormData({ ...formData, startDate: e.target.value });
                    if (errors.startDate) setErrors({ ...errors, startDate: '' });
                  }}
                  type="date"
                  className={cn('text-[13px]', errors.startDate && 'border-rose-400 focus:ring-rose-400')}
                />
                {errors.startDate && <p className="text-[11px] text-rose-500 flex items-center gap-1"><AlertCircle size={11} />{errors.startDate}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">結束日期</Label>
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
              <Label className="text-[13px] font-medium">負責 PM</Label>
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
              <Label className="text-[13px] font-medium">描述</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="項目說明、目標、備注..."
                rows={3}
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
          {currentStep < 2 ? (
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
              確認新增內部項目
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
