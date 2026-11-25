/**
 * 文章編輯器（M3-03、M3-04；PRD §9.3.2）
 *
 * 職責：
 *   - Markdown 編輯 + 即時預覽（react-markdown + remark-gfm，已在依賴中）
 *   - 標題／摘要／meta title／meta description／slug／canonical 欄位
 *   - 即時字數（沿用 contentFormat.countWords，與 QA 硬檢查同一套算法）
 *   - 變更一律以 patch 回傳（`onChange`），由工作室決定何時存草稿
 *   - 供 SeoQaPanel 的「跳到對應欄位」使用：`focusRequest` + 穩定 DOM 節點
 *
 * 設計說明：
 *   - 樂觀鎖不在此檔處理：版本衝突（409）由 useContentArticle 轉成具名錯誤，
 *     工作室以 Dialog 請使用者重新載入。
 *   - 不引入任何新依賴；預覽用既有 react-markdown／remark-gfm。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Hash, Link2, ListTree, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentArticle, ContentSeoDefaults } from '@/lib/contentTypes.ts';
import type { ContentArticleDraftPatch } from '@/hooks/useContentArticles';
import {
  canonicalUrl,
  countCharacters,
  countWords,
  normalizeSlug,
  slugifyTitle,
} from '@/lib/contentFormat.ts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ContentEmptyState } from '../shell/ContentEmptyState';

// ============================================================
// 型別與純函式（供工作室共用）
// ============================================================

/** 編輯器可編輯欄位（也是 QA 面板可以跳轉的目標欄位） */
export interface ArticleDraftValues {
  title: string;
  slug: string;
  excerpt: string;
  body_md: string;
  meta_title: string;
  meta_description: string;
  canonical: string;
}

export type ArticleEditableField = keyof ArticleDraftValues;

export interface ArticleFocusRequest {
  field: ArticleEditableField;
  /** 每次點擊遞增，讓同一個欄位可以重複觸發 focus */
  nonce: number;
}

/** 文章列 → 編輯器初值（缺欄位一律給空字串，避免 controlled/uncontrolled 警告） */
export function articleDraftFromArticle(article: ContentArticle): ArticleDraftValues {
  return {
    title: article.title ?? '',
    slug: article.slug ?? '',
    excerpt: article.excerpt ?? '',
    body_md: article.body_md ?? article.body_html ?? '',
    meta_title: article.meta_title ?? '',
    meta_description: article.meta_description ?? '',
    canonical: article.canonical ?? '',
  };
}

/** 只回傳真正變更的欄位，避免把未動到的欄位（含其他分頁改的）蓋回去 */
export function diffArticleDraft(
  draft: ArticleDraftValues,
  article: ContentArticle,
): ContentArticleDraftPatch {
  const base = articleDraftFromArticle(article);
  const patch: ContentArticleDraftPatch = {};
  (Object.keys(draft) as ArticleEditableField[]).forEach((field) => {
    if ((draft[field] ?? '') !== (base[field] ?? '')) {
      patch[field] = draft[field];
    }
  });
  return patch;
}

export function isDraftDirty(draft: ArticleDraftValues, article: ContentArticle): boolean {
  return Object.keys(diffArticleDraft(draft, article)).length > 0;
}

// ============================================================
// Markdown 預覽
// ============================================================

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 font-heading text-[26px] font-bold leading-snug text-[#0d1a2d]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-6 border-l-[3px] border-teal-500 pl-3 font-heading text-[21px] font-bold leading-snug text-[#0d1a2d]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-[17px] font-bold text-[#0d1a2d]">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14px] leading-[1.85] text-slate-700">{children}</p>
  ),
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 text-[14px] leading-[1.8] text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-[1.8] text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 rounded-r-md border-l-[3px] border-teal-300 bg-teal-50/50 px-3 py-2 text-[13.5px] leading-[1.8] text-slate-600">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-bold text-[#0d1a2d]">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-800"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <img
      src={typeof src === 'string' ? src : undefined}
      alt={alt ?? ''}
      loading="lazy"
      className="my-3 w-full rounded-md border border-[rgba(13,26,45,0.08)]"
    />
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12.5px] text-slate-700">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md bg-[#0d1a2d] p-3 font-mono text-[12px] leading-relaxed text-slate-100">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-5 border-[rgba(13,26,45,0.08)]" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[rgba(13,26,45,0.1)] bg-slate-50 px-2 py-1.5 text-left font-semibold text-[#0d1a2d]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[rgba(13,26,45,0.1)] px-2 py-1.5 text-slate-700">{children}</td>
  ),
};

export interface ArticleBodyPreviewProps {
  markdown: string | null | undefined;
  className?: string;
}

