import {
  nextExpenseInstallmentNumber,
  type QuotationExpenseInput,
} from '@/lib/quotationExpenses';
import {
  roundMoney,
  toHkd,
  type SystemCurrency,
} from '@/lib/currency';

export const ADS_EXPENSE_PLATFORMS = ['google', 'facebook'] as const;
export type AdsExpensePlatform = (typeof ADS_EXPENSE_PLATFORMS)[number];

export const ADS_EXPENSE_PLATFORM_LABELS: Record<AdsExpensePlatform, string> = {
  google: 'Google Ads',
  facebook: 'Facebook Ads',
};

export type AdsDailySpendInput = {
  platform: AdsExpensePlatform;
  accountId: string;
  campaignId: string;
  metricDate: string;
  spendMicros: number;
  currencyCode?: string | null;
};

export type AdsMonthlySpend = {
  platform: AdsExpensePlatform;
  month: string;
  currencyCode: string;
  currency: SystemCurrency | null;
  amount: number;
  campaignCount: number;
};

export type AdsMonthlyExpenseMonth = {
  month: string;
  spends: AdsMonthlySpend[];
};

const PLATFORM_SUPPLIER_QUERIES: Record<AdsExpensePlatform, string[]> = {
  google: ['Google Ads'],
  facebook: ['Facebook Ads', 'Meta Ads'],
};

export function normalizeAdsCurrency(code: string | null | undefined): {
  currencyCode: string;
  currency: SystemCurrency | null;
} {
  const raw = (code || '').trim().toUpperCase();
  if (!raw) return { currencyCode: '', currency: null };
  if (raw === 'HKD') return { currencyCode: 'HKD', currency: 'HKD' };
  if (raw === 'USD') return { currencyCode: 'USD', currency: 'USD' };
  if (raw === 'RMB' || raw === 'CNY') return { currencyCode: 'RMB', currency: 'RMB' };
  return { currencyCode: raw, currency: null };
}

export function adsSpendMonth(metricDate: string): string {
  return metricDate.trim().slice(0, 7);
}

export function monthEndIso(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return '';
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (!year || monthIndex < 1 || monthIndex > 12) return '';
  const last = new Date(Date.UTC(year, monthIndex, 0));
  return last.toISOString().slice(0, 10);
}

export function formatAdsMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${match[1]}年${Number(match[2])}月`;
}

export function isCurrentAdsMonth(month: string, asOf = new Date()): boolean {
  const current = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}`;
  return month === current;
}

export function adsMonthlyExpenseKey(spend: Pick<AdsMonthlySpend, 'platform' | 'month' | 'currencyCode'>): string {
  return `${spend.platform}:${spend.month}:${spend.currencyCode || 'UNK'}`;
}

export function adsMonthlyExpenseMarker(
  spend: Pick<AdsMonthlySpend, 'platform' | 'month' | 'currencyCode'>,
): string {
  return `[ads-monthly:${adsMonthlyExpenseKey(spend)}]`;
}

export function adsMonthlyExpenseRemarks(
  spend: Pick<AdsMonthlySpend, 'platform' | 'month' | 'currencyCode'>,
  note?: string | null,
): string {
  const marker = adsMonthlyExpenseMarker(spend);
  const label = `${ADS_EXPENSE_PLATFORM_LABELS[spend.platform]} ${formatAdsMonthLabel(spend.month)}`;
  const extra = (note || '').trim();
  if (!extra) return `${label} ${marker}`;
  if (extra.includes(marker)) return extra;
  return `${extra} ${marker}`;
}

export function isAdsMonthlyExpenseAdded(
  expenses: Array<{ remarks?: string | null }>,
  spend: Pick<AdsMonthlySpend, 'platform' | 'month' | 'currencyCode'>,
): boolean {
  const marker = adsMonthlyExpenseMarker(spend);
  return expenses.some((expense) => (expense.remarks ?? '').includes(marker));
}

