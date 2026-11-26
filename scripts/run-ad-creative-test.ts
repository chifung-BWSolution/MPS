/**
 * AI文案工坊 · 文案多角度轉寫與 A/B 文案矩陣 · 純函式自測
 * 執行：node scripts/run-ad-creative-test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AD_ANGLES,
  AD_CSV_HEADERS,
  AD_PLATFORM_RULES,
  AdCreativeParseError,
  adCopyKey,
  applyAdCopyOverrides,
  buildAdCopyAllText,
  buildAdCsvRows,
  buildAdCreativePrompt,
  buildAdMatrixTsv,
  buildCsvFilename,
  buildVariantText,
  clampAdLimits,
  countChars,
  createDefaultAdBrief,
  fitText,
  limitsForPlatform,
  normalizeAdBrief,
  parseAdCreativeResponse,
  resolveAngleSelection,
  safeFilenamePart,
  toCsv,
  validateAdBrief,
  type AdAngleId,
  type AdCreativeResult,
} from '../src/lib/adCreative.ts';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const BASE_BRIEF = normalizeAdBrief({
  productName: '手工低糖月餅',
  sellingPoints: '低糖配方\n手工烘焙\n獨立包裝',
  offer: '9 月 20 日前訂購享 85 折',
  audience: '25–45 歲香港在職女性',
  goal: 'conversion',
  platform: 'meta',
  tone: 'professional',
  angleIds: ['pain', 'time', 'offer', 'proof'],
  limits: { headline: 40, body: 125, cta: 12 },
  variation: 0,
});

function rawAngle(id: AdAngleId, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label: AD_ANGLES[id].label,
    why: `用${AD_ANGLES[id].label}打動需要這個產品的人。`,
    testVariable: '開頭鉤子：痛點問句（A） vs 結果描述（B）',
    variants: {
      A: {
        hookType: '痛點問句',
        headline: '送禮怕太甜？',
        body: '低糖配方，手工烘焙，獨立包裝。送禮自用都安心。',
        cta: '查看低糖禮盒',
      },
      B: {
        hookType: '結果描述',
        headline: '少糖配方，送禮更安心',
        body: '低糖配方，手工烘焙，獨立包裝。送禮自用都安心。',
        cta: '查看低糖禮盒',
      },
    },
    ctaVariants: ['查看低糖禮盒', '立即訂購', '輸入優惠碼'],
    ...overrides,
  };
}

function rawPayload(brief = BASE_BRIEF, overrides: Record<string, unknown> = {}) {
  return {
    angles: brief.angleIds.map((id) => rawAngle(id)),
    provider: 'grok',
    model: 'grok-4.5',
    latencyMs: 12345,
    generatedAt: '2026-11-26T08:00:00.000Z',
    ...overrides,
  };
}

function parse(raw: unknown, brief = BASE_BRIEF) {
  return parseAdCreativeResponse(raw, { brief });
}

// 1. 預設值
const defaults = createDefaultAdBrief('meta');
assert.equal(defaults.platform, 'meta');
assert.equal(defaults.goal, 'conversion');
assert.equal(defaults.tone, 'professional');
assert.deepEqual(defaults.limits, { headline: 40, body: 125, cta: 12 });
assert.equal(defaults.angleIds.length, 4);
assert.ok(!defaults.angleIds.includes('offer'), 'default brief has no offer, so offer angle must be absent');
assert.ok(defaults.angleIds.includes('pain'));
assert.ok(defaults.angleIds.includes('time'));

// 2. 平台限制
assert.deepEqual(limitsForPlatform('google'), { headline: 30, body: 90, cta: 12 });
assert.deepEqual(limitsForPlatform('redbook'), { headline: 20, body: 1000, cta: 12 });
assert.deepEqual(clampAdLimits({ headline: 999, body: 1, cta: 999 }, 'meta'), {
  headline: 80,
  body: 40,
  cta: 30,
});

// 3. 切角選擇
assert.deepEqual(resolveAngleSelection([], false), ['pain', 'time', 'proof', 'social']);
assert.deepEqual(resolveAngleSelection(['pain', 'time'], false), ['pain', 'time', 'proof']);
assert.deepEqual(resolveAngleSelection(['offer'], true), ['offer', 'pain', 'time']);
assert.equal(resolveAngleSelection(['pain', 'time', 'offer', 'proof', 'social', 'contrast'], true).length, 5);
assert.ok(!resolveAngleSelection(['offer'], false).includes('offer'));

// 4. normalize：沒有 offer 時移除 offer 並補到 3 個
const noOffer = normalizeAdBrief({
  productName: 'A',
  sellingPoints: 'B',
  offer: '',
  angleIds: ['offer'],
});
assert.ok(!noOffer.angleIds.includes('offer'));
assert.ok(noOffer.angleIds.length >= 3);

// 5. 驗證
const emptyIssues = validateAdBrief(normalizeAdBrief({}));
assert.ok(emptyIssues.some((issue) => issue.field === 'productName' && issue.code === 'required'));
assert.ok(emptyIssues.some((issue) => issue.field === 'sellingPoints' && issue.code === 'required'));

const longName = normalizeAdBrief({
  productName: '字'.repeat(81),
  sellingPoints: '賣點',
});
assert.ok(validateAdBrief(longName).some((issue) => issue.field === 'productName' && issue.code === 'too_long'));

const badLimits = normalizeAdBrief({
  productName: 'A',
  sellingPoints: 'B',
  limits: { headline: 1, body: 1, cta: 1 },
});
assert.deepEqual(badLimits.limits, { headline: 8, body: 40, cta: 4 });

const offerAngleWithoutOffer = {
  ...BASE_BRIEF,
  offer: '',
  angleIds: ['pain', 'time', 'offer'] as AdAngleId[],
};
assert.ok(
  validateAdBrief(offerAngleWithoutOffer).some((issue) => issue.code === 'offer_without_offer'),
);

// 6. Prompt：有 offer
const prompt = buildAdCreativePrompt(BASE_BRIEF);
for (const token of [
  '手工低糖月餅',
  '低糖配方',
  '9 月 20 日前訂購享 85 折',
  '標題 ≤ 40',
  '主文 ≤ 125',
  '痛點切入（pain）',
  '限時優惠（offer）',
  '繁體中文（香港）',
  '不要 hashtag',
  '只輸出',
]) {
  assert.ok(prompt.includes(token), `prompt missing ${token}`);
}
assert.ok(!prompt.includes('undefined'), 'prompt must not contain undefined');
assert.ok(prompt.includes('## 輸出 JSON 格式'));

// 7. Prompt：沒有 offer
const noOfferPrompt = buildAdCreativePrompt(
  normalizeAdBrief({
    productName: '手工低糖月餅',
    sellingPoints: '低糖配方',
    angleIds: ['pain', 'time', 'proof'],
  }),
);
assert.ok(noOfferPrompt.includes('未提供；不得提及任何優惠'));
assert.ok(!noOfferPrompt.includes('限時優惠（offer）'));

// 8. Prompt：retry 與 variation
const jsonRetry = buildAdCreativePrompt(BASE_BRIEF, { retry: 'json' });
assert.ok(jsonRetry.includes('不是合法 JSON'));
const angleRetry = buildAdCreativePrompt(BASE_BRIEF, {
  retry: 'angles',
  missingAngleIds: ['proof'],
});
assert.ok(angleRetry.includes('專業背書（proof）'));
const truncatedRetry = buildAdCreativePrompt(BASE_BRIEF, { retry: 'truncated' });
assert.ok(truncatedRetry.includes('被截斷'));
const varied = buildAdCreativePrompt({ ...BASE_BRIEF, variation: 1 });
assert.ok(varied.includes('第 2 次生成'));

// 9. 正常解析
const parsed = parse(rawPayload());
assert.equal(parsed.angles.length, 4);
assert.equal(parsed.provider, 'grok');
assert.equal(parsed.model, 'grok-4.5');
assert.equal(parsed.latencyMs, 12345);
assert.equal(parsed.generatedAt, '2026-11-26T08:00:00.000Z');
assert.equal(parsed.warnings.length, 0);
for (const angle of parsed.angles) {
  assert.equal(angle.variants.A.headline, '送禮怕太甜？');
  assert.equal(angle.variants.B.headline, '少糖配方，送禮更安心');
  assert.equal(angle.ctaVariants.length, 3);
  assert.equal(angle.ctaPadded, false);
  assert.deepEqual(angle.truncatedFields, []);
}

// 10. 圍欄與前後雜訊
const fenced = parse('以下是文案：\n```json\n' + JSON.stringify(rawPayload()) + '\n```\n請查收。');
assert.equal(fenced.angles.length, 4);

// 11. 中文 label 對映
const labelPayload = {
  angles: ['pain', 'time', 'proof'].map((id) => {
    const angle = rawAngle(id as AdAngleId);
    return { ...angle, id: undefined, label: AD_ANGLES[id as AdAngleId].label };
  }),
};
const labelBrief = normalizeAdBrief({
  productName: 'A',
  sellingPoints: 'B',
  angleIds: ['pain', 'time', 'proof'],
});
const labelParsed = parse(labelPayload, labelBrief);
assert.deepEqual(
  labelParsed.angles.map((angle) => angle.id),
  ['pain', 'time', 'proof'],
);

// 12. 少於 3 個切角 → 丟錯
const twoAngles = {
  ...rawPayload(),
  angles: rawPayload().angles.slice(0, 2),
};
assert.throws(
  () => parse(twoAngles),
  (error: unknown) => error instanceof AdCreativeParseError && error.code === 'angles_insufficient',
);

// 13. 缺 B 版 → 丟該切角；丟到少於 3 個 → 丟錯
const missingB = {
  ...rawPayload(),
  angles: rawPayload().angles.map((angle, index) =>
    index < 2 ? { ...angle, variants: { A: angle.variants.A } } : angle,
  ),
};
assert.throws(
  () => parse(missingB),
  (error: unknown) => error instanceof AdCreativeParseError && error.code === 'angles_insufficient',
);

// 14. 重複切角 → 去重
const duplicate = {
  ...rawPayload(),
  angles: [rawPayload().angles[0], rawPayload().angles[0], ...rawPayload().angles.slice(1)],
};
assert.equal(parse(duplicate).angles.length, 4);
assert.equal(new Set(parse(duplicate).angles.map((angle) => angle.id)).size, 4);

// 15. 多回未指定切角 → 忽略＋warning
const extraAngle = {
  ...rawPayload(),
  angles: [...rawPayload().angles, rawAngle('contrast')],
};
const extraParsed = parse(extraAngle);
assert.ok(extraParsed.warnings.some((warning) => warning.includes('多回了未指定')));
assert.ok(!extraParsed.angles.some((angle) => angle.id === 'contrast'));

// 16. fitText
const longBody = fitText('這是一段很長的中文文案。'.repeat(10), 40);
assert.ok(longBody.truncated);
assert.ok(countChars(longBody.text) <= 40);
assert.ok(longBody.text.endsWith('…'));

const emoji = fitText('😀'.repeat(10), 5);
assert.ok(countChars(emoji.text) <= 5);

const singleLine = fitText('第一行\n第二行', 20, { singleLine: true });
assert.ok(!singleLine.text.includes('\n'));

const urlText = '詳情：https://example.com/very/long/path?x=1 立即查看';
const urlFit = fitText(urlText, 30);
assert.ok(countChars(urlFit.text) <= 30);
assert.ok(!urlFit.text.includes('https://exa…'), 'URL must not be cut in the middle');

// 17. CTA 不足 → 補齊＋warning
const shortCta = {
  ...rawPayload(),
  angles: rawPayload().angles.map((angle) => ({ ...angle, ctaVariants: ['立即訂購'] })),
};
const shortCtaParsed = parse(shortCta);
assert.equal(shortCtaParsed.angles[0].ctaVariants.length, 3);
assert.equal(shortCtaParsed.angles[0].ctaPadded, true);
assert.ok(shortCtaParsed.warnings.some((warning) => warning.includes('補上通用選項')));

// 18. warnings：未核實數字／絕對化／A-B 同標題／主文差異
const warningAngles = rawPayload().angles.map((angle, index) => {
  if (index !== 0) return angle;
  return {
    ...angle,
    variants: {
      A: {
        ...angle.variants.A,
        headline: '全港第一低糖月餅',
        body: '99% 客人回頭，全港第一。低糖配方，手工烘焙，獨立包裝，送禮自用都安心。',
      },
      B: {
        ...angle.variants.B,
        headline: '全港第一低糖月餅',
        body: '完全不同的一段主文，講另一個故事，與 A 版幾乎沒有共同字句。這樣測試就不夠單一，也很難判斷成效，應該只改開頭一句。',
      },
    },
  };
});
const warningParsed = parse({ ...rawPayload(), angles: warningAngles });
assert.ok(warningParsed.warnings.some((warning) => warning.includes('99%')));
assert.ok(warningParsed.warnings.some((warning) => warning.includes('全港第一')));
assert.ok(warningParsed.warnings.some((warning) => warning.includes('A/B 標題相同')));
assert.ok(warningParsed.warnings.some((warning) => warning.includes('A/B 主文差異較大')));

// 19. 超長欄位 → 修剪＋truncatedFields
const longFields = {
  ...rawPayload(),
  angles: rawPayload().angles.map((angle) => ({
    ...angle,
    variants: {
      A: {
        ...angle.variants.A,
        headline: '超長標題'.repeat(20),
        body: '超長主文。'.repeat(50),
      },
      B: angle.variants.B,
    },
  })),
};
const longFieldsParsed = parse(longFields);
assert.ok(longFieldsParsed.angles[0].truncatedFields.includes('headline'));
assert.ok(longFieldsParsed.angles[0].truncatedFields.includes('body'));
assert.ok(longFieldsParsed.warnings.some((warning) => warning.includes('已按上限縮短')));

// 20. 覆寫
const overridden = applyAdCopyOverrides(parsed, {
  [adCopyKey('pain', 'A', 'headline')]: '手改標題',
  [adCopyKey('pain', 'B', 'cta')]: '手改 CTA',
});
assert.equal(overridden.angles[0].variants.A.headline, '手改標題');
assert.equal(overridden.angles[0].variants.B.cta, '手改 CTA');
assert.equal(parsed.angles[0].variants.A.headline, '送禮怕太甜？');
assert.equal(applyAdCopyOverrides(parsed, {}), parsed);

// 21. CSV / TSV / 可讀文字
const rows = buildAdCsvRows(parsed);
assert.equal(rows.length, parsed.angles.length * 2);
for (const key of AD_CSV_HEADERS) {
  assert.ok(key in rows[0], `csv row missing ${key}`);
}
const csv = toCsv(rows);
assert.ok(csv.startsWith('\uFEFF'));
assert.ok(csv.includes('\r\n'));
assert.ok(csv.includes('痛點切入'));
assert.ok(csv.includes('送禮怕太甜？'));

const quotedCsv = toCsv([
  {
    切角: '=SUM(A1)',
    切角說明: 'a,b"c',
    測試變數: 'line1\nline2',
    版本: 'A',
    鉤子類型: '',
    短標題: '',
    主文: '',
    CTA: '',
    'CTA 變體': '',
    標題字數: 0,
    主文字數: 0,
    平台: '',
    標題上限: 0,
    主文上限: 0,
    生成時間: '',
  },
]);
assert.ok(quotedCsv.includes("'=SUM(A1)"));
assert.ok(quotedCsv.includes('"a,b""c"'));
assert.ok(quotedCsv.includes('"line1\nline2"'));

const allText = buildAdCopyAllText(parsed);
assert.ok(allText.includes('AI文案工坊｜文案多角度轉寫'));
assert.ok(allText.includes('手工低糖月餅'));
assert.ok(allText.includes('A 版'));
assert.ok(allText.includes('B 版'));
assert.ok(allText.includes('CTA 變體'));

const tsv = buildAdMatrixTsv(parsed);
assert.ok(tsv.split('\n').length >= 9);
assert.ok(tsv.includes('痛點切入'));

const variantText = buildVariantText(parsed.angles[0], 'A', '手工低糖月餅');
assert.ok(variantText.includes('手工低糖月餅'));
assert.ok(variantText.includes('送禮怕太甜？'));

// 22. 檔名
assert.equal(safeFilenamePart('手工/低糖:月餅?'), '手工低糖月餅');
assert.ok(buildCsvFilename('手工低糖月餅', new Date('2026-11-26T08:05:00Z')).startsWith('ad-copy-matrix-手工低糖月餅-'));
assert.ok(buildCsvFilename('', new Date('2026-11-26T08:05:00Z')).includes('ad-copy'));

// 23. 靜態：Edge Function 契約
const functionSource = read('../supabase/functions/ad-creative-writer/index.ts');
assert.ok(functionSource.includes('src/lib/adCreative.ts'), 'function must import shared adCreative.ts');
assert.ok(functionSource.includes('Deno.serve'), 'function must use Deno.serve');
assert.ok(functionSource.includes('validateSession'), 'function must validate session itself');
assert.ok(functionSource.includes('XAI_API_KEY'), 'function must use existing Grok key');
assert.ok(functionSource.includes('GEMINI_API_KEY'), 'function must use existing Gemini key');
assert.ok(!functionSource.includes('supabase.from'), 'function must not touch DB');

const config = read('../supabase/config.toml');
assert.ok(config.includes('[functions.ad-creative-writer]'), 'config must register ad-creative-writer');
assert.ok(
  /\[functions\.ad-creative-writer\][\s\S]{0,80}verify_jwt\s*=\s*false/.test(config),
  'ad-creative-writer must set verify_jwt = false',
);

// 24. 靜態：導覽與 UI
const appContext = read('../src/context/AppContext.tsx');
assert.ok(appContext.includes("id: 'tone-rewrite', label: 'AI文案工坊'"), 'sidebar label must be AI文案工坊');
const altPilotIndex = appContext.indexOf("id: 'alt-pilot'");
const aiCopyStudioIndex = appContext.indexOf("id: 'tone-rewrite'");
assert.ok(aiCopyStudioIndex > -1 && aiCopyStudioIndex < altPilotIndex, 'AI文案工坊 must sit before ALT Pilot');
const toolsCenter = read('../src/components/tools-center/ToolsCenterModule.tsx');
assert.ok(toolsCenter.includes('CopyStudioTool'), 'ToolsCenterModule must render CopyStudioTool');
assert.ok(toolsCenter.includes('AI文案工坊'), 'ToolsCenterModule title must be AI文案工坊');

const copyStudio = read('../src/components/tools-center/copy-studio/CopyStudioTool.tsx');
assert.ok(copyStudio.includes('FeatureTabs'), 'CopyStudioTool must use FeatureTabs');
assert.ok(copyStudio.includes('語氣校對改寫'), 'CopyStudioTool must have tone tab');
assert.ok(copyStudio.includes('文案多角度轉寫'), 'CopyStudioTool must have ad tab');
assert.ok(copyStudio.includes("useState<CopyStudioTab>('ad')"), 'default tab must be 文案多角度轉寫');
const adTabIndex = copyStudio.indexOf("label: '文案多角度轉寫'");
const toneTabIndex = copyStudio.indexOf("label: '語氣校對改寫'");
assert.ok(adTabIndex > -1 && adTabIndex < toneTabIndex, '文案多角度轉寫 must sit before 語氣校對改寫');

const zoneTabs = read('../src/components/tools-center/content/shell/ContentZoneTabs.tsx');
assert.ok(zoneTabs.includes('FeatureTabs'), 'ContentZoneTabs must use FeatureTabs');
assert.ok(!zoneTabs.includes('w-6'), 'ContentZoneTabs must not keep fixed badge slot');
assert.ok(!zoneTabs.includes('invisible'), 'ContentZoneTabs must not keep invisible badge slot');

// 25. 靜態：shared lib 不碰瀏覽器／Deno／網絡
const libSource = read('../src/lib/adCreative.ts');
assert.ok(!/\bwindow\./.test(libSource), 'shared lib must not use window');
assert.ok(!/\bdocument\./.test(libSource), 'shared lib must not use document');
assert.ok(!/\bDeno\./.test(libSource), 'shared lib must not use Deno');
assert.ok(!/\bfetch\s*\(/.test(libSource), 'shared lib must not call fetch');

console.log('ad creative: ok');
