import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { canAccessSettings } from '@/lib/permissions';
import {
  ALL_SOCIAL_PLATFORMS,
  HK_REWRITE_MAX_INPUT,
  rewriteHkDraft,
  type HkRewriteResult,
  type SocialPlatform,
} from '@/lib/hkCantoneseRewrite';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from './CopyButton';
import { HighlightedText, MarkLegend } from './HighlightedText';
import { ReplacementTable, type ReplacementFilter } from './ReplacementTable';
import { SocialPreview } from './SocialPreview';
import { RewriteRulesPanel } from './RewriteRulesPanel';

const SAMPLE =
  '这个产品的质量很好，我们没有空调，但是自行车可以放楼下。客服通过微信回复很快，充电宝也可以借。整体性价比高，值得推荐。';

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string }[] = [
  { value: 'instagram', label: 'IG' },
  { value: 'facebook', label: 'FB' },
  { value: 'xiaohongshu', label: '小紅書' },
];

export function HkRewritePanel() {
  const { systemUser } = useAuth();
  const canViewPrompt = canAccessSettings(systemUser?.role);
  const [input, setInput] = useState('');
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([...ALL_SOCIAL_PLATFORMS]);
  const [result, setResult] = useState<HkRewriteResult | null>(null);
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>('instagram');
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ReplacementFilter>('all');

  const stale = useMemo(() => {
    if (!result) return false;
    return (
      result.input !== input ||
      result.platforms.join(',') !== platforms.join(',')
    );
  }, [input, platforms, result]);

  const handleRun = () => {
    if (!input.trim()) return;
    if (platforms.length === 0) {
      toast.info('請至少選一個平台');
      return;
    }
    const next = rewriteHkDraft(input, { platforms });
    setResult(next);
    setReviewed(new Set());
    if (!next.platforms.includes(activePlatform)) {
      setActivePlatform(next.platforms[0] ?? 'instagram');
    }
  };

  const togglePlatform = (platform: SocialPlatform) => {
    setPlatforms((previous) => {
      if (previous.includes(platform)) {
        if (previous.length === 1) {
          toast.info('至少保留一個平台');
          return previous;
        }
        return previous.filter((item) => item !== platform);
      }
      return ALL_SOCIAL_PLATFORMS.filter(
        (item) => previous.includes(item) || item === platform,
      );
    });
  };

  const handleClear = () => {
    setInput('');
    setResult(null);
    setReviewed(new Set());
    setFilter('all');
  };

  const handleSample = () => {
    setInput(SAMPLE);
    setResult(null);
    setReviewed(new Set());
    setFilter('all');
  };

  const toggleReviewed = (ruleId: string) => {
    setReviewed((previous) => {
      const next = new Set(previous);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const markAllReviewed = () => {
    if (!result) return;
    setReviewed(new Set(result.replacements.map((row) => row.ruleId)));
  };

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-[0_2px_6px_rgba(0,20,40,0.05)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[16px] font-bold">
              <FileText size={16} className="text-teal-600" />
              原文 / 草稿
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              貼入客戶原文、內地／台灣稿或粵語草稿；系統會先轉成香港書面語，再生成社群口語版。
            </p>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className={cn(input.length > HK_REWRITE_MAX_INPUT * 0.9 && 'font-medium text-amber-700')}>
              {input.length.toLocaleString()} / {HK_REWRITE_MAX_INPUT.toLocaleString()} 字
            </span>
            <button
              type="button"
              onClick={handleClear}
              disabled={!input && !result}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2.5 font-medium transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={12} />
              清空
            </button>
          </div>
        </div>

        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              handleRun();
            }
          }}
          maxLength={HK_REWRITE_MAX_INPUT}
          aria-label="原文或草稿"
          placeholder="例如：这个产品的质量很好，我们没有空调，但是自行车可以放楼下……"
          className="mt-3 min-h-[190px] resize-y bg-[#fbfdff] text-[14px] leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-muted-foreground">輸出平台</span>
            {PLATFORM_OPTIONS.map((option) => {
              const selected = platforms.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => togglePlatform(option.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                    selected
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-border bg-white text-muted-foreground hover:border-teal-200 hover:text-teal-700',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSample}
              className="inline-flex h-8 items-center rounded-md border border-border bg-white px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              載入示例
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={!input.trim() || platforms.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-teal-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={14} />
              一鍵改寫
            </button>
          </div>
        </div>

        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck size={12} />
          全部在瀏覽器處理，草稿不會上傳；Ctrl／Cmd + Enter 快速改寫。
        </p>
      </section>

      {stale && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          原文或平台已修改，請重新按「一鍵改寫」再複製，避免貼到舊版本。
        </div>
      )}

      {result ? (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <WrittenCard result={result} stale={stale} />
            <SocialPreview
              variants={result.social}
              active={activePlatform}
              onChange={setActivePlatform}
              stale={stale}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ReplacementTable
              replacements={result.replacements}
              reviewed={reviewed}
              filter={filter}
              onFilterChange={setFilter}
              onToggle={toggleReviewed}
              onMarkAll={markAllReviewed}
            />
            <ToneIssuesCard issues={result.issues} colloquialCount={result.colloquialCount} />
          </div>
        </>
      ) : (
        <EmptyState onSample={handleSample} />
      )}

      {canViewPrompt && <RewriteRulesPanel input={input} />}
    </div>
  );
}

export function WrittenCard({ result, stale }: { result: HkRewriteResult; stale: boolean }) {
  return (
    <section className="flex h-full flex-col rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-bold">
            <FileText size={16} className="text-teal-600" />
            香港書面語版
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {result.stats.replacements > 0
              ? `已替換 ${result.stats.replacements} 處 · ${result.stats.chars} 字`
              : `未發現非港式詞彙 · ${result.stats.chars} 字`}
          </p>
        </div>
        <CopyButton text={result.writtenText} label="複製" disabled={stale} />
      </div>

      <MarkLegend className="mt-3" kinds={['shape', 'written']} />

      <div className="mt-3 min-h-[160px] flex-1 overflow-auto rounded-md border border-border/60 bg-[#fbfdff] p-4">
        <HighlightedText
          text={result.writtenText}
          marks={result.writtenMarks}
          className="text-[14px] leading-relaxed text-[#0d1a2d]"
        />
      </div>

      {result.stats.replacements === 0 && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-teal-700">
          <CheckCircle2 size={12} />
          {result.writtenMarks.some((mark) => mark.kind === 'shape')
            ? '簡體字已轉繁體，未發現其他非港式詞彙；仍建議人手讀一次語氣。'
            : '未發現非港式詞彙，仍建議人手讀一次語氣。'}
        </p>
      )}
    </section>
  );
}

export function ToneIssuesCard({
  issues,
  colloquialCount,
}: {
  issues: string[];
  colloquialCount: number;
}) {
  return (
    <section className="flex h-full flex-col rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-bold">
            <AlertTriangle size={16} className="text-amber-500" />
            語氣提醒
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {issues.length} 項 · 口語版另替換 {colloquialCount} 種詞
          </p>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2.5 text-[12px] leading-relaxed text-teal-800">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <span>冇發現宣傳腔、AI 過渡詞或浮誇用語。</span>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {issues.map((issue, index) => (
            <li
              key={`${issue}-${index}`}
              className="flex items-start gap-2 text-[12px] leading-relaxed text-[#0d1a2d]"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-auto pt-4 text-[11px] leading-relaxed text-muted-foreground">
        提醒只針對文字風格，不代表事實、療效或法律審查。
      </p>
    </section>
  );
}

function EmptyState({ onSample }: { onSample: () => void }) {
  const steps = [
    '貼入原文、草稿或粵語口語稿',
    '一鍵產生香港書面語版 + IG／FB／小紅書口語版',
    '用顏色標示及替換表逐項核對',
  ];

  return (
    <section className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-8 text-center shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
        <Sparkles size={22} className="text-teal-600" />
      </div>
      <h3 className="mt-3 text-[16px] font-bold">貼入原文，一鍵輸出兩個版本</h3>
      <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
        香港書面語版 + 社群口語版；替換詞會標色並列成清單，方便人手快速核對。
      </p>
      <ol className="mx-auto mt-4 flex max-w-2xl flex-col gap-2 text-left sm:flex-row sm:gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex flex-1 items-start gap-2 rounded-md border border-border/60 bg-[#fbfdff] px-3 py-2 text-[12px] leading-relaxed">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onSample}
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-3 text-[12px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
      >
        <Sparkles size={13} />
        載入示例
      </button>
      <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        <ShieldCheck size={12} />
        全部在瀏覽器處理，草稿不會上傳。
      </p>
    </section>
  );
}
