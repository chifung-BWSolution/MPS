import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COPY_PLATFORMS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROK_MODEL,
  PLATFORM_ORDER,
  PLATFORM_RULES,
  buildCrosspostPrompt,
  countChars,
  deriveSetTitle,
  evaluateVariant,
  isUuid,
  mergeVariants,
  normalizeHashtags,
  parseCrosspostResponse,
  toMarkdown,
  toPlainText,
  validateBrief,
  variantClipboardText,
  type CopyVariant,
} from '../src/lib/crosspost.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name} :: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================
// 平台規則
// ============================================================

test('平台順序與數量', () => {
  assert.deepEqual([...PLATFORM_ORDER], ['ig', 'fb', 'threads', 'redbook', 'edm']);
  assert.equal(COPY_PLATFORMS.length, 5);
});

test('平台上限與 Hashtag 規則', () => {
  assert.equal(PLATFORM_RULES.ig.bodyLimit, 2200);
  assert.equal(PLATFORM_RULES.fb.bodyLimit, 63206);
  assert.equal(PLATFORM_RULES.threads.bodyLimit, 500);
  assert.equal(PLATFORM_RULES.redbook.bodyLimit, 1000);
  assert.equal(PLATFORM_RULES.redbook.titleLimit, 20);
  assert.equal(PLATFORM_RULES.edm.bodyLimit, 800);
  assert.equal(PLATFORM_RULES.edm.titleLimit, 60);
  assert.equal(PLATFORM_RULES.edm.previewLimit, 140);
  assert.deepEqual([...PLATFORM_RULES.ig.hashtagRecommended], [8, 12]);
  assert.deepEqual([...PLATFORM_RULES.redbook.hashtagRecommended], [8, 10]);
  assert.equal(PLATFORM_RULES.edm.hashtagLimit, 0);
});

test('默認模型常數', () => {
  assert.equal(DEFAULT_GROK_MODEL, 'grok-4.5');
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-2.5-flash');
});

// ============================================================
// 計數 / 驗證
// ============================================================

test('countChars 以 code point 計', () => {
  assert.equal(countChars('abc'), 3);
  assert.equal(countChars('你好'), 2);
  assert.equal(countChars('👍'), 1);
  assert.equal(countChars('👍🏽'), 2);
  assert.equal(countChars(''), 0);
  assert.equal(countChars(null), 0);
  assert.equal(countChars(undefined), 0);
});

test('validateBrief 必填與長度', () => {
  assert.equal(validateBrief({ coreInfo: '', audience: 'a', cta: 'b' }), '請填寫活動／產品核心資訊');
  assert.equal(validateBrief({ coreInfo: 'x', audience: '', cta: 'b' }), '請填寫目標受眾');
  assert.equal(validateBrief({ coreInfo: 'x', audience: 'a', cta: '' }), '請填寫 CTA（行動號召）');
  assert.equal(validateBrief({ coreInfo: 'x', audience: 'a', cta: 'b' }), null);
  assert.match(
    validateBrief({ coreInfo: '字'.repeat(2001), audience: 'a', cta: 'b' }) || '',
    /2,000/,
  );
  assert.match(
    validateBrief({ coreInfo: 'x', audience: 'a'.repeat(201), cta: 'b' }) || '',
    /200/,
  );
  assert.match(
    validateBrief({ coreInfo: 'x', audience: 'a', cta: 'b', extraNotes: 'c'.repeat(1001) }) || '',
    /1,000/,
  );
});

test('deriveSetTitle 首行截 40 字', () => {
  assert.equal(deriveSetTitle('  早鳥優惠\n第二行  '), '早鳥優惠 第二行');
  assert.equal(deriveSetTitle(''), '未命名文案');
  const title = deriveSetTitle('字'.repeat(50));
  assert.equal(Array.from(title).length, 41);
  assert.ok(title.endsWith('…'));
});

test('isUuid', () => {
  assert.equal(isUuid('3b345631-6870-5924-9eb7-347e28a27fa8'), true);
  assert.equal(isUuid('b1'), false);
  assert.equal(isUuid(''), false);
  assert.equal(isUuid(null), false);
});

// ============================================================
// Hashtag
// ============================================================

test('normalizeHashtags：補 #、去重、去空白與內部 #', () => {
  const tags = normalizeHashtags(
    ['#香港', '香港', ' 早鳥優惠 ', '##活動', '#A B', ''],
    'ig',
  );
  assert.deepEqual(tags, ['#香港', '#早鳥優惠', '#活動', '#AB']);
});

