/**
 * 發佈回執（M1-22、M3-11、M3-12、PRD §9.3.4–9.3.5、§12）
 *
 * 兩個分頁：
 *   1. 待回填：手動模式（publish_mode = manual）到點後產出內容包、等人工貼上並回填 live URL
 *   2. 回執紀錄：content_publish_logs（append-only，前端只讀）
 *
 * 其他重點：
 *   - 失敗文章（publish_failed / verify_failed）可重試（Edge Function content-publish retry）
 *   - 回執表格可展開「稽核」：request / response JSON、actor_id、idempotency_key
 *   - 篩選：站點、動作、結果；分頁（前端分頁，後端最多取 500 筆）
 *   - 時間一律 formatZoneDateTime(iso, 站點時區)
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  DatabaseZap,
  Download,
  ExternalLink,
  FileClock,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { pageMeta } from '@/lib/contentNavigation.ts';
import type { ContentPublishAction, ContentPublishLog } from '@/lib/contentTypes.ts';
import { can } from '@/lib/contentPermissions.ts';
import { formatZoneDateTime } from '@/lib/contentFormat.ts';
import {
  articleScheduleLabel,
  useContentPublishLogs,
} from '@/hooks/useContentPublishLogs';
import type { ContentPublishArticleItem } from '@/hooks/useContentPublishLogs';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { SiteSelect } from '../shared/SiteSelect';

const LOG_PAGE_SIZE = 15;
const DAY_MS = 86_400_000;

type ResultFilter = 'all' | 'success' | 'failure';

const ACTION_LABEL: Record<string, string> = {
  package: '產生內容包',
  manual_done: '回填上線',
  publish: '發布',
  retry: '重試',
  verify: '上線驗證',
  approve: '批准',
  reject: '駁回',
  confirm: '確認排程',
  schedule: '排程',
  restore: '還原版本',
};

const ACTION_OPTIONS: ContentPublishAction[] = [
  'package',
  'publish',
  'manual_done',
  'retry',
  'verify',
  'approve',
  'reject',
  'confirm',
  'schedule',
  'restore',
];

function actionLabel(action: string | null | undefined): string {
  if (!action) return '—';
  return ACTION_LABEL[action] ?? action;
}

function prettyJson(value: unknown): string {
  if (value == null) return '{}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readStringField(source: unknown, keys: readonly string[]): string | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** 失敗原因：優先 response.error／message，其次 request.reason，最後 HTTP 狀態 */
function logFailureReason(log: ContentPublishLog): string | null {
  const fromResponse = readStringField(log.response, [
    'error',
    'error_message',
    'message',
    'reason',
    'detail',
  ]);
  if (fromResponse) return fromResponse;
  const fromRequest = readStringField(log.request, ['reason', 'error', 'message']);
  if (fromRequest) return fromRequest;
  if (typeof log.http_status === 'number' && log.http_status >= 400) {
    return `HTTP ${log.http_status}`;
  }
  const response = (log.response ?? {}) as Record<string, unknown>;
  if (response.ok === false) return '回應 ok = false（未附錯誤訊息）';
  return null;
}

/** 成功的判定：沒有 HTTP 錯誤、response.ok 不是 false、且沒有錯誤字串 */
function logSucceeded(log: ContentPublishLog): boolean {
  if (typeof log.http_status === 'number' && log.http_status >= 400) return false;
  if ((log.response as Record<string, unknown> | null)?.ok === false) return false;
  return logFailureReason(log) == null;
}

/**
 * 重試次數：
 *   1. 優先讀 Edge Function 寫入的 attempts／retry_count（不同實作欄位名可能不同）
 *   2. 找不到就退回「同一篇文章的 retry 回執數」（append-only 資料可如實數出來）
 */
