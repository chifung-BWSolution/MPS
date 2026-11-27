import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePage } from '../src/lib/altPageParser.ts';
import { buildAltPrompt, normalizeAltDraft, parseAltModelJson } from '../src/lib/altPrompt.ts';
import { evaluateAlt } from '../src/lib/altQuality.ts';
import {
  buildAltExportRows,
  toBatchReportCsv,
  toCsv,
  toJson,
  toTsv,
} from '../src/lib/altCsv.ts';
import { hostMatches, normalizePageUrl } from '../src/lib/altUrl.ts';
import { isSitemapUrl, parseSitemap } from '../src/lib/altSitemap.ts';
import { auditAltImages } from '../src/lib/altAudit.ts';
import {
  assertPublicHost,
  bytesToBase64,
  isPrivateIpv4,
  sha256Hex,
} from '../supabase/functions/alt-pilot/guard.ts';
import { countWords } from '../src/lib/altText.ts';
import { formatAltQuota, isAltQuotaExceeded } from '../src/lib/altQuota.ts';
import { altModelRankMark, pickCurrentModelUsage, rankUsedAltModels } from '../src/lib/altModels.ts';
import { TEXT_LLM_ORDER } from '../src/lib/llmProviderOrder.ts';
import { canManageAltPilot } from '../src/lib/altPermissions.ts';
import type { AltPageContext, AltSuggestionRow } from '../src/lib/altTypes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readFixture = (name: string) => readFileSync(join(root, 'scripts', 'fixtures', name), 'utf8');

// ---------------------------------------------------------------------------
// 1) Page parser
// ---------------------------------------------------------------------------
const framerHtml = readFixture('alt-page-framer.html');
const framer = analyzePage(framerHtml, 'https://www.bwteam.com/office-design');

assert.equal(framer.page.title, '香港辦公室設計｜BW Interior 志豐設計工程');
assert.equal(framer.page.lang, 'zh-HK');
assert.equal(framer.page.h1, '香港辦公室設計');
assert.equal(framer.page.canonical, 'https://www.bwteam.com/office-design');
assert.equal(framer.page.h2s.includes('開放式辦公室'), true);
assert.equal(framer.page.imageCount, 6);
assert.equal(framer.page.skippedImageCount, 4);
assert.equal(framer.images.length, 6);

const office01 = framer.images.find((image) => image.url.endsWith('/images/office-01.jpg'));
assert.ok(office01);
assert.equal(office01?.location, 'main');
assert.equal(office01?.nearbyHeading, '開放式辦公室');
assert.equal(office01?.nearbyCaption.includes('中環辦公室項目'), true);

const office02 = framer.images.find((image) => image.url.endsWith('/images/office-02.jpg'));
assert.ok(office02);
assert.equal(office02?.currentAlt, '舊的 ALT：辦公室');
assert.equal(office02?.hasAltAttr, true);

const office03 = framer.images.find((image) => image.url.includes('office-03-large.jpg'));
assert.ok(office03);

const deco = framer.images.find((image) => image.url.includes('deco.png'));
assert.ok(deco);
assert.equal(deco?.decorative, true);

const footerLogo = framer.images.find((image) => image.url.includes('footer-logo.png'));
assert.ok(footerLogo);
assert.equal(footerLogo?.location, 'footer');

assert.equal(framer.images.some((image) => image.url.endsWith('.svg')), false);
assert.equal(framer.images.some((image) => image.url.endsWith('.gif')), false);

const wordpress = analyzePage(
  readFixture('alt-page-wordpress.html'),
  'https://winepassions.com/events/',
);
assert.equal(wordpress.page.lang, 'en');
assert.equal(wordpress.page.h1, 'Wine Tasting Events in Hong Kong');
assert.equal(wordpress.images.length, 3);
const lazyImage = wordpress.images.find((image) => image.url.endsWith('/media/venue.jpg'));
assert.ok(lazyImage);

