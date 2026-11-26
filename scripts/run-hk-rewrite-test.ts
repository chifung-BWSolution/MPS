/**
 * 港式語氣改寫器 · 純函式自測
 * 執行：node scripts/run-hk-rewrite-test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildHkRewritePrompt,
  HK_REWRITE_MAX_INPUT,
  HK_RULE_CONFLICTS,
  rewriteHkDraft,
  type HkSocialVariant,
} from '../src/lib/hkCantoneseRewrite.ts';
import {
  HK_COLLOQUIAL_PHRASE_RULES,
  HK_COLLOQUIAL_RULES,
  HK_FORMALIZE_PHRASE_RULES,
  HK_FORMALIZE_RULES,
  HK_PROTECT_RULES,
  HK_WRITTEN_RULES,
} from '../src/lib/hkCantoneseRules.ts';
import { canAccessSettings } from '../src/lib/permissions.ts';

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8');

const platformVariant = (
  result: ReturnType<typeof rewriteHkDraft>,
  platform: HkSocialVariant['platform'],
) => {
  const variant = result.social.find((item) => item.platform === platform);
  assert.ok(variant, `missing ${platform} variant`);
  return variant;
};

// 1. 空白輸入
const empty = rewriteHkDraft('');
assert.equal(empty.writtenText, '');
assert.deepEqual(empty.social, []);
assert.equal(empty.replacements.length, 0);
assert.equal(empty.issues.length, 0);

// 2. 簡體 + 非港式用詞
const simplified = rewriteHkDraft('这个产品的质量很好，我们没有空调。');
assert.ok(simplified.writtenText.includes('這個產品的質素很好'));
assert.ok(simplified.writtenText.includes('冷氣機'));
assert.equal(simplified.replacements.find((row) => row.from === '质量')?.written, '質素');
const aircon = simplified.replacements.find((row) => row.from === '空调');
assert.equal(aircon?.written, '冷氣機');
assert.equal(aircon?.colloquial, '冷氣');

// 3. 最長匹配：不會先換成「車」
assert.equal(rewriteHkDraft('出租車').writtenText, '的士');
assert.equal(rewriteHkDraft('自行車').writtenText, '單車');
const mouse = rewriteHkDraft('滑鼠');
assert.equal(mouse.writtenText, '滑鼠');
assert.equal(mouse.replacements.length, 0);

// 4. 保護詞
assert.equal(rewriteHkDraft('關係').writtenText, '關係');
assert.equal(rewriteHkDraft('目的').writtenText, '目的');
assert.equal(rewriteHkDraft('的士').writtenText, '的士');
const but = rewriteHkDraft('但是');
assert.ok(platformVariant(but, 'instagram').text.startsWith('但係'));

// 5. 標記位置與文字一致
for (const mark of simplified.writtenMarks) {
  assert.ok(mark.start >= 0 && mark.end <= simplified.writtenText.length);
  assert.ok(mark.start < mark.end);
  assert.equal(simplified.writtenText.slice(mark.start, mark.end), mark.text);
}

// 6. 粵語口語 → 書面語；口語版再轉回粵語
const colloquialInput = rewriteHkDraft('呢個產品嘅質量好好，我哋冇乜問題，但係空調唔夠凍。');
assert.ok(!/[嘅哋喺咗冇睇瞓佢咩唔咁啲]/.test(colloquialInput.writtenText));
const colloquialIg = platformVariant(colloquialInput, 'instagram');
assert.ok(colloquialIg.text.includes('我哋'));
assert.ok(colloquialIg.text.includes('冇咩'));
assert.ok(colloquialIg.text.includes('但係'));

// 7. 平台約束
const platforms = rewriteHkDraft('這款軟件的用戶體驗很好，客服回覆很快，充電寶也可以借。');
const ig = platformVariant(platforms, 'instagram');
const fb = platformVariant(platforms, 'facebook');
const xhs = platformVariant(platforms, 'xiaohongshu');
assert.ok(ig.hashtags.length >= 5 && ig.hashtags.length <= 12);
assert.ok(fb.hashtags.length <= 3);
assert.ok(xhs.hashtags.length >= 6 && xhs.hashtags.length <= 10);
assert.ok(!/[{}]/.test(`${ig.text}${fb.text}${xhs.text}`));
assert.ok(fb.text.includes('適合'));
assert.ok(xhs.text.includes('・'));
assert.ok(xhs.text.includes('📌'));

// 8. 平台超長截斷
const long = rewriteHkDraft('字'.repeat(5000));
const longIg = platformVariant(long, 'instagram');
assert.equal(longIg.truncated, true);
assert.ok(longIg.charCount <= longIg.limit);
assert.ok(longIg.text.endsWith('…') || longIg.text.includes('\n\n#'));
assert.ok(longIg.text.includes('…'));

// 9. 語氣檢查
const lint = rewriteHkDraft('我們要賦能客戶，首先了解需求，其次提供方案，總而言之要落地。');
assert.ok(lint.issues.length > 0);
const clean = rewriteHkDraft('今天天氣很好，我們去公園散步。');
assert.equal(clean.issues.length, 0);

// 10. Prompt
const prompt = buildHkRewritePrompt('草稿');
for (const token of ['痛點', '口語', 'hashtag', '小紅書', '草稿', 'B100']) {
  assert.ok(prompt.includes(token), `prompt missing ${token}`);
}

// 11. 規則唯一性與衝突
assert.deepEqual(HK_RULE_CONFLICTS, []);
const ids = new Set<string>();
for (const list of [
  HK_WRITTEN_RULES,
  HK_FORMALIZE_RULES,
  HK_FORMALIZE_PHRASE_RULES,
  HK_PROTECT_RULES,
  HK_COLLOQUIAL_RULES,
  HK_COLLOQUIAL_PHRASE_RULES,
]) {
  for (const rule of list) {
    assert.ok(!ids.has(rule.id), `duplicate rule id ${rule.id}`);
    ids.add(rule.id);
  }
}

// 12. 靜態導覽
const appContext = read('../src/context/AppContext.tsx');
const toneIndex = appContext.indexOf("id: 'tone-rewrite'");
const captionIndex = appContext.indexOf("id: 'ai-caption'");
const promptIndex = appContext.indexOf("id: 'prompt-library'");
assert.ok(toneIndex > -1, 'tone-rewrite submenu missing');
assert.ok(toneIndex > captionIndex && toneIndex < promptIndex, 'tone-rewrite must sit after ai-caption');
const toolsCenter = read('../src/components/tools-center/ToolsCenterModule.tsx');
assert.ok(toolsCenter.includes('CopyStudioTool'), 'ToolsCenterModule must render CopyStudioTool');

// 12b. Prompt 卡只限管理層（canAccessSettings）；其餘卡片不設限
assert.equal(canAccessSettings('management'), true);
assert.equal(canAccessSettings('system_dev'), true);
assert.equal(canAccessSettings('admin'), true);
assert.equal(canAccessSettings('staff'), false);
assert.equal(canAccessSettings('chief_editor'), false);
const panelSource = read('../src/components/tools-center/tone-rewrite/hk/HkRewritePanel.tsx');
assert.ok(panelSource.includes('canAccessSettings'), 'panel must use canAccessSettings');
assert.ok(
  panelSource.includes('canViewPrompt && <RewriteRulesPanel'),
  'prompt card must be conditionally rendered',
);

// 13. 超長輸入標記
const huge = rewriteHkDraft('字'.repeat(HK_REWRITE_MAX_INPUT + 100));
assert.equal(huge.inputTruncated, true);

// 14. 書面語版本不會再被改一次
const once = rewriteHkDraft('这个产品的质量很好，我们没有空调。');
const twice = rewriteHkDraft(once.writtenText);
assert.equal(twice.writtenText, once.writtenText);

// 15. 常見內地商業用語 + 歧義簡體字
const business = rewriteHkDraft(
  '我们发展台湾市场，背后有干净的供应链，欢迎通过网站咨询客服，我们会尽快回复。',
);
assert.ok(business.writtenText.includes('發展'));
assert.ok(business.writtenText.includes('台灣'));
assert.ok(business.writtenText.includes('背後'));
assert.ok(business.writtenText.includes('乾淨'));
assert.ok(business.writtenText.includes('供應鏈'));
assert.ok(business.writtenText.includes('透過網站'));
assert.ok(business.writtenText.includes('諮詢'));
assert.ok(business.writtenText.includes('回覆'));
assert.ok(!/(发展|台湾|背后|干净|供应链|咨询|回复)/.test(business.writtenText));

// 16. 粵語 ↔ 書面語往返
const together = rewriteHkDraft('我哋一齊去食飯');
assert.equal(together.writtenText, '我們一起去吃飯');
assert.equal(platformVariant(together, 'instagram').text.split('\n')[0], '我哋一齊去食飯');
const thisIs = rewriteHkDraft('這是什麼');
assert.equal(platformVariant(thisIs, 'instagram').text.split('\n')[0], '呢個係咩');

// 17. 純英文提示
const english = rewriteHkDraft('This is a test.');
assert.ok(english.issues.some((issue) => issue.includes('英文')));

// 18. 中文標點與空格正規化（URL 內逗號不改）
assert.equal(rewriteHkDraft('香港 , 九龍 , 新界').writtenText, '香港，九龍，新界');
assert.equal(rewriteHkDraft('香港 ( 九龍 ) , 新界').writtenText, '香港（九龍），新界');
const withUrl = rewriteHkDraft('http://a.com/a,b 香港 , 九龍');
assert.ok(withUrl.writtenText.includes('http://a.com/a,b'));
assert.ok(withUrl.writtenText.includes('香港，九龍'));

// 19. 粵語禮貌語 ↔ 書面語
assert.equal(rewriteHkDraft('唔好意思，多謝你。').writtenText, '不好意思，謝謝你。');
assert.equal(rewriteHkDraft('我哋搭車去飲咖啡。').writtenText, '我們乘車去喝咖啡。');
assert.equal(rewriteHkDraft('的而且確').writtenText, '的而且確');

// 20. 連結／email 不會被句子切斷或截斷
const link = rewriteHkDraft('https://a.com?x=1 香港 , 九龍');
for (const variant of link.social) {
  assert.ok(variant.text.includes('https://a.com?x=1'), `${variant.platform} lost link`);
}
const email = rewriteHkDraft('email test@example.com , 香港');
for (const variant of email.social) {
  assert.ok(variant.text.includes('test@example.com'), `${variant.platform} lost email`);
}

console.log('hk cantonese rewrite: ok');