function readRetryCount(log: ContentPublishLog, allLogs: readonly ContentPublishLog[]): number | null {
  for (const source of [log.response, log.request]) {
    if (!source || typeof source !== 'object') continue;
    const record = source as Record<string, unknown>;
    for (const key of ['attempts', 'attempt', 'retry_count', 'retries', 'retryCount']) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  if (log.article_id && log.action !== 'retry') {
    const retryLogs = allLogs.filter(
      (candidate) => candidate.article_id === log.article_id && candidate.action === 'retry',
    ).length;
    if (retryLogs > 0) return retryLogs;
  }
  return null;
}

function httpToneClass(status: number | null): string {
  if (status == null) return 'text-slate-400';
  if (status >= 400) return 'text-rose-600 font-semibold';
  if (status >= 300) return 'text-amber-700';
  return 'text-teal-700';
}

export function PublishLogView({ route, navigate }: ContentViewProps) {
  const meta = pageMeta(route);
  const { systemUser } = useAuth();
  const role = systemUser?.role ?? null;
  const canWrite = can({ role }, 'write');
  const canApprove = can({ role }, 'approve');

  const {
    logs,
    pendingItems,
    failedItems,
    loading,
    error,
    missingSchema,
    refresh,
    retry,
    manualDone,
    buildPackage,
    signPackageUrl,
    actingArticleId,
  } = useContentPublishLogs();

  const [tab, setTab] = useState<'pending' | 'logs'>('pending');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<'all' | ContentPublishAction>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [page, setPage] = useState(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [signingArticleId, setSigningArticleId] = useState<string | null>(null);
  const [buildingArticleId, setBuildingArticleId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [selectedSiteId, actionFilter, resultFilter]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (selectedSiteId && log.site_id !== selectedSiteId) return false;
        if (actionFilter !== 'all' && log.action !== actionFilter) return false;
        if (resultFilter === 'success' && !logSucceeded(log)) return false;
        if (resultFilter === 'failure' && logSucceeded(log)) return false;
        return true;
      }),
    [actionFilter, logs, resultFilter, selectedSiteId],
  );

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageLogs = filteredLogs.slice(
    (currentPage - 1) * LOG_PAGE_SIZE,
    currentPage * LOG_PAGE_SIZE,
  );

  const success24h = useMemo(
    () =>
      logs.filter(
        (log) => Date.now() - new Date(log.created_at).getTime() <= DAY_MS && logSucceeded(log),
      ).length,
    [logs],
  );

  const failureReasonOf = useCallback(
    (item: ContentPublishArticleItem): string | null => {
      const latestFailure = logs.find(
        (log) => log.article_id === item.article.id && !logSucceeded(log),
      );
      return (
        item.article.reason ||
        (latestFailure ? logFailureReason(latestFailure) : null) ||
        null
      );
    },
    [logs],
  );

  const handleDownloadPackage = useCallback(
    async (item: ContentPublishArticleItem) => {
      const packagePath = item.article.package_path;
      if (!packagePath) {
        toast.error('這篇文章還沒有內容包，請等發布工作產生。');
        return;
      }
      setSigningArticleId(item.article.id);
      try {
        const signedUrl = await signPackageUrl(packagePath);
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
        toast.success('已產生內容包下載連結（1 小時內有效）');
      } catch (thrown) {
        toast.error(thrown instanceof Error ? thrown.message : '無法下載內容包');
      } finally {
        setSigningArticleId(null);
      }
    },
    [signPackageUrl],
  );

  const handleBuildPackage = useCallback(
    async (item: ContentPublishArticleItem) => {
      if (!canApprove) {
        toast.error('沒有產生內容包的權限', {
          description: '產生內容包屬於 approve 權限：需要總編輯或管理層。',
        });
        return;
      }
      setBuildingArticleId(item.article.id);
      try {
        const result = await buildPackage(item.article.id);
        toast.success('內容包已產生', {
          description: `${result.filename} · 連結 1 小時內有效`,
        });
        if (result.signed_url) {
          window.open(result.signed_url, '_blank', 'noopener,noreferrer');
        }
      } catch (thrown) {
        toast.error(thrown instanceof Error ? thrown.message : '產生內容包失敗');
      } finally {
        setBuildingArticleId(null);
      }
    },
    [buildPackage, canApprove],
  );

  const handleManualDone = useCallback(    async (item: ContentPublishArticleItem) => {
      const articleId = item.article.id;
      const liveUrl = (urlDrafts[articleId] ?? '').trim();
      if (!liveUrl) {
        toast.error('請先貼上這篇文章的上線 URL。');
        return;
      }
      try {
        await manualDone(articleId, liveUrl);
        setUrlDrafts((drafts) => {
          const next = { ...drafts };
          delete next[articleId];
          return next;
        });
        toast.success('已回填上線 URL，狀態更新為「已手動上線」（manual_done）');
      } catch (thrown) {
        toast.error(thrown instanceof Error ? thrown.message : '回填失敗');
      }
    },
    [manualDone, urlDrafts],
  );

  const handleRetry = useCallback(
    async (item: ContentPublishArticleItem) => {
      try {
        await retry(item.article.id);
        toast.success('已重新排入發布佇列，稍後重新整理可看結果。');
      } catch (thrown) {
        toast.error(thrown instanceof Error ? thrown.message : '重試失敗');
      }
    },
    [retry],
  );

  const summaryCards = [
    {
      label: '待回填',
      value: pendingItems.length,
      hint: '內容包已產生，等人工貼上並回填 URL',
      tone: pendingItems.length > 0 ? 'blue' : 'slate',
      icon: FileClock,
    },
    {
      label: '失敗待處理',
      value: failedItems.length,
      hint: 'publish_failed / verify_failed，可重試',
      tone: failedItems.length > 0 ? 'rose' : 'slate',
      icon: XCircle,
    },
    {
      label: '回執總數',
      value: logs.length,
      hint: '最多顯示最近 500 筆',
      tone: 'slate',
      icon: CheckCircle2,
    },
    {
      label: '近 24 小時成功',
      value: success24h,
      hint: '不含失敗與重試中',
      tone: 'teal',
      icon: Clock,
    },
  ] as const;

  const renderPendingTab = () => {
    if (loading) {
      return (
        <div className="space-y-2" aria-busy="true" aria-label="載入待回填清單">
          <div className="h-28 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-28 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      );
    }

    if (pendingItems.length === 0 && failedItems.length === 0) {
      return (
        <ContentEmptyState
          icon={CheckCircle2}
          title="沒有待回填的文章"
          description="手動模式（publish_mode = manual）的文章到點、內容包產生後會出現在這裡。貼上官網後回填 live URL，狀態即轉為「已手動上線」；不計入自動發布漏斗。"
          action={
            <Button size="sm" variant="outline" onClick={() => navigate('seo', 'articles')}>
              前往文章佇列
            </Button>
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        {pendingItems.length === 0 ? (
          <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-4 py-3 text-[12px] text-muted-foreground shadow-card">
            目前沒有待回填的文章；下方是發布／驗證失敗、需要處理的項目。
          </div>
        ) : (
          <div className="space-y-2">
            {pendingItems.map((item) => (
              <PendingManualCard
                key={item.article.id}
                item={item}
                canWrite={canWrite}
                acting={actingArticleId === item.article.id}
                signing={signingArticleId === item.article.id}
                building={buildingArticleId === item.article.id}
                canApprove={canApprove}
                urlDraft={urlDrafts[item.article.id] ?? ''}
                onUrlDraftChange={(value) =>
                  setUrlDrafts((drafts) => ({ ...drafts, [item.article.id]: value }))
                }
                onDownload={() => void handleDownloadPackage(item)}
                onBuildPackage={() => void handleBuildPackage(item)}
                onSubmit={() => void handleManualDone(item)}
                onOpenStudio={() => navigate('seo', 'studio', item.article.id)}
              />
            ))}
          </div>
        )}

        {failedItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-rose-600" />
              <h3 className="text-[13px] font-semibold text-[#0d1a2d]">失敗待處理</h3>
              <span className="text-[12px] text-muted-foreground">
                {failedItems.length} 篇，重試會重新排入發布佇列
              </span>
            </div>
            {failedItems.map((item) => (
              <FailedArticleCard
                key={item.article.id}
                item={item}
                failureReason={failureReasonOf(item)}
                canApprove={canApprove}
                acting={actingArticleId === item.article.id}
                onRetry={() => void handleRetry(item)}
                onOpenStudio={() => navigate('seo', 'studio', item.article.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderLogsTab = () => {
    if (loading) {
      return (
        <div className="space-y-2" aria-busy="true" aria-label="載入回執紀錄">
          <div className="h-10 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-72 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      );
    }

    if (logs.length === 0) {
      return (
        <ContentEmptyState
          icon={FileClock}
          title="還沒有發佈回執"
          description="批准、發布、內容包、回填、驗證等動作都會由 Edge Function 寫入 content_publish_logs。回執是 append-only，前端只讀。"
        />
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SiteSelect
            value={selectedSiteId}
            onChange={setSelectedSiteId}
            allowAll
            placeholder="全部站點"
            className="w-[200px]"
          />
          <Select
            value={actionFilter}
            onValueChange={(value) => setActionFilter(value as 'all' | ContentPublishAction)}
          >
            <SelectTrigger className="h-9 w-[160px] bg-white text-[13px]">
              <SelectValue placeholder="動作" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部動作</SelectItem>
              {ACTION_OPTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {actionLabel(action)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={resultFilter}
            onValueChange={(value) => setResultFilter(value as ResultFilter)}
          >
            <SelectTrigger className="h-9 w-[140px] bg-white text-[13px]">
              <SelectValue placeholder="結果" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部結果</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="failure">失敗</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[12px] text-muted-foreground">
            符合 {filteredLogs.length} 筆 · 第 {currentPage}／{totalPages} 頁
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void refresh()}>
            <RefreshCw size={13} />
            重新整理
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-[12px]">
              <thead className="bg-slate-50/80 text-[11px] text-muted-foreground">
                <tr>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    時間
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    動作
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    站點
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    文章
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    external_id
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    URL
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-right font-medium">
                    HTTP
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-right font-medium">
                    耗時
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-right font-medium">
                    重試
                  </th>
                  <th className="border-b border-[rgba(13,26,45,0.06)] px-3 py-2 text-left font-medium">
                    失敗原因
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageLogs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                      沒有符合條件的回執。
                    </td>
                  </tr>
                ) : (
                  pageLogs.map((log) => {
                    const expanded = expandedLogId === log.id;
                    const failureReason = logFailureReason(log);
                    const retryCount = readRetryCount(log, logs);
                    return (
                      <Fragment key={log.id}>
                        <tr
                          className={cn(
                            'cursor-pointer border-t border-slate-100 align-top transition hover:bg-slate-50/70',
                            expanded && 'bg-slate-50/70',
                          )}
                          onClick={() => setExpandedLogId(expanded ? null : log.id)}
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {formatZoneDateTime(log.created_at, log.siteTimezone)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">
                            {actionLabel(log.action)}
                          </td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-slate-600">
                            {log.siteName ?? log.site_id ?? '—'}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-slate-700">
                            {log.articleTitle ?? log.article_id ?? '—'}
                          </td>
                          <td className="max-w-[160px] truncate px-3 py-2 font-mono text-[11px] text-slate-500">
                            {log.external_id ?? '—'}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2">
                            {log.url ? (
                              <a
                                href={log.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-800"
                                onClick={(event) => event.stopPropagation()}
                                title={log.url}
                              >
                                {log.url}
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className={cn('px-3 py-2 text-right tabular-nums', httpToneClass(log.http_status))}>
                            {log.http_status ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {log.duration_ms == null ? '—' : `${log.duration_ms} ms`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {retryCount == null ? '—' : retryCount}
                          </td>
                          <td className="max-w-[260px] px-3 py-2 text-rose-700">
                            {failureReason ? (
                              <span className="line-clamp-2" title={failureReason}>
                                {failureReason}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td colSpan={10} className="px-3 py-3">
                              <div className="grid gap-3 lg:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold text-slate-700">
                                    request
                                  </div>
                                  <pre className="max-h-52 overflow-auto rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-slate-700">
                                    {prettyJson(log.request)}
                                  </pre>
                                </div>
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold text-slate-700">
                                    response
                                  </div>
                                  <pre className="max-h-52 overflow-auto rounded-md border border-slate-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-slate-700">
                                    {prettyJson(log.response)}
                                  </pre>
                                </div>
                                <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2 lg:col-span-2">
                                  <div className="truncate">
                                    actor_id：
                                    <span className="font-mono">{log.actor_id ?? '—'}</span>
                                  </div>
                                  <div className="truncate">
                                    idempotency_key：
                                    <span className="font-mono">{log.idempotency_key ?? '—'}</span>
                                  </div>
                                  <div className="truncate">
                                    log id：<span className="font-mono">{log.id}</span>
                                  </div>
                                  <div className="truncate">
                                    article_id：
                                    <span className="font-mono">{log.article_id ?? '—'}</span>
                                  </div>
                                  <div className="truncate">
                                    site_id：<span className="font-mono">{log.site_id ?? '—'}</span>
                                  </div>
                                  <div className="truncate">
                                    動作：{log.action}（{actionLabel(log.action)}）
                                  </div>
                                  <div className="truncate">
                                    時區：<span className="font-mono">{log.siteTimezone}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[12px] text-muted-foreground">
            <span>
              回執為 append-only，前端只讀；重試／回填都經 Edge Function（service_role 寫入）。
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={currentPage <= 1}
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              >
                <ChevronLeft size={13} />
                上一頁
              </Button>
              <span className="px-1 tabular-nums">
                {currentPage}／{totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              >
                下一頁
                <ChevronRight size={13} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="發佈回執需要的資料表還沒建立（content_publish_logs／content_articles）。請先執行 migration 後重新載入。"
        />
      );
    }

    if (error) {
      return (
        <ContentEmptyState
          icon={AlertOctagon}
          tone="error"
          title="回執資料載入失敗"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新載入
            </Button>
          }
        />
      );
    }

    return (
      <Tabs value={tab} onValueChange={(value) => setTab(value as 'pending' | 'logs')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              待回填
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] font-semibold',
                  pendingItems.length > 0
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-500',
                )}
              >
                {pendingItems.length}
              </span>
              {failedItems.length > 0 && (
                <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700">
                  失敗 {failedItems.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5">
              回執紀錄
              <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">
                {logs.length}
              </span>
            </TabsTrigger>
          </TabsList>
          <p className="text-[11px] text-muted-foreground">
            稽核：展開任一列可看 request／response、actor_id 與 idempotency_key。
          </p>
        </div>
        <TabsContent value="pending">{renderPendingTab()}</TabsContent>
        <TabsContent value="logs">{renderLogsTab()}</TabsContent>
      </Tabs>
    );
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        title={meta.label}
        subtitle={meta.description}
        actions={
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            重新整理
          </Button>
        }
        meta={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              const toneClass =
                card.tone === 'rose'
                  ? 'border-rose-200 bg-rose-50/60 text-rose-700'
                  : card.tone === 'blue'
                    ? 'border-blue-200 bg-blue-50/60 text-blue-700'
                    : card.tone === 'teal'
                      ? 'border-teal-200 bg-teal-50/60 text-teal-700'
                      : 'border-[rgba(13,26,45,0.08)] bg-white text-slate-600';
              return (
                <div
                  key={card.label}
                  className={cn('rounded-md border px-3 py-2 shadow-card', toneClass)}
                  title={card.hint}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-medium">
                    <Icon size={12} />
                    {card.label}
                  </div>
                  <div className="mt-0.5 text-[20px] font-bold tabular-nums leading-tight">
                    {card.value}
                  </div>
                </div>
              );
            })}
          </div>
        }
      />

      {renderBody()}
    </div>
  );
}

interface PendingManualCardProps {
  item: ContentPublishArticleItem;
  canWrite: boolean;
  canApprove: boolean;
  acting: boolean;
  signing: boolean;
  building: boolean;
  urlDraft: string;
  onUrlDraftChange: (value: string) => void;
  onDownload: () => void;
  onBuildPackage: () => void;
  onSubmit: () => void;
  onOpenStudio: () => void;
}

function PendingManualCard({
  item,
  canWrite,
  canApprove,
  acting,
  signing,
  building,
  urlDraft,
  onUrlDraftChange,
  onDownload,
  onBuildPackage,
  onSubmit,
  onOpenStudio,
}: PendingManualCardProps) {
  const { article, siteName, siteTimezone } = item;
  const hasPackage = Boolean(article.package_path);
  return (
    <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusPill machine="article" status={article.status} />
            <span className="text-[12px] text-muted-foreground">{siteName ?? article.site_id}</span>
            <span className="text-[12px] text-muted-foreground">· {siteTimezone}</span>
          </div>
          <h3 className="mt-1 truncate text-[14px] font-semibold text-[#0d1a2d]">
            {article.title || '（無標題）'}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            排定時間：{articleScheduleLabel(item)}
            {article.slug ? ` · slug: ${article.slug}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!hasPackage && (
            <Button
              size="sm"
              onClick={onBuildPackage}
              disabled={!canApprove || building}
              title={
                canApprove
                  ? '立即產生內容包（HTML + 圖片 + meta + README，zip）'
                  : '只有總編輯／管理層可以產生內容包'
              }
            >
              {building ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
              產生內容包
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onDownload}
            disabled={!hasPackage || signing}
            title={hasPackage ? '以 1 小時簽名 URL 下載內容包' : '內容包尚未產生'}
          >
            {signing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            下載內容包
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenStudio}>
            <ExternalLink size={13} />
            開啟工作室
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FileClock size={12} />
          內容包：
          {hasPackage ? (
            <span className="font-mono text-slate-600" title={article.package_path ?? ''}>
              {article.package_path}
            </span>
          ) : (
            <span className="text-amber-700">
              尚未產生（可按「產生內容包」立即產出，或等發布工作到點自動產生）
            </span>
          )}
        </span>
        {article.live_url && (
          <span className="inline-flex items-center gap-1">
            live URL：
            <a
              href={article.live_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-teal-700 underline"
            >
              {article.live_url}
            </a>
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <div className="min-w-[260px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-slate-600">
            貼上這篇文章的上線 URL 後回填
          </label>
          <Input
            className="h-9 bg-white text-[13px]"
            placeholder="https://example.com/blog/article-slug"
            value={urlDraft}
            disabled={!canWrite || acting}
            onChange={(event) => onUrlDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canWrite && !acting) onSubmit();
            }}
          />
        </div>
        <Button size="sm" onClick={onSubmit} disabled={!canWrite || acting || urlDraft.trim().length === 0}>
          {acting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          回填上線 URL
        </Button>
        {!canWrite && (
          <span className="text-[11px] text-amber-700">
            你的角色沒有回填權限（需要生成／編輯權限）。
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        手動模式不會自動呼叫站點 API：貼上後回填即可，狀態為「已手動上線」（manual_done），不計入自動發布漏斗。
      </p>
    </div>
  );
}

interface FailedArticleCardProps {
  item: ContentPublishArticleItem;
  failureReason: string | null;
  canApprove: boolean;
  acting: boolean;
  onRetry: () => void;
  onOpenStudio: () => void;
}

function FailedArticleCard({
  item,
  failureReason,
  canApprove,
  acting,
  onRetry,
  onOpenStudio,
}: FailedArticleCardProps) {
  const { article, siteName, siteTimezone } = item;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusPill machine="article" status={article.status} />
            <span className="text-[12px] text-muted-foreground">{siteName ?? article.site_id}</span>
            <span className="text-[12px] text-muted-foreground">· {siteTimezone}</span>
          </div>
          <h3 className="mt-1 truncate text-[14px] font-semibold text-[#0d1a2d]">
            {article.title || '（無標題）'}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            最近更新：{formatZoneDateTime(article.updated_at, siteTimezone)}
            {article.scheduled_publish_at
              ? ` · 排定 ${formatZoneDateTime(article.scheduled_publish_at, siteTimezone)}`
              : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={!canApprove || acting}
            title={canApprove ? '重新排入發布佇列' : '重試需要批准權限'}
          >
            {acting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            重試
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenStudio}>
            <ExternalLink size={13} />
            開啟工作室
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose-200 bg-white/70 px-2 py-1.5 text-[11px] leading-relaxed text-rose-800">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          失敗原因：{failureReason || '未記錄（可展開回執紀錄的稽核查看 response）'}
        </span>
      </div>
      {!canApprove && (
        <p className="mt-1 text-[11px] text-amber-700">你的角色沒有批准／重試權限。</p>
      )}
    </div>
  );
}
