/**
 * SEO 檢查面板（M3-05；PRD §9.1.3、§9.3.3）
 *
 * 硬檢查 9 項 / 軟檢查 6+ 項一律由 `contentSeoQa.evaluateSeoQa()` 計算，
 * 本檔只負責呈現（不重複實作任何檢查規則，契約 §7 硬規則 3）。
 *
 * 互動：未過的項目可點擊 → `onFocusField(field)`，由工作室把焦點移到編輯器對應欄位
 * （title／meta description／slug／canonical／正文／摘要）。
 */

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Gauge,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { blockingReasons } from '@/lib/contentSeoQa.ts';
import { formatZoneDateTime } from '@/lib/contentFormat.ts';
import type { ContentQaCheck, ContentQaReport } from '@/lib/contentTypes.ts';
import type { ArticleEditableField } from './ArticleEditor';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** 檢查 id → 編輯器欄位（點擊未過項目時跳轉的目標） */
const CHECK_FIELD_MAP: Record<string, ArticleEditableField> = {
  title_present: 'title',
  title_length: 'title',
  meta_present: 'meta_description',
  meta_length: 'meta_description',
  slug_valid: 'slug',
  slug_unique: 'slug',
  canonical_present: 'canonical',
  canonical_shape: 'canonical',
  word_count_min: 'body_md',
  word_count_max: 'body_md',
  banned_words: 'body_md',
  internal_links: 'body_md',
  excerpt: 'excerpt',
  h2_structure: 'body_md',
  keyword_usage: 'body_md',
  image_alt: 'body_md',
};

const FIELD_LABEL: Partial<Record<ArticleEditableField, string>> = {
  title: '主標題',
  slug: 'Slug',
  excerpt: '摘要',
  body_md: '正文',
  meta_title: 'Meta title',
  meta_description: 'Meta description',
  canonical: 'Canonical',
};

export interface SeoQaPanelProps {
  report: ContentQaReport;
  /** 字數目標（站點 seo_defaults；不給就不顯示範圍） */
  wordCountMin?: number;
  wordCountMax?: number;
  onFocusField?: (field: ArticleEditableField) => void;
  className?: string;
}

function CheckRow({
  check,
  onFocus,
}: {
  check: ContentQaCheck;
  onFocus?: (field: ArticleEditableField) => void;
}) {
  const antiField = CHECK_FIELD_MAP[check.id];
  const clickable = Boolean(onFocus) && Boolean(antiField);
  const Icon = check.passed ? CheckCircle2 : XCircle;
  const iconColor = check.passed
    ? 'text-emerald-600'
    : check.severity === 'hard'
      ? 'text-rose-600'
      : 'text-amber-600';

  const content = (
    <>
      <Icon size={14} strokeWidth={2} className={cn('mt-[1px] shrink-0', iconColor)} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'text-[12.5px] font-medium leading-snug',
            check.passed ? 'text-[#0d1a2d]' : check.severity === 'hard' ? 'text-rose-700' : 'text-amber-700',
          )}
        >
          {check.label}
        </div>
        <div className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
          {check.detail}
        </div>
      </div>
      {clickable && (
        <ChevronRight
          size={13}
          className="mt-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-teal-600"
        />
      )}
    </>
  );

  if (!clickable || !antiField || !onFocus) {
    return (
      <div
        className={cn(
          'flex items-start gap-2 rounded-md px-2 py-1.5',
          !check.passed && check.severity === 'hard' && 'bg-rose-50/70',
          !check.passed && check.severity === 'soft' && 'bg-amber-50/60',
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onFocus(antiField)}
            className={cn(
              'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-50',
              !check.passed && check.severity === 'hard' && 'bg-rose-50/70 hover:bg-rose-50',
              !check.passed && check.severity === 'soft' && 'bg-amber-50/60 hover:bg-amber-50',
            )}
          >
            {content}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[220px] text-[11px]">
          跳到「{FIELD_LABEL[antiField] ?? antiField}」欄位
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function GroupHeader({
  title,
  passed,
  total,
  hard,
}: {
  title: string;
  passed: number;
  total: number;
  hard: boolean;
}) {
  const allPassed = passed === total && total > 0;
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
        {hard ? (
          allPassed ? (
            <ShieldCheck size={13} className="text-emerald-600" strokeWidth={2} />
          ) : (
            <ShieldAlert size={13} className="text-rose-600" strokeWidth={2} />
          )
        ) : (
          <Gauge size={13} className="text-blue-600" strokeWidth={2} />
        )}
        {title}
      </div>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums',
          allPassed
            ? 'bg-emerald-50 text-emerald-700'
            : hard
              ? 'bg-rose-50 text-rose-700'
              : 'bg-amber-50 text-amber-700',
        )}
      >
        {passed}/{total} 通過
      </span>
    </div>
  );
}