test('normalizeHashtags：截斷到平台上限', () => {
  const many = Array.from({ length: 35 }, (_, i) => `#tag${i}`);
  assert.equal(normalizeHashtags(many, 'ig').length, 30);
  assert.equal(normalizeHashtags(many, 'fb').length, 5);
  assert.equal(normalizeHashtags(many, 'redbook').length, 10);
});

test('normalizeHashtags：eDM 一律空', () => {
  assert.deepEqual(normalizeHashtags(['#x', '#y'], 'edm'), []);
});

test('normalizeHashtags：字串輸入可分割', () => {
  assert.deepEqual(normalizeHashtags('#a, #b、#c', 'threads'), ['#a', '#b', '#c']);
});

// ============================================================
// 檢查
// ============================================================

function makeVariant(overrides: Partial<CopyVariant> = {}): CopyVariant {
  return {
    platform: 'ig',
    title: null,
    previewText: null,
    body: '測試正文',
    hashtags: ['#a', '#b'],
    ...overrides,
  };
}

test('evaluateVariant：正文超標', () => {
  const ok = evaluateVariant(makeVariant({ body: 'a'.repeat(2200) }));
  assert.equal(ok.overBody, false);
  assert.equal(ok.charCount, 2200);
  assert.equal(ok.ratio, 1);

  const over = evaluateVariant(makeVariant({ body: 'a'.repeat(2201) }));
  assert.equal(over.overBody, true);
  assert.ok(over.ratio > 1);
});

test('evaluateVariant：小紅書標題與 Hashtag', () => {
  const result = evaluateVariant(
    makeVariant({
      platform: 'redbook',
      title: '字'.repeat(21),
      hashtags: ['#a'],
    }),
  );
  assert.equal(result.overTitle, true);
  assert.equal(result.titleLimit, 20);
  assert.equal(result.underHashtags, true);
  assert.equal(result.hashtagMin, 8);
});

test('evaluateVariant：eDM 預覽超標', () => {
  const result = evaluateVariant(
    makeVariant({
      platform: 'edm',
      title: '主旨',
      previewText: 'p'.repeat(141),
      body: '內文',
      hashtags: [],
    }),
  );
  assert.equal(result.overPreview, true);
  assert.equal(result.previewLimit, 140);
});

// ============================================================
// Prompt
// ============================================================

const SAMPLE_BRIEF = {
  coreInfo: '早鳥優惠：首次體驗價 $1,880，優惠期至 12 月 31 日。',
  audience: '25–40 歲香港在職女性',
  cta: '立即預約並輸入優惠碼 EARLY20',
  brandName: 'BW 志豐企業',
  tone: '專業可信',
  language: 'zh-HK' as const,
  extraNotes: '不可宣稱療效',
};

test('buildCrosspostPrompt 包含五平台規格與硬性規則', () => {
  const prompt = buildCrosspostPrompt(SAMPLE_BRIEF);
  for (const platform of PLATFORM_ORDER) {
    assert.ok(prompt.includes(PLATFORM_RULES[platform].label), `missing ${platform}`);
  }
  assert.ok(prompt.includes('2,200'));
  assert.ok(prompt.includes('63,206'));
  assert.ok(prompt.includes('20 字元'));
  assert.ok(prompt.includes('1,880'));
  assert.ok(prompt.includes('EARLY20'));
  assert.ok(prompt.includes('繁體中文（香港）'));
  assert.ok(prompt.includes('只輸出 JSON'));
  assert.ok(prompt.includes('不可宣稱療效'));
  assert.ok(prompt.includes('title 必須是 null'));
});

test('buildCrosspostPrompt：只輸出指定平台、簡中語言', () => {
  const prompt = buildCrosspostPrompt(
    { ...SAMPLE_BRIEF, language: 'zh-CN' },
    ['ig', 'edm'],
  );
  assert.ok(prompt.includes('简体中文'));
  assert.ok(prompt.includes('IG｜Instagram'));
  assert.ok(prompt.includes('eDM｜eDM'));
  assert.ok(!prompt.includes('FB｜Facebook'));
  assert.ok(!prompt.includes('Threads｜Threads'));
});

// ============================================================
// 解析
// ============================================================

