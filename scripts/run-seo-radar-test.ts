/**
 * SEO 雷達 · 純函式與接線自測
 *
 * 用法：node scripts/run-seo-radar-test.ts（或 npm run radar:test）
 * 不引入測試框架，與 scripts/run-seo-keywords-page-test.ts 同一風格。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateGscRows,
  buildSuggestIdeas,
  buildSuggestSeeds,
  clampLimit,
  cleanSeedPhrase,
  isUsableKeywordPhrase,
  mergeScanResults,
  normalizeKeywordPhrase,
  parseSuggestPayload,
  radarWindowStart,
  scoreGscIdea,
  scoreSuggestIdea,
  selectGscIdeas,
  SuggestFormatError,
  type RadarIdeaDraft,
} from '../src/lib/seoRadar.ts';
import {
  MARKET_OPTIONS,
  detectMarket,
  isRadarMarketCode,
} from '../src/lib/seoRadarMarket.ts';

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

// ============================================================
// 1. 市場判定
// ============================================================
console.log('\n市場判定');

check('香港 .com.hk → zh-HK', () => {
  const market = detectMarket('https://www.bwdesign.com.hk/');
  assert.equal(market.code, 'hk');
  assert.equal(market.hl, 'zh-HK');
  assert.equal(market.gl, 'hk');
});

check('台灣 .tw → zh-TW', () => {
  const market = detectMarket('shop.example.com.tw');
  assert.equal(market.code, 'tw');
  assert.equal(market.hl, 'zh-TW');
});

check('新加坡 .com.sg → en-SG', () => {
  assert.equal(detectMarket('https://brand.com.sg/path?x=1').code, 'sg');
});

check('馬來西亞 .my 與美國 .us', () => {
  assert.equal(detectMarket('https://example.my').code, 'my');
  assert.equal(detectMarket('https://example.us').code, 'us');
});

check('泛用域名／空值／帶 port 一律回香港', () => {
  assert.equal(detectMarket('https://example.com:8443/x').code, 'hk');
  assert.equal(detectMarket('example.io').code, 'hk');
  assert.equal(detectMarket(null).code, 'hk');
  assert.equal(detectMarket('').code, 'hk');
});

check('大寫域名也認得', () => {
  assert.equal(detectMarket('WWW.EXAMPLE.COM.HK').code, 'hk');
});

check('MARKET_OPTIONS 與 isRadarMarketCode 一致', () => {
  assert.equal(MARKET_OPTIONS.length, 5);
  for (const market of MARKET_OPTIONS) {
    assert.ok(isRadarMarketCode(market.code));
  }
  assert.equal(isRadarMarketCode('jp'), false);
  assert.equal(isRadarMarketCode(123), false);
});

// ============================================================
// 2. 字串正規化
// ============================================================
console.log('\n字串正規化');

check('多空白／大小寫／全形空白', () => {
  assert.equal(normalizeKeywordPhrase('  Office   Design '), 'office design');
  assert.equal(normalizeKeywordPhrase('網頁\u3000設計'), '網頁 設計');
  assert.equal(normalizeKeywordPhrase('ＡＢＣ 設計'), 'abc 設計');
  assert.equal(normalizeKeywordPhrase(null), '');
});

check('可用關鍵字長度邊界 2–80', () => {
  assert.equal(isUsableKeywordPhrase('a'), false);
  assert.equal(isUsableKeywordPhrase('ab'), true);
  assert.equal(isUsableKeywordPhrase('a'.repeat(80)), true);
  assert.equal(isUsableKeywordPhrase('a'.repeat(81)), false);
  assert.equal(isUsableKeywordPhrase('  '), false);
  assert.equal(isUsableKeywordPhrase('！！？'), false);
});

console.log('\nGSC 聚合');

check('同詞合併：曝光加總、曝光加權排名、顯示詞取最近日期', () => {
  const rows = aggregateGscRows([
    { query: 'office design', impressions: 3, clicks: 1, position: 8, metric_date: '2026-09-01' },
    { query: 'Office Design', impressions: 2, clicks: 0, position: 6, metric_date: '2026-09-02' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].impressions, 5);
  assert.equal(rows[0].clicks, 1);
  assert.equal(rows[0].avg_position, 7.2);
  assert.equal(rows[0].ctr, 0.2);
  assert.equal(rows[0].display, 'Office Design');
});

check('曝光 0 的詞不影響平均排名', () => {
  const rows = aggregateGscRows([
    { query: 'seo hk', impressions: 10, clicks: 2, position: 5, metric_date: '2026-09-01' },
    { query: 'seo hk', impressions: 0, clicks: 0, position: 90, metric_date: '2026-09-02' },
  ]);
  assert.equal(rows[0].avg_position, 5);
});

check('零曝光＋不可用詞會被 selectGscIdeas 剔除', () => {
  const ideas = selectGscIdeas([
    { query: 'zero', impressions: 0, clicks: 0, position: 5 },
    { query: 'a', impressions: 100, clicks: 1, position: 3 },
    { query: 'ok word', impressions: 10, clicks: 0, position: 9 },
  ]);
  assert.deepEqual(ideas.map((idea) => idea.keyword), ['ok word']);
  assert.equal(ideas[0].source, 'gsc');
});

check('排序：曝光 → 點擊 → 排名；並受 budget 限制', () => {
  const ideas = selectGscIdeas(
    [
      { query: 'low', impressions: 10, clicks: 0, position: 3 },
      { query: 'same volume more clicks', impressions: 50, clicks: 9, position: 12 },
      { query: 'same volume fewer clicks', impressions: 50, clicks: 1, position: 2 },
      { query: 'top', impressions: 900, clicks: 1, position: 30 },
    ],
    3,
  );
  assert.deepEqual(ideas.map((idea) => idea.keyword), [
    'top',
    'same volume more clicks',
    'same volume fewer clicks',
  ]);
  assert.equal(selectGscIdeas([{ query: 'zz', impressions: 1 }], 0).length, 0);
});

// ============================================================
// 4. 建議詞種子
// ============================================================
console.log('\n建議詞種子');

check('站名／品牌去尾、順序為 GSC 前 5 → 站名 → 品牌', () => {
  const seeds = buildSuggestSeeds({
    gscTop: ['kw one', 'kw two', 'kw three', 'kw four', 'kw five', 'kw six', 'kw seven'],
    websiteName: 'BW Design Centre | 網頁設計公司',
    brand: 'BW',
  });
  assert.deepEqual(seeds, [
    'kw one',
    'kw two',
    'kw three',
    'kw four',
    'kw five',
    'BW Design Centre',
    'BW',
    'kw six',
  ]);
});

check('去重、排除單字元、最多 8 個', () => {
  const seeds = buildSuggestSeeds({
    gscTop: ['dup', 'dup', 'a', 'keep me'],
    websiteName: 'dup',
    brand: null,
  });
  assert.deepEqual(seeds, ['dup', 'keep me']);
  assert.ok(seeds.length <= 8);
});

check('cleanSeedPhrase 只切常見分隔符', () => {
  assert.equal(cleanSeedPhrase('Foo - Bar'), 'Foo');
  assert.equal(cleanSeedPhrase('Foo｜Bar'), 'Foo');
  assert.equal(cleanSeedPhrase('  Foo  Bar  '), 'Foo Bar');
  assert.equal(cleanSeedPhrase(null), '');
});

// ============================================================
// 5. 建議詞回應解析
// ============================================================
console.log('\n建議詞回應解析');

check('firefox 格式與舊格式', () => {
  assert.deepEqual(parseSuggestPayload(['q', ['a thing', 'b thing']]), ['a thing', 'b thing']);
  assert.deepEqual(parseSuggestPayload(['q', [['a thing', 0], ['b thing', 0]]]), [
    'a thing',
    'b thing',
  ]);
});

check('空建議清單是合法回應', () => {
  assert.deepEqual(parseSuggestPayload(['q', []]), []);
});

check('非陣列／長度不足／第二項非陣列 → SuggestFormatError', () => {
  assert.throws(() => parseSuggestPayload('nope'), SuggestFormatError);
  assert.throws(() => parseSuggestPayload(['q']), SuggestFormatError);
  assert.throws(() => parseSuggestPayload(['q', 'nope']), SuggestFormatError);
  assert.throws(() => parseSuggestPayload(null), SuggestFormatError);
});

check('建議詞轉候選：來源 suggest、曝光 0、種子曝光給基準分', () => {
  const seedImpressions = new Map([['kw one', 1000]]);
  const ideas = buildSuggestIdeas({
    suggestions: [
      { seed: 'kw one', keyword: 'kw one 推薦' },
      { seed: 'kw one', keyword: 'kw one 推薦' },
      { seed: 'kw two', keyword: 'kw two 推薦' },
    ],
    seedImpressions,
  });
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].source, 'suggest');
  assert.equal(ideas[0].impressions, 0);
  assert.equal(ideas[0].seed_keyword, 'kw one');
  assert.equal(ideas[0].score, 355);
  assert.equal(ideas[1].score, 5);
});

// ============================================================
// 6. 評分
// ============================================================
console.log('\n評分');

check('曝光／點擊單調遞增、排名前 10 有加成', () => {
  const base = scoreGscIdea({ impressions: 100, clicks: 0, avg_position: 30 });
  const moreClicks = scoreGscIdea({ impressions: 100, clicks: 4, avg_position: 30 });
  const betterRank = scoreGscIdea({ impressions: 100, clicks: 0, avg_position: 8 });
  assert.ok(moreClicks > base);
  assert.ok(betterRank > base);
  assert.equal(betterRank - base, 25);
});

check('同曝光下 GSC 詞分數高於建議詞', () => {
  const gsc = scoreGscIdea({ impressions: 1000, clicks: 0, avg_position: 40 });
  const suggest = scoreSuggestIdea(1000);
  assert.ok(gsc > suggest);
  assert.equal(scoreSuggestIdea(0), 5);
});

// ============================================================
// 7. 合併與上限
// ============================================================
console.log('\n合併與上限');

function draft(keyword: string, source: 'gsc' | 'suggest', score: number): RadarIdeaDraft {
  return {
    keyword,
    normalized_keyword: normalizeKeywordPhrase(keyword),
    source,
    impressions: source === 'gsc' ? score : 0,
    clicks: 0,
    ctr: null,
    avg_position: null,
    seed_keyword: source === 'gsc' ? null : 'seed',
    score,
  };
}

check('GSC 優先、建議詞去重補位、總數 ≤ 100', () => {
  const gscIdeas = Array.from({ length: 60 }, (_, index) => draft(`gsc phrase ${index}`, 'gsc', 1000 - index));
  const suggestIdeas = Array.from({ length: 50 }, (_, index) => draft(`suggest phrase ${index}`, 'suggest', 10));
  // 前 10 個建議詞與 GSC 詞撞名
  for (let index = 0; index < 10; index += 1) {
    suggestIdeas[index] = draft(`gsc phrase ${index}`, 'suggest', 10);
  }

  const merged = mergeScanResults({ gscIdeas, suggestIdeas });
  assert.equal(merged.length, 100);
  assert.equal(merged[0].source, 'gsc');
  assert.equal(merged.filter((idea) => idea.source === 'suggest').length, 40);
  assert.equal(new Set(merged.map((idea) => idea.normalized_keyword)).size, 100);
});

check('limit 會被收斂到 10–300', () => {
  assert.equal(clampLimit(undefined), 100);
  assert.equal(clampLimit(5), 10);
  assert.equal(clampLimit(999), 300);
  assert.equal(clampLimit('abc'), 100);
  assert.equal(clampLimit(0), 100);

  const merged = mergeScanResults({
    gscIdeas: Array.from({ length: 20 }, (_, index) => draft(`p ${index}`, 'gsc', 20 - index)),
    suggestIdeas: [],
    limit: 3,
  });
  assert.equal(merged.length, 10);
});

check('回看窗口為 28 天（含今天）', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  assert.equal(radarWindowStart(28, now), '2026-10-29');
  assert.equal(radarWindowStart(1, now), '2026-11-25');
});

// ============================================================
// 8. 接線契約（防止有人把功能接錯位置／改壞安全規則）
// ============================================================
console.log('\n接線契約');

const appContext = readFileSync(join(root, 'src/context/AppContext.tsx'), 'utf8');
const toolsCenter = readFileSync(
  join(root, 'src/components/tools-center/ToolsCenterModule.tsx'),
  'utf8',
);
const functionSource = readFileSync(join(root, 'supabase/functions/seo-radar/index.ts'), 'utf8');
const migrationSql = readFileSync(
  join(root, 'supabase/migrations/20261127090000_seo_radar.sql'),
  'utf8',
);
const cronSql = readFileSync(
  join(root, 'supabase/migrations/20261127091000_seo_radar_daily_cron.sql'),
  'utf8',
);

check('菜單：seo-radar 在 ai-keyword 之前、readdy-framer 之後', () => {
  const radar = appContext.indexOf("id: 'seo-radar'");
  const keyword = appContext.indexOf("id: 'ai-keyword'");
  const readdy = appContext.indexOf("id: 'readdy-framer'");
  assert.ok(radar > 0, '找不到 seo-radar 菜單項');
  assert.ok(readdy < radar, 'seo-radar 應在 readdy-framer 之後');
  assert.ok(radar < keyword, 'seo-radar 應在 ai-keyword 之前');
});

check('ToolsCenterModule 有 seo-radar 早退分支', () => {
  assert.match(toolsCenter, /subModule === 'seo-radar'[\s\S]{0,120}<SeoRadarTool \/>/);
});

check('函數入口：write 權限檢查 + cron 只限 service_role', () => {
  assert.match(functionSource, /requireAction\(actor, "write"\)/);
  assert.match(functionSource, /requireServiceRole\(req\)/);
});

check('H2：backlog 更新帶 pipeline_status 條件', () => {
  assert.match(functionSource, /pipeline_status\.is\.null/);
  assert.match(functionSource, /pipeline_status\.eq\.backlog/);
});

check('migration 只新增：兩張表 + RLS，且不含破壞性語句', () => {
  // 註解會提到「不寫 delete / truncate」，審查只看實際 SQL
  const sql = migrationSql.replace(/--[^\n]*/g, '');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.seo_keyword_ideas/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.seo_radar_runs/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /alter\s+table\s+public\.seo_keywords/i);
  assert.doesNotMatch(
    sql,
    /\bdrop\s+(table|column|policy)\b|\btruncate\b|\bdelete\s+from\b|\balter\s+column\b[\s\S]{0,40}\btype\b|cron\.unschedule/i,
  );
});

