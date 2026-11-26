#!/usr/bin/env node
/**
 * 社媒自動化營運 · 純函式自測（PRD §13 純函式自測列）
 *
 * 直接以 Node 的 type stripping 載入 src/lib/*.ts，
 * 覆蓋：時區、cadence→slots、狀態機、SEO 閘門、日報統計、關鍵字挑選、
 *        Markdown 渲染、圖卡、內容包、權限、路由。
 *
 * 用法：node scripts/content-selftest.mjs
 */

import assert from 'node:assert/strict';
import { test, report } from './_selftest-harness.mjs';

const format = await import('../src/lib/contentFormat.ts');
const planner = await import('../src/lib/contentPlanner.ts');
const state = await import('../src/lib/contentState.ts');
const seoQa = await import('../src/lib/contentSeoQa.ts');
const digest = await import('../src/lib/contentDigest.ts');
const generate = await import('../src/lib/contentGenerate.ts');
const media = await import('../src/lib/contentMedia.ts');
const pkg = await import('../src/lib/contentPackage.ts');
const permissions = await import('../src/lib/contentPermissions.ts');
const navigation = await import('../src/lib/contentNavigation.ts');
const socialGroups = await import('../src/lib/contentSocialGroups.ts');
const socialOAuth = await import('../src/lib/contentSocialOAuth.ts');
const socialDelivery = await import('../src/lib/contentSocialDelivery.ts');
const adapters = await import('../supabase/functions/_shared/contentAdapters/index.ts');
const contentState = await import('../src/lib/contentState.ts');
const socialGenerate = await import('../src/lib/contentSocialGenerate.ts');
const socialDedupe = await import('../src/lib/contentSocialDedupe.ts');
const socialCluster = await import('../src/lib/contentSocialCluster.ts');
const beauty100 = await import('../src/lib/contentBeauty100.ts');

// ============================================================
// 時區與格式化
// ============================================================

test('時區：香港牆上時間 → UTC ISO', () => {
  const iso = format.zonedWallTimeToUtc('2026-11-25', '10:00', 'Asia/Hong_Kong').toISOString();
  assert.equal(iso, '2026-11-25T02:00:00.000Z');
});

test('時區：東京牆上時間 → UTC ISO', () => {
  const iso = format.zonedWallTimeToUtc('2026-11-25', '09:30', 'Asia/Tokyo').toISOString();
  assert.equal(iso, '2026-11-25T00:30:00.000Z');
});

test('時區：紐約夏令／冬令時間都能收斂（DST）', () => {
  const summer = format.zonedWallTimeToUtc('2026-07-15', '10:00', 'America/New_York').toISOString();
  const winter = format.zonedWallTimeToUtc('2026-01-15', '10:00', 'America/New_York').toISOString();
  assert.equal(summer, '2026-07-15T14:00:00.000Z'); // EDT -4
  assert.equal(winter, '2026-01-15T15:00:00.000Z'); // EST -5
});

test('時區：非法時區安全回落香港', () => {
  const iso = format.zonedWallTimeToUtc('2026-11-25', '10:00', 'Mars/Olympus').toISOString();
  assert.equal(iso, '2026-11-25T02:00:00.000Z');
});

test('時區：zoneDateString / todayInZone', () => {
  const instant = new Date('2026-11-25T17:30:00.000Z'); // HKT 11-26 01:30
  assert.equal(format.zoneDateString(instant, 'Asia/Hong_Kong'), '2026-11-26');
  assert.equal(format.zoneDateString(instant, 'UTC'), '2026-11-25');
});

test('格式化：applyTemplate 與 canonicalUrl', () => {
  assert.equal(
    format.applyTemplate('{title}｜{brand}', { title: '標題', brand: 'BWA' }),
    '標題｜BWA',
  );
  assert.equal(
    format.canonicalUrl('https://www.example.com/', 'hello-world'),
    'https://example.com/hello-world',
  );
});

test('格式化：字數（CJK 逐字 + 拉丁逐詞）', () => {
  assert.equal(format.countWords('香港 室內設計 interior design'), 8);
  assert.equal(format.countWords('## 標題\n\n**粗體**與 `code`'), 5);
  assert.equal(format.countWords(''), 0);
});

test('格式化：slug 正規化、中文 fallback、唯一化', () => {
  assert.equal(format.slugifyTitle('Hello World, SEO!'), 'hello-world-seo');
  assert.match(format.slugifyTitle('室內設計案例'), /^post-[a-z0-9]+$/);
  assert.equal(format.ensureUniqueSlug('hello-world', ['hello-world']), 'hello-world-2');
  assert.equal(format.ensureUniqueSlug('hello-world', ['hello-world', 'hello-world-2']), 'hello-world-3');
});

test('格式化：欄目網址代稱自動建議（英文轉 kebab、中文給 category-N、撞名加序號）', () => {
  assert.equal(format.suggestSectionSlug('Renovation Ideas'), 'renovation-ideas');
  assert.equal(format.suggestSectionSlug('裝修知識', 0), 'category-1');
  assert.equal(format.suggestSectionSlug('裝修知識', 1, ['category-9']), 'category-2');
  assert.equal(format.suggestSectionSlug('裝修知識', 0, ['category-1']), 'category-1-2');
  assert.equal(format.suggestSectionSlug('', 2), 'category-3');
});

test('格式化：內部連結抽取（只算同站、不含圖片）', () => {
  const body =
    '[a](https://example.com/a) [b](https://other.com/b) [c](/relative) ![img](https://example.com/x.png)';
  const links = format.extractInternalLinks(body, 'https://www.example.com');
  assert.deepEqual(links.sort(), ['/relative', 'https://example.com/a']);
});

test('格式化：冪等鍵與成本估算', () => {
  assert.equal(format.contentIdempotencyKey('publish', 'abc', 3), 'content:publish:abc:v3');
  assert.equal(format.digestIdempotencyKey('2026-11-25'), 'digest:2026-11-25');
  assert.equal(format.estimateLlmCostUsd('gemini-2.5-flash', 1_000_000, 0), 0.3);
});

// ============================================================
// cadence → slots
// ============================================================

const baseCadence = {
  frequency: 'weekly',
  weekdays: [1],
  publish_time: '10:00',
  lead_time_hours: 48,
  review_cutoff_hours: 4,
  max_articles_per_day: 1,
  blackout_dates: [],
};

test('planner：每週一 10:00 HKT，30 天產生 4 個 slot', () => {
  const result = planner.planSlots({
    siteId: 's1',
    cadence: baseCadence,
    timezone: 'Asia/Hong_Kong',
    now: new Date('2026-11-25T00:00:00Z'),
    horizonDays: 30,
  });
  assert.equal(result.slots.length, 4);
  assert.equal(result.slots[0].publish_at, '2026-11-30T02:00:00.000Z');
  assert.equal(result.slots[0].generate_at, '2026-11-28T02:00:00.000Z');
  assert.equal(result.slots[0].weekday, 1);
});

test('planner：每日 30 天 = 30 個 slot，且都通過冪等鍵', () => {
  const result = planner.planSlots({
    siteId: 's2',
    cadence: { ...baseCadence, frequency: 'daily' },
    timezone: 'Asia/Hong_Kong',
    now: new Date('2026-11-25T00:00:00Z'),
    horizonDays: 30,
  });
  assert.equal(result.slots.length, 30);
  assert.equal(new Set(result.slots.map((slot) => slot.dedupe_key)).size, 30);
});

test('planner：隔日 + 黑名單日期', () => {
  const result = planner.planSlots({
    siteId: 's3',
    cadence: {
      ...baseCadence,
      frequency: 'every_2_days',
      blackout_dates: ['2026-11-27', '2026-12-01'],
    },
    timezone: 'Asia/Hong_Kong',
    now: new Date('2026-11-25T00:00:00Z'),
    horizonDays: 10,
  });
  const dates = result.slots.map((slot) =>
    format.zoneDateString(new Date(slot.publish_at), 'Asia/Hong_Kong'),
  );
  assert.ok(!dates.includes('2026-11-27'));
  assert.ok(!dates.includes('2026-12-01'));
  assert.equal(result.skippedBlackout.length, 2);
});

test('planner：每週兩次預設週一、週四', () => {
  const weekdays = planner.cadenceWeekdays({
    ...baseCadence,
    frequency: 'twice_weekly',
    weekdays: [],
  });
  assert.deepEqual(weekdays, [1, 4]);
});