// ---------------------------------------------------------------------------
// 2) Prompt
// ---------------------------------------------------------------------------
const promptPage: AltPageContext = framer.page;
const promptImage = office01!;
const prompt = buildAltPrompt({
  page: promptPage,
  image: promptImage,
  keyword: '辦公室設計',
  existingAlts: ['淺木色開放式辦公室'],
});
assert.equal(prompt.system.includes('只輸出 JSON'), true);
assert.equal(prompt.user.includes('香港辦公室設計'), true);
assert.equal(prompt.user.includes('辦公室設計'), true);
assert.equal(prompt.user.includes('office 01'), true);

const draft = parseAltModelJson(
  '```json\n{"alt":"淺木色開放式辦公室，設計師在落地窗前討論平面圖","short_alt":"淺木色開放式辦公室","alternatives":["設計師在窗邊討論平面圖"],"rationale":"以材質與動作描述畫面。","confidence":0.86,"risk":"low","decorative":false,"issues":[]}\n```',
);
assert.equal(draft.decorative, false);
assert.equal(draft.alternatives.length, 1);
assert.equal(draft.confidence, 0.86);

const decorativeDraft = normalizeAltDraft({
  alt: '不應保留',
  decorative: true,
  confidence: 2,
});
assert.equal(decorativeDraft.alt, '');
assert.equal(decorativeDraft.short_alt, '');
assert.equal(decorativeDraft.confidence, 1);

assert.throws(() => parseAltModelJson('不是 JSON'), /JSON/);

// ---------------------------------------------------------------------------
// 3) Quality rules
// ---------------------------------------------------------------------------
const good = evaluateAlt({
  alt: '淺木色開放式辦公室，設計師在落地窗前討論平面圖',
  page: promptPage,
  image: promptImage,
  keyword: '辦公室設計',
  existingAlts: [],
});
assert.equal(good.issues.filter((issue) => issue.severity === 'hard').length, 0);
assert.equal(good.risk, 'low');

const empty = evaluateAlt({
  alt: '',
  page: promptPage,
  image: promptImage,
});
assert.equal(empty.issues.some((issue) => issue.id === 'empty' && issue.severity === 'hard'), true);
assert.equal(empty.risk, 'high');

const decorative = evaluateAlt({
  alt: '',
  page: promptPage,
  image: deco!,
  decorative: true,
});
assert.equal(decorative.issues.length, 0);
assert.equal(decorative.risk, 'low');

const duplicate = evaluateAlt({
  alt: '淺木色開放式辦公室，設計師在落地窗前討論平面圖',
  page: promptPage,
  image: promptImage,
  existingAlts: ['淺木色開放式辦公室，設計師在落地窗前討論平面圖'],
});
assert.equal(duplicate.issues.some((issue) => issue.id === 'duplicate'), true);

const stuffing = evaluateAlt({
  alt: '辦公室設計推薦：香港辦公室設計公司',
  page: promptPage,
  image: promptImage,
  keyword: '辦公室設計',
});
assert.equal(stuffing.issues.some((issue) => issue.id === 'keyword_stuffing'), true);

const tooLong = evaluateAlt({
  alt: '辦'.repeat(126),
  page: promptPage,
  image: promptImage,
});
assert.equal(tooLong.issues.some((issue) => issue.id === 'too_long'), true);

const generic = evaluateAlt({
  alt: '圖片：香港辦公室設計',
  page: promptPage,
  image: promptImage,
});
assert.equal(generic.issues.some((issue) => issue.id === 'generic_prefix'), true);

const englishPageChineseAlt = evaluateAlt({
  alt: '專業的葡萄酒品鑑活動，侍酒師為客人倒酒',
  page: wordpress.page,
  image: wordpress.images[0],
});
assert.equal(
  englishPageChineseAlt.issues.some((issue) => issue.id === 'language_mismatch'),
  true,
);

// ---------------------------------------------------------------------------
// 4) Export
// ---------------------------------------------------------------------------
const suggestion: AltSuggestionRow = {
  id: 's1',
  run_id: 'r1',
  image_url: 'https://example.com/a.jpg',
  image_host: 'example.com',
  image_hash: null,
  filename: 'a',
  location: 'main',
  current_alt: '舊',
  context_excerpt: '',
  suggested_alt: '淺木色辦公室，"落地窗"',
  short_alt: '淺木色辦公室',
  alternatives: [],
  rationale: 'r',
  keyword: '辦公室',
  confidence: 0.9,
  risk: 'low',
  issues: [],
  decorative: false,
  provider: 'gemini',
  status: 'approved',
  final_alt: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-11-25T00:00:00.000Z',
  updated_at: '2026-11-25T00:00:00.000Z',
};

