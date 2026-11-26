import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  BadgePercent,
  Clock,
  Loader2,
  MessageCircle,
  Package,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AD_ANGLE_ORDER,
  AD_ANGLES,
  AD_GOAL_LABELS,
  AD_GOAL_ORDER,
  AD_INPUT_LIMITS,
  AD_LIMIT_RANGES,
  AD_PLATFORM_ORDER,
  AD_PLATFORM_RULES,
  AD_TONE_LABELS,
  AD_TONE_ORDER,
  countChars,
  type AdAngleId,
  type AdBrief,
  type AdBriefIssue,
  type AdGoal,
  type AdLimits,
  type AdPlatform,
  type AdTone,
} from '@/lib/adCreative';
import type { AdServiceStatus } from '@/lib/adCreativeApi';
import { cn } from '@/lib/utils';

const ANGLE_ICONS = {
  pain: Target,
  time: Clock,
  offer: BadgePercent,
  proof: Award,
  social: MessageCircle,
  contrast: ArrowLeftRight,
} as const;

const SELLING_POINT_EXAMPLES = [
  {
    label: '月餅',
    text: '低糖配方，甜度減半\n每日手工烘焙\n獨立包裝，送禮體面',
  },
  {
    label: '美容療程',
    text: '單次 45 分鐘\n儀器由持牌治療師操作\n首次體驗含皮膚分析',
  },
  {
    label: '網店裝修',
    text: '7 個工作天交付\n支援 Shopify／WooCommerce\n含 1 次修改',
  },
];

function counterClass(current: number, limit: number): string {
  return cn(
    'text-[11px] tabular-nums',
    current > limit
      ? 'font-semibold text-rose-600'
      : current > limit * 0.9
        ? 'font-medium text-amber-600'
        : 'text-muted-foreground',
  );
}

function issueFor(issues: AdBriefIssue[], field: AdBriefIssue['field']): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-600">
      <AlertTriangle size={11} className="shrink-0" />
      {message}
    </p>
  );
}

interface LimitInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}

function LimitInput({ id, label, value, min, max, disabled, onCommit }: LimitInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const numeric = Number(draft);
    const next = Number.isFinite(numeric)
      ? Math.min(max, Math.max(min, Math.round(numeric)))
      : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label htmlFor={id} className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          className="h-8 w-full rounded-md border border-border bg-white px-2 text-[12px] tabular-nums outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground"
        />
        <span className="text-[11px] text-muted-foreground">字</span>
      </div>
    </label>
  );
}

export interface AdBriefFormProps {
  brief: AdBrief;
  issues: AdBriefIssue[];
  service: AdServiceStatus;
  generating: boolean;
  customLimits: boolean;
  hasOffer: boolean;
  onPatch: (patch: Partial<AdBrief>) => void;
  onPlatformChange: (platform: AdPlatform) => void;
  onToggleAngle: (id: AdAngleId) => void;
  onLimitsChange: (patch: Partial<AdLimits>) => void;
  onToggleCustomLimits: (next: boolean) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onClear: () => void;
  onLoadExample: () => void;
}