test('planner：normalizeCadence 修掉非法值', () => {
  const normalized = planner.normalizeCadence({
    frequency: 'weekly',
    publish_time: '25:99',
    lead_time_hours: -3,
    max_articles_per_day: 99,
    weekdays: [0, 9, 3],
  });
  assert.equal(normalized.publish_time, '10:00');
  assert.equal(normalized.lead_time_hours, 0);
  assert.equal(normalized.max_articles_per_day, 5);
  assert.deepEqual(normalized.weekdays, [3]);
});

test('planner：validateCadence 擋下 cutoff >= lead time', () => {
  const errors = planner.validateCadence({
    ...baseCadence,
    lead_time_hours: 4,
    review_cutoff_hours: 8,
  });
  assert.ok(errors.length > 0);
});

test('planner：審核逾期判斷', () => {
  const publishAt = '2026-11-25T02:00:00.000Z';
  assert.equal(planner.isReviewOverdue(publishAt, 4, false, new Date('2026-11-24T21:00:00Z')), false);
  assert.equal(planner.isReviewOverdue(publishAt, 4, false, new Date('2026-11-25T00:00:00Z')), true);
  assert.equal(planner.isReviewOverdue(publishAt, 4, true, new Date('2026-11-25T00:00:00Z')), false);
});

test('planner：findNextPublishAt 跳過已被佔用時段', () => {
  const next = planner.findNextPublishAt(
    { ...baseCadence, frequency: 'daily' },
    'Asia/Hong_Kong',
    new Date('2026-11-25T05:00:00Z'),
    ['2026-11-26T02:00:00.000Z'],
    5,
  );
  assert.equal(next, '2026-11-27T02:00:00.000Z');
});

test('planner：datetime-local 與站點時區互轉', () => {
  const local = planner.toZoneInputValue('2026-11-25T02:00:00.000Z', 'Asia/Hong_Kong');
  assert.equal(local, '2026-11-25T10:00');
  assert.equal(
    planner.fromZoneInputValue('2026-11-25T10:00', 'Asia/Hong_Kong'),
    '2026-11-25T02:00:00.000Z',
  );
});

test('planner：shouldPreserveSlot 不覆蓋已有文章的排程', () => {
  assert.equal(planner.shouldPreserveSlot({ status: 'in_review', article_id: null }), true);
  assert.equal(planner.shouldPreserveSlot({ status: 'planned', article_id: 'a1' }), true);
  assert.equal(planner.shouldPreserveSlot({ status: 'planned', article_id: null }), false);
});

// ============================================================
// 狀態機
// ============================================================

test('狀態機：文章合法／非法轉換', () => {
  assert.equal(state.canTransition('article', 'draft', 'pending_review'), true);
  assert.equal(state.canTransition('article', 'pending_review', 'approved'), true);
  assert.equal(state.canTransition('article', 'approved', 'scheduled'), true);
  assert.equal(state.canTransition('article', 'held', 'published'), false);
  assert.equal(state.canTransition('article', 'draft', 'published'), false);
  assert.equal(state.canTransition('article', 'manual_done', 'published'), false);
  assert.throws(
    () => state.assertTransition('article', 'draft', 'published'),
    state.ContentTransitionError,
  );
});

test('狀態機：slot / keyword / job', () => {
  assert.equal(state.canTransition('slot', 'planned', 'generating'), true);
  assert.equal(state.canTransition('slot', 'generating', 'draft_ready'), true);
  assert.equal(state.canTransition('keyword', 'backlog', 'generating'), true);
  assert.equal(state.canTransition('keyword', 'published', 'backlog'), false);
  assert.equal(state.canTransition('job', 'running', 'done'), true);
  assert.equal(state.canTransition('job', 'done', 'queued'), false);
});

test('狀態機：held 永不得自動發布、manual_done 不計漏斗', () => {
  assert.equal(state.isArticleAutoPublishBlocked('held'), true);
  assert.equal(state.canAutoPublish('held'), false);
  assert.equal(state.canAutoPublish('scheduled'), true);
  assert.equal(state.isArticlePubliclyPublished('manual_done'), false);
  assert.equal(state.isArticlePubliclyPublished('published'), true);
});

test('狀態機：標籤與色票', () => {
  assert.equal(state.statusLabel('article', 'pending_review'), '待審');
  assert.equal(state.statusLabel('slot', 'held'), '保留');
  assert.equal(state.statusTone('article', 'publish_failed'), 'rose');
  assert.equal(state.statusTone('health', 'ok'), 'green');
});

// ============================================================
// SEO 閘門
// ============================================================

const seoDefaults = format.DEFAULT_SEO_DEFAULTS;
const brandVoice = format.DEFAULT_BRAND_VOICE;

function goodArticle(overrides = {}) {
  return {
    title: '香港辦公室裝修完整指南：從預算到驗收',
    slug: 'hong-kong-office-renovation-guide',
    excerpt:
      '從預算、工期到驗收，整理香港辦公室裝修最常遇到的問題與實務做法，協助企業在有限時間內完成空間升級。',
    body_md: [
      '## 為什麼要先談預算',
      '辦公室裝修的預算通常由設計、工程、傢俬與機電四部分組成。先抓出總額區間，後面的設計選擇才有邊界。',
      '',
      '## 工期怎麼安排',
      '一般 2000 呎以下的辦公室，設計到完工約需 8 至 12 週。若涉及消防申報，請預留額外 3 至 4 週。',
      '',
      '- 設計與報價：2–3 週',
      '- 施工與監工：6–8 週',
      '- 驗收與交付：1 週',
      '',
      '## 驗收要看什麼',
      '驗收時請逐項核對機電點位、天花平整度、櫃體收口與消防設備。',
      '',
      '[裝修案例](/portfolio) 與 [服務流程](/process) 可以看到更多實例。',
      '這次的分享希望讓你在第一次辦公室裝修時少走彎路，預算與工期都能在掌握之中。'.repeat(24),
    ].join('\n'),
    meta_title: '香港辦公室裝修指南：預算、工期與驗收重點',
    meta_description:
      '整理香港辦公室裝修的預算結構、工期安排與驗收清單，協助企業在有限時間內完成空間升級，避免常見的追加與延誤。',
    canonical: 'https://example.com/hong-kong-office-renovation-guide',
    keyword: '香港辦公室裝修',
    ...overrides,
  };
}

test('QA：完整文章通過全部硬檢查', () => {
  const report = seoQa.evaluateSeoQa({
    article: goodArticle(),
    seoDefaults,
    brandVoice,
    existingSlugs: [],
  });
  const failed = report.hard.filter((item) => !item.passed);
  assert.deepEqual(failed.map((item) => item.id), []);
  assert.equal(report.hardPassed, true);
  assert.ok(report.wordCount >= seoDefaults.wordCountMin);
  assert.ok(report.softScore > 0);
});

test('QA：slug 重複阻擋 Confirm', () => {
  const report = seoQa.evaluateSeoQa({
    article: goodArticle(),
    seoDefaults,
    brandVoice,
    existingSlugs: ['hong-kong-office-renovation-guide'],
  });
  assert.equal(report.hardPassed, false);
  assert.ok(seoQa.blockingReasons(report).some((reason) => reason.includes('Slug')));
  assert.equal(seoQa.canConfirm(report), false);
});

test('QA：禁用詞與 meta 過短被擋', () => {
  const report = seoQa.evaluateSeoQa({
    article: goodArticle({ title: '保證最平的香港辦公室裝修', meta_description: '太短' }),
    seoDefaults: { ...seoDefaults, bannedWords: ['保證', '最平'] },
    brandVoice,
  });
  assert.equal(report.hardPassed, false);
  assert.equal(report.hard.find((item) => item.id === 'banned_words')?.passed, false);
  assert.equal(report.hard.find((item) => item.id === 'meta_length')?.passed, false);
});

// ============================================================
// 關鍵字挑選
// ============================================================

