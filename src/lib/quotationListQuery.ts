import { PITCHING_STATUS_OPTIONS } from '../data/pitchingData';
import {
  defaultQuotationListSortDir,
  QUOTATION_LIST_SORT_KEYS,
  type QuotationListSortDir,
  type QuotationListSortKey,
} from './quotationListSort';

export const QUOTATION_LIST_QUERY_KEYS = ['q', 'type', 'status', 'sort', 'dir'] as const;

export type QuotationListQuery = {
  q: string;
  type: string;
  status: string;
  sort: QuotationListSortKey;
  dir: QuotationListSortDir;
};

export const DEFAULT_QUOTATION_LIST_QUERY: QuotationListQuery = {
  q: '',
  type: 'all',
  status: 'all',
  sort: 'inquiryDate',
  dir: 'desc',
};

function isSortKey(value: string): value is QuotationListSortKey {
  return (QUOTATION_LIST_SORT_KEYS as readonly string[]).includes(value);
}

function isSortDir(value: string): value is QuotationListSortDir {
  return value === 'asc' || value === 'desc';
}

function isStatus(value: string): boolean {
  return (PITCHING_STATUS_OPTIONS as readonly string[]).includes(value);
}

export function parseQuotationListQuery(params: URLSearchParams): QuotationListQuery {
  const q = params.get('q')?.trim() ?? '';
  const typeRaw = params.get('type')?.trim() || '';
  const type = !typeRaw || typeRaw === 'all' ? 'all' : typeRaw;
  const statusRaw = params.get('status')?.trim() || '';
  const status = isStatus(statusRaw) ? statusRaw : 'all';
  const sortRaw = params.get('sort')?.trim() || '';
  const sort = isSortKey(sortRaw) ? sortRaw : DEFAULT_QUOTATION_LIST_QUERY.sort;
  const dirRaw = params.get('dir')?.trim() || '';
  const dir = isSortDir(dirRaw) ? dirRaw : defaultQuotationListSortDir(sort);
  return { q, type, status, sort, dir };
}

export function writeQuotationListQueryParams(
  params: URLSearchParams,
  query: QuotationListQuery,
): void {
  for (const key of QUOTATION_LIST_QUERY_KEYS) {
    params.delete(key);
  }
  const q = query.q.trim();
  if (q) params.set('q', q);
  if (query.type && query.type !== 'all') params.set('type', query.type);
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (
    query.sort !== DEFAULT_QUOTATION_LIST_QUERY.sort ||
    query.dir !== DEFAULT_QUOTATION_LIST_QUERY.dir
  ) {
    params.set('sort', query.sort);
    params.set('dir', query.dir);
  }
}

export function copyQuotationListQueryParams(from: URLSearchParams, to: URLSearchParams): void {
  for (const key of QUOTATION_LIST_QUERY_KEYS) {
    const value = from.get(key)?.trim();
    if (value) to.set(key, value);
  }
}

export function readQuotationListQuery(
  hash = globalThis.window?.location?.hash ?? '',
): QuotationListQuery {
  const raw = hash.replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  const params = qIndex === -1 ? new URLSearchParams() : new URLSearchParams(raw.slice(qIndex + 1));
  return parseQuotationListQuery(params);
}

export function quotationListQueryEqual(a: QuotationListQuery, b: QuotationListQuery): boolean {
  return (
    a.q === b.q &&
    a.type === b.type &&
    a.status === b.status &&
    a.sort === b.sort &&
    a.dir === b.dir
  );
}
