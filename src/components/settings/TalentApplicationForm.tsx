import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

type OptionValue = string;

interface OptionCellProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  trailingInput?: { value: string; onChange: (v: string) => void; placeholder?: string; width?: string };
}

function OptionCell({ label, selected, onClick, trailingInput }: OptionCellProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 rounded-md border text-[13px] transition-all duration-150 text-left',
        selected
          ? 'border-teal-500 bg-teal-50 text-teal-800 ring-1 ring-teal-500/40'
          : 'border-border bg-white text-foreground hover:border-teal-300 hover:bg-muted/30'
      )}
    >
      <span
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
          selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-border bg-white text-transparent'
        )}
      >
        <Check size={11} strokeWidth={3} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
      {trailingInput && (
        <input
          type="text"
          value={trailingInput.value}
          onChange={(e) => {
            trailingInput.onChange(e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          placeholder={trailingInput.placeholder || '請填寫'}
          className={cn(
            'ml-1 px-1.5 py-0.5 text-[12px] border-b border-dashed border-border bg-transparent outline-none focus:border-teal-500',
            trailingInput.width || 'w-24'
          )}
        />
      )}
    </button>
  );
}

interface OptionRowProps {
  options: { value: OptionValue; label: string }[];
  selected: OptionValue[];
  onChange: (next: OptionValue[]) => void;
  mode: 'single' | 'multi';
  trailingInputs?: Record<string, { value: string; onChange: (v: string) => void; placeholder?: string; width?: string }>;
}

function OptionRow({ options, selected, onChange, mode, trailingInputs }: OptionRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <OptionCell
            key={opt.value}
            label={opt.label}
            selected={isSelected}
            onClick={() => {
              if (mode === 'single') {
                onChange(isSelected ? [] : [opt.value]);
              } else {
                onChange(
                  isSelected ? selected.filter((s) => s !== opt.value) : [...selected, opt.value]
                );
              }
            }}
            trailingInput={trailingInputs?.[opt.value]}
          />
        );
      })}
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">
      {children}
      {required && <span className="text-rose-500 ml-1">*</span>}
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-2 pb-1">
      <span className="w-1 h-5 bg-teal-600 rounded-full" />
      <h3 className="text-[15px] font-bold text-[#0d1a2d] tracking-tight">{title}</h3>
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 transition-colors',
        props.className
      )}
    />
  );
}

interface FormState {
  fillDate: string;
  types: string[];
  typeOther: string;

  nameZh: string;
  nameEn: string;
  gender: string[];
  age: string;
  phone: string;
  wechat: string;
  height: string;
  weight: string;
  cantonese: string[];
  mandarin: string[];
  residence: string[];
  residenceOther: string;

  socialPlatforms: string[];
  socialPlatformOther: string;
  socialAccountName: string;
  socialFollowers: string;
  socialTopic: string;

  shootingExperience: string[];
  shootingExperienceOther: string;
  experienceYears: string[];

  shootingStyle1: string[];
  shootingStyle2: string[];
  shootingStyle2Other: string;

  talents: string[];
  talentDanceType: string;
  talentInstrument: string;
  talentOther: string;

  payHourly: boolean;
  payHourlyAmount: string;
  payPerJob: boolean;
  payPerJobAmount: string;
  settlement: string[];

  availability: string[];
  availabilityOther: string;
  hkWillingness: string[];
  weeklyJobs: string[];

  signature: string;
}

const initialState: FormState = {
  fillDate: '',
  types: [],
  typeOther: '',
  nameZh: '',
  nameEn: '',
  gender: [],
  age: '',
  phone: '',
  wechat: '',
  height: '',
  weight: '',
  cantonese: [],
  mandarin: [],
  residence: [],
  residenceOther: '',
  socialPlatforms: [],
  socialPlatformOther: '',
  socialAccountName: '',
  socialFollowers: '',
  socialTopic: '',
  shootingExperience: [],
  shootingExperienceOther: '',
  experienceYears: [],
  shootingStyle1: [],
  shootingStyle2: [],
  shootingStyle2Other: '',
  talents: [],
  talentDanceType: '',
  talentInstrument: '',
  talentOther: '',
  payHourly: false,
  payHourlyAmount: '',
  payPerJob: false,
  payPerJobAmount: '',
  settlement: [],
  availability: [],
  availabilityOther: '',
  hkWillingness: [],
  weeklyJobs: [],
  signature: '',
};

