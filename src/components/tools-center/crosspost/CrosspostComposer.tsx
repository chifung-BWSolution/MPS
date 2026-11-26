import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { useBrands } from '@/hooks/useBrands';
import {
  BRIEF_LIMITS,
  COPY_LANGUAGES,
  COPY_TONES,
  PLATFORM_ORDER,
  PLATFORM_RULES,
  countChars,
  type CopyBrief,
} from '@/lib/crosspost';
import { cn } from '@/lib/utils';

export interface CrosspostComposerProps {
  value: CopyBrief;
  onChange: (next: CopyBrief) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
}

const EXAMPLES = [
  {
    label: '早鳥優惠',
    text: '早鳥優惠｜{產品／療程名稱} 首次體驗價 ${金額}，優惠期至 {日期}，限 {名額} 位。包含：{內容}。',
  },
  {
    label: '新品介紹',
    text: '新品上市｜{產品名稱}：{3 個核心賣點}。適合 {適用對象}，{價格／優惠}。',
  },
  {
    label: '療程推廣',
    text: '療程推廣｜{療程名稱}（{時長}）：{體驗流程／效果描述，不可宣稱療效}，{價格／優惠}。',
  },
];

function ruleChip(platform: (typeof PLATFORM_ORDER)[number]): string {
  const rule = PLATFORM_RULES[platform];
  if (platform === 'edm') {
    return `eDM 主旨 ≤${rule.titleLimit}／內文 ≤${rule.bodyLimit}`;
  }
  return `${rule.label} ≤${rule.bodyLimit.toLocaleString()}`;
}

function counterClass(over: boolean, near: boolean): string {
  return cn(
    'text-[11px] tabular-nums',
    over ? 'font-semibold text-rose-600' : near ? 'font-medium text-amber-600' : 'text-muted-foreground',
  );
}