function rawPayload(overrides: Record<string, unknown> = {}) {
  return {
    variants: [
      {
        platform: 'ig',
        title: '這個標題應被忽略',
        previewText: '這個預覽應被忽略',
        body: 'IG 正文',
        hashtags: ['#香港', '香港', '#早鳥'],
      },
      { platform: 'fb', title: '', previewText: '', body: 'FB 正文', hashtags: ['#a', '#b', '#c', '#d'] },
      { platform: 'threads', body: 'Threads 正文', hashtags: ['#t'] },
      {
        platform: 'redbook',
        title: '小紅書標題',
        body: '小紅書正文',
        hashtags: ['#種草', '#香港'],
      },
      {
        platform: 'edm',
        title: 'eDM 主旨',
        previewText: 'eDM 預覽',
        body: 'eDM 內文',
        hashtags: [],
      },
    ],
    ...overrides,
  };
}

test('parseCrosspostResponse：正常五版、欄位按平台收斂', () => {
  const parsed = parseCrosspostResponse(rawPayload());
  assert.equal(parsed.variants.length, 5);
  assert.deepEqual(parsed.missingPlatforms, []);

  const ig = parsed.variants.find((v) => v.platform === 'ig');
  assert.ok(ig);
  assert.equal(ig.title, null);
  assert.equal(ig.previewText, null);
  assert.deepEqual(ig.hashtags, ['#香港', '#早鳥']);

  const edm = parsed.variants.find((v) => v.platform === 'edm');
  assert.ok(edm);
  assert.equal(edm.title, 'eDM 主旨');
  assert.equal(edm.previewText, 'eDM 預覽');
});

test('parseCrosspostResponse：接受圍欄與前後雜訊', () => {
  const raw = `好的，以下是結果：\n\`\`\`json\n${JSON.stringify(rawPayload())}\n\`\`\`\n希望有幫助。`;
  const parsed = parseCrosspostResponse(raw);
  assert.equal(parsed.variants.length, 5);
});

test('parseCrosspostResponse：接受根陣列與平台別名', () => {
  const parsed = parseCrosspostResponse(
    JSON.stringify([
      { platform: 'instagram', body: 'IG', hashtags: [] },
      { platform: 'facebook', body: 'FB', hashtags: [] },
      { platform: 'email', title: '主旨', previewText: '預覽', body: '內文', hashtags: [] },
    ]),
  );
  assert.deepEqual(
    parsed.variants.map((v) => v.platform),
    ['ig', 'fb', 'edm'],
  );
  assert.deepEqual(parsed.missingPlatforms, ['threads', 'redbook']);
});

test('parseCrosspostResponse：未知平台與重複平台被忽略', () => {
  const parsed = parseCrosspostResponse({
    variants: [
      { platform: 'tiktok', body: '不支援', hashtags: [] },
      { platform: 'IG', body: '第一版', hashtags: [] },
      { platform: 'ig', body: '第二版', hashtags: [] },
    ],
  });
  assert.equal(parsed.variants.length, 1);
  assert.equal(parsed.variants[0].body, '第一版');
  assert.equal(parsed.missingPlatforms.length, 4);
});

test('parseCrosspostResponse：空正文視為缺版', () => {
  const parsed = parseCrosspostResponse({
    variants: [{ platform: 'ig', body: '   ', hashtags: [] }],
  });
  assert.equal(parsed.variants.length, 0);
  assert.ok(parsed.missingPlatforms.includes('ig'));
});

test('parseCrosspostResponse：非法 JSON 丟錯', () => {
  assert.throws(() => parseCrosspostResponse('這不是 JSON'), /合法 JSON/);
  assert.throws(() => parseCrosspostResponse(''), /空白/);
});

// ============================================================
// 合併（重試補齊）
// ============================================================

test('mergeVariants：incoming 優先、固定平台順序', () => {
  const merged = mergeVariants(
    [
      makeVariant({ platform: 'fb', body: 'FB v1' }),
      makeVariant({ platform: 'ig', body: 'IG v1' }),
    ],
    [
      makeVariant({ platform: 'threads', body: 'Threads' }),
      makeVariant({ platform: 'ig', body: 'IG v2' }),
    ],
    ['ig', 'fb', 'threads', 'redbook', 'edm'],
  );

  assert.deepEqual(
    merged.map((variant) => variant.platform),
    ['ig', 'fb', 'threads'],
  );
  assert.equal(merged[0].body, 'IG v2');
  assert.equal(merged[1].body, 'FB v1');
});

