/**
 * 站點清單（M1-08、PRD §8.2.1）
 *
 * 版面：
 *   ContentPageHeader（標題＋「接入新站」）
 *   ContentMetricBar（今日生成／待審／已發／失敗／缺關鍵字；查詢失敗一律顯示 0）
 *   站點卡片牆（tier、健康、cadence、今日數字、快捷動作）
 *
 * 四態：loading 骨架／empty 引導接入／error 可重試／missingSchema「功能尚未啟用」。
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  DatabaseZap,
  ExternalLink,
  FileText,
  Globe2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ServerCog,
  Settings2,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/contentPermissions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentMetricBar, type ContentMetricItem } from '../shell/ContentMetricBar';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { cadenceSummary } from '@/lib/contentPlanner';
import {
  ADAPTER_LABEL,
  CADENCE_FREQUENCY_LABEL,
  PUBLISH_MODE_LABEL,
  TIER_LABEL,
} from '@/lib/contentState';
import { domainFromUrl, formatZoneDateTime } from '@/lib/contentFormat';
import { contentErrorMessage } from '@/lib/contentApi';
import {
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentConnectionTestResult,
  type ContentSiteStatus,
  type ContentSiteWithProfile,
  type ContentTier,
} from '@/lib/contentTypes';
import type { ContentViewProps } from '@/lib/contentNavigation';
import {
  removeSite,
  runConnectionTest,
  siteDisplayName,
  useContentOverviewMetrics,
  useContentSites,
  setSiteStatus,
  type ContentSiteTodayCounts,
} from '@/hooks/useContentSites';

const TIER_BADGE_CLASS: Record<ContentTier, string> = {
  A1: 'bg-teal-600 text-white',
  A2: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  B: 'bg-slate-100 text-slate-600',
};

const SITE_STATUS_LABEL: Record<ContentSiteStatus, string> = {
  active: '啟用中',
  paused: '已暫停',
  archived: '已歸檔',
};

const EMPTY_COUNTS: ContentSiteTodayCounts = {
  generated: 0,
  pending: 0,
  published: 0,
  failed: 0,
};

function siteDomain(site: ContentSiteWithProfile): string {
  const raw = site.profile?.domain_url ?? '';
  return domainFromUrl(raw) || raw.replace(/^https?:\/\//i, '').replace(/\/$/, '') || '—';
}

/**
 * 判斷是否為 Beauty100。
 *
 * 不能只看 adapter：既有站點在切換成 beauty100 之前，adapter 可能仍是 manual；
 * 但名稱／網域已經是 Beauty100。這種站點也要走專用卡片（沒有「移除接入」）。
 */
function isBeauty100Site(site: ContentSiteWithProfile): boolean {
  if (site.adapter === 'beauty100') return true;
  const haystack = `${siteDisplayName(site)} ${site.profile?.domain_url ?? ''} ${
    site.profile?.brand ?? ''
  }`.toLowerCase();
  return haystack.includes('beauty100');
}

function SiteCardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <div className="h-4 w-9 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
      <div className="flex gap-2 pt-1">
        <div className="h-7 w-16 animate-pulse rounded bg-slate-100" />
        <div className="h-7 w-16 animate-pulse rounded bg-slate-100" />
        <div className="h-7 w-16 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

interface SiteCardProps {
  site: ContentSiteWithProfile;
  counts: ContentSiteTodayCounts;
  canManageSites: boolean;
  busy: boolean;
  onOpen: () => void;
  onPlan: () => void;
  onToggleStatus: () => void;
  onRemove: () => void;
}

