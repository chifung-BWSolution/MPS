/**
 * 每站 SEO 預設（M1-11、PRD §9.1.3）
 *
 * 全部欄位可編輯，右側即時預覽「這篇將送出的 title／meta／slug／canonical／JSON-LD」。
 * 送出路徑：`saveSite` → `content-sites` Edge Function 的 `upsert_settings`（patch.seo_defaults）。
 *
 * props 由 SiteDetailView 呼叫（同 owner 自訂，不在契約 §4 的跨 owner 清單內）。
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ClipboardCopy, RefreshCw, Save, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  applyTemplate,
  canonicalUrl,
  slugifyTitle,
} from '@/lib/contentFormat';
import { buildArticleJsonLd } from '@/lib/contentGenerate';
import { contentErrorMessage } from '@/lib/contentApi';
import type {
  ContentArticle,
  ContentJsonLdType,
  ContentSeoDefaults,
  ContentSiteWithProfile,
} from '@/lib/contentTypes';
import {
  LOCALE_OPTIONS,
  normalizeContentSeoDefaults,
  parseListInput,
  saveSite,
} from '@/hooks/useContentSites';

const SAMPLE_TITLE = '範例文章標題';
const SAMPLE_EXCERPT = '這是一段範例摘要，用來預覽 meta description 與 JSON-LD 將送出的內容。';

export interface SeoDefaultsFormProps {
  site: ContentSiteWithProfile;
  /** 儲存成功後回呼（SiteDetailView 用來 refresh 詳情） */
  onSaved?: () => void | Promise<void>;
  /** 沒有 manage_sites 權限時禁用所有寫入 */
  disabled?: boolean;
  className?: string;
}

interface SeoFormState {
  locale: string;
  titleTemplate: string;
  metaTemplate: string;
  slugRule: string;
  canonicalBase: string;
  author: string;
  publisher: string;
  ogImage: string;
  jsonLdType: ContentJsonLdType;
  robotsDraft: string;
  robotsLive: string;
  wordCountMin: string;
  wordCountMax: string;
  internalLinksMin: string;
  internalLinksMax: string;
  bannedWordsText: string;
  categoryMapText: string;
}

function toFormState(defaults: ContentSeoDefaults): SeoFormState {
  return {
    locale: defaults.locale,
    titleTemplate: defaults.titleTemplate,
    metaTemplate: defaults.metaTemplate,
    slugRule: defaults.slugRule,
    canonicalBase: defaults.canonicalBase,
    author: defaults.author,
    publisher: defaults.publisher,
    ogImage: defaults.ogImage,
    jsonLdType: defaults.jsonLdType,
    robotsDraft: defaults.robotsDraft,
    robotsLive: defaults.robotsLive,
    wordCountMin: String(defaults.wordCountMin),
    wordCountMax: String(defaults.wordCountMax),
    internalLinksMin: String(defaults.internalLinksMin),
    internalLinksMax: String(defaults.internalLinksMax),
    bannedWordsText: defaults.bannedWords.join('、'),
    categoryMapText: JSON.stringify(defaults.categoryMap ?? {}, null, 2),
  };
}

