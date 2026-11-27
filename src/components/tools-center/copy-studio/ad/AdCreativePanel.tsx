import { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, Download, Home, Megaphone, RefreshCw } from 'lucide-react';

import {
  AD_GOAL_LABELS,
  AD_PLATFORM_RULES,
  AD_TONE_LABELS,
  providerLabel,
} from '@/lib/adCreative';
import { CopyButton } from '../../shared/CopyButton';
import { AdAngleCard } from './AdAngleCard';
import { AdBriefForm } from './AdBriefForm';
import { AdGeneratingCard } from './AdGeneratingCard';
import { AdMatrixTable } from './AdMatrixTable';
import { AdErrorBanner, AdServiceBanner } from './AdServiceBanner';
import { downloadAdCsv } from './adCopyExport';
import { useAdCreative } from './useAdCreative';

export interface AdCreativePanelProps {
  active: boolean;
  onModelUsed?: (point: { model: string; createdAt: string }) => void;
}

type AdPhase = 'brief' | 'generating' | 'result';

/**
 * 三段式版面：
 *   1. brief      只看輸入表單（沒有任何「尚未生成」佔位卡）
 *   2. generating 隱藏所有輸入卡，只留生成中提示卡（有動畫、可取消）
 *   3. result     淡入＋上移過渡到結果頁；可「重新生成」（保留簡報回表單，不自動生成）或「返回首頁」（清空回首頁）
 */
export function AdCreativePanel({ active, onModelUsed }: AdCreativePanelProps) {
  const ad = useAdCreative({ active });
  const result = ad.effectiveResult;

  useEffect(() => {
    if (!result?.model || !result.generatedAt) return;
    onModelUsed?.({ model: result.model, createdAt: result.generatedAt });
  }, [onModelUsed, result?.generatedAt, result?.model]);

  const phase: AdPhase = ad.generating && !result ? 'generating' : result ? 'result' : 'brief';
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const previousPhaseRef = useRef<AdPhase>(phase);

  // 階段切換時把區塊捲到可見位置（第一次渲染不捲，避免一進頁就跳）
  useEffect(() => {
    if (previousPhaseRef.current === phase) return;
    previousPhaseRef.current = phase;
    const node = sectionRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: phase === 'result' ? 'start' : 'center' });
  }, [phase]);

  const handleRegenerate = useCallback(() => {
    ad.backToBrief(true);
  }, [ad]);

  const handleBackHome = useCallback(() => {
    // 清空簡報與結果，留在本工具回到起始表單（不自動生成、也不離開頁面）
    ad.backToBrief(false);
  }, [ad]);

  return (
    <div ref={sectionRef} className="space-y-5">
      {phase === 'brief' && (
        <div
          key="brief"
          className="animate-in fade-in-0 slide-in-from-bottom-2 space-y-5 duration-300 motion-reduce:animate-none"
        >
          <AdServiceBanner
            status={ad.service}
            checking={ad.checking}
            onRetry={() => void ad.refreshService()}
          />

          <AdBriefForm
            brief={ad.brief}
            issues={ad.issues}
            service={ad.service}
            generating={ad.generating}
            customLimits={ad.customLimits}
            hasOffer={ad.brief.offer.trim().length > 0}
            onPatch={ad.patchBrief}
            onPlatformChange={ad.changePlatform}
            onToggleAngle={ad.toggleAngle}
            onLimitsChange={ad.changeLimits}
            onToggleCustomLimits={ad.toggleCustomLimits}
            onGenerate={ad.generate}
            onCancel={ad.cancel}
            onClear={ad.clear}
            onLoadExample={ad.loadExample}
          />

          {ad.error && (
            <AdErrorBanner
              code={ad.error.code}
              message={ad.error.message}
              onRetry={
                ad.error.code === 'not_deployed'
                  ? () => void ad.refreshService()
                  : ad.generate
              }
            />
          )}
        </div>
      )}

      {phase === 'generating' && (
        <AdGeneratingCard
          key="generating"
          angleCount={ad.brief.angleIds.length}
          platformLabel={AD_PLATFORM_RULES[ad.brief.platform].label}
          onCancel={ad.cancel}
        />
      )}

      {phase === 'result' && result && (
        <div
          key="result"
          className="animate-in fade-in-0 slide-in-from-bottom-3 space-y-5 duration-500 motion-reduce:animate-none"
        >
          <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-[16px] font-bold">
                  <Megaphone size={16} className="text-teal-600" />
                  已生成 {result.angles.length} 個切角 · {result.angles.length * 2} 組 A/B 文案
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {AD_PLATFORM_RULES[result.brief.platform].label} · 目標 {AD_GOAL_LABELS[result.brief.goal]} · 語氣{' '}
                  {AD_TONE_LABELS[result.brief.tone]} · {providerLabel(result.provider)}
                  {result.model ? ` / ${result.model}` : ''} ·{' '}
                  {(result.latencyMs / 1000).toFixed(1)} 秒
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  title="保留目前簡報，回到表單調整後再按「生成」（不會立即重新生成）"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                >
                  <RefreshCw size={12} />
                  重新生成
                </button>
                <button
                  type="button"
                  onClick={handleBackHome}
                  title="清空本次簡報與結果，回到起始頁"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                >
                  <Home size={12} />
                  返回首頁
                </button>
                <CopyButton text={ad.copyAllText} label="複製全部" disabled={ad.stale} />
                <button
                  type="button"
                  onClick={() => downloadAdCsv(result)}
                  disabled={ad.stale}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={12} />
                  匯出 CSV
                </button>
              </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              「重新生成」會保留你填的簡報並回到表單，不會立即重跑；調整後再按「生成文案矩陣」即可重新產出。
            </p>

            {ad.stale && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                設定已改，請重新生成；目前結果仍可查看，但不能複製／匯出。
              </div>
            )}

            {ad.editedCount > 0 && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-teal-100 bg-teal-50/60 px-3 py-1.5 text-[11px] text-teal-800">
                <span>已改 {ad.editedCount} 格；複製與匯出會用改後內容。</span>
                <button
                  type="button"
                  onClick={ad.resetAllEdits}
                  className="font-medium underline decoration-teal-300 underline-offset-2 hover:text-teal-900"
                >
                  全部還原
                </button>
              </div>
            )}

            {result.warnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-900">
                  <AlertTriangle size={13} />
                  生成提醒（{result.warnings.length}）
                </p>
                <ul className="mt-1.5 space-y-1">
                  {result.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <div className="space-y-4">
            {result.angles.map((angle) => (
              <AdAngleCard
                key={angle.id}
                angle={angle}
                brief={result.brief}
                overrides={ad.edits}
                stale={ad.stale}
                onEdit={(variant, field, value) => ad.updateCell(angle.id, variant, field, value)}
                onResetField={(variant, field) => ad.resetCell(angle.id, variant, field)}
              />
            ))}
          </div>

          <AdMatrixTable
            result={result}
            stale={ad.stale}
            onExport={() => downloadAdCsv(result)}
          />

          <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            AI 只會用你提供的資料；數字、評價與療效仍需人手核實，並不保證投放成效。
          </p>
        </div>
      )}
    </div>
  );
}
