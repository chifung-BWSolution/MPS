import assert from 'node:assert/strict';
import {
  ga4ConnectionLabel,
  ga4LinkedWebsiteIds,
  googleAdsConnectionLabel,
  googleAdsStatusByWebsiteId,
  isGoogleAdsCampaignEnabled,
  normalizeGoogleAdsCampaignStatus,
  resolveGa4ConnectionStatus,
  resolveGoogleAdsConnectionStatus,
} from '../src/lib/websiteConnectionStatus.ts';

assert.equal(normalizeGoogleAdsCampaignStatus('enabled'), 'ENABLED');
assert.equal(normalizeGoogleAdsCampaignStatus('ENABLEＤ'), 'ENABLED');
assert.equal(isGoogleAdsCampaignEnabled('ENABLED'), true);
assert.equal(isGoogleAdsCampaignEnabled('ENABLEＤ'), true);
assert.equal(isGoogleAdsCampaignEnabled('PAUSED'), false);
assert.equal(isGoogleAdsCampaignEnabled('REMOVED'), false);

assert.equal(resolveGoogleAdsConnectionStatus([]), 'unlinked');
assert.equal(resolveGoogleAdsConnectionStatus(['PAUSED', 'REMOVED']), 'paused');
assert.equal(resolveGoogleAdsConnectionStatus(['PAUSED', 'ENABLED']), 'active');
assert.equal(resolveGoogleAdsConnectionStatus(['ENABLEＤ']), 'active');

assert.equal(googleAdsConnectionLabel('active'), '投放中');
assert.equal(googleAdsConnectionLabel('paused'), '已停用');
assert.equal(googleAdsConnectionLabel('unlinked'), '未連接');

assert.equal(resolveGa4ConnectionStatus(true), 'linked');
assert.equal(resolveGa4ConnectionStatus(false), 'unlinked');
assert.equal(ga4ConnectionLabel('linked'), '已連接');
assert.equal(ga4ConnectionLabel('unlinked'), '未連接');

const adsMap = googleAdsStatusByWebsiteId(
  [
    { websiteProfileId: 'w-active', campaignRowId: 'c1:1' },
    { websiteProfileId: 'w-active', customerId: 'c1', campaignId: '2' },
    { websiteProfileId: 'w-paused', campaignRowId: 'c2:9' },
    { websiteProfileId: 'w-missing-meta', campaignRowId: 'gone' },
  ],
  [
    { id: 'c1:1', status: 'PAUSED' },
    { customerId: 'c1', campaignId: '2', status: 'ENABLED' },
    { id: 'c2:9', status: 'PAUSED' },
  ],
);
assert.equal(adsMap['w-active'], 'active');
assert.equal(adsMap['w-paused'], 'paused');
assert.equal(adsMap['w-missing-meta'], 'paused');
assert.equal(adsMap['w-none'], undefined);

const ga4Ids = ga4LinkedWebsiteIds([
  { websiteProfileId: 'w1' },
  { websiteProfileId: '  ' },
  { websiteProfileId: null },
  { websiteProfileId: 'w1' },
]);
assert.deepEqual([...ga4Ids], ['w1']);

console.log('website-connection-status tests passed');