/**
 * 檢查面板：硬檢查未過 = Confirm 會被後端拒絕（PRD §9.3.3），因此紅色優先呈現。
 */
export function SeoQaPanel({
  report,
  wordCountMin,
  wordCountMax,
  onFocusField,
  className,
}: SeoQaPanelProps) {
  const passedHard = report.hard.filter((check) => check.passed).length;
  const passedSoft = report.soft.filter((check) => check.passed).length;
  const hardReasons = blockingReasons(report);
  const scoreTone = report.softScore >= 80 ? 'text-teal-700' : report.softScore >= 50 ? 'text-amber-600' : 'text-rose-600';
  const rangeLabel =
    typeof wordCountMin === 'number' && typeof wordCountMax === 'number'
      ? `${wordCountMin}–${wordCountMax}`
      : null;

  return (
    <div className={cn('space-y-3', className)}>
      {/* 分數摘要 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0d1a2d]">
              <ListChecks size={13} className="text-teal-600" strokeWidth={2} />
              SEO 檢查
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                字數 <strong className="font-semibold text-[#0d1a2d]">{report.wordCount}</strong>
                {rangeLabel ? `（目標 ${rangeLabel}）` : ''}
              </span>
              <span className={cn('tabular-nums font-semibold', report.softScore >= 80 ? 'text-emerald-600' : 'text-amber-600')}>
                軟檢查 {report.softScore} 分
              </span>
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded px-2 py-1 text-[10.5px] font-bold',
              report.hardPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
            )}
          >
            {report.hardPassed ? '硬檢查通過' : `${hardReasons.length} 項阻擋確認`}
          </span>
        </div>

        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
            <span>軟檢查分數</span>
            <span className={cn('font-semibold tabular-nums', scoreTone)}>{report.softScore} / 100</span>
          </div>
          <Progress
            value={report.softScore}
            className={cn(
              'h-1.5 bg-slate-100',
              report.softScore >= 80
                ? '[&>div]:bg-teal-500'
                : report.softScore >= 50
                  ? '[&>div]:bg-amber-500'
                  : '[&>div]:bg-rose-500',
            )}
          />
        </div>
      </div>

      {/* 硬檢查 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-2 shadow-card">
        <GroupHeader title="硬檢查（未過不可 Confirm）" passed={passedHard} total={report.hard.length} hard />
        <div className="mt-1 space-y-0.5">
          {report.hard.map((check) => (
            <CheckRow key={check.id} check={check} onFocus={onFocusField} />
          ))}
        </div>
      </div>

      {hardReasons.length > 0 && (
        <div className="rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-700">
            <AlertTriangle size={12} strokeWidth={2.2} />
            Confirm 會被後端拒絕，原因：
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-rose-700/90">
            {hardReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 軟檢查 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-2 shadow-card">
        <GroupHeader title="軟檢查（只影響分數）" passed={passedSoft} total={report.soft.length} hard={false} />
        <div className="mt-1 space-y-0.5">
          {report.soft.map((check) => (
            <CheckRow key={check.id} check={check} onFocus={onFocusField} />
          ))}
        </div>
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground">
        檢查時間 {formatZoneDateTime(report.checkedAt)}；
        規則與後端 <code className="rounded bg-slate-100 px-1">content-publish</code> 完全一致，前端只做預覽。
      </p>
    </div>
  );
}
