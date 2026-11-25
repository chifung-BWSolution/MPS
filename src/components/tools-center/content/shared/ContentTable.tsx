/**
 * 通用內容表格（IMPLEMENTATION-CONTRACT §4）
 *
 * 契約 props：columns / rows / rowKey / loading / empty / onRowClick /
 *             pageSize（預設 20）/ searchable / searchText / toolbar / className
 *
 * 契約沒寫、但頁面規格需要的以下 optional 擴充（皆為加法，不影響既有呼叫）：
 *   - columns[].sortable / sortValue / defaultSortDirection：點表頭切 asc/desc
 *   - initialSort：預設排序（例如 priority desc nulls last）
 *   - stickyHeader：表頭 sticky（長表格用）
 *   - rowClassName：列樣式（例如「未啟用自動生成」的整列淡化）
 *   - searchPlaceholder / emptyFiltered / loadingRows：文案與載入骨架
 *
 * 行為約定：
 *   - 篩選與排序都只作用在「目前資料」，不改變 rows 本身（受控元件的資料來源仍在上層）。
 *   - 排序時 null / undefined 一律排最後（不論 asc/desc）——與 PRD §6.2.2 的
 *     `priority desc nulls last` 一致，避免「未分級」的列因 desc 反而跑到最前面。
 *   - 載入中顯示骨架、無資料顯示 empty、有資料但篩選為 0 顯示 emptyFiltered。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type ContentTableAlign = 'left' | 'center' | 'right';

export type ContentTableSortDirection = 'asc' | 'desc';

export interface ContentTableSort {
  key: string;
  direction: ContentTableSortDirection;
}

export interface ContentTableColumn<T> {
  key: string;
  header: ReactNode;
  width?: string;
  align?: ContentTableAlign;
  render: (row: T) => ReactNode;
  /** 加法擴充：表頭可點擊排序（需同時給 sortValue 或 row 上有同名屬性） */
  sortable?: boolean;
  /** 加法擴充：排序值。回傳 null / undefined 一律排最後 */
  sortValue?: (row: T) => string | number | null | undefined;
  /** 加法擴充：第一次點這欄時的預設方向（預設 asc） */
  defaultSortDirection?: ContentTableSortDirection;
}

export interface ContentTableProps<T> {
  columns: ContentTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  searchable?: boolean;
  searchText?: (row: T) => string;
  toolbar?: ReactNode;
  className?: string;
  // ---- 加法擴充 ----
  initialSort?: ContentTableSort | null;
  stickyHeader?: boolean;
  rowClassName?: (row: T) => string | undefined;
  searchPlaceholder?: string;
  emptyFiltered?: ReactNode;
  loadingRows?: number;
  /** 加法擴充：目前頁面上的資料列（供「全選本頁」這類有界批次操作用） */
  onVisibleRowsChange?: (rows: T[]) => void;
}

const ALIGN_CLASS: Record<ContentTableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function fallbackRowText(row: unknown): string {
  if (row == null) return '';
  if (typeof row !== 'object') return String(row);
  return Object.values(row as Record<string, unknown>)
    .map((value) => {
      if (value == null) return '';
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return '';
        }
      }
      return String(value);
    })
    .join(' ');
}

function compareNonNullValues(
  a: string | number,
  b: string | number,
): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const numberA = Number(a);
  const numberB = Number(b);
  if (
    Number.isFinite(numberA) &&
    Number.isFinite(numberB) &&
    String(a).trim() !== '' &&
    String(b).trim() !== ''
  ) {
    return numberA - numberB;
  }
  return String(a).localeCompare(String(b), 'zh-HK');
}

