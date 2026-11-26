/**
 * 文章佇列（M3-01；PRD §8.2.1、§8.3、§9.3.2）
 *
 * - 篩選：站點（SiteSelect）／狀態／建立日期範圍；標題搜尋（server-side ilike）
 * - 表格（共用 ContentTable）：標題／站點／關鍵字／狀態／排定時間／待審時長／操作
 * - 批次：只提供「批次送審」等安全操作；批准／駁回必須逐篇進工作室（硬檢查不可繞過）
 * - 頂部指標：待審 N／需修改 N／已排程 N／已發佈本週 N
 * - 四態：loading／empty／error／missingSchema
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  DatabaseZap,
  ExternalLink,
  Inbox,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { pageMeta } from '@/lib/contentNavigation.ts';
import type { ContentArticleListItem } from '@/lib/contentTypes.ts';
import { ARTICLE_STATUS_LABEL, publishStage } from '@/lib/contentState.ts';
import { HONG_KONG_TIME_ZONE, formatRelativeHours, formatZoneDateTime } from '@/lib/contentFormat.ts';
import { can } from '@/lib/contentPermissions.ts';
import type { ContentArticleStatus } from '@/lib/contentTypes.ts';
import { useContentArticles, CONTENT_ARTICLES_PAGE_SIZE } from '@/hooks/useContentArticles';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { ContentMetricBar } from '../shell/ContentMetricBar';
import { SiteSelect } from '../shared/SiteSelect';
import { ContentTable, type ContentTableColumn } from '../shared/ContentTable';

/** 可批次送審的狀態（其他狀態要進工作室逐篇處理） */
const BATCH_SUBMIT_STATUSES = new Set<string>(['draft', 'changes_requested']);

const STATUS_OPTIONS: ContentArticleStatus[] = [
  'draft',
  'pending_review',
  'changes_requested',
  'held',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'publish_failed',
  'verify_failed',
  'manual_done',
  'draft_published',
  'cancelled',
];

function siteNameOf(item: ContentArticleListItem): string {
  return item.site?.website_name || item.article.site_id;
}

function isBatchEligible(item: ContentArticleListItem): boolean {
  return BATCH_SUBMIT_STATUSES.has(item.article.status);
}