const rows = buildAltExportRows({ page_url: 'https://example.com/page' }, [suggestion]);
assert.equal(rows.length, 1);
const csv = toCsv(rows);
assert.equal(csv.startsWith('\uFEFF'), true);
assert.equal(csv.includes('"淺木色辦公室，""落地窗"""'), true);
const json = JSON.parse(toJson({ page_url: 'https://example.com/page' }, rows));
assert.equal(json.items[0].alt, '淺木色辦公室，"落地窗"');
assert.equal(toTsv(rows), 'a\t淺木色辦公室，"落地窗"');

// ---------------------------------------------------------------------------
// 5) URL helpers
// ---------------------------------------------------------------------------
assert.equal(normalizePageUrl('example.com/a#b'), 'https://example.com/a');
assert.equal(
  normalizePageUrl('/about', 'https://www.bwteam.com/'),
  'https://www.bwteam.com/about',
);
assert.throws(() => normalizePageUrl('javascript:alert(1)'), /http/);
assert.equal(hostMatches('blog.example.com', 'example.com'), true);
assert.equal(hostMatches('example.com.evil.com', 'example.com'), false);
assert.equal(hostMatches('www.example.com', 'example.com'), true);

// ---------------------------------------------------------------------------
// 5b) Sitemap parser
// ---------------------------------------------------------------------------
const urlset = parseSitemap(
  '<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>/b</loc></url><url><loc>https://example.com/a</loc></url></urlset>',
  'https://example.com/',
);
assert.equal(urlset.kind, 'urlset');
assert.deepEqual(urlset.urls, ['https://example.com/a', 'https://example.com/b']);

const index = parseSitemap(
  '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap></sitemapindex>',
  'https://example.com/',
);
assert.equal(index.kind, 'sitemapindex');
assert.equal(index.urls.length, 2);

const entities = parseSitemap(
  '<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc></url></urlset>',
  'https://example.com/',
);
assert.equal(entities.urls[0], 'https://example.com/a?x=1&y=2');

const cdata = parseSitemap(
  '<urlset><url><loc><![CDATA[https://example.com/cdata]]></loc></url></urlset>',
  'https://example.com/',
);
assert.equal(cdata.urls[0], 'https://example.com/cdata');
assert.equal(isSitemapUrl('https://example.com/sitemap.xml'), true);
assert.equal(isSitemapUrl('https://example.com/sitemap.xml.gz'), true);
assert.equal(isSitemapUrl('https://example.com/page'), false);

const invalidEntity = parseSitemap(
  '<urlset><url><loc>https://example.com/a&#999999;</loc></url></urlset>',
  'https://example.com/',
);
assert.equal(invalidEntity.urls.length, 1);

// ---------------------------------------------------------------------------
// 5c) Audit summary
// ---------------------------------------------------------------------------
const audit = auditAltImages(framer.images);
assert.equal(audit.imageCount, 6);
assert.equal(audit.missing, 1);
assert.equal(audit.decorative, 2);
assert.equal(audit.duplicates, 0);
assert.equal(audit.currentAlts.length, 4);

const batchCsv = toBatchReportCsv([
  {
    page_url: 'https://example.com/a',
    title: 'A "quoted" page',
    image_count: 3,
    missing: 1,
    duplicates: 0,
    too_long: 0,
    decorative: 1,
  },
]);
assert.equal(batchCsv.startsWith('\uFEFF'), true);
assert.equal(batchCsv.includes('page_url,title,image_count,missing,duplicates,too_long,decorative'), true);
assert.equal(batchCsv.includes('"A ""quoted"" page"'), true);

// ---------------------------------------------------------------------------
// 6) Text helper
// ---------------------------------------------------------------------------
assert.equal(countWords('香港辦公室 design studio'), 7);
assert.equal(countWords('香港辦公室'), 5);