export function ContentTable<T,>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  pageSize = 20,
  searchable = false,
  searchText,
  toolbar,
  className,
  initialSort = null,
  stickyHeader = false,
  rowClassName,
  searchPlaceholder = '搜尋…',
  emptyFiltered,
  loadingRows = 6,
  onVisibleRowsChange,
}: ContentTableProps<T>) {
  const [query, setQuery] = useState('');
  const [rawPage, setRawPage] = useState(1);
  const [sort, setSort] = useState<ContentTableSort | null>(initialSort);

  // 換資料來源（例如切站點、匯入後筆數變動）時回到第一頁，避免停在已不存在的頁碼。
  // 只依筆數而非陣列 identity，避免上層任何重繪都把使用者的頁碼重設。
  useEffect(() => {
    setRawPage(1);
  }, [rows.length]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    const readText = searchText ?? fallbackRowText;
    return rows.filter((row) =>
      String(readText(row) ?? '')
        .toLowerCase()
        .includes(keyword),
    );
  }, [query, rows, searchText]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column) return filteredRows;

    const readValue = (row: T): string | number | null | undefined => {
      if (column.sortValue) return column.sortValue(row);
      const raw = (row as Record<string, unknown>)?.[column.key];
      if (typeof raw === 'number' || typeof raw === 'string') return raw;
      return raw == null ? null : String(raw);
    };

    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const valueA = readValue(a);
      const valueB = readValue(b);
      // null 永遠最後，不受方向影響
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return 1;
      if (valueB == null) return -1;
      return compareNonNullValues(valueA, valueB) * direction;
    });
  }, [columns, filteredRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / Math.max(1, pageSize)));
  const page = Math.min(Math.max(1, rawPage), pageCount);
  const pageRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, sortedRows],
  );

  const hasRows = rows.length > 0;
  const showTopBar = (searchable && hasRows) || Boolean(toolbar);

  // 回報目前頁面資料列（「全選本頁」只用得到看得見的列，不會被拿來全選歷史資料）。
  // 只以「可見列的 key 字串」當依賴，避免上層因 setState 造成的 identity 變動形成更新迴圈。
  const visibleRowsChangeRef = useRef(onVisibleRowsChange);
  visibleRowsChangeRef.current = onVisibleRowsChange;
  const pageRowsRef = useRef(pageRows);
  pageRowsRef.current = pageRows;
  const visibleRowsKey = pageRows.map((row) => rowKey(row)).join('\u0001');
  useEffect(() => {
    visibleRowsChangeRef.current?.(pageRowsRef.current);
  }, [visibleRowsKey]);

  const toggleSort = (column: ContentTableColumn<T>) => {
    setSort((previous) => {
      if (previous && previous.key === column.key) {
        return {
          key: column.key,
          direction: previous.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key: column.key, direction: column.defaultSortDirection ?? 'asc' };
    });
    setRawPage(1);
  };

  const skeletonColumnCount = Math.max(1, columns.length);

  const renderHeaderCell = (column: ContentTableColumn<T>) => {
    const align = column.align ?? 'left';
    const sortable = Boolean(column.sortable);
    const active = sort?.key === column.key;
    const SortIcon = !active
      ? ChevronsUpDown
      : sort?.direction === 'asc'
        ? ChevronUp
        : ChevronDown;

    return (
      <TableHead
        key={column.key}
        style={column.width ? { width: column.width } : undefined}
        className={cn(
          'h-9 px-3 text-[12px] font-semibold text-slate-500',
          ALIGN_CLASS[align],
          stickyHeader && 'sticky top-0 z-[1] bg-slate-50',
        )}
        aria-sort={
          sortable
            ? active
              ? sort?.direction === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'
            : undefined
        }
      >
        {sortable ? (
          <button
            type="button"
            onClick={() => toggleSort(column)}
            className={cn(
              'inline-flex items-center gap-1 rounded-sm font-semibold transition-colors hover:text-[#0d1a2d]',
              active && 'text-[#0d1a2d]',
              align === 'right' && 'flex-row-reverse',
            )}
            title={`依「${typeof column.header === 'string' ? column.header : column.key}」排序`}
          >
            <span>{column.header}</span>
            <SortIcon size={12} strokeWidth={2} className="shrink-0 opacity-70" />
          </button>
        ) : (
          column.header
        )}
      </TableHead>
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      {showTopBar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {searchable && hasRows ? (
            <div className="relative w-full max-w-[280px]">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setRawPage(1);
                }}
                placeholder={searchPlaceholder}
                className="h-8 pl-7 text-[13px]"
                aria-label="搜尋表格資料"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        {loading ? (
          <div className={cn(stickyHeader && '[&>div]:max-h-[68vh]')}>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[rgba(13,26,45,0.08)] bg-slate-50">
                  {columns.map(renderHeaderCell)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: loadingRows }).map((_, rowIndex) => (
                  <TableRow key={`skeleton-${rowIndex}`} className="border-b border-slate-100">
                    {Array.from({ length: skeletonColumnCount }).map((__, cellIndex) => (
                      <TableCell key={`skeleton-${rowIndex}-${cellIndex}`} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : !hasRows ? (
          <div className="px-4 py-10">
            {empty ?? (
              <p className="text-center text-[13px] text-muted-foreground">目前沒有資料。</p>
            )}
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="px-4 py-10">
            {emptyFiltered ?? (
              <div className="flex flex-col items-center gap-2 text-center">
                <SearchX size={20} className="text-slate-300" />
                <p className="text-[13px] text-muted-foreground">
                  沒有符合「{query.trim()}」的資料。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12px]"
                  onClick={() => {
                    setQuery('');
                    setRawPage(1);
                  }}
                >
                  清除搜尋
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className={cn(stickyHeader && '[&>div]:max-h-[68vh]')}>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[rgba(13,26,45,0.08)] bg-slate-50">
                  {columns.map(renderHeaderCell)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'button' : undefined}
                    className={cn(
                      'border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          'whitespace-nowrap px-3 py-2.5 align-middle text-[13px] text-[#0d1a2d]',
                          ALIGN_CLASS[column.align ?? 'left'],
                        )}
                      >
                        {column.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && sortedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(13,26,45,0.08)] px-3 py-2">
            <p className="text-[12px] text-muted-foreground">
              共 <span className="font-semibold text-[#0d1a2d]">{sortedRows.length}</span> 筆
              {query.trim() ? '（已套用搜尋）' : ''}
              {pageCount > 1 ? ` · 第 ${page} / ${pageCount} 頁` : ''}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[12px]"
                  disabled={page <= 1}
                  onClick={() => setRawPage(page - 1)}
                >
                  上一頁
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[12px]"
                  disabled={page >= pageCount}
                  onClick={() => setRawPage(page + 1)}
                >
                  下一頁
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