export function AdBriefForm({
  brief,
  issues,
  service,
  generating,
  customLimits,
  hasOffer,
  onPatch,
  onPlatformChange,
  onToggleAngle,
  onLimitsChange,
  onToggleCustomLimits,
  onGenerate,
  onCancel,
  onClear,
  onLoadExample,
}: AdBriefFormProps) {
  const canGenerate = issues.length === 0 && !generating && service !== 'missing';
  const platformRule = AD_PLATFORM_RULES[brief.platform];

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (canGenerate) onGenerate();
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[16px] font-bold">
              <Package size={16} className="text-teal-600" />
              產品與優惠
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              只填你確定的事實；AI 不會自行補數字、客戶名、獎項或療效。
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={generating}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2.5 text-[12px] font-medium transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={12} />
            清空
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ad-product-name" className="text-[13px] font-medium">
                產品／服務名稱 <span className="text-rose-600">*</span>
              </label>
              <span className={counterClass(countChars(brief.productName), AD_INPUT_LIMITS.productName)}>
                {countChars(brief.productName)} / {AD_INPUT_LIMITS.productName}
              </span>
            </div>
            <Input
              id="ad-product-name"
              value={brief.productName}
              onChange={(event) => onPatch({ productName: event.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="例：手工低糖月餅禮盒"
              className="mt-1 h-9 text-[13px]"
            />
            <FieldError message={issueFor(issues, 'productName')} />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ad-selling-points" className="text-[13px] font-medium">
                主要賣點 <span className="text-rose-600">*</span>
              </label>
              <span className={counterClass(countChars(brief.sellingPoints), AD_INPUT_LIMITS.sellingPoints)}>
                {countChars(brief.sellingPoints)} / {AD_INPUT_LIMITS.sellingPoints}
              </span>
            </div>
            <Textarea
              id="ad-selling-points"
              value={brief.sellingPoints}
              onChange={(event) => onPatch({ sellingPoints: event.target.value })}
              onKeyDown={handleKeyDown}
              rows={5}
              placeholder={'每行一個賣點，例：\n低糖配方，甜度減半\n每日手工烘焙\n獨立包裝，送禮體面'}
              className="mt-1 min-h-[128px] resize-y bg-[#fbfdff] text-[13px] leading-relaxed"
            />
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">快速示例：</span>
              {SELLING_POINT_EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => onPatch({ sellingPoints: example.text })}
                  title="會覆蓋目前的賣點"
                  className="rounded border border-border bg-muted/20 px-2 py-0.5 text-[11px] text-[#0d1a2d]/70 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                >
                  {example.label}
                </button>
              ))}
            </div>
            <FieldError message={issueFor(issues, 'sellingPoints')} />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="ad-offer" className="text-[13px] font-medium">
                優惠條件 <span className="text-[11px] font-normal text-muted-foreground">（選填）</span>
              </label>
              <span className={counterClass(countChars(brief.offer), AD_INPUT_LIMITS.offer)}>
                {countChars(brief.offer)} / {AD_INPUT_LIMITS.offer}
              </span>
            </div>
            <Input
              id="ad-offer"
              value={brief.offer}
              onChange={(event) => onPatch({ offer: event.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="例：9 月 20 日前訂購享 85 折，限 200 盒"
              className="mt-1 h-9 text-[13px]"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              沒有優惠可留空；「限時優惠」切角會自動停用，AI 也不會提及折扣或期限。
            </p>
            <FieldError message={issueFor(issues, 'offer')} />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 sm:p-6">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-bold">
            <Target size={16} className="text-teal-600" />
            投放設定
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            平台決定標題／主文上限；切角決定這次要測哪幾個角度。
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <span className="text-[13px] font-medium">投放目標</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {AD_GOAL_ORDER.map((goal) => {
                const selected = brief.goal === goal;
                return (
                  <button
                    key={goal}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPatch({ goal: goal as AdGoal })}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                      selected
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-border bg-white text-muted-foreground hover:border-teal-200 hover:text-teal-700',
                    )}
                  >
                    {AD_GOAL_LABELS[goal]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[13px] font-medium">投放平台</span>
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {AD_PLATFORM_ORDER.map((platform) => {
                const selected = brief.platform === platform;
                const rule = AD_PLATFORM_RULES[platform];
                return (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPlatformChange(platform)}
                    className={cn(
                      'rounded-md border p-2.5 text-left transition-colors',
                      selected
                        ? 'border-teal-600 bg-teal-50/60'
                        : 'border-border bg-white hover:border-teal-200',
                    )}
                  >
                    <span className={cn('block text-[12px] font-semibold', selected ? 'text-teal-800' : 'text-[#0d1a2d]')}>
                      {rule.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      標題 {rule.headlineLimit}／主文 {rule.bodyLimit}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{platformRule.note}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="ad-audience" className="text-[13px] font-medium">
                  目標受眾 <span className="text-[11px] font-normal text-muted-foreground">（選填）</span>
                </label>
                <span className={counterClass(countChars(brief.audience), AD_INPUT_LIMITS.audience)}>
                  {countChars(brief.audience)} / {AD_INPUT_LIMITS.audience}
                </span>
              </div>
              <Input
                id="ad-audience"
                value={brief.audience}
                onChange={(event) => onPatch({ audience: event.target.value })}
                onKeyDown={handleKeyDown}
                placeholder="例：25–45 歲香港在職女性"
                className="mt-1 h-9 text-[13px]"
              />
              <FieldError message={issueFor(issues, 'audience')} />
            </div>

            <div>
              <label htmlFor="ad-tone" className="text-[13px] font-medium">
                語氣
              </label>
              <select
                id="ad-tone"
                value={brief.tone}
                onChange={(event) => onPatch({ tone: event.target.value as AdTone })}
                className="mt-1 h-9 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                {AD_TONE_ORDER.map((tone) => (
                  <option key={tone} value={tone}>
                    {AD_TONE_LABELS[tone]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium">切角</span>
              <span className="text-[11px] text-muted-foreground">
                已選 {brief.angleIds.length} 個（3–5 個）
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {AD_ANGLE_ORDER.map((id) => {
                const selected = brief.angleIds.includes(id);
                const disabled = id === 'offer' && !hasOffer;
                const Icon = ANGLE_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    title={
                      disabled
                        ? '先填優惠條件，才能使用限時優惠切角'
                        : AD_ANGLES[id].description
                    }
                    onClick={() => onToggleAngle(id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                      selected
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-border bg-white text-muted-foreground hover:border-teal-200 hover:text-teal-700',
                      disabled && 'cursor-not-allowed opacity-45 hover:border-border hover:text-muted-foreground',
                    )}
                  >
                    <Icon size={13} />
                    {AD_ANGLES[id].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              沒有提供的證明或口碑資料，AI 不會自行編造數字；「專業背書／口碑見證」只會用你寫的內容。
            </p>
            <FieldError message={issueFor(issues, 'angleIds')} />
          </div>

          <div className="rounded-md border border-[rgba(13,26,45,0.06)] bg-[#f5f8fc] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#0d1a2d]/80">長度上限</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={customLimits}
                  onChange={(event) => onToggleCustomLimits(event.target.checked)}
                  className="h-3.5 w-3.5 accent-teal-600"
                />
                自訂上限
              </label>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <LimitInput
                id="ad-limit-headline"
                label="標題"
                value={brief.limits.headline}
                min={AD_LIMIT_RANGES.headline[0]}
                max={AD_LIMIT_RANGES.headline[1]}
                disabled={!customLimits}
                onCommit={(value) => onLimitsChange({ headline: value })}
              />
              <LimitInput
                id="ad-limit-body"
                label="主文"
                value={brief.limits.body}
                min={AD_LIMIT_RANGES.body[0]}
                max={AD_LIMIT_RANGES.body[1]}
                disabled={!customLimits}
                onCommit={(value) => onLimitsChange({ body: value })}
              />
              <LimitInput
                id="ad-limit-cta"
                label="CTA"
                value={brief.limits.cta}
                min={AD_LIMIT_RANGES.cta[0]}
                max={AD_LIMIT_RANGES.cta[1]}
                disabled={!customLimits}
                onCommit={(value) => onLimitsChange({ cta: value })}
              />
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {customLimits
                ? '自訂上限高於平台建議時，實際投放可能被平台截斷；生成時仍會按你設定的上限修剪。'
                : `目前使用 ${platformRule.label} 預設；勾選「自訂上限」可改。`}
            </p>
            <FieldError message={issueFor(issues, 'limits')} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLoadExample}
              disabled={generating}
              className="inline-flex h-8 items-center rounded-md border border-border bg-white px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              載入示例
            </button>
            <span className="text-[11px] text-muted-foreground">Ctrl／Cmd + Enter 快速生成</span>
          </div>

          <div className="flex items-center gap-2">
            {generating && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-9 items-center rounded-md border border-border bg-white px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40"
              >
                取消
              </button>
            )}
            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              title={service === 'missing' ? '請先部署生成服務' : undefined}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-teal-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? '生成中…' : '生成文案矩陣'}
            </button>
          </div>
        </div>

        {issues.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-600" role="status">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {issues[0].message}
          </p>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          生成會把產品資料送到 AI 供應商（Grok／Gemini）；請勿輸入客戶個資、未公開報價或機密。本工具不寫入資料庫。
        </p>
      </section>
    </div>
  );
}