function keyword(overrides = {}) {
  return {
    id: Math.random().toString(36),
    website_profile_id: 's1',
    keyword: '室內設計',
    normalized_keyword: '室內設計',
    level: 'level_3',
    search_volume: null,
    current_ranking: null,
    target_ranking: null,
    target_page: null,
    difficulty_score: null,
    status: 'monitoring',
    ai_generated: false,
    source: 'manual',
    gsc_site_url: null,
    last_gsc_sync_at: null,
    intent: null,
    priority: null,
    cluster: null,
    pipeline_status: 'backlog',
    last_used_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

test('關鍵字：NULL pipeline_status 一律不可用', () => {
  assert.equal(generate.selectKeywordCandidate([keyword({ pipeline_status: null })]), null);
});

test('關鍵字：人工 pin（priority 1000）優先於 GSC', () => {
  const pinned = keyword({ id: 'pinned', priority: 1000, keyword: '人工 pin 詞' });
  const gsc = keyword({ id: 'gsc', source: 'gsc', priority: null, keyword: 'GSC 詞' });
  assert.equal(generate.selectKeywordCandidate([gsc, pinned])?.keyword.id, 'pinned');
});

test('關鍵字：有 priority 的詞排在 NULL 之前（nulls last）', () => {
  const withPriority = keyword({ id: 'with', priority: 10 });
  const nullPriority = keyword({ id: 'null', priority: null, source: 'gsc' });
  assert.equal(generate.selectKeywordCandidate([nullPriority, withPriority])?.keyword.id, 'with');
});

test('關鍵字：同 cluster 14 天冷卻', () => {
  const recent = keyword({ id: 'recent', cluster: '餐飲空間' });
  const other = keyword({ id: 'other', cluster: '辦公室' });
  const picked = generate.selectKeywordCandidate([recent, other], {
    recentByCluster: { 餐飲空間: '2026-11-20T00:00:00.000Z' },
    now: new Date('2026-11-25T00:00:00.000Z'),
  });
  assert.equal(picked?.keyword.id, 'other');
});

test('關鍵字：GSC 機會詞判定', () => {
  assert.equal(
    generate.isGscOpportunity({ impressions: 500, clicks: 2, position: 30 }).reason,
    '高曝光低點擊',
  );
  assert.equal(
    generate.isGscOpportunity({ impressions: 50, clicks: 5, position: 8 }).reason,
    '排名 5–20，可推上首頁',
  );
  assert.equal(generate.isGscOpportunity({ impressions: 10, clicks: 5, position: 2 }).opportunity, false);
});

// ============================================================
// 生成與 Markdown
// ============================================================

test('生成：解析純 JSON 與 ```json 圍欄', () => {
  const brief = generate.buildBrief({
    site: {
      id: 's1',
      website_name: 'BWA',
      domain_url: 'https://example.com',
      platform: 'framer',
      brand: 'BW',
      status: 'live',
      level: 1,
    },
    keyword: '室內設計',
    brandVoice,
    seoDefaults,
  });
  const raw = JSON.stringify({
    title: '標題',
    slug: 'slug',
    excerpt: '摘要',
    body_md: '## 小節\n正文內容',
    meta_title: 'meta',
    meta_description: 'desc',
    keywords: ['a', 'b'],
  });
  const fromJson = generate.parseGeneratedArticle(raw, { brief });
  const fromFence = generate.parseGeneratedArticle(`\`\`\`json\n${raw}\n\`\`\``, { brief });
  assert.equal(fromJson.title, '標題');
  assert.deepEqual(fromJson.keywords, ['a', 'b']);
  assert.equal(fromFence.slug, 'slug');
  assert.equal(generate.isValidGeneratedArticle(fromJson), false); // 字數不足
});

test('生成：Markdown → HTML 主要結構', () => {
  const html = generate.renderMarkdownToHtml(
    [
      '# H1',
      '',
      '段落 **粗體** [連結](https://example.com)',
      '',
      '- 一',
      '- 二',
      '',
      '> 引用',
      '',
      '```js',
      'code()',
      '```',
    ].join('\n'),
  );
  assert.match(html, /<h1>H1<\/h1>/);
  assert.match(html, /<strong>粗體<\/strong>/);
  assert.match(html, /<a href="https:\/\/example.com">連結<\/a>/);
  assert.match(html, /<ul>\s*<li>一<\/li>/);
  assert.match(html, /<blockquote>引用<\/blockquote>/);
  assert.match(html, /<pre><code>code\(\)<\/code><\/pre>/);
});

test('生成：buildBrief 帶入站點語氣與限制', () => {
  const brief = generate.buildBrief({
    site: {
      id: 's1',
      website_name: 'BWA',
      domain_url: 'https://www.example.com',
      platform: 'framer',
      brand: 'BW',
      status: 'live',
      level: 1,
      timezone: 'Asia/Hong_Kong',
      locale: 'zh-HK',
    },
    keyword: '辦公室設計',
    brandVoice: { ...brandVoice, tone: '務實', cta: '預約諮詢' },
    seoDefaults: { ...seoDefaults, bannedWords: ['最'] },
    sitePages: [{ url: 'https://example.com/a', title: 'A 頁' }],
  });
  assert.equal(brief.domain, 'example.com');
  assert.equal(brief.tone, '務實');
  assert.deepEqual(brief.bannedWords, ['最']);
  assert.equal(brief.internalLinkCandidates.length, 1);
  assert.match(generate.buildGenerationPrompt(brief), /目標關鍵字：辦公室設計/);
});

test('生成：buildArticleJsonLd 產出合法結構（不再 ReferenceError）', () => {
  const jsonLd = generate.buildArticleJsonLd({
    article: {
      title: '香港辦公室裝修指南',
      excerpt: '摘要',
      body_md: '正文',
      body_html: '<p>正文</p>',
      published_at: '2026-11-25T02:00:00.000Z',
      updated_at: '2026-11-25T02:00:00.000Z',
      cover_asset_id: null,
    },
    seoDefaults: { ...seoDefaults, author: 'BWA 編輯部', publisher: 'BWA' },
    canonical: 'https://example.com/guide',
    liveUrl: 'https://example.com/guide',
    coverUrl: 'https://example.com/cover.svg',
    wordCount: 1200,
  });
  assert.equal(jsonLd['@type'], 'BlogPosting');
  assert.equal(jsonLd.headline, '香港辦公室裝修指南');
  assert.equal(jsonLd.inLanguage, 'zh-HK');
  assert.equal(jsonLd.url, 'https://example.com/guide');
  assert.equal(jsonLd.datePublished, '2026-11-25T02:00:00.000Z');
  assert.equal(jsonLd.author.name, 'BWA 編輯部');
  assert.equal(jsonLd.publisher.name, 'BWA');
  assert.equal(jsonLd.wordCount, 1200);
  assert.doesNotThrow(() => JSON.stringify(jsonLd));
});

// ============================================================
// 圖卡與內容包
// ============================================================

test('圖卡：SVG 含標題、漸變與尺寸', () => {
  const svg = media.buildSvgCard({ title: '香港辦公室裝修指南', brand: 'BWA', width: 1200, height: 675 });
  assert.match(svg, /^<svg[^>]+width="1200"[^>]+height="675"/);
  assert.match(svg, /linearGradient/);
  assert.match(svg, /香港辦公室裝修指南/);
  assert.ok(media.svgToDataUri(svg).startsWith('data:image/svg+xml;charset=utf-8,'));
});

test('圖卡：素材標籤匹配排序', () => {
  const assets = [
    { id: 'a', tags: ['辦公室'], created_at: '2026-01-01T00:00:00Z', mime_type: 'image/png' },
    { id: 'b', tags: ['辦公室', '封面'], created_at: '2026-02-01T00:00:00Z', mime_type: 'image/png' },
    { id: 'c', tags: ['餐飲'], created_at: '2026-03-01T00:00:00Z', mime_type: 'image/png' },
  ];
  assert.deepEqual(
    media.pickAssetsByTags(assets, ['辦公室', '封面'], 2).map((asset) => asset.id),
    ['b', 'a'],
  );
});

test('內容包：檔名與項目齊全', () => {
  const meta = {
    title: '標題',
    description: '描述',
    slug: 'hello-world',
    canonical: 'https://example.com/hello-world',
    og: {},
    keywords: ['關鍵字'],
    language: 'zh-HK',
    site: { id: 's1', name: 'BWA', domain: 'https://example.com' },
    section: { name: '文章', external_id: 'news' },
    publishAt: '2026-11-30T02:00:00.000Z',
    mode: 'manual',
  };
  assert.equal(pkg.packageFileName(meta), 'b100-example-com-hello-world.zip');

  const plan = pkg.buildPackagePlan({
    article: {
      title: '標題',
      slug: 'hello-world',
      excerpt: '摘要',
      body_md: '# 內文',
      meta_title: 'meta',
      meta_description: 'desc',
      canonical: meta.canonical,
      language: 'zh-HK',
    },
    site: {
      id: 's1',
      website_name: 'BWA',
      domain_url: 'https://example.com',
      platform: null,
      brand: null,
      status: null,
      level: null,
    },
    section: null,
    seoDefaults,
    meta,
    bodyHtml: '<p>內容</p>',
    jsonLd: { '@type': 'BlogPosting' },
    coverPath: 'images/cover-16x9.svg',
    mode: 'manual',
    coverAssetContent: { path: 'images/cover-16x9.svg', content: '<svg/>', contentType: 'image/svg+xml' },
  });
  const paths = plan.files.map((file) => file.path);
  for (const required of [
    'article.html',
    'article.md',
    'meta.json',
    'README.txt',
    'images/cover-16x9.svg',
  ]) {
    assert.ok(paths.includes(required), `缺少 ${required}`);
  }
  const html = plan.files.find((file) => file.path === 'article.html').content;
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /images\/cover-16x9\.svg/);
  assert.match(
    plan.files.find((file) => file.path === 'README.txt').content,
    /貼上步驟/,
  );
});

// ============================================================
// 日報
// ============================================================

test('日報：統計口徑與標題格式', () => {
  const stats = digest.buildDigestStats({
    date: '2026-11-25',
    sites: [
      { id: 's1', name: 'BWA', domain: 'example.com' },
      { id: 's2', name: 'Attitude', domain: 'attitude.example' },
    ],
    slots: [
      {
        site_id: 's1',
        publish_at: '2026-11-26T02:00:00Z',
        status: 'planned',
        keyword_id: null,
        article_id: null,
      },
      {
        site_id: 's1',
        publish_at: '2026-11-27T02:00:00Z',
        status: 'in_review',
        keyword_id: 'k1',
        article_id: 'a2',
      },
    ],
    articles: [
      {
        site_id: 's1',
        status: 'pending_review',
        title: '待審文章',
        created_at: '2026-11-25T01:00:00Z',
        scheduled_publish_at: null,
        published_at: null,
        updated_at: '2026-11-25T01:00:00Z',
      },
      {
        site_id: 's2',
        status: 'published',
        title: '已發文章',
        created_at: '2026-11-24T01:00:00Z',
        scheduled_publish_at: null,
        published_at: '2026-11-25T03:00:00Z',
        updated_at: '2026-11-25T03:00:00Z',
      },
      {
        site_id: 's2',
        status: 'publishing',
        title: '待回填',
        created_at: '2026-11-23T01:00:00Z',
        scheduled_publish_at: null,
        published_at: null,
        updated_at: '2026-11-25T04:00:00Z',
        publish_mode: 'manual',
      },
    ],
    usage: [{ tokens_in: 1000, tokens_out: 2000, cost_usd: 0.001 }],
    now: new Date('2026-11-25T06:00:00Z'),
  });
  assert.equal(stats.generated, 1);
  assert.equal(stats.pendingReview, 1);
  assert.equal(stats.published, 1);
  assert.equal(stats.manualPending, 1);
  assert.equal(stats.missingKeywords, 1);
  assert.equal(stats.pending.length, 2); // 缺關鍵字 + 待手動上線
  assert.ok(stats.upcoming.length >= 1);
  assert.equal(stats.totals.llmCalls, 1);

  const subject = digest.buildDigestSubject(stats);
  assert.match(subject, /^\[MPS\] 11\/25 內容日報：生成 1 · 待審 1 · 已發布 1 · 失敗 0$/);

  const email = digest.buildDigestEmail({ stats, siteOrigin: 'https://bwteam-marketing.com' });
  assert.match(email.html, /分站明細/);
  assert.match(email.html, /未來 3 天排程/);
  assert.match(email.html, /#tools-center\/social-automation\?zone=seo&page=articles/);
  assert.match(email.text, /處理入口/);
});

test('日報：收件人正規化與驗證', () => {
  assert.deepEqual(digest.normalizeRecipients(['A@B.com ', 'a@b.com', 'bad']), ['a@b.com']);
  assert.deepEqual(digest.invalidRecipients(['a@b.com', 'bad']), ['bad']);
  assert.equal(digest.isValidDigestTime('09:00'), true);
  assert.equal(digest.isValidDigestTime('25:00'), false);
});

// ============================================================
// 社媒自動營運（v0 autopilot）
// ============================================================

test('社媒：長文有 5 個 H2 且標題沿用熱點', () => {
  const article = socialGenerate.composeLongform({
    eventTitle: '換季敏感肌點樣揀潔面？',
    eventSummary: '轉季時好多人用錯潔面，洗完繃緊代表屏障被洗走。',
    groupName: 'Beauty100 美妝組',
  });
  assert.equal(article.title, '換季敏感肌點樣揀潔面？');
  assert.equal((article.body_md.match(/^## /gm) || []).length, 5);
  assert.ok(article.excerpt.length > 20);
  assert.ok(article.hashtags.length > 0);
  assert.match(article.body_md, /換季敏感肌/);
});

test('社媒：同平台文案共用、不同平台語氣不同', () => {
  const base = { title: '防曬要幾耐補一次？', excerpt: '室內室外節奏不同。', hashtags: ['防曬', '護膚'] };
  const ig1 = socialGenerate.composeSocial({ ...base, platform: 'instagram' });
  const ig2 = socialGenerate.composeSocial({ ...base, platform: 'instagram' });
  const threads = socialGenerate.composeSocial({ ...base, platform: 'threads' });
  const xhs = socialGenerate.composeSocial({ ...base, platform: 'xiaohongshu' });
  assert.equal(ig1.caption, ig2.caption);
  assert.notEqual(ig1.caption, threads.caption);
  assert.match(ig1.caption, /#/);
  assert.match(xhs.caption, /🔥/);
});

test('社媒：下一個排定時間是香港時間 10:00', () => {
  const next = socialGenerate.nextPublishAtHkt(new Date('2026-11-25T03:00:00Z')); // HKT 11:00，已過
  assert.equal(next, '2026-11-26T02:00:00.000Z');
  const early = socialGenerate.nextPublishAtHkt(new Date('2026-11-25T00:00:00Z')); // HKT 08:00
  assert.equal(early, '2026-11-25T02:00:00.000Z');
});

test('社媒：去重鍵（URL 正規化 + simhash）', () => {
  const a = socialDedupe.dedupeKey('https://example.com/a?utm_source=x&id=1', '標題');
  const b = socialDedupe.dedupeKey('https://example.com/a?id=1', '另一個標題');
  assert.equal(a, b);
  assert.match(a, /^url:/);
  const sim = socialDedupe.dedupeKey(null, '果酸煥膚適合什麼膚質');
  assert.match(sim, /^sim:/);
  assert.equal(socialDedupe.hamming(socialDedupe.simhash('同一個標題'), socialDedupe.simhash('同一個標題')), 0);
});

test('社媒：熱度隨來源分級與時間衰減', () => {
  assert.ok(socialDedupe.heatScore(1, 0) > socialDedupe.heatScore(2, 0));
  assert.ok(socialDedupe.heatScore(2, 0) > socialDedupe.heatScore(2, 24));
  assert.ok(socialDedupe.heatScore(1, 0) <= 100);
});

// ============================================================
// 社媒去重（2026-11-26）：事件召回分數、輸出指紋、保留規則
// ============================================================

test('社媒去重：事件相似度分數用真實資料校準', () => {
  // 同一促銷換了折扣（真重複）
  assert.equal(
    socialCluster.duplicateVerdict(
      socialCluster.eventSimilarity(
        { title: 'Sephora限時75折！護膚化妝/香水$21起：必買M·A·C唇膏、NARS胭脂' },
        { title: 'Sephora限時4折！護膚化妝/香水$21起：必買M·A·C唇膏、NARS胭脂' },
      ),
    ),
    'duplicate',
  );
  // 同一活動換了標題措辭（真重複）
  assert.equal(
    socialCluster.duplicateVerdict(
      socialCluster.eventSimilarity(
        {
          title:
            'Coupang酷澎攜手國際美妝與台灣在地品牌韓系美妝官方好禮、金車暖心湯底「火箭速配」最快隔日到貨',
        },
        {
          title:
            'Coupang酷澎黑五購物節開跑 韓系美妝官方好禮、金車暖心湯底「火箭速配」最快隔日到貨',
        },
      ),
    ),
    'duplicate',
  );
  // 同一節目不同寫法 → 交給模型（不直接合併）
  assert.equal(
    socialCluster.duplicateVerdict(
      socialCluster.eventSimilarity(
        { title: 'Just Makeup 2｜化妝師生存戰 太妍允兒娜璉Winter神級女團主持' },
        { title: '《Just Makeup》第2季強勢回歸 !太妍、Winter等星級女神聯手主持' },
      ),
    ),
    'review',
  );
  // 短標題剛好被長清單包含，不能當成同一件事（重疊係數的陷阱）
  assert.equal(
    socialCluster.duplicateVerdict(
      socialCluster.eventSimilarity(
        { title: '保濕精華實測💧', summary: '實測幾款開架保濕精華的質地與吸收度' },
        {
          title: '雙11優惠！iHerb必買護膚品推介｜16款好評平價護膚品：保濕精華、面霜、抗老精華等推薦',
          summary: '整理 iHerb 雙11 必買清單，涵蓋保濕精華、面霜與抗老精華',
        },
      ),
    ),
    'distinct',
  );
  // 完全不同的兩件事
  assert.equal(
    socialCluster.duplicateVerdict(
      socialCluster.eventSimilarity(
        { title: '換季敏感肌潔面選擇：界面活性劑與洗後感覺' },
        { title: '抗老護膚品2026｜編輯部推薦回購眼霜與熬夜精華水' },
      ),
    ),
    'distinct',
  );
  assert.ok(socialCluster.EVENT_REVIEW < socialCluster.EVENT_DUPLICATE);
  assert.equal(socialCluster.duplicateVerdict(1), 'duplicate');
  assert.equal(socialCluster.duplicateVerdict(Number.NaN), 'distinct');
});

test('社媒去重：成稿指紋忽略 Markdown 語法與標點', () => {
  const withMarkdown =
    '## 點解呢件事值得留意\n\n最近好多人都喺度問同一個問題：**測試**。\n\n## 重點整理\n\n- 一\n- 二\n';
  const flattened =
    '## 點解呢件事值得留意 最近好多人都喺度問同一個問題：測試  ## 重點整理 - 一 - 二';
  assert.equal(
    socialDedupe.contentFingerprint('標題', withMarkdown),
    socialDedupe.contentFingerprint('標題', flattened),
  );
  assert.notEqual(
    socialDedupe.contentFingerprint('標題', withMarkdown),
    socialDedupe.contentFingerprint('另一個標題', withMarkdown),
  );
  assert.equal(socialDedupe.contentFingerprint('標題', withMarkdown).length, 16);
  // 同一篇：相似度接近 1；不同內容：明顯較低
  assert.ok(
    socialDedupe.postSimilarity(
      { title: '標題', body_md: withMarkdown },
      { title: '標題', body_md: flattened },
    ) >= 0.9,
  );
  assert.ok(
    socialDedupe.postSimilarity(
      { title: '標題', body_md: withMarkdown },
      { title: '另一篇', body_md: '## 完全不同的內容\n\n講另一件事，同上面無關。' },
    ) < 0.6,
  );
});

test('社媒去重：同事件多稿的保留順序（狀態 > 生成來源 > 導流數 > 時間）', () => {
  const base = { target_count: 4, created_at: '2026-11-26T01:00:00.000Z' };
  const posts = [
    { id: 'pending-grok', status: 'pending_review', generator: 'grok', ...base },
    {
      id: 'pending-template-earlier',
      status: 'pending_review',
      generator: 'template',
      target_count: 4,
      created_at: '2026-11-25T00:00:00.000Z',
    },
    {
      id: 'published-template',
      status: 'published',
      generator: 'template',
      target_count: 1,
      created_at: '2026-11-26T02:00:00.000Z',
    },
  ];
  assert.equal(socialDedupe.pickCanonicalPost(posts).id, 'published-template');

  const withoutPublished = posts.filter((post) => post.status !== 'published');
  assert.equal(socialDedupe.pickCanonicalPost(withoutPublished).id, 'pending-grok');

  // 同狀態同來源：導流多者優先；再同：較早建立者優先
  const targetTie = [
    { id: 'few', status: 'pending_review', generator: 'grok', target_count: 2, created_at: '2026-11-26T00:00:00.000Z' },
    { id: 'many', status: 'pending_review', generator: 'grok', target_count: 5, created_at: '2026-11-26T03:00:00.000Z' },
  ];
  assert.equal(socialDedupe.pickCanonicalPost(targetTie).id, 'many');

  const timeTie = [
    { id: 'later', status: 'pending_review', generator: 'grok', target_count: 2, created_at: '2026-11-26T03:00:00.000Z' },
    { id: 'earlier', status: 'pending_review', generator: 'grok', target_count: 2, created_at: '2026-11-26T00:00:00.000Z' },
  ];
  assert.equal(socialDedupe.pickCanonicalPost(timeTie).id, 'earlier');
  assert.equal(socialDedupe.pickCanonicalPost([]), null);
});

// ============================================================
// 權限與路由
// ============================================================

test('權限：四級角色矩陣', () => {
  assert.equal(permissions.can({ role: 'staff' }, 'write'), false);
  assert.equal(permissions.can({ role: 'designer' }, 'approve'), false);
  assert.equal(permissions.can({ role: 'copywriter' }, 'write'), true);
  assert.equal(permissions.can({ role: 'copywriter' }, 'approve'), false);
  assert.equal(permissions.can({ role: 'chief_editor' }, 'approve'), true);
  assert.equal(permissions.can({ role: 'chief_editor' }, 'manage_sites'), false);
  assert.equal(permissions.can({ role: 'management' }, 'manage_sites'), true);
  // 遠端實際存在的角色（users.role_tag）：system_dev 與 super_admin 都必須能管理站點
  assert.equal(permissions.can({ role: 'system_dev' }, 'manage_sites'), true);
  assert.equal(permissions.can({ role: 'super_admin' }, 'approve'), true);
  assert.equal(permissions.can({ role: 'administrator' }, 'manage_sites'), true);
});

test('權限：role_tag 映射（含總編輯優先）', () => {
  assert.equal(permissions.resolveInternalRole('Chief Editor (Administrator)'), 'chief_editor');
  assert.equal(permissions.resolveInternalRole('總編輯'), 'chief_editor');
  assert.equal(permissions.resolveInternalRole('Administrator'), 'management');
  assert.equal(permissions.resolveInternalRole('Copywriter'), 'copywriter');
  assert.equal(permissions.resolveInternalRole(''), 'staff');
  // production users.role_tag 實際值
  assert.equal(permissions.resolveInternalRole('system_dev'), 'system_dev');
  assert.equal(permissions.resolveInternalRole('super_admin'), 'management');
  assert.equal(permissions.resolveInternalRole('management'), 'management');
});

test('路由：hash 解析與組裝、非法值回落', () => {
  const route = navigation.parseContentRoute(
    '#tools-center/social-automation?zone=seo&page=keywords&id=k1',
  );
  assert.deepEqual(route, { zone: 'seo', page: 'keywords', id: 'k1' });

  const fallback = navigation.parseContentRoute(
    '#tools-center/social-automation?zone=seo&page=bogus',
  );
  assert.deepEqual(fallback, { zone: 'seo', page: 'sites', id: null });

  assert.equal(
    navigation.buildContentHash('seo', 'plan', 'abc'),
    '#tools-center/social-automation?zone=seo&page=plan&id=abc',
  );
  assert.equal(navigation.pageMeta({ zone: 'seo', page: 'plan' }).label, '排程表');
  assert.equal(navigation.isPageInZone('social', 'radar'), true);
  assert.equal(navigation.isPageInZone('seo', 'radar'), false);
});

// ============================================================
// 社媒品牌組與帳號（P4／M4-02）
// ============================================================

test('社媒：handle 正規化（全形、@、空白）', () => {
  assert.equal(socialGroups.normalizeSocialHandle(' ＠Beauty 100 '), 'Beauty100');
  assert.equal(socialGroups.normalizeSocialHandle('@@beauty100.hk'), 'beauty100.hk');
  assert.equal(socialGroups.normalizeSocialHandle(''), '');
});

test('社媒：批量新增帳號逐行解析與問題回報', () => {
  const parsed = socialGroups.parseBulkAccountLines(
    ['beauty100.hk', 'Beauty100 編輯室 | beauty100.editor', '', '@dup', 'DUP', '顯示名 |'].join('\n'),
    'instagram',
  );
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].handle, 'beauty100.hk');
  assert.equal(parsed.rows[0].displayName, null);
  assert.equal(parsed.rows[1].handle, 'beauty100.editor');
  assert.equal(parsed.rows[1].displayName, 'Beauty100 編輯室');
  assert.equal(parsed.rows[2].handle, 'dup');
  // 第 5 行與第 4 行重複；第 6 行缺少 handle
  assert.equal(parsed.problems.length, 2);
  assert.match(parsed.problems[0], /第 5 行/);
  assert.match(parsed.problems[1], /第 6 行/);
});

test('社媒：組名驗證（必填、長度、重複、改名排除自己）', () => {
  assert.equal(socialGroups.validateSocialGroupName(''), '請輸入組名');
  assert.match(socialGroups.validateSocialGroupName('x'.repeat(41)), /最多 40/);
  assert.equal(
    socialGroups.validateSocialGroupName('Beauty100 美妝組', { existing: ['beauty100 美妝組'] }),
    '已經有同名組，請換一個名稱',
  );
  assert.equal(
    socialGroups.validateSocialGroupName('Beauty100 美妝組', {
      existing: ['Beauty100 美妝組'],
      selfName: 'Beauty100 美妝組',
    }),
    null,
  );
});

test('社媒：目錄索引（一帳號多組、歸檔組分開、同平台排序）', () => {
  const groups = [
    { id: 'g1', name: 'Beauty100 美妝組', description: null, archived: false, created_at: '', updated_at: '' },
    { id: 'g2', name: 'Beauty100 生活組', description: null, archived: true, created_at: '', updated_at: '' },
  ];
  const accounts = [
    {
      id: 'a1',
      brand_id: null,
      platform: 'facebook',
      handle: 'beauty100magazine',
      display_name: 'Beauty100 Magazine',
      login_status: 'active',
      last_checked_at: null,
      archived: false,
      notes: null,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'a2',
      brand_id: null,
      platform: 'instagram',
      handle: 'beauty100hk',
      display_name: null,
      login_status: 'expired',
      last_checked_at: null,
      archived: false,
      notes: null,
      created_at: '',
      updated_at: '',
    },
  ];
  const members = [
    { group_id: 'g1', account_id: 'a1' },
    { group_id: 'g1', account_id: 'a2' },
    { group_id: 'g2', account_id: 'a1' },
  ];
  const directory = socialGroups.buildSocialDirectory({ groups, accounts, members });
  assert.equal(directory.groups.length, 1);
  assert.equal(directory.archivedGroups.length, 1);
  assert.deepEqual(
    directory.groups[0].accounts.map((account) => account.handle),
    ['beauty100hk', 'beauty100magazine'],
  );
  const a1 = directory.accounts.find((account) => account.id === 'a1');
  assert.deepEqual(a1.groups.map((group) => group.id).sort(), ['g1', 'g2']);
  assert.equal(a1.groups.find((group) => group.id === 'g2').archived, true);
});

test('社媒：歸檔保護（至少保留一個未歸檔組）', () => {
  assert.equal(
    socialGroups.canArchiveSocialGroup(
      [{ id: 'g1', archived: false }, { id: 'g2', archived: false }],
      'g1',
    ),
    true,
  );
  assert.equal(socialGroups.canArchiveSocialGroup([{ id: 'g1', archived: false }], 'g1'), false);
});

test('社媒：組健康摘要與帳號顯示名', () => {
  assert.deepEqual(
    socialGroups.summarizeGroupHealth([
      { login_status: 'active' },
      { login_status: 'expired' },
      { login_status: 'unknown' },
    ]),
    { total: 3, connected: 1, needsAttention: 2 },
  );
  assert.equal(
    socialGroups.accountDisplayLabel({ handle: 'beauty100hk', display_name: 'Beauty100 美妝誌' }),
    'Beauty100 美妝誌',
  );
  assert.equal(socialGroups.accountDisplayLabel({ handle: 'beauty100hk', display_name: null }), '@beauty100hk');
});

test('社媒：未知登入狀態與平台安全回落', () => {
  assert.equal(socialGroups.loginStatusMeta('something-else').label, '未設定');
  assert.equal(socialGroups.loginStatusMeta('active').tone, 'green');
  assert.equal(socialGroups.platformDotClass('mastodon'), socialGroups.SOCIAL_PLATFORM_DOT.other);
});

// ============================================================
// 社媒登入憑證（半自動，M4-03）
// ============================================================

test('憑證：狀態推導（未設定／有效／即將到期／已過期／失效）', () => {
  const now = new Date('2026-11-26T00:00:00Z');
  const at = (credential_status, credential_expires_at) => ({ credential_status, credential_expires_at });
  assert.equal(socialGroups.deriveCredentialStatus(null, now), 'none');
  assert.equal(socialGroups.deriveCredentialStatus(at(null, null), now), 'none');
  assert.equal(socialGroups.deriveCredentialStatus(at('active', null), now), 'active');
  assert.equal(
    socialGroups.deriveCredentialStatus(at('active', '2026-11-27T00:00:00Z'), now),
    'expiring',
  );
  assert.equal(
    socialGroups.deriveCredentialStatus(at('active', '2026-12-31T00:00:00Z'), now),
    'active',
  );
  assert.equal(
    socialGroups.deriveCredentialStatus(at('active', '2026-11-20T00:00:00Z'), now),
    'expired',
  );
  assert.equal(
    socialGroups.deriveCredentialStatus(at('invalid', '2026-12-31T00:00:00Z'), now),
    'invalid',
  );
});

test('憑證：剩餘天數（進位／退位）與到期日標籤', () => {
  const now = new Date('2026-11-26T00:00:00Z');
  assert.equal(socialGroups.credentialDaysLeft('2026-11-27T00:00:00Z', now), 1);
  assert.equal(socialGroups.credentialDaysLeft('2026-11-26T12:00:00Z', now), 1);
  assert.equal(socialGroups.credentialDaysLeft('2026-11-20T00:00:00Z', now), -6);
  assert.equal(socialGroups.credentialDaysLeft(null, now), null);
  assert.match(socialGroups.credentialExpiryLabel('2026-11-27T15:59:59Z'), /2026/);
});

test('憑證：摘要統計與待處理判斷', () => {
  const now = new Date('2026-11-26T00:00:00Z');
  const summary = socialGroups.summarizeCredentials(
    [
      { credential_status: 'active', credential_expires_at: null },
      { credential_status: 'active', credential_expires_at: '2026-11-28T00:00:00Z' },
      { credential_status: 'active', credential_expires_at: '2026-11-20T00:00:00Z' },
      { credential_status: 'invalid', credential_expires_at: null },
      { credential_status: null, credential_expires_at: null },
    ],
    now,
  );
  assert.deepEqual(summary, {
    total: 5,
    active: 1,
    expiring: 1,
    expired: 1,
    invalid: 1,
    none: 1,
    needsAttention: 3,
  });
  assert.equal(socialGroups.credentialNeedsAttention('active'), false);
  assert.equal(socialGroups.credentialNeedsAttention('expiring'), true);
  assert.equal(socialGroups.credentialStatusMeta('expired').tone, 'rose');
  assert.equal(socialGroups.credentialStatusMeta('unknown-value').label, '未設定憑證');
});

// ============================================================
// 社媒平台 OAuth（M4-03）
// ============================================================

test('OAuth：平台 → provider 對照與標籤', () => {
  assert.equal(socialOAuth.oauthProviderForPlatform('instagram'), 'meta');
  assert.equal(socialOAuth.oauthProviderForPlatform('facebook'), 'meta');
  assert.equal(socialOAuth.oauthProviderForPlatform('threads'), 'threads');
  assert.equal(socialOAuth.oauthProviderForPlatform('youtube'), 'google');
  assert.equal(socialOAuth.oauthProviderForPlatform('xiaohongshu'), null);
  assert.equal(socialOAuth.oauthProviderForPlatform('other'), null);
  assert.match(socialOAuth.oauthProviderLabelForPlatform('instagram'), /Meta/);
  assert.equal(socialOAuth.oauthProviderLabelForPlatform('xiaohongshu'), null);
});

test('OAuth：callback origin 白名單（正式網域／本機，其餘拒絕）', () => {
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin('https://bwteam-marketing.com'), true);
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin('https://mps.bwteam-marketing.com'), true);
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin('http://localhost:5174'), true);
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin('http://127.0.0.1:5174'), true);
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin('https://evil.example.com'), false);
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin('http://bwteam-marketing.com'), false);
  assert.equal(socialOAuth.isAllowedSocialOAuthOrigin(''), false);
});

