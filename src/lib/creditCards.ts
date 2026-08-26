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