export function CrosspostComposer({
  value,
  onChange,
  onGenerate,
  generating,
  error,
}: CrosspostComposerProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { brands, loading: brandsLoading } = useBrands();

  const brandOptions = useMemo(
    () =>
      brands
        .filter((brand) => brand.isActive !== false)
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [brands],
  );

  const coreCount = countChars(value.coreInfo.trim());
  const audienceCount = countChars(value.audience.trim());
  const ctaCount = countChars(value.cta.trim());
  const notesCount = countChars((value.extraNotes ?? '').trim());

  const missing: string[] = [];
  if (!value.coreInfo.trim()) missing.push('活動／產品核心資訊');
  if (!value.audience.trim()) missing.push('目標受眾');
  if (!value.cta.trim()) missing.push('CTA');

  const canGenerate = missing.length === 0 && !generating;

  const handleBrandChange = (brandId: string) => {
    if (!brandId) {
      onChange({ ...value, brandId: null, brandName: undefined });
      return;
    }
    const brand = brandOptions.find((item) => item.id === brandId);
    onChange({ ...value, brandId: brand?.id ?? null, brandName: brand?.displayName });
  };

  return (
    <section className="space-y-4 rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-card">
      <div className="flex items-start gap-2">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-teal-600" />
        <div>
          <h2 className="text-[16px] font-bold text-[#0d1a2d]">輸入活動資料</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            同一份資料會按平台改寫成 5 個版本；三個必填欄位足夠，其他可留空。
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="crosspost-core" className="text-[13px] font-medium">
            活動／產品核心資訊 <span className="text-rose-600">*</span>
          </label>
          <span className={counterClass(coreCount > BRIEF_LIMITS.coreInfo, false)}>
            {coreCount.toLocaleString()} / {BRIEF_LIMITS.coreInfo.toLocaleString()}
          </span>
        </div>
        <textarea
          id="crosspost-core"
          value={value.coreInfo}
          onChange={(event) => onChange({ ...value, coreInfo: event.target.value })}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              if (canGenerate) onGenerate();
            }
          }}
          rows={6}
          placeholder="例：早鳥優惠 $1,880 三十分鐘療程，優惠期至 12 月 31 日，名額 50 位。"
          className="w-full resize-y rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">快速範例：</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => onChange({ ...value, coreInfo: example.text })}
              title="會覆蓋目前的核心資訊"
              className="rounded border border-border bg-muted/20 px-2 py-0.5 text-[11px] text-[#0d1a2d]/70 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="crosspost-audience" className="text-[13px] font-medium">
            目標受眾 <span className="text-rose-600">*</span>
          </label>
          <span className={counterClass(audienceCount > BRIEF_LIMITS.audience, false)}>
            {audienceCount} / {BRIEF_LIMITS.audience}
          </span>
        </div>
        <input
          id="crosspost-audience"
          value={value.audience}
          onChange={(event) => onChange({ ...value, audience: event.target.value })}
          placeholder="例：25–40 歲香港在職女性，關注抗老與保養"
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="crosspost-cta" className="text-[13px] font-medium">
            CTA（行動號召） <span className="text-rose-600">*</span>
          </label>
          <span className={counterClass(ctaCount > BRIEF_LIMITS.cta, false)}>
            {ctaCount} / {BRIEF_LIMITS.cta}
          </span>
        </div>
        <input
          id="crosspost-cta"
          value={value.cta}
          onChange={(event) => onChange({ ...value, cta: event.target.value })}
          placeholder="例：立即預約並輸入優惠碼 EARLY20"
          className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
      </div>

      <div className="rounded-md border border-[rgba(13,26,45,0.06)] bg-[#f5f8fc] p-3">
        <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">本次輸出（自動帶平台上限）</p>
        <div className="flex flex-wrap gap-1.5">
          {PLATFORM_ORDER.map((platform) => (
            <span
              key={platform}
              className="rounded border border-white bg-white px-2 py-0.5 text-[11px] font-medium text-[#0d1a2d]/75"
            >
              {ruleChip(platform)}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-md border border-border/70 px-3 py-2 text-[12px] font-medium text-[#0d1a2d]/75 transition-colors hover:bg-muted/20"
        aria-expanded={advancedOpen}
      >
        <span>進階設定（品牌、語氣、語言、補充限制）</span>
        {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {advancedOpen && (
        <div className="space-y-3 rounded-md border border-border/60 p-3">
          <div className="space-y-1.5">
            <label htmlFor="crosspost-brand" className="text-[13px] font-medium">
              品牌（選填）
            </label>
            <select
              id="crosspost-brand"
              value={value.brandId ?? ''}
              onChange={(event) => handleBrandChange(event.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-teal-500"
            >
              <option value="">{brandsLoading ? '載入品牌中…' : '不指定'}</option>
              {brandOptions.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.displayName}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">只作語氣提示與歷史篩選，不會自動套用品牌資料。</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="crosspost-tone" className="text-[13px] font-medium">
                語氣
              </label>
              <select
                id="crosspost-tone"
                value={value.tone ?? '專業可信'}
                onChange={(event) => onChange({ ...value, tone: event.target.value })}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-teal-500"
              >
                {COPY_TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="crosspost-language" className="text-[13px] font-medium">
                語言
              </label>
              <select
                id="crosspost-language"
                value={value.language ?? 'zh-HK'}
                onChange={(event) =>
                  onChange({
                    ...value,
                    language: event.target.value as CopyBrief['language'],
                  })
                }
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-teal-500"
              >
                {COPY_LANGUAGES.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="crosspost-notes" className="text-[13px] font-medium">
                補充限制（選填）
              </label>
              <span className={counterClass(notesCount > BRIEF_LIMITS.extraNotes, false)}>
                {notesCount} / {BRIEF_LIMITS.extraNotes.toLocaleString()}
              </span>
            </div>
            <textarea
              id="crosspost-notes"
              value={value.extraNotes ?? ''}
              onChange={(event) => onChange({ ...value, extraNotes: event.target.value })}
              rows={3}
              placeholder="例：不可宣稱療效；必須提及優惠期至 12 月 31 日；避免「最」字。"
              className="w-full resize-y rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          還需填寫：<span className="font-medium text-[#0d1a2d]">{missing.join('、')}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-medium text-white transition-colors',
          canGenerate ? 'bg-teal-600 hover:bg-teal-700 active:scale-[0.99]' : 'cursor-not-allowed bg-teal-600/50',
        )}
      >
        {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {generating ? '生成中…（約 20–40 秒）' : '生成文案'}
      </button>

      <p className="text-center text-[11px] text-muted-foreground">
        Ctrl／⌘ + Enter 也可生成；每次生成都會另行存入歷史。
      </p>
    </section>
  );
}