function SiteCard({
  site,
  counts,
  canManageSites,
  busy,
  onOpen,
  onPlan,
  onToggleStatus,
  onRemove,
}: SiteCardProps) {
  const name = siteDisplayName(site);
  const paused = site.status === 'paused';
  const archived = site.status === 'archived';
  const looksLikeBeauty100 = isBeauty100Site(site);

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover',
        archived && 'opacity-75',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            title={TIER_LABEL[site.tier] ?? site.tier}
            className={cn(
              'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10.5px] font-bold leading-4',
              TIER_BADGE_CLASS[site.tier],
            )}
          >
            {site.tier}
          </span>
          <ContentStatusPill status={site.health} machine="health" />
          {looksLikeBeauty100 && (
            <ContentStatusPill
              label={
                site.adapter === 'beauty100' && site.publish_mode === 'direct'
                  ? 'Beauty100 自動發佈'
                  : 'Beauty100（未啟用）'
              }
              tone={
                site.adapter === 'beauty100' && site.publish_mode === 'direct'
                  ? 'teal'
                  : 'amber-outline'
              }
            />
          )}
          {paused && <ContentStatusPill label={SITE_STATUS_LABEL.paused} tone="amber-outline" />}
          {archived && <ContentStatusPill label={SITE_STATUS_LABEL.archived} tone="muted" />}
        </div>
        <button
          type="button"
          onClick={onOpen}
          title="開啟站點詳情"
          className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-50"
        >
          詳情
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate text-left text-[15px] font-bold leading-snug text-[#0d1a2d] transition-colors hover:text-teal-700"
          title={name}
        >
          {name}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
          <Globe2 size={11} className="shrink-0" />
          <span className="truncate">{siteDomain(site)}</span>
          <span>·</span>
          <span className="truncate">{ADAPTER_LABEL[site.adapter] ?? site.adapter}</span>
        </p>
      </div>

      <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-2.5 py-1.5">
        <p className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
          <CalendarDays size={11} className="shrink-0 text-teal-600" />
          <span className="truncate" title={cadenceSummary(site.cadence)}>
            {CADENCE_FREQUENCY_LABEL[site.cadence.frequency] ?? site.cadence.frequency} ·{' '}
            {cadenceSummary(site.cadence)}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
          <span className="text-muted-foreground">
            今日 生成 <strong className="tabular-nums text-[#0d1a2d]">{counts.generated}</strong>
          </span>
          <span className="text-muted-foreground">
            待審 <strong className="tabular-nums text-amber-700">{counts.pending}</strong>
          </span>
          <span className="text-muted-foreground">
            已發 <strong className="tabular-nums text-teal-700">{counts.published}</strong>
          </span>
          {counts.failed > 0 && (
            <span className="text-rose-600">
              失敗 <strong className="tabular-nums">{counts.failed}</strong>
            </span>
          )}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11.5px]" onClick={onOpen}>
          詳情
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11.5px]"
          onClick={onPlan}
          title="到排程表看這個站點的格子"
        >
          <CalendarDays size={11} />
          排程
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11.5px]"
          disabled={busy || !canManageSites || archived}
          onClick={onToggleStatus}
          title={
            archived
              ? '已歸檔站點不會自動運作'
              : canManageSites
                ? paused
                  ? '恢復排程與自動生成'
                  : '暫停排程與自動生成（既有文章保留）'
                : '只有管理層可以變更站點狀態'
          }
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : paused ? (
            <Play size={11} />
          ) : (
            <Pause size={11} />
          )}
          {paused ? '啟用' : '暫停'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11.5px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          disabled={busy || !canManageSites}
          onClick={onRemove}
          title={
            canManageSites
              ? '解除接入：刪除這個站點的內容自動化設定，之後可以重新接入'
              : '只有管理層可以解除接入'
          }
        >
          <Trash2 size={11} />
          移除接入
        </Button>
      </div>
    </article>
  );
}

interface Beauty100SiteCardProps {
  site: ContentSiteWithProfile;
  counts: ContentSiteTodayCounts;
  canManageSites: boolean;
  busy: boolean;
  testing: boolean;
  onManage: () => void;
  onArticles: () => void;
  onPlan: () => void;
  onTest: () => void;
  onToggleStatus: () => void;
}

/**
 * Beauty100 專用站點卡。
 *
 * 與其他站點不同：**沒有「移除接入」**（避免誤刪 MPS 內的文章／排程／憑證）。
 * 但保留手動站點該有的管理能力：設定、文章、排程、暫停／啟用、測試連線、官網。
 */
