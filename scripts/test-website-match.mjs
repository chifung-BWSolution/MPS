import assert from 'node:assert/strict';
import {
  extractDomainsFromName,
  matchDomainsToWebsites,
  matchWebsitesFromText,
  matchWebsitesFromUniqueNameToken,
  normalizeDomain,
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

console.log('website-match tests passed');
