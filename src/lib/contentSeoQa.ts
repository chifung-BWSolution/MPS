/**
 * 社媒自動化營運 · SEO 閘門（PRD §9.1.3、§9.2.3、§9.3.3、M2-04）
 *
 * 硬檢查 9 項：任何一項未過 → Confirm 按鈕禁用（後端 approve/confirm 也再驗）
 * 軟檢查 6 項：只影響分數，不阻擋人工判斷
 *
 * 同一支函式同時服務：
 *   - 前端 SeoQaPanel（即時預覽）
 *   - Edge Function generate_article（寫入時的快照）
 */

import type {
  ContentArticle,
  ContentBrandVoice,
  ContentQaCheck,
  ContentQaInput,
  ContentQaReport,
  ContentSeoDefaults,
  ContentSiteSection,
} from './contentTypes.ts';
import {
  canonicalUrl,
  countWords,
  domainFromUrl,
  extractInternalLinks,
  normalizeSlug,
  stripMarkdown,
} from './contentFormat.ts';

const TITLE_MIN = 10;
const TITLE_MAX = 70;
const META_MIN = 50;
const META_MAX = 160;
const SLUG_MAX_WORDS = 8;

function check(
  id: string,
  label: string,
  severity: ContentQaCheck['severity'],
  passed: boolean,
  detail: string,
): ContentQaCheck {
  return { id, label, severity, passed, detail };
}

function safeArticle(input: ContentQaInput['article']): {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  canonical: string;
} {
  return {
    title: (input.title || '').trim(),
    slug: (input.slug || '').trim(),
    excerpt: (input.excerpt || '').trim(),
    body: (input.body_md || input.body_html || '').trim(),
    metaTitle: (input.meta_title || '').trim(),
    metaDescription: (input.meta_description || '').trim(),
    canonical: (input.canonical || '').trim(),
  };
}

function bannedWordList(
  seoDefaults: ContentSeoDefaults,
  brandVoice: ContentBrandVoice,
): string[] {
  const words = [
    ...(Array.isArray(seoDefaults?.bannedWords) ? seoDefaults.bannedWords : []),
    ...(Array.isArray(brandVoice?.bannedWords) ? brandVoice.bannedWords : []),
  ];
  return [...new Set(words.map((word) => String(word).trim()).filter(Boolean))];
}

function findBannedWords(
  text: string,
  bannedWords: readonly string[],
): string[] {
  if (!text || bannedWords.length === 0) return [];
  const haystack = text.toLowerCase();
  return bannedWords.filter((word) => haystack.includes(word.toLowerCase()));
}

function countHeadings(body: string, level: number): number {
  const matches = body.match(new RegExp(`^#{${level}}\\s+`, 'gm'));
  return matches?.length ?? 0;
}

/** 關鍵字是否自然出現在 title 與正文（軟檢查） */
function keywordHits(
  keyword: string | null | undefined,
  title: string,
  body: string,
): { inTitle: boolean; inBody: boolean; density: number } {
  const phrase = (keyword || '').trim().toLowerCase();
  if (!phrase) return { inTitle: false, inBody: false, density: 0 };
  const plain = stripMarkdown(body).toLowerCase();
  const titleText = title.toLowerCase();
  const hits = plain.split(phrase).length - 1;
  const wordTotal = Math.max(1, countWords(body));
  return {
    inTitle: titleText.includes(phrase),
    inBody: hits > 0,
    density: (hits * phrase.length) / wordTotal,
  };
}

/**
 * 產生完整 QA 報告。
 * @param now 可注入時間，讓自測腳本得到穩定結果
 */
