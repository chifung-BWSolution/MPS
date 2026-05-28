import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { supabase } from '@/lib/supabase';

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
        'inline-flex items-center gap-1.5 px-2 py-1 rounded text-[12.5px] transition-all duration-150 text-left',
        selected
          ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-500'
          : 'text-foreground hover:bg-muted/40'
      )}
    >
      <span
        className={cn(
          'w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors',
          selected ? 'border-teal-600 bg-teal-600 text-white' : 'border-border bg-white text-transparent'
        )}
      >
        <Check size={10} strokeWidth={3} />
      </span>
      <span className="whitespace-nowrap">{label}</span>
      {trailingInput && (
        <input
          type="text"
          value={trailingInput.value}
          disabled={!selected}
          onChange={(e) => {
            if (!selected) return;
            trailingInput.onChange(e.target.value);
          }}
          onClick={(e) => {
            if (selected) {
              e.stopPropagation();
            }
            // when not selected, let click bubble so the parent button toggles the option on
          }}
          placeholder={selected ? trailingInput.placeholder || '請填寫' : ''}
          className={cn(
            'ml-0.5 px-1 py-0 text-[12px] border-b border-dashed border-border bg-transparent outline-none focus:border-teal-500',
            trailingInput.width || 'w-16',
            !selected && 'opacity-50 cursor-not-allowed pointer-events-none'
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
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5">
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

function CellInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-1.5 py-1 text-[12.5px] bg-transparent border-0 outline-none focus:bg-teal-50/40 transition-colors',
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

// Excel grid styling helpers — compact rows, every cell shares the same border so it looks like a real spreadsheet
const labelCell =
  'flex items-center gap-1 px-2.5 py-2 bg-slate-50 text-[12.5px] font-bold text-[#0d1a2d] border-r border-b border-slate-300';
const valueCell =
  'flex items-center px-2 py-1.5 bg-white border-r border-b border-slate-300 min-h-[36px]';
const valueCellLast =
  'flex items-center px-2 py-1.5 bg-white border-b border-slate-300 min-h-[36px]';
const sectionBand =
  'col-span-4 px-2.5 py-1.5 bg-slate-200 text-slate-700 text-[12.5px] font-bold border-b border-slate-300 text-center';
const fullRowCell =
  'col-span-4 flex items-center flex-wrap px-2 py-1.5 bg-white border-b border-slate-300 gap-y-0.5';

interface TalentApplicationFormProps {
  mode?: 'draft' | 'submit' | 'view';
  inviteToken?: string;
  initialValue?: Partial<FormState>;
}

export function TalentApplicationForm({ mode = 'draft', inviteToken, initialValue }: TalentApplicationFormProps = {}) {
  const readOnly = mode === 'view';
  const [form, setForm] = useState<FormState>(() => ({ ...initialState, ...(initialValue ?? {}) }));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    setSavedAt(new Date().toLocaleString('zh-HK'));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { signature, ...rest } = form;
      const { error } = await supabase.from('talent_form').insert({
        invite_token: inviteToken ?? null,
        fill_date: form.fillDate || null,
        name_zh: form.nameZh || null,
        name_en: form.nameEn || null,
        gender: form.gender[0] ?? null,
        age: form.age || null,
        phone: form.phone || null,
        wechat: form.wechat || null,
        height: form.height || null,
        weight: form.weight || null,
        payload: rest,
        signature_image: signature || null,
      });
      if (error) throw error;
      setSubmittedAt(new Date().toLocaleString('zh-HK'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提交失敗，請稍後再試。';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    if (confirm('確定要重設整份表格嗎？所有已填寫內容將會清除。')) {
      setForm(initialState);
      setSavedAt(null);
      setSubmittedAt(null);
      setSubmitError(null);
    }
  };

  if (submittedAt && mode === 'submit') {
    return (
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card mx-auto max-w-[880px] w-full px-8 py-12 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 text-teal-700 mb-3">
          <Check size={28} strokeWidth={3} />
        </div>
        <h3 className="text-[16px] font-bold text-[#0d1a2d] mb-1">已成功遞交表格</h3>
        <p className="text-[12.5px] text-muted-foreground">
          感謝您的填寫！我們將盡快與您聯絡。<br />
          遞交時間：{submittedAt}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card mx-auto max-w-[880px] w-full">
      {/* Spreadsheet wrapper */}
      <div className="overflow-x-auto">
        <div
          className={cn(
            'grid border-l border-t border-slate-300 text-[12.5px]',
            readOnly && 'pointer-events-none select-text'
          )}
          style={{
            // Match Excel column widths roughly: B=24, C=39, D=24, E=43
            gridTemplateColumns: '22% 28% 22% 28%',
          }}
        >
          {/* Row 1: Title (B1:E1 merged) */}
          <div className="col-span-4 px-3 py-3 bg-white border-r border-b border-slate-300 text-center">
            <h2 className="text-[16px] font-bold text-[#0d1a2d] tracking-tight">
              志豐設計（深圳）有限公司 — Model 面試登記表
            </h2>
          </div>

          {/* Row 2: E2 only — 填表日期 (right-aligned, top-right) */}
          <div className="col-span-3 px-2 py-1 bg-white border-r border-b border-slate-300" />
          <div className={valueCellLast + ' justify-end gap-1.5'}>
            <span className="text-[12.5px] font-bold text-[#0d1a2d] whitespace-nowrap">填表日期：</span>
            <input
              type="date"
              value={form.fillDate}
              onChange={(e) => update('fillDate', e.target.value)}
              className="px-1.5 py-0.5 text-[12px] border border-border rounded bg-white outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Row 3: 類型 (full width) */}
          <div className="col-span-4 flex items-center flex-wrap px-2 py-1.5 bg-white border-b border-slate-300 gap-0.5">
            <span className="text-[12.5px] font-bold text-[#0d1a2d] mr-1 whitespace-nowrap">類型：</span>
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
                  width: 'w-28',
                },
              }}
            />
          </div>

          {/* Section: 個人資訊 */}
          <div className={sectionBand}>個人資訊</div>

          {/* Row 5: 姓名(中文) | 姓名(英文) */}
          <div className={labelCell}>姓名（中文）</div>
          <div className={valueCell}>
            <CellInput value={form.nameZh} onChange={(e) => update('nameZh', e.target.value)} placeholder="請輸入" />
          </div>
          <div className={labelCell}>姓名（英文）</div>
          <div className={valueCellLast}>
            <CellInput value={form.nameEn} onChange={(e) => update('nameEn', e.target.value)} placeholder="English Name" />
          </div>

          {/* Row 6: 性別 (男/女) | 年齡 */}
          <div className={labelCell}>性別</div>
          <div className={valueCell}>
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
          <div className={labelCell}>年齡</div>
          <div className={valueCellLast}>
            <CellInput type="number" value={form.age} onChange={(e) => update('age', e.target.value)} placeholder="歲" />
          </div>

          {/* Row 7: 手機號碼 | WeChat 微信號 */}
          <div className={labelCell}>手機號碼</div>
          <div className={valueCell}>
            <CellInput value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+852 / +86" />
          </div>
          <div className={labelCell}>WeChat 微信號</div>
          <div className={valueCellLast}>
            <CellInput value={form.wechat} onChange={(e) => update('wechat', e.target.value)} placeholder="WeChat ID" />
          </div>

          {/* Row 8: 身高 | 體重 */}
          <div className={labelCell}>身高</div>
          <div className={valueCell}>
            <CellInput value={form.height} onChange={(e) => update('height', e.target.value)} placeholder="cm" />
          </div>
          <div className={labelCell}>體重</div>
          <div className={valueCellLast}>
            <CellInput value={form.weight} onChange={(e) => update('weight', e.target.value)} placeholder="kg" />
          </div>

          {/* Row 9: 粵語/廣東話 | 普通話 */}
          <div className={labelCell}>粵語/廣東話</div>
          <div className={valueCell}>
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
          <div className={labelCell}>普通話</div>
          <div className={valueCellLast}>
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

          {/* Row 10: 現居住地 (full row but label on B, options span C-E) */}
          <div className={labelCell}>現居住地</div>
          <div className="col-span-3 flex items-center px-2 py-1.5 bg-white border-b border-slate-300">
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

          {/* Section: 社交媒體資訊 */}
          <div className={sectionBand}>社交媒體資訊</div>

          {/* Row 12: 平台 (full width) */}
          <div className={fullRowCell + ' gap-1'}>
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

          {/* Row 13: 主要社交媒體賬號 (label | merged row of 3 inputs) */}
          <div className={labelCell}>主要社交媒體賬號</div>
          <div className="col-span-3 flex items-center px-2 py-1.5 bg-white border-b border-slate-300 gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">賬號</span>
              <input
                value={form.socialAccountName}
                onChange={(e) => update('socialAccountName', e.target.value)}
                className="px-1 py-0.5 text-[12px] border-b border-dashed border-border bg-transparent outline-none focus:border-teal-500 w-28"
                placeholder="@username"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">粉絲</span>
              <input
                value={form.socialFollowers}
                onChange={(e) => update('socialFollowers', e.target.value)}
                className="px-1 py-0.5 text-[12px] border-b border-dashed border-border bg-transparent outline-none focus:border-teal-500 w-20"
                placeholder="12.5K"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">主題</span>
              <input
                value={form.socialTopic}
                onChange={(e) => update('socialTopic', e.target.value)}
                className="px-1 py-0.5 text-[12px] border-b border-dashed border-border bg-transparent outline-none focus:border-teal-500 w-32"
                placeholder="美妝、生活..."
              />
            </div>
          </div>

          {/* Section: 拍攝經驗 */}
          <div className={sectionBand}>拍攝經驗</div>

          {/* Row 15: 拍攝類型 (full width) */}
          <div className={fullRowCell + ' gap-1'}>
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

          {/* Row 16: 拍攝經驗年期 (label | options) */}
          <div className={labelCell}>拍攝經驗</div>
          <div className="col-span-3 flex items-center px-2 py-1.5 bg-white border-b border-slate-300">
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

          {/* Section: 拍攝風格 */}
          <div className={sectionBand}>拍攝風格</div>

          {/* Row 18: Style 1 (full width) */}
          <div className={fullRowCell + ' gap-1'}>
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

          {/* Row 19: Style 2 (full width) */}
          <div className={fullRowCell + ' gap-1'}>
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

          {/* Section: 個人才藝 */}
          <div className={sectionBand}>個人才藝</div>

          {/* Row 21: 才藝 (full width) */}
          <div className={fullRowCell + ' gap-1'}>
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

          {/* Section: 薪酬資訊 */}
          <div className={sectionBand}>薪酬資訊</div>

          {/* Row 23: 薪酬期望 */}
          <div className={labelCell}>薪酬期望</div>
          <div className="col-span-3 flex items-center px-2 py-1 bg-white border-b border-slate-300 flex-wrap gap-1">
            <OptionCell
              label="按小時計算"
              selected={form.payHourly}
              onClick={() => update('payHourly', !form.payHourly)}
              trailingInput={{
                value: form.payHourlyAmount,
                onChange: (v) => update('payHourlyAmount', v),
                placeholder: '時薪',
                width: 'w-12',
              }}
            />
            <span className="text-[12px] text-muted-foreground">元/小時</span>
            <OptionCell
              label="按通告計算"
              selected={form.payPerJob}
              onClick={() => update('payPerJob', !form.payPerJob)}
              trailingInput={{
                value: form.payPerJobAmount,
                onChange: (v) => update('payPerJobAmount', v),
                placeholder: '每次',
                width: 'w-12',
              }}
            />
            <span className="text-[12px] text-muted-foreground">元/通告</span>
          </div>

          {/* Row 24: 結算方式 */}
          <div className={labelCell}>結算方式</div>
          <div className="col-span-3 flex items-center px-2 py-1.5 bg-white border-b border-slate-300">
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

          {/* Section: 工作配合度 */}
          <div className={sectionBand}>工作配合度</div>

          {/* Row 26: 可接單日期 | 去香港拍攝意願 */}
          <div className={labelCell}>可接單日期</div>
          <div className={valueCell}>
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
                  placeholder: '日期',
                  width: 'w-20',
                },
              }}
            />
          </div>
          <div className={labelCell}>去香港拍攝意願</div>
          <div className={valueCellLast}>
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

          {/* Row 27: 每週可接通告 (label | full options) */}
          <div className={labelCell}>每週可接通告</div>
          <div className="col-span-3 flex items-center px-2 py-1.5 bg-white border-b border-slate-300">
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

          {/* Row 28: 簽名 (full width, right-aligned label) */}
          <div className="col-span-4 flex flex-wrap items-start justify-end gap-3 px-3 py-3 bg-slate-50/50 border-b border-slate-300">
            <span className="text-[12.5px] font-bold text-[#0d1a2d] mt-1">
              簽名：
            </span>
            <SignaturePad
              value={form.signature}
              onChange={(v) => update('signature', v)}
              width={200}
              height={240}
            />
          </div>
        </div>
      </div>

      {/* Footer actions */}
      {mode !== 'view' && (
        <div className="px-4 py-2.5 border-t border-border/50 bg-muted/20 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {mode === 'draft' && savedAt && (
              <span className="text-teal-600">✓ 已於 {savedAt} 儲存草稿</span>
            )}
            {mode === 'draft' && !savedAt && '尚未儲存'}
            {mode === 'submit' && submitError && (
              <span className="text-rose-600">⚠ {submitError}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted/50 transition-colors"
            >
              重設
            </button>
            {mode === 'submit' ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-bold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? '正在遞交…' : '遞交表格'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                className="px-4 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-bold hover:bg-teal-700 transition-colors shadow-sm"
              >
                儲存草稿
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
