import {
  calcRemainingDays,
  formatMainPmName,
  formatProjectTypes,
  formatRelatedClientName,
  optionalIsoDate,
  PITCHING_STATUS_OPTIONS,
  type PitchingRecord,
} from '../data/pitchingData';

export type QuotationListSortKey =
  | 'inquiryDate'
  | 'remainingDays'
  | 'projectTypes'
  | 'displayName'
  | 'clientName'
  | 'mainPm'
  | 'status';

export type QuotationListSortDir = 'asc' | 'desc';

export const QUOTATION_LIST_SORT_KEYS: QuotationListSortKey[] = [
  'inquiryDate',
  'remainingDays',
  'projectTypes',
  'displayName',
  'clientName',
  'mainPm',
  'status',
];

export function getQuotationListSortValue(
  record: Pick<
    PitchingRecord,
    'inquiryDate' | 'status' | 'projectTypes' | 'displayName' | 'clientName' | 'mainPmName'
  >,
  key: QuotationListSortKey,
  asOfDate?: string,
): string | number | null {
  switch (key) {
    case 'inquiryDate':
      return optionalIsoDate(record.inquiryDate) ?? null;
    case 'remainingDays':
      return calcRemainingDays(record.inquiryDate, record.status, asOfDate);
    case 'projectTypes': {
      const label = formatProjectTypes(record.projectTypes);
      return label === '—' ? null : label;
    }
    case 'displayName':
      return record.displayName?.trim() || null;
    case 'clientName': {
      const name = formatRelatedClientName(record);
      return name === '—' ? null : name;
    }
    case 'mainPm': {
      const name = formatMainPmName(record);
      return name === '—' ? null : name;
    }
    case 'status': {
      const index = PITCHING_STATUS_OPTIONS.indexOf(record.status);
      return index < 0 ? null : index;
    }
  }
}

function isEmptySortValue(value: string | number | null): boolean {
  return value == null || value === '';
}

export function compareQuotationListValues(
  a: string | number | null,
  b: string | number | null,
  dir: QuotationListSortDir,
): number {
  const aEmpty = isEmptySortValue(a);
  const bEmpty = isEmptySortValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const cmp =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'zh-HK', { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

export function defaultQuotationListSortDir(key: QuotationListSortKey): QuotationListSortDir {
  return key === 'inquiryDate' || key === 'remainingDays' ? 'desc' : 'asc';
}

export function nextQuotationListSort(
  currentKey: QuotationListSortKey,
  currentDir: QuotationListSortDir,
  clickedKey: QuotationListSortKey,
): { key: QuotationListSortKey; dir: QuotationListSortDir } {
  if (clickedKey === currentKey) {
    return { key: currentKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: clickedKey, dir: defaultQuotationListSortDir(clickedKey) };
}

export function sortQuotationListRecords<T extends Pick<
  PitchingRecord,
  'inquiryDate' | 'status' | 'projectTypes' | 'displayName' | 'clientName' | 'mainPmName'
>>(
  records: T[],
  key: QuotationListSortKey,
  dir: QuotationListSortDir,
  asOfDate?: string,
): T[] {
  return [...records].sort((a, b) =>
    compareQuotationListValues(
      getQuotationListSortValue(a, key, asOfDate),
      getQuotationListSortValue(b, key, asOfDate),
      dir,
    ),
  );
}
