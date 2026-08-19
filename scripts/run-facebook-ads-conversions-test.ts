import assert from 'node:assert/strict';
import {
  extractActionBreakdown,
  listActionBreakdownRows,
  mergeActionBreakdowns,
  normalizeActionFamily,
  sumConversions,
  sumConversionsFromActions,
} from '../src/lib/facebookAdsConversions';

function action(type: string, value: number) {
  return { action_type: type, value };
}

function result(indicator: string, value?: number) {
  if (value == null) return { indicator };
  return { indicator, values: [{ value }] };
}

// Ads Manager 成果 = 5 purchases — use results even when other events exist.
assert.equal(
  sumConversions({
    results: [result('offsite_conversion.fb_pixel_purchase', 5)],
    conversions: [action('purchase', 5), action('add_to_cart', 11)],
    actions: [action('purchase', 5), action('add_to_cart', 11), action('initiate_checkout', 1)],
  }),
  5,
);

// 0-purchase day: present results must stay 0 (do not fall through to ATC).
assert.equal(
  sumConversions({
    results: [result('offsite_conversion.fb_pixel_purchase', 0)],
    conversions: [action('add_to_cart', 4), action('initiate_checkout', 1)],
    actions: [action('add_to_cart', 4), action('initiate_checkout', 1)],
  }),
  0,
);

// Empty results array is still "present".
assert.equal(
  sumConversions({
    results: [],
    actions: [action('add_to_cart', 7)],
  }),
  0,
);

// Traffic 成果 (link_click) is not Conv.
assert.equal(
  sumConversions({
    results: [result('link_click', 80)],
    actions: [action('link_click', 80), action('landing_page_view', 20)],
  }),
  0,
);

// Meta omitted results: first-match actions (purchase before ATC).
assert.equal(
  sumConversions({
    actions: [action('omni_purchase', 5), action('omni_add_to_cart', 11)],
  }),
  5,
);

assert.equal(sumConversionsFromActions([action('add_to_cart', 11)]), 11);
assert.equal(
  sumConversionsFromActions([action('add_to_cart', 11), action('initiate_checkout', 1)]),
  1,
);

// Do not sum every family when results is missing — purchase wins, not 5+11.
assert.notEqual(
  sumConversions({
    actions: [action('purchase', 5), action('add_to_cart', 11)],
  }),
  16,
);

assert.equal(normalizeActionFamily('offsite_conversion.fb_pixel_purchase'), 'purchase');
assert.equal(normalizeActionFamily('omni_initiated_checkout'), 'initiate_checkout');
assert.equal(normalizeActionFamily('link_click'), null);
assert.equal(normalizeActionFamily('offsite_conversion.fb_pixel_view_content'), 'view_content');

const breakdown = extractActionBreakdown([
  action('omni_purchase', 5),
  action('offsite_conversion.fb_pixel_purchase', 5),
  action('add_to_cart', 11),
  action('omni_add_to_cart', 10),
  action('link_click', 226),
  action('offsite_conversion.fb_pixel_search', 3),
  action('offsite_conversion.fb_pixel_view_content', 89),
  action('initiate_checkout', 1),
  action('add_payment_info', 1),
]);
assert.equal(breakdown.purchase, 5);
assert.equal(breakdown.add_to_cart, 11);
assert.equal(breakdown.search, 3);
assert.equal(breakdown.view_content, 89);
assert.equal(breakdown.initiate_checkout, 1);
assert.equal(breakdown.add_payment_info, 1);
assert.equal(breakdown.link_click, undefined);

const merged = mergeActionBreakdowns([
  { purchase: 2, add_to_cart: 4 },
  { purchase: 3, search: 3 },
]);
assert.deepEqual(merged, { purchase: 5, add_to_cart: 4, search: 3 });

const rows = listActionBreakdownRows(breakdown);
assert.equal(rows[0].key, 'purchase');
assert.equal(rows[0].label, '網站購買');
assert.ok(rows.some((r) => r.key === 'view_content'));
assert.ok(!rows.some((r) => r.key === 'link_click'));

console.log('facebook ads conversions tests ok');
