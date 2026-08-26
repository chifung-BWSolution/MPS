export const CREDIT_CARDS_TABLE = 'credit_cards';

export const CREDIT_CARD_BANKS = [
  'HSBC',
  'BOC',
  'Hang Seng',
  'DBS',
  'Standard Chartered',
  'Citibank',
  'Other',
] as const;

export type CreditCardRecord = {
  id: string;
  companyListId: string;
  companyName: string;
  lastFour: string;
  bank: string;
  purpose: string;
  holder: string;
  custodianId: string | null;
  custodianName: string;
  expiry: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreditCardInput = {
  companyListId: string;
  lastFour: string;
  bank: string;
  purpose?: string;
  holder?: string;
  custodianId?: string | null;
  expiry: string;
  isActive?: boolean;
  notes?: string;
};

export function normalizeLastFour(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

export function isValidLastFour(raw: string): boolean {
  return /^\d{4}$/.test(raw.trim());
}

export function isValidExpiry(raw: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.trim());
}

export const CREDIT_CARD_MONTHS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
] as const;

export function splitExpiry(raw: string): { year: string; month: string } {
  if (!isValidExpiry(raw)) return { year: '', month: '' };
  const [year, month] = raw.trim().split('-');
  return { year, month };
}

export function joinExpiry(year: string, month: string): string {
  if (!year || !month) return '';
  return `${year}-${month}`;
}

export function creditCardYearOptions(now = new Date(), extraYear = ''): string[] {
  const current = now.getFullYear();
  const years = new Set<number>();
  for (let year = current - 1; year <= current + 15; year += 1) years.add(year);
  const extra = Number(extraYear);
  if (Number.isInteger(extra) && extra >= 2000 && extra <= 2100) years.add(extra);
  return [...years].sort((a, b) => a - b).map(String);
}

export function isCardExpiringSoon(expiry: string, now = new Date()): boolean {
  if (!isValidExpiry(expiry)) return false;
  const [year, month] = expiry.split('-').map(Number);
  const expiryEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + 1);
  return expiryEnd <= horizon;
}

export function formatCompanyOptionLabel(input: {
  companyCode?: string;
  companyNameEn?: string;
  companyNameZh?: string;
}): string {
  const name = (input.companyNameEn || input.companyNameZh || '').trim();
  const code = (input.companyCode || '').trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || '—';
}