export function aggregateAdsMonthlySpend(rows: AdsDailySpendInput[]): AdsMonthlySpend[] {
  const buckets = new Map<string, {
    platform: AdsExpensePlatform;
    month: string;
    currencyCode: string;
    currency: SystemCurrency | null;
    micros: number;
    campaigns: Set<string>;
  }>();

  for (const row of rows) {
    const micros = Number(row.spendMicros) || 0;
    if (micros <= 0) continue;
    const month = adsSpendMonth(row.metricDate);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const accountId = row.accountId.trim();
    const campaignId = row.campaignId.trim();
    if (!accountId || !campaignId) continue;
    const currency = normalizeAdsCurrency(row.currencyCode);
    const key = `${row.platform}:${month}:${currency.currencyCode || 'UNK'}`;
    const bucket = buckets.get(key) ?? {
      platform: row.platform,
      month,
      currencyCode: currency.currencyCode,
      currency: currency.currency,
      micros: 0,
      campaigns: new Set<string>(),
    };
    bucket.micros += micros;
    bucket.campaigns.add(`${accountId}:${campaignId}`);
    buckets.set(key, bucket);
  }

  const spends: AdsMonthlySpend[] = [];
  for (const bucket of buckets.values()) {
    const amount = roundMoney(bucket.micros / 1_000_000);
    if (amount <= 0) continue;
    spends.push({
      platform: bucket.platform,
      month: bucket.month,
      currencyCode: bucket.currencyCode,
      currency: bucket.currency,
      amount,
      campaignCount: bucket.campaigns.size,
    });
  }

  spends.sort((a, b) => {
    const byMonth = b.month.localeCompare(a.month);
    if (byMonth !== 0) return byMonth;
    const byPlatform = a.platform.localeCompare(b.platform);
    if (byPlatform !== 0) return byPlatform;
    return a.currencyCode.localeCompare(b.currencyCode);
  });
  return spends;
}

export function groupAdsMonthlySpends(spends: AdsMonthlySpend[]): AdsMonthlyExpenseMonth[] {
  const byMonth = new Map<string, AdsMonthlySpend[]>();
  for (const spend of spends) {
    const list = byMonth.get(spend.month) ?? [];
    list.push(spend);
    byMonth.set(spend.month, list);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, monthSpends]) => ({
      month,
      spends: [...monthSpends].sort((a, b) => {
        const byPlatform = a.platform.localeCompare(b.platform);
        if (byPlatform !== 0) return byPlatform;
        return a.currencyCode.localeCompare(b.currencyCode);
      }),
    }));
}

function normalizeSupplierName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreSupplierName(query: string, name: string): number {
  const q = normalizeSupplierName(query);
  const n = normalizeSupplierName(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.includes(q)) return 80;
  return 0;
}

export function matchAdsExpenseSupplier<T extends {
  id: string;
  supplierTypesId: string | null;
  displayName: string;
  companyName?: string;
  isActive: boolean;
}>(platform: AdsExpensePlatform, suppliers: T[]): T | null {
  let best: { supplier: T; score: number; nameLength: number } | null = null;
  for (const supplier of suppliers) {
    if (!supplier.isActive || !supplier.supplierTypesId) continue;
    const names = [supplier.displayName, supplier.companyName ?? ''].filter(Boolean);
    for (const query of PLATFORM_SUPPLIER_QUERIES[platform]) {
      for (const name of names) {
        const score = scoreSupplierName(query, name);
        if (!score) continue;
        if (
          !best
          || score > best.score
          || (score === best.score && name.length < best.nameLength)
        ) {
          best = { supplier, score, nameLength: name.length };
        }
      }
    }
  }
  return best && best.score >= 80 ? best.supplier : null;
}

export function adsMonthlySpendToExpenseInput(input: {
  spend: AdsMonthlySpend & { currency: SystemCurrency };
  supplierTypesId: string;
  supplierId: string;
  installmentNumber: number;
  dueDate: string;
  note?: string | null;
}): QuotationExpenseInput {
  return {
    supplierTypesId: input.supplierTypesId,
    supplierId: input.supplierId,
    installmentNumber: input.installmentNumber,
    currency: input.spend.currency,
    billedAmount: toHkd(input.spend.amount, input.spend.currency),
    dueDate: input.dueDate,
    paymentAmount: 0,
    paymentDate: null,
    paymentMethod: null,
    creditCardId: null,
    paymentStatus: null,
    badDebt: 0,
    remarks: adsMonthlyExpenseRemarks(input.spend, input.note),
  };
}

export function nextAdsMonthlyInstallment(
  expenses: Array<{ groupKey?: string; installmentNumber?: number }>,
  supplierTypesId: string,
  supplierId: string,
): number {
  return nextExpenseInstallmentNumber(expenses, supplierTypesId, supplierId);
}