test('mergeVariants：platforms 以外的版本被丟棄', () => {
  const merged = mergeVariants(
    [makeVariant({ platform: 'ig', body: 'IG' })],
    [makeVariant({ platform: 'redbook', body: '小紅書' })],
    ['ig', 'fb'],
  );
  assert.deepEqual(merged.map((variant) => variant.platform), ['ig']);
});

// ============================================================
// 輸出文字
// ============================================================

const VARIANTS: CopyVariant[] = [
  makeVariant({ platform: 'ig', body: 'IG 正文', hashtags: ['#香港', '#優惠'] }),
  makeVariant({ platform: 'fb', body: 'FB 正文', hashtags: ['#a'] }),
  makeVariant({ platform: 'threads', body: 'Threads 正文', hashtags: [] }),
  makeVariant({ platform: 'redbook', title: '小紅書標題', body: '小紅書正文', hashtags: ['#種草'] }),
  makeVariant({
    platform: 'edm',
    title: 'eDM 主旨',
    previewText: 'eDM 預覽',
    body: 'eDM 內文',
    hashtags: [],
  }),
];

test('variantClipboardText：eDM 三段、小紅書標題', () => {
  const edm = VARIANTS.find((v) => v.platform === 'edm')!;
  const edmText = variantClipboardText(edm);
  assert.ok(edmText.includes('主旨：eDM 主旨'));
  assert.ok(edmText.includes('預覽：eDM 預覽'));
  assert.ok(edmText.includes('eDM 內文'));

  const redbook = VARIANTS.find((v) => v.platform === 'redbook')!;
  assert.ok(variantClipboardText(redbook).startsWith('小紅書標題'));
});

test('toPlainText 五段齊全', () => {
  const text = toPlainText(VARIANTS);
  for (const label of ['【IG】', '【FB】', '【Threads】', '【小紅書】', '【eDM】']) {
    assert.ok(text.includes(label), `missing ${label}`);
  }
});

test('toMarkdown 含標題、五個平台與 Hashtag', () => {
  const markdown = toMarkdown({
    brief: SAMPLE_BRIEF,
    variants: VARIANTS,
    provider: 'grok',
    model: 'grok-4.5',
    createdAt: '2026-11-25 18:00',
  });
  assert.ok(markdown.startsWith('# 早鳥優惠'));
  for (const heading of ['## IG', '## FB', '## Threads', '## 小紅書', '## eDM']) {
    assert.ok(markdown.includes(heading), `missing ${heading}`);
  }
  assert.ok(markdown.includes('#香港'));
  assert.ok(markdown.includes('grok（grok-4.5）'));
});

// ============================================================
// Migration / Rollback（靜態檢查）
// ============================================================

test('migration 只新增 crosspost 兩表並帶 RLS／grant', () => {
  const rel = 'supabase/migrations/20261125120000_create_crosspost_copy.sql';
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
  const sql = read(rel);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.crosspost_sets/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.crosspost_variants/);
  assert.match(sql, /ALTER TABLE public\.crosspost_sets ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.crosspost_variants ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.crosspost_sets TO authenticated/);
  assert.match(sql, /REVOKE ALL ON public\.crosspost_sets FROM anon/);
  assert.match(sql, /REFERENCES public\.brand_list\(id\) ON DELETE SET NULL/);
  assert.match(sql, /REFERENCES public\.users\(id\) ON DELETE SET NULL/);
  assert.match(sql, /REFERENCES public\.crosspost_sets\(id\) ON DELETE CASCADE/);

  assert.doesNotMatch(sql, /ALTER TABLE public\.(?!crosspost_)/);
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
  assert.doesNotMatch(sql, /DELETE FROM/i);
  assert.doesNotMatch(sql, /cron\.schedule/i);
});

test('rollback 只刪 crosspost 兩表', () => {
  const rel = 'scripts/rollback-crosspost-copy.sql';
  assert.ok(existsSync(join(root, rel)), `missing ${rel}`);
  const sql = read(rel);
  assert.match(sql, /DROP TABLE IF EXISTS public\.crosspost_variants;/);
  assert.match(sql, /DROP TABLE IF EXISTS public\.crosspost_sets;/);
  assert.doesNotMatch(sql, /DROP TABLE IF EXISTS public\.(?!crosspost_)/);
});

// ============================================================
// 結果
// ============================================================

if (failures.length > 0) {
  console.error(`crosspost lib tests: ${failures.length} failed, ${passed} passed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`crosspost lib tests: ${passed} passed`);
