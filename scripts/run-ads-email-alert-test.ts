import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyCostTrendBuckets, UNASSIGNED_BRAND_ID } from '../src/lib/adsCostTrend.ts';
import {
  ADS_EMAIL_ALERT_THRESHOLD,
  alertMetricTone,
  alertToneClass,
  alertToneHex,
  brandDisplayLabel,
  buildAlertEmailHtml,
  buildAlertEmailSubject,
  buildAlertEmailText,
  buildBrandAlertSnapshots,
  comparisonBucketIds,
  emailTextToHtml,
  escapeHtml,
  flaggedCostAlertBrands,
  formatPercentChange,
  htmlToPlainText,
  isCostAlertCells,
  metricCellsForBucket,
  percentChange,
  previousBucketId,
  defaultAlertStaffIds,
  DEFAULT_ADS_EMAIL_ALERT_STAFF_NAMES,
  selectedAlertBrands,
  staffEmailRecipients,
  summaryMetricCells,
} from '../src/lib/adsEmailAlert.ts';
import type { AdsCostTrendBrandRow } from '../src/types/adsCostTrend.ts';

assert.equal(percentChange(120, 100), 20);
assert.equal(percentChange(80, 100), -20);
assert.equal(percentChange(0, 0), 0);
assert.equal(percentChange(10, 0), null);
assert.equal(percentChange(null, 100), null);
assert.equal(percentChange(100, null), null);

assert.equal(alertMetricTone('impr', 21), 'good');
assert.equal(alertMetricTone('clicks', -21), 'bad');
assert.equal(alertMetricTone('conv', 10), 'neutral');
assert.equal(alertMetricTone('cpc', 21), 'bad');
assert.equal(alertMetricTone('cpa', -21), 'good');
assert.equal(alertMetricTone('cpc', 20), 'neutral');
assert.equal(alertToneClass('good'), 'text-emerald-600');
assert.equal(alertToneClass('bad'), 'text-red-600');
assert.equal(alertToneClass('neutral'), 'text-foreground');
assert.equal(alertToneHex('good'), '#059669');
assert.equal(alertToneHex('bad'), '#dc2626');
assert.equal(alertToneHex('neutral'), '#0d1a2d');

assert.equal(formatPercentChange(22.44), '+22.4%');
assert.equal(formatPercentChange(-20), '-20%');
assert.equal(formatPercentChange(null), '—');

const rolling = [{ id: 'd0_30' }, { id: 'd31_60' }, { id: 'd61_90' }];
assert.equal(previousBucketId(rolling, 'd0_30', 'rolling30'), 'd31_60');
assert.equal(previousBucketId(rolling, 'd61_90', 'rolling30'), null);
assert.deepEqual(comparisonBucketIds(rolling, 'rolling30'), {
  currentId: 'd0_30',
  previousId: 'd31_60',
});

const monthly = [{ id: '2026-07' }, { id: '2026-08' }, { id: '2026-09' }];
assert.equal(previousBucketId(monthly, '2026-09', 'monthly'), '2026-08');
assert.equal(previousBucketId(monthly, '2026-07', 'monthly'), null);
assert.deepEqual(comparisonBucketIds(monthly, 'monthly'), {
  currentId: '2026-09',
  previousId: '2026-08',
});

const brand: AdsCostTrendBrandRow = {
  brandId: 'b1',
  brandCode: 'BW',
  displayName: 'Branding Works',
  campaigns: [],
  buckets: { ...emptyCostTrendBuckets(), d0_30: 4_400_000, d31_60: 2_000_000 },
  impressionBuckets: { ...emptyCostTrendBuckets(), d0_30: 1200, d31_60: 1000 },
  clickBuckets: { ...emptyCostTrendBuckets(), d0_30: 20, d31_60: 20 },
  conversionBuckets: { ...emptyCostTrendBuckets(), d0_30: 2, d31_60: 2 },
  totalMicros: 6_400_000,
};

assert.equal(brandDisplayLabel(brand), 'BW — Branding Works');

const cells = metricCellsForBucket(brand, 'd0_30', 'd31_60');
assert.equal(cells.impr.percent, 20);
assert.equal(cells.impr.tone, 'neutral');
assert.equal(cells.cpc.current, 220_000);
assert.equal(cells.cpc.previous, 100_000);
assert.equal(cells.cpc.percent, 120);
assert.equal(cells.cpc.tone, 'bad');
assert.equal(isCostAlertCells(cells), true);

const summary = summaryMetricCells(brand, 'd0_30', 'd31_60');
assert.equal(summary.cpc.percent, cells.cpc.percent);
assert.equal(summary.impr.current, 2200);

const quiet: AdsCostTrendBrandRow = {
  ...brand,
  brandId: 'b2',
  brandCode: 'QUIET',
  displayName: 'Quiet',
  buckets: { ...emptyCostTrendBuckets(), d0_30: 2_000_000, d31_60: 2_000_000 },
};
const snapshots = buildBrandAlertSnapshots([brand, quiet], 'd0_30', 'd31_60');
const flagged = flaggedCostAlertBrands(snapshots);
assert.equal(flagged.length, 1);
assert.equal(flagged[0].brandId, 'b1');

