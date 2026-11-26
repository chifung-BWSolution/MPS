/**
 * 港式語氣改寫器 · Prompt（可複製到外部 AI）
 *
 * 來源：D:\Project\B100-Manager\src\lib\content.ts:618-627 的 DEFAULT_PROMPTS
 *   - prompt_beauty100：痛點疑問式標題、60–100 字答案先行摘要、H2、5 點清單、
 *     短段落、不虛構療效／名人療程／醫學聲稱、講明邊類人啱試／要停／防曬
 *   - prompt_instagram：首行鉤子一句講完痛點、hashtag 5–12、結尾一條問題
 *   - prompt_facebook：資訊性、講清楚邊類人啱睇、hashtag 0–3
 *   - prompt_threads：口語短文、結尾問題（本工具暫不輸出 Threads）
 * 已把 Beauty100 品牌名與「只輸出 JSON」的站內流程改成通用版本；
 * 小紅書格式為 MPS 新增（標題 ≤20 字、分點、hashtag 6–10）。
 */

import type { SocialPlatform } from './hkCantoneseRules.ts';
import { HK_PLATFORM_RULES } from './hkCantoneseRules.ts';

export const HK_REWRITE_SYSTEM_PROMPT = `你是香港市場的資深中文文案編輯，熟悉香港書面語與港式粵語口語的分別。
請保留原文的事實、數字與品牌名，把內容整理成兩個版本：
1. 香港書面語版：繁體中文、香港標準用詞、語氣專業自然，不用粵語口語字（唔、係、嘅、咗、冇、咁、啲）。
2. 社群口語版：自然港式粵語口語，好似同朋友講嘢（例如「點用」「唔係」「先至」「好正」），但事實、數字、品牌名要保留，不誇大。

## 寫作規則
- 標題用痛點疑問式；摘要 60–100 字，答案先行。
- 段落要短；需要時用 5 點編號清單，不要長篇大論。
- IG：首行是鉤子，一句講完痛點；hashtag 5–12 個；結尾留一條問題。
- FB：資訊性，講清楚邊類人啱睇；hashtag 0–3 個。
- 小紅書：標題 20 字以內；分點列出重點；hashtag 6–10 個。
- 不虛構療效數據、名人療程或醫學聲稱；要講明邊類人啱試、邊類人要停、日間使唔使防曬。
- 標示每個被替換的非港式詞彙（原詞 → 港式寫法），方便人手核對。

## 輸出 JSON
{
  "written": "香港書面語版全文",
  "social": {
    "instagram": "IG 口語版（含 hashtag）",
    "facebook": "FB 口語版（含 hashtag）",
    "xiaohongshu": "小紅書口語版（含 hashtag）"
  },
  "replacements": [
    { "from": "原詞", "to": "港式寫法", "category": "內地用語／台灣用語／粵語口語／港式用詞" }
  ]
}`;

const PLATFORM_ORDER: SocialPlatform[] = ['instagram', 'facebook', 'xiaohongshu'];

export function buildHkRewritePrompt(input: string, platform?: SocialPlatform): string {
  const selected = platform ? [platform] : PLATFORM_ORDER;
  const platformLines = selected.map((key) => {
    const rule = HK_PLATFORM_RULES[key];
    return `- ${rule.label}：上限 ${rule.limit} 字，hashtag ${rule.hashtagMin}–${rule.hashtagMax} 個。`;
  });

  return [
    HK_REWRITE_SYSTEM_PROMPT,
    '',
    '## 本次平台',
    ...platformLines,
    '',
    '## 待改寫原文',
    input.trim() || '（未輸入）',
  ].join('\n');
}
