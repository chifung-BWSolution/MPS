/**
 * 熱點雷達 · 純函式與接線自測
 *
 * 用法：node scripts/run-hotspot-radar-test.ts（或 npm run hotspot:test）
 * 不引入測試框架，與 scripts/run-seo-radar-test.ts 同一風格。
 *
 * 開發中途可只跑純函式：HOTSPOT_SKIP_WIRING=1 node scripts/run-hotspot-radar-test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOTSPOT_AD_LONG_RUNNING_DAYS,
  HOTSPOT_MEDIAN_MIN_SAMPLE,
  HOTSPOT_SORT_KEYS,
  budgetPercent,
  budgetState,
  buildItemPayload,
  classifyInstagramMediaType,
  classifyProviderStatus,
  compareBySort,
  computeItemComputed,
  computeMedian,
  computeRelativeHeat,
  computeTargetsRemaining,
  engagementOf,
  estimateCostUsd,
  hongKongMonthKey,
  instagramPermalinkFromOEmbedHtml,
  isHotItem,
  itemsForKind,
  mapProviderItem,
  monthSpend,
  normalizeAdKeyword,
  normalizeHandle,
  normalizeHashtag,
  normalizeTarget,
  parseLooseDate,
  planBudget,
  platformForKind,
  relativeHeatLayer,
  safeExternalUrl,
  sortHotspotItems,
  unitPriceForKind,
  type HotspotBudgetPrices,
  type HotspotKind,
  type HotspotSortableItem,
} from '../src/lib/hotspotRadar.ts';
import {
  HOTSPOT_PAGE_SIZE,
  feedItemVisible,
  feedOrFilter,
  hotspotFeedOrder,
  sanitizeHotspotFilters,
  sortByFeedRank,
} from '../src/lib/hotspotFeed.ts';

let passed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    throw error;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_WIRING = process.env.HOTSPOT_SKIP_WIRING === '1';

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

// ============================================================
// 1. 監測目標正規化
// ============================================================
console.log('\n1. 監測目標正規化');

check('@handle → 去掉 @，保留原大小寫', () => {
  assert.equal(normalizeHandle('@BW_Design'), 'BW_Design');
});

check('instagram 個人頁 URL → handle', () => {
  assert.equal(normalizeHandle('https://www.instagram.com/bw.design/?hl=zh-hk'), 'bw.design');
});

check('空值／含空白 → 不合法', () => {
  assert.equal(normalizeHandle('   '), '');
  assert.equal(normalizeHandle('bad handle'), '');
  assert.equal(normalizeHandle(null), '');
});

check('超長 handle（31 字）→ 不合法', () => {
  assert.equal(normalizeHandle('a'.repeat(31)), '');
  assert.equal(normalizeHandle('a'.repeat(30)), 'a'.repeat(30));
});

check('#hashtag → 去掉 #', () => {
  assert.equal(normalizeHashtag('#網頁設計'), '網頁設計');
});

check('hashtag 探索頁 URL → hashtag', () => {
  assert.equal(normalizeHashtag('instagram.com/explore/tags/foodhk/'), 'foodhk');
});

check('hashtag 去掉內部空白；超長／純符號 → 不合法', () => {
  assert.equal(normalizeHashtag('# 網 頁 設 計'), '網頁設計');
  assert.equal(normalizeHashtag('#'), '');
  assert.equal(normalizeHashtag('#a'.repeat(0) + 'x'.repeat(51)), '');
});

check('廣告關鍵字：NFKC＋壓縮空白＋長度 2–80', () => {
  assert.equal(normalizeAdKeyword('  室內   設計  '), '室內 設計');
  assert.equal(normalizeAdKeyword('a'), '');
  assert.equal(normalizeAdKeyword('！？'), '');
  assert.equal(normalizeAdKeyword('x'.repeat(81)), '');
});

check('normalizeTarget：account／hashtag 走 Instagram，廣告走 Facebook', () => {
  assert.equal(platformForKind('account'), 'instagram');
  assert.equal(platformForKind('hashtag'), 'instagram');
  assert.equal(platformForKind('ad_keyword'), 'facebook');
  assert.equal(normalizeTarget('account', '@abc').platform, 'instagram');
  assert.equal(normalizeTarget('ad_keyword', 'abc').platform, 'facebook');
});

check('normalizeTarget：唯一鍵用小寫，顯示保留原樣', () => {
  const target = normalizeTarget('account', '@BW_Design');
  assert.equal(target.valid, true);
  assert.equal(target.value, 'BW_Design');
  assert.equal(target.value_normalized, 'bw_design');
  assert.equal(normalizeTarget('account', '').valid, false);
  assert.equal(normalizeTarget('account', '').reason, 'handle_invalid');
});

// ============================================================
// 2. 中位數、互動與相對熱度
// ============================================================
console.log('\n2. 中位數、互動與相對熱度');

check('computeMedian：空陣列回 0', () => {
  assert.equal(computeMedian([]), 0);
});

check('computeMedian：奇數取中間', () => {
  assert.equal(computeMedian([3, 1, 2]), 2);
});

check('computeMedian：偶數取中間兩數平均', () => {
  assert.equal(computeMedian([1, 2, 3, 4]), 2.5);
});

check('computeMedian：忽略非有限值', () => {
  assert.equal(computeMedian([10, Number.NaN, 5]), 7.5);
});

check('engagementOf：讚＋留言，負數與非數字當 0', () => {
  assert.equal(engagementOf(10, 5), 15);
  assert.equal(engagementOf(-3, 'abc'), 0);
  assert.equal(engagementOf('7', 3), 10);
});

check('computeRelativeHeat：正常回倍數（2 位小數）', () => {
  assert.deepEqual(computeRelativeHeat(1000, 500, 10), { relative_heat: 2, low_sample: false });
  assert.deepEqual(computeRelativeHeat(100, 300, 10), { relative_heat: 0.33, low_sample: false });
});

check('computeRelativeHeat：樣本 <5 → NULL 且 low_sample', () => {
  assert.deepEqual(computeRelativeHeat(1000, 500, HOTSPOT_MEDIAN_MIN_SAMPLE - 1), {
    relative_heat: null,
    low_sample: true,
  });
});

check('computeRelativeHeat：中位數 0 → NULL 但不是 low_sample', () => {
  assert.deepEqual(computeRelativeHeat(100, 0, 10), { relative_heat: null, low_sample: false });
});

check('computeItemComputed：帳號類才算 median 與相對熱度', () => {
  const account = computeItemComputed({ source_kind: 'account', likes: 120, comments: 30 }, 500, 12);
  assert.equal(account.engagement, 150);
  assert.equal(account.account_median_engagement, 500);
  assert.equal(account.relative_heat, 0.3);
  assert.equal(account.sample_size, 12);
  assert.equal(account.low_sample, false);

  const hashtag = computeItemComputed({ source_kind: 'hashtag', likes: 120, comments: 30 }, 500, 12);
  assert.equal(hashtag.account_median_engagement, null);
  assert.equal(hashtag.relative_heat, null);
  assert.equal(hashtag.sample_size, 0);
  assert.equal(hashtag.low_sample, false);
});

check('computeItemComputed：帳號樣本不足 → low_sample', () => {
  const computed = computeItemComputed({ source_kind: 'account', likes: 10, comments: 0 }, 100, 3);
  assert.equal(computed.relative_heat, null);
  assert.equal(computed.low_sample, true);
});

// ============================================================
// 3. 排序（五種，全序）
// ============================================================
console.log('\n3. 排序');

const sortFixtures: HotspotSortableItem[] = [
  { id: 'a', source_kind: 'hashtag', engagement: 100, relative_heat: null, posted_at: '2026-11-01T00:00:00.000Z', ad_active_days: null },
  { id: 'b', source_kind: 'account', engagement: 900, relative_heat: null, posted_at: '2026-11-02T00:00:00.000Z', ad_active_days: null },
  { id: 'c', source_kind: 'account', engagement: 50, relative_heat: 3.2, posted_at: '2026-10-01T00:00:00.000Z', ad_active_days: null },
  { id: 'd', source_kind: 'hashtag', engagement: 80, relative_heat: 2.1, posted_at: '2026-10-05T00:00:00.000Z', ad_active_days: null },
  { id: 'e', source_kind: 'account', engagement: 70, relative_heat: 1.6, posted_at: '2026-10-06T00:00:00.000Z', ad_active_days: null },
  { id: 'f', source_kind: 'ad_keyword', engagement: 0, relative_heat: null, posted_at: '2026-10-07T00:00:00.000Z', ad_active_days: 30 },
  { id: 'g', source_kind: 'ad_keyword', engagement: 0, relative_heat: null, posted_at: '2026-10-08T00:00:00.000Z', ad_active_days: 12 },
];

function idsFor(sort: Parameters<typeof sortHotspotItems>[1]): string {
  return sortHotspotItems(sortFixtures, sort)
    .map((item) => item.id)
    .join(',');
}

check('相對熱度分層邊界：3 / 2 / 1.5 / NULL', () => {
  assert.equal(relativeHeatLayer(3), 0);
  assert.equal(relativeHeatLayer(2.99), 1);
  assert.equal(relativeHeatLayer(2), 1);
  assert.equal(relativeHeatLayer(1.5), 2);
  assert.equal(relativeHeatLayer(1.49), 3);
  assert.equal(relativeHeatLayer(null), 3);
});

check('綜合：先分層，層內自然內容先於廣告', () => {
  assert.equal(idsFor('composite'), 'c,d,e,b,a,f,g');
});

check('絕對互動：互動 desc', () => {
  assert.equal(idsFor('engagement'), 'b,a,d,e,c,g,f');
});

check('相對熱度：NULL 排最後', () => {
  assert.equal(idsFor('relative'), 'c,d,e,a,b,f,g');
});

check('最新：posted_at desc，NULL 最後', () => {
  assert.equal(idsFor('newest'), 'b,a,g,f,e,d,c');
});

check('廣告投放天數：天數 desc，非廣告排最後', () => {
  assert.equal(idsFor('ad_days'), 'f,g,b,a,d,e,c');
});

check('同分時以 id 決勝（全序，不亂跳）', () => {
  const tie: HotspotSortableItem[] = [
    { id: 'z', source_kind: 'hashtag', engagement: 5, relative_heat: null, posted_at: null, ad_active_days: null },
    { id: 'a', source_kind: 'hashtag', engagement: 5, relative_heat: null, posted_at: null, ad_active_days: null },
  ];
  assert.equal(sortHotspotItems(tie, 'engagement').map((item) => item.id).join(','), 'a,z');
  assert.equal(sortHotspotItems(tie, 'newest').map((item) => item.id).join(','), 'a,z');
});

check('compareBySort 直接呼叫與 sortHotspotItems 一致', () => {
  const sorted = sortHotspotItems(sortFixtures, 'composite');
  for (let index = 0; index < sorted.length - 1; index += 1) {
    assert.ok(compareBySort(sorted[index], sorted[index + 1], 'composite') <= 0);
  }
});

check('sortHotspotItems 不改動原陣列', () => {
  const before = sortFixtures.map((item) => item.id).join(',');
  const copy = [...sortFixtures];
  sortHotspotItems(sortFixtures, 'newest');
  assert.equal(sortFixtures.map((item) => item.id).join(','), before);
  assert.notEqual(copy.map((item) => item.id).join(','), 'c,d,e,b,a,f,g');
});

check('HOTSPOT_SORT_KEYS 五種齊全', () => {
  assert.equal(HOTSPOT_SORT_KEYS.length, 5);
  assert.deepEqual([...HOTSPOT_SORT_KEYS], ['composite', 'engagement', 'relative', 'newest', 'ad_days']);
});

check('資料庫排序鍵與 sortHotspotItems 全序一致', () => {
  const extra: HotspotSortableItem[] = [
    ...sortFixtures,
    { id: 'h', source_kind: 'ad_keyword', engagement: 10, relative_heat: 4, posted_at: '2026-09-01T00:00:00.000Z', ad_active_days: null },
    { id: 'i', source_kind: 'account', engagement: 70, relative_heat: 1.6, posted_at: null, ad_active_days: null },
  ];
  for (const sort of HOTSPOT_SORT_KEYS) {
    assert.equal(
      sortByFeedRank(extra, sort).map((item) => item.id).join(','),
      sortHotspotItems(extra, sort).map((item) => item.id).join(','),
      sort,
    );
  }
  const tie: HotspotSortableItem[] = [
    { id: 'z', source_kind: 'hashtag', engagement: 5, relative_heat: null, posted_at: null, ad_active_days: null },
    { id: 'a', source_kind: 'hashtag', engagement: 5, relative_heat: null, posted_at: null, ad_active_days: null },
  ];
  for (const sort of HOTSPOT_SORT_KEYS) {
    assert.equal(
      sortByFeedRank(tie, sort).map((item) => item.id).join(','),
      sortHotspotItems(tie, sort).map((item) => item.id).join(','),
      sort,
    );
  }
});

check('相對熱度的第二鍵在 NULL 時不比互動', () => {
  const relative = hotspotFeedOrder('relative').map((order) => order.column);
  assert.deepEqual(relative, ['relative_heat', 'relative_tie', 'id']);
  const nullable = hotspotFeedOrder('newest').find((order) => order.column === 'posted_at');
  assert.equal(nullable?.nullsFirst, false);
});

check('時間窗保留 posted_at 為空，爆款條件另組 AND', () => {
  const now = Date.parse('2026-11-27T00:00:00.000Z');
  const plain = feedOrFilter({ days: 30, onlyHot: false }, now);
  assert.equal(plain, 'posted_at.is.null,posted_at.gte."2026-10-28T00:00:00.000Z"');
  const hot = feedOrFilter({ days: 7, onlyHot: true }, now);
  assert.ok(hot.startsWith('and(or(posted_at.is.null,posted_at.gte."2026-11-20T00:00:00.000Z"),or('));
  assert.ok(hot.includes('source_kind.eq.ad_keyword,ad_active_days.gte.21'));
  assert.ok(hot.includes('source_kind.neq.ad_keyword,relative_heat.gte.2'));
});

check('列表可見性：NULL 時間留下、過期丟掉、靈感庫忽略未收藏閘門', () => {
  const now = Date.parse('2026-11-27T00:00:00.000Z');
  const filters = sanitizeHotspotFilters({ days: 30, source: 'all' });
  assert.equal(
    feedItemVisible(
      { source_kind: 'account', platform: 'instagram', media_type: 'reel', posted_at: null, favorite: null },
      filters,
      now,
    ),
    true,
  );
  assert.equal(
    feedItemVisible(
      {
        source_kind: 'account',
        platform: 'instagram',
        media_type: 'reel',
        posted_at: '2026-10-27T23:59:59.999Z',
        favorite: null,
      },
      filters,
      now,
    ),
    false,
  );
  assert.equal(
    feedItemVisible(
      {
        source_kind: 'account',
        platform: 'instagram',
        media_type: 'reel',
        posted_at: '2026-10-28T00:00:00.000Z',
        favorite: null,
      },
      filters,
      now,
    ),
    true,
  );
  const library = sanitizeHotspotFilters({ source: 'library', onlyUnfavorited: true });
  assert.equal(
    feedItemVisible(
      { source_kind: 'account', platform: 'instagram', media_type: 'reel', posted_at: null, favorite: { id: 'f' } },
      library,
      now,
    ),
    true,
  );
  assert.equal(
    feedItemVisible(
      { source_kind: 'account', platform: 'instagram', media_type: 'reel', posted_at: null, favorite: null },
      library,
      now,
    ),
    false,
  );
  assert.equal(sanitizeHotspotFilters({ days: 15 as 7, sort: 'nope' as 'newest' }).days, 30);
  assert.equal(sanitizeHotspotFilters({ days: 15 as 7, sort: 'nope' as 'newest' }).sort, 'composite');
  assert.equal(HOTSPOT_PAGE_SIZE, 30);
});

// ============================================================
// 4. 預算、月花費與護門
// ============================================================
console.log('\n4. 預算、月花費與護門');

const PRICES: HotspotBudgetPrices = { standardUsd: 1.75, adsUsd: 0.7 };

function kinds(count: number, kind: HotspotKind): HotspotKind[] {
  return Array.from({ length: count }, () => kind);
}

check('itemsForKind：受類型上限與設定上限共同限制', () => {
  assert.equal(itemsForKind('account', 50), 12);
  assert.equal(itemsForKind('hashtag', 50), 20);
  assert.equal(itemsForKind('ad_keyword', 50), 20);
  assert.equal(itemsForKind('account', 5), 5);
  assert.equal(itemsForKind('account', 0), 12);
  assert.equal(itemsForKind('hashtag', 0), 20);
});

check('單價按類型分開：廣告比 IG 便宜', () => {
  assert.equal(unitPriceForKind('account', PRICES), 1.75);
  assert.equal(unitPriceForKind('hashtag', PRICES), 1.75);
  assert.equal(unitPriceForKind('ad_keyword', PRICES), 0.7);
});

check('estimateCostUsd：每 1,000 筆換算，4 位小數', () => {
  assert.equal(estimateCostUsd(1000, 1.75), 1.75);
  assert.equal(estimateCostUsd(20, 1.75), 0.035);
  assert.equal(estimateCostUsd(0, 1.75), 0);
});

check('planBudget：剩餘預算不足時逐個累加裁剪', () => {
  const plan = planBudget({
    kinds: kinds(40, 'hashtag'),
    itemsPerTarget: 20,
    spentUsd: 0,
    budgetUsd: 1,
    prices: PRICES,
  });
  assert.equal(plan.allowed, 28);
  assert.equal(plan.trimmed, 12);
  assert.equal(plan.blocked, false);
  assert.equal(plan.estimatedUsd, 0.98);
});

check('planBudget：已達上限 → blocked，不允許任何目標', () => {
  const plan = planBudget({
    kinds: kinds(3, 'account'),
    itemsPerTarget: 20,
    spentUsd: 5,
    budgetUsd: 5,
    prices: PRICES,
  });
  assert.equal(plan.allowed, 0);
  assert.equal(plan.blocked, true);
  assert.equal(plan.trimmed, 3);
});

check('planBudget：上限 0 → blocked', () => {
  const plan = planBudget({ kinds: kinds(1, 'account'), itemsPerTarget: 20, spentUsd: 0, budgetUsd: 0, prices: PRICES });
  assert.equal(plan.blocked, true);
});

check('planBudget：沒有候選目標 → 不 blocked', () => {
  const plan = planBudget({ kinds: [], itemsPerTarget: 20, spentUsd: 99, budgetUsd: 1, prices: PRICES });
  assert.equal(plan.allowed, 0);
  assert.equal(plan.blocked, false);
});

check('planBudget：三類混合時按各自單價計算', () => {
  const plan = planBudget({
    kinds: ['account', 'hashtag', 'ad_keyword'],
    itemsPerTarget: 20,
    spentUsd: 0,
    budgetUsd: 1,
    prices: PRICES,
  });
  assert.equal(plan.allowed, 3);
  assert.equal(plan.estimatedUsd, 0.07);
});

check('monthSpend：以香港時區切月（不是 UTC）', () => {
  const runs = [
    { started_at: '2026-10-31T16:30:00.000Z', cost_usd: 2 },
    { started_at: '2026-10-31T15:00:00.000Z', cost_usd: 3 },
    { started_at: '2026-11-15T00:00:00.000Z', cost_usd: 1.5 },
  ];
  assert.equal(monthSpend(runs, new Date('2026-11-20T00:00:00.000Z')), 3.5);
  assert.equal(hongKongMonthKey('2026-10-31T16:30:00.000Z'), '2026-11');
  assert.equal(hongKongMonthKey('2026-10-31T15:00:00.000Z'), '2026-10');
  assert.equal(hongKongMonthKey('not-a-date'), '');
});

check('budgetState / budgetPercent：80% 黃、100% 紅', () => {
  assert.equal(budgetState(0, 40), 'ok');
  assert.equal(budgetState(31.9, 40), 'ok');
  assert.equal(budgetState(32, 40), 'warn');
  assert.equal(budgetState(39.9, 40), 'warn');
  assert.equal(budgetState(40, 40), 'block');
  assert.equal(budgetState(45, 40), 'block');
  assert.equal(budgetPercent(32, 40), 80);
  assert.equal(budgetPercent(0, 40), 0);
});

check('budgetState：上限 0 且已有花費視為超支', () => {
  assert.equal(budgetState(0, 0), 'ok');
  assert.equal(budgetState(0.01, 0), 'block');
});

check('computeTargetsRemaining：指定目標與全站語義不同', () => {
  assert.equal(computeTargetsRemaining({ scope: 'all', totalActive: 30, selected: 10, fetched: 10 }), 20);
  assert.equal(computeTargetsRemaining({ scope: 'selected', totalActive: 30, selected: 10, fetched: 10 }), 0);
  assert.equal(computeTargetsRemaining({ scope: 'selected', totalActive: 30, selected: 10, fetched: 3 }), 7);
  assert.equal(computeTargetsRemaining({ scope: 'all', totalActive: 3, selected: 0, fetched: 5 }), 0);
});

// ============================================================
// 5. Provider payload 映射（容錯）
// ============================================================
console.log('\n5. Provider payload 映射');

check('IG 一列：id / likes / 秒級 timestamp / owner / reel', () => {
  const draft = mapProviderItem(
    { id: 'ABC123', likes: 12, comments: 3, timestamp: 1600000000, ownerUsername: 'brand', mediaType: 'reel' },
    { kind: 'account', now: new Date('2026-11-01T00:00:00.000Z') },
  );
  assert.ok(draft);
  assert.equal(draft.external_id, 'ABC123');
  assert.equal(draft.url, 'https://www.instagram.com/p/ABC123/');
  assert.equal(draft.likes, 12);
  assert.equal(draft.comments, 3);
  assert.equal(draft.plays, null);
  assert.equal(draft.media_type, 'reel');
  assert.equal(draft.author_handle, 'brand');
  assert.equal(draft.posted_at, '2020-09-13T12:26:40.000Z');
  assert.equal(draft.source_kind, 'account');
});

check('IG 媒體類型：官方 /reel/ 優先於影片封面 CDN', () => {
  const reelHtml =
    '<blockquote data-instgrm-permalink="https://www.instagram.com/reel/DgNORD7zXEI/?utm_source=ig_embed&amp;utm_campaign=loading"></blockquote>';
  assert.equal(
    instagramPermalinkFromOEmbedHtml(reelHtml),
    'https://www.instagram.com/reel/DgNORD7zXEI/?utm_source=ig_embed&utm_campaign=loading',
  );
  assert.equal(
    classifyInstagramMediaType({
      permalink: instagramPermalinkFromOEmbedHtml(reelHtml),
      thumbnailUrl: 'https://cdn.example/v/t51.82787-15/cover.jpg',
    }),
    'reel',
  );
  assert.equal(
    classifyInstagramMediaType({
      permalink: 'https://www.instagram.com/tv/ABCDE12345/',
      thumbnailUrl: 'https://cdn.example/v/t39.30808-6/cover.jpg',
    }),
    'video',
  );
});

check('IG 媒體類型：/p/ 加 t51 封面是影片，t39 封面是圖文，沒有訊號也不回 unknown', () => {
  assert.equal(
    classifyInstagramMediaType({
      permalink: 'https://www.instagram.com/p/DgJ1INhkx6j/',
      thumbnailUrl: 'https://cdn.example/v/t51.82787-15/cover.jpg',
    }),
    'video',
  );
  assert.equal(
    classifyInstagramMediaType({
      permalink: 'https://www.instagram.com/p/DgJ1INhkx6j/',
      thumbnailUrl: 'https://cdn.example/v/t51.71878-15/cover.jpg',
    }),
    'video',
  );
  assert.equal(
    classifyInstagramMediaType({
      permalink: 'https://www.instagram.com/p/DgOSfOaEuGk/',
      thumbnailUrl: 'https://cdn.example/v/t39.30808-6/photo.jpg',
    }),
    'image',
  );
  assert.equal(
    classifyInstagramMediaType({
      thumbnailUrl: 'https://cdn.example/v/t51.2885-15/avatar.jpg',
    }),
    'image',
  );
  assert.equal(classifyInstagramMediaType({}), 'image');
  assert.equal(instagramPermalinkFromOEmbedHtml(''), '');
});

check('供應商 productType=feed 不能蓋掉後面的 Image／Video／Sidecar', () => {
  const image = mapProviderItem(
    { id: 'abcde12345', productType: 'feed', type: 'Image' },
    { kind: 'account' },
  );
  const video = mapProviderItem(
    { id: 'abcde12345', productType: 'feed', type: 'Video' },
    { kind: 'account' },
  );
  const reel = mapProviderItem(
    { id: 'abcde12345', productType: 'clips', type: 'Video' },
    { kind: 'account' },
  );
  const carousel = mapProviderItem(
    { id: 'abcde12345', productType: 'carousel_container', type: 'Image' },
    { kind: 'account' },
  );
  const igtv = mapProviderItem({ id: 'abcde12345', productType: 'igtv' }, { kind: 'account' });
  const flagOnly = mapProviderItem({ id: 'abcde12345', is_video: true }, { kind: 'account' });
  assert.equal(image?.media_type, 'image');
  assert.equal(video?.media_type, 'video');
  assert.equal(reel?.media_type, 'reel');
  assert.equal(carousel?.media_type, 'carousel');
  assert.equal(igtv?.media_type, 'video');
  assert.equal(flagOnly?.media_type, 'video');
});

check('容錯別名：shortcode / like_count / comments_count', () => {
  const draft = mapProviderItem(
    { shortcode: 'xyz789', like_count: 5, comments_count: 2, taken_at: '2026-10-01T00:00:00.000Z' },
    { kind: 'hashtag' },
  );
  assert.ok(draft);
  assert.equal(draft.external_id, 'xyz789');
  assert.equal(draft.likes, 5);
  assert.equal(draft.comments, 2);
  assert.ok(draft.url.includes('xyz789'));
});

check('數字字串 likes 可解析；缺 plays 回 null', () => {
  const draft = mapProviderItem({ id: 'abcde12345', likes: '7', comments: '1', videoPlayCount: null }, { kind: 'account' });
  assert.ok(draft);
  assert.equal(draft.likes, 7);
  assert.equal(draft.comments, 1);
  assert.equal(draft.plays, null);
});

check('廣告：沒有讚／留言 → 0；有投放起始日與狀態', () => {
  const draft = mapProviderItem(
    { adArchiveId: '987654321', startDate: '2026-10-01', isActive: true, adText: '秋季優惠' },
    { kind: 'ad_keyword', now: new Date('2026-11-01T00:00:00.000Z') },
  );
  assert.ok(draft);
  assert.equal(draft.platform, 'facebook');
  assert.equal(draft.media_type, 'ad');
  assert.equal(draft.ad_started_at, '2026-10-01');
  assert.equal(draft.ad_active_days, 31);
  assert.equal(draft.ad_status, 'active');
  assert.equal(draft.likes, 0);
  assert.equal(draft.comments, 0);
  assert.ok(draft.url.includes('ads/library'));
  assert.equal(draft.caption, '秋季優惠');
});

check('缺 id → null（不入庫）', () => {
  assert.equal(mapProviderItem({ likes: 1 }, { kind: 'account' }), null);
  assert.equal(mapProviderItem(null, { kind: 'account' }), null);
  assert.equal(mapProviderItem('not-an-object', { kind: 'account' }), null);
});

check('非法日期 → posted_at null，不拋錯', () => {
  const draft = mapProviderItem({ id: 'abcde12345', timestamp: 'not-a-date' }, { kind: 'account' });
  assert.ok(draft);
  assert.equal(draft.posted_at, null);
  assert.equal(parseLooseDate('not-a-date'), null);
});

check('parseLooseDate：毫秒與秒都吃；無時區字串一律當 UTC', () => {
  assert.equal(parseLooseDate(1600000000000), '2020-09-13T12:26:40.000Z');
  assert.equal(parseLooseDate('1600000000'), '2020-09-13T12:26:40.000Z');
  // 無時區 → 當 UTC（不隨執行環境的時區改變）
  assert.equal(parseLooseDate('2026-10-01 08:00:00'), '2026-10-01T08:00:00.000Z');
  assert.equal(parseLooseDate('2026-10-01T08:00:00'), '2026-10-01T08:00:00.000Z');
  // 有時區 → 保留原意
  assert.equal(parseLooseDate('2026-10-01T08:00:00+08:00'), '2026-10-01T00:00:00.000Z');
});

check('classifyProviderStatus：401/403 不可重試、429 可重試', () => {
  assert.equal(classifyProviderStatus(401).code, 'provider_auth_failed');
  assert.equal(classifyProviderStatus(401).retryable, false);
  assert.equal(classifyProviderStatus(403).code, 'provider_auth_failed');
  assert.equal(classifyProviderStatus(429).code, 'provider_rate_limited');
  assert.equal(classifyProviderStatus(429).retryable, true);
  assert.equal(classifyProviderStatus(500).code, 'provider_unavailable');
});

check('URL scheme 白名單：javascript:/data: 丟棄並退回原帖網址', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeExternalUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeExternalUrl('example.com/p/x'), null);
  assert.equal(safeExternalUrl(''), null);

  const draft = mapProviderItem({ id: 'abcde12345', url: 'javascript:alert(1)' }, { kind: 'account' });
  assert.ok(draft);
  assert.equal(draft.url, 'https://www.instagram.com/p/abcde12345/');
});

// ============================================================
// 6. 爆款標記與寫庫 payload 契約（互動門檻已移除）
// ============================================================
console.log('\n6. 爆款標記與 payload 契約');

check('isHotItem：自然內容看相對熱度 ≥2×；廣告看投放 ≥21 天（已無互動門檻）', () => {
  assert.equal(isHotItem({ source_kind: 'account', relative_heat: 2 }), true);
  assert.equal(isHotItem({ source_kind: 'account', relative_heat: 1.99 }), false);
  assert.equal(isHotItem({ source_kind: 'account', relative_heat: null }), false);
  assert.equal(isHotItem({ source_kind: 'ad_keyword', ad_active_days: 21 }), true);
  assert.equal(isHotItem({ source_kind: 'ad_keyword', ad_active_days: 20 }), false);
});

const sampleDraft = mapProviderItem(
  { id: 'abcde12345', likes: 10, comments: 2, timestamp: 1600000000, ownerUsername: 'brand' },
  { kind: 'account' },
);

check('buildItemPayload：欄位齊全且不含資料庫預設時間欄位', () => {
  assert.ok(sampleDraft);
  const computed = computeItemComputed(sampleDraft, 8, 10);
  const payload = buildItemPayload(sampleDraft, computed, 'target-1', new Date('2026-11-01T00:00:00.000Z'));
  const keys = Object.keys(payload).sort();
  assert.deepEqual(keys, [
    'account_median_engagement',
    'ad_active_days',
    'ad_started_at',
    'ad_status',
    'author_followers',
    'author_handle',
    'author_name',
    'caption',
    'comments',
    'engagement',
    'external_id',
    'last_seen_at',
    'likes',
    'low_sample',
    'media_type',
    'platform',
    'plays',
    'posted_at',
    'raw',
    'relative_heat',
    'sample_size',
    'source_kind',
    'target_id',
    'thumbnail_url',
    'url',
  ]);
  assert.equal(payload.first_seen_at, undefined);
  assert.equal(payload.captured_at, undefined);
  assert.equal(payload.status, undefined);
  assert.equal(payload.favorite, undefined);
  assert.equal(payload.last_seen_at, '2026-11-01T00:00:00.000Z');
});

check('buildItemPayload：同一則內容 upsert 不會帶入收藏欄位', () => {
  assert.ok(sampleDraft);
  const payload = buildItemPayload(sampleDraft, computeItemComputed(sampleDraft, 8, 10), null);
  for (const forbidden of ['status', 'note', 'favorite', 'favorited', 'first_seen_at', 'captured_at']) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, forbidden), false, forbidden);
  }
});

// ============================================================
// 7. 接線斷言（讀檔；檔案齊全後才會跑）
// ============================================================
if (!SKIP_WIRING) {
  console.log('\n7. 接線斷言');

  const appContext = read('src/context/AppContext.tsx');
  const seoRadarIndex = appContext.indexOf("id: 'seo-radar'");
  const hotspotIndex = appContext.indexOf("id: 'hotspot-radar'");
  const crosspostIndex = appContext.indexOf("id: 'crosspost'");

  check('菜單順序：seo-radar → hotspot-radar → crosspost', () => {
    assert.ok(seoRadarIndex > 0, '找不到 seo-radar');
    assert.ok(hotspotIndex > seoRadarIndex, 'hotspot-radar 必須在 seo-radar 之後');
    assert.ok(crosspostIndex > hotspotIndex, 'hotspot-radar 必須在 crosspost 之前');
    assert.ok(appContext.includes("label: '熱點雷達'"));
  });

  check('ToolsCenterModule：import＋早退＋getTitle case', () => {
    const router = read('src/components/tools-center/ToolsCenterModule.tsx');
    assert.ok(router.includes("from './hotspot-radar/HotspotRadarTool'"));
    assert.ok(router.includes("subModule === 'hotspot-radar'"));
    assert.ok(router.includes('<HotspotRadarTool'));
    assert.ok(router.includes("case 'hotspot-radar'"));
  });

  check('舊社媒分頁已改名「內容熱點」，且路由 key 未動', () => {
    const nav = read('src/lib/contentNavigation.ts');
    const subNav = read('src/components/tools-center/content/social/SocialSubNav.tsx');
    assert.equal(nav.includes("label: '熱點雷達'"), false);
    assert.equal(subNav.includes("label: '熱點雷達'"), false);
    assert.ok(nav.includes("label: '內容熱點'"));
    assert.ok(nav.includes("page: 'radar'"));
  });

  check('config.toml 有 hotspot-radar 區塊且 verify_jwt = false', () => {
    const config = read('supabase/config.toml');
    const sectionIndex = config.indexOf('[functions.hotspot-radar]');
    assert.ok(sectionIndex > 0, '缺少 [functions.hotspot-radar]');
    const section = config.slice(sectionIndex, config.indexOf('[functions.', sectionIndex + 1) > 0 ? config.indexOf('[functions.', sectionIndex + 1) : undefined);
    assert.ok(section.includes('verify_jwt = false'));
  });

  check('IG RSS 寫入前會分類，不再把媒體類型寫死 unknown', () => {
    const source = read('supabase/functions/hotspot-radar/providers/ig-rss.ts');
    assert.ok(source.includes('classifyInstagramMediaType'));
    assert.ok(source.includes('instagramPermalinkFromOEmbedHtml'));
    assert.ok(source.includes('lookupIgMedia'));
    assert.equal(source.includes('media_type: "unknown"'), false);
    assert.equal(source.includes("media_type: 'unknown'"), false);
  });

  check('package.json 有 hotspot:test script', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    assert.equal(pkg.scripts?.['hotspot:test'], 'node scripts/run-hotspot-radar-test.ts');
  });

  check('新檔案齊全', () => {
    const files = [
      'src/types/hotspotRadar.ts',
      'src/lib/hotspotRadar.ts',
      'src/hooks/useHotspotRadar.ts',
      'src/components/tools-center/hotspot-radar/HotspotRadarTool.tsx',
      'src/components/tools-center/hotspot-radar/HotspotCard.tsx',
      'src/components/tools-center/hotspot-radar/HotspotFilterBar.tsx',
      'src/components/tools-center/hotspot-radar/HotspotTargetsPanel.tsx',
              'src/components/tools-center/hotspot-radar/HotspotEmptyState.tsx',
      'supabase/functions/hotspot-radar/index.ts',
      'supabase/functions/hotspot-radar/targets.ts',
      'supabase/functions/hotspot-radar/persist.ts',
      'supabase/functions/hotspot-radar/providers/types.ts',
      'supabase/functions/hotspot-radar/providers/apify.ts',
      'supabase/functions/hotspot-radar/providers/ig-rss.ts',
      'supabase/functions/hotspot-radar/providers/mock.ts',
      'supabase/functions/hotspot-radar/providers/index.ts',
      'supabase/migrations/20261126150000_hotspot_radar.sql',
      'supabase/migrations/20261126151000_hotspot_radar_daily_cron.sql',
      'supabase/migrations/20261126152000_hotspot_radar_controls.sql',
      'supabase/migrations/20261127183000_hotspot_radar_cron_cadence.sql',
      'supabase/migrations/20261127200000_hotspot_feed.sql',
      'src/lib/hotspotFeed.ts',
      'scripts/rollback-hotspot-radar.sql',
    ];
    for (const file of files) {
      assert.ok(existsSync(join(root, file)), `缺少 ${file}`);
    }
  });

  check('純函式層不得 import React／supabase／瀏覽器 API／@ alias', () => {
    const lib = read('src/lib/hotspotRadar.ts');
    // 只檢查真正的 import／全域用法；註解提到這些字不算違規
    for (const forbidden of [
      "from 'react'",
      'from "react"',
      "from '@/",
      '@supabase',
      'window.',
      'document.',
      'localStorage',
    ]) {
      assert.equal(lib.includes(forbidden), false, `src/lib/hotspotRadar.ts 不應包含 ${forbidden}`);
    }
  });

  check('前端不得直接 fetch／使用 service role', () => {
    const hook = read('src/hooks/useHotspotRadar.ts');
    assert.equal(hook.includes('fetch('), false);
    assert.equal(hook.includes('SERVICE_ROLE'), false);
    assert.ok(hook.includes('invokeContentFunction'));
  });

  check('列表第一頁走 hotspot_feed，不等設定接口', () => {
    const hook = read('src/hooks/useHotspotRadar.ts');
    const feed = read('supabase/migrations/20261127200000_hotspot_feed.sql');
    assert.ok(hook.includes("from('hotspot_feed')"));
    assert.ok(hook.includes('loadChrome'));
    assert.equal(hook.includes('ITEM_LIMIT'), false);
    assert.equal(hook.includes('.limit(500)'), false);
    assert.equal(HOTSPOT_PAGE_SIZE, 30);
    assert.ok(feed.includes('security_invoker = true'));
    assert.ok(feed.includes('WHEN i.relative_heat >= 3 THEN 0'));
    assert.ok(feed.includes('WHEN i.relative_heat >= 2 THEN 1'));
    assert.ok(feed.includes('WHEN i.relative_heat >= 1.5 THEN 2'));
    assert.ok(feed.includes("WHEN i.source_kind = 'ad_keyword' THEN COALESCE(i.ad_active_days, 0)"));
    assert.ok(feed.includes('WHEN i.relative_heat IS NULL THEN 0'));
    assert.ok(feed.includes('GRANT SELECT ON public.hotspot_feed TO authenticated, service_role'));
  });

  check('Edge Function 自行驗 JWT，不信任前端權限', () => {
    const entry = read('supabase/functions/hotspot-radar/index.ts');
    assert.ok(entry.includes('requireActor'));
    assert.ok(entry.includes('requireAction'));
    assert.ok(entry.includes('requireServiceRole'));
    assert.ok(entry.includes('resolveProvider'));
  });

  check('付款類外部呼叫只在 provider 層（entry 不得直接 fetch 供應商）', () => {
    const entry = read('supabase/functions/hotspot-radar/index.ts');
    assert.equal(entry.includes('api.apify.com'), false);
    const apify = read('supabase/functions/hotspot-radar/providers/apify.ts');
    assert.ok(apify.includes('api.apify.com'));
  });

  // ==========================================================
  // 8. DB 契約（migration ↔ 前端欄位清單 ↔ 寫庫 payload）
  // ==========================================================
  console.log('\n8. DB 契約');

  const migration = read('supabase/migrations/20261126150000_hotspot_radar.sql');

  function tableColumns(sql: string, table: string): string[] {
    const match = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'));
    assert.ok(match, `migration 找不到 ${table}`);
    const columns: string[] = [];
    for (const line of match[1].split('\n')) {
      const column = line.match(/^  ([a-z][a-z0-9_]*) /);
      if (column) columns.push(column[1]);
    }
    return columns;
  }

  check('migration 五張表齊全且欄位數正確', () => {
    assert.equal(tableColumns(migration, 'hotspot_targets').length, 14);
    assert.equal(tableColumns(migration, 'hotspot_items').length, 28);
    assert.equal(tableColumns(migration, 'hotspot_favorites').length, 7);
    assert.equal(tableColumns(migration, 'hotspot_runs').length, 12);
    assert.equal(tableColumns(migration, 'hotspot_settings').length, 7);
  });

  check('寫庫 payload 的每個欄位都存在於 migration', () => {
    assert.ok(sampleDraft);
    const payload = buildItemPayload(sampleDraft, computeItemComputed(sampleDraft, 8, 10), null);
    const columns = tableColumns(migration, 'hotspot_items');
    for (const key of Object.keys(payload)) {
      assert.ok(columns.includes(key), `payload 欄位 ${key} 不在 hotspot_items`);
    }
  });

  check('前端 ITEM_COLUMNS 與 migration 一一對應', () => {
    const hook = read('src/hooks/useHotspotRadar.ts');
    const match = hook.match(/const ITEM_COLUMNS =\s*'([^']+)'/);
    assert.ok(match, '找不到 ITEM_COLUMNS');
    const columns = tableColumns(migration, 'hotspot_items');
    for (const column of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
      assert.ok(columns.includes(column), `ITEM_COLUMNS 的 ${column} 不在 hotspot_items`);
    }
  });

  check('migration 沒有破壞性語句', () => {
    for (const sql of [
      migration,
      read('supabase/migrations/20261126151000_hotspot_radar_daily_cron.sql'),
      read('supabase/migrations/20261126152000_hotspot_radar_controls.sql'),
      read('supabase/migrations/20261127183000_hotspot_radar_cron_cadence.sql'),
      read('supabase/migrations/20261127200000_hotspot_feed.sql'),
    ]) {
      assert.equal(/\bdrop\s+(table|index|function|policy|column)\b/i.test(sql), false);
      assert.equal(/\btruncate\b/i.test(sql), false);
      assert.equal(/\bdelete\s+from\b/i.test(sql), false);
      assert.equal(/\balter\s+type\b/i.test(sql), false);
    }
  });

  check('cron：jobname／排程／URL 替換目標正確', () => {
    const cron = read('supabase/migrations/20261126151000_hotspot_radar_daily_cron.sql');
    assert.ok(cron.includes("'hotspot-radar-daily'"));
    assert.ok(cron.includes("'45 23 * * *'"));
    assert.ok(cron.includes('functions/v1/hotspot-radar'));
    assert.ok(cron.includes('RAISE NOTICE'));
  });

  check('排程：週一至六香港時間加密、週日每 6 小時，開關同時切兩條 job', () => {
    const cadence = read('supabase/migrations/20261127183000_hotspot_radar_cron_cadence.sql');
    assert.ok(cadence.includes("'0 4,10,16,22 * * *'"));
    assert.ok(cadence.includes("'0 1,3,5,7,9 * * 1-6'"));
    assert.ok(cadence.includes("'hotspot-radar-daily'"));
    assert.ok(cadence.includes("'hotspot-radar-daytime'"));
    assert.equal(/cron\.unschedule/i.test(cadence), false);
    assert.ok(cadence.includes("j.jobname IN ('hotspot-radar-daily', 'hotspot-radar-daytime')"));
    const tool = read('src/components/tools-center/hotspot-radar/HotspotRadarTool.tsx');
    assert.equal(tool.includes('每日深夜'), false);
    assert.ok(tool.includes('09:00、11:00、12:00、13:00、15:00、17:00、18:00'));
    assert.ok(tool.includes('週日：00:00、06:00、12:00、18:00'));
    assert.ok(tool.includes('上次抓取'));
    assert.ok(tool.includes('從未抓取'));
  });

  check('開關 RPC：SECURITY DEFINER 且只授 service_role', () => {
    const controls = read('supabase/migrations/20261126152000_hotspot_radar_controls.sql');
    assert.ok(controls.includes('SECURITY DEFINER'));
    assert.ok(controls.includes('hotspot_radar_set_daily'));
    assert.ok(controls.includes('hotspot_radar_daily_status'));
    assert.ok(controls.includes('GRANT EXECUTE') && controls.includes('TO service_role'));
    assert.ok(controls.includes('REVOKE ALL'));
  });

  check('RLS：五張表開啟、恰五條 policy 且都是 SELECT', () => {
    const tables = ['hotspot_targets', 'hotspot_items', 'hotspot_favorites', 'hotspot_runs', 'hotspot_settings'];
    for (const table of tables) {
      assert.ok(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i').test(migration),
        `${table} 未開啟 RLS`,
      );
    }
    assert.equal((migration.match(/create policy/gi) ?? []).length, 5);
    assert.equal((migration.match(/for select to authenticated/gi) ?? []).length, 5);
    assert.equal(/for (insert|update|delete)/i.test(migration), false);
  });
}

console.log(`\n全部通過：${passed} 項`);