const period = {
  current: '近 30 日',
  previous: '前 30 日',
  currentRange: '2026-08-16 至 2026-09-14',
  previousRange: '2026-07-17 至 2026-08-15',
};
const subject = buildAlertEmailSubject(flagged, period);
assert.match(subject, new RegExp(`${ADS_EMAIL_ALERT_THRESHOLD}%`));
assert.match(subject, /1 個品牌/);

const unassigned: AdsCostTrendBrandRow = {
  ...brand,
  brandId: UNASSIGNED_BRAND_ID,
  brandCode: '未設定品牌',
  displayName: '未設定品牌',
};
const mixedSnapshots = buildBrandAlertSnapshots([brand, quiet, unassigned], 'd0_30', 'd31_60');
const mixedFlagged = flaggedCostAlertBrands(mixedSnapshots);
assert.equal(mixedFlagged.length, 2);
assert.deepEqual(mixedFlagged.map((row) => row.brandId).sort(), ['b1', UNASSIGNED_BRAND_ID].sort());
assert.equal(selectedAlertBrands(mixedFlagged, ['b1']).length, 1);
assert.equal(buildAlertEmailSubject(selectedAlertBrands(mixedFlagged, ['b1']), period).includes('1 個品牌'), true);
assert.match(buildAlertEmailSubject(mixedFlagged, period), /2 個品牌/);

const text = buildAlertEmailText({ flagged, period, asOf: '2026-09-14' });
assert.match(text, /BW — Branding Works/);
assert.match(text, /CPC/);
assert.match(text, /CPA/);
assert.match(emailTextToHtml(text), /<br \/>/);
assert.match(escapeHtml('<b>x</b>'), /&lt;b&gt;x&lt;\/b&gt;/);

const html = buildAlertEmailHtml({ flagged: mixedFlagged, period, asOf: '2026-09-14' });
assert.match(html, /未設定品牌/);
assert.match(html, /#dc2626/);
assert.match(html, /font-weight:600/);
assert.match(htmlToPlainText(html), /未設定品牌/);

assert.deepEqual(
  staffEmailRecipients([
    { id: 's1', name: 'Ada', email: 'ada@example.com' },
    { value: 's2', label: 'No Mail', keywords: '' },
    { value: 's3', label: 'Bad', keywords: 'not-an-email' },
    { value: 's4', label: 'Leo', keywords: ' leo@example.com ' },
  ]),
  [
    { id: 's1', name: 'Ada', email: 'ada@example.com' },
    { id: 's4', name: 'Leo', email: 'leo@example.com' },
  ],
);

assert.deepEqual([...DEFAULT_ADS_EMAIL_ALERT_STAFF_NAMES], ['Angel Tai', 'Franco Lee']);
assert.deepEqual(
  defaultAlertStaffIds([
    { id: 'a', name: 'Angel Tai', email: 'angel@example.com' },
    { id: 'f', name: 'Franco Lee', email: 'franco@example.com' },
    { id: 'x', name: 'Ada Ou', email: 'ada@example.com' },
  ]).sort(),
  ['a', 'f'],
);
assert.deepEqual(
  defaultAlertStaffIds([{ id: 'a', name: '  angel   tai ', email: 'angel@example.com' }]),
  ['a'],
);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nav = readFileSync(join(root, 'src/context/AppContext.tsx'), 'utf8');
const marketing = readFileSync(join(root, 'src/components/marketing/MarketingModule.tsx'), 'utf8');
const page = readFileSync(join(root, 'src/components/marketing/AdsEmailAlertModule.tsx'), 'utf8');
const dialog = readFileSync(join(root, 'src/components/marketing/AdsEmailAlertDialog.tsx'), 'utf8');

assert.match(nav, /id: 'ads-email-alert'/);
assert.match(nav, /電郵預警通知/);
assert.match(nav, /section: '設定'/);
assert.match(marketing, /AdsEmailAlertModule/);
assert.match(marketing, /ads-email-alert/);
assert.match(page, /發送電郵預警/);
assert.match(page, /useAdsCostTrend/);
assert.match(page, /alertToneClass/);
assert.match(dialog, /sendEmail/);
assert.match(dialog, /idempotencyKey/);
assert.match(dialog, /收件同事/);
assert.match(dialog, /selectedStaffNames\.join\('、'\)/);
assert.match(dialog, /defaultAlertStaffIds/);
assert.doesNotMatch(dialog, /已選 \{selectedEmails\.length\} 人/);
assert.match(dialog, /AdsEmailAlertEditor/);
assert.match(dialog, /selectedAlertBrands/);
assert.match(dialog, /已選 \{includedBrands.length\}/);
assert.match(dialog, /UNASSIGNED_BRAND_ID/);
const editor = readFileSync(join(root, 'src/components/marketing/AdsEmailAlertEditor.tsx'), 'utf8');
assert.match(editor, /useEditor/);
assert.match(editor, /toggleBold/);

console.log('ads email alert: ok');