export function TalentApplicationForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleString('zh-HK'));
  };

  const handleReset = () => {
    if (confirm('確定要重設整份表格嗎？所有已填寫內容將會清除。')) {
      setForm(initialState);
      setSavedAt(null);
    }
  };

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card">
      {/* Form header */}
      <div className="px-6 py-5 border-b border-border/50 bg-gradient-to-r from-teal-50/50 to-transparent">
        <h2 className="text-[20px] font-bold text-[#0d1a2d] tracking-tight">
          志豐設計（深圳）有限公司 — Model 面試登記表
        </h2>
        <p className="text-[12px] text-muted-foreground mt-1">
          請填寫以下資料，所有「空格」項目均以可點擊的選項形式呈現；單選類型只可選一格，重複點擊可取消。
        </p>
      </div>

      <div className="p-6 space-y-7">
        {/* Top: Date + Types */}
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5">
          <div>
            <FieldLabel>填表日期</FieldLabel>
            <TextInput
              type="date"
              value={form.fillDate}
              onChange={(e) => update('fillDate', e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>類型（可多選）</FieldLabel>
            <OptionRow
              mode="multi"
              selected={form.types}
              onChange={(v) => update('types', v)}
              options={[
                { value: 'flat_model', label: '平面模特' },
                { value: 'event_model', label: '活動模特' },
                { value: 'host', label: '主持人' },
                { value: 'kol', label: '自媒體/KOL' },
                { value: 'live', label: '直播' },
                { value: 'drama', label: '短劇/演員' },
                { value: 'vo', label: 'VO' },
                { value: 'other', label: '其他' },
              ]}
              trailingInputs={{
                other: {
                  value: form.typeOther,
                  onChange: (v) => update('typeOther', v),
                  placeholder: '其他類型',
                },
              }}
            />
          </div>
        </div>

        {/* Personal Info */}
        <div className="space-y-4">
          <SectionHeader title="個人資料" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>姓名（中文）</FieldLabel>
              <TextInput
                value={form.nameZh}
                onChange={(e) => update('nameZh', e.target.value)}
                placeholder="請輸入中文姓名"
              />
            </div>
            <div>
              <FieldLabel>姓名（英文）</FieldLabel>
              <TextInput
                value={form.nameEn}
                onChange={(e) => update('nameEn', e.target.value)}
                placeholder="Please enter English name"
              />
            </div>
          </div>

          <div>
            <FieldLabel>性別</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.gender}
              onChange={(v) => update('gender', v)}
              options={[
                { value: 'male', label: '男' },
                { value: 'female', label: '女' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <FieldLabel>年齡</FieldLabel>
              <TextInput
                type="number"
                value={form.age}
                onChange={(e) => update('age', e.target.value)}
                placeholder="歲"
              />
            </div>
            <div>
              <FieldLabel>身高</FieldLabel>
              <TextInput
                value={form.height}
                onChange={(e) => update('height', e.target.value)}
                placeholder="cm"
              />
            </div>
            <div>
              <FieldLabel>體重</FieldLabel>
              <TextInput
                value={form.weight}
                onChange={(e) => update('weight', e.target.value)}
                placeholder="kg"
              />
            </div>
            <div>
              <FieldLabel>手機號碼</FieldLabel>
              <TextInput
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+852 / +86"
              />
            </div>
          </div>

          <div>
            <FieldLabel>WeChat 微信號</FieldLabel>
            <TextInput
              value={form.wechat}
              onChange={(e) => update('wechat', e.target.value)}
              placeholder="WeChat ID"
            />
          </div>

          <div>
            <FieldLabel>粵語/廣東話（可多選）</FieldLabel>
            <OptionRow
              mode="multi"
              selected={form.cantonese}
              onChange={(v) => update('cantonese', v)}
              options={[
                { value: 'hk_accent', label: '香港口音' },
                { value: 'gz_accent', label: '廣府口音' },
              ]}
            />
          </div>

          <div>
            <FieldLabel>普通話流利度（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.mandarin}
              onChange={(v) => update('mandarin', v)}
              options={[
                { value: 'good', label: '很好' },
                { value: 'normal', label: '一般' },
                { value: 'poor', label: '不太流利' },
              ]}
            />
          </div>

          <div>
            <FieldLabel>現居住地（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.residence}
              onChange={(v) => update('residence', v)}
              options={[
                { value: 'hk', label: '香港' },
                { value: 'sz', label: '深圳' },
                { value: 'other', label: '其他' },
              ]}
              trailingInputs={{
                other: {
                  value: form.residenceOther,
                  onChange: (v) => update('residenceOther', v),
                  placeholder: '城市/地區',
                },
              }}
            />
          </div>
        </div>

        {/* Social Media */}
        <div className="space-y-4">
          <SectionHeader title="社交媒體資訊" />
          <div>
            <FieldLabel>使用平台（可多選）</FieldLabel>
            <OptionRow
              mode="multi"
              selected={form.socialPlatforms}
              onChange={(v) => update('socialPlatforms', v)}
              options={[
                { value: 'wechat_video', label: '微信視頻號' },
                { value: 'redbook', label: '小紅書' },
                { value: 'douyin', label: '抖音' },
                { value: 'instagram', label: 'Instagram' },
                { value: 'facebook', label: 'Facebook' },
                { value: 'youtube', label: 'YouTube' },
                { value: 'other', label: '其他' },
              ]}
              trailingInputs={{
                other: {
                  value: form.socialPlatformOther,
                  onChange: (v) => update('socialPlatformOther', v),
                  placeholder: '其他平台',
                },
              }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <FieldLabel>主要帳號名稱</FieldLabel>
              <TextInput
                value={form.socialAccountName}
                onChange={(e) => update('socialAccountName', e.target.value)}
                placeholder="@username"
              />
            </div>
            <div>
              <FieldLabel>粉絲數</FieldLabel>
              <TextInput
                value={form.socialFollowers}
                onChange={(e) => update('socialFollowers', e.target.value)}
                placeholder="例：12.5K"
              />
            </div>
            <div>
              <FieldLabel>主要內容主題</FieldLabel>
              <TextInput
                value={form.socialTopic}
                onChange={(e) => update('socialTopic', e.target.value)}
                placeholder="例：美妝、生活、旅遊"
              />
            </div>
          </div>
        </div>

        {/* Shooting Experience */}
        <div className="space-y-4">
          <SectionHeader title="拍攝經驗" />
          <div>
            <FieldLabel>經驗類型（可多選）</FieldLabel>
            <OptionRow
              mode="multi"
              selected={form.shootingExperience}
              onChange={(v) => update('shootingExperience', v)}
              options={[
                { value: 'flat', label: '平面拍攝' },
                { value: 'commercial', label: '廣告/短片拍攝' },
                { value: 'host', label: '上台主持' },
                { value: 'live', label: '現場直播' },
                { value: 'self_edit', label: '自己拍+剪' },
                { value: 'film_tv', label: '電影/電視劇' },
                { value: 'other', label: '其他' },
              ]}
              trailingInputs={{
                other: {
                  value: form.shootingExperienceOther,
                  onChange: (v) => update('shootingExperienceOther', v),
                  placeholder: '其他經驗',
                },
              }}
            />
          </div>
          <div>
            <FieldLabel>經驗年期（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.experienceYears}
              onChange={(v) => update('experienceYears', v)}
              options={[
                { value: '3-5y', label: '3-5年' },
                { value: '1-3y', label: '1-3年' },
                { value: '<1y', label: '1年內' },
                { value: '6m', label: '6個月內' },
                { value: '3m', label: '3個月內' },
                { value: '1m', label: '1個月內' },
                { value: 'never', label: '從未' },
              ]}
            />
          </div>
        </div>

        {/* Shooting Style */}
        <div className="space-y-4">
          <SectionHeader title="拍攝風格（可多選）" />
          <div>
            <FieldLabel>外型/穿搭風格</FieldLabel>
            <OptionRow
              mode="multi"
              selected={form.shootingStyle1}
              onChange={(v) => update('shootingStyle1', v)}
              options={[
                { value: 'jp_kr', label: '日韓甜美/小清新' },
                { value: 'street', label: '歐美街頭/潮牌' },
                { value: 'ol', label: '商務職場OL' },
                { value: 'sport', label: '運動/瑜珈健身' },
                { value: 'retro', label: '新中式/復古港風' },
                { value: 'home', label: '居家生活/慵懶風' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>內容/主題風格</FieldLabel>
            <OptionRow
              mode="multi"
              selected={form.shootingStyle2}
              onChange={(v) => update('shootingStyle2', v)}
              options={[
                { value: 'beauty', label: '美妝護膚/彩妝' },
                { value: 'vlog', label: '探店/網紅 VLOG' },
                { value: 'cosplay', label: '二次元/Cosplay' },
                { value: 'live_sale', label: '電商直播/帶貨主播' },
                { value: 'drama', label: '劇情短片' },
                { value: 'other', label: '其他風格' },
              ]}
              trailingInputs={{
                other: {
                  value: form.shootingStyle2Other,
                  onChange: (v) => update('shootingStyle2Other', v),
                  placeholder: '其他風格',
                },
              }}
            />
          </div>
        </div>

        {/* Talents */}
        <div className="space-y-4">
          <SectionHeader title="個人才藝（可多選）" />
          <OptionRow
            mode="multi"
            selected={form.talents}
            onChange={(v) => update('talents', v)}
            options={[
              { value: 'dance', label: '舞蹈' },
              { value: 'sing', label: '唱歌' },
              { value: 'instrument', label: '樂器' },
              { value: 'photography', label: '拍攝攝影' },
              { value: 'editing', label: '剪輯' },
              { value: 'other', label: '其他才藝' },
            ]}
            trailingInputs={{
              dance: {
                value: form.talentDanceType,
                onChange: (v) => update('talentDanceType', v),
                placeholder: '舞種',
              },
              instrument: {
                value: form.talentInstrument,
                onChange: (v) => update('talentInstrument', v),
                placeholder: '樂器',
              },
              other: {
                value: form.talentOther,
                onChange: (v) => update('talentOther', v),
                placeholder: '其他才藝',
              },
            }}
          />
        </div>

        {/* Pay */}
        <div className="space-y-4">
          <SectionHeader title="薪酬資訊" />
          <div>
            <FieldLabel>薪酬期望（可同時填寫兩種）</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              <OptionCell
                label="按小時計算（時薪）"
                selected={form.payHourly}
                onClick={() => update('payHourly', !form.payHourly)}
                trailingInput={{
                  value: form.payHourlyAmount,
                  onChange: (v) => update('payHourlyAmount', v),
                  placeholder: '時薪',
                  width: 'w-20',
                }}
              />
              <span className="text-[12px] text-muted-foreground">元/小時</span>
              <OptionCell
                label="按通告計算（每次）"
                selected={form.payPerJob}
                onClick={() => update('payPerJob', !form.payPerJob)}
                trailingInput={{
                  value: form.payPerJobAmount,
                  onChange: (v) => update('payPerJobAmount', v),
                  placeholder: '每次',
                  width: 'w-20',
                }}
              />
              <span className="text-[12px] text-muted-foreground">元/每次通告</span>
            </div>
          </div>

          <div>
            <FieldLabel>結算方式（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.settlement}
              onChange={(v) => update('settlement', v)}
              options={[
                { value: 'on_completion', label: '完工結算' },
                { value: 'monthly', label: '月結' },
                { value: 'company_arrange', label: '看公司安排' },
              ]}
            />
          </div>
        </div>

        {/* Availability */}
        <div className="space-y-4">
          <SectionHeader title="工作配合度" />
          <div>
            <FieldLabel>可接單日期（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.availability}
              onChange={(v) => update('availability', v)}
              options={[
                { value: 'instant', label: '即時' },
                { value: '1week', label: '一週內' },
                { value: 'other', label: '其他' },
              ]}
              trailingInputs={{
                other: {
                  value: form.availabilityOther,
                  onChange: (v) => update('availabilityOther', v),
                  placeholder: '具體日期',
                },
              }}
            />
          </div>
          <div>
            <FieldLabel>去香港拍攝意願（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.hkWillingness}
              onChange={(v) => update('hkWillingness', v)}
              options={[
                { value: 'yes', label: '可以' },
                { value: 'sometimes', label: '偶爾可以' },
                { value: 'no', label: '不可以' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>每週可接通告（單選）</FieldLabel>
            <OptionRow
              mode="single"
              selected={form.weeklyJobs}
              onChange={(v) => update('weeklyJobs', v)}
              options={[
                { value: '1-2d', label: '1-2 日' },
                { value: '3-4d', label: '3-4 日' },
                { value: 'weekend', label: '週末假期為主' },
                { value: 'flexible', label: '時間彈性可隨時配合' },
              ]}
            />
          </div>
        </div>

        {/* Signature */}
        <div className="space-y-4 pt-2 border-t border-border/50">
          <FieldLabel>應聘人員簽名（面試當天簽名）</FieldLabel>
          <TextInput
            value={form.signature}
            onChange={(e) => update('signature', e.target.value)}
            placeholder="請於面試當天簽署"
          />
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 border-t border-border/50 bg-muted/20 flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground">
          {savedAt ? <span className="text-teal-600">✓ 已於 {savedAt} 儲存草稿</span> : '尚未儲存'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors"
          >
            重設
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-bold hover:bg-teal-700 transition-colors shadow-sm"
          >
            儲存草稿
          </button>
        </div>
      </div>
    </div>
  );
}