function toNonNegativeInt(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

/** slugRule（例如 `english-kebab-8`）尾數即最大詞數 */
function maxWordsFromSlugRule(slugRule: string): number {
  const match = /(\d{1,2})\s*$/.exec(slugRule.trim());
  if (!match) return 8;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(20, Math.max(1, parsed));
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[12px] font-semibold text-slate-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
      <header>
        <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">{title}</h3>
        {description && (
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </header>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function SeoDefaultsForm({ site, onSaved, disabled, className }: SeoDefaultsFormProps) {
  // 以 updated_at 作為版本鍵：站點真的被更新才重置表單，
  // 憑證／連線測試造成的 refresh 不會洗掉未儲存的 SEO 編輯。
  const siteVersion = `${site.website_profile_id}:${site.updated_at}`;
  const siteDefaults = useMemo(
    () => normalizeContentSeoDefaults(site.seo_defaults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteVersion],
  );
  const [form, setForm] = useState<SeoFormState>(() => toFormState(siteDefaults));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 站點資料刷新後（例如儲存完成）同步回表單
  useEffect(() => {
    setForm(toFormState(siteDefaults));
  }, [siteDefaults]);

  const update = <K extends keyof SeoFormState>(key: K, value: SeoFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  };

  const brand = (site.profile?.brand || site.profile?.website_name || '').trim();
  const siteName = (site.profile?.website_name || site.website_profile_id).trim();
  const domainFallback = site.profile?.domain_url?.trim() || '';

  /** 由表單組回契約的 ContentSeoDefaults（含驗證） */
  const buildDraft = (): { draft: ContentSeoDefaults; error: string | null } => {
    const wordCountMin = toNonNegativeInt(form.wordCountMin, 800);
    const wordCountMax = toNonNegativeInt(form.wordCountMax, 1500);
    const internalLinksMin = toNonNegativeInt(form.internalLinksMin, 2);
    const internalLinksMax = toNonNegativeInt(form.internalLinksMax, 3);

    if (!form.titleTemplate.trim()) return { draft: siteDefaults, error: 'title 模板不可為空。' };
    if (!form.metaTemplate.trim()) return { draft: siteDefaults, error: 'meta 模板不可為空。' };
    if (!form.slugRule.trim()) return { draft: siteDefaults, error: 'slug 規則不可為空。' };
    if (wordCountMax < wordCountMin) {
      return { draft: siteDefaults, error: '字數上限不可小於下限。' };
    }
    if (internalLinksMax < internalLinksMin) {
      return { draft: siteDefaults, error: '內鏈上限不可小於下限。' };
    }

    let categoryMap: Record<string, string> = {};
    if (form.categoryMapText.trim()) {
      try {
        const parsed: unknown = JSON.parse(form.categoryMapText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { draft: siteDefaults, error: 'categoryMap 必須是 JSON 物件（例如 {"裝修": "renovation"}）。' };
        }
        categoryMap = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value !== 'string') {
            return { draft: siteDefaults, error: `categoryMap["${key}"] 必須是字串。` };
          }
          categoryMap[key] = value;
        }
      } catch {
        return { draft: siteDefaults, error: 'categoryMap 不是有效的 JSON，請檢查格式。' };
      }
    }

    return {
      draft: {
        locale: form.locale.trim() || siteDefaults.locale,
        titleTemplate: form.titleTemplate.trim(),
        metaTemplate: form.metaTemplate.trim(),
        slugRule: form.slugRule.trim(),
        canonicalBase: form.canonicalBase.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim(),
        ogImage: form.ogImage.trim(),
        jsonLdType: form.jsonLdType,
        categoryMap,
        robotsDraft: form.robotsDraft.trim(),
        robotsLive: form.robotsLive.trim(),
        wordCountMin,
        wordCountMax,
        internalLinksMin,
        internalLinksMax,
        bannedWords: parseListInput(form.bannedWordsText),
      },
      error: null,
    };
  };

  const { draft, error: draftError } = buildDraft();

  // ------------------------------------------------------------
  // 即時預覽：套模板 → slug → canonical → JSON-LD
  // ------------------------------------------------------------
  const preview = useMemo(() => {
    const publishedAt = new Date().toISOString();
    const templateValues: Record<string, string> = {
      title: SAMPLE_TITLE,
      brand,
      site: siteName,
      publisher: draft.publisher || siteName,
      author: draft.author,
      excerpt: SAMPLE_EXCERPT,
      keyword: '範例關鍵字',
      section: '文章',
      date: publishedAt.slice(0, 10),
    };
    const title = applyTemplate(draft.titleTemplate, templateValues);
    const meta = applyTemplate(draft.metaTemplate, templateValues);
    const maxWords = maxWordsFromSlugRule(draft.slugRule);
    const slug = slugifyTitle(SAMPLE_TITLE, maxWords);
    const canonical = canonicalUrl(draft.canonicalBase || domainFallback, slug);

    const sampleArticle: Pick<
      ContentArticle,
      'title' | 'excerpt' | 'body_md' | 'body_html' | 'published_at' | 'updated_at' | 'cover_asset_id'
    > = {
      title: SAMPLE_TITLE,
      excerpt: SAMPLE_EXCERPT,
      body_md: '',
      body_html: '',
      published_at: null,
      updated_at: publishedAt,
      cover_asset_id: null,
    };

    const jsonLd = buildArticleJsonLd({
      article: sampleArticle,
      seoDefaults: draft,
      canonical,
      wordCount: draft.wordCountMin,
    });

    return {
      title,
      meta,
      slug,
      canonical,
      jsonLdText: JSON.stringify(jsonLd, null, 2),
      titleLength: title.length,
      metaLength: meta.length,
    };
  }, [draft, brand, siteName, domainFallback]);

  const copyJsonLd = async () => {
    try {
      await navigator.clipboard.writeText(preview.jsonLdText);
      setCopied(true);
      toast.success('已複製 JSON-LD');
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      toast.error('瀏覽器不允許存取剪貼簿，請手動選取 JSON 片段。');
    }
  };

  const handleSave = async () => {
    if (disabled) return;
    if (draftError) {
      setFormError(draftError);
      toast.error('SEO 預設未儲存', { description: draftError });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveSite(site.website_profile_id, { seo_defaults: draft });
      toast.success('已儲存 SEO 預設', {
        description: '後續生成的文章會用這組 title／meta／slug／JSON-LD 規則。',
      });
      await onSaved?.();
    } catch (thrown) {
      const message = contentErrorMessage(thrown);
      setFormError(message);
      toast.error('儲存 SEO 預設失敗', { description: message });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm(toFormState(siteDefaults));
    setFormError(null);
  };

  return (
    <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]', className)}>
      <div className="min-w-0 space-y-3">
        <FormSection
          title="搜尋結果顯示的標題與描述"
          description="可用變數：{title} 文章標題、{brand} 品牌名、{excerpt} 摘要、{keyword} 關鍵字、{section} 欄目、{site} 網站名、{author} 作者、{publisher} 發佈者、{date} 日期"
        >
          <Field label="網站語言" hint="會寫進文章與給 Google 的資料（inLanguage）">
            <Select
              value={form.locale}
              onValueChange={(value) => update('locale', value)}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 bg-white text-[13px]">
                <SelectValue placeholder="選擇語言" />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="內容標記（給 Google 讀）" hint="一般網誌文章選第一個；新聞、專欄等通用文章選第二個">
            <Select
              value={form.jsonLdType}
              onValueChange={(value) => update('jsonLdType', value as ContentJsonLdType)}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 bg-white text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BlogPosting">網誌文章（建議）</SelectItem>
                <SelectItem value="Article">一般文章（新聞、專欄）</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="搜尋標題格式" hint="{title} 會換成文章標題、{brand} 換成品牌名；建議 60 字元內" className="sm:col-span-2">
            <Input
              value={form.titleTemplate}
              onChange={(event) => update('titleTemplate', event.target.value)}
              placeholder="{title}｜{brand}"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="搜尋描述格式" hint="{excerpt} 會換成文章摘要；建議 50–160 字元" className="sm:col-span-2">
            <Input
              value={form.metaTemplate}
              onChange={(event) => update('metaTemplate', event.target.value)}
              placeholder="{excerpt}"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="網址代稱規則" hint="英文小寫、用連字號連接；尾數是「最多幾個詞」（例：english-kebab-8）">
            <Input
              value={form.slugRule}
              onChange={(event) => update('slugRule', event.target.value)}
              placeholder="english-kebab-8"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="正式網址前綴（選填）" hint="留空時自動用網站網域；只有文章網址不在網站根目錄時才需要填">
            <Input
              value={form.canonicalBase}
              onChange={(event) => update('canonicalBase', event.target.value)}
              placeholder={domainFallback || 'https://example.com'}
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="文章作者名稱（選填）">
            <Input
              value={form.author}
              onChange={(event) => update('author', event.target.value)}
              placeholder="品牌或作者名稱"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="網站／品牌名稱（選填，給 Google 的發佈者）">
            <Input
              value={form.publisher}
              onChange={(event) => update('publisher', event.target.value)}
              placeholder={siteName}
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="分享預設圖片網址（選填）" hint="分享到 Facebook／WhatsApp 時顯示的圖片" className="sm:col-span-2">
            <Input
              value={form.ogImage}
              onChange={(event) => update('ogImage', event.target.value)}
              placeholder="https://example.com/og-cover.jpg"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
        </FormSection>

        <FormSection
          title="搜尋引擎收錄與字數"
          description="草稿建議不要被 Google 收錄；正式上線後才允許收錄"
        >
          <Field label="草稿的搜尋設定" hint="建議 noindex,nofollow：草稿不要被搜尋到">
            <Input
              value={form.robotsDraft}
              onChange={(event) => update('robotsDraft', event.target.value)}
              placeholder="noindex,nofollow"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="上線後的搜尋設定" hint="建議 index,follow：讓 Google 收錄">
            <Input
              value={form.robotsLive}
              onChange={(event) => update('robotsLive', event.target.value)}
              placeholder="index,follow"
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="文章字數下限">
            <Input
              type="number"
              min={0}
              value={form.wordCountMin}
              onChange={(event) => update('wordCountMin', event.target.value)}
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="文章字數上限">
            <Input
              type="number"
              min={0}
              value={form.wordCountMax}
              onChange={(event) => update('wordCountMax', event.target.value)}
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="文章內部連結下限" hint="文章內至少要連到幾個站內頁面">
            <Input
              type="number"
              min={0}
              value={form.internalLinksMin}
              onChange={(event) => update('internalLinksMin', event.target.value)}
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <Field label="文章內部連結上限">
            <Input
              type="number"
              min={0}
              value={form.internalLinksMax}
              onChange={(event) => update('internalLinksMax', event.target.value)}
              disabled={disabled}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
        </FormSection>

        <FormSection title="禁用詞與分類對照" description="禁用詞以逗號、頓號或換行分隔">
          <Field label="禁用詞（SEO 檢查會擋下）" className="sm:col-span-2">
            <Textarea
              value={form.bannedWordsText}
              onChange={(event) => update('bannedWordsText', event.target.value)}
              placeholder="療效、保證有效、最好"
              disabled={disabled}
              className="min-h-[64px] bg-white text-[13px]"
            />
          </Field>
          <Field
            label="分類對照（進階，可不填）"
            hint='左邊是文章分類、右邊是網站欄目的網址代稱；例如 {"裝修": "renovation"}；留空即不映射'
            className="sm:col-span-2"
          >
            <Textarea
              value={form.categoryMapText}
              onChange={(event) => update('categoryMapText', event.target.value)}
              placeholder={'{\n  "裝修": "renovation"\n}'}
              disabled={disabled}
              className="min-h-[104px] bg-white font-mono text-[12px]"
            />
          </Field>
        </FormSection>

        {formError && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-[12.5px] text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void handleSave()} disabled={disabled || saving}>
            {saving ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            儲存 SEO 預設
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resetForm}
            disabled={disabled || saving}
            className="gap-1.5"
          >
            <RefreshCw size={13} />
            還原
          </Button>
          {!disabled && (
            <span className="text-[11.5px] text-muted-foreground">
              儲存後會套用到之後生成的文章
            </span>
          )}
        </div>
      </div>

      {/* ---------------- 右側：即時送出預覽 ---------------- */}
      <aside className="min-w-0 self-start space-y-3 lg:sticky lg:top-4">
        <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
          <div className="flex items-center gap-2 border-b border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-3 py-2">
            <Wand2 size={13} className="text-teal-600" />
            <span className="text-[12.5px] font-bold text-[#0d1a2d]">送出預覽</span>
            <span className="ml-auto text-[10.5px] text-muted-foreground">假資料：{SAMPLE_TITLE}</span>
          </div>

          <div className="space-y-3 px-3 py-3">
            <PreviewRow label="搜尋標題">
              <p className="text-[13px] font-semibold leading-snug text-[#0d1a2d]">
                {preview.title || '（空）'}
              </p>
              <LengthHint length={preview.titleLength} limit={60} />
            </PreviewRow>

            <PreviewRow label="搜尋描述">
              <p className="text-[12.5px] leading-relaxed text-slate-700">
                {preview.meta || '（空）'}
              </p>
              <LengthHint length={preview.metaLength} limit={160} />
            </PreviewRow>

            <PreviewRow label="網址代稱">
              <p className="break-all font-mono text-[12px] text-slate-700">{preview.slug}</p>
            </PreviewRow>

            <PreviewRow label="正式網址">
              <p className="break-all font-mono text-[12px] text-slate-700">
                {preview.canonical || '（無網域）'}
              </p>
            </PreviewRow>

            <PreviewRow
              label="給 Google 的結構化資料"
              action={
                <button
                  type="button"
                  onClick={() => void copyJsonLd()}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-50"
                >
                  {copied ? <Check size={11} /> : <ClipboardCopy size={11} />}
                  {copied ? '已複製' : '複製'}
                </button>
              }
            >
              <pre className="max-h-[280px] overflow-auto rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50 px-2 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
                {preview.jsonLdText}
              </pre>
            </PreviewRow>
          </div>
        </div>

        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 text-[11.5px] leading-relaxed text-muted-foreground shadow-card">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
            <Wand2 size={12} className="text-teal-600" />
            生成時怎麼用這組設定
          </p>
          <p>
            標題與描述會把上面的變數換成實際內容；網址代稱取英文標題前{' '}
            {maxWordsFromSlugRule(form.slugRule)} 個詞，撞名時自動加後綴；正式網址由「前綴＋網址代稱」組成。
            下方給 Google 的資料會用實際文章重算，這裡只是即時預覽。
          </p>
        </div>
      </aside>
    </div>
  );
}

function PreviewRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function LengthHint({ length, limit }: { length: number; limit: number }) {
  const over = length > limit;
  return (
    <p className={cn('text-[10.5px] tabular-nums', over ? 'text-amber-600' : 'text-muted-foreground')}>
      {length} / {limit} 字{over ? '（偏長，可能被截斷）' : ''}
    </p>
  );
}