function Beauty100SiteCard({
  site,
  counts,
  canManageSites,
  busy,
  testing,
  onManage,
  onArticles,
  onPlan,
  onTest,
  onToggleStatus,
}: Beauty100SiteCardProps) {
  const name = siteDisplayName(site);
  const paused = site.status === 'paused';
  const archived = site.status === 'archived';
  const configured = site.adapter === 'beauty100' && site.publish_mode === 'direct';
  const domain = site.profile?.domain_url?.trim() || '';
  const liveHref = domain
    ? /^https?:\/\//i.test(domain)
      ? domain
      : `https://${domain}`
    : null;

  return (
    <article className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              title={TIER_LABEL[site.tier] ?? site.tier}
              className={cn(
                'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10.5px] font-bold leading-4',
                TIER_BADGE_CLASS[site.tier],
              )}
            >
              {site.tier}
            </span>
            <ContentStatusPill status={site.health} machine="health" />
            <ContentStatusPill
              label={configured ? 'Beauty100 自動發佈' : '尚未啟用自動發佈'}
              tone={configured ? 'teal' : 'amber-outline'}
            />
            {paused && <ContentStatusPill label={SITE_STATUS_LABEL.paused} tone="amber-outline" />}
            {archived && <ContentStatusPill label={SITE_STATUS_LABEL.archived} tone="muted" />}
          </div>

          <h3 className="mt-1.5 text-[16px] font-bold leading-snug text-[#0d1a2d]">{name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
            <Globe2 size={11} className="shrink-0" />
            <span className="truncate">{domain || '未設定網域'}</span>
            <span>·</span>
            <span>{ADAPTER_LABEL[site.adapter] ?? site.adapter}</span>
            <span>·</span>
            <span>{PUBLISH_MODE_LABEL[site.publish_mode] ?? site.publish_mode}</span>
          </p>
        </div>

        {liveHref && (
          <a
            href={liveHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[rgba(13,26,45,0.12)] bg-white px-2 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={11} />
            前往官網
          </a>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            今日生成
          </p>
          <p className="mt-0.5 text-[16px] font-bold tabular-nums text-[#0d1a2d]">
            {counts.generated}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            待審
          </p>
          <p className="mt-0.5 text-[16px] font-bold tabular-nums text-amber-700">{counts.pending}</p>
        </div>
        <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            今日已發
          </p>
          <p className="mt-0.5 text-[16px] font-bold tabular-nums text-teal-700">
            {counts.published}
          </p>
        </div>
        <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            失敗
          </p>
          <p
            className={cn(
              'mt-0.5 text-[16px] font-bold tabular-nums',
              counts.failed > 0 ? 'text-rose-600' : 'text-slate-400',
            )}
          >
            {counts.failed}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={11} className="text-teal-600" />
          {CADENCE_FREQUENCY_LABEL[site.cadence.frequency] ?? site.cadence.frequency} ·{' '}
          {cadenceSummary(site.cadence)}
        </span>
        <span className="text-muted-foreground">
          最後測試：
          {site.last_verified_at
            ? formatZoneDateTime(site.last_verified_at, site.timezone)
            : '尚未測試'}
        </span>
        {!configured && (
          <span className="text-amber-700">
            尚未啟用：請到「管理設定」把發佈方式改成 Beauty100、上線方式改成直接公開。
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[rgba(13,26,45,0.08)] pt-3">
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11.5px]" onClick={onManage}>
          <Settings2 size={11} />
          管理設定
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11.5px]" onClick={onArticles}>
          <FileText size={11} />
          文章佇列
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11.5px]" onClick={onPlan}>
          <CalendarDays size={11} />
          排程
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11.5px]"
          onClick={onTest}
          disabled={!canManageSites || testing || archived || !configured}
          title={
            !configured
              ? '先把發佈方式改成 Beauty100、上線方式改成直接公開'
              : canManageSites
                ? '登入 Beauty100、讀文章表、上傳／刪除 probe 檔'
                : '只有管理層可以測試連線'
          }
        >
          {testing ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
          測試連線
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11.5px]"
          onClick={onToggleStatus}
          disabled={busy || !canManageSites || archived}
          title={
            archived
              ? '已歸檔站點不會自動運作'
              : canManageSites
                ? paused
                  ? '恢復排程與自動生成'
                  : '暫停排程與自動生成（既有文章保留）'
                : '只有管理層可以變更站點狀態'
          }
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : paused ? (
            <Play size={11} />
          ) : (
            <Pause size={11} />
          )}
          {paused ? '啟用' : '暫停'}
        </Button>
        <span className="ml-auto text-[10.5px] text-muted-foreground">
          Beauty100 卡片不提供「移除接入」，避免誤刪 MPS 的文章與排程。
        </span>
      </div>
    </article>
  );
}

export function SiteListView({ navigate }: ContentViewProps) {
  const { sites, loading, error, missingSchema, refresh } = useContentSites();
  const metrics = useContentOverviewMetrics();
  const { systemUser } = useAuth();
  const canManageSites = can({ role: systemUser?.role ?? null }, 'manage_sites');
  const [busySiteId, setBusySiteId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ContentSiteWithProfile | null>(null);
  const [removing, setRemoving] = useState(false);
  const [beauty100TestOpen, setBeauty100TestOpen] = useState(false);
  const [beauty100Testing, setBeauty100Testing] = useState(false);
  const [beauty100TestResult, setBeauty100TestResult] =
    useState<ContentConnectionTestResult | null>(null);
  const [beauty100TestFailure, setBeauty100TestFailure] = useState<string | null>(null);

  const beauty100Site = useMemo(
    () =>
      sites.find((site) => site.adapter === 'beauty100') ??
      sites.find((site) => isBeauty100Site(site)) ??
      null,
    [sites],
  );
  const otherSites = useMemo(
    () => sites.filter((site) => !isBeauty100Site(site)),
    [sites],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), metrics.refresh()]);
  }, [metrics, refresh]);

  const handleToggleStatus = useCallback(
    async (site: ContentSiteWithProfile) => {
      if (!canManageSites) {
        toast.error('沒有變更站點狀態的權限', {
          description: '只有管理層（management／system_dev）可以暫停或啟用站點。',
        });
        return;
      }
      const next: ContentSiteStatus = site.status === 'active' ? 'paused' : 'active';
      const name = siteDisplayName(site);
      setBusySiteId(site.website_profile_id);
      try {
        await setSiteStatus(site.website_profile_id, next);
        if (next === 'paused') {
          toast.success(`已暫停「${name}」`, {
            description: '排程與自動生成會停止；既有文章與排程格保留。',
          });
        } else {
          toast.success(`已啟用「${name}」`, { description: '站點恢復排程與自動生成。' });
        }
        await refresh();
      } catch (thrown) {
        toast.error('站點狀態更新失敗', { description: contentErrorMessage(thrown) });
      } finally {
        setBusySiteId(null);
      }
    },
    [canManageSites, refresh],
  );

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget) return;
    if (!canManageSites) {
      toast.error('沒有移除接入的權限', {
        description: '只有管理層（management／system_dev）可以移除接入。',
      });
      return;
    }
    const name = siteDisplayName(removeTarget);
    setRemoving(true);
    try {
      const result = await removeSite(removeTarget.website_profile_id);
      toast.success(`已移除「${name}」的接入`, {
        description: `已刪除 ${result.deleted.sections} 個欄目、${result.deleted.slots} 個排程、${result.deleted.articles} 篇文章；可重新接入。`,
      });
      setRemoveTarget(null);
      await refreshAll();
    } catch (thrown) {
      toast.error('移除接入失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setRemoving(false);
    }
  }, [canManageSites, refreshAll, removeTarget]);

  const handleTestBeauty100 = useCallback(
    async (site: ContentSiteWithProfile) => {
      if (!canManageSites) {
        toast.error('沒有測試連線的權限', {
          description: '測試 Beauty100 連線需要管理層（management／system_dev）權限。',
        });
        return;
      }
      setBeauty100TestOpen(true);
      setBeauty100Testing(true);
      setBeauty100TestResult(null);
      setBeauty100TestFailure(null);
      try {
        const result = await runConnectionTest(site.website_profile_id);
        setBeauty100TestResult(result);
        if (result.health === 'ok') {
          toast.success('Beauty100 連線測試通過', {
            description: '登入、文章表、分類與封面 bucket 都正常。',
          });
        } else if (result.health === 'degraded') {
          toast.message('Beauty100 可用但降級', {
            description: '非阻擋檢查（通常是 sitemap）失敗，請看逐項結果。',
          });
        } else {
          toast.error('Beauty100 連線測試未通過', {
            description: '請看逐項結果並修正憑證或 bucket 設定。',
          });
        }
        // 測試本身已成功；refresh 失敗不應把結果誤報成「測試失敗」。
        try {
          await refreshAll();
        } catch (refreshError) {
          console.warn('Beauty100 test refresh failed', refreshError);
        }
      } catch (thrown) {
        const message = contentErrorMessage(thrown);
        setBeauty100TestFailure(message);
        toast.error('Beauty100 測試失敗', { description: message });
      } finally {
        setBeauty100Testing(false);
      }
    },
    [canManageSites, refreshAll],
  );

  const metricItems = useMemo<ContentMetricItem[]>(    () => [
      {
        label: '今日生成',
        value: metrics.metrics.generated,
        hint: '今天新增的文章數（香港時間）',
        onClick: () => navigate('seo', 'articles'),
      },
      {
        label: '待審',
        value: metrics.metrics.pending,
        tone: metrics.metrics.pending > 0 ? 'warn' : 'default',
        hint: '等待決定的文章',
        onClick: () => navigate('seo', 'articles'),
      },
      {
        label: '已發',
        value: metrics.metrics.published,
        tone: 'ok',
        hint: '今天完成發布的文章',
        onClick: () => navigate('seo', 'articles'),
      },
      {
        label: '失敗',
        value: metrics.metrics.failed,
        tone: metrics.metrics.failed > 0 ? 'danger' : 'default',
        hint: '發布或驗證失敗，需要處理',
        onClick: () => navigate('seo', 'publish'),
      },
      {
        label: '缺關鍵字',
        value: metrics.metrics.missingKeywords,
        tone: metrics.metrics.missingKeywords > 0 ? 'warn' : 'default',
        hint: '排程格尚未指派關鍵字',
        onClick: () => navigate('seo', 'plan'),
      },
    ],
    [metrics.metrics, navigate],
  );

  const header = (
    <ContentPageHeader
      title="內容自動化 · 站點"
      subtitle="接入網站、設定節奏與 SEO 預設；健康狀態、今日產出與待處理事項一眼看見。"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void refreshAll()}
            title="重新整理站點與今日數字"
          >
            <RefreshCw size={13} className={loading || metrics.loading ? 'animate-spin' : undefined} />
            重新整理
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => navigate('seo', 'site')}
            disabled={!canManageSites}
            title={
              canManageSites
                ? '從站點主檔選一個網站接入'
                : '只有管理層可以接入新站點'
            }
          >
            <Plus size={13} />
            接入新站
          </Button>
        </>
      }
    />
  );

  const renderBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description={CONTENT_NOT_ENABLED_MESSAGE}
          action={
            <Button size="sm" variant="outline" onClick={() => void refreshAll()}>
              <RefreshCw size={13} />
              重新檢查
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
          title="站點載入失敗"
          description={error}
          action={
            <Button size="sm" onClick={() => void refreshAll()}>
              <RefreshCw size={13} />
              重試
            </Button>
          }
        />
      );
    }

    if (loading && sites.length === 0) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SiteCardSkeleton />
          <SiteCardSkeleton />
          <SiteCardSkeleton />
        </div>
      );
    }

    if (sites.length === 0) {
      return (
        <ContentEmptyState
          icon={ServerCog}
          title="還沒有接入任何站點"
          description="內容自動化以站點為單位運作：先從站點主檔挑一個網站接入，設定欄目、語言語氣與發佈節奏，之後排程與生成才會開始。"
          action={
            <>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => navigate('seo', 'site')}
                disabled={!canManageSites}
              >
                <Plus size={13} />
                接入第一個站點
              </Button>
              {!canManageSites && (
                <span className="text-[12px] text-muted-foreground">
                  只有管理層可以接入站點，請洽管理員。
                </span>
              )}
            </>
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        {beauty100Site ? (
          <Beauty100SiteCard
            site={beauty100Site}
            counts={metrics.perSite[beauty100Site.website_profile_id] ?? EMPTY_COUNTS}
            canManageSites={canManageSites}
            busy={busySiteId === beauty100Site.website_profile_id}
            testing={beauty100Testing}
            onManage={() => navigate('seo', 'site', beauty100Site.website_profile_id)}
            onArticles={() => navigate('seo', 'articles', beauty100Site.website_profile_id)}
            onPlan={() => navigate('seo', 'plan', beauty100Site.website_profile_id)}
            onTest={() => void handleTestBeauty100(beauty100Site)}
            onToggleStatus={() => void handleToggleStatus(beauty100Site)}
          />
        ) : (
          <section className="rounded-lg border border-dashed border-[rgba(13,26,45,0.12)] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-[#0d1a2d]">Beauty100</h3>
                <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-slate-600">
                  尚未接入內容自動化，或站點主檔沒有 Beauty100。接入後會顯示專用管理卡：
                  有設定、文章、排程、測試連線與暫停／啟用，但沒有「移除接入」，
                  避免誤刪 MPS 的文章與排程。
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0 gap-1"
                onClick={() => navigate('seo', 'site')}
                disabled={!canManageSites}
                title={canManageSites ? '從站點主檔接入 Beauty100' : '只有管理層可以接入站點'}
              >
                <Plus size={13} />
                接入 Beauty100
              </Button>
            </div>
          </section>
        )}

        {otherSites.length > 0 && (
          <div className="space-y-2">
            {beauty100Site && (
              <h2 className="text-[13px] font-bold text-[#0d1a2d]">其他站點</h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {otherSites.map((site) => (
                <SiteCard
                  key={site.website_profile_id}
                  site={site}
                  counts={metrics.perSite[site.website_profile_id] ?? EMPTY_COUNTS}
                  canManageSites={canManageSites}
                  busy={busySiteId === site.website_profile_id}
                  onOpen={() => navigate('seo', 'site', site.website_profile_id)}
                  onPlan={() => navigate('seo', 'plan', site.website_profile_id)}
                  onToggleStatus={() => void handleToggleStatus(site)}
                  onRemove={() => setRemoveTarget(site)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {header}
      <ContentMetricBar
        items={metricItems}
        loading={metrics.loading}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground"
            onClick={() => void metrics.refresh()}
            title="重新整理今日數字"
          >
            <RefreshCw size={13} className={metrics.loading ? 'animate-spin' : undefined} />
            今日數字
          </Button>
        }
      />
      {renderBody()}

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              移除「{removeTarget ? siteDisplayName(removeTarget) : ''}」的接入？
            </DialogTitle>
            <DialogDescription className="space-y-2 text-[12.5px] leading-relaxed">
              <span className="block">
                移除後，這個站點會回到「未接入」，你可以重新走一次接入精靈。
              </span>
              <span className="block">
                以下內容會一併刪除，且無法復原：欄目、排程格、文章與版本紀錄、憑證、健康檢查紀錄。
              </span>
              <span className="block">
                不會影響：官網清單（網站+系統）、GSC 與廣告資料、其他模組；素材庫圖片仍會保留。
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemoveTarget(null)}
              disabled={removing}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleConfirmRemove()}
              disabled={!canManageSites || removing}
            >
              {removing && <Loader2 size={13} className="animate-spin" />}
              確認移除接入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={beauty100TestOpen}
        onOpenChange={(open) => {
          if (!open && !beauty100Testing) setBeauty100TestOpen(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <Wifi size={15} className="text-teal-600" />
              Beauty100 連線測試
            </DialogTitle>
            <DialogDescription className="text-[12.5px] leading-relaxed">
              會真的登入 Beauty100、讀取 `blog_articles`、上傳並刪除一個 probe 檔、確認封面 bucket
              公開可讀；<b>不會發佈文章</b>。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[120px] space-y-2">
            {beauty100Testing ? (
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-[12px] text-slate-600">
                <Loader2 size={14} className="animate-spin text-teal-600" />
                正在登入、讀表與測試封面 bucket...
              </div>
            ) : beauty100TestFailure ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] leading-relaxed text-rose-700">
                <p className="font-semibold">測試失敗</p>
                <p className="mt-1">{beauty100TestFailure}</p>
              </div>
            ) : beauty100TestResult ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <ContentStatusPill status={beauty100TestResult.health} machine="health" />
                  <span className="text-[11.5px] text-muted-foreground">
                    {beauty100TestResult.checks.filter((check) => check.ok).length}／
                    {beauty100TestResult.checks.length} 項通過
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {beauty100TestResult.checks.map((check) => (
                    <li
                      key={check.kind}
                      className={cn(
                        'flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px] leading-relaxed',
                        check.ok
                          ? 'border-emerald-100 bg-emerald-50/50'
                          : 'border-rose-200 bg-rose-50/50',
                      )}
                    >
                      {check.ok ? (
                        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle size={13} className="mt-0.5 shrink-0 text-rose-600" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700">{check.label}</p>
                        <p className="break-words text-[11.5px] text-slate-500">{check.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">尚未測試。</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBeauty100TestOpen(false)}
              disabled={beauty100Testing}
            >
              關閉
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-teal-600 hover:bg-teal-700"
              onClick={() => {
                if (beauty100Site) void handleTestBeauty100(beauty100Site);
              }}
              disabled={
                beauty100Testing ||
                !beauty100Site ||
                beauty100Site.adapter !== 'beauty100' ||
                beauty100Site.publish_mode !== 'direct'
              }
            >
              {beauty100Testing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              重測
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
