/**
 * 社媒自動化營運 · 內容包（PRD §9.3.5、M1-21）
 *
 * 產出物（zip 結構）：
 *   article.html   完整 HTML（含圖片、JSON-LD、canonical）
 *   article.md     Markdown 原稿
 *   meta.json      title / description / slug / canonical / og / 關鍵字
 *   images/        cover-16x9.svg、figure-01.svg …
 *   README.txt     貼上步驟與注意事項
 *
 * 這裡只組「檔案內容」，zip 打包由呼叫端負責（前端 JSZip / Edge npm:jszip）。
 */

import type {
  ContentArticle,
  ContentPackageFile,
  ContentPackageMeta,
  ContentPackagePlan,
  ContentPublishMode,
  ContentSeoDefaults,
  ContentSiteProfile,
  ContentSiteSection,
} from './contentTypes.ts';
import { domainFromUrl, escapeHtml, formatZoneDateTime, normalizeSlug } from './contentFormat.ts';

export interface BuildPackageInput {
  article: Pick<
    ContentArticle,
    'title' | 'slug' | 'excerpt' | 'body_md' | 'meta_title' | 'meta_description' | 'canonical' | 'language'
  >;
  site: ContentSiteProfile;
  section: ContentSiteSection | null;
  seoDefaults: ContentSeoDefaults;
  meta: ContentPackageMeta;
  bodyHtml: string;
  jsonLd: Record<string, unknown>;
  coverPath?: string | null;
  figurePaths?: { path: string; alt: string }[];
  robots?: string;
  mode?: ContentPublishMode;
  generatedAt?: string;
}

/** PRD 指定的檔名：b100-<site>-<slug>.zip（site 用網域，去 protocol 與 www） */
export function packageFileName(meta: ContentPackageMeta): string {
  const sitePart =
    normalizeSlug(domainFromUrl(meta.site.domain) || meta.site.name || meta.site.id) || 'site';
  const slugPart = normalizeSlug(meta.slug) || 'article';
  return `b100-${sitePart}-${slugPart}.zip`;
}

export function buildArticleHtmlDocument(input: BuildPackageInput): string {
  const { article, meta, seoDefaults } = input;
  const title = article.meta_title || article.title;
  const description = article.meta_description || article.excerpt || '';
  const cover = input.coverPath || '';
  const robots = input.robots || seoDefaults.robotsLive || 'index,follow';
  const published = meta.publishAt || input.generatedAt || new Date().toISOString();
  const ogImage = cover || seoDefaults.ogImage || '';

  const figureBlock = (input.figurePaths || [])
    .map(
      (figure) =>
        `<figure><img src="${escapeHtml(figure.path)}" alt="${escapeHtml(figure.alt)}" loading="lazy" width="1200" height="675" /><figcaption>${escapeHtml(figure.alt)}</figcaption></figure>`,
    )
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(article.language || seoDefaults.locale || 'zh-HK')}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="${escapeHtml(robots)}" />
  <link rel="canonical" href="${escapeHtml(article.canonical || meta.canonical)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(article.canonical || meta.canonical)}" />
  <meta property="og:site_name" content="${escapeHtml(input.site.website_name)}" />
  <meta property="og:locale" content="${escapeHtml(seoDefaults.locale || 'zh-HK')}" />
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : ''}
  <meta property="article:published_time" content="${escapeHtml(published)}" />
  ${meta.keywords.length ? `<meta name="keywords" content="${escapeHtml(meta.keywords.join(', '))}" />` : ''}
  <script type="application/ld+json">
