import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, FileText, RotateCcw, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitArtistApplyV2 } from '@/lib/artist-apply-api';
import { SignaturePad } from './SignaturePad';

type Choice = { value: string; label: string };

interface FormState {
  applicationNo: string;
  applicationDate: string;
  nameZh: string;
  nameEn: string;
  displayName: string;
  gender: string;
  birthDate: string;
  age: string;
  idLastFour: string;
  nationality: string;
  residence: string;
  residenceOther: string;
  phone: string;
  whatsapp: string;
  email: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;

  categories: string[];
  categoryOther: string;

  height: string;
  weight: string;
  shoeSize: string;
  clothingSize: string;
  hairColor: string;
  languages: string[];
  languageOther: string;
  languageFluency: string;
  readScriptAbility: string;
  adlibAbility: string;
  outdoorShooting: string;
  studioShooting: string;
  liveStreaming: string;
  travelAvailability: string[];
  earlyNightShift: string;
  weekendHolidayWork: string;
  licenseOrQualification: string;
  specialTalents: string;

  instagramAccount: string;
  instagramFollowers: string;
  xiaohongshuAccount: string;
  xiaohongshuFollowers: string;
  youtubeAccount: string;
  youtubeFollowers: string;
  facebookAccount: string;
  facebookFollowers: string;
  tiktokAccount: string;
  tiktokFollowers: string;
  otherPlatform: string;
  writeContentAbility: string;
  shootEditAbility: string;
  liveCommerceExperience: string;
  liveCommerceDetails: string;
  portfolioLinks: string;

  signedCompanyBefore: string;
  contractStatus: string;
  agencyCompanyName: string;
  contractPeriod: string;
  needAgencyConsent: string;
  previousBrands: string;
  shootingTypes: string[];
  representativeWorks: string;
  pricingModes: string[];
  priceRangeFrom: string;
  priceRangeTo: string;
  reimbursableExpenses: string;

  imagePositioning: string[];
  developmentFocus: string;
  unacceptableJobs: string;
  dreamBrands: string;
  companySupportDirections: string[];
  companySupportOther: string;

  submittedFiles: string[];
  otherFileNote: string;
  uploadedFileNames: string[];

  applicantSignature: string;
  applicantSignDate: string;
  guardianName: string;
  guardianSignature: string;
  guardianSignDate: string;
}

interface TalentApplicationFormV2Props {
  mode?: 'draft' | 'submit' | 'view';
  inviteToken?: string;
  initialValue?: Partial<FormState>;
}

const initialState: FormState = {
  applicationNo: '',
  applicationDate: '',
  nameZh: '',
  nameEn: '',
  displayName: '',
  gender: '',
  birthDate: '',
  age: '',
  idLastFour: '',
  nationality: '',
  residence: '',
  residenceOther: '',
  phone: '',
  whatsapp: '',
  email: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyPhone: '',
  categories: [],
  categoryOther: '',
  height: '',
  weight: '',
  shoeSize: '',
  clothingSize: '',
  hairColor: '',
  languages: [],
  languageOther: '',
  languageFluency: '',
  readScriptAbility: '',
  adlibAbility: '',
  outdoorShooting: '',
  studioShooting: '',
  liveStreaming: '',
  travelAvailability: [],
  earlyNightShift: '',
  weekendHolidayWork: '',
  licenseOrQualification: '',
  specialTalents: '',
  instagramAccount: '',
  instagramFollowers: '',
  xiaohongshuAccount: '',
  xiaohongshuFollowers: '',
  youtubeAccount: '',
  youtubeFollowers: '',
  facebookAccount: '',
  facebookFollowers: '',
  tiktokAccount: '',
  tiktokFollowers: '',
  otherPlatform: '',
  writeContentAbility: '',
  shootEditAbility: '',
  liveCommerceExperience: '',
  liveCommerceDetails: '',
  portfolioLinks: '',
  signedCompanyBefore: '',
  contractStatus: '',
  agencyCompanyName: '',
  contractPeriod: '',
  needAgencyConsent: '',
  previousBrands: '',
  shootingTypes: [],
  representativeWorks: '',
  pricingModes: [],
  priceRangeFrom: '',
  priceRangeTo: '',
  reimbursableExpenses: '',
  imagePositioning: [],
  developmentFocus: '',
  unacceptableJobs: '',
  dreamBrands: '',
  companySupportDirections: [],
  companySupportOther: '',
  submittedFiles: [],
  otherFileNote: '',
  uploadedFileNames: [],
  applicantSignature: '',
  applicantSignDate: '',
  guardianName: '',
  guardianSignature: '',
  guardianSignDate: '',
};

