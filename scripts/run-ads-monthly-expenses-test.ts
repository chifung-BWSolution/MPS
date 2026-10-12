import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toHkd } from '../src/lib/currency.ts';
import {
  adsMonthlyExpenseMarker,
  adsMonthlyExpenseRemarks,
  adsMonthlySpendToExpenseInput,
  aggregateAdsMonthlySpend,
  formatAdsMonthLabel,
  groupAdsMonthlySpends,
  isAdsMonthlyExpenseAdded,
  isCurrentAdsMonth,
  matchAdsExpenseSupplier,
  monthEndIso,
  normalizeAdsCurrency,
} from '../src/lib/adsMonthlyExpenses.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.deepEqual(normalizeAdsCurrency('hkd'), { currencyCode: 'HKD', currency: 'HKD' });
assert.deepEqual(normalizeAdsCurrency('CNY'), { currencyCode: 'RMB', currency: 'RMB' });
assert.deepEqual(normalizeAdsCurrency('EUR'), { currencyCode: 'EUR', currency: null });
assert.deepEqual(normalizeAdsCurrency(''), { currencyCode: '', currency: null });

assert.equal(monthEndIso('2026-02'), '2026-02-28');
assert.equal(monthEndIso('2024-02'), '2024-02-29');
assert.equal(monthEndIso('2026-12'), '2026-12-31');
assert.equal(formatAdsMonthLabel('2026-03'), '2026年3月');
assert.equal(isCurrentAdsMonth('2026-10', new Date(2026, 9, 9)), true);
assert.equal(isCurrentAdsMonth('2026-09', new Date(2026, 9, 9)), false);

const spends = aggregateAdsMonthlySpend([
  {
    platform: 'google',
    accountId: '123',
    campaignId: 'g1',
    metricDate: '2026-03-01',
    spendMicros: 1_500_000,
    currencyCode: 'HKD',
  },
  {
    platform: 'google',
    accountId: '123',
    campaignId: 'g2',
    metricDate: '2026-03-20T00:00:00',
    spendMicros: 500_000,
    currencyCode: 'HKD',
  },
  {
    platform: 'google',
    accountId: '123',
    campaignId: 'g1',
    metricDate: '2026-04-02',
    spendMicros: 0,
    currencyCode: 'HKD',
  },
  {
    platform: 'facebook',
    accountId: 'act_1',
    campaignId: 'f1',
    metricDate: '2026-03-18',
    spendMicros: 2_000_000,
    currencyCode: 'USD',
  },
  {
    platform: 'facebook',
    accountId: 'act_1',
    campaignId: 'f2',
    metricDate: '2026-01-05',
    spendMicros: 250_000,
    currencyCode: 'CNY',
  },
  {
    platform: 'google',
    accountId: '999',
    campaignId: 'g9',
    metricDate: '2026-03-08',
    spendMicros: 3_000_000,
    currencyCode: 'USD',
  },
]);

assert.deepEqual(
  spends.map((row) => ({
    platform: row.platform,
    month: row.month,
    currencyCode: row.currencyCode,
    amount: row.amount,
    campaignCount: row.campaignCount,
  })),
  [
    { platform: 'facebook', month: '2026-03', currencyCode: 'USD', amount: 2, campaignCount: 1 },
    { platform: 'google', month: '2026-03', currencyCode: 'HKD', amount: 2, campaignCount: 2 },
    { platform: 'google', month: '2026-03', currencyCode: 'USD', amount: 3, campaignCount: 1 },
    { platform: 'facebook', month: '2026-01', currencyCode: 'RMB', amount: 0.25, campaignCount: 1 },
  ],
);

const months = groupAdsMonthlySpends(spends);
assert.deepEqual(months.map((month) => month.month), ['2026-03', '2026-01']);
assert.deepEqual(
  months[0].spends.map((row) => `${row.platform}:${row.currencyCode}`),
  ['facebook:USD', 'google:HKD', 'google:USD'],
);

const googleMarch = spends.find((row) => row.platform === 'google' && row.currencyCode === 'HKD');
assert.ok(googleMarch);
const marker = adsMonthlyExpenseMarker(googleMarch);
assert.equal(marker, '[ads-monthly:google:2026-03:HKD]');
assert.equal(
  adsMonthlyExpenseRemarks(googleMarch),
  `Google Ads 2026年3月 ${marker}`,
);
assert.equal(adsMonthlyExpenseRemarks(googleMarch, `已對帳 ${marker}`), `已對帳 ${marker}`);
assert.equal(isAdsMonthlyExpenseAdded([{ remarks: `note ${marker}` }], googleMarch), true);
assert.equal(isAdsMonthlyExpenseAdded([{ remarks: '其他支出' }], googleMarch), false);

assert.equal(googleMarch.currency, 'HKD');
const expense = adsMonthlySpendToExpenseInput({
  spend: { ...googleMarch, currency: 'HKD' },
  supplierTypesId: 'type_ads',
  supplierId: 'supplier_google',
  installmentNumber: 4,
  dueDate: monthEndIso(googleMarch.month),
  note: '月結',
});
assert.equal(expense.billedAmount, toHkd(2, 'HKD'));
assert.equal(expense.currency, 'HKD');
assert.equal(expense.dueDate, '2026-03-31');
assert.equal(expense.paymentAmount, 0);
assert.equal(expense.installmentNumber, 4);
assert.match(expense.remarks || '', /月結/);
assert.match(expense.remarks || '', /\[ads-monthly:google:2026-03:HKD\]/);

const matched = matchAdsExpenseSupplier('google', [
  { id: 'short', supplierTypesId: 't', displayName: 'Google', companyName: '', isActive: true },
  { id: 'ads', supplierTypesId: 't', displayName: 'Google Ads', companyName: '', isActive: true },
  { id: 'off', supplierTypesId: 't', displayName: 'Google Ads', companyName: '', isActive: false },
]);
assert.equal(matched?.id, 'ads');
assert.equal(matchAdsExpenseSupplier('facebook', [
  { id: 'meta', supplierTypesId: null, displayName: 'Meta Ads', companyName: '', isActive: true },
]), null);

const tab = read('src/components/quotation/PitchingExpenseTab.tsx');
assert.match(tab, /PitchingAdsMonthlyExpenses/);
assert.match(tab, /relatedType === 'quotation_client'/);
assert.match(tab, /linkedWebsiteId\.trim\(\)/);
assert.match(tab, /handleAdsMonthlyAdd/);

const section = read('src/components/quotation/PitchingAdsMonthlyExpenses.tsx');
assert.match(section, /廣告月費/);
assert.match(section, /加入支出/);
assert.match(section, /已加入/);
assert.match(section, /useWebsiteAdsMonthlyExpenses/);

const hook = read('src/hooks/useWebsiteAdsMonthlyExpenses.ts');
assert.match(hook, /google_ads_campaign_websites/);
assert.match(hook, /facebook_ads_campaigns/);
assert.match(hook, /facebook_ads_accounts/);
assert.doesNotMatch(hook, /facebook_ads_account_websites/);
assert.doesNotMatch(hook, /facebook_ads_accounts[\s\S]{0,80}brand_list_id/);
assert.match(hook, /google_ads_campaign_daily_metrics/);
assert.match(hook, /facebook_ads_campaign_daily_metrics/);
assert.match(hook, /brand_list_id/);

console.log('ads monthly expenses tests passed');