test('OAuth：redirect URI 與訊息型別', () => {
  assert.equal(
    socialOAuth.socialOAuthRedirectUri('https://bwteam-marketing.com/'),
    'https://bwteam-marketing.com/social-oauth-callback',
  );
  assert.equal(socialOAuth.SOCIAL_OAUTH_MESSAGE, 'mps-social-oauth');
  assert.equal(socialOAuth.SOCIAL_OAUTH_PROVIDERS.meta.platforms.includes('instagram'), true);
  assert.equal(socialOAuth.SOCIAL_OAUTH_PROVIDERS.google.envKeys.includes('GOOGLE_OAUTH_CLIENT_ID'), true);
});

// ============================================================
// 自動發佈 adapters（A）＋半自動交付頁（C）
// ============================================================

test('交付頁：平台 deeplink、分組與進度', () => {
  const links = socialDelivery.buildSocialDeliveryLinks('threads', 'Hi 100');
  assert.equal(links.length, 1);
  assert.match(links[0].href, /threads\.net\/intent\/post\?text=Hi%20100/);
  assert.equal(
    socialDelivery.buildSocialDeliveryLinks('facebook', 'x')[0].href,
    'https://www.facebook.com/',
  );
  assert.equal(
    socialDelivery.buildSocialDeliveryLinks('xiaohongshu', 'x')[0].note.includes('沒有公開 API'),
    true,
  );
  assert.deepEqual(socialDelivery.buildSocialDeliveryLinks('other', 'x'), []);

  const groups = socialDelivery.buildDeliveryPlatformGroups([
    { platform: 'threads', handle: 'b', copy_text: '', display_name: null, status: 'ready' },
    { platform: 'instagram', handle: 'a', copy_text: 'IG copy', display_name: null, status: 'ready' },
    { platform: 'threads', handle: 'c', copy_text: 'TH copy', display_name: null, status: 'ready' },
  ]);
  assert.equal(groups.length, 2);
  const threads = groups.find((group) => group.platform === 'threads');
  assert.equal(threads.copyText, 'TH copy');
  assert.equal(threads.targets.length, 2);
  assert.equal(socialDelivery.deliveryProgress([{ status: 'published' }, { status: 'ready' }]).remaining, 1);
});

