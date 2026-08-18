import assert from 'node:assert/strict';
import {
  extractDomainsFromName,
  ga4PropertyToDiscoveredInputs,
  matchDomainsToWebsites,
  matchWebsitesFromText,
  matchWebsitesFromUniqueNameToken,
  mergeSourceRefs,
  normalizeDomain,
  parseAdsSourcePlatform,
} from '../supabase/functions/_shared/website-match.ts';

assert.equal(normalizeDomain('https://www.BrandingWorks.com.hk/path'), 'brandingworks.com.hk');
assert.deepEqual(extractDomainsFromName('BW Brandingworks.com.hk P Max-1'), [
  'brandingworks.com.hk',
]);
assert.deepEqual(extractDomainsFromName('A1 BW HK Brandingworks.com.hk Office'), [
  'brandingworks.com.hk',
]);
assert.deepEqual(extractDomainsFromName('A1 BW hkofficedesign.com'), ['hkofficedesign.com']);
assert.deepEqual(extractDomainsFromName('A2 BWL bwsystem.ai'), ['bwsystem.ai']);
assert.deepEqual(extractDomainsFromName('A2 bwdesign-airport.com'), ['bwdesign-airport.com']);
assert.deepEqual(extractDomainsFromName('Project Conect Performance Max-1'), []);

const websites = [
  { id: 'ws3', domain_url: 'https://brandingworks.com.hk/', website_name: 'BW', status: 'live' },
  { id: 'ws2', domain_url: 'https://hkofficedesign.com/', website_name: 'Office', status: 'live' },
  { id: 'ws19', domain_url: 'https://bwsystem.ai/', website_name: 'System', status: 'live' },
  {
    id: 'b100',
    domain_url: 'https://beauty100-magazine.com/',
    website_name: 'Beauty 100',
    status: 'development',
  },
];

assert.deepEqual(
  matchDomainsToWebsites(extractDomainsFromName('BW Brandingworks.com.hk P Max-1'), websites),
  [{ website_profile_id: 'ws3', matched_domain: 'brandingworks.com.hk' }],
);
assert.deepEqual(
  matchWebsitesFromText('A1 BW HK Brandingworks.com.hk Office', websites),
  [{ website_profile_id: 'ws3', matched_domain: 'brandingworks.com.hk' }],
);
assert.deepEqual(matchWebsitesFromText('A2 Beauty100 Magazine', websites), []);
assert.deepEqual(
  matchWebsitesFromUniqueNameToken('A2 Beauty100 Magazine Beauty100 P Max-1', websites),
  [{ website_profile_id: 'b100', matched_domain: 'beauty100-magazine.com' }],
);
assert.deepEqual(
  matchDomainsToWebsites(['beauty100-magazine.com'], websites),
  [{ website_profile_id: 'b100', matched_domain: 'beauty100-magazine.com' }],
);

assert.equal(parseAdsSourcePlatform('google'), 'google');
assert.equal(parseAdsSourcePlatform('ga4'), 'ga4');
assert.equal(parseAdsSourcePlatform('google_analytics'), 'ga4');
assert.equal(parseAdsSourcePlatform('unknown'), null);

const ga4Inputs = ga4PropertyToDiscoveredInputs({
  propertyId: '123456',
  accountId: 'acc-1',
  accountName: 'BW Account',
  displayName: 'Shop Site',
  streamUris: ['https://www.unlinked-shop.com/home', 'https://unlinked-shop.com'],
  websiteProfileId: null,
  matchedDomain: null,
});
assert.equal(ga4Inputs.length, 1);
assert.equal(ga4Inputs[0].normalized_domain, 'unlinked-shop.com');
assert.equal(ga4Inputs[0].source, 'ga4');
assert.equal(ga4Inputs[0].source_ref?.platform, 'ga4');
assert.equal(ga4Inputs[0].source_ref?.campaignId, '123456');
assert.equal(ga4Inputs[0].website_profile_id, null);

const nameOnly = ga4PropertyToDiscoveredInputs({
  propertyId: '789',
  accountId: 'acc-2',
  accountName: 'Name Acc',
  displayName: 'https://name-only.hk',
  streamUris: [],
});
assert.deepEqual(nameOnly.map((r) => r.normalized_domain), ['name-only.hk']);

const streamWins = ga4PropertyToDiscoveredInputs({
  propertyId: '324357389',
  accountId: 'acc-air',
  accountName: 'BW HK Clean AIR',
  displayName: 'BW hkairclean.com',
  streamUris: ['https://www.hkcleanair.com'],
});
assert.deepEqual(streamWins.map((r) => r.normalized_domain), ['hkcleanair.com']);

const brokenStream = ga4PropertyToDiscoveredInputs({
  propertyId: '479167456',
  accountId: 'acc-pet',
  accountName: 'BW Community Design',
  displayName: 'BW hkpetdesign.com',
  streamUris: ['https://www.hkpetdesign'],
});
assert.deepEqual(brokenStream.map((r) => r.normalized_domain), ['hkpetdesign.com']);
assert.deepEqual(
  matchDomainsToWebsites(extractDomainsFromName('BW hkpetdesign.com'), [
    { id: 'ws17', domain_url: 'https://hkpetdesign.com', website_name: 'Pet', status: 'live' },
  ]),
  [{ website_profile_id: 'ws17', matched_domain: 'hkpetdesign.com' }],
);

const noDomain = ga4PropertyToDiscoveredInputs({
  propertyId: '000',
  accountId: 'acc-3',
  accountName: 'App Only',
  displayName: 'Mobile App',
  streamUris: [],
});
assert.deepEqual(noDomain, []);

const merged = mergeSourceRefs(
  [{ platform: 'google', accountId: 'cid-1', accountName: 'Ads Acc', campaignId: 'c1', campaignName: 'Camp' }],
  [{ platform: 'ga4', accountId: 'acc-1', accountName: 'GA Acc', campaignId: '123456', campaignName: 'Shop Site' }],
);
assert.equal(merged.length, 2);
assert.deepEqual(merged.map((r) => r.platform).sort(), ['ga4', 'google']);

console.log('website-match tests passed');
