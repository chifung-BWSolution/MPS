import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWebsiteToolConnections,
  formatGoogleAdsCustomerId,
  groupAnalyticsAccountsByName,
  mapFacebookAdsAccount,
  mapGa4Account,
  mapGoogleAdsAccount,
  mapGscAccount,
} from '../src/lib/analyticsToolConnections.ts';

assert.equal(formatGoogleAdsCustomerId('1234567890'), '123-456-7890');
assert.equal(formatGoogleAdsCustomerId('123-456-7890'), '123-456-7890');
assert.equal(formatGoogleAdsCustomerId('abc'), 'abc');

const ga4 = mapGa4Account({
  property_id: '123',
  display_name: 'BW Design',
  account_name: 'BW',
  measurement_id: 'G-ABCDEF12',
});
assert.equal(ga4?.name, 'BW Design');
assert.equal(ga4?.description, 'G-ABCDEF12');

const gsc = mapGscAccount({
  site_url: 'sc-domain:bwdesign.com.hk',
  permission_level: 'siteOwner',
  matched_domain: 'bwdesign.com.hk',
});
assert.equal(gsc?.name, 'bwdesign.com.hk');
assert.equal(gsc?.description, 'sc-domain:bwdesign.com.hk');

const groupedGsc = groupAnalyticsAccountsByName([
  { id: 'https://www.bwdesign-office.com/', name: 'bwdesign-office.com', description: 'https://www.bwdesign-office.com/' },
  { id: 'https://bwdesign-office.com/', name: 'bwdesign-office.com', description: 'https://bwdesign-office.com/' },
]);
assert.equal(groupedGsc.length, 1);
assert.equal(groupedGsc[0].name, 'bwdesign-office.com');
assert.deepEqual(groupedGsc[0].descriptions, [
  'https://www.bwdesign-office.com/',
  'https://bwdesign-office.com/',
]);

const ads = mapGoogleAdsAccount({
  customer_id: '1234567890',
  descriptive_name: 'BW MCC',
});
assert.equal(ads?.name, 'BW MCC');
assert.equal(ads?.description, '123-456-7890');

const fb = mapFacebookAdsAccount({
  ad_account_id: 'act_99',
  account_name: 'BW Facebook',
  business_name: 'BW',
});
assert.equal(fb?.name, 'BW Facebook');
assert.equal(fb?.description, 'act_99');

const byWebsite = buildWebsiteToolConnections({
  websites: [
    {
      id: 'ws1',
      ga4PropertyId: '123',
      gscSiteUrl: 'sc-domain:bwdesign.com.hk',
      googleAdsCustomerId: '1234567890',
      brandListId: 'brand-1',
    },
    { id: 'ws2' },
  ],
  ga4: [
    {
      property_id: '123',
      display_name: 'BW Design',
      measurement_id: 'G-ABCDEF12',
      website_profile_id: null,
    },
  ],
  gsc: [
    {
      site_url: 'sc-domain:bwdesign.com.hk',
      matched_domain: 'bwdesign.com.hk',
      website_profile_id: 'ws1',
    },
  ],
  googleAdsLinks: [{ website_profile_id: 'ws1', customer_id: '1234567890' }],
  googleAdsAccounts: [{ customer_id: '1234567890', descriptive_name: 'BW MCC' }],
  facebookAdsAccounts: [{ ad_account_id: 'act_99', account_name: 'BW Facebook', brandIds: ['brand-1'] }],
});

const ws1 = byWebsite.get('ws1');
assert.ok(ws1);
assert.equal(ws1.ga4.accounts[0]?.description, 'G-ABCDEF12');
assert.equal(ws1.gsc.accounts[0]?.name, 'bwdesign.com.hk');
assert.equal(ws1.googleAds.accounts[0]?.name, 'BW MCC');
assert.equal(ws1.facebookAds.accounts[0]?.description, 'act_99');

const ws2 = byWebsite.get('ws2');
assert.ok(ws2);
assert.equal(ws2.ga4.accounts.length, 0);
assert.equal(ws2.facebookAds.accounts.length, 0);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const menu = readFileSync(join(root, 'src/context/AppContext.tsx'), 'utf8');
assert.match(menu, /id: 'analytics-connections'/);
assert.match(menu, /分析工具連接/);

const website = readFileSync(join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');
assert.match(website, /AnalyticsConnectionsModule/);
assert.match(website, /analytics-connections/);

const page = readFileSync(join(root, 'src/components/website/AnalyticsConnectionsModule.tsx'), 'utf8');
assert.match(page, /分析工具連接/);
assert.match(page, />\s*GA4\s*</);
assert.match(page, />\s*GSC\s*</);
assert.match(page, />\s*Google Ads\s*</);
assert.match(page, />\s*Facebook Ads\s*</);
assert.match(page, /ConnectionCell/);
assert.match(page, /<table/);
assert.match(page, /WebsiteListFilterBar/);
assert.match(page, /label="GA4"/);
assert.match(page, /label="GSC"/);
assert.match(page, /label="Google Ads"/);
assert.match(page, /label="Facebook Ads"/);

const list = readFileSync(join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');
assert.doesNotMatch(list, /Google Ads：全部/);
assert.doesNotMatch(list, /adsFilter/);

const hook = readFileSync(join(root, 'src/hooks/useAnalyticsToolConnections.ts'), 'utf8');
assert.match(hook, /from\('facebook_ads_accounts'\)[\s\S]{0,180}ad_account_id,account_name,business_name,business_key/);
assert.doesNotMatch(hook, /from\('facebook_ads_accounts'\)[\s\S]{0,180}brand_list_id/);
assert.match(hook, /from\('facebook_ads_campaigns'\)/);

console.log('analytics tool connections: ok');
