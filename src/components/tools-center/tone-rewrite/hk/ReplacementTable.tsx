import { Check, CheckCheck, ClipboardCheck } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { HkReplacement, HkTermCategory } from '@/lib/hkCantoneseRewrite';

const CATEGORY_CLASS: Record<HkTermCategory, string> = {
  '簡體字': 'border-amber-200 bg-amber-50 text-amber-700',
  '內地用語': 'border-rose-200 bg-rose-50 text-rose-700',
  '台灣用語': 'border-indigo-200 bg-indigo-50 text-indigo-700',
  '粵語口語': 'border-teal-200 bg-teal-50 text-teal-700',
  '港式用詞': 'border-slate-200 bg-slate-50 text-slate-600',
};

export type ReplacementFilter = 'all' | 'pending';

export interface ReplacementTableProps {
  replacements: HkReplacement[];
  reviewed: Set<string>;
  filter: ReplacementFilter;
  onFilterChange: (filter: ReplacementFilter) => void;
  onToggle: (ruleId: string) => void;
  onMarkAll: () => void;
}

export function ReplacementTable({
  replacements,
  reviewed,
  filter,
  onFilterChange,
  onToggle,
  onMarkAll,
}: ReplacementTableProps) {
  const reviewedCount = replacements.filter((row) => reviewed.has(row.ruleId)).length;
  const visible = filter === 'pending'
    ? replacements.filter((row) => !reviewed.has(row.ruleId))
    : replacements;

  return (
    <section className="flex h-full flex-col rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-bold">
            <ClipboardCheck size={16} className="text-teal-600" />
            替換詞彙
            <span className="text-[12px] font-medium text-muted-foreground">({replacements.length})</span>
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            已核對 {reviewedCount} / {replacements.length} · 勾選代表你已確認這個替換
          </p>
        </div>
        {replacements.length > 0 && (
          <button
            type="button"
            onClick={onMarkAll}
            disabled={reviewedCount === replacements.length}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck size={12} />
            全部標為已核對
          </button>
        )}
      </div>

      {replacements.length === 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2.5 text-[12px] leading-relaxed text-teal-800">
          <Check size={14} className="mt-0.5 shrink-0" />
          <span>未發現非港式詞彙；書面語版已可直接使用，仍建議人手讀一次語氣。</span>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(['all', 'pending'] as ReplacementFilter[]).map((key) => {
              const count = key === 'all' ? replacements.length : replacements.length - reviewedCount;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => onFilterChange(key)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    filter === key
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-border bg-white text-muted-foreground hover:border-teal-200 hover:text-teal-700',
                  )}
                >
                  {key === 'all' ? '全部' : '未核對'} ({count})
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-[12px]">
              <caption className="sr-only">非港式詞彙替換清單</caption>
              <thead>
                <tr className="border-b border-border bg-[#f5f8fc] text-[11px] text-muted-foreground">
                  <th className="w-10 px-2 py-2 font-medium">已核對</th>
                  <th className="px-2 py-2 font-medium">原詞</th>
                  <th className="px-2 py-2 font-medium">香港書面語</th>
                  <th className="px-2 py-2 font-medium">口語版</th>
                  <th className="px-2 py-2 font-medium">類別</th>
                  <th className="w-12 px-2 py-2 text-right font-medium">次數</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const isReviewed = reviewed.has(row.ruleId);
                  return (
                    <tr key={row.ruleId} className={cn('border-b border-border/50 align-top', isReviewed && 'bg-[#fbfdff]')}>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => onToggle(row.ruleId)}
                          aria-pressed={isReviewed}
                          aria-label={`${isReviewed ? '取消核對' : '核對'} ${row.from}`}
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                            isReviewed
                              ? 'border-teal-600 bg-teal-600 text-white'
                              : 'border-border bg-white text-transparent hover:border-teal-400',
                          )}
                        >
                          <Check size={12} />
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <span className="font-semibold text-[#0d1a2d]">{row.from}</span>
                        {row.contexts.length > 0 && (
                          <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {row.contexts.slice(0, 2).map((context, index) => (
                              <p key={`${row.ruleId}-ctx-${index}`} className="break-words">{context}</p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 font-medium text-teal-700">{row.written}</td>
                      <td className="px-2 py-2 text-[#0d1a2d]">{row.colloquial ?? '—'}</td>
                      <td className="px-2 py-2">
                        <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium', CATEGORY_CLASS[row.category])}>
                          {row.category}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground">×{row.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visible.length === 0 && (
              <p className="py-6 text-center text-[12px] text-muted-foreground">所有替換都已核對。</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