// ---------------------------------------------------------------------------
// 7) SSRF guard helpers
// ---------------------------------------------------------------------------
assert.equal(isPrivateIpv4('127.0.0.1'), true);
assert.equal(isPrivateIpv4('10.0.0.1'), true);
assert.equal(isPrivateIpv4('192.168.1.1'), true);
assert.equal(isPrivateIpv4('8.8.8.8'), false);
assert.throws(() => assertPublicHost('localhost'), /localhost/);
assert.throws(() => assertPublicHost('127.0.0.1'), /內網/);
assert.equal(bytesToBase64(new Uint8Array([104, 105])), 'aGk=');
assert.equal((await sha256Hex(new Uint8Array([104, 105]))).length, 64);

// ---------------------------------------------------------------------------
// 8) Quota: 0 = unlimited
// ---------------------------------------------------------------------------
assert.equal(isAltQuotaExceeded(9999, 0), false);
assert.equal(isAltQuotaExceeded(49, 50), false);
assert.equal(isAltQuotaExceeded(50, 50), true);
assert.equal(formatAltQuota(12, 0), '12');
assert.equal(formatAltQuota(12, 50), '12/50');

// ---------------------------------------------------------------------------
// 9) Delete permission
// ---------------------------------------------------------------------------
assert.equal(canManageAltPilot('management'), true);
assert.equal(canManageAltPilot('super_admin'), true);
assert.equal(canManageAltPilot('system_dev'), true);
assert.equal(canManageAltPilot('designer'), false);
assert.equal(canManageAltPilot(null), false);

// ---------------------------------------------------------------------------
// 10) 實際使用的模型：藥丸取最後一次，下拉依首次出現標 ①②③
// ---------------------------------------------------------------------------
assert.deepEqual([...TEXT_LLM_ORDER], ['grok', 'gemini', 'opencode']);
assert.equal(altModelRankMark(1), '①');
assert.equal(altModelRankMark(2), '②');
assert.equal(altModelRankMark(3), '③');
const ranked = rankUsedAltModels([
  { model: ' grok-4.7 ', createdAt: '2026-11-27T01:00:00.000Z' },
  { model: 'grok-4.7', createdAt: '2026-11-27T01:05:00.000Z' },
  { model: 'deepseek-v4.1-flash', createdAt: '2026-11-27T02:00:00.000Z' },
  { model: '', createdAt: '2026-11-27T03:00:00.000Z' },
]);
assert.equal(ranked.lastModel, 'deepseek-v4.1-flash');
assert.deepEqual(
  ranked.models.map((item) => `${item.model} ${item.mark}`),
  ['grok-4.7 ①', 'deepseek-v4.1-flash ②'],
);
assert.equal(rankUsedAltModels([]).lastModel, null);

const older = { model: 'gemini-2.5-flash', createdAt: '2026-11-01T00:00:00.000Z', runId: 'old' };
const latestGrok = { model: 'grok-4.7', createdAt: '2026-11-27T03:00:00.000Z', runId: 'new' };
const latestDeepseek = { model: 'deepseek-v4.1-flash', createdAt: '2026-11-27T04:00:00.000Z', runId: 'new' };
const recent = [latestDeepseek, latestGrok, older];
assert.deepEqual(
  pickCurrentModelUsage('empty-run', [], recent).map((item) => item.model),
  ['deepseek-v4.1-flash', 'grok-4.7'],
);
assert.deepEqual(
  pickCurrentModelUsage('old', [older], recent).map((item) => item.model),
  ['gemini-2.5-flash'],
);
assert.deepEqual(pickCurrentModelUsage(null, [], []), []);
const backToFirst = rankUsedAltModels([
  { model: 'grok-4.7', createdAt: '2026-11-27T01:00:00.000Z' },
  { model: 'deepseek-v4.1-flash', createdAt: '2026-11-27T02:00:00.000Z' },
  { model: 'grok-4.7', createdAt: '2026-11-27T03:00:00.000Z' },
]);
assert.equal(backToFirst.lastModel, 'grok-4.7');
assert.deepEqual(
  backToFirst.models.map((item) => item.mark),
  ['①', '②'],
);

console.log('alt pilot tests passed');