/** 文章正文渲染（工作室左側站點版式預覽與編輯器預覽共用） */
export function ArticleBodyPreview({ markdown, className }: ArticleBodyPreviewProps) {
  const text = (markdown ?? '').trim();
  if (!text) {
    return (
      <div className={cn('rounded-md border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-slate-400', className)}>
        還沒有正文內容；切到「Markdown 編輯」開始撰寫。
      </div>
    );
  }
  return (
    <div className={cn('max-w-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ============================================================
// 編輯器
// ============================================================

interface CounterTone {
  className: string;
}

function counterTone(ok: boolean): CounterTone {
  return { className: ok ? 'text-emerald-600' : 'text-amber-600' };
}

export interface ArticleEditorProps {
  value: ArticleDraftValues;
  onChange: (patch: Partial<ArticleDraftValues>) => void;
  seoDefaults: ContentSeoDefaults;
  /** 唯讀（例如已發佈文章） */
  disabled?: boolean;
  /** 來自 QA 面板的跳轉請求 */
  focusRequest?: ArticleFocusRequest | null;
  defaultTab?: 'edit' | 'preview';
  className?: string;
}

export function ArticleEditor({
  value,
  onChange,
  seoDefaults,
  disabled = false,
  focusRequest = null,
  defaultTab = 'edit',
  className,
}: ArticleEditorProps) {
  const [tab, setTab] = useState<'edit' | 'preview'>(defaultTab);

  const fieldRefs = useRef<Partial<Record<ArticleEditableField, HTMLElement | null>>>({});
  const registerField = useCallback(
    (field: ArticleEditableField) => (node: HTMLElement | null) => {
      fieldRefs.current[field] = node;
    },
    [],
  );

  // QA 面板點「未過項目」→ 切到編輯 tab、捲動並 focus 對應欄位
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.field === 'body_md') setTab('edit');
    const timer = window.setTimeout(() => {
      const node = fieldRefs.current[focusRequest.field];
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof (node as HTMLInputElement).focus === 'function') {
        (node as HTMLInputElement).focus({ preventScroll: true });
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  const wordCount = countWords(value.body_md);
  const charCount = countCharacters(value.body_md);
  const titleLength = value.title.trim().length;
  const metaLength = value.meta_description.trim().length;
  const slugNormalized = normalizeSlug(value.slug);
  const slugValid = value.slug.length > 0 && slugNormalized === value.slug;
  const metaTitleLength = value.meta_title.trim().length;

  const applySlugFromTitle = () => {
    const next = slugifyTitle(value.title, 8);
    if (next) onChange({ slug: next });
  };

  const applyCanonicalFromSlug = () => {
    if (!value.slug.trim()) return;
    onChange({ canonical: canonicalUrl(seoDefaults.canonicalBase, value.slug.trim()) });
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* 主標題 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3.5 shadow-card">
        <div className="mb-1.5 flex items-center justify-between">
          <Label htmlFor="article-title" className="text-[12px] font-semibold text-[#0d1a2d]">
            主標題（H1）
          </Label>
          <span className={cn('text-[11px] tabular-nums', counterTone(titleLength >= 10 && titleLength <= 70).className)}>
            {titleLength} / 10–70 字元
          </span>
        </div>
        <Input
          id="article-title"
          ref={registerField('title')}
          value={value.title}
          disabled={disabled}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="一篇好文章的標題：具體、可搜尋、不誇大"
          className="h-10 text-[17px] font-bold text-[#0d1a2d]"
        />

        <div className="mt-2.5 flex items-center justify-between">
          <Label htmlFor="article-excerpt" className="text-[12px] font-semibold text-[#0d1a2d]">
            摘要（預覽與 meta 範本用）
          </Label>
          <span className={cn('text-[11px] tabular-nums', counterTone(value.excerpt.trim().length >= 60 && value.excerpt.trim().length <= 200).className)}>
            {value.excerpt.trim().length} / 60–200 字元
          </span>
        </div>
        <Textarea
          id="article-excerpt"
          ref={registerField('excerpt')}
          value={value.excerpt}
          disabled={disabled}
          onChange={(event) => onChange({ excerpt: event.target.value })}
          placeholder="用 1–2 句說清楚讀者能得到什麼"
          className="mt-1.5 min-h-[64px] resize-y text-[13px] leading-relaxed"
        />
      </div>

      {/* Markdown 編輯／預覽 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        <Tabs value={tab} onValueChange={(next) => setTab(next === 'preview' ? 'preview' : 'edit')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(13,26,45,0.06)] px-3.5 py-2">
            <TabsList className="h-8 bg-slate-100">
              <TabsTrigger value="edit" className="h-6 px-3 text-[12px]">
                Markdown 編輯
              </TabsTrigger>
              <TabsTrigger value="preview" className="h-6 px-3 text-[12px]">
                預覽
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Hash size={12} strokeWidth={1.9} />
                字數 <strong className="font-semibold text-[#0d1a2d]">{wordCount}</strong>
                <span className="text-slate-400">（{seoDefaults.wordCountMin}–{seoDefaults.wordCountMax}）</span>
              </span>
              <span className="tabular-nums text-slate-400">{charCount} 字元</span>
            </div>
          </div>

          <TabsContent value="edit" className="m-0 p-3">
            <Textarea
              ref={registerField('body_md')}
              id="article-body"
              value={value.body_md}
              disabled={disabled}
              onChange={(event) => onChange({ body_md: event.target.value })}
              placeholder={'## 小節標題\n\n正文段落…\n\n- 清單項目\n- [內部連結](https://your-site.com/page)'}
              className="min-h-[440px] resize-y border-slate-200 bg-slate-50/40 font-mono text-[12.5px] leading-[1.75]"
              spellCheck={false}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              支援 Markdown（H2 分節、清單、圖片、連結）。圖片用 <code className="rounded bg-slate-100 px-1">![alt](url)</code>，alt 會納入軟檢查。
            </p>
          </TabsContent>

          <TabsContent value="preview" className="m-0 max-h-[560px] overflow-y-auto p-4">
            <div className="mx-auto max-w-[760px]">
              <ArticleBodyPreview markdown={value.body_md} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* SEO 欄位 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3.5 shadow-card">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
          <ListTree size={13} strokeWidth={1.9} className="text-teal-600" />
          SEO 中繼資料
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">
            範本：{seoDefaults.titleTemplate || '—'}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="article-meta-title" className="text-[11.5px] font-medium text-slate-600">
                Meta title
              </Label>
              <span className={cn('text-[11px] tabular-nums', counterTone(metaTitleLength > 0 && metaTitleLength <= 70).className)}>
                {metaTitleLength} / 建議 ≤ 70 字元
              </span>
            </div>
            <Input
              id="article-meta-title"
              ref={registerField('meta_title')}
              value={value.meta_title}
              disabled={disabled}
              onChange={(event) => onChange({ meta_title: event.target.value })}
              placeholder="可留空；以站點 title 範本組出"
              className="h-8 text-[12.5px]"
            />
          </div>

          <div className="md:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="article-meta-description" className="text-[11.5px] font-medium text-slate-600">
                Meta description <span className="text-rose-500">（硬檢查 50–160 字元）</span>
              </Label>
              <span className={cn('text-[11px] tabular-nums', counterTone(metaLength >= 50 && metaLength <= 160).className)}>
                {metaLength} / 50–160 字元
              </span>
            </div>
            <Textarea
              id="article-meta-description"
              ref={registerField('meta_description')}
              value={value.meta_description}
              disabled={disabled}
              onChange={(event) => onChange({ meta_description: event.target.value })}
              placeholder="搜尋結果摘要：說清楚痛點與收穫，不要關鍵字堆疊"
              className="min-h-[58px] resize-y text-[12.5px] leading-relaxed"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="article-slug" className="text-[11.5px] font-medium text-slate-600">
                Slug
              </Label>
              <button
                type="button"
                disabled={disabled}
                onClick={applySlugFromTitle}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50"
              >
                <Sparkles size={11} />由標題產生
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[12px] text-slate-400">/</span>
              <Input
                id="article-slug"
                ref={registerField('slug')}
                value={value.slug}
                disabled={disabled}
                onChange={(event) => onChange({ slug: event.target.value })}
                placeholder="english-kebab-case"
                className={cn('h-8 font-mono text-[12.5px]', !slugValid && value.slug.length > 0 && 'border-amber-300')}
              />
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              小寫英文 kebab-case、≤ 8 詞、站內唯一
              {value.slug.length > 0 && !slugValid && (
                <span className="ml-1 text-amber-600">（含非法字元，建議 {slugNormalized || '—'}）</span>
              )}
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="article-canonical" className="text-[11.5px] font-medium text-slate-600">
                Canonical
              </Label>
              <button
                type="button"
                disabled={disabled || !value.slug.trim()}
                onClick={applyCanonicalFromSlug}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50"
              >
                <Link2 size={11} />由 slug 產生
              </button>
            </div>
            <Input
              id="article-canonical"
              ref={registerField('canonical')}
              value={value.canonical}
              disabled={disabled}
              onChange={(event) => onChange({ canonical: event.target.value })}
              placeholder="https://your-site.com/slug"
              className="h-8 font-mono text-[12px]"
            />
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              硬檢查必填；站點 canonical base：
              <span className="ml-1 font-mono">{seoDefaults.canonicalBase || '（未設定）'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 空文章狀態（工作室在 route.id 缺失時用） */
export function ArticleEditorEmpty() {
  return (
    <ContentEmptyState
      icon={RotateCcw}
      title="尚未選擇文章"
      description="從文章佇列挑一篇，或請系統先為排程格生成草稿。"
    />
  );
}
