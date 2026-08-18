import assert from 'node:assert/strict';
import {
  addDaysIso,
  deriveGa4Totals,
  domainsRelated,
  formatDurationSeconds,
  ga4DateToIso,
  matchWebsiteForGa4Property,
  normalizeGa4PropertyId,
  previousPeriod,
  validateLiveGa4Range,
} from '../src/lib/ga4Traffic';

assert.equal(normalizeGa4PropertyId('properties/123456789'), '123456789');
assert.equal(normalizeGa4PropertyId('123456789'), '123456789');
assert.equal(ga4DateToIso('20260818'), '2026-08-18');
assert.equal(ga4DateToIso('2026-08-18'), '2026-08-18');
assert.equal(addDaysIso('2026-08-18', -1), '2026-08-17');

const prev = previousPeriod('2026-08-01', '2026-08-07');
assert.equal(prev.from, '2026-07-25');
assert.equal(prev.to, '2026-07-31');

const totals = deriveGa4Totals({
  users: 100,
  newUsers: 40,
  sessions: 200,
  pageviews: 500,
  engagedSessions: 80,
  conversions: 3,
  durationSecondsWeighted: 200 * 90,
});
assert.equal(totals.engagementRate, 0.4);
assert.equal(totals.bounceRate, 0.6);
assert.equal(totals.avgSessionDuration, 90);
assert.equal(totals.pagesPerSession, 2.5);
assert.equal(formatDurationSeconds(90), '1:30');

assert.equal(domainsRelated('www.example.com', 'https://example.com/path'), true);
assert.equal(domainsRelated('shop.example.com', 'example.com'), true);
assert.equal(domainsRelated('other.com', 'example.com'), false);

const websites = [
  { id: 'ws1', domain_url: 'https://www.bwdesign.hk', website_name: 'BW Design', ga4_property_id: null },
  { id: 'ws2', domain_url: 'aci.global', website_name: 'ACI', ga4_property_id: '999' },
];

const explicit = matchWebsiteForGa4Property(
  { propertyId: '999', displayName: 'Something else' },
  websites,
);
assert.equal(explicit?.websiteProfileId, 'ws2');

const stream = matchWebsiteForGa4Property(
  { propertyId: '111', displayName: 'BW', streamUris: ['https://bwdesign.hk'] },
  websites,
);
assert.equal(stream?.websiteProfileId, 'ws1');
assert.equal(stream?.matchedDomain, 'bwdesign.hk');

const rangeOk = validateLiveGa4Range('2026-07-01', '2026-08-01');
assert.equal(rangeOk.ok, true);
const rangeLong = validateLiveGa4Range('2026-01-01', '2026-08-01');
assert.equal(rangeLong.ok, false);

console.log('All GA4 traffic helper checks passed.');