test('Adapter：WordPress 契約（Basic auth＋direct→publish）', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('?slug=')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify({ id: 42, link: 'https://wp.example/?p=42' }), { status: 201 });
  };
  const result = await adapters.wordpressAdapter.createArticle({
    site: { id: 's', name: 'S', domain: 'wp.example', publishMode: 'direct', timezone: 'Asia/Hong_Kong' },
    credentials: { secret: 'admin:abcd 1234' },
    article: {
      title: 'T',
      slug: 't',
      excerpt: 'E',
      bodyHtml: '<p>B</p>',
      bodyMd: 'B',
      canonical: 'https://wp.example/t',
      metaDescription: 'M',
    },
    fetchImpl: fakeFetch,
  });
  const post = calls.find((call) => String(call.init.method) === 'POST');
  assert.equal(JSON.parse(String(post.init.body)).status, 'publish');
  assert.match(String(post.init.headers.Authorization), /^Basic /);
  assert.equal(result.ok, true);
  assert.equal(result.externalId, '42');
  assert.equal(result.liveUrl, 'https://wp.example/?p=42');
});

test('Adapter：Shopify 契約（token header＋文章公開 URL）', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('articles.json')) {
      return new Response(JSON.stringify({ article: { id: 77, handle: 'hello' } }), { status: 201 });
    }
    if (String(url).includes('blogs/9.json')) {
      return new Response(JSON.stringify({ blog: { id: 9, handle: 'news' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ blogs: [{ id: 9, handle: 'news' }] }), { status: 200 });
  };
  const result = await adapters.shopifyAdapter.createArticle({
    site: { id: 's', name: 'S', domain: 'shop.example', publishMode: 'direct', timezone: 'Asia/Hong_Kong' },
    credentials: { secret: JSON.stringify({ token: 'shpat_x', blog_id: 9 }) },
    article: {
      title: 'T',
      slug: 'hello',
      excerpt: 'E',
      bodyHtml: '<p>B</p>',
      bodyMd: 'B',
      canonical: '',
      metaDescription: 'M',
    },
    fetchImpl: fakeFetch,
  });
  assert.equal(result.ok, true);
  assert.equal(result.externalId, '77');
  assert.equal(result.liveUrl, 'https://shop.example/blogs/news/hello');
  // 指定 blog_id 時不需要先列 blogs
  assert.equal(calls.some((url) => url.includes('blogs.json')), false);
});

