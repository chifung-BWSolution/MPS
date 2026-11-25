import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  PLATFORM_ORDER,
  PLATFORM_RULES,
  deriveSetTitle,
  toMarkdown,
  toPlainText,
  type CopyBrief,
  type CopyPlatform,
} from '@/lib/crosspost';
import { cn } from '@/lib/utils';
import { PlatformVariantCard } from './PlatformVariantCard';
import { copyTextToClipboard } from './clipboard';
import type { CrosspostGenerationState } from './types';

export interface CrosspostResultViewProps {
  brief: CopyBrief;
  generation: CrosspostGenerationState;
  regenerating: boolean;
  saving: boolean;
  onRetrySave: () => void;
  onRegenerate: () => void;
}

function dateStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ProviderBadge({ provider }: { provider: 'grok' | 'gemini' | null }) {
  if (!provider) {
    return (
      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
        歷史紀錄
      </span>
    );
  }
  const isGemini = provider === 'gemini';
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-[11px] font-semibold',
        isGemini ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700',
      )}
    >
      {isGemini ? '由 Gemini 後備生成' : '由 Grok 生成'}
    </span>
  );
}

function MissingPanel({ platform }: { platform: CopyPlatform }) {
  const rule = PLATFORM_RULES[platform];
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <p className="text-[14px] font-medium text-[#0d1a2d]">{rule.label} 版本本次未生成</p>
      <p className="max-w-md text-[12px] text-muted-foreground">
        AI 回覆缺少此平台，或格式不合格。按右上角「重新生成」可補齊；其他平台版本不受影響。
      </p>
    </div>
  );
}

export function CrosspostResultView({
  brief,
  generation,
  regenerating,
  saving,
  onRetrySave,
  onRegenerate,
}: CrosspostResultViewProps) {
  const existing = new Set(generation.variants.map((variant) => variant.platform));
  const [active, setActive] = useState<CopyPlatform>(
    () => generation.variants[0]?.platform ?? 'ig',
  );

  useEffect(() => {
    if (generation.variants.length > 0 && !existing.has(active)) {
      setActive(generation.variants[0].platform);
    }
    // existing 每次 render 都是新 Set，這裡只依賴 variants 與 active
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation.variants, active]);

  const activeVariant = generation.variants.find((variant) => variant.platform === active);

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(toPlainText(generation.variants));
    if (ok) toast.success('五個版本已複製');
    else toast.error('無法存取剪貼板，請手動選取文字');
  };

  const handleDownload = () => {
    const markdown = toMarkdown({
      brief,
      variants: generation.variants,
      provider: generation.provider,
      model: generation.model,
      createdAt: generation.savedAt ?? new Date().toISOString(),
    });
    const safeTitle = deriveSetTitle(brief.coreInfo).replace(/[\\/:*?"<>|]/g, '_');
    downloadText(`跨平台文案_${safeTitle}_${dateStamp()}.md`, markdown);
    toast.success('已下載 Markdown');
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ProviderBadge provider={generation.provider} />
            {generation.model && (
              <span className="text-[11px] text-muted-foreground" title={generation.model}>
                {generation.model}
              </span>
            )}
            {typeof generation.latencyMs === 'number' && generation.latencyMs > 0 && (
              <span className="text-[11px] text-muted-foreground">
                · {(generation.latencyMs / 1000).toFixed(1)} 秒
              </span>
            )}
            {generation.savedId ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 size={12} />
                已存入歷史
              </span>
            ) : saving ? (
              <span className="text-[11px] text-muted-foreground">儲存中…</span>
            ) : (
              <span className="text-[11px] font-medium text-amber-600">未儲存</span>
            )}
          </div>
          <p className="mt-1 truncate text-[12px] text-muted-foreground">
            受眾：{brief.audience}｜CTA：{brief.cta}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#0d1a2d]/75 transition-colors hover:bg-muted/30"
          >
            <Copy size={13} />
            複製全部
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#0d1a2d]/75 transition-colors hover:bg-muted/30"
          >
            <Download size={13} />
            下載 .md
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
              regenerating
                ? 'cursor-not-allowed bg-teal-600/50 text-white'
                : 'bg-teal-600 text-white hover:bg-teal-700',
            )}
          >
            <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
            {regenerating ? '生成中…' : '重新生成'}
          </button>
        </div>
      </div>

      {generation.saveError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <span className="min-w-0 break-words">
            文案已生成，但未能存入歷史：{generation.saveError}
          </span>
          <button
            type="button"
            onClick={onRetrySave}
            disabled={saving}
            className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
          >
            {saving ? '儲存中…' : '重試儲存'}
          </button>
        </div>
      )}

      {generation.missingPlatforms.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          本次未生成：
          {generation.missingPlatforms.map((platform) => PLATFORM_RULES[platform].label).join('、')}
          。可按「重新生成」補齊，其餘版本可正常使用。
        </div>
      )}

      <div
        role="tablist"
        aria-label="平台版本"
        className="flex flex-wrap gap-1 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-card"
      >
        {PLATFORM_ORDER.map((platform) => {
          const hasVariant = existing.has(platform);
          const isActive = active === platform;
          return (
            <button
              key={platform}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(platform)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors',
                isActive
                  ? 'bg-[#0d1a2d] text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
                !hasVariant && !isActive && 'opacity-60',
              )}
            >
              {PLATFORM_RULES[platform].label}
              {!hasVariant && (
                <span
                  className={cn(
                    'rounded px-1 py-0.5 text-[9px] font-bold',
                    isActive ? 'bg-white/15 text-white/80' : 'bg-amber-50 text-amber-700',
                  )}
                >
                  未生成
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-card">
        {activeVariant ? (
          <PlatformVariantCard variant={activeVariant} />
        ) : (
          <MissingPanel platform={active} />
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        字數以 Unicode 字元計（含標點與換行），Hashtag 另計；超標只提示，不會自動裁剪。
      </p>
    </section>
  );
}
