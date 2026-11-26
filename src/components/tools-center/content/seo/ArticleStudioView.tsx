/**
 * 審核工作室（M3-02～M3-07；PRD §8.2.4、§9.3）
 *
 * 版面：
 *   左：站點版式預覽（820px 正文寬、16:9 封面、H1/H2/正文/圖片，白卡模擬官網）
 *   中：ArticleEditor（Markdown／預覽、即時字數、meta／slug／canonical）
 *   右：檢查面板 Tabs（SeoQaPanel ＋ ImagePickerPanel）
 *   底：固定決策條 [存草稿][送審][駁回…][批准並排定 →]
 *
 * 資料與寫入一律走 useContentArticle：
 *   - 樂觀鎖 409 → 具名錯誤 `version_conflict` → Dialog 請使用者重新載入
 *   - 批准／駁回／Confirm 都走 `invokeContentFunction('content-publish')`
 *   - 未保存變更：UI 標記「未保存」＋ beforeunload 提醒
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  DatabaseZap,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import type { ContentArticle } from '@/lib/contentTypes.ts';
import {
  DEFAULT_BRAND_VOICE,
  DEFAULT_SEO_DEFAULTS,
  HONG_KONG_TIME_ZONE,
  formatZoneDateTime,
} from '@/lib/contentFormat.ts';
import { buildQaInput, evaluateSeoQa } from '@/lib/contentSeoQa.ts';
import { ARTICLE_STATUS_LABEL, publishStage } from '@/lib/contentState.ts';
import { can } from '@/lib/contentPermissions.ts';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import { isVersionConflictError, useContentArticle } from '@/hooks/useContentArticles';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import {
  ArticleBodyPreview,
  ArticleEditor,
  ArticleEditorEmpty,
  articleDraftFromArticle,
  diffArticleDraft,
  isDraftDirty,
  type ArticleDraftValues,
  type ArticleEditableField,
  type ArticleFocusRequest,
} from './ArticleEditor';
import { SeoQaPanel } from './SeoQaPanel';
import { ImagePickerPanel } from './ImagePickerPanel';
import { ConfirmDialog } from './ConfirmDialog';

/** 這些狀態仍可存草稿／編輯（已發佈、取消等終態不給改） */
const SAVEABLE_STATUSES = new Set<string>([
  'draft',
  'pending_review',
  'changes_requested',
  'held',
  'approved',
  'scheduled',
  'publish_failed',
  'verify_failed',
]);

const SUBMITABLE_STATUSES = new Set<string>(['draft', 'changes_requested', 'held']);
/** confirm 的合法來源：pending_review（approve+confirm）與 approved（confirm）；scheduled 由後端冪等處理但不改期 */
const CONFIRMABLE_STATUSES = new Set<string>(['pending_review', 'approved']);

function statusHint(status: string, canApprove: boolean): string {
  switch (status) {
    case 'draft':
      return '草稿：完成編輯後送審。';
    case 'pending_review':
      return canApprove ? '待審：可批准並排定，或駁回請撰稿人修改。' : '待審：你的角色只能編輯與送審，批准需總編輯／管理層。';
    case 'changes_requested':
      return '需修改：修正後重新送審。';
    case 'held':
      return '已保留（審核逾期或站點異常）：修正後可重新送審，永不自動發布。';
    case 'approved':
      return '已批准：請 Confirm 排定發佈時間。';
    case 'scheduled':
      return '已排程：到點由 worker 依發佈模式處理；如需改期可重新排定。';
    case 'publishing':
      return '發布中：請稍候，或到發布回執查看進度。';
    case 'published':
      return '已發佈：文章已公開發布。';
    case 'manual_done':
      return '已手動上線：人工貼上後回填，不計入自動發布漏斗。';
    case 'publish_failed':
    case 'verify_failed':
      return '發布／驗證失敗：到發布回執查看原因並重試。';
    case 'cancelled':
      return '已取消：此文章不再進入發布流程。';
    default:
      return '此狀態沒有可用的審核動作。';
  }
}