test('Adapter：Webflow 契約（RichText 欄位＋draft 不送 live）', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/sites')) {
      return new Response(
        JSON.stringify({
          sites: [{ id: 's1', displayName: 'S', shortName: 'shop', customDomains: [{ url: 'https://shop.example' }] }],
        }),
        { status: 200 },
      );
    }
    if (String(url).includes('/collections') && !String(url).includes('/items')) {
      return new Response(
        JSON.stringify({
          collections: [
            {
              id: 'c1',
              displayName: 'Blog',
              fields: [
                { slug: 'name', type: 'PlainText' },
                { slug: 'slug', type: 'PlainText' },
                { slug: 'post-body', type: 'RichText' },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ id: 'i1' }), { status: 200 });
  };
  const result = await adapters.webflowAdapter.createArticle({
    site: { id: 's', name: 'S', domain: 'shop.example', publishMode: 'draft', timezone: 'Asia/Hong_Kong' },
    credentials: { secret: 'wf_x' },
    article: {
      title: 'T',
      slug: 'hello',
      excerpt: 'E',
      bodyHtml: '<p>B</p>',
      bodyMd: 'B',
      canonical: '',
      metaDescription: 'M',
    },
    fetchImpl: fakeFetch,
  });
  const post = calls.find((call) => call.url.includes('/items'));
  const body = JSON.parse(String(post.init.body));
  assert.equal(body.isDraft, true);
  assert.equal(body.fieldData.name, 'T');
  assert.equal(body.fieldData['post-body'], '<p>B</p>');
  assert.equal(String(post.url).includes('live=true'), false);
  assert.equal(result.ok, true);
  assert.equal(result.externalId, 'i1');
});

test('Adapter：registry 對應（wordpress/shopify/webflow 不再是 manual）', () => {
  assert.equal(adapters.getContentAdapter('wordpress').name, 'wordpress');
  assert.equal(adapters.getContentAdapter('shopify').name, 'shopify');
  assert.equal(adapters.getContentAdapter('webflow').name, 'webflow');
  assert.equal(adapters.getContentAdapter('beauty100').name, 'beauty100');
  assert.equal(adapters.getContentAdapter('manual').supports('direct'), false);
});

// ============================================================
// 遠端刪除（不是只刪 MPS 記錄）
// ============================================================

test('狀態機：已發佈文章可轉 cancelled（遠端刪除終態）', () => {
  assert.equal(contentState.canTransition('article', 'published', 'cancelled'), true);
  assert.equal(contentState.canTransition('article', 'updating', 'cancelled'), true);
  assert.equal(contentState.canTransition('article', 'verify_failed', 'cancelled'), true);
  assert.equal(contentState.canTransition('article', 'draft_published', 'cancelled'), true);
  // 手動完成／已取消仍是終態，不可再轉
  assert.equal(contentState.canTransition('article', 'manual_done', 'cancelled'), false);
  assert.equal(contentState.canTransition('article', 'cancelled', 'published'), false);
});

test('Adapter：WordPress 遠端刪除（force=true；404 視為已刪）', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/404')) return new Response(JSON.stringify({ code: 'rest_post_invalid_id' }), { status: 404 });
    return new Response(JSON.stringify({ deleted: true, previous: { id: 42 } }), { status: 200 });
  };
  const site = { id: 's', name: 'S', domain: 'wp.example', publishMode: 'direct', timezone: 'Asia/Hong_Kong' };
  const credentials = { secret: 'admin:abcd 1234' };
  const okResult = await adapters.wordpressAdapter.deleteArticle({
    site,
    credentials,
    externalId: '42',
    fetchImpl: fakeFetch,
  });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.alreadyGone, false);
  assert.equal(String(calls[0].init.method), 'DELETE');
  assert.match(String(calls[0].url), /\/wp-json\/wp\/v2\/posts\/42\?force=true/);
  const gone = await adapters.wordpressAdapter.deleteArticle({
    site,
    credentials,
    externalId: '404',
    fetchImpl: fakeFetch,
  });
  assert.equal(gone.ok, true);
  assert.equal(gone.alreadyGone, true);
});

