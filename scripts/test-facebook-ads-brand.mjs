import assert from 'node:assert/strict';
import { inferFacebookBrandCode, resolveFacebookBrandListId } from '../src/lib/facebookAdsBrand.ts';

assert.equal(inferFacebookBrandCode('Attitude Beauty', 'Attitude Beauty', 'attitude-beauty'), 'BSC');
assert.equal(inferFacebookBrandCode('Wine Passions NEW', 'winepassions', 'winepassions'), 'Wine');
assert.equal(inferFacebookBrandCode('Food Channels Catering FB Ads', 'Food Channels Catering', 'food-channels-catering'), 'FCC');
assert.equal(inferFacebookBrandCode('FC HKlunchbox', 'Food Channels Catering', 'food-channels-catering'), 'FCC');
assert.equal(inferFacebookBrandCode('Branding Works FB Ads', 'Branding Works', 'branding-works'), 'BWA');
assert.equal(inferFacebookBrandCode('BW Office Design', 'Branding Works', 'branding-works'), 'BWA');
assert.equal(inferFacebookBrandCode('EB Space FB Ad', 'Branding Works', 'branding-works'), 'BWA');
assert.equal(inferFacebookBrandCode('Unknown Account', 'Other', 'other'), null);

const brands = new Map([
  ['BSC', 'bsc-id'],
  ['FCC', 'fcc-id'],
]);
assert.equal(
  resolveFacebookBrandListId('manual', 'fcc-id', { accountName: 'Attitude Beauty' }, brands),
  'manual',
);
assert.equal(
  resolveFacebookBrandListId(null, 'fcc-id', { accountName: 'Attitude Beauty' }, brands),
  'fcc-id',
);
assert.equal(
  resolveFacebookBrandListId(null, null, { accountName: 'Attitude Beauty' }, brands),
  'bsc-id',
);

console.log('facebook-ads-brand tests passed');
