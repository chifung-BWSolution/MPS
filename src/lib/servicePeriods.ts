import { optionalIsoDate } from '../data/pitchingData';

/** Periods shown on the 系統開發管理 client-project dialog. Keys are stable; labels can change. */
export const SERVICE_PERIOD_FIELDS = [
  { key: 'revision', labelZh: '可修改期', labelEn: 'Modification Period' },
  { key: 'testing', labelZh: '測試期', labelEn: 'Testing Period' },
  { key: 'warranty', labelZh: '保養期', labelEn: 'Maintenance Period' },
] as const;

export type ServicePeriodKey = (typeof SERVICE_PERIOD_FIELDS)[number]['key'];

/**
 * One named range inside quotation_client_project.service_periods.
 * Unknown properties are kept so a period can grow without a migration.
 */
export type ServicePeriodRange = {
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
};

/** Open map: future periods are new keys, not new columns. */
export type ServicePeriods = Record<string, ServicePeriodRange>;

export function emptyServicePeriods(): ServicePeriods {
  return {};
}

function parseRange(raw: unknown): ServicePeriodRange | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const range: ServicePeriodRange = {};
  const start = optionalIsoDate(typeof row.startDate === 'string' ? row.startDate : undefined);
  const end = optionalIsoDate(typeof row.endDate === 'string' ? row.endDate : undefined);
  if (start) range.startDate = start;
  if (end) range.endDate = end;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'startDate' || key === 'endDate' || value === undefined) continue;
    range[key] = value;
  }
  return Object.keys(range).length ? range : undefined;
}

export function parseServicePeriods(raw: unknown): ServicePeriods {
  if (raw == null) return {};
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const periods: ServicePeriods = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    const range = parseRange(value);
    if (range) periods[trimmed] = range;
  }
  return periods;
}

export function servicePeriodDate(
  periods: ServicePeriods | undefined,
  key: string,
  field: 'startDate' | 'endDate',
): string {
  const value = periods?.[key]?.[field];
  return typeof value === 'string' ? value : '';
}

export function withServicePeriodDate(
  periods: ServicePeriods,
  key: string,
  field: 'startDate' | 'endDate',
  value: string,
): ServicePeriods {
  const current: ServicePeriodRange = { ...(periods[key] ?? {}) };
  const iso = optionalIsoDate(value);
  if (iso) current[field] = iso;
  else delete current[field];
  const next: ServicePeriods = { ...periods };
  const extras = Object.keys(current).filter((item) => item !== 'startDate' && item !== 'endDate');
  if (!current.startDate && !current.endDate && extras.length === 0) delete next[key];
  else next[key] = current;
  return next;
}

export function validateServicePeriods(periods: ServicePeriods | undefined): string | null {
  if (!periods) return null;
  const labels = new Map<string, string>(SERVICE_PERIOD_FIELDS.map((field) => [field.key, field.labelZh]));
  for (const [key, range] of Object.entries(periods)) {
    if (!range?.startDate || !range.endDate) continue;
    if (range.endDate < range.startDate) {
      return `${labels.get(key) ?? key}結束日期不可早於開始日期`;
    }
  }
  return null;
}
