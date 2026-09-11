import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWebsiteTrafficSummaries,
  formatUsersWithChange,
  ga4WebsiteTrafficWindows,
  sparklineTrend,
  usersChangePct,
} from '../src/lib/ga4WebsiteListTraffic';

const windows = ga4WebsiteTrafficWindows('2026-09-11');
assert.equal(windows.currentFrom, '2026-08-29');
assert.equal(windows.currentTo, '2026-09-11');
assert.equal(windows.previousFrom, '2026-08-15');
assert.equal(windows.previousTo, '2026-08-28');
assert.equal(windows.datesCurrent.length, 14);

assert.ok(Math.abs((usersChangePct(95318, 112940) ?? 0) + 15.60386) < 0.001);
assert.equal(formatUsersWithChange(95318, -15.60386), '95,318 (-15.6%)');
assert.equal(formatUsersWithChange(1200, 12.34), '1,200 (+12.3%)');
assert.equal(formatUsersWithChange(10, null), '10 (—)');
assert.equal(usersChangePct(10, 0), null);

assert.equal(sparklineTrend([1, 2, 3, 4, 5]), 'up');
assert.equal(sparklineTrend([5, 4, 3, 2, 1]), 'down');
assert.equal(sparklineTrend([2, 2, 2, 2]), 'flat');

const summaries = buildWebsiteTrafficSummaries(
  windows,
  [{ propertyId: 'p1', websiteProfileId: 'ws1' }],
  [{ websiteId: 'ws1', propertyId: 'p1' }],
  [
    ...windows.datesCurrent.map((date, i) => ({
      propertyId: 'p1',
      date,
      users: i === windows.datesCurrent.length - 1 ? 95318 - 13 : 1,
    })),
    { propertyId: 'p1', date: windows.previousFrom, users: 112940 },
  ],
);
const row = summaries.get('ws1');
assert.ok(row);
assert.equal(row.currentUsers, 95318);
assert.equal(row.previousUsers, 112940);
assert.equal(formatUsersWithChange(row.currentUsers, row.changePct), '95,318 (-15.6%)');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const list = readFileSync(join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');
assert.match(list, /最近14天流量/);
assert.match(list, /最近14天流量趨勢/);
assert.match(list, /Ga4RecentTrafficCell/);
assert.match(list, /Ga4TrafficTrendCell/);
assert.doesNotMatch(list, />Google Ads<\/th>/);
assert.doesNotMatch(list, />Google Analytics<\/th>/);

console.log('ga4 website list traffic: ok');
