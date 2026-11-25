/**
 * 社媒自動化營運 · 生成（brief / prompt / Markdown 渲染 / 關鍵字挑選）
 * 對應 PRD §9.2.3
 *
 * 純函式，無網路、無瀏覽器 API：
 *   - content-worker（Deno）用它組 brief 與解析 LLM 輸出
 *   - 前端用它預覽「這篇會用什麼條件生成」
 */

import type {
  ContentArticle,
  ContentBrandVoice,
  ContentBrief,
  ContentGeneratedArticle,
  ContentKeyword,
  ContentKeywordCandidate,
  ContentSeoDefaults,
  ContentSitePage,
  ContentSiteProfile,
  ContentSiteSection,
} from './contentTypes.ts';
import {
  countWords,
  domainFromUrl,
  escapeHtml,
  normalizeKeywordPhrase,
  normalizeSlug,
  slugifyTitle,
  truncateText,
} from './contentFormat.ts';

// ============================================================
// Brief
// ============================================================

export interface BuildBriefInput {
  site: ContentSiteProfile & { timezone?: string; locale?: string };
  keyword: string;
  keywordIntent?: ContentKeyword['intent'];
  cluster?: string | null;
  brandVoice: ContentBrandVoice;
  seoDefaults: ContentSeoDefaults;
  section?: ContentSiteSection | null;
  sitePages?: Pick<ContentSitePage, 'url' | 'title'>[];
  existingTitles?: string[];
  publishAt?: string | null;
}

export function buildBrief(input: BuildBriefInput): ContentBrief {
  const { site, seoDefaults, brandVoice } = input;
  const pageCandidates = (input.sitePages || [])
    .filter((page) => page.url)
    .slice(0, 20)
    .map((page) => ({ url: page.url, title: page.title || page.url }));

  return {
    siteId: site.id,
    siteName: site.website_name,
    domain: domainFromUrl(site.domain_url),
    locale: site.locale || seoDefaults.locale || 'zh-HK',
    timezone: site.timezone || 'Asia/Hong_Kong',
    keyword: input.keyword.trim(),
    keywordIntent: input.keywordIntent ?? null,
    cluster: input.cluster ?? null,
    audience: brandVoice.audience,
    tone: brandVoice.tone,
    cta: brandVoice.cta,
    factBoundaries: brandVoice.factBoundaries,
    bannedWords: [
      ...new Set([
        ...(brandVoice.bannedWords || []),
        ...(seoDefaults.bannedWords || []),
      ]),
    ],
    sectionName: input.section?.name ?? null,
    wordCountMin: seoDefaults.wordCountMin,
    wordCountMax: seoDefaults.wordCountMax,
    internalLinksMin: seoDefaults.internalLinksMin,
    internalLinksMax: seoDefaults.internalLinksMax,
    internalLinkCandidates: pageCandidates,
    existingTitles: input.existingTitles || [],
    publishAt: input.publishAt ?? null,
    language: site.locale || seoDefaults.locale || 'zh-HK',
  };
}

// ============================================================
// Prompt
// ============================================================

export function buildGenerationPrompt(brief: ContentBrief): string {
  const lines: string[] = [
    '你是一位資深 SEO 內容編輯，請用繁體中文（' + brief.language + '）撰寫一篇可直接上線的站內文章。',
    '',
    '## 站點與讀者',
    `- 站點：${brief.siteName}${brief.domain ? `（${brief.domain}）` : ''}`,
    `- 欄目：${brief.sectionName || '未指定'}`,
    `- 目標讀者：${brief.audience || '一般搜尋意圖使用者'}`,
    `- 品牌語氣：${brief.tone || '專業、可信、具體'}`,
  ];

  if (brief.cta) lines.push(`- 期望行動（CTA）：${brief.cta}`);
  if (brief.factBoundaries) lines.push(`- 事實邊界（不可踰越）：${brief.factBoundaries}`);

  lines.push(
    '',
    '## 本次任務',
    `- 目標關鍵字：${brief.keyword}`,
  );
  if (brief.keywordIntent) lines.push(`- 搜尋意圖：${brief.keywordIntent}`);
  if (brief.cluster) lines.push(`- 主題叢集：${brief.cluster}`);
  lines.push(
    `- 正文字數：${brief.wordCountMin}–${brief.wordCountMax} 字（以中文字數計）`,
    `- 內鏈：${brief.internalLinksMin}–${brief.internalLinksMax} 條，只能引用下列既有頁面`,
  );

  if (brief.internalLinkCandidates.length) {
    for (const candidate of brief.internalLinkCandidates) {
      lines.push(`  - ${candidate.title} → ${candidate.url}`);
    }
  } else {
    lines.push('  - 目前沒有可引用頁面；若無合適連結則不強行加入');
  }

  if (brief.bannedWords.length) {
    lines.push('', `## 禁用詞（出現即視為不合格）`, ...brief.bannedWords.map((word) => `- ${word}`));
  }

  if (brief.existingTitles.length) {
    lines.push(
      '',
      '## 已存在文章（避免重複主題與相近標題）',
      ...brief.existingTitles.slice(0, 30).map((title) => `- ${title}`),
    );
  }

  lines.push(
    '',
    '## 寫作規則',
    '1. 只有一個 H1（標題），正文使用 Markdown，至少 2 個 H2 分節。',
    '2. 首段 2–3 句直接回答搜尋意圖，不要空話開場。',
    '3. 具體、可驗證；不確定的事實不要編造，改寫成通用原則。',
    '4. 不使用「最」「第一」「保證」等無法證實的絕對化宣稱。',
    '5. 不要輸出解釋、前言、結語或 Markdown 圍欄，只輸出 JSON。',
    '',
    '## 輸出 JSON schema',
    JSON.stringify(
      {
        title: 'H1 標題，10–70 字元，含目標關鍵字',
        slug: 'english-kebab-case，≤8 詞',
        excerpt: '摘要 80–160 字元',
        meta_title: '≤60 字元，含關鍵字',
        meta_description: '50–160 字元',
        body_md: 'Markdown 正文（不含 H1）',
        keywords: ['2–5 個相關長尾詞'],
        internal_links: ['實際引用到的站內 URL'],
        json_ld_type: 'BlogPosting',
      },
      null,
      2,
    ),
  );

  return lines.join('\n');
}

