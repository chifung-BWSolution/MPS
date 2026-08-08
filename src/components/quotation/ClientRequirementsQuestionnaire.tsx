import { useState } from 'react';
import { Copy, Check, ClipboardList, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import {
  type ClientRequirementsForm,
  emptyClientRequirementsForm,
  PROJECT_GOAL_OPTIONS,
  CURRENT_PROBLEM_OPTIONS,
  SITE_TYPE_OPTIONS,
  STATIC_DESIGN_OPTIONS,
  STATIC_CONTENT_OPTIONS,
  ECOMMERCE_PRODUCT_OPTIONS,
  ECOMMERCE_MEMBER_OPTIONS,
  ECOMMERCE_PAYMENT_OPTIONS,
  ECOMMERCE_MARKETING_OPTIONS,
  COMMON_FEATURE_OPTIONS,
  LANGUAGE_OPTIONS,
  MATERIAL_OPTIONS,
  BRAND_GUIDELINE_OPTIONS,
  STYLE_OPTIONS,
  MAINTENANCE_OPTIONS,
  MAINTENANCE_TIER_OPTIONS,
  MARKETING_OPTIONS,
  BUDGET_OPTIONS,
  TIMELINE_OPTIONS,
  validateClientRequirementsForm,
  generateClientRequirementsSummary,
} from '@/data/clientRequirementsQuestionnaire';

type Props = {
  initialForm?: Partial<ClientRequirementsForm>;
  onSummaryGenerated?: (summary: string) => void;
};

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <h4 className="text-[15px] font-bold text-slate-800 border-l-4 border-blue-600 pl-3">{title}</h4>
      {subtitle && <p className="text-[12px] text-slate-500 mt-2 mb-4 pl-3">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      <div className="pl-0 sm:pl-1">{children}</div>
    </section>
  );
}

function FieldLabel({ required, children }: { required?: boolean; children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-medium text-slate-600 block mb-1.5">
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

function CheckboxGroup({
  options,
  value,
  onChange,
  otherValue,
  onOtherChange,
  otherLabel = '其他',
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  otherLabel?: string;
}) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <label
            key={opt}
            className={cn(
              'flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors',
              value.includes(opt)
                ? 'border-blue-300 bg-blue-50/70'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50',
            )}
          >
            <input
              type="checkbox"
              checked={value.includes(opt)}
              onChange={() => toggle(opt)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[13px] text-slate-700 leading-snug">{opt}</span>
          </label>
        ))}
      </div>
      {value.includes(otherLabel) && onOtherChange && (
        <Input
          value={otherValue || ''}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder={`請說明「${otherLabel}」…`}
          className="h-9 text-[13px] mt-1"
        />
      )}
    </div>
  );
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
  otherValue,
  onOtherChange,
  otherOptionValue,
}: {
  name: string;
  options: { value: string; label: string }[] | string[];
  value: string;
  onChange: (v: string) => void;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  otherOptionValue?: string;
}) {
  const normalized = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2">
        {normalized.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              'flex items-start gap-2.5 p-3 rounded-md border cursor-pointer transition-colors',
              value === opt.value
                ? 'border-blue-300 bg-blue-50/70'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50',
            )}
          >
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 w-4 h-4 border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[13px] text-slate-700 leading-snug">{opt.label}</span>
          </label>
        ))}
      </div>
      {otherOptionValue && value === otherOptionValue && onOtherChange && (
        <Input
          value={otherValue || ''}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="請說明「其他」…"
          className="h-9 text-[13px] mt-1"
        />
      )}
    </div>
  );
}

