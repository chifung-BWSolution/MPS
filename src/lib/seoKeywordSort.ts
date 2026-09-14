import type { SeoKeywordRow } from '../types/seo';

export type SeoKeywordSortKey =
  | 'keyword'
  | 'level'
  | 'search_volume'
  | 'current_ranking'
  | 'target_ranking'
  | 'target_page'
  | 'difficulty_score'
  | 'status';

export type SeoKeywordSortDir = 'asc' | 'desc';

const LEVEL_ORDER: Record<SeoKeywordRow['level'], number> = {
  level_1: 1,
  level_2: 2,
  level_3: 3,
};

const STATUS_ORDER: Record<SeoKeywordRow['status'], number> = {
  monitoring: 1,
  optimizing: 2,
  achieved: 3,
  paused: 4,
};

export function seoKeywordSortValue(
  row: SeoKeywordRow,
  key: SeoKeywordSortKey,
): string | number | null {
  switch (key) {
    case 'keyword':
      return row.keyword;
    case 'level':
      return LEVEL_ORDER[row.level] ?? 99;
    case 'search_volume':
      return row.search_volume;
    case 'current_ranking':
      return row.current_ranking;
    case 'target_ranking':
      return row.target_ranking;
    case 'target_page':
      return row.target_page;
    case 'difficulty_score':
      return row.difficulty_score;
    case 'status':
      return STATUS_ORDER[row.status] ?? 99;
    default:
      return null;
  }
}

export function compareSeoKeywordSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortSeoKeywords(
  rows: SeoKeywordRow[],
  key: SeoKeywordSortKey,
  dir: SeoKeywordSortDir,
): SeoKeywordRow[] {
  return [...rows].sort((a, b) => {
    const av = seoKeywordSortValue(a, key);
    const bv = seoKeywordSortValue(b, key);
    const aEmpty = av == null || av === '';
    const bEmpty = bv == null || bv === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const cmp = compareSeoKeywordSortValues(av, bv);
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function nextSeoKeywordSort(
  currentKey: SeoKeywordSortKey,
  currentDir: SeoKeywordSortDir,
  nextKey: SeoKeywordSortKey,
  sample: string | number | null | undefined,
): { key: SeoKeywordSortKey; dir: SeoKeywordSortDir } {
  if (nextKey === currentKey) {
    return { key: currentKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: nextKey, dir: typeof sample === 'number' ? 'desc' : 'asc' };
}
