import {
  ArrowLeftRight,
  Award,
  BadgePercent,
  Clock,
  MessageCircle,
  Target,
  Undo2,
} from 'lucide-react';

import {
  AD_ANGLES,
  adCopyKey,
  buildVariantText,
  countChars,
  type AdAngleId,
  type AdAngleResult,
  type AdBrief,
  type AdCopyField,
  type AdCopyOverrides,
  type AdVariantKey,
} from '@/lib/adCreative';
import { cn } from '@/lib/utils';
import { CopyButton } from '../../shared/CopyButton';

const ANGLE_ICONS = {
  pain: Target,
  time: Clock,
  offer: BadgePercent,
  proof: Award,
  social: MessageCircle,
  contrast: ArrowLeftRight,
} as const;

function fieldCounterClass(current: number, limit: number): string {
  return cn(
    'text-[10px] tabular-nums',
    current > limit
      ? 'font-semibold text-rose-600'
      : current > limit * 0.9
        ? 'font-medium text-amber-600'
        : 'text-muted-foreground',
  );
}

interface EditableFieldProps {
  id: string;
  label: string;
  value: string;
  limit: number;
  multiline?: boolean;
  rows?: number;
  overridden: boolean;
  truncated: boolean;
  stale: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}

function EditableField({
  id,
  label,
  value,
  limit,
  multiline = false,
  rows = 4,
  overridden,
  truncated,
  stale,
  onChange,
  onReset,
}: EditableFieldProps) {
  const count = countChars(value);
  const overLimit = count > limit;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {truncated && <span className="text-[10px] text-amber-700">已縮短</span>}
          {overridden && (
            <button
              type="button"
              onClick={onReset}
              title="還原 AI 原文"
              aria-label={`還原${label}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-[#0d1a2d]"
            >
              <Undo2 size={11} />
            </button>
          )}
          <span className={fieldCounterClass(count, limit)}>
            {count} / {limit}
          </span>
          <CopyButton
            text={value}
            label={`複製${label}`}
            iconOnly
            disabled={stale || !value}
          />
        </div>
      </div>

      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={overLimit}
          className={cn(
            'mt-1 w-full resize-y rounded-md border bg-white px-2.5 py-1.5 text-[12.5px] leading-relaxed outline-none transition-colors focus:ring-2 focus:ring-teal-100',
            overLimit
              ? 'border-rose-300 focus:border-rose-400'
              : 'border-border focus:border-teal-500',
          )}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={overLimit}
          className={cn(
            'mt-1 h-8 w-full rounded-md border bg-white px-2.5 text-[12.5px] outline-none transition-colors focus:ring-2 focus:ring-teal-100',
            overLimit
              ? 'border-rose-300 focus:border-rose-400'
              : 'border-border focus:border-teal-500',
          )}
        />
      )}
      {overLimit && (
        <p className="mt-1 text-[10px] text-rose-600">
          超出上限 {count - limit} 字；複製／匯出仍會用你改後的內容。
        </p>
      )}
    </div>
  );
}

export interface AdAngleCardProps {
  angle: AdAngleResult;
  brief: AdBrief;
  overrides: AdCopyOverrides;
  stale: boolean;
  onEdit: (variant: AdVariantKey, field: AdCopyField, value: string) => void;
  onResetField: (variant: AdVariantKey, field: AdCopyField) => void;
}

export function AdAngleCard({
  angle,
  brief,
  overrides,
  stale,
  onEdit,
  onResetField,
}: AdAngleCardProps) {
  const Icon = ANGLE_ICONS[angle.id as AdAngleId] ?? Target;
  const angleCopyText = [
    buildVariantText(angle, 'A', brief.productName),
    buildVariantText(angle, 'B', brief.productName),
    `CTA 變體：${angle.ctaVariants.join(' / ')}`,
  ].join('\n\n');

  const isOverridden = (variant: AdVariantKey, field: AdCopyField) =>
    Object.prototype.hasOwnProperty.call(overrides, adCopyKey(angle.id, variant, field));

  return (
    <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold">{angle.label}</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{angle.why}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border border-teal-100 bg-teal-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-teal-700"
            title="A/B 只改開頭鉤子；主文核心與 CTA 相同"
          >
            測試變數：{angle.testVariable}
          </span>
          <CopyButton
            text={angleCopyText}
            label="複製整個切角"
            disabled={stale}
            className="text-[11px]"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(['A', 'B'] as const).map((variant) => {
          const copy = angle.variants[variant];
          return (
            <div key={variant} className="rounded-md border border-border/60 bg-[#fbfdff] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0d1a2d]">
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded text-[10px] font-bold',
                      variant === 'A'
                        ? 'bg-[#0d1a2d] text-white'
                        : 'bg-teal-600 text-white',
                    )}
                  >
                    {variant}
                  </span>
                  {variant === 'A' ? 'A 版' : 'B 版'}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {copy.hookType}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                <EditableField
                  id={`ad-${angle.id}-${variant}-headline`}
                  label="短標題"
                  value={copy.headline}
                  limit={brief.limits.headline}
                  overridden={isOverridden(variant, 'headline')}
                  truncated={angle.truncatedFields.includes('headline') && !isOverridden(variant, 'headline')}
                  stale={stale}
                  onChange={(value) => onEdit(variant, 'headline', value)}
                  onReset={() => onResetField(variant, 'headline')}
                />
                <EditableField
                  id={`ad-${angle.id}-${variant}-body`}
                  label="主文"
                  value={copy.body}
                  limit={brief.limits.body}
                  multiline
                  rows={4}
                  overridden={isOverridden(variant, 'body')}
                  truncated={angle.truncatedFields.includes('body') && !isOverridden(variant, 'body')}
                  stale={stale}
                  onChange={(value) => onEdit(variant, 'body', value)}
                  onReset={() => onResetField(variant, 'body')}
                />
                <EditableField
                  id={`ad-${angle.id}-${variant}-cta`}
                  label="CTA"
                  value={copy.cta}
                  limit={brief.limits.cta}
                  overridden={isOverridden(variant, 'cta')}
                  truncated={angle.truncatedFields.includes('cta') && !isOverridden(variant, 'cta')}
                  stale={stale}
                  onChange={(value) => onEdit(variant, 'cta', value)}
                  onReset={() => onResetField(variant, 'cta')}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">CTA 變體</span>
          {angle.ctaPadded && (
            <span className="text-[10px] text-amber-700">AI 未提供足夠 CTA，已補通用選項</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {angle.ctaVariants.map((cta, index) => (
            <CopyButton
              key={`${angle.id}-cta-${index}`}
              text={cta}
              label={cta}
              disabled={stale}
              className="h-7 rounded-full border-teal-100 bg-teal-50/50 px-2.5 text-[11px] font-medium text-teal-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {AD_ANGLES[angle.id].description} A/B 只改開頭鉤子；如要測試 CTA，請把同一版主文配上不同 CTA。
        </p>
      </div>
    </section>
  );
}