export function ClientRequirementsQuestionnaire({ initialForm, onSummaryGenerated }: Props) {
  const { systemUser, userInfo } = useAuth();
  const defaultPmName = systemUser?.display_name || userInfo?.display_name || '';

  const [form, setForm] = useState<ClientRequirementsForm>(() => ({
    ...emptyClientRequirementsForm(),
    filledBy: defaultPmName,
    ...initialForm,
  }));
  const [summary, setSummary] = useState('');
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const patch = (updates: Partial<ClientRequirementsForm>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    setErrors([]);
  };

  const showStatic = form.siteType === 'static' || form.siteType === 'hybrid';
  const showEcommerce = form.siteType === 'ecommerce' || form.siteType === 'hybrid';
  const showCustom = form.siteType === 'custom';
  const showCurrentProblems = Boolean(form.existingWebsite.trim());
  const showMaintenanceTier = form.maintenanceServices.includes('分級方案：基本／標準／進階');

  const handleGenerate = () => {
    const validationErrors = validateClientRequirementsForm(form);
    if (validationErrors.length) {
      setErrors(validationErrors);
      toast.error(validationErrors[0]);
      return;
    }
    const text = generateClientRequirementsSummary(form);
    setSummary(text);
    onSummaryGenerated?.(text);
    toast.success('客戶需求清單已產生');
  };

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast.success('已複製到剪貼簿');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('複製失敗，請手動選取文字');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-slate-50 px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-slate-800">客戶需求記錄表（內部使用）</h3>
            <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
              供項目經理／報價員在與客戶初步溝通後填寫，完整記錄客戶需求，方便後續製作報價單。
            </p>
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
          {errors.map((err) => (
            <p key={err} className="text-[12px] text-rose-700">{err}</p>
          ))}
        </div>
      )}

      <SectionCard title="頂部資訊">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>填寫人（項目經理姓名）</FieldLabel>
            <Input value={form.filledBy} onChange={(e) => patch({ filledBy: e.target.value })} className="h-9 text-[13px]" placeholder="項目經理姓名" />
          </div>
          <div>
            <FieldLabel required>填寫日期</FieldLabel>
            <Input type="date" value={form.filledDate} onChange={(e) => patch({ filledDate: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <FieldLabel required>客戶公司／品牌名稱</FieldLabel>
            <Input value={form.companyName} onChange={(e) => patch({ companyName: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <FieldLabel required>客戶聯絡人</FieldLabel>
            <Input value={form.contactName} onChange={(e) => patch({ contactName: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <FieldLabel required>客戶電話／WhatsApp</FieldLabel>
            <Input value={form.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <FieldLabel required>客戶電郵</FieldLabel>
            <Input type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <FieldLabel>現有網站網址</FieldLabel>
            <Input value={form.existingWebsite} onChange={(e) => patch({ existingWebsite: e.target.value })} placeholder="https://…（選填）" className="h-9 text-[13px]" />
          </div>
          <div>
            <FieldLabel>現有網上商城網址</FieldLabel>
            <Input value={form.existingEcommerceUrl} onChange={(e) => patch({ existingEcommerceUrl: e.target.value })} placeholder="https://…（選填）" className="h-9 text-[13px]" />
          </div>
        </div>
        <div className="mt-4">
          <FieldLabel required>客戶主要業務簡述</FieldLabel>
          <textarea
            value={form.businessSummary}
            onChange={(e) => patch({ businessSummary: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            placeholder="記錄客戶業務、產品／服務、目標客群等重點…"
          />
        </div>
      </SectionCard>

      <SectionCard title="第一階段：專案性質與現有狀況">
        <div className="space-y-5">
          <div>
            <FieldLabel required>1. 專案主要目標（可多選）</FieldLabel>
            <CheckboxGroup
              options={PROJECT_GOAL_OPTIONS}
              value={form.projectGoals}
              onChange={(projectGoals) => patch({ projectGoals })}
              otherValue={form.projectGoalsOther}
              onOtherChange={(projectGoalsOther) => patch({ projectGoalsOther })}
            />
          </div>
          {showCurrentProblems && (
            <div>
              <FieldLabel>2. 現有網站主要問題（可多選）</FieldLabel>
              <p className="text-[11px] text-slate-500 mb-2">已填寫現有網站網址，請記錄客戶反映的主要問題</p>
              <CheckboxGroup
                options={CURRENT_PROBLEM_OPTIONS}
                value={form.currentProblems}
                onChange={(currentProblems) => patch({ currentProblems })}
                otherValue={form.currentProblemsOther}
                onOtherChange={(currentProblemsOther) => patch({ currentProblemsOther })}
              />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="第二階段：網站類型" subtitle="客戶需要的網站類型（核心分流，單選）">
        <RadioGroup
          name="siteType"
          options={SITE_TYPE_OPTIONS}
          value={form.siteType}
          onChange={(siteType) => patch({ siteType: siteType as ClientRequirementsForm['siteType'] })}
          otherValue={form.siteTypeOther}
          onOtherChange={(siteTypeOther) => patch({ siteTypeOther })}
          otherOptionValue="other"
        />
      </SectionCard>

      {form.siteType && (
        <SectionCard title="第三階段：功能需求" subtitle="根據網站類型動態顯示對應功能區塊">
          <div className="space-y-6">
            {showStatic && (
              <div className="space-y-4 p-4 rounded-md bg-slate-50 border border-slate-200/80">
                <h5 className="text-[13px] font-bold text-blue-700">A. Static Site 功能</h5>
                <div>
                  <FieldLabel>設計與體驗（可多選）</FieldLabel>
                  <CheckboxGroup options={STATIC_DESIGN_OPTIONS} value={form.staticDesign} onChange={(staticDesign) => patch({ staticDesign })} />
                </div>
                <div>
                  <FieldLabel>內容與行銷（可多選）</FieldLabel>
                  <CheckboxGroup
                    options={STATIC_CONTENT_OPTIONS}
                    value={form.staticContent}
                    onChange={(staticContent) => patch({ staticContent })}
                    otherValue={form.staticContentOther}
                    onOtherChange={(staticContentOther) => patch({ staticContentOther })}
                  />
                </div>
              </div>
            )}

            {showEcommerce && (
              <div className="space-y-4 p-4 rounded-md bg-slate-50 border border-slate-200/80">
                <h5 className="text-[13px] font-bold text-blue-700">B. Ecommerce 功能</h5>
                <div>
                  <FieldLabel>產品管理（可多選）</FieldLabel>
                  <CheckboxGroup options={ECOMMERCE_PRODUCT_OPTIONS} value={form.ecommerceProduct} onChange={(ecommerceProduct) => patch({ ecommerceProduct })} />
                </div>
                <div>
                  <FieldLabel>會員與客戶（可多選）</FieldLabel>
                  <CheckboxGroup options={ECOMMERCE_MEMBER_OPTIONS} value={form.ecommerceMember} onChange={(ecommerceMember) => patch({ ecommerceMember })} />
                </div>
                <div>
                  <FieldLabel>金流與物流（可多選）</FieldLabel>
                  <CheckboxGroup options={ECOMMERCE_PAYMENT_OPTIONS} value={form.ecommercePayment} onChange={(ecommercePayment) => patch({ ecommercePayment })} />
                </div>
                <div>
                  <FieldLabel>行銷與促銷（可多選）</FieldLabel>
                  <CheckboxGroup
                    options={ECOMMERCE_MARKETING_OPTIONS}
                    value={form.ecommerceMarketing}
                    onChange={(ecommerceMarketing) => patch({ ecommerceMarketing })}
                    otherValue={form.ecommerceMarketingOther}
                    onOtherChange={(ecommerceMarketingOther) => patch({ ecommerceMarketingOther })}
                  />
                </div>
              </div>
            )}

            {showCustom && (
              <div className="p-4 rounded-md bg-slate-50 border border-slate-200/80">
                <h5 className="text-[13px] font-bold text-blue-700 mb-3">C. 客製化 Web System</h5>
                <FieldLabel>記錄客戶需要的業務流程與核心功能</FieldLabel>
                <textarea
                  value={form.customSystemDescription}
                  onChange={(e) => patch({ customSystemDescription: e.target.value })}
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                  placeholder="例如：會員登入、預約系統、後台報表、API 整合、審批流程…"
                />
              </div>
            )}

            <div>
              <FieldLabel>共通功能（所有類型，可多選）</FieldLabel>
              <CheckboxGroup
                options={COMMON_FEATURE_OPTIONS}
                value={form.commonFeatures}
                onChange={(commonFeatures) => patch({ commonFeatures })}
                otherValue={form.commonFeaturesOther}
                onOtherChange={(commonFeaturesOther) => patch({ commonFeaturesOther })}
              />
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title="第四階段：語系、素材與設計">
        <div className="space-y-5">
          <div>
            <FieldLabel required>1. 語言支援（單選）</FieldLabel>
            <RadioGroup
              name="languageSupport"
              options={LANGUAGE_OPTIONS}
              value={form.languageSupport}
              onChange={(languageSupport) => patch({ languageSupport })}
              otherValue={form.languageSupportOther}
              onOtherChange={(languageSupportOther) => patch({ languageSupportOther })}
              otherOptionValue="其他／多國語言"
            />
            <div className="mt-3">
              <FieldLabel required>需要語言切換按鈕？</FieldLabel>
              <RadioGroup
                name="languageSwitcher"
                options={[
                  { value: 'yes', label: '是' },
                  { value: 'no', label: '否' },
                ]}
                value={form.languageSwitcher}
                onChange={(languageSwitcher) => patch({ languageSwitcher: languageSwitcher as 'yes' | 'no' })}
              />
            </div>
          </div>
          <div>
            <FieldLabel required>2. 素材狀態（單選）</FieldLabel>
            <RadioGroup
              name="materialStatus"
              options={MATERIAL_OPTIONS}
              value={form.materialStatus}
              onChange={(materialStatus) => patch({ materialStatus })}
              otherValue={form.materialStatusOther}
              onOtherChange={(materialStatusOther) => patch({ materialStatusOther })}
              otherOptionValue="其他"
            />
          </div>
          <div>
            <FieldLabel required>3. 品牌指引（單選）</FieldLabel>
            <RadioGroup
              name="brandGuidelines"
              options={BRAND_GUIDELINE_OPTIONS}
              value={form.brandGuidelines}
              onChange={(brandGuidelines) => patch({ brandGuidelines })}
              otherValue={form.brandGuidelinesOther}
              onOtherChange={(brandGuidelinesOther) => patch({ brandGuidelinesOther })}
              otherOptionValue="其他"
            />
          </div>
          <div>
            <FieldLabel>4. 希望風格（可多選）</FieldLabel>
            <CheckboxGroup
              options={STYLE_OPTIONS}
              value={form.stylePreferences}
              onChange={(stylePreferences) => patch({ stylePreferences })}
              otherValue={form.styleOther}
              onOtherChange={(styleOther) => patch({ styleOther })}
            />
            <div className="mt-3">
              <FieldLabel>客戶提供的參考網站網址</FieldLabel>
              <Input
                value={form.referenceUrls}
                onChange={(e) => patch({ referenceUrls: e.target.value })}
                placeholder="可填寫多個網址，以逗號或換行分隔"
                className="h-9 text-[13px]"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="第五階段：維護、推廣、預算、時程">
        <div className="space-y-5">
          <div>
            <FieldLabel>1. 全年維護服務（可多選）</FieldLabel>
            <CheckboxGroup
              options={MAINTENANCE_OPTIONS}
              value={form.maintenanceServices}
              onChange={(maintenanceServices) => patch({ maintenanceServices })}
            />
            {showMaintenanceTier && (
              <div className="mt-3 pl-1">
                <FieldLabel>分級方案級別</FieldLabel>
                <div className="flex flex-wrap gap-2 mt-1">
                  {MAINTENANCE_TIER_OPTIONS.map((tier) => (
                    <label
                      key={tier}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-[13px] cursor-pointer transition-colors',
                        form.maintenanceTier === tier
                          ? 'border-blue-400 bg-blue-50 text-blue-800 font-medium'
                          : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <input
                        type="radio"
                        name="maintenanceTier"
                        checked={form.maintenanceTier === tier}
                        onChange={() => patch({ maintenanceTier: tier })}
                        className="sr-only"
                      />
                      {tier}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <FieldLabel>2. 網上推廣服務（可多選）</FieldLabel>
            <CheckboxGroup
              options={MARKETING_OPTIONS}
              value={form.marketingServices}
              onChange={(marketingServices) => patch({ marketingServices })}
              otherValue={form.marketingServicesOther}
              onOtherChange={(marketingServicesOther) => patch({ marketingServicesOther })}
            />
          </div>
          <div>
            <FieldLabel required>3. 客戶預算範圍（單選）</FieldLabel>
            <RadioGroup name="budgetRange" options={BUDGET_OPTIONS} value={form.budgetRange} onChange={(budgetRange) => patch({ budgetRange })} />
          </div>
          <div>
            <FieldLabel required>4. 客戶希望上線時間（單選）</FieldLabel>
            <RadioGroup name="launchTimeline" options={TIMELINE_OPTIONS} value={form.launchTimeline} onChange={(launchTimeline) => patch({ launchTimeline })} />
          </div>
          <div>
            <FieldLabel>5. 其他備註／特別要求</FieldLabel>
            <textarea
              value={form.additionalNotes}
              onChange={(e) => patch({ additionalNotes: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              placeholder="記錄客戶額外提到的細節、限制、或重要對話重點…"
            />
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleGenerate}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg text-[14px] font-semibold hover:bg-blue-700 shadow-sm transition-colors"
        >
          <ClipboardList size={16} />
          產生客戶需求清單
        </button>
      </div>

      {summary && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h4 className="text-[14px] font-bold text-slate-800">已產生的客戶需求清單</h4>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border border-blue-300 text-blue-700 bg-white rounded-md hover:bg-blue-50 transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已複製' : '一鍵複製'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700 font-mono bg-white border border-slate-200 rounded-md p-4 max-h-[480px] overflow-y-auto">
            {summary}
          </pre>
        </div>
      )}
    </div>
  );
}
