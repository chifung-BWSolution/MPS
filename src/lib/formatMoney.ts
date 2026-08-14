/** Prefix currency amounts with `$` for UI display. */
export function formatMoneyAmount(
  amount: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  })}`;
}

export function formatMoneyFromMicros(micros: number): string {
  return formatMoneyAmount(micros / 1_000_000);
}