const categoryOptions: Choice[] = [
  { value: 'print_model', label: '平面拍攝模特兒' },
  { value: 'event_model', label: '活動模特兒' },
  { value: 'kol', label: '社交媒體 / KOL / 自媒體創作者' },
  { value: 'mc', label: '主持人 / 司儀 / 活動 MC' },
  { value: 'vo', label: '旁白 / VO / 配音' },
  { value: 'live_artist', label: '直播藝人' },
  { value: 'actor', label: '演員（短片 / 廣告 / 微電影）' },
  { value: 'lifestyle', label: '旅遊 / 生活方式博主' },
  { value: 'commerce_live', label: '產品介紹 / 帶貨直播' },
  { value: 'planning', label: '文案 / 企劃能力' },
  { value: 'self_shoot', label: '可自行拍攝影片' },
  { value: 'other', label: '其他' },
];

const languageOptions: Choice[] = [
  { value: 'cantonese', label: '粵語' },
  { value: 'mandarin', label: '普通話' },
  { value: 'english', label: '英語' },
  { value: 'other', label: '其他' },
];

const abilityOptions: Choice[] = [
  { value: 'yes', label: '可以' },
  { value: 'normal', label: '一般' },
  { value: 'training', label: '需訓練' },
];

const yesLimitNoOptions: Choice[] = [
  { value: 'yes', label: '可以' },
  { value: 'limited', label: '有限制' },
  { value: 'no', label: '不可以' },
];

const shootingTypeOptions: Choice[] = [
  { value: 'advertising', label: '廣告' },
  { value: 'social_video', label: '社交短片' },
  { value: 'event', label: '活動' },
  { value: 'live', label: '直播' },
  { value: 'print', label: '平面' },
  { value: 'education', label: '教育' },
  { value: 'corporate', label: '企業宣傳' },
  { value: 'other', label: '其他' },
];

const positioningOptions: Choice[] = [
  { value: 'mature', label: '成熟' },
  { value: 'friendly', label: '親和' },
  { value: 'professional', label: '專業' },
  { value: 'intellectual', label: '知性' },
  { value: 'fashion', label: '時尚' },
  { value: 'energetic', label: '活力' },
  { value: 'cute', label: '可愛' },
  { value: 'premium', label: '高級感' },
  { value: 'funny', label: '搞笑' },
  { value: 'travel', label: '旅行感' },
  { value: 'live_commerce', label: '直播帶貨型' },
  { value: 'other', label: '其他' },
];

const fileOptions: Choice[] = [
  { value: 'headshot', label: '正面個人近照（Headshot）' },
  { value: 'full_body', label: '全身照' },
  { value: 'lifestyle', label: '生活照 / 形象照' },
  { value: 'intro_video', label: '自我介紹影片' },
  { value: 'portfolio', label: '過往作品 Reel / VO sample' },
  { value: 'identity', label: '身份證明文件副本（按需要）' },
  { value: 'address', label: '居住地址證明（按需要）' },
  { value: 'other', label: '其他補充文件' },
];

