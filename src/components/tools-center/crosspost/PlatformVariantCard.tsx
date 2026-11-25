import { useState } from 'react';
import { Check, Copy, Hash } from 'lucide-react';
import { toast } from 'sonner';
import {
  PLATFORM_RULES,
  evaluateVariant,
  platformRuleSummary,
  variantClipboardText,
  type CopyVariant,
} from '@/lib/crosspost';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from './clipboard';

function counterClass(over: boolean, near: boolean): string {
  return cn(
    'text-[11px] tabular-nums',
    over ? 'font-semibold text-rose-600' : near ? 'font-medium text-amber-600' : 'text-muted-foreground',
  );
}

export function PlatformVariantCard({ variant }: { variant: CopyVariant }) {
  const rule = PLATFORM_RULES[variant.platform];
  const evaluation = evaluateVariant(variant);
  const [copied, setCopied] = useState(false);

  const copy = async (text: string, message: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) toast.success(message);
    else toast.error('無法存取剪貼板，請手動選取文字');
  };

  const handleCopyVariant = async () => {
    const ok = await copyTextToClipboard(variantClipboardText(variant));
    if (!ok) {
      toast.error('無法存取剪貼板，請手動選取文字');
      return;
    }
    setCopied(true);
    toast.success(`${rule.label} 已複製`);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const nearBodyLimit = evaluation.ratio >= 0.9;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-[#0d1a2d]">{rule.label} 版本</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {rule.fullName}｜{platformRuleSummary(variant.platform)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopyVariant}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
            copied
              ? 'border-teal-200 bg-teal-50 text-teal-700'
              : 'border-border bg-white text-[#0d1a2d]/75 hover:bg-muted/30',
          )}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已複製' : '複製此版'}
        </button>
      </div>

      {rule.titleLimit !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-muted-foreground">
              {rule.format === 'email' ? '主旨' : '標題'}
            </span>
            <span className={counterClass(evaluation.overTitle, false)}>
              {evaluation.titleCount ?? 0} / {rule.titleLimit}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-[13px] font-medium leading-relaxed text-[#0d1a2d]">
            {variant.title || '（未提供）'}
          </p>
        </div>
      )}

      {rule.previewLimit !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-muted-foreground">預覽文字</span>
            <span className={counterClass(evaluation.overPreview, false)}>
              {evaluation.previewCount ?? 0} / {rule.previewLimit}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-[13px] leading-relaxed text-[#0d1a2d]">
            {variant.previewText || '（未提供）'}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-muted-foreground">
            {rule.format === 'email' ? '內文' : '正文'}
          </span>
          <span className={counterClass(evaluation.overBody, nearBodyLimit)} aria-live="polite">
            {evaluation.charCount.toLocaleString()} / {evaluation.bodyLimit.toLocaleString()}
            {evaluation.overBody ? '（超出上限）' : ''}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-[13px] leading-relaxed text-[#0d1a2d]">
          {variant.body}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
            <Hash size={12} />
            Hashtag
          </span>
          <span
            className={cn(
              'text-[11px] tabular-nums',
              evaluation.underHashtags || evaluation.overHashtags
                ? 'font-medium text-amber-600'
                : 'text-muted-foreground',
            )}
          >
            {evaluation.hashtagCount} 個
            {rule.hashtagLimit > 0
              ? `（建議 ${evaluation.hashtagMin}–${evaluation.hashtagMax}）`
              : '（此平台不需要）'}
          </span>
        </div>

        {variant.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {variant.hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  void copy(tag, `${tag} 已複製`);
                }}
                title="點擊複製"
                className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
              >
                {tag}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                void copy(variant.hashtags.join(' '), 'Hashtag 已複製');
              }}
              className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30"
            >
              複製全部 Hashtag
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            {rule.hashtagLimit > 0 ? 'AI 未提供 Hashtag，可重新生成。' : 'eDM 不需要 Hashtag。'}
          </p>
        )}
      </div>
    </div>
  );
}