test('Adapter：Shopify／Webflow 遠端刪除契約', async () => {
  const calls = [];
  const shopifyFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('articles/77.json')) return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ blog: { id: 9, handle: 'news' } }), { status: 200 });
  };
  const shopify = await adapters.shopifyAdapter.deleteArticle({
    site: { id: 's', name: 'S', domain: 'shop.example', publishMode: 'direct', timezone: 'Asia/Hong_Kong' },
    credentials: { secret: JSON.stringify({ token: 'shpat_x', blog_id: 9 }) },
    externalId: '77',
    fetchImpl: shopifyFetch,
  });
  assert.equal(shopify.ok, true);
  const shopifyDelete = calls.find((call) => String(call.init.method) === 'DELETE');
  assert.match(String(shopifyDelete.url), /blogs\/9\/articles\/77\.json/);

  const webflowCalls = [];
  const webflowFetch = async (url, init = {}) => {
    webflowCalls.push({ url: String(url), init });
    const text = String(url);
    if (text.endsWith('/sites')) {
      return new Response(JSON.stringify({ sites: [{ id: 's1', displayName: 'S', shortName: 'shop', customDomains: [] }] }), { status: 200 });
    }
    if (text.includes('/collections') && !text.includes('/items')) {
      return new Response(JSON.stringify({ collections: [{ id: 'c1', fields: [{ slug: 'name', type: 'PlainText' }, { slug: 'slug', type: 'PlainText' }] }] }), { status: 200 });
    }
    if (text.includes('/items/gone')) return new Response('{}', { status: 404 });
    return new Response('{}', { status: 200 });
  };
  const webflow = await adapters.webflowAdapter.deleteArticle({
    site: { id: 's', name: 'S', domain: 'shop.example', publishMode: 'draft', timezone: 'Asia/Hong_Kong' },
    credentials: { secret: 'wf_x' },
    externalId: 'item1',
    fetchImpl: webflowFetch,
  });
  assert.equal(webflow.ok, true);
  const webflowDelete = webflowCalls.find((call) => String(call.init.method) === 'DELETE');
  assert.match(String(webflowDelete.url), /\/collections\/c1\/items\/item1/);
  const gone = await adapters.webflowAdapter.deleteArticle({
    site: { id: 's', name: 'S', domain: 'shop.example', publishMode: 'draft', timezone: 'Asia/Hong_Kong' },
    credentials: { secret: 'wf_x' },
    externalId: 'gone',
    fetchImpl: webflowFetch,
  });
  assert.equal(gone.alreadyGone, true);
});