const formSteps = [
  {
    title: '基本資料與申請方向',
    description: '填寫身份、聯絡方式，以及希望發展的藝人方向。',
  },
  {
    title: '外形資質與內容能力',
    description: '補充外形條件、語言能力、拍攝限制與社交媒體能力。',
  },
  {
    title: '經驗紀錄與發展規劃',
    description: '整理過往合作經驗、收費方式和未來發展定位。',
  },
  {
    title: '文件上傳與聲明簽署',
    description: '提交附件清單並完成申請人聲明及簽署。',
  },
];

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[13px] font-semibold text-[#0d1a2d]">
      {children}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-muted/40"
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder = '請選擇',
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Choice[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-muted/40"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-muted/40"
      />
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  columns = 'md:grid-cols-3',
  disabled,
}: {
  label: string;
  options: Choice[];
  value: string[];
  onChange: (value: string[]) => void;
  columns?: string;
  disabled?: boolean;
}) {
  const toggle = (nextValue: string) => {
    if (disabled) return;
    onChange(value.includes(nextValue) ? value.filter((item) => item !== nextValue) : [...value, nextValue]);
  };

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className={cn('grid grid-cols-1 gap-2', columns)}>
        {options.map((option) => {
          const checked = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(option.value)}
              className={cn(
                'flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-left text-[13px] transition-all',
                checked
                  ? 'border-teal-500 bg-teal-50 text-teal-800'
                  : 'border-border bg-white text-[#0d1a2d] hover:border-teal-300 hover:bg-teal-50/30',
                disabled && 'cursor-not-allowed opacity-70'
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  checked ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-transparent'
                )}
              >
                <Check size={11} strokeWidth={3} />
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RadioGroup({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: Choice[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? '' : option.value)}
              className={cn(
                'rounded-md border px-3 py-2 text-[13px] transition-all',
                selected
                  ? 'border-teal-500 bg-teal-50 text-teal-800'
                  : 'border-border bg-white text-[#0d1a2d] hover:border-teal-300 hover:bg-teal-50/30',
                disabled && 'cursor-not-allowed opacity-70'
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-[0_2px_8px_rgba(0,20,40,0.04)]">
      <div className="border-b border-border/70 px-5 py-4">
        <h3 className="text-[15px] font-bold text-[#0d1a2d]">{title}</h3>
        {hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

export function TalentApplicationFormV2({
  mode = 'draft',
  inviteToken,
  initialValue,
}: TalentApplicationFormV2Props = {}) {
  const readOnly = mode === 'view';
  const [form, setForm] = useState<FormState>(() => ({ ...initialState, ...(initialValue ?? {}) }));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = formSteps.length;
  const currentStepMeta = formSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const progressPercent = Math.round(((currentStep + 1) / totalSteps) * 100);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleString('zh-HK'));
  };

  const handleReset = () => {
    if (confirm('確定要重設表格內容嗎？')) {
      setForm({ ...initialState, ...(initialValue ?? {}) });
      setSavedAt(null);
      setSubmitError(null);
      setCurrentStep(0);
    }
  };

  const goPrevious = () => {
    setCurrentStep((step) => Math.max(0, step - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    setCurrentStep((step) => Math.min(totalSteps - 1, step + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitArtistApplyV2(form, inviteToken);
      setSubmittedAt(new Date().toLocaleString('zh-HK'));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '遞交失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedAt && mode === 'submit') {
    return (
      <div className="mx-auto w-full max-w-[920px] rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-8 py-12 text-center shadow-[0_2px_8px_rgba(0,20,40,0.04)]">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <Check size={28} strokeWidth={3} />
        </div>
        <h3 className="mb-1 text-[16px] font-bold text-[#0d1a2d]">已成功遞交表格</h3>
        <p className="text-[12.5px] text-muted-foreground">
          感謝您的填寫！我們將盡快與您聯絡。<br />
          遞交時間：{submittedAt}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-5">
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-6 py-5 text-center shadow-[0_2px_8px_rgba(0,20,40,0.04)]">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
          <FileText size={20} />
        </div>
        <h2 className="text-[18px] font-bold text-[#0d1a2d]">
          志豐設計（深圳）有限公司 — Model 面試登記表
        </h2>
        <p className="mt-2 text-[12px] text-muted-foreground">
          請按分區完整填寫資料，方便招募、面試、試鏡、工作配對及客戶推薦。
        </p>
      </div>

      <div className="rounded-lg border border-teal-100 bg-teal-50/70 px-5 py-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-teal-700">
              {readOnly ? '完整表格' : `第 ${currentStep + 1} / ${totalSteps} 頁`}
            </p>
            <h3 className="mt-1 text-[16px] font-bold text-[#0d1a2d]">
              {readOnly ? '已遞交完整資料' : currentStepMeta.title}
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {readOnly ? '以下為藝人已遞交的全部 4 頁申請內容。' : currentStepMeta.description}
            </p>
          </div>
          <div className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-teal-700 shadow-sm">
            進度 {readOnly ? 100 : progressPercent}%
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-teal-600 transition-all duration-300" style={{ width: `${readOnly ? 100 : progressPercent}%` }} />
        </div>
      </div>

      {(readOnly || currentStep === 0) && (
        <>
          <SectionCard title="A1. 基本資料">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput label="申請編號" value={form.applicationNo} onChange={(value) => update('applicationNo', value)} placeholder="例如：APP-0001" disabled={readOnly} />
          <TextInput label="申請日期" type="date" value={form.applicationDate} onChange={(value) => update('applicationDate', value)} disabled={readOnly} />
          <TextInput label="中文姓名" required value={form.nameZh} onChange={(value) => update('nameZh', value)} placeholder="請輸入中文姓名" disabled={readOnly} />
          <TextInput label="英文姓名（與身份證明文件相同）" value={form.nameEn} onChange={(value) => update('nameEn', value)} placeholder="請輸入英文姓名" disabled={readOnly} />
          <TextInput label="藝名 / 顯示名稱" value={form.displayName} onChange={(value) => update('displayName', value)} placeholder="請輸入藝名或顯示名稱" disabled={readOnly} />
          <SelectInput label="性別" value={form.gender} onChange={(value) => update('gender', value)} options={[{ value: 'female', label: '女' }, { value: 'male', label: '男' }, { value: 'other', label: '其他' }]} disabled={readOnly} />
          <TextInput label="出生日期" type="date" value={form.birthDate} onChange={(value) => update('birthDate', value)} disabled={readOnly} />
          <TextInput label="年齡" value={form.age} onChange={(value) => update('age', value)} placeholder="例如：25" disabled={readOnly} />
          <TextInput label="香港身份證 / 護照號碼（後四位）" value={form.idLastFour} onChange={(value) => update('idLastFour', value)} placeholder="後四位即可作初審" disabled={readOnly} />
          <TextInput label="國籍 / 地區" value={form.nationality} onChange={(value) => update('nationality', value)} placeholder="例如：香港" disabled={readOnly} />
          <SelectInput label="居住地" value={form.residence} onChange={(value) => update('residence', value)} options={[{ value: 'hk', label: '香港' }, { value: 'sz', label: '深圳' }, { value: 'china_other', label: '內地其他城市' }, { value: 'overseas', label: '海外' }, { value: 'other', label: '其他' }]} disabled={readOnly} />
          <TextInput label="其他居住地" value={form.residenceOther} onChange={(value) => update('residenceOther', value)} placeholder="如選其他，請補充" disabled={readOnly} />
          <TextInput label="聯絡電話" required value={form.phone} onChange={(value) => update('phone', value)} placeholder="請輸入聯絡電話" disabled={readOnly} />
          <TextInput label="WhatsApp / 微信" value={form.whatsapp} onChange={(value) => update('whatsapp', value)} placeholder="請輸入 WhatsApp 或微信" disabled={readOnly} />
          <TextInput label="電郵" type="email" value={form.email} onChange={(value) => update('email', value)} placeholder="name@example.com" disabled={readOnly} />
          <TextInput label="緊急聯絡人姓名" value={form.emergencyName} onChange={(value) => update('emergencyName', value)} disabled={readOnly} />
          <TextInput label="緊急聯絡人關係" value={form.emergencyRelation} onChange={(value) => update('emergencyRelation', value)} disabled={readOnly} />
          <TextInput label="緊急聯絡人電話" value={form.emergencyPhone} onChange={(value) => update('emergencyPhone', value)} disabled={readOnly} />
        </div>
      </SectionCard>

      <SectionCard title="A2. 申請類別與可發展方向" hint="請在適用項目打勾，可多選。">
        <CheckboxGroup label="申請類別" options={categoryOptions} value={form.categories} onChange={(value) => update('categories', value)} disabled={readOnly} />
        <TextInput label="其他類別" value={form.categoryOther} onChange={(value) => update('categoryOther', value)} placeholder="如選其他，請補充" disabled={readOnly} />
      </SectionCard>
        </>
      )}

      {(readOnly || currentStep === 1) && (
        <>
          <SectionCard title="A3. 外形及資質資料">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TextInput label="身高（cm）" value={form.height} onChange={(value) => update('height', value)} placeholder="例如：168" disabled={readOnly} />
          <TextInput label="體重（kg）" value={form.weight} onChange={(value) => update('weight', value)} placeholder="例如：50" disabled={readOnly} />
          <TextInput label="鞋碼" value={form.shoeSize} onChange={(value) => update('shoeSize', value)} placeholder="例如：38" disabled={readOnly} />
          <TextInput label="衣服尺碼" value={form.clothingSize} onChange={(value) => update('clothingSize', value)} placeholder="例如：M" disabled={readOnly} />
          <TextInput label="髮色" value={form.hairColor} onChange={(value) => update('hairColor', value)} placeholder="例如：黑色" disabled={readOnly} />
          <TextInput label="語言流利程度" value={form.languageFluency} onChange={(value) => update('languageFluency', value)} placeholder="可逐項填寫" disabled={readOnly} />
        </div>
        <CheckboxGroup label="語言" options={languageOptions} value={form.languages} onChange={(value) => update('languages', value)} columns="md:grid-cols-4" disabled={readOnly} />
        <TextInput label="其他語言" value={form.languageOther} onChange={(value) => update('languageOther', value)} placeholder="如選其他，請補充" disabled={readOnly} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RadioGroup label="可否閱讀稿件流暢表達" options={abilityOptions} value={form.readScriptAbility} onChange={(value) => update('readScriptAbility', value)} disabled={readOnly} />
          <RadioGroup label="可否即場說談" options={abilityOptions} value={form.adlibAbility} onChange={(value) => update('adlibAbility', value)} disabled={readOnly} />
          <RadioGroup label="可否戶外拍攝" options={yesLimitNoOptions} value={form.outdoorShooting} onChange={(value) => update('outdoorShooting', value)} disabled={readOnly} />
          <RadioGroup label="可否室內棚拍" options={yesLimitNoOptions} value={form.studioShooting} onChange={(value) => update('studioShooting', value)} disabled={readOnly} />
          <RadioGroup label="可否直播" options={yesLimitNoOptions} value={form.liveStreaming} onChange={(value) => update('liveStreaming', value)} disabled={readOnly} />
          <RadioGroup label="可否接受早班 / 夜班" options={[{ value: 'yes', label: '可以' }, { value: 'no', label: '不可以' }]} value={form.earlyNightShift} onChange={(value) => update('earlyNightShift', value)} disabled={readOnly} />
          <RadioGroup label="可否接受週末 / 公眾假期工作" options={[{ value: 'yes', label: '可以' }, { value: 'no', label: '不可以' }]} value={form.weekendHolidayWork} onChange={(value) => update('weekendHolidayWork', value)} disabled={readOnly} />
        </div>
        <CheckboxGroup label="可否出差" options={[{ value: 'hk', label: '香港本地' }, { value: 'gba', label: '大灣區' }, { value: 'china', label: '內地' }, { value: 'overseas', label: '海外' }]} value={form.travelAvailability} onChange={(value) => update('travelAvailability', value)} columns="md:grid-cols-4" disabled={readOnly} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput label="駕照 / 其他專業資格" value={form.licenseOrQualification} onChange={(value) => update('licenseOrQualification', value)} disabled={readOnly} />
          <TextInput label="其他特長" value={form.specialTalents} onChange={(value) => update('specialTalents', value)} placeholder="跳舞、唱歌、運動、化妝、語音、樂器等" disabled={readOnly} />
        </div>
      </SectionCard>

      <SectionCard title="A4. 社交媒體及內容能力">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput label="Instagram 帳號" value={form.instagramAccount} onChange={(value) => update('instagramAccount', value)} disabled={readOnly} />
          <TextInput label="Instagram 追蹤人數" value={form.instagramFollowers} onChange={(value) => update('instagramFollowers', value)} disabled={readOnly} />
          <TextInput label="小紅書帳號" value={form.xiaohongshuAccount} onChange={(value) => update('xiaohongshuAccount', value)} disabled={readOnly} />
          <TextInput label="小紅書追蹤人數" value={form.xiaohongshuFollowers} onChange={(value) => update('xiaohongshuFollowers', value)} disabled={readOnly} />
          <TextInput label="YouTube 帳號" value={form.youtubeAccount} onChange={(value) => update('youtubeAccount', value)} disabled={readOnly} />
          <TextInput label="YouTube 訂閱人數" value={form.youtubeFollowers} onChange={(value) => update('youtubeFollowers', value)} disabled={readOnly} />
          <TextInput label="Facebook 帳號" value={form.facebookAccount} onChange={(value) => update('facebookAccount', value)} disabled={readOnly} />
          <TextInput label="Facebook 追蹤人數" value={form.facebookFollowers} onChange={(value) => update('facebookFollowers', value)} disabled={readOnly} />
          <TextInput label="TikTok / 抖音帳號" value={form.tiktokAccount} onChange={(value) => update('tiktokAccount', value)} disabled={readOnly} />
          <TextInput label="TikTok / 抖音追蹤人數" value={form.tiktokFollowers} onChange={(value) => update('tiktokFollowers', value)} disabled={readOnly} />
          <TextInput label="其他平台" value={form.otherPlatform} onChange={(value) => update('otherPlatform', value)} disabled={readOnly} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RadioGroup label="是否可自行撰寫貼文 / 稿件" options={[{ value: 'yes', label: '可以' }, { value: 'normal', label: '一般' }, { value: 'no', label: '不可以' }]} value={form.writeContentAbility} onChange={(value) => update('writeContentAbility', value)} disabled={readOnly} />
          <RadioGroup label="是否可自行拍攝及剪輯內容" options={[{ value: 'yes', label: '可以' }, { value: 'normal', label: '一般' }, { value: 'no', label: '不可以' }]} value={form.shootEditAbility} onChange={(value) => update('shootEditAbility', value)} disabled={readOnly} />
          <RadioGroup label="是否有直播帶貨經驗" options={[{ value: 'yes', label: '有' }, { value: 'no', label: '無' }]} value={form.liveCommerceExperience} onChange={(value) => update('liveCommerceExperience', value)} disabled={readOnly} />
          <TextInput label="直播帶貨平台及品牌" value={form.liveCommerceDetails} onChange={(value) => update('liveCommerceDetails', value)} placeholder="如有，請列明" disabled={readOnly} />
        </div>
        <TextArea label="過往作品連結" value={form.portfolioLinks} onChange={(value) => update('portfolioLinks', value)} placeholder="影片 / Reel / 主持片段 / VO sample，可每行一個連結" rows={4} disabled={readOnly} />
      </SectionCard>
        </>
      )}

      {(readOnly || currentStep === 2) && (
        <>
          <SectionCard title="A5. 工作經驗及代表紀錄">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RadioGroup label="是否曾簽約於其他公司 / 經紀" options={[{ value: 'yes', label: '是' }, { value: 'no', label: '否' }]} value={form.signedCompanyBefore} onChange={(value) => update('signedCompanyBefore', value)} disabled={readOnly} />
          <SelectInput label="現時合約狀態" value={form.contractStatus} onChange={(value) => update('contractStatus', value)} options={[{ value: 'exclusive', label: '獨家' }, { value: 'non_exclusive', label: '非獨家' }, { value: 'ended', label: '已完結' }]} disabled={readOnly} />
          <TextInput label="公司名稱" value={form.agencyCompanyName} onChange={(value) => update('agencyCompanyName', value)} disabled={readOnly} />
          <TextInput label="合約期" value={form.contractPeriod} onChange={(value) => update('contractPeriod', value)} disabled={readOnly} />
          <RadioGroup label="是否需要先取得原公司書面同意" options={[{ value: 'yes', label: '是' }, { value: 'no', label: '否' }]} value={form.needAgencyConsent} onChange={(value) => update('needAgencyConsent', value)} disabled={readOnly} />
          <TextInput label="過往合作品牌 / 客戶" value={form.previousBrands} onChange={(value) => update('previousBrands', value)} disabled={readOnly} />
        </div>
        <CheckboxGroup label="過往拍攝類型" options={shootingTypeOptions} value={form.shootingTypes} onChange={(value) => update('shootingTypes', value)} disabled={readOnly} />
        <TextArea label="代表作或具成效項目" value={form.representativeWorks} onChange={(value) => update('representativeWorks', value)} rows={3} disabled={readOnly} />
        <CheckboxGroup label="收費模式" options={[{ value: 'hourly', label: '時薪' }, { value: 'daily', label: '日薪' }, { value: 'half_day', label: '半日' }, { value: 'monthly', label: '月費' }, { value: 'project', label: '按項目' }]} value={form.pricingModes} onChange={(value) => update('pricingModes', value)} columns="md:grid-cols-5" disabled={readOnly} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TextInput label="基本報價範圍（HKD 起）" value={form.priceRangeFrom} onChange={(value) => update('priceRangeFrom', value)} placeholder="例如：1000" disabled={readOnly} />
          <TextInput label="基本報價範圍（HKD 至）" value={form.priceRangeTo} onChange={(value) => update('priceRangeTo', value)} placeholder="例如：3000" disabled={readOnly} />
          <TextInput label="代墊費用要求" value={form.reimbursableExpenses} onChange={(value) => update('reimbursableExpenses', value)} placeholder="交通 / 化妝 / 服裝 / 餐飲 / 住宿" disabled={readOnly} />
        </div>
      </SectionCard>

      <SectionCard title="A6. 個人定位與未來發展">
        <CheckboxGroup label="個人形象定位" options={positioningOptions} value={form.imagePositioning} onChange={(value) => update('imagePositioning', value)} disabled={readOnly} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextArea label="希望重點發展方向" value={form.developmentFocus} onChange={(value) => update('developmentFocus', value)} rows={3} disabled={readOnly} />
          <TextArea label="不接受的工作類型" value={form.unacceptableJobs} onChange={(value) => update('unacceptableJobs', value)} rows={3} disabled={readOnly} />
          <TextArea label="夢想合作品牌 / 題材" value={form.dreamBrands} onChange={(value) => update('dreamBrands', value)} rows={3} disabled={readOnly} />
          <div className="space-y-4">
            <CheckboxGroup label="希望公司可協助發展的方向" options={[{ value: 'host', label: '主持' }, { value: 'performance', label: '演出' }, { value: 'print', label: '平面' }, { value: 'live', label: '直播' }, { value: 'self_media', label: '自媒體' }, { value: 'cross_border', label: '跨境發展' }, { value: 'other', label: '其他' }]} value={form.companySupportDirections} onChange={(value) => update('companySupportDirections', value)} columns="md:grid-cols-2" disabled={readOnly} />
            <TextInput label="其他協助方向" value={form.companySupportOther} onChange={(value) => update('companySupportOther', value)} disabled={readOnly} />
          </div>
        </div>
      </SectionCard>
        </>
      )}

      {(readOnly || currentStep === 3) && (
        <>
          <SectionCard title="A7. 文件上傳清單" hint="請按實際情況勾選並上傳或提供資料。">
        <CheckboxGroup label="已提交資料" options={fileOptions} value={form.submittedFiles} onChange={(value) => update('submittedFiles', value)} disabled={readOnly} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput label="其他補充文件說明" value={form.otherFileNote} onChange={(value) => update('otherFileNote', value)} disabled={readOnly} />
          <div>
            <FieldLabel>附件檔案</FieldLabel>
            <input
              type="file"
              multiple
              disabled={readOnly}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []).map((file) => file.name);
                update('uploadedFileNames', files);
              }}
              className="block w-full rounded-md border border-dashed border-border bg-white px-3 py-2 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-teal-700 disabled:cursor-not-allowed disabled:bg-muted/40"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              目前先記錄檔名；如需真正上傳雲端儲存，可後續接 Supabase Storage。
            </p>
            {form.uploadedFileNames.length > 0 && (
              <p className="mt-1 text-[11px] text-teal-700">
                已選擇：{form.uploadedFileNames.join('、')}
              </p>
            )}
          </div>
        </div>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
          部分公開表或演出申請亦會要求提交近照、演出影片、服裝照片、節目清單，以及於活動當日出示附相片的身份證明文件，反映影像及身份核實在表演管理流程中屬常見要求。
        </p>
      </SectionCard>

      <SectionCard title="A8. 申請人聲明及同意">
        <div className="rounded-md bg-slate-50 px-4 py-3 text-[12.5px] leading-6 text-[#0d1a2d]">
          <p className="font-semibold">本人聲明：</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>本申請表所填資料、附件及可提供內容均真實、完整及正確。</li>
            <li>如資料有更新，將主動通知公司作修訂。</li>
            <li>同意公司把本申請資料用作招募、篩選、面試、試鏡、工作配對、客戶推薦、合作記錄、結算及內部統計用途。</li>
            <li>同意公司在獲本人另行授權或在合作需要範圍內，向指定客戶、製作團隊或合作平台展示本人履歷、照片、作品及相關專業資料。</li>
            <li>明白遞交申請不代表獲錄取、獲簽約或獲保證安排工作。</li>
          </ol>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <FieldLabel required>申請人簽署</FieldLabel>
            <SignaturePad value={form.applicantSignature} onChange={(value) => update('applicantSignature', value)} width={260} height={140} />
          </div>
          <TextInput label="申請人簽署日期" type="date" value={form.applicantSignDate} onChange={(value) => update('applicantSignDate', value)} disabled={readOnly} />
        </div>
        <p className="rounded-md bg-slate-50 px-4 py-3 text-[12.5px] leading-6 text-[#0d1a2d]">
          如申請人未滿 18 歲，須由家長 / 合法監護人簽署。香港一般合約原則下，18 歲以下人士通常不具完全訂立合約能力，因此未成年申請人應加設監護人同意及後續法律確認安排。
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextInput label="家長 / 監護人姓名" value={form.guardianName} onChange={(value) => update('guardianName', value)} disabled={readOnly} />
          <TextInput label="家長 / 監護人簽署" value={form.guardianSignature} onChange={(value) => update('guardianSignature', value)} placeholder="可輸入姓名，正式簽署可後續補充" disabled={readOnly} />
          <TextInput label="家長 / 監護人簽署日期" type="date" value={form.guardianSignDate} onChange={(value) => update('guardianSignDate', value)} disabled={readOnly} />
        </div>
      </SectionCard>
        </>
      )}

      {mode !== 'view' && (
        <div className="sticky bottom-0 z-10 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white/95 px-5 py-3 shadow-[0_-2px_12px_rgba(0,20,40,0.06)] backdrop-blur">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="font-semibold text-teal-700">進度：{progressPercent}%</div>
            <div className="text-muted-foreground">第 {currentStep + 1} / {totalSteps} 頁</div>
            <div className="text-muted-foreground">
              {mode === 'draft' && savedAt && <span className="text-teal-700">已於 {savedAt} 儲存草稿</span>}
              {mode === 'draft' && !savedAt && '尚未儲存'}
              {mode === 'submit' && submitError && <span className="text-rose-600">{submitError}</span>}
              {mode === 'submit' && !submitError && (isLastStep ? '請確認資料後遞交表格。' : '請完成本頁後進入下一頁。')}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={goPrevious}
                  className="inline-flex items-center rounded-md border border-border bg-white px-3 py-2 text-[13px] font-medium text-[#0d1a2d] transition-colors hover:bg-muted/60"
                >
                  上一頁
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-[13px] font-medium text-[#0d1a2d] transition-colors hover:bg-muted/60"
              >
                <RotateCcw size={14} />
                重設
              </button>
              {!isLastStep && (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center rounded-md bg-teal-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  下一頁
                </button>
              )}
              {isLastStep && (mode === 'submit' ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={14} />
                  {submitting ? '正在遞交…' : '遞交表格'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-teal-700"
                >
                  <Send size={14} />
                  儲存草稿
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