${JSON.stringify(input.jsonLd, null, 2)}
  </script>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f5f8fc; color: #0d1a2d; font-family: 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', system-ui, sans-serif; line-height: 1.75; }
    .page { max-width: 820px; margin: 0 auto; padding: 48px 24px 96px; }
    .breadcrumb { font-size: 13px; color: #64748b; margin-bottom: 18px; }
    .kicker { display: inline-block; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #0d9488; font-weight: 700; }
    h1 { font-size: 34px; line-height: 1.25; letter-spacing: -.01em; margin: 10px 0 14px; }
    .lede { font-size: 16px; color: #475569; margin: 0 0 26px; }
    .cover { width: 100%; border-radius: 8px; margin: 8px 0 30px; display: block; }
    article h2 { font-size: 24px; margin: 38px 0 12px; }
    article h3 { font-size: 19px; margin: 28px 0 10px; }
    article p, article li { font-size: 16.5px; color: #1f2937; }
    article a { color: #0f766e; text-decoration: underline; text-underline-offset: 3px; }
    article img { max-width: 100%; height: auto; border-radius: 6px; }
    article blockquote { margin: 22px 0; padding: 12px 18px; border-left: 3px solid #0d9488; background: #ffffff; color: #334155; }
    article code { background: #eef3f9; padding: 1px 5px; border-radius: 3px; font-size: 14px; }
    article pre { background: #0d1a2d; color: #e2e8f0; padding: 16px; border-radius: 6px; overflow-x: auto; }
    article figure { margin: 28px 0; }
    article figcaption { font-size: 12.5px; color: #64748b; margin-top: 8px; }
    .cta { margin: 44px 0 0; padding: 22px 24px; background: #ffffff; border: 1px solid #e7eef6; border-radius: 8px; }
    .cta strong { display: block; margin-bottom: 6px; }
    footer { margin-top: 40px; font-size: 12.5px; color: #94a3b8; border-top: 1px solid #e7eef6; padding-top: 16px; }
  </style>
</head>
<body>
  <main class="page">
    <div class="breadcrumb">${escapeHtml(input.site.website_name)}${input.section?.name ? ` · ${escapeHtml(input.section.name)}` : ''}</div>
    <span class="kicker">${escapeHtml(input.section?.name || seoDefaults.jsonLdType || 'Article')}</span>
    <h1>${escapeHtml(article.title)}</h1>
    ${article.excerpt ? `<p class="lede">${escapeHtml(article.excerpt)}</p>` : ''}
    ${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="${escapeHtml(article.title)}" width="1200" height="675" />` : ''}
    <article>
        ${input.bodyHtml}
        ${figureBlock}
    </article>
    ${seoDefaults.author ? `<footer>作者：${escapeHtml(seoDefaults.author)}${published ? ` · 發佈時間：${escapeHtml(formatZoneDateTime(published, 'Asia/Hong_Kong'))}` : ''}</footer>` : ''}
  </main>
</body>
</html>
`;
}

export function buildArticleMarkdownFile(input: BuildPackageInput): string {
  const { article, meta } = input;
  return [
    `# ${article.title}`,
    '',
    article.excerpt ? `> ${article.excerpt}` : '',
    '',
    article.body_md || '',
    '',
    '---',
    `- slug: ${meta.slug}`,
    `- canonical: ${meta.canonical}`,
    `- keywords: ${meta.keywords.join(', ') || '—'}`,
    meta.publishAt ? `- publish_at: ${meta.publishAt}` : '',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function buildMetaJsonFile(meta: ContentPackageMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

export function buildReadmeFile(params: {
  meta: ContentPackageMeta;
  mode: ContentPublishMode;
  siteName: string;
  sectionName: string | null;
  generatedAt: string;
}): string {
  const { meta, mode, siteName, sectionName, generatedAt } = params;
  const modeNote =
    mode === 'manual'
      ? '本文為人工發佈模式：請由官網後台建立文章並貼上內容，完成後回到 MPS 回填 live URL。'
      : mode === 'draft'
        ? '本文應以「草稿」形式建立，待站方確認後再公開。'
        : '本文將直接公開，貼上後請立即回填 URL。';

  return [
    'MPS · 社媒自動化營運 · 內容包',
    '================================',
    '',
    `站點：${siteName}`,
    `欄目：${sectionName || '未指定'}`,
    `標題：${meta.title}`,
    `Slug：${meta.slug}`,
    `Canonical：${meta.canonical}`,
    `排定發佈：${meta.publishAt ? formatZoneDateTime(meta.publishAt, 'Asia/Hong_Kong') : '未排定'}`,
    `產出時間：${formatZoneDateTime(generatedAt, 'Asia/Hong_Kong')}`,
    '',
    '內容說明',
    '--------',
    modeNote,
    '',
    '貼上步驟',
    '--------',
    '1. 開啟站點後台 → 新增文章（或對應欄目）。',
    '2. 貼上 article.html 的 <article> 內容，或直接用 article.md 重新排版。',
    '3. 設定標題、slug、meta title、meta description（見 meta.json）。',
    '4. 上傳 images/ 內的圖片，封面用 cover-16x9.svg（可轉 PNG）。',
    '5. 依 meta.json 設定 canonical 與 OG 資訊。',
    '6. 發佈後回到 MPS → 發佈回執 → 回填 live URL，狀態才會轉為「已手動上線」。',
    '',
    '需人工確認',
    '----------',
    '- 站內事實與品牌資訊（數字、地址、服務範圍）請再核對一次。',
    '- 內文引用連結是否仍有效。',
    '- 若站方不支援 SVG，請先將封面轉為 PNG／JPG。',
    '',
    `關鍵字：${meta.keywords.join(', ') || '（無）'}`,
    '',
    '注意：本內容包不會自動上線；未回填 URL 前，MPS 一律顯示「待回填」。',
    '',
  ].join('\n');
}

export interface PackagePlanInput extends BuildPackageInput {
  figureAssets?: { path: string; alt: string; content: string | Uint8Array; contentType: string }[];
  coverAssetContent?: { path: string; content: string | Uint8Array; contentType: string } | null;
}

export function buildPackagePlan(input: PackagePlanInput): ContentPackagePlan {
  const filename = packageFileName(input.meta);
  const files: ContentPackageFile[] = [
    {
      path: 'article.html',
      content: buildArticleHtmlDocument(input),
      contentType: 'text/html',
    },
    {
      path: 'article.md',
      content: buildArticleMarkdownFile(input),
      contentType: 'text/markdown',
    },
    {
      path: 'meta.json',
      content: buildMetaJsonFile(input.meta),
      contentType: 'application/json',
    },
    {
      path: 'README.txt',
      content: buildReadmeFile({
        meta: input.meta,
        mode: input.mode || 'manual',
        siteName: input.site.website_name,
        sectionName: input.section?.name ?? null,
        generatedAt: input.generatedAt || new Date().toISOString(),
      }),
      contentType: 'text/plain',
    },
  ];

  if (input.coverAssetContent) {
    files.push({
      path: input.coverAssetContent.path,
      content: input.coverAssetContent.content,
      contentType: input.coverAssetContent.contentType,
    });
  }
  for (const figure of input.figureAssets || []) {
    files.push({ path: figure.path, content: figure.content, contentType: figure.contentType });
  }

  return { filename, files, meta: input.meta };
}

/** 從文章 + 站點組出 meta.json 的內容（worker / content-publish 共用） */
export function buildPackageMeta(params: {
  article: Pick<ContentArticle, 'title' | 'slug' | 'excerpt' | 'meta_title' | 'meta_description' | 'canonical' | 'language' | 'og'>;
  site: ContentSiteProfile;
  section: ContentSiteSection | null;
  keyword: string | null;
  publishAt: string | null;
  mode: ContentPublishMode;
}): ContentPackageMeta {
  return {
    title: params.article.meta_title || params.article.title,
    description: params.article.meta_description || params.article.excerpt || '',
    slug: params.article.slug,
    canonical: params.article.canonical || '',
    og: (params.article.og as Record<string, unknown>) || {},
    keywords: params.keyword ? [params.keyword] : [],
    language: params.article.language || 'zh-HK',
    site: {
      id: params.site.id,
      name: params.site.website_name,
      domain: params.site.domain_url || '',
    },
    section: params.section
      ? { name: params.section.name, external_id: params.section.external_id }
      : null,
    publishAt: params.publishAt,
    mode: params.mode,
  };
}