test('Adapter：manual 不支援遠端刪除（不可靜默假成功）', () => {
  assert.equal(typeof adapters.getContentAdapter('manual').deleteArticle, 'undefined');
});

// ============================================================
// 結果
// ============================================================

// ============================================================
// Beauty100 純函式／發佈狀態
// ============================================================

test('Beauty100：憑證 JSON 驗證與預設 bucket', () => {
  const parsed = beauty100.parseBeauty100Credential(
    JSON.stringify({
      supabase_url: 'https://gkqctvtteafjprkudgsb.supabase.co/',
      anon_key: 'sb_publishable_test_key_123456',
      email: 'mps@beauty100.test',
      password: 'secret123',
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.config.supabaseUrl, 'https://gkqctvtteafjprkudgsb.supabase.co');
    assert.equal(parsed.config.bucket, 'uploads');
  }

  const missing = beauty100.parseBeauty100Credential('{}');
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.errors.length >= 4);
  }
  assert.equal(beauty100.parseBeauty100Credential('not json').ok, false);
});

test('Beauty100：分類與文章網址', () => {
  assert.equal(
    beauty100.beauty100CategoryForSection({ external_id: 'facial-care' }),
    'facial-care',
  );
  assert.equal(
    beauty100.beauty100CategoryForSection({ external_id: 'nope' }),
    'trending-topics',
  );
  assert.equal(
    beauty100.beauty100CategoryForSection({ external_id: 'topics' }),
    'trending-topics',
  );
  assert.equal(
    beauty100.beauty100ArticleUrl('https://www.beauty100-magazine.com/', 'trending-topics', 'abc'),
    'https://www.beauty100-magazine.com/topics/abc',
  );
  assert.equal(
    beauty100.beauty100ArticleUrl('https://www.beauty100-magazine.com', 'body-shaping', 'abc'),
    'https://www.beauty100-magazine.com/topics/abc',
  );
  assert.equal(beauty100.beauty100ArticleUrl(null, 'trending-topics', 'abc'), null);
});

test('Beauty100：requireCover 與前端常數一致', () => {
  assert.equal(adapters.beauty100Adapter.requiresCover, true);
  assert.equal(state.ADAPTER_REQUIRES_COVER.beauty100, true);
  assert.equal(adapters.getContentAdapter('beauty100').name, 'beauty100');
});

test('發佈狀態：排隊中／延遲／發佈中', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const queued = state.publishStage({
    status: 'scheduled',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: future,
  });
  assert.equal(queued.stage, 'queued');
  assert.equal(queued.label, '排隊中');

  const past = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const late = state.publishStage({
    status: 'scheduled',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: past,
  });
  assert.equal(late.stage, 'queued');
  assert.match(late.label, /延遲/);

  const publishing = state.publishStage({
    status: 'publishing',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(publishing.stage, 'publishing');
});

test('發佈狀態：已發佈／驗證中／失敗／已下架', () => {
  const published = state.publishStage({
    status: 'published',
    deleted_at: null,
    checks: { verify: { ok: true, httpStatus: 200, checkedAt: '', items: [] } },
    scheduled_publish_at: null,
  });
  assert.equal(published.stage, 'published');
  assert.match(published.label, /成功/);

  const pending = state.publishStage({
    status: 'published',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(pending.stage, 'verify_pending');

  const failed = state.publishStage({
    status: 'publish_failed',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(failed.stage, 'failed');

  const deleted = state.publishStage({
    status: 'cancelled',
    deleted_at: new Date().toISOString(),
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(deleted.stage, 'deleted');
});

test('發佈狀態：manual 站與未批准狀態', () => {
  const manual = state.publishStage(
    { status: 'scheduled', deleted_at: null, checks: {}, scheduled_publish_at: null },
    { manual: true },
  );
  assert.equal(manual.stage, 'manual');

  const blocked = state.publishStage({
    status: 'pending_review',
    deleted_at: null,
    checks: {},
    scheduled_publish_at: null,
  });
  assert.equal(blocked.stage, 'blocked');
  assert.match(String(blocked.hint), /不會發佈/);
});

test('批准閘門：必須有 reviewer_id 與 approved_at', () => {
  assert.equal(state.isApprovedForPublish({ reviewer_id: null, approved_at: null }), false);
  assert.equal(state.isApprovedForPublish({ reviewer_id: 'u1', approved_at: null }), false);
  assert.equal(
    state.isApprovedForPublish({ reviewer_id: null, approved_at: '2026-01-01T00:00:00Z' }),
    false,
  );
  assert.equal(
    state.isApprovedForPublish({ reviewer_id: 'u1', approved_at: '2026-01-01T00:00:00Z' }),
    true,
  );
});

test('狀態機：自動發佈必須先 publishing 才能 published（避免 scheduled 直跳）', () => {
  assert.equal(state.canTransition('article', 'scheduled', 'published'), false);
  assert.equal(state.canTransition('article', 'scheduled', 'publishing'), true);
  assert.equal(state.canTransition('article', 'publishing', 'published'), true);
});

report();
