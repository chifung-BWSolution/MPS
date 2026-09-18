import {
  DEFAULT_CLIENT_PROJECT_PROGRESS_FILTER,
  DEFAULT_PITCHING_DEAL_FILTER,
  DEFAULT_PITCHING_STATUS_FILTER,
  isClientProjectProgressFilter,
  isPitchingDealFilter,
  isPitchingStatusFilter,
  type ClientProjectProgressFilter,
  type PitchingDealFilter,
  type PitchingStatusFilter,
} from '../data/pitchingData';
import {
  defaultQuotationListSortDir,
  QUOTATION_LIST_SORT_KEYS,
  type QuotationListSortDir,
  type QuotationListSortKey,
} from './quotationListSort';

export const QUOTATION_LIST_QUERY_KEYS = [
  'q',
  'type',
  'status',
  'projectStatus',
  'progress',
  'sort',
  'dir',
] as const;

export type QuotationListQuery = {
  q: string;
  type: string;
  status: PitchingDealFilter;
  projectStatus: PitchingStatusFilter;
  progress: ClientProjectProgressFilter;
  sort: QuotationListSortKey;
  dir: QuotationListSortDir;
};

export const DEFAULT_QUOTATION_LIST_QUERY: QuotationListQuery = {
  q: '',
  type: 'all',
  status: DEFAULT_PITCHING_DEAL_FILTER,
  projectStatus: DEFAULT_PITCHING_STATUS_FILTER,
  progress: DEFAULT_CLIENT_PROJECT_PROGRESS_FILTER,
  sort: 'inquiryDate',
  dir: 'desc',
};

function isSortKey(value: string): value is QuotationListSortKey {
  return (QUOTATION_LIST_SORT_KEYS as readonly string[]).includes(value);
}

function isSortDir(value: string): value is QuotationListSortDir {
  return value === 'asc' || value === 'desc';
}

export function parseQuotationListQuery(params: URLSearchParams): QuotationListQuery {
  const q = params.get('q')?.trim() ?? '';
  const typeRaw = params.get('type')?.trim() || '';
  const type = !typeRaw || typeRaw === 'all' ? 'all' : typeRaw;
  const statusRaw = params.get('status')?.trim() || '';
  const status = isPitchingDealFilter(statusRaw) ? statusRaw : DEFAULT_QUOTATION_LIST_QUERY.status;
  const projectStatusRaw = params.get('projectStatus')?.trim() || '';
  const projectStatus = isPitchingStatusFilter(projectStatusRaw)
    ? projectStatusRaw
    : DEFAULT_QUOTATION_LIST_QUERY.projectStatus;
  const progressRaw = params.get('progress')?.trim() || '';
  const progress = isClientProjectProgressFilter(progressRaw)
    ? progressRaw
    : DEFAULT_QUOTATION_LIST_QUERY.progress;
  const sortRaw = params.get('sort')?.trim() || '';
  const sort = isSortKey(sortRaw) ? sortRaw : DEFAULT_QUOTATION_LIST_QUERY.sort;
  const dirRaw = params.get('dir')?.trim() || '';
  const dir = isSortDir(dirRaw) ? dirRaw : defaultQuotationListSortDir(sort);
  return { q, type, status, projectStatus, progress, sort, dir };
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
  if (query.status && query.status !== DEFAULT_QUOTATION_LIST_QUERY.status) {
    params.set('status', query.status);
  }
  if (query.projectStatus && query.projectStatus !== DEFAULT_QUOTATION_LIST_QUERY.projectStatus) {
    params.set('projectStatus', query.projectStatus);
  }
  if (query.progress && query.progress !== DEFAULT_QUOTATION_LIST_QUERY.progress) {
    params.set('progress', query.progress);
  }
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
    a.projectStatus === b.projectStatus &&
    a.progress === b.progress &&
    a.sort === b.sort &&
    a.dir === b.dir
  );
}
