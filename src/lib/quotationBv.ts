import type { ProjectHubRelatedType } from '@/lib/projectsHub';

export const QUOTATION_BV_TABLE = 'quotation_bv';
export const QUOTATION_BV_WITH_COMPANY_VIEW = 'quotation_bv_with_company';
export const BV_RATIO_TOTAL = 100;
export const COMPANY_BV_RATIO = 30;
export const COMPANY_BV_LABEL = 'Branding Works';
export const STAFF_BV_POOL = BV_RATIO_TOTAL - COMPANY_BV_RATIO;
export const BV_SOURCE_RELATED_TYPES = ['quotation_client', 'webandsystem'] as const;
export type BvSourceRelatedType = (typeof BV_SOURCE_RELATED_TYPES)[number];

export function isBvSourceRelatedType(
  value: string | undefined | null,
): value is BvSourceRelatedType {
  return !!value && (BV_SOURCE_RELATED_TYPES as readonly string[]).includes(value);
}

export type QuotationBvRecord = {
  id: string;
  projectId: string;
  staffId: string;
  staffName: string;
  bvRatio: number;
  createdAt: string;
  updatedAt: string;
};

export type QuotationBvSource = {
  relatedType: ProjectHubRelatedType;
  relatedId: string;
};

export type QuotationBvInput = {
  staffId: string;
  bvRatio: number;
};

export function roundBvRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatBvRatio(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export function parseBvRatio(raw: string | number): number | null {
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) return null;
  const rounded = roundBvRatio(value);
  if (rounded <= 0 || rounded > STAFF_BV_POOL) return null;
  return rounded;
}

export function sumBvRatios(ratios: Array<number | null | undefined>): number {
  return roundBvRatio(
    ratios.reduce<number>((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0),
  );
}

export function remainingStaffBvRatio(ratios: Array<number | null | undefined>): number {
  return roundBvRatio(Math.max(0, STAFF_BV_POOL - sumBvRatios(ratios)));
}

export function wouldExceedStaffBvPool(otherRatiosSum: number, nextRatio: number): boolean {
  return roundBvRatio(otherRatiosSum + nextRatio) > STAFF_BV_POOL;
}

export function projectBvTotal(staffRatios: Array<number | null | undefined>): number {
  return roundBvRatio(COMPANY_BV_RATIO + sumBvRatios(staffRatios));
}

export function isStaffBvComplete(staffRatios: Array<number | null | undefined>): boolean {
  return sumBvRatios(staffRatios) === STAFF_BV_POOL;
}

/** One-shot remap from the old 100% staff pool onto the 70% staff pool. */
export function scaleLegacyStaffBvRatio(value: number): number {
  return Math.max(0.01, roundBvRatio((value * STAFF_BV_POOL) / BV_RATIO_TOTAL));
}

export type QuotationBvHourStat = {
  staffId: string;
  staffName: string;
  position?: string;
  hours: number;
  entryCount: number;
};

export type QuotationBvDraftRow = {
  id?: string;
  staffId: string;
  staffName: string;
  position: string;
  hours: number;
  entryCount: number;
  bvRatio: string;
};

/**
 * Split the 70% staff pool by each person's share of related day-report hours.
 * Largest-remainder rounding so the suggestions add up to STAFF_BV_POOL when any hours exist.
 */
export function suggestStaffBvFromHours(hours: Array<number | null | undefined>): number[] {
  const safe = hours.map((value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return hours.map(() => 0);

  const raw = safe.map((value) => (value / total) * STAFF_BV_POOL);
  const floors = raw.map((value) => Math.floor(value * 100) / 100);
  let leftoverCents = Math.round((STAFF_BV_POOL - floors.reduce((sum, value) => sum + value, 0)) * 100);

  const order = raw
    .map((value, index) => ({ index, frac: value - floors[index], hours: safe[index] }))
    .sort((a, b) => b.frac - a.frac || b.hours - a.hours || a.index - b.index);

  const result = [...floors];
  for (const item of order) {
    if (leftoverCents <= 0) break;
    if (safe[item.index] <= 0) continue;
    result[item.index] = roundBvRatio(result[item.index] + 0.01);
    leftoverCents -= 1;
  }
  return result;
}

export function mergeBvDraftStaff(
  assigned: Array<Pick<QuotationBvRecord, 'id' | 'staffId' | 'staffName' | 'bvRatio'>>,
  hours: QuotationBvHourStat[],
): QuotationBvDraftRow[] {
  const hourMap = new Map(hours.map((row) => [row.staffId, row]));
  const assignedIds = new Set(assigned.map((row) => row.staffId));

  const fromAssigned = assigned.map((row) => {
    const stat = hourMap.get(row.staffId);
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: row.staffName,
      position: stat?.position?.trim() || '',
      hours: stat?.hours || 0,
      entryCount: stat?.entryCount || 0,
      bvRatio: formatBvRatio(row.bvRatio),
    };
  });

  const fromHours = hours
    .filter((row) => !assignedIds.has(row.staffId))
    .sort((a, b) => b.hours - a.hours || a.staffName.localeCompare(b.staffName, 'zh-Hant'))
    .map((row) => ({
      staffId: row.staffId,
      staffName: row.staffName,
      position: row.position?.trim() || '',
      hours: row.hours,
      entryCount: row.entryCount,
      bvRatio: '',
    }));

  return [...fromAssigned, ...fromHours];
}
