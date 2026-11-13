import assert from 'node:assert/strict';
import {
  buildFrequentReportItems,
  isProjectHubId,
  partitionReportRelatedIds,
} from '../src/lib/frequentReportItems';

const websiteId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const asanaGid = '1209456549512345';

const split = partitionReportRelatedIds([
  websiteId,
  asanaGid,
  websiteId,
  'legacy-text',
  '',
  clientId,
]);
assert.deepEqual(split.projectIds, [websiteId, clientId]);
assert.deepEqual(split.asanaTaskGids, [asanaGid]);
assert.equal(isProjectHubId(asanaGid), false);
assert.equal(isProjectHubId(websiteId), true);

const modes: Record<string, string> = {
  website_design: 'required',
  client_meeting: 'required',
  internal_meeting: 'optional',
  training: 'none',
};

const items = buildFrequentReportItems(
  [
    {
      relatedId: websiteId,
      relatedName: '舊網站名',
      category: 'website_design',
      hours: 2,
      createdAt: '2026-11-01T01:00:00Z',
    },
    {
      relatedId: websiteId,
      relatedName: '舊網站名',
      category: 'website_design',
      hours: 1.5,
      createdAt: '2026-11-10T01:00:00Z',
    },
    {
      relatedId: asanaGid,
      relatedName: 'Asana 提案',
      category: 'client_meeting',
      hours: 1,
      createdAt: '2026-11-12T01:00:00Z',
    },
    {
      relatedId: clientId,
      relatedName: '',
      category: 'client_meeting',
      hours: 1,
      createdAt: '2026-11-11T01:00:00Z',
    },
    {
      relatedId: null,
      relatedName: null,
      category: 'internal_meeting',
      hours: 1,
      createdAt: '2026-11-03T01:00:00Z',
    },
    {
      relatedId: null,
      relatedName: null,
      category: 'training',
      hours: 3,
      createdAt: '2026-11-02T01:00:00Z',
    },
    {
      relatedId: '',
      relatedName: '',
      category: 'website_design',
      hours: 4,
      createdAt: '2026-11-09T01:00:00Z',
    },
  ],
  new Map([
    [websiteId, '現用網站'],
    [asanaGid, 'Asana 現名'],
  ]),
  (category) => modes[category] ?? 'none',
);

assert.deepEqual(
  items.map((item) => [item.category, item.relatedName, item.count, item.totalHours]),
  [
    ['website_design', '現用網站', 2, 3.5],
    ['client_meeting', 'Asana 現名', 1, 1],
    ['internal_meeting', '（未選項目）', 1, 1],
    ['training', 'N/A', 1, 3],
  ],
);

const fallbackOnly = buildFrequentReportItems(
  [
    {
      relatedId: asanaGid,
      relatedName: '只剩匯報上的名稱',
      category: 'website_design',
      hours: 2,
      createdAt: '2026-11-12T01:00:00Z',
    },
  ],
  new Map(),
  (category) => modes[category] ?? 'none',
);
assert.equal(fallbackOnly[0]?.relatedName, '只剩匯報上的名稱');
assert.equal(fallbackOnly[0]?.relatedId, asanaGid);

console.log('frequent report items ok');
