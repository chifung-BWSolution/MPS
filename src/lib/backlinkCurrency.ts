/** USD ↔ HKD conversion for backlink purchases (HKD peg). */
export const USD_HKD_RATE = 7.8;

export function hkdToUsd(hkd: number): number {
  if (!hkd || hkd <= 0) return 0;
  return Math.ceil(hkd / USD_HKD_RATE);
}

export function usdToHkd(usd: number): number {
  if (!usd || usd <= 0) return 0;
  return Math.ceil(usd * USD_HKD_RATE);
}

export function normalizeBacklinkCosts(
  costUsd?: number | null,
  costHkd?: number | null,
): { costUsd: number; costHkd: number } {
  const usd = costUsd != null && costUsd > 0 ? costUsd : 0;
  const hkd = costHkd != null && costHkd > 0 ? costHkd : 0;

  if (usd > 0 && hkd > 0) return { costUsd: usd, costHkd: hkd };
  if (hkd > 0) return { costUsd: hkdToUsd(hkd), costHkd: hkd };
  if (usd > 0) return { costUsd: usd, costHkd: usdToHkd(usd) };
  return { costUsd: 0, costHkd: 0 };
}

export function formatBacklinkUsd(amount: number): string {
  return `USD $${Math.round(amount).toLocaleString()}`;
}

export function formatBacklinkHkd(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasFraction = rounded % 1 !== 0;
  return `HKD $${rounded.toLocaleString(undefined, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