export function ArticleQueueView({ route, navigate }: ContentViewProps) {
  const meta = pageMeta(route);
  const { systemUser } = useAuth();
  const canWrite = can({ role: systemUser?.role ?? null }, 'write');

  const [siteId, setSiteId] = useState<string | null>(route.id ?? null);
  const [status, setStatus] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const {
    items,
    total,
    loading,
    error,
    missingSchema,
    refresh,
    page,
    setPage,
    metrics,
    submitManyForReview,
  } = useContentArticles({ siteId, status, search, dateFrom, dateTo });

  // 搜尋 debounce（避免每個字都打一次 PostgREST）
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // 篩選條件變更 → 回到第 1 頁並清空批次選取
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, status, search, dateFrom, dateTo]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const eligibleItems = useMemo(() => items.filter(isBatchEligible), [items]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.article.id)),
    [items, selectedIds],
  );
  const selectedEligible = useMemo(
    () => selectedItems.filter(isBatchEligible),
    [selectedItems],
  );
  const selectedNotEligible = selectedItems.length - selectedEligible.length;

  const hasActiveFilters = Boolean(siteId || status || dateFrom || dateTo || search);
  const totalPages = Math.max(1, Math.ceil(total / CONTENT_ARTICLES_PAGE_SIZE));

  const toggleSelect = (articleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  };

  const selectAllEligible = () => {
    setSelectedIds(new Set(eligibleItems.map((item) => item.article.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const clearFilters = () => {
    setSiteId(null);
    setStatus(null);
    setDateFrom('');
    setDateTo('');
    setSearchInput('');
    setSearch('');
  };

  const openStudio = useCallback(
    (articleId: string) => navigate('seo', 'studio', articleId),
    [navigate],
  );

  const handleBatchSubmit = async () => {
    if (selectedEligible.length === 0) return;
    setBatchBusy(true);
    try {
      const result = await submitManyForReview(
        selectedEligible.map((item) => ({
          articleId: item.article.id,
          expectedVersion: item.article.version,
        })),
      );
      if (result.submitted > 0) {
        toast.success(`已送審 ${result.submitted} 篇`);
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} 篇送審失敗：${result.failed[0].message}`);
      }
      setSelectedIds(new Set());
    } catch (batchError) {
      toast.error(batchError instanceof Error ? batchError.message : '批次送審失敗');
    } finally {
      setBatchBusy(false);
    }
  };

  const columns = useMemo<ContentTableColumn<ContentArticleListItem>[]>(
    () => [
      {
        key: 'select',
        header: '',
        width: '34px',
        render: (item) => {
          const eligible = isBatchEligible(item);
          return (
            <input
              type="checkbox"
              aria-label={`選取 ${item.article.title}`}
              checked={selectedIds.has(item.article.id)}
              disabled={!eligible || !canWrite}
              title={eligible ? '可批次送審' : '此狀態請進工作室逐篇處理'}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                toggleSelect(item.article.id);
              }}
              className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 accent-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
            />
          );
        },
      },
      {
        key: 'title',
        header: '文章標題',
        render: (item) => (
          <div className="min-w-0 max-w-[340px]">
            <div className="truncate text-[12.5px] font-semibold text-[#0d1a2d]" title={item.article.title}>
              {item.article.title || '（未命名文章）'}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
              <span className="truncate font-mono">/{item.article.slug || '—'}</span>
              <span className="shrink-0">v{item.article.version}</span>
            </div>
          </div>
        ),
      },
      {
        key: 'site',
        header: '站點',
        width: '150px',
        render: (item) => (
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-[#0d1a2d]">{siteNameOf(item)}</div>
            {item.site?.domain_url && (
              <div className="truncate text-[10.5px] text-muted-foreground">{item.site.domain_url}</div>
            )}
          </div>
        ),
      },
      {
        key: 'keyword',
        header: '關鍵字',
        width: '150px',
        render: (item) =>
          item.keyword ? (
            <span className="inline-block max-w-[150px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600" title={item.keyword.keyword}>
              {item.keyword.keyword}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">未綁定</span>
          ),
      },
      {
        key: 'status',
        header: '狀態',
        width: '96px',
        align: 'center',
        render: (item) => <ContentStatusPill machine="article" status={item.article.status} />,
      },
      {
        key: 'publish',
        header: '發佈',
        width: '150px',
        render: (item) => {
          const stage = publishStage(item.article, {
            manual: item.siteSettings?.publish_mode === 'manual',
          });
          return (
            <div className="min-w-0" title={stage.hint ?? undefined}>
              <ContentStatusPill label={stage.label} tone={stage.tone} />
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
                {item.article.live_url ? (
                  <a
                    href={item.article.live_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-0.5 text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-800"
                    onClick={(event) => event.stopPropagation()}
                  >
                    文章連結
                    <ExternalLink size={9} />
                  </a>
                ) : item.article.scheduled_publish_at ? (
                  <span className="tabular-nums">
                    {formatZoneDateTime(item.article.scheduled_publish_at, HONG_KONG_TIME_ZONE)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        key: 'scheduled',
        header: '排定時間',
        width: '140px',
        render: (item) =>
          item.article.scheduled_publish_at ? (
            <span className="tabular-nums text-[11.5px] text-slate-600">
              {formatZoneDateTime(item.article.scheduled_publish_at, HONG_KONG_TIME_ZONE)}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">—</span>
          ),
      },
      {
        key: 'waiting',
        header: '待審時長',
        width: '108px',
        render: (item) => {
          if (item.waitingHours == null) {
            return <span className="text-[11px] text-slate-400">—</span>;
          }
          const overdue = item.waitingHours > 24;
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                overdue ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600',
              )}
              title={overdue ? '已等待超過 24 小時，請優先處理' : '待審時間'}
            >
              {overdue && <AlertTriangle size={11} strokeWidth={2.2} />}
              {formatRelativeHours(item.waitingHours)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '操作',
        width: '112px',
        align: 'right',
        render: (item) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              openStudio(item.article.id);
            }}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            開啟工作室
            <ArrowRight size={11} />
          </Button>
        ),
      },
    ],
    [canWrite, openStudio, selectedIds],
  );

  const metricItems = useMemo(
    () => [
      {
        label: '待審',
        value: metrics.pendingReview,
        tone: metrics.pendingReview > 0 ? ('warn' as const) : ('default' as const),
        onClick: () => setStatus('pending_review'),
        hint: '只看待審文章',
      },
      {
        label: '需修改',
        value: metrics.changesRequested,
        tone: metrics.changesRequested > 0 ? ('warn' as const) : ('default' as const),
        onClick: () => setStatus('changes_requested'),
        hint: '撰稿人需修改後重新送審',
      },
      {
        label: '已排程',
        value: metrics.scheduled,
        tone: metrics.scheduled > 0 ? ('info' as const) : ('default' as const),
        onClick: () => setStatus('scheduled'),
        hint: '已批准／已排程，等待到點發布',
      },
      {
        label: '已發佈本週',
        value: metrics.publishedThisWeek,
        tone: metrics.publishedThisWeek > 0 ? ('ok' as const) : ('default' as const),
        onClick: () => setStatus('published'),
        hint: '本週（HKT 週一起算）已公開發布',
      },
    ],
    [metrics],
  );

  const renderTableBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="文章佇列需要的資料表還沒建立（content_articles／content_slots）。請先執行 migration 後重新載入，其他模組不受影響。"
        />
      );
    }

    if (error) {
      return (
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="文章佇列載入失敗"
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
      <>
        <ContentTable<ContentArticleListItem>
          columns={columns}
          rows={items}
          rowKey={(item) => item.article.id}
          loading={loading}
          onRowClick={(item) => openStudio(item.article.id)}
          empty={
            hasActiveFilters ? (
              <ContentEmptyState
                icon={Inbox}
                title="沒有符合篩選條件的文章"
                description="把站點／狀態／日期放寬，或清除搜尋字。"
                action={
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    清除篩選
                  </Button>
                }
              />
            ) : (
              <ContentEmptyState
                icon={Inbox}
                title="目前沒有文章；到排程表查看下一步"
                description="文章由排程格到點自動生成並進入待審。若排程表還沒有格子，先產生排程；也可以確認內容自動化是否已啟用（每日上限預設 0）。"
                action={
                  <>
                    <Button size="sm" onClick={() => navigate('seo', 'plan')}>
                      <CalendarDays size={13} />
                      前往排程表
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void refresh()}>
                      <RefreshCw size={13} />
                      重新整理
                    </Button>
                  </>
                }
              />
            )
          }
          toolbar={
            <div className="flex w-full flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canWrite || eligibleItems.length === 0 || batchBusy}
                onClick={selectAllEligible}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                全選可送審（{eligibleItems.length}）
              </Button>
              {selectedIds.size > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  className="h-7 px-2 text-[11px] text-slate-500"
                >
                  清除選取（{selectedIds.size}）
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={!canWrite || selectedEligible.length === 0 || batchBusy}
                onClick={() => void handleBatchSubmit()}
                className="h-7 gap-1 bg-teal-600 px-2 text-[11px] hover:bg-teal-700"
              >
                <Send size={11} />
                {batchBusy ? '送審中…' : `批次送審（${selectedEligible.length}）`}
              </Button>
              {selectedNotEligible > 0 && (
                <span className="text-[10.5px] text-amber-600">
                  {selectedNotEligible} 篇狀態不可批次送審，請逐篇進工作室
                </span>
              )}
              <span className="hidden text-[10.5px] text-muted-foreground lg:inline">
                批准／駁回需逐篇進工作室（硬檢查不可繞過）
              </span>

              {/* 分頁（server-side，20 篇／頁） */}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  共 <strong className="tabular-nums text-[#0d1a2d]">{total}</strong> 篇 · {page}/{totalPages} 頁
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(page - 1)}
                  className="h-7 px-2 text-[11px]"
                >
                  上一頁
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(page + 1)}
                  className="h-7 px-2 text-[11px]"
                >
                  下一頁
                </Button>
              </div>
            </div>
          }
        />
      </>
    );
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        title={meta.label}
        subtitle={meta.description}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
              重新整理
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('seo', 'plan')}>
              <CalendarDays size={13} />
              排程表
            </Button>
          </>
        }
        meta={<ContentMetricBar items={metricItems} loading={loading} />}
      />

      {/* 篩選列 */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
        <div className="w-[220px]">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">站點</div>
          <SiteSelect value={siteId} onChange={(next) => setSiteId(next)} allowAll placeholder="全部站點" />
        </div>

        <div className="w-[168px]">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">狀態</div>
          <Select
            value={status ?? 'all'}
            onValueChange={(next) => setStatus(next === 'all' ? null : next)}
          >
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue placeholder="全部狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {ARTICLE_STATUS_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">建立日期</div>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-9 w-[140px] text-[12px]"
              aria-label="開始日期"
            />
            <span className="text-[11px] text-slate-400">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-9 w-[140px] text-[12px]"
              aria-label="結束日期"
            />
          </div>
        </div>

        <div className="min-w-[200px] flex-1">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">搜尋標題</div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="輸入文章標題關鍵字"
              className="h-9 pl-8 text-[12px]"
            />
          </div>
        </div>

        {hasActiveFilters && (
          <Button type="button" size="sm" variant="ghost" onClick={clearFilters} className="h-9 px-2 text-[11.5px] text-slate-500">
            清除篩選
          </Button>
        )}
      </div>

      {renderTableBody()}
    </div>
  );
}
