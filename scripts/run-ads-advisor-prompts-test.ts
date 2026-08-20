import assert from 'node:assert/strict';
import {
  getAdsAdvisorSuggestedPrompts,
  resolveAdsAdvisorPromptScenario,
} from '../src/lib/adsAdvisorPrompts';
import type { AdsAdvisorSnapshot } from '../src/types/adsAdvisor';

function snap(partial: Partial<AdsAdvisorSnapshot>): AdsAdvisorSnapshot {
  return {
    platform: 'google',
    accountId: '1',
    campaignId: '2',
    campaignName: 'Test',
    status: 'ENABLED',
    accountLabel: 'Acc',
    websites: [],
    tags: [],
    dateFrom: '2026-07-20',
    dateTo: '2026-08-18',
    kpis: [],
    ...partial,
  };
}

assert.equal(
  resolveAdsAdvisorPromptScenario(snap({ channelOrObjective: 'SEARCH' })),
  'google_search',
);
assert.equal(
  resolveAdsAdvisorPromptScenario(snap({ channelOrObjective: 'PERFORMANCE_MAX' })),
  'google_pmax',
);
assert.equal(
  resolveAdsAdvisorPromptScenario(snap({ channelOrObjective: 'DEMAND_GEN' })),
  'google_demand_gen',
);
assert.equal(
  resolveAdsAdvisorPromptScenario(snap({ channelOrObjective: 'SHOPPING' })),
  'google_shopping',
);

const pmax = getAdsAdvisorSuggestedPrompts(
  snap({ channelOrObjective: 'PERFORMANCE_MAX', objectives: ['PURCHASE'] }),
);
assert.equal(pmax.length, 4);
assert.ok(pmax.every((q) => !q.includes('關鍵字')), 'PMax prompts must not mention keywords');
assert.ok(pmax.some((q) => /asset group|素材|PMax/i.test(q)));
assert.ok(pmax[1].includes('CPA') || pmax[1].includes('ROAS'));

const search = getAdsAdvisorSuggestedPrompts(
  snap({ channelOrObjective: 'SEARCH', objectives: ['PAGE_VIEW'] }),
);
assert.ok(search.some((q) => q.includes('關鍵字') || q.includes('搜尋字詞')));
assert.ok(search[1].includes('CPC'));

const messaging = getAdsAdvisorSuggestedPrompts(
  snap({
    platform: 'facebook',
    channelOrObjective: 'OUTCOME_ENGAGEMENT',
    campaignName: '202608 - 新客首試療程 - 訊息量 - Cold',
  }),
);
assert.equal(
  resolveAdsAdvisorPromptScenario(
    snap({
      platform: 'facebook',
      channelOrObjective: 'OUTCOME_ENGAGEMENT',
      campaignName: '202608 - 新客首試療程 - 訊息量 - Cold',
    }),
  ),
  'facebook_messaging',
);
assert.ok(messaging.every((q) => !q.includes('關鍵字')));
assert.ok(messaging.some((q) => q.includes('對話')));

assert.equal(
  resolveAdsAdvisorPromptScenario(
    snap({ platform: 'facebook', channelOrObjective: 'OUTCOME_SALES' }),
  ),
  'facebook_sales',
);
assert.equal(
  resolveAdsAdvisorPromptScenario(
    snap({ platform: 'facebook', channelOrObjective: 'OUTCOME_LEADS' }),
  ),
  'facebook_leads',
);
assert.equal(
  resolveAdsAdvisorPromptScenario(
    snap({ platform: 'facebook', channelOrObjective: 'OUTCOME_TRAFFIC' }),
  ),
  'facebook_traffic',
);
assert.equal(
  resolveAdsAdvisorPromptScenario(
    snap({ platform: 'facebook', channelOrObjective: 'OUTCOME_AWARENESS' }),
  ),
  'facebook_awareness',
);

const sales = getAdsAdvisorSuggestedPrompts(
  snap({ platform: 'facebook', channelOrObjective: 'CONVERSIONS' }),
);
assert.ok(sales.some((q) => q.includes('版位')));
assert.ok(sales.every((q) => !q.includes('關鍵字')));

console.log('ads advisor prompt scenario tests passed');