/** 站點版式預覽：白卡模擬官網（820px 正文寬） */
function SiteLayoutPreview({
  article,
  coverUrl,
  siteName,
  domain,
  timezone,
}: {
  article: ContentArticle;
  coverUrl: string | null;
  siteName: string | null;
  domain: string | null;
  timezone: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(13,26,45,0.06)] bg-slate-50/70 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#0d1a2d]">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
          站點版式預覽
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
          <span className="rounded bg-white px-1.5 py-0.5 font-mono">{domain || 'your-site.com'}</span>
          <span>820px 正文寬</span>
        </div>
      </div>

      <div className="max-h-[calc(100vh-300px)] overflow-y-auto bg-[#fbfcfe] p-3">
        <div className="mx-auto max-w-[820px] rounded-md border border-[rgba(13,26,45,0.06)] bg-white px-5 py-6 shadow-sm sm:px-8">
          {/* 官網頁首 */}
          <div className="flex items-center justify-between border-b border-[rgba(13,26,45,0.06)] pb-3">
            <div className="text-[13px] font-bold tracking-tight text-[#0d1a2d]">{siteName || '站點名稱'}</div>
            <div className="hidden gap-3 text-[10.5px] text-slate-400 sm:flex">
              <span>文章</span>
              <span>關於</span>
              <span>聯絡</span>
            </div>
          </div>

          {/* 16:9 封面 */}
          <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-md bg-slate-100">
            {coverUrl ? (
              <img src={coverUrl} alt={article.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-teal-700 to-slate-900 text-white/80">
                <ImageIcon size={22} strokeWidth={1.5} />
                <span className="px-6 text-center text-[13px] font-semibold leading-snug">
                  {article.title || '尚未設定封面'}
                </span>
              </div>
            )}
          </div>

          {/* H1 / 摘要 / 正文（H2、圖片由 Markdown 渲染） */}
          <article className="mt-5">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-400">
              <span>{formatZoneDateTime(article.created_at, timezone)}</span>
              <span>·</span>
              <span>{ARTICLE_STATUS_LABEL[article.status] ?? article.status}</span>
            </div>
            <h1 className="font-heading text-[27px] font-bold leading-snug tracking-tight text-[#0d1a2d]">
              {article.title || '（未命名文章）'}
            </h1>
            {article.excerpt && (
              <p className="mt-2 border-l-[3px] border-teal-200 pl-3 text-[13.5px] leading-relaxed text-slate-500">
                {article.excerpt}
              </p>
            )}
            <div className="mt-5">
              <ArticleBodyPreview markdown={article.body_md} />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

export function ArticleStudioView({ route, navigate }: ContentViewProps) {
  const { systemUser } = useAuth();
  const permissionUser = { role: systemUser?.role ?? null };
  const canWrite = can(permissionUser, 'write');
  const canApprove = can(permissionUser, 'approve');

  const {
    detail,
    assetUrls,
    existingSlugs,
    loading,
    error,
    missingSchema,
    refresh,
    saveDraft,
    submitForReview,
    approve,
    requestChanges,
    confirm,
    deletePublished,
    generateCover,
    setCover,
  } = useContentArticle(route.id, systemUser?.id ?? null);

  const [draftValues, setDraftValues] = useState<ArticleDraftValues | null>(null);
  const [focusRequest, setFocusRequest] = useState<ArticleFocusRequest | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'qa' | 'images'>('qa');

  const loadedVersionRef = useRef<string | null>(null);

  // 文章版本變更（初次載入、存檔後、重新載入）→ 以資料庫內容重設編輯器
  useEffect(() => {
    if (!detail) return;
    const key = `${detail.article.id}:${detail.article.version}`;
    if (loadedVersionRef.current === key) return;
    loadedVersionRef.current = key;
    setDraftValues(articleDraftFromArticle(detail.article));
  }, [detail]);

  const article = detail?.article ?? null;
  const timezone = detail?.site?.timezone?.trim() || HONG_KONG_TIME_ZONE;
  const stage = useMemo(
    () =>
      article
        ? publishStage(article, {
            manual: detail?.site?.publish_mode === 'manual',
          })
        : null,
    [article, detail?.site?.publish_mode],
  );

  /** 遠端刪除只對「真的由 adapter 發佈出去、有 external_id」的文章開放 */
  const deletable = Boolean(
    article &&
      !article.deleted_at &&
      article.external_id &&
      ['published', 'updating', 'verify_failed', 'draft_published'].includes(article.status),
  );

  const handleDeletePublished = async () => {
    if (!article) return;
    setBusyAction('delete');
    setDeleteError(null);
    try {
      await deletePublished(deleteReason);
      toast.success('已排入遠端刪除', {
        description:
          'worker 會在 2 分鐘內呼叫站點 API 真的刪除文章；完成後狀態變「已取消」並記錄刪除時間。',
      });
      setDeleteOpen(false);
      setDeleteReason('');
    } catch (thrown) {
      setDeleteError(contentErrorMessage(thrown));
    } finally {
      setBusyAction(null);
    }
  };

  const dirty = Boolean(
    detail && draftValues && isDraftDirty(draftValues, detail.article),
  );

  // 未保存變更 → 關閉／重新整理分頁前提醒
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const seoDefaults = useMemo(
    () => ({ ...DEFAULT_SEO_DEFAULTS, ...(detail?.site?.seo_defaults ?? {}) }),
    [detail?.site?.seo_defaults],
  );
  const brandVoice = useMemo(
    () => ({ ...DEFAULT_BRAND_VOICE, ...(detail?.site?.brand_voice ?? {}) }),
    [detail?.site?.brand_voice],
  );

  /** 以「目前編輯中的內容」即時算 QA，讓硬檢查在存檔前就能看到結果 */
  const qaArticle = useMemo<ContentArticle | null>(() => {
    if (!detail || !draftValues) return null;
    return {
      ...detail.article,
      title: draftValues.title,
      slug: draftValues.slug,
      excerpt: draftValues.excerpt,
      body_md: draftValues.body_md,
      meta_title: draftValues.meta_title,
      meta_description: draftValues.meta_description,
      canonical: draftValues.canonical,
    };
  }, [detail, draftValues]);

  const qa = useMemo(() => {
    if (!qaArticle) return null;
    return evaluateSeoQa(
      buildQaInput({
        article: qaArticle,
        seoDefaults,
        brandVoice,
        section: detail?.section ?? null,
        keyword: detail?.keyword?.keyword ?? null,
        existingSlugs,
      }),
    );
  }, [qaArticle, seoDefaults, brandVoice, detail?.section, detail?.keyword?.keyword, existingSlugs]);

  const handlePatch = useCallback((patch: Partial<ArticleDraftValues>) => {
    setDraftValues((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleFocusField = useCallback((field: ArticleEditableField) => {
    setFocusRequest({ field, nonce: Date.now() });
  }, []);

  const handleVersionConflict = useCallback(() => {
    setConflictOpen(true);
  }, []);

  const handleReload = useCallback(async () => {
    setConflictOpen(false);
    loadedVersionRef.current = null;
    await refresh();
    toast.info('已重新載入最新版本；你的未保存修改已捨棄。');
  }, [refresh]);

  const handleSaveDraft = async () => {
    if (!detail || !draftValues || !article) return;
    const patch = diffArticleDraft(draftValues, article);
    if (Object.keys(patch).length === 0) {
      toast.info('沒有需要儲存的變更。');
      return;
    }
    setBusyAction('save');
    try {
      await saveDraft(patch, article.version);
      toast.success('已儲存草稿');
    } catch (saveError) {
      if (isVersionConflictError(saveError)) {
        handleVersionConflict();
      } else {
        toast.error(contentErrorMessage(saveError));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmitForReview = async () => {
    if (!article) return;
    if (dirty) {
      toast.info('請先儲存草稿，再送審。');
      return;
    }
    setBusyAction('submit');
    try {
      await submitForReview(article.version);
      toast.success('已送審，等待總編輯批核。');
    } catch (submitError) {
      if (isVersionConflictError(submitError)) handleVersionConflict();
      else toast.error(contentErrorMessage(submitError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleReject = async () => {
    if (!article) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('請填寫駁回原因。');
      return;
    }
    setBusyAction('reject');
    setRejectError(null);
    try {
      await requestChanges(article.version, reason);
      toast.success('已駁回，撰稿人會看到原因。');
      setRejectOpen(false);
      setRejectReason('');
    } catch (rejectFailure) {
      if (isVersionConflictError(rejectFailure)) {
        setRejectOpen(false);
        handleVersionConflict();
      } else {
        setRejectError(contentErrorMessage(rejectFailure));
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirm = async (input: { expectedVersion: number; scheduledPublishAt: string }) => {
    try {
      // 後端狀態機：pending_review → approved → scheduled。
      // 「批准並排定」因此拆成 approve + confirm 兩個合法轉換；
      // approve 會把 version +1，confirm 以新版本號送樂觀鎖。
      if (article?.status === 'pending_review') {
        await approve(input.expectedVersion, input.scheduledPublishAt);
        await confirm({
          expectedVersion: input.expectedVersion + 1,
          scheduledPublishAt: input.scheduledPublishAt,
        });
      } else {
        await confirm(input);
      }
      toast.success('已批准並排定發佈時間。');
      setConfirmOpen(false);
      navigate('seo', 'articles');
    } catch (confirmError) {
      if (isVersionConflictError(confirmError)) {
        setConfirmOpen(false);
        handleVersionConflict();
        return;
      }
      throw confirmError;
    }
  };

  // ---------------- 四態 ----------------
  if (!route.id) {
    return (
      <ArticleEditorEmpty />
    );
  }

  if (missingSchema) {
    return (
      <ContentEmptyState
        icon={DatabaseZap}
        tone="warning"
        title="功能尚未啟用"
        description="審核工作室需要的資料表還沒建立（content_articles／content_assets）。請先執行 migration 後重新載入。"
        action={
          <Button size="sm" variant="outline" onClick={() => navigate('seo', 'articles')}>
            回到文章佇列
          </Button>
        }
      />
    );
  }

  if (error) {
    return (
      <ContentEmptyState
        icon={AlertTriangle}
        tone="error"
        title="工作室載入失敗"
        description={error}
        action={
          <>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新載入
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('seo', 'articles')}>
              回到文章佇列
            </Button>
          </>
        }
      />
    );
  }

  if (loading && !detail) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="載入文章工作室">
        <div className="h-20 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="h-[520px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card xl:col-span-2" />
          <div className="h-[320px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      </div>
    );
  }

  if (!detail || !article || !draftValues || !qa) {
    return (
      <ContentEmptyState
        icon={AlertTriangle}
        tone="warning"
        title="找不到這篇文章"
        description="連結可能已失效，或文章已被刪除。回到佇列重新挑一篇。"
        action={
          <Button size="sm" onClick={() => navigate('seo', 'articles')}>
            回到文章佇列
          </Button>
        }
      />
    );
  }

  const saveable = SAVEABLE_STATUSES.has(article.status);
  const submittable = SUBMITABLE_STATUSES.has(article.status);
  const confirmable = CONFIRMABLE_STATUSES.has(article.status);
  const busy = busyAction !== null;
  const saveDisabled = !canWrite || !dirty || !saveable || busy;
  const submitDisabled = !canWrite || !submittable || dirty || busy;
  const rejectDisabled = !canApprove || article.status !== 'pending_review' || busy;
  const confirmDisabled = !canApprove || !confirmable || dirty || busy;

  const coverUrl = detail.coverAsset ? assetUrls[detail.coverAsset.id] ?? null : null;
  const siteName = detail.site?.profile?.website_name ?? null;
  const domain = detail.site?.profile?.domain_url ?? null;
  const scheduledLabel = article.scheduled_publish_at
    ? formatZoneDateTime(article.scheduled_publish_at, timezone)
    : null;

  const suggestedTags = [detail.keyword?.keyword, detail.keyword?.cluster, detail.section?.name].filter(
    (tag): tag is string => Boolean(tag && tag.trim()),
  );

  return (
    <div className="space-y-4 pb-24">
      <ContentPageHeader
        title={article.title || '（未命名文章）'}
        subtitle={statusHint(article.status, canApprove)}
        eyebrow={
          <>
            <span className="font-semibold text-teal-700">{siteName ?? article.site_id}</span>
            {detail.section && <span className="text-slate-400">／{detail.section.name}</span>}
            {detail.keyword && <span className="text-slate-400">／{detail.keyword.keyword}</span>}
            {scheduledLabel && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <CalendarClock size={12} strokeWidth={2} />
                {scheduledLabel}（{timezone}）
              </span>
            )}
          </>
        }
        actions={
          <>
            {dirty && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle size={11} strokeWidth={2.2} />
                未保存
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate('seo', 'articles')}>
              <ArrowLeft size={13} />
              回佇列
            </Button>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading || busy}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
              重新載入
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
            <ContentStatusPill machine="article" status={article.status} />
            <span>版本 v{article.version}</span>
            <span>·</span>
            <span>建立 {formatZoneDateTime(article.created_at, timezone)}</span>
            <span>·</span>
            <span>更新 {formatZoneDateTime(article.updated_at, timezone)}</span>
            {article.reviewer_id && <span>· 審核者已指派</span>}
            {detail.revisions.length > 0 && <span>· {detail.revisions.length} 筆版本紀錄</span>}
          </div>
        }
      />

      {stage && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-3 py-2 shadow-card">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            發佈狀態
          </span>
          <ContentStatusPill label={stage.label} tone={stage.tone} />
          {detail?.site?.adapter === 'beauty100' && (
            <span className="text-[11.5px] text-slate-600">
              Beauty100 · {detail.section?.external_id || 'trending-topics'}
            </span>
          )}
          {article.live_url && (
            <a
              href={article.live_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-800"
            >
              站點文章
              <ExternalLink size={11} />
            </a>
          )}
          {article.external_id && (
            <span className="font-mono text-[10.5px] text-slate-400" title="站點文章 id">
              {article.external_id}
            </span>
          )}
          {article.deleted_at && (
            <span className="text-[11.5px] text-slate-500">
              已於 {formatZoneDateTime(article.deleted_at, timezone)} 遠端刪除
            </span>
          )}
          {stage.hint && (
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={stage.hint}>
              {stage.hint}
            </span>
          )}
          {article.reason && (
            <span className="max-w-full truncate text-[11px] text-rose-600" title={article.reason}>
              {article.reason}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)_360px]">
        {/* 左：站點版式預覽 */}
        <div className="min-w-0">
          <SiteLayoutPreview
            article={{ ...article, ...draftValues }}
            coverUrl={coverUrl}
            siteName={siteName}
            domain={domain}
            timezone={timezone}
          />
        </div>

        {/* 中：編輯器 */}
        <div className="min-w-0">
          <ArticleEditor
            value={draftValues}
            onChange={handlePatch}
            seoDefaults={seoDefaults}
            disabled={!canWrite || !saveable}
            focusRequest={focusRequest}
          />

          {detail.publishLogs.length > 0 && (
            <div className="mt-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
              <div className="mb-1.5 text-[12px] font-semibold text-[#0d1a2d]">最近發布回執</div>
              <ul className="space-y-1">
                {detail.publishLogs.slice(0, 3).map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span className="font-medium">{log.action}</span>
                    <span className={cn(log.http_status && log.http_status >= 400 ? 'text-rose-600' : 'text-slate-500')}>
                      HTTP {log.http_status ?? '—'}
                    </span>
                    <span className="text-muted-foreground">{formatZoneDateTime(log.created_at, timezone)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 右：檢查面板 */}
        <div className="min-w-0">
          <Tabs
            value={rightTab}
            onValueChange={(next) => setRightTab(next === 'images' ? 'images' : 'qa')}
          >
            <TabsList className="grid w-full grid-cols-2 bg-slate-100">
              <TabsTrigger value="qa" className="gap-1 text-[12px]">
                <ShieldCheck size={12} />
                SEO 檢查
                <span
                  className={cn(
                    'ml-1 rounded px-1 text-[10px] font-bold tabular-nums',
                    qa.hardPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
                  )}
                >
                  {qa.hard.filter((check) => check.passed).length}/{qa.hard.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="images" className="gap-1 text-[12px]">
                <ImageIcon size={12} />
                圖片
                {detail.coverAsset && <span className="ml-0.5 rounded bg-teal-100 px-1 text-[10px] font-bold text-teal-700">1</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="qa" className="mt-2">
              <SeoQaPanel
                report={qa}
                wordCountMin={seoDefaults.wordCountMin}
                wordCountMax={seoDefaults.wordCountMax}
                onFocusField={handleFocusField}
              />
            </TabsContent>

            <TabsContent value="images" className="mt-2">
              <ImagePickerPanel
                siteId={article.site_id}
                article={article}
                coverAsset={detail.coverAsset}
                imageAssets={detail.imageAssets}
                assetUrls={assetUrls}
                canEdit={canWrite && saveable}
                coverBusy={busyAction === 'cover'}
                suggestedTags={suggestedTags}
                onSelectCover={(assetId) => setCover(assetId)}
                onGenerateCover={async () => {
                  setBusyAction('cover');
                  try {
                    await generateCover();
                  } finally {
                    setBusyAction(null);
                  }
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* 固定決策條 */}
      <div className="sticky bottom-0 z-30 -mx-1 mt-2 rounded-lg border border-[rgba(13,26,45,0.1)] bg-white/95 px-3 py-2.5 shadow-[0_-4px_16px_rgba(13,26,45,0.08)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
            <ContentStatusPill machine="article" status={article.status} />
            {dirty ? (
              <span className="text-[11.5px] font-semibold text-amber-600">未保存變更</span>
            ) : (
              <span className="text-[11.5px] text-muted-foreground">已同步</span>
            )}
            {!canWrite && <span className="text-[11px] text-rose-600">你的角色只能檢視</span>}
            {!canApprove && (
              <span className="text-[11px] text-muted-foreground">批准／駁回需總編輯或管理層權限</span>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saveDisabled}
            onClick={() => void handleSaveDraft()}
            title={!dirty ? '目前沒有未保存變更' : '儲存草稿（含版本檢查）'}
          >
            {busyAction === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            存草稿
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={submitDisabled}
            onClick={() => void handleSubmitForReview()}
            title={dirty ? '請先存草稿再送審' : '送交總編輯審核'}
          >
            {busyAction === 'submit' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            送審
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={rejectDisabled}
            onClick={() => {
              setRejectError(null);
              setRejectOpen(true);
            }}
            title="駁回並請撰稿人修改"
            className={cn(rejectDisabled || 'text-rose-600 hover:text-rose-700')}
          >
            <ThumbsDown size={13} />
            駁回…
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={confirmDisabled}
            onClick={() => setConfirmOpen(true)}
            title={dirty ? '請先存草稿再 Confirm' : '批准並排定發布時間'}
            className="gap-1.5 bg-teal-600 hover:bg-teal-700"
          >
            <ShieldCheck size={13} />
            {article.status === 'approved' || article.status === 'scheduled' ? '確認排定 →' : '批准並排定 →'}
          </Button>

          {article.deleted_at && (
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
              已遠端刪除
            </span>
          )}

          {deletable && canApprove && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-rose-600 hover:text-rose-700"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              title="呼叫站點 API 真的刪除這篇文章（不是只刪 MPS 記錄）"
            >
              <Trash2 size={13} />
              刪除站點文章…
            </Button>
          )}
        </div>
      </div>

      {/* Confirm（M3-07） */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        article={article}
        site={detail.site}
        section={detail.section}
        keyword={detail.keyword}
        slot={detail.slot}
        coverAsset={detail.coverAsset}
        coverUrl={coverUrl}
        imageAssets={detail.imageAssets}
        imageUrls={assetUrls}
        qa={qa}
        existingSlugs={existingSlugs}
        submitting={busyAction === 'confirm'}
        onConfirm={handleConfirm}
      />

      {/* 遠端刪除（真的呼叫站點 API，不是只刪 MPS 記錄） */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => (!busy ? setDeleteOpen(next) : undefined)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[16px]">刪除站點上的文章？</DialogTitle>
            <DialogDescription className="text-[12.5px] leading-relaxed">
              這會呼叫站點 API <b>真的刪除</b>已發佈的文章（external_id：
              <code className="mx-1 rounded bg-slate-100 px-1">{article.external_id}</code>），
              不是只刪 MPS 記錄。刪除後無法復原；MPS 會保留一筆 delete 發佈回執供審計。
              Beauty100 的列表會自動重排，不會留下佔位符。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-rose-700">
              只支援由 adapter（Beauty100／WordPress／Shopify／Webflow／自訂端點）發佈的文章。
              Beauty100 會直接刪除官網上的文章，官網列表會自動重排；手動內容包沒有站點 ID，
              無法自動刪除，系統會明確提示改為手動處理。
            </p>
            <Textarea
              value={deleteReason}
              onChange={(event) => {
                setDeleteReason(event.target.value);
                setDeleteError(null);
              }}
              placeholder="下架原因（選填，會寫入刪除記錄）"
              className="min-h-[90px] text-[12.5px] leading-relaxed"
              disabled={busy}
            />
            {deleteError && <p className="text-[11.5px] text-rose-600">{deleteError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDeletePublished()}
            >
              {busyAction === 'delete' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              確認刪除站點文章
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 駁回 */}
      <Dialog open={rejectOpen} onOpenChange={(next) => (!busy ? setRejectOpen(next) : undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[16px]">駁回文章，請撰稿人修改</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              原因會寫入 <code className="rounded bg-slate-100 px-1">issue reason</code> 並通知撰稿人；
              文章狀態轉為「需修改」，修改後可重新送審。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={rejectReason}
              onChange={(event) => {
                setRejectReason(event.target.value);
                setRejectError(null);
              }}
              placeholder="例如：meta description 太短、內鏈不足、標題與關鍵字不符、缺圖片 alt…"
              className="min-h-[110px] text-[12.5px] leading-relaxed"
              disabled={busy}
            />
            {rejectError && <p className="text-[11.5px] text-rose-600">{rejectError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void handleReject()}
            >
              {busyAction === 'reject' ? <Loader2 size={13} className="animate-spin" /> : null}
              送出駁回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 版本衝突（409） */}
      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px]">文章已被其他人修改</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              你手上的版本（v{article.version}）已落後。為避免覆蓋別人的修改，請重新載入最新版本後再編輯。
              重新載入會捨棄你目前未保存的變更。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setConflictOpen(false)}>
              先不重新載入
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleReload()}
              className="gap-1.5 bg-teal-600 hover:bg-teal-700"
            >
              <RefreshCw size={13} />
              重新載入最新版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
