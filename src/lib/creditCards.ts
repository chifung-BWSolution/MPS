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
  label: string;
  companyListId: string;
  companyCode: string;
  companyName: string;
  brandListId: string;
  brandCode: string;
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
  label: string;
  companyListId: string;
  brandListId: string;
  lastFour: string;
  bank: string;
  purpose?: string;
  holder?: string;
  custodianId?: string | null;
  expiry: string;
  isActive?: boolean;
  notes?: string;
};

/** CSV issuer aliases → credit_cards.bank */
const ISSUER_ALIASES: Record<string, string> = {
  SC: 'Standard Chartered',
};

/** CSV company_code → { company_list.company_code, brand_list.brand_code } */
export const CSV_PAYMENT_UNIT_MAP: Record<string, { companyCode: string; brandCode: string }> = {
  BWF: { companyCode: 'BWD', brandCode: 'BWF' },
  BWE: { companyCode: 'BWA', brandCode: 'BWE' },
  Wine: { companyCode: 'WP', brandCode: 'Wine' },
  BW: { companyCode: 'BWA', brandCode: 'BWA' },
  ASX: { companyCode: 'BSC', brandCode: 'BSC' },
  FC: { companyCode: 'FC', brandCode: 'FCC' },
  BWA: { companyCode: 'BWA', brandCode: 'BWA' },
  BWL: { companyCode: 'BWL', brandCode: 'BWL' },
};

export function mapCsvIssuer(raw: string): string {
  const key = raw.trim();
  return ISSUER_ALIASES[key] || key;
}

export function mapCsvPaymentUnit(csvCode: string): { companyCode: string; brandCode: string } | null {
  return CSV_PAYMENT_UNIT_MAP[csvCode.trim()] ?? null;
}

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

export function formatBrandOptionLabel(input: {
  brandCode?: string;
  displayName?: string;
}): string {
  const code = (input.brandCode || '').trim();
  const name = (input.displayName || '').trim();
  if (code && name && name !== code) return `${code} - ${name}`;
  return name || code || '—';
}

export function cardTitle(card: Pick<CreditCardRecord, 'label' | 'lastFour'>): string {
  return card.label.trim() || `•••• ${card.lastFour}`;
}

export function formatCreditCardOptionLabel(
  card: Pick<CreditCardRecord, 'label' | 'lastFour' | 'bank'>,
): string {
  const title = card.label.trim();
  const last = `•••• ${card.lastFour}`;
  const bank = card.bank.trim();
  if (title && bank) return `${title} · ${bank} · ${last}`;
  if (title) return `${title} · ${last}`;
  if (bank) return `${bank} · ${last}`;
  return last;
}