// ============================================================
// 解析 LLM 輸出
// ============================================================

export interface ParseGeneratedOptions {
  brief: ContentBrief;
  existingSlugs?: string[];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).trim();
}

/**
 * 把模型輸出收斂成可落庫的結構。
 * 缺欄位一律給安全值，讓上層以 QA 標記「未過」而不是整篇丟棄。
 */
export function parseGeneratedArticle(
  raw: unknown,
  options: ParseGeneratedOptions,
): ContentGeneratedArticle {
  const payload = typeof raw === 'string' ? JSON.parse(stripCodeFence(raw)) : raw;
  const source = (payload ?? {}) as Record<string, unknown>;

  const title = asString(source.title) || options.brief.keyword;
  const rawSlug = normalizeSlug(asString(source.slug) || slugifyTitle(title));
  const slug = rawSlug || slugifyTitle(title);
  const body = asString(source.body_md) || asString(source.body);
  const keywords = Array.isArray(source.keywords)
    ? source.keywords.map((item) => asString(item)).filter(Boolean)
    : [];

  return {
    title,
    slug,
    excerpt: asString(source.excerpt) || truncateText(body.replace(/\s+/g, ' '), 150),
    body_md: body,
    meta_title: asString(source.meta_title) || truncateText(title, 60),
    meta_description: asString(source.meta_description) || truncateText(body.replace(/\s+/g, ' '), 155),
    keywords,
    json_ld_type: asString(source.json_ld_type) || 'BlogPosting',
    internal_links: Array.isArray(source.internal_links)
      ? source.internal_links.map((item) => asString(item)).filter(Boolean)
      : undefined,
  };
}

/** 基本守門：JSON 解析失敗或空正文 → 視為不可用（上層會重試或標 failed） */
export function isValidGeneratedArticle(article: ContentGeneratedArticle): boolean {
  return (
    article.title.trim().length > 0 &&
    article.body_md.trim().length > 0 &&
    countWords(article.body_md) >= 100
  );
}

// ============================================================
// 關鍵字挑選（PRD §9.2.3 步驟 2）
// ============================================================

const GSC_SOURCES = new Set(['gsc']);

/**
 * 只挑 pipeline_status = 'backlog' 的詞：
 *   ⚠️ NULL 一律視為不可用（歷史關鍵字，PRD v1.1 修訂 1）
 * 排序：
 *   1. priority DESC NULLS LAST（人工 pin = 1000 最前）
 *   2. GSC 機會詞
 *   3. volume / difficulty 綜合分
 * 另外：同 cluster 若 14 天內已用過，本輪跳過。
 */
export function selectKeywordCandidate(
  keywords: readonly ContentKeyword[],
  options: {
    clusterCooldownDays?: number;
    recentByCluster?: Record<string, string | null | undefined>;
    now?: Date;
  } = {},
): ContentKeywordCandidate | null {
  const now = options.now ?? new Date();
  const cooldownMs = (options.clusterCooldownDays ?? 14) * 86_400_000;
  const recentByCluster = options.recentByCluster ?? {};

  const candidates = keywords
    .filter((keyword) => keyword.pipeline_status === 'backlog')
    .filter((keyword) => normalizeKeywordPhrase(keyword.keyword).length > 0)
    .filter((keyword) => {
      const cluster = keyword.cluster?.trim();
      if (!cluster) return true;
      const lastUsed = recentByCluster[cluster];
      if (!lastUsed) return true;
      const timestamp = new Date(lastUsed).getTime();
      return !Number.isFinite(timestamp) || now.getTime() - timestamp > cooldownMs;
    })
    .map((keyword) => ({ keyword, score: keywordPriorityScore(keyword) }))
    .sort((a, b) => b.score - a.score || a.keyword.keyword.localeCompare(b.keyword.keyword));

  return candidates[0] ?? null;
}

