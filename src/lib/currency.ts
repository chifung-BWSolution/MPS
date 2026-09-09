/** System-wide FX rates. Amounts are always stored in HKD. */
export const SYSTEM_CURRENCIES = ['HKD', 'RMB', 'USD'] as const;
export type SystemCurrency = (typeof SYSTEM_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SystemCurrency = 'HKD';

/** HKD per 1 unit of the named currency. */
export const HKD_PER_UNIT: Record<SystemCurrency, number> = {
  HKD: 1,
  RMB: 1.15,
  USD: 7.8,
};

export const SYSTEM_CURRENCY_LABELS: Record<SystemCurrency, string> = {
  HKD: '港幣 HKD',
  RMB: '人民幣 RMB',
  USD: '美元 USD',
};

export function isSystemCurrency(value: string | null | undefined): value is SystemCurrency {
  return SYSTEM_CURRENCIES.includes(value as SystemCurrency);
}

export function parseSystemCurrency(value: string | null | undefined): SystemCurrency {
  return isSystemCurrency(value) ? value : DEFAULT_CURRENCY;
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatCurrencyInput(amount: number): string {
  return roundMoney(amount).toFixed(2);
}

export function toHkd(amount: number, currency: SystemCurrency = DEFAULT_CURRENCY): number {
  const value = Number.isFinite(amount) ? amount : 0;
  return roundMoney(value * HKD_PER_UNIT[currency]);
}

export function fromHkd(hkdAmount: number, currency: SystemCurrency = DEFAULT_CURRENCY): number {
  const value = Number.isFinite(hkdAmount) ? hkdAmount : 0;
  const rate = HKD_PER_UNIT[currency];
  return rate === 1 ? roundMoney(value) : roundMoney(value / rate);
}

export function convertCurrency(amount: number, from: SystemCurrency, to: SystemCurrency): number {
  if (from === to) return roundMoney(amount);
  return fromHkd(toHkd(amount, from), to);
}

export function convertMoneyInput(raw: string, from: SystemCurrency, to: SystemCurrency): string {
  if (from === to || !raw.trim()) return raw;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return raw;
  return formatCurrencyInput(convertCurrency(value, from, to));
}

export function moneyInputFromHkd(
  hkdAmount: number,
  currency: SystemCurrency,
  options?: { emptyIfZero?: boolean },
): string {
  const value = fromHkd(hkdAmount, currency);
  if (options?.emptyIfZero && value === 0) return '';
  return formatCurrencyInput(value);
}

export function amountsToHkd<T extends Record<string, number>>(
  amounts: T,
  currency: SystemCurrency,
): T {
  const next = { ...amounts };
  for (const key of Object.keys(next) as (keyof T)[]) {
    next[key] = toHkd(next[key], currency) as T[keyof T];
  }
  return next;
}

export function formatMoney(amount: number, currency: SystemCurrency = DEFAULT_CURRENCY): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatFxHint(currency: SystemCurrency): string {
  if (currency === DEFAULT_CURRENCY) return '金額以港幣儲存';
  return `1 ${currency} = ${HKD_PER_UNIT[currency]} HKD，金額將以港幣儲存`;
}