check('cron：job 名與 URL 斷言存在，且不 unschedule 既有 job', () => {
  assert.match(cronSql, /seo-radar-daily/);
  assert.match(cronSql, /IF new_cmd NOT LIKE '%\/functions\/v1\/seo-radar%'/);
  assert.doesNotMatch(cronSql, /cron\.unschedule/i);
});

const hookSource = readFileSync(join(root, 'src/hooks/useSeoRadar.ts'), 'utf8');

/** 從 migration 抽出某張表的欄位名（只看 2 空格縮排的欄位定義行，跳過 UNIQUE/CHECK/REFERENCES 續行） */
function tableColumns(table: string): Set<string> {
  const pattern = new RegExp(
    `CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
  );
  const match = pattern.exec(migrationSql);
  assert.ok(match, `migration 找不到 ${table} 的建表語句`);
  const columns = new Set<string>();
  for (const line of match![1].split('\n')) {
    const column = /^ {2}([a-z][a-z0-9_]*)\s+(uuid|text|integer|numeric|timestamptz|jsonb|boolean|date)\b/.exec(line);
    if (column) columns.add(column[1]);
  }
  return columns;
}

/** 抽出 hook 裡的 'a,b,c' 欄位清單常數 */
function stringListConst(source: string, name: string): string[] {
  const match = new RegExp(`const ${name} =\\s*\\n?\\s*'([^']+)';`).exec(source);
  assert.ok(match, `找不到 ${name}`);
  return match![1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 抽出 persistIdeas 的 upsert payload 鍵名 */
function ideaPayloadKeys(source: string): string[] {
  const match = /const payload = ideas\.map\(\(idea\) => \(\{([\s\S]*?)\}\)\);/.exec(source);
  assert.ok(match, '找不到 persistIdeas 的 payload');
  return [...match![1].matchAll(/^ {4}([a-z_]+):/gm)].map((item) => item[1]);
}

console.log('\nDB 契約（前端欄位 ↔ migration ↔ 寫庫 payload）');

check('IDEA_COLUMNS 全部存在於 seo_keyword_ideas', () => {
  const columns = tableColumns('seo_keyword_ideas');
  const wanted = stringListConst(hookSource, 'IDEA_COLUMNS');
  assert.ok(wanted.length >= 15, `IDEA_COLUMNS 只解析到 ${wanted.length} 個`);
  for (const column of wanted) {
    assert.ok(columns.has(column), `seo_keyword_ideas 缺欄位 ${column}`);
  }
});

check('RUN_COLUMNS 全部存在於 seo_radar_runs', () => {
  const columns = tableColumns('seo_radar_runs');
  const wanted = stringListConst(hookSource, 'RUN_COLUMNS');
  assert.ok(wanted.length >= 10, `RUN_COLUMNS 只解析到 ${wanted.length} 個`);
  for (const column of wanted) {
    assert.ok(columns.has(column), `seo_radar_runs 缺欄位 ${column}`);
  }
});

check('寫庫 payload 不含不存在的欄位，且不得帶 status', () => {
  const columns = tableColumns('seo_keyword_ideas');
  const keys = ideaPayloadKeys(functionSource);
  assert.ok(keys.length >= 12, `payload 只解析到 ${keys.length} 個鍵`);
  for (const key of keys) {
    assert.ok(columns.has(key), `payload 寫了 migration 沒有的欄位：${key}`);
  }
  // 安全不變量：payload 帶 status 會把既有 adopted / ignored 覆蓋回 new
  assert.equal(keys.includes('status'), false, 'payload 不可包含 status');
});

console.log('\nBug 修正回歸');

check('cron 候選站點包含只有 webandsystem_list.gsc_site_url 的站點', () => {
  assert.match(functionSource, /Boolean\(\(site\.gsc_site_url \?\? ""\)\.trim\(\)\)/);
});

check('ignore 會限定站點，且前端有帶 website_profile_id', () => {
  assert.match(
    functionSource,
    /async function handleIgnore[\s\S]{0,900}eq\("website_profile_id", siteId\)/,
  );
  assert.match(hookSource, /action: 'ignore'[\s\S]{0,160}website_profile_id: siteId/);
});

check('候選詞頁碼在篩選後會回夾，不會停在空頁', () => {
  const tableSource = readFileSync(
    join(root, 'src/components/tools-center/seo-radar/SeoRadarTable.tsx'),
    'utf8',
  );
  assert.match(tableSource, /setPage\(\(value\) => Math\.min\(Math\.max\(1, value\), totalPages\)\)/);
});

check('「來源」欄可排序（表頭帶排序按鈕與箭頭）', () => {
  const tableSource = readFileSync(
    join(root, 'src/components/tools-center/seo-radar/SeoRadarTable.tsx'),
    'utf8',
  );
  // 表頭必須走 header() 產生（才會帶排序 icon），不能是純文字 <th>
  assert.match(tableSource, /header\('source', '來源'\)/);
  // 排序鍵要能取到來源值
  assert.match(tableSource, /case 'source':\s*\n\s*return idea\.source;/);
  assert.doesNotMatch(tableSource, /<th[^>]*>\s*來源\s*<\/th>/);
});

console.log(`\nSEO 雷達自測：${passed} 項全部通過\n`);