/**
 * 可解釋的排序分數：
 *   1. 有設定 priority 的詞永遠排在 NULL 之前（人工 pin 1000 最高）
 *   2. 同為 NULL 時，GSC 機會詞優先
 *   3. 再看 volume / difficulty 綜合分
 */
export function keywordPriorityScore(keyword: ContentKeyword): number {
  const hasPriority = keyword.priority !== null && keyword.priority !== undefined;
  const priorityValue = hasPriority ? Number(keyword.priority) : NaN;
  const priorityBand = Number.isFinite(priorityValue)
    ? 1_000_000 + Math.max(0, priorityValue as number)
    : 0;
  const gscBand = GSC_SOURCES.has(keyword.source) ? 10_000 : 0;
  const volume = Number(keyword.search_volume) || 0;
  const difficulty = Number(keyword.difficulty_score) || 50;
  const opportunity = Math.max(0, 1 - difficulty / 100) * 200 + Math.log10(volume + 1) * 100;
  return priorityBand + gscBand + Math.round(opportunity);
}

/**
 * GSC「機會詞」判定（高曝光低點擊 / 排名 5–20）：
 * planner 標記用，不改變既有 SEO 監控語義。
 */
export function isGscOpportunity(params: {
  impressions: number;
  clicks: number;
  position: number;
}): { opportunity: boolean; reason: string | null } {
  const { impressions, clicks, position } = params;
  const ctr = impressions > 0 ? clicks / impressions : 0;
  if (impressions >= 100 && ctr < 0.02) {
    return { opportunity: true, reason: '高曝光低點擊' };
  }
  if (position >= 5 && position <= 20) {
    return { opportunity: true, reason: '排名 5–20，可推上首頁' };
  }
  return { opportunity: false, reason: null };
}

// ============================================================
// Markdown → HTML（自足、無第三方依賴，前後端共用）
// ============================================================

function renderInline(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return html;
}

/**
 * 支援：H1–H6、段落、無序／有序清單、引用、程式碼圍欄、分隔線、行內格式、圖片、連結。
 * 刻意不支援表格與腳註，保持輸出可預測（生成內容用不到）。
 */
export function renderMarkdownToHtml(markdown: string | null | undefined): string {
  const source = (markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!source.trim()) return '';

  const lines = source.split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let quote: string[] = [];
  let codeFence: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    html.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (codeFence !== null) {
      if (trimmed.startsWith('```')) {
        html.push(`<pre><code>${escapeHtml(codeFence.join('\n'))}</code></pre>`);
        codeFence = null;
      } else {
        codeFence.push(line);
      }
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushAll();
      codeFence = [];
      continue;
    }

    if (!trimmed) {
      flushAll();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      html.push('<hr />');
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quote.push(quoteMatch[1]);
      continue;
    }

    const unordered = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (unordered) {
      flushParagraph();
      flushQuote();
      if (listType !== 'ul') {
        flushList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (listType !== 'ol') {
        flushList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }

  if (codeFence !== null) {
    html.push(`<pre><code>${escapeHtml(codeFence.join('\n'))}</code></pre>`);
  }
  flushAll();
  return html.join('\n');
}

// ============================================================
// JSON-LD
// ============================================================

export function buildArticleJsonLd(params: {
  article: Pick<ContentArticle, 'title' | 'excerpt' | 'body_md' | 'body_html' | 'published_at' | 'updated_at' | 'cover_asset_id'>;
  seoDefaults: ContentSeoDefaults;
  canonical: string;
  liveUrl?: string | null;
  coverUrl?: string | null;
  section?: ContentSiteSection | null;
  wordCount?: number;
}): Record<string, unknown> {
  const { article, seoDefaults } = params;
  const canonical = params.liveUrl || params.canonical;
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': seoDefaults.jsonLdType || 'BlogPosting',
    headline: truncateText(article.title, 110),
    description: truncateText(
      article.excerpt || article.body_html?.replace(/<[^>]+>/g, ' ') || '',
      200,
    ),
    inLanguage: seoDefaults.locale,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    url: canonical,
  };
  if (article.published_at) jsonLd.datePublished = article.published_at;
  if (article.updated_at) jsonLd.dateModified = article.updated_at;
  if (params.coverUrl) jsonLd.image = [params.coverUrl];
  if (seoDefaults.author) {
    jsonLd.author = { '@type': 'Person', name: seoDefaults.author };
  }
  if (seoDefaults.publisher) {
    jsonLd.publisher = {
      '@type': 'Organization',
      name: seoDefaults.publisher,
      ...(seoDefaults.ogImage
        ? { logo: { '@type': 'ImageObject', url: seoDefaults.ogImage } }
        : {}),
    };
  }
  if (params.section?.name) jsonLd.articleSection = params.section.name;
  if (params.wordCount) jsonLd.wordCount = params.wordCount;
  return jsonLd;
}

/** 文章摘要用的純文字（給 meta / 列表） */
export function plainTextFromMarkdown(markdown: string | null | undefined, max = 160): string {
  return truncateText(
    (markdown || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`|-]/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim(),
    max,
  );
}