export function evaluateSeoQa(input: ContentQaInput, now: Date = new Date()): ContentQaReport {
  const seoDefaults = input.seoDefaults;
  const article = safeArticle(input.article);
  const section = input.section as ContentSiteSection | null | undefined;
  const body = article.body;
  const wordCount = countWords(body);
  const bannedWords = bannedWordList(seoDefaults, input.brandVoice);
  const bannedHits = findBannedWords(
    `${article.title}\n${article.metaDescription}\n${stripMarkdown(body)}`,
    bannedWords,
  );

  // ---- 硬檢查 9 項 -----------------------------------------
  const hard: ContentQaCheck[] = [
    check(
      'title_present',
      '主標題（H1）已填寫',
      'hard',
      article.title.length > 0,
      article.title.length > 0 ? `${article.title.length} 字元` : '缺少主標題',
    ),
    check(
      'title_length',
      `標題長度 ${TITLE_MIN}–${TITLE_MAX} 字元`,
      'hard',
      article.title.length >= TITLE_MIN && article.title.length <= TITLE_MAX,
      `目前 ${article.title.length} 字元`,
    ),
    check(
      'meta_present',
      'Meta description 已填寫',
      'hard',
      article.metaDescription.length > 0,
      article.metaDescription.length > 0 ? '已填寫' : '缺少 meta description',
    ),
    check(
      'meta_length',
      `Meta description ${META_MIN}–${META_MAX} 字元`,
      'hard',
      article.metaDescription.length >= META_MIN && article.metaDescription.length <= META_MAX,
      `目前 ${article.metaDescription.length} 字元`,
    ),
    check(
      'slug_valid',
      `Slug 為 kebab-case 且不超過 ${SLUG_MAX_WORDS} 詞`,
      'hard',
      article.slug.length > 0 &&
        normalizeSlug(article.slug) === article.slug &&
        article.slug.split('-').filter(Boolean).length <= SLUG_MAX_WORDS,
      article.slug ? `/${article.slug}` : '缺少 slug',
    ),
    check(
      'slug_unique',
      'Slug 在站內唯一',
      'hard',
      !(input.existingSlugs || [])
        .map((slug) => normalizeSlug(slug))
        .filter(Boolean)
        .includes(normalizeSlug(article.slug)),
      input.existingSlugs?.length
        ? `比對 ${input.existingSlugs.length} 篇既有文章`
        : '站內尚無其他文章',
    ),
    check(
      'canonical_present',
      'Canonical 已設定',
      'hard',
      article.canonical.length > 0,
      article.canonical || '缺少 canonical',
    ),
    check(
      'word_count_min',
      `字數不少於 ${seoDefaults.wordCountMin}`,
      'hard',
      wordCount >= seoDefaults.wordCountMin,
      `目前 ${wordCount} 字`,
    ),
    check(
      'banned_words',
      '不含禁用詞',
      'hard',
      bannedHits.length === 0,
      bannedHits.length === 0 ? '通過' : `命中：${bannedHits.join('、')}`,
    ),
  ];

  // ---- 軟檢查 6 項 -----------------------------------------
  const internalLinks =
    input.internalLinks ??
    extractInternalLinks(body, domainFromUrl(article.canonical || seoDefaults.canonicalBase));
  const keyword = keywordHits(input.article.keyword, article.title, body);
  const headings = countHeadings(body, 2);
  const images = (body.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
  const imagesWithAlt = (body.match(/!\[[^\]]+\]\([^)]*\)/g) || []).length;
  const excerptLength = article.excerpt.length;
  const canonicalExpected = canonicalUrl(
    seoDefaults.canonicalBase,
    article.slug,
  );

  const soft: ContentQaCheck[] = [
    check(
      'word_count_max',
      `字數不多於 ${seoDefaults.wordCountMax}`,
      'soft',
      wordCount <= seoDefaults.wordCountMax,
      `目前 ${wordCount} 字（上限 ${seoDefaults.wordCountMax}）`,
    ),
    check(
      'internal_links',
      `內鏈 ${seoDefaults.internalLinksMin}–${seoDefaults.internalLinksMax} 條`,
      'soft',
      internalLinks.length >= seoDefaults.internalLinksMin &&
        internalLinks.length <= seoDefaults.internalLinksMax,
      `目前 ${internalLinks.length} 條`,
    ),
    check(
      'excerpt',
      '摘要 60–200 字元',
      'soft',
      excerptLength >= 60 && excerptLength <= 200,
      `目前 ${excerptLength} 字元`,
    ),
    check(
      'h2_structure',
      '正文至少 2 個 H2 分節',
      'soft',
      headings >= 2,
      `目前 ${headings} 個 H2`,
    ),
    check(
      'keyword_usage',
      '關鍵字出現在標題與正文',
      'soft',
      keyword.inTitle && keyword.inBody,
      input.article.keyword
        ? `標題${keyword.inTitle ? '有' : '無'}／正文${keyword.inBody ? '有' : '無'}，密度 ${(keyword.density * 100).toFixed(1)}%`
        : '未綁定關鍵字',
    ),
    check(
      'image_alt',
      '內文圖片皆有 alt',
      'soft',
      images === 0 ? true : imagesWithAlt === images,
      images === 0 ? '尚無內文圖片' : `${imagesWithAlt}/${images} 張有 alt`,
    ),
  ];

  if (section) {
    soft.push(
      check(
        'section_mapped',
        '已對應站內欄目',
        'soft',
        section.content_type === 'article' || section.content_type === 'post' || section.content_type === 'page',
        `${section.name}（${section.content_type}）`,
      ),
    );
  }

  // canonical 與站點 base 的偏差屬於軟提示（站方可能用不同域名）
  soft.push(
    check(
      'canonical_shape',
      'Canonical 與站點網域一致',
      'soft',
      !canonicalExpected || !canonicalExpected.startsWith('http')
        ? true
        : article.canonical.toLowerCase().includes(domainFromUrl(canonicalExpected) || ''),
      canonicalExpected || '未設定站點 canonical base',
    ),
  );

  const hardPassed = hard.every((item) => item.passed);
  const softPassed = soft.filter((item) => item.passed).length;

  return {
    hard,
    soft,
    hardPassed,
    softScore: Math.round((softPassed / Math.max(1, soft.length)) * 100),
    wordCount,
    checkedAt: now.toISOString(),
  };
}

/** Confirm 對話框要列出的阻擋原因 */
export function blockingReasons(report: ContentQaReport): string[] {
  return report.hard.filter((item) => !item.passed).map((item) => `${item.label}（${item.detail}）`);
}

export function canConfirm(report: ContentQaReport | null | undefined): boolean {
  return Boolean(report?.hardPassed);
}

/**
 * 由文章 + 站點設定快速組出 QA 輸入，避免每個呼叫點重複拼裝。
 */
export function buildQaInput(params: {
  article: ContentArticle;
  seoDefaults: ContentSeoDefaults;
  brandVoice: ContentBrandVoice;
  section?: ContentSiteSection | null;
  keyword?: string | null;
  existingSlugs?: string[];
  internalLinks?: string[];
  isDraft?: boolean;
}): ContentQaInput {
  const { article } = params;
  return {
    article: {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      body_md: article.body_md,
      body_html: article.body_html,
      meta_title: article.meta_title,
      meta_description: article.meta_description,
      canonical: article.canonical,
      keyword: params.keyword ?? null,
    },
    seoDefaults: params.seoDefaults,
    brandVoice: params.brandVoice,
    section: params.section ?? null,
    existingSlugs: params.existingSlugs,
    internalLinks: params.internalLinks,
    isDraft: params.isDraft,
  };
}
