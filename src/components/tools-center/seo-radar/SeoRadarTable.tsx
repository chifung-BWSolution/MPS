/**
 * SEO 雷達 · 結果表（PRD §8.1）
 *
 * 只負責呈現與排序／分頁；勾選狀態由外層持有（採納與忽略要跨頁累計）。
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import type { SeoRadarIdeaRow } from '@/types/seoRadar';

type SortKey =
  | 'keyword'
  | 'source'
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'avg_position'
  | 'score';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

const SOURCE_LABEL: Record<SeoRadarIdeaRow['source'], string> = {
  gsc: 'GSC',
  suggest: '建議詞',
};

const SOURCE_CLASS: Record<SeoRadarIdeaRow['source'], string> = {
  gsc: 'bg-teal-50 text-teal-700 border-teal-200',
  suggest: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const STATUS_LABEL: Record<SeoRadarIdeaRow['status'], string> = {
  new: '新',
  adopted: '已採納',
  ignored: '已忽略',
};

const STATUS_CLASS: Record<SeoRadarIdeaRow['status'], string> = {
  new: 'bg-slate-100 text-slate-600 border-slate-200',
  adopted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ignored: 'bg-muted text-muted-foreground border-border',
};

function formatCount(value: number): string {
  return Number(value || 0).toLocaleString('en-US');
}

function formatCtr(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatPosition(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(1);
}

function sortValue(idea: SeoRadarIdeaRow, key: SortKey): number | string {
  switch (key) {
    case 'keyword':
      return idea.normalized_keyword;
    case 'source':
      return idea.source;
    case 'impressions':
      return idea.impressions;
    case 'clicks':
      return idea.clicks;
    case 'ctr':
      return idea.ctr ?? -1;
    case 'avg_position':
      return idea.avg_position ?? Number.POSITIVE_INFINITY;
    case 'score':
    default:
      return idea.score;
  }
}

export interface SeoRadarTableProps {
  ideas: SeoRadarIdeaRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], next: boolean) => void;
  canWrite: boolean;
  emptyMessage?: string;
}

export function SeoRadarTable({
  ideas,
  selected,
  onToggle,
  onToggleMany,
  canWrite,
  emptyMessage = '尚無候選詞，先按「抓取熱門關鍵詞」。',
}: SeoRadarTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [ideas.length, sortKey, sortDir]);

  const sorted = useMemo(() => {
    const rows = [...ideas];
    rows.sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      const result =
        typeof left === 'string' || typeof right === 'string'
          ? String(left).localeCompare(String(right), 'zh-Hant')
          : Number(left) - Number(right);
      return sortDir === 'asc' ? result : -result;
    });
    return rows;
  }, [ideas, sortKey, sortDir]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  // 篩選／資料變動後若目前頁碼超出範圍（例如由 100 筆切成 12 筆），回夾到最後一頁
  useEffect(() => {
    setPage((value) => Math.min(Math.max(1, value), totalPages));
  }, [totalPages]);

  const selectableOnPage = pageRows.filter((row) => row.status === 'new').map((row) => row.id);
  const allSelected =
    selectableOnPage.length > 0 && selectableOnPage.every((id) => selected.has(id));

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'avg_position' || key === 'keyword' || key === 'source' ? 'asc' : 'desc');
  };

  const renderSortIcon = (key: SortKey) => {
    if (key !== sortKey) return <ChevronsUpDown size={12} className="text-muted-foreground/60" />;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <th
      className={cn(
        'px-3 py-2 text-[12px] font-medium text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        {renderSortIcon(key)}
      </button>
    </th>
  );

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  disabled={!canWrite || selectableOnPage.length === 0}
                  onCheckedChange={(checked) =>
                    onToggleMany(selectableOnPage, checked === true)
                  }
                  aria-label="全選本頁"
                />
              </th>
              {header('keyword', '關鍵字')}
              {header('source', '來源')}
              {header('impressions', '曝光', 'right')}
              {header('clicks', '點擊', 'right')}
              {header('ctr', 'CTR', 'right')}
              {header('avg_position', '平均排名', 'right')}
              {header('score', '分數', 'right')}
              <th className="px-3 py-2 text-left text-[12px] font-medium text-muted-foreground">
                狀態
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {pageRows.map((idea) => {
              const selectable = canWrite && idea.status === 'new';
              const checked = selected.has(idea.id);
              return (
                <tr
                  key={idea.id}
                  className={cn(
                    'border-b border-border/50 transition-colors last:border-b-0',
                    checked ? 'bg-teal-50/40' : 'hover:bg-muted/20',
                  )}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={checked}
                      disabled={!selectable}
                      onCheckedChange={() => onToggle(idea.id)}
                      aria-label={`選取 ${idea.keyword}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-[13px] font-medium text-foreground">{idea.keyword}</div>
                    {idea.seed_keyword && (
                      <div className="text-[11px] text-muted-foreground">
                        種子：{idea.seed_keyword}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
                        SOURCE_CLASS[idea.source],
                      )}
                    >
                      {SOURCE_LABEL[idea.source]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] tabular-nums">
                    {formatCount(idea.impressions)}
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] tabular-nums">
                    {formatCount(idea.clicks)}
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] tabular-nums text-muted-foreground">
                    {formatCtr(idea.ctr)}
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] tabular-nums text-muted-foreground">
                    {formatPosition(idea.avg_position)}
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums">
                    {idea.score.toFixed(0)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
                        STATUS_CLASS[idea.status],
                      )}
                    >
                      {STATUS_LABEL[idea.status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-[12px] text-muted-foreground">
            共 {sorted.length} 個詞 · 第 {page} / {totalPages} 頁
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-[12px] disabled:opacity-40"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
            >
              上一頁
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-[12px] disabled:opacity-40"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={page >= totalPages}
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
