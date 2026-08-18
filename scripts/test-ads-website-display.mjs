import assert from 'node:assert/strict';
import {
  adsPlatformSourceLabel,
  domainSourceOrigin,
  domainSourceOriginLabel,
  originSortRank,
  parseAdsPlatformSource,
} from '../src/lib/adsWebsiteDisplay.ts';

assert.equal(parseAdsPlatformSource('google'), 'google');
assert.equal(parseAdsPlatformSource('GA4'), 'ga4');
assert.equal(parseAdsPlatformSource('google_analytics'), 'ga4');

assert.equal(domainSourceOrigin(['google']), 'ads');
assert.equal(domainSourceOrigin(['ga4']), 'analytics');
assert.equal(domainSourceOrigin(['google', 'ga4']), 'both');
assert.equal(domainSourceOrigin(['facebook']), 'facebook');
assert.equal(domainSourceOrigin([]), 'unknown');

assert.equal(domainSourceOriginLabel('ads'), 'Google Ads');
assert.equal(domainSourceOriginLabel('analytics'), 'Google Analytics');
assert.equal(domainSourceOriginLabel('both'), 'Google Ads + Google Analytics');
assert.equal(adsPlatformSourceLabel('google'), 'Google Ads');
assert.equal(adsPlatformSourceLabel('ga4'), 'Google Analytics');

assert.ok(originSortRank('both') < originSortRank('ads'));
assert.ok(originSortRank('ads') < originSortRank('analytics'));

console.log('ads-website-display tests passed');
