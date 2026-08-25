export const QUOTATION_BV_TABLE = 'quotation_bv';
export const BV_RATIO_TOTAL = 100;

export type QuotationBvRecord = {
  id: string;
  quotationClientProjectId: string;
  staffId: string;
  staffName: string;
  bvRatio: number;
  createdAt: string;
  updatedAt: string;
};

export type QuotationBvInput = {
  staffId: string;
  bvRatio: number;
};

export function roundBvRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseBvRatio(raw: string | number): number | null {
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) return null;
  const rounded = roundBvRatio(value);
  if (rounded <= 0 || rounded > BV_RATIO_TOTAL) return null;
  return rounded;
}

export function sumBvRatios(ratios: Array<number | null | undefined>): number {
  return roundBvRatio(
    ratios.reduce<number>((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0),
  );
}

export function remainingBvRatio(ratios: Array<number | null | undefined>): number {
  return roundBvRatio(Math.max(0, BV_RATIO_TOTAL - sumBvRatios(ratios)));
}

export function wouldExceedBvTotal(otherRatiosSum: number, nextRatio: number): boolean {
  return roundBvRatio(otherRatiosSum + nextRatio) > BV_RATIO_TOTAL;
}
