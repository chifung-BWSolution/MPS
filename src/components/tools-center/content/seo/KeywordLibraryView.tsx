/**
 * 關鍵字庫（M1-16、PRD §6.2.2 配套規則、§8.3）
 *
 * 頁面責任：
 *   - 站點切換（SiteSelect；route.id 可能是站點 id）
 *   - CSV 匯入（KeywordImportDialog，逐行錯誤）與 GSC 機會詞掃描（Edge Function）
 *   - 指標條：總詞數／已啟用／待生成／已發佈／未分級
 *   - 表格：搜尋、篩選（狀態／意圖／來源／優先級）、排序（優先級／搜尋量／建立時間）
 *   - 單筆與批次「啟用生成」「暫緩」「恢復」
 *
 * 資料安全規則（PRD §6.2.2，這是本頁最容易被誤解的地方）：
 *   seo_keywords 的 5 個新欄位沒有 DEFAULT，既有列一律 NULL。
 *   NULL 的 pipeline_status ＝「未啟用自動生成」，planner 不會挑選；
 *   只有人明確改為 backlog（單筆或批次）才會進入生成流程。
 *   因此：
 *     1. NULL 一律顯示灰色「未啟用」，不可顯示成 backlog（否則等於騙人）。
 *     2. 批次只作用在「使用者逐列勾選」的詞，且二次確認文案要明示
 *        「只會影響已勾選的 N 個詞；歷史關鍵字不會被全選」。
 *     3. 不提供無上限的「全選全部」——全選只在目前頁面的 20 列內。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  DatabaseZap,
  Download,
  ExternalLink,
  Filter,
  Info,
  KeyRound,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { pageMeta } from '@/lib/contentNavigation.ts';
import type { ContentKeyword, ContentKeywordPipelineStatus } from '@/lib/contentTypes.ts';
import { can } from '@/lib/contentPermissions.ts';
import {
  KEYWORD_INTENT_LABEL,
  KEYWORD_PIPELINE_LABEL,
  TIER_LABEL,
  canTransition,
} from '@/lib/contentState.ts';
import { formatNumber, formatZoneDate } from '@/lib/contentFormat.ts';
import { ContentApiError } from '@/lib/contentApi.ts';
import { useAuth } from '@/context/AuthContext';
import {
  KEYWORD_INTENTS,
  keywordPriorityLabel,
  keywordSourceLabel,
  useContentKeywords,
} from '@/hooks/useContentKeywords';
import { useContentSites } from '@/hooks/useContentSites';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { SiteSelect } from '../shared/SiteSelect';
import { ContentTable, type ContentTableColumn } from '../shared/ContentTable';
import { KEYWORD_CSV_TEMPLATE_HREF, KeywordImportDialog } from './KeywordImportDialog';

type StatusFilter = 'all' | 'disabled' | 'in_progress' | ContentKeywordPipelineStatus;
type IntentFilter = 'all' | string;
type SourceFilter = 'all' | string;
type PriorityFilter = 'all' | 'graded' | 'ungraded';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部狀態' },
  { value: 'disabled', label: '未啟用（pipeline_status 為 NULL）' },
  { value: 'backlog', label: '已啟用 · backlog（待生成）' },
  { value: 'in_progress', label: '待生成 · planned + generating' },
  { value: 'in_review', label: '待審 · in_review' },
  { value: 'published', label: '已發佈 · published' },
  { value: 'parked', label: '暫緩 · parked' },
  { value: 'rejected', label: '已駁回 · rejected' },
];

const SOURCE_FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '全部來源' },
  { value: 'manual', label: '手動' },
  { value: 'gsc', label: 'GSC' },
  { value: 'ads', label: '廣告' },
  { value: 'import', label: '匯入' },
];

const PRIORITY_FILTER_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: 'all', label: '全部優先級' },
  { value: 'graded', label: '已分級（priority 有值）' },
  { value: 'ungraded', label: '未分級（priority 為 NULL）' },
];

interface RowAction {
  key: string;
  label: string;
  next: ContentKeywordPipelineStatus;
  icon: typeof Sparkles;
  hint: string;
}

/** 依狀態機決定可用動作（PRD §6.3 keyword 轉換表） */
function rowActionsOf(keyword: ContentKeyword): RowAction[] {
  const status = keyword.pipeline_status;
  if (status == null) {
    return [
      {
        key: 'enable',
        label: '啟用生成',
        next: 'backlog',
        icon: Sparkles,
        hint: '把 pipeline_status 由 NULL 改為 backlog；planner 之後才可能挑選這個詞',
      },
    ];
  }
  if (status === 'published') return [];
  if (status === 'parked' || status === 'rejected') {
    return [
      {
        key: 'resume',
        label: '恢復',
        next: 'backlog',
        icon: Play,
        hint: '恢復為 backlog（待生成），重新進入可被挑選的佇列',
      },
    ];
  }
  if (canTransition('keyword', status, 'parked')) {
    return [
      {
        key: 'park',
        label: '暫緩',
        next: 'parked',
        icon: PauseCircle,
        hint: '改為 parked：planner 不會挑選，直到你恢復',
      },
    ];
  }
  if (canTransition('keyword', status, 'backlog')) {
    return [
      {
        key: 'backlog',
        label: '退回佇列',
        next: 'backlog',
        icon: RotateCcw,
        hint: '退回 backlog，重新排入可被挑選的佇列',
      },
    ];
  }
  return [];
}

function siteNameOf(site: { profile: { website_name: string } | null; website_profile_id: string }): string {
  return site.profile?.website_name || site.website_profile_id;
}

function errorMessageOf(caught: unknown): string {
  if (caught instanceof ContentApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return String(caught);
}

export function KeywordLibraryView({ route, navigate }: ContentViewProps) {
  const meta = pageMeta(route);
  const { systemUser } = useAuth();
  const canWrite = can({ role: systemUser?.role ?? null }, 'write');

  const [siteId, setSiteId] = useState<string | null>(route.id ?? null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [visibleRows, setVisibleRows] = useState<ContentKeyword[]>([]);
  const [safetyNoteOpen, setSafetyNoteOpen] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [intentFilter, setIntentFilter] = useState<IntentFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  const {
    sites,
    loading: sitesLoading,
    error: sitesError,
    missingSchema: sitesMissingSchema,
    refresh: refreshSites,
  } = useContentSites();

  const {
    keywords,
    loading,
    error,
    missingSchema,
    refresh,
    importRows,
    scanGsc,
    updateKeyword,
  } = useContentKeywords(siteId);

  // route.id 可能是從站點詳情帶過來的 site id
  useEffect(() => {
    setSiteId(route.id ?? null);
  }, [route.id]);

  // 沒有指定站點時，自動落在第一個 active 站（避免整頁空著）
  useEffect(() => {
    if (siteId || sites.length === 0) return;
    const preferred = sites.find((site) => site.status === 'active') ?? sites[0];
    if (preferred) setSiteId(preferred.website_profile_id);
  }, [siteId, sites]);

  const siteById = useMemo(() => {
    const map = new Map<string, (typeof sites)[number]>();
    for (const site of sites) map.set(site.website_profile_id, site);
    return map;
  }, [sites]);

  const selectedSite = siteId ? siteById.get(siteId) : undefined;

  // 關鍵字被重新載入後，清掉已不存在的選取項目
  useEffect(() => {
    setSelection((previous) => {
      if (previous.size === 0) return previous;
      const existing = new Set(keywords.map((keyword) => keyword.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of previous) {
        if (existing.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : previous;
    });
  }, [keywords]);

  const metrics = useMemo(() => {
    let enabled = 0;
    let generating = 0;
    let published = 0;
    let ungraded = 0;
    for (const keyword of keywords) {
      const status = keyword.pipeline_status;
      if (status === 'backlog') enabled += 1;
      if (status === 'planned' || status === 'generating') generating += 1;
      if (status === 'published') published += 1;
      if (keyword.priority == null) ungraded += 1;
    }
    return { total: keywords.length, enabled, generating, published, ungraded };
  }, [keywords]);

  const filteredKeywords = useMemo(
    () =>
      keywords.filter((keyword) => {
        const status = keyword.pipeline_status;
        if (statusFilter === 'disabled') {
          if (status != null) return false;
        } else if (statusFilter === 'in_progress') {
          if (status !== 'planned' && status !== 'generating') return false;
        } else if (statusFilter !== 'all') {
          if (status !== statusFilter) return false;
        }

        if (intentFilter !== 'all' && keyword.intent !== intentFilter) return false;
        if (sourceFilter !== 'all' && keyword.source !== sourceFilter) return false;
        if (priorityFilter === 'ungraded' && keyword.priority != null) return false;
        if (priorityFilter === 'graded' && keyword.priority == null) return false;
        return true;
      }),
    [intentFilter, keywords, priorityFilter, sourceFilter, statusFilter],
  );

  const hasActiveFilters =
    statusFilter !== 'all' ||
    intentFilter !== 'all' ||
    sourceFilter !== 'all' ||
    priorityFilter !== 'all';

  const resetFilters = useCallback(() => {
    setStatusFilter('all');
    setIntentFilter('all');
    setSourceFilter('all');
    setPriorityFilter('all');
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  /**
   * ContentTable 回報的「目前頁面資料列」。
   * 內容相同時回傳舊陣列，避免 table → view → table 的 identity 更新迴圈。
   */
  const handleVisibleRowsChange = useCallback((rows: ContentKeyword[]) => {
    setVisibleRows((previous) => {
      if (
        previous.length === rows.length &&
        previous.every((row, index) => row.id === rows[index]?.id)
      ) {
        return previous;
      }
      return rows;
    });
  }, []);

  const toggleRowSelection = useCallback((id: string) => {
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleVisibleSelection = useCallback(
    (checked: boolean) => {
      setSelection((previous) => {
        const next = new Set(previous);
        for (const row of visibleRows) {
          if (checked) next.add(row.id);
          else next.delete(row.id);
        }
        return next;
      });
    },
    [visibleRows],
  );

  const selectedVisibleCount = useMemo(
    () => visibleRows.filter((row) => selection.has(row.id)).length,
    [selection, visibleRows],
  );

  const selectedKeywords = useMemo(
    () => keywords.filter((keyword) => selection.has(keyword.id)),
    [keywords, selection],
  );

  /** 批次真正的目標：只處理「未啟用 / 暫緩 / 已駁回」→ backlog */
  const batchTargets = useMemo(
    () =>
      selectedKeywords.filter(
        (keyword) =>
          keyword.pipeline_status == null ||
          keyword.pipeline_status === 'parked' ||
          keyword.pipeline_status === 'rejected',
      ),
    [selectedKeywords],
  );
  const batchSkipped = selectedKeywords.length - batchTargets.length;

  const handleSiteChange = useCallback(
    (nextSiteId: string | null) => {
      setSiteId(nextSiteId);
      clearSelection();
      resetFilters();
      if ((route.id ?? null) !== nextSiteId) {
        navigate('seo', 'keywords', nextSiteId);
      }
    },
    [clearSelection, navigate, resetFilters, route.id],
  );

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((previous) => {
      const next = new Set(previous);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const applyKeywordStatus = useCallback(
    async (keyword: ContentKeyword, action: RowAction) => {
      markBusy(keyword.id, true);
      try {
        await updateKeyword(keyword.id, { pipeline_status: action.next });
        if (action.next === 'backlog') {
          const message =
            action.key === 'enable'
              ? `已啟用「${keyword.keyword}」的自動生成（pipeline_status → backlog）`
              : action.key === 'resume'
                ? `已把「${keyword.keyword}」恢復到 backlog`
                : `已把「${keyword.keyword}」退回佇列（backlog）`;
          toast.success(message);
        } else {
          toast.success(`已暫緩「${keyword.keyword}」，planner 不會再挑選它`);
        }
      } catch (caught) {
        toast.error(`更新「${keyword.keyword}」失敗：${errorMessageOf(caught)}`);
      } finally {
        markBusy(keyword.id, false);
      }
    },
    [markBusy, updateKeyword],
  );

  const handleScanGsc = useCallback(async () => {
    if (!siteId) return;
    setSyncing(true);
    try {
      const result = await scanGsc();
      if (result.inserted > 0) {
        toast.success(
          `已加入 ${result.inserted} 個 GSC 機會詞（本次掃描 ${result.scanned} 個查詢）`,
        );
      } else {
        toast.info(
          `掃描 ${result.scanned} 個查詢，沒有新的機會詞（已存在的詞不會重複新增）`,
        );
      }
    } catch (caught) {
      if (caught instanceof ContentApiError && caught.code === 'gsc_not_linked') {
        toast.error(
          '此站尚未綁定 Google Search Console。請先到「網站 > 廣告數據同步」授權 GSC，再回來同步。',
        );
      } else {
        toast.error(`同步 GSC 失敗：${errorMessageOf(caught)}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [scanGsc, siteId]);

  const runBatchEnable = useCallback(async () => {
    if (batchTargets.length === 0) return;
    setBatchRunning(true);
    const succeeded: string[] = [];
    const failed: ContentKeyword[] = [];
    for (const keyword of batchTargets) {
      try {
        await updateKeyword(keyword.id, { pipeline_status: 'backlog' });
        succeeded.push(keyword.id);
      } catch {
        failed.push(keyword);
      }
    }
    setBatchRunning(false);
    setConfirmOpen(false);

    if (succeeded.length > 0) {
      setSelection((previous) => {
        const next = new Set(previous);
        for (const id of succeeded) next.delete(id);
        return next;
      });
      toast.success(
        `已啟用 ${succeeded.length} 個關鍵字的自動生成${
          failed.length > 0 ? `；${failed.length} 個失敗` : ''
        }`,
      );
    }
    if (failed.length > 0) {
      toast.error(
        `有 ${failed.length} 個關鍵字更新失敗（例如 ${failed[0].keyword}），請稍後重試或個別處理。`,
      );
    }
  }, [batchTargets, updateKeyword]);

  const columns = useMemo<ContentTableColumn<ContentKeyword>[]>(() => {
    const allVisibleSelected =
      visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;

    return [
      {
        key: 'select',
        width: '44px',
        header: (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Checkbox
                  checked={
                    allVisibleSelected ? true : selectedVisibleCount > 0 ? 'indeterminate' : false
                  }
                  onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
                  disabled={visibleRows.length === 0}
                  aria-label="全選本頁（只選目前頁面的資料列）"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-[11px] leading-relaxed">
              只選取「目前這一頁」的 {visibleRows.length} 個詞。為了資料安全，本頁不提供「全選全部歷史詞」。
            </TooltipContent>
          </Tooltip>
        ),
        render: (row) => (
          <Checkbox
            checked={selection.has(row.id)}
            onCheckedChange={() => toggleRowSelection(row.id)}
            aria-label={`選取 ${row.keyword}`}
          />
        ),
      },
      {
        key: 'keyword',
        header: '關鍵字',
        render: (row) => (
          <div className="min-w-[180px] max-w-[300px]">
            <p className="truncate font-medium text-[#0d1a2d]" title={row.keyword}>
              {row.keyword}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate font-mono">{row.normalized_keyword}</span>
              {row.target_page && (
                <span className="inline-flex items-center gap-0.5 truncate">
                  <ExternalLink size={10} />
                  {row.target_page}
                </span>
              )}
            </p>
          </div>
        ),
      },
      {
        key: 'intent',
        header: '意圖',
        width: '92px',
        render: (row) =>
          row.intent ? (
            <span className="text-[12px] text-slate-700">{KEYWORD_INTENT_LABEL[row.intent]}</span>
          ) : (
            <span className="text-[12px] text-slate-300">—</span>
          ),
      },
      {
        key: 'priority',
        header: '優先級',
        width: '104px',
        sortable: true,
        sortValue: (row) => row.priority,
        defaultSortDirection: 'desc',
        render: (row) => (
          <span
            className={cn(
              'text-[12px] tabular-nums',
              row.priority == null ? 'text-slate-300' : 'font-semibold text-slate-700',
            )}
            title="priority 越大越先；NULL 代表未分級，不會因 desc 排序而跑到最前（nulls last）"
          >
            {keywordPriorityLabel(row.priority)}
          </span>
        ),
      },
      {
        key: 'cluster',
        header: '叢集',
        render: (row) =>
          row.cluster ? (
            <span className="text-[12px] text-slate-600" title={row.cluster}>
              {row.cluster}
            </span>
          ) : (
            <span className="text-[12px] text-slate-300">—</span>
          ),
      },
      {
        key: 'pipeline_status',
        header: '自動生成狀態',
        width: '132px',
        render: (row) => {
          if (row.pipeline_status == null) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Badge
                      variant="outline"
                      className="cursor-help rounded-md border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-400"
                    >
                      未啟用
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px] text-[11px] leading-relaxed">
                  pipeline_status 為 NULL。這是資料安全預設：歷史關鍵字不會被 planner 自動拿去生成文章。按「啟用生成」才會加入
                  backlog。
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <ContentStatusPill
              machine="keyword"
              status={row.pipeline_status}
              title={
                row.pipeline_status === 'backlog'
                  ? 'pipeline_status = backlog：planner 可以挑選這個詞'
                  : `pipeline_status = ${row.pipeline_status}`
              }
            />
          );
        },
      },
      {
        key: 'source',
        header: '來源',
        width: '80px',
        render: (row) => (
          <span className="text-[12px] text-slate-600">{keywordSourceLabel(row.source)}</span>
        ),
      },
      {
        key: 'search_volume',
        header: '搜尋量',
        width: '96px',
        align: 'right',
        sortable: true,
        sortValue: (row) => row.search_volume,
        defaultSortDirection: 'desc',
        render: (row) => (
          <span className="text-[12px] tabular-nums text-slate-700">
            {row.search_volume == null ? '—' : formatNumber(row.search_volume)}
          </span>
        ),
      },
      {
        key: 'current_ranking',
        header: '排名',
        width: '72px',
        align: 'right',
        render: (row) => (
          <span className="text-[12px] tabular-nums text-slate-700">
            {row.current_ranking == null ? '—' : `#${row.current_ranking}`}
          </span>
        ),
      },
      {
        key: 'created_at',
        header: '建立時間',
        width: '112px',
        sortable: true,
        sortValue: (row) => row.created_at,
        defaultSortDirection: 'desc',
        render: (row) => (
          <span className="text-[12px] tabular-nums text-slate-500">
            {formatZoneDate(row.created_at, selectedSite?.timezone)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '操作',
        align: 'right',
        width: '190px',
        render: (row) => {
          if (!canWrite) {
            return <span className="text-[11px] text-slate-400">—</span>;
          }
          const busy = busyIds.has(row.id);
          const actions = rowActionsOf(row);
          if (busy) {
            return (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                更新中…
              </span>
            );
          }
          if (actions.length === 0) {
            return (
              <span
                className="text-[11px] text-slate-400"
                title={
                  row.pipeline_status === 'published'
                    ? '已發佈：關鍵字已產生文章，狀態不可再改'
                    : '目前狀態沒有可用的轉換'
                }
              >
                不可變更
              </span>
            );
          }
          return (
            <div className="flex items-center justify-end gap-1">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.key}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-7 gap-1 px-2 text-[12px]',
                      action.next === 'backlog'
                        ? 'text-teal-700 hover:bg-teal-50'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                    title={action.hint}
                    onClick={() => void applyKeywordStatus(row, action)}
                  >
                    <Icon size={12} />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          );
        },
      },
    ];
  }, [
    applyKeywordStatus,
    busyIds,
    canWrite,
    selectedSite?.timezone,
    selectedVisibleCount,
    selection,
    toggleRowSelection,
    toggleVisibleSelection,
    visibleRows,
  ]);

  const metricItems = useMemo<ContentMetricItem[]>(
    () => [
      {
        label: '總詞數',
        value: metrics.total,
        hint: '此站 seo_keywords 全部關鍵字（含未啟用）',
        onClick: resetFilters,
      },
      {
        label: '已啟用',
        value: metrics.enabled,
        tone: metrics.enabled > 0 ? 'ok' : 'default',
        hint: 'pipeline_status = backlog：planner 可以挑選',
        onClick: () => {
          resetFilters();
          setStatusFilter('backlog');
        },
      },
      {
        label: '待生成',
        value: metrics.generating,
        tone: metrics.generating > 0 ? 'info' : 'default',
        hint: 'pipeline_status = planned 或 generating',
        onClick: () => {
          resetFilters();
          setStatusFilter('in_progress');
        },
      },
      {
        label: '已發佈',
        value: metrics.published,
        tone: metrics.published > 0 ? 'ok' : 'default',
        hint: 'pipeline_status = published',
        onClick: () => {
          resetFilters();
          setStatusFilter('published');
        },
      },
      {
        label: '未分級',
        value: metrics.ungraded,
        tone: metrics.ungraded > 0 ? 'warn' : 'default',
        hint: 'priority 為 NULL：未分級不影響自動生成，但排序時一律排最後',
        onClick: () => {
          resetFilters();
          setPriorityFilter('ungraded');
        },
      },
    ],
    [metrics, resetFilters],
  );

  const isSchemaMissing = missingSchema || sitesMissingSchema;
  const isLoadingSites = sitesLoading && sites.length === 0;

  const header = (
    <ContentPageHeader
      title={meta.label}
      subtitle="管理各站關鍵字與自動生成開關：CSV 匯入、GSC 機會詞、批次啟用（只影響你勾選的詞）"
      actions={
        <>
          <SiteSelect
            value={siteId}
            onChange={handleSiteChange}
            sites={sites}
            placeholder="選擇站點"
            disabled={isLoadingSites}
            className="w-[210px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={!canWrite || !siteId}
            title={canWrite ? '貼上或選擇 CSV 匯入關鍵字' : '你的角色沒有編輯權限'}
          >
            <Upload size={13} />
            匯入 CSV
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleScanGsc()}
            disabled={!canWrite || !siteId || syncing}
            title={
              canWrite
                ? '從 GSC 找出高曝光低點擊 / 排名 5–20 的機會詞並加入'
                : '你的角色沒有編輯權限'
            }
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            同步 GSC 機會詞
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => {
              void refresh();
              void refreshSites();
            }}
            title="重新整理"
          >
            <RefreshCw size={13} />
          </Button>
        </>
      }
      meta={
        selectedSite ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              站點：
              <span className="font-medium text-slate-700">{siteNameOf(selectedSite)}</span>
            </span>
            {selectedSite.profile?.domain_url && (
              <span className="font-mono">{selectedSite.profile.domain_url}</span>
            )}
            <span>{TIER_LABEL[selectedSite.tier] ?? selectedSite.tier}</span>
            <span>時區：{selectedSite.timezone}</span>
            <span>
              詞庫共 <span className="font-semibold text-slate-700">{formatNumber(metrics.total)}</span>{' '}
              個詞
            </span>
          </div>
        ) : null
      }
    />
  );

  const missingSchemaState = (
    <ContentEmptyState
      icon={DatabaseZap}
      tone="warning"
      title="功能尚未啟用"
      description="關鍵字庫需要的資料表／欄位還沒建立（Postgres 42P01 或 PGRST204）。請先執行本次 migration，重點是 seo_keywords 的 5 個新欄位（不給 DEFAULT）。"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void refresh();
            void refreshSites();
          }}
        >
          <RefreshCw size={13} />
          重新檢查
        </Button>
      }
    />
  );

  const noSiteState = (
    <ContentEmptyState
      icon={KeyRound}
      title="先選擇站點"
      description="關鍵字庫以站點為單位（seo_keywords.website_profile_id）。用右上角的站點選單選擇要管理的站點。"
      action={
        <Button size="sm" variant="outline" onClick={() => navigate('seo', 'sites')}>
          前往站點清單
        </Button>
      }
    />
  );

  const errorState = (
    <ContentEmptyState
      icon={AlertTriangle}
      tone="error"
      title="讀取關鍵字失敗"
      description={error ?? sitesError ?? '未知錯誤'}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void refresh();
            void refreshSites();
          }}
        >
          <RefreshCw size={13} />
          重試
        </Button>
      }
    />
  );

  const emptyState = (
    <ContentEmptyState
      icon={KeyRound}
      title="這個站還沒有關鍵字"
      description={
        canWrite
          ? '兩種方式開始：匯入 CSV（可下載範本），或從 Google Search Console 掃描機會詞（高曝光低點擊、排名 5–20）。'
          : '目前沒有關鍵字。你的角色只有檢視權限，請聯絡有編輯權限的同事匯入或同步。'
      }
      action={
        <>
          <Button
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : '你的角色沒有編輯權限'}
          >
            <Upload size={13} />
            匯入 CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleScanGsc()}
            disabled={!canWrite || syncing}
            title={canWrite ? undefined : '你的角色沒有編輯權限'}
          >
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            同步 GSC 機會詞
          </Button>
          <a
            href={KEYWORD_CSV_TEMPLATE_HREF}
            download
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgba(13,26,45,0.12)] bg-white px-3 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download size={13} />
            下載範本
          </a>
        </>
      }
    >
      <div className="rounded-md border border-blue-200 bg-blue-50/70 px-3 py-2 text-[12px] leading-relaxed text-blue-900">
        <p className="flex items-center gap-1.5 font-semibold">
          <ShieldCheck size={13} />
          資料安全提醒
        </p>
        <p className="mt-1">
          匯入的新詞由匯入函式寫入 pipeline_status；CSV 留空時預設寫入{' '}
          <span className="font-mono">backlog</span>（＝啟用自動生成）。若只想先放著，請填{' '}
          <span className="font-mono">parked</span>。
        </p>
      </div>
    </ContentEmptyState>
  );

  const renderBody = () => {
    if (isSchemaMissing) return missingSchemaState;
    if (isLoadingSites && !siteId) {
      return (
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-64 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      );
    }
    if (!siteId) return noSiteState;
    // 站點清單失敗時：只要有明確 siteId 仍可顯示關鍵字（header 的 SiteSelect 會提示失敗）
    if (error || (sitesError && !siteId)) return errorState;
    if (loading && keywords.length === 0) {
      return <ContentTable columns={columns} rows={[]} rowKey={(row) => row.id} loading />;
    }
    if (keywords.length === 0) return emptyState;

    return (
      <>
        <ContentMetricBar items={metricItems} loading={loading} />

        {safetyNoteOpen && (
          <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-blue-900">
            <Info size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">自動生成只會挑 backlog 的詞（資料安全規則）</p>
              <p className="mt-0.5">
                既有歷史關鍵字的 pipeline_status 是{' '}
                <span className="font-mono">NULL</span>＝「未啟用」，
                <strong>不會被自動拿去生成文章</strong>。只有你在「操作」明確啟用（或匯入時指定
                backlog）才會進入排程；批次也只作用在你勾選的詞，本頁沒有「全選全部歷史詞」。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSafetyNoteOpen(false)}
              className="self-start rounded p-0.5 text-blue-700/70 transition-colors hover:bg-blue-100 hover:text-blue-900"
              aria-label="關閉說明"
              title="關閉說明"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-3 py-2 shadow-card">
          <Filter size={13} className="text-slate-400" />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="h-8 w-[236px] text-[12px]" aria-label="篩選自動生成狀態">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-[12px]">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={intentFilter} onValueChange={setIntentFilter}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]" aria-label="篩選意圖">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[12px]">
                全部意圖
              </SelectItem>
              {KEYWORD_INTENTS.map((intent) => (
                <SelectItem key={intent} value={intent} className="text-[12px]">
                  {KEYWORD_INTENT_LABEL[intent]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-8 w-[128px] text-[12px]" aria-label="篩選來源">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-[12px]">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priorityFilter}
            onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}
          >
            <SelectTrigger className="h-8 w-[176px] text-[12px]" aria-label="篩選優先級">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-[12px]">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="ml-auto text-[11px] text-muted-foreground">
            顯示 {formatNumber(filteredKeywords.length)} / {formatNumber(keywords.length)} 個詞
          </span>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[12px] text-slate-500"
              onClick={resetFilters}
            >
              <X size={12} />
              清除篩選
            </Button>
          )}
        </div>

        <ContentTable<ContentKeyword>
          columns={columns}
          rows={filteredKeywords}
          rowKey={(row) => row.id}
          loading={loading && keywords.length === 0}
          initialSort={{ key: 'priority', direction: 'desc' }}
          searchable
          searchText={(row) =>
            [
              row.keyword,
              row.normalized_keyword,
              row.cluster ?? '',
              row.target_page ?? '',
              row.intent ? KEYWORD_INTENT_LABEL[row.intent] : '',
              keywordSourceLabel(row.source),
            ]
              .filter(Boolean)
              .join(' ')
          }
          searchPlaceholder="搜尋關鍵字、叢集、目標頁…"
          pageSize={20}
          stickyHeader
          onVisibleRowsChange={handleVisibleRowsChange}
          toolbar={
            selection.size > 0 ? (
              <>
                <span className="text-[12px] text-slate-600">
                  已選 <span className="font-semibold text-[#0d1a2d]">{selection.size}</span> 個詞
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[12px]"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canWrite}
                  title={canWrite ? '批次把勾選的詞改為 backlog' : '你的角色沒有編輯權限'}
                >
                  <Sparkles size={12} />
                  批次啟用生成
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px] text-slate-500"
                  onClick={clearSelection}
                >
                  清除選取
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                勾選列可批次啟用；批次只影響你勾選的詞
              </span>
            )
          }
          emptyFiltered={
            <div className="flex flex-col items-center gap-2 text-center">
              <Filter size={20} className="text-slate-300" />
              <p className="text-[13px] text-muted-foreground">沒有符合目前篩選條件的關鍵字。</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[12px]"
                onClick={resetFilters}
              >
                清除篩選
              </Button>
            </div>
          }
        />
      </>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {header}
        {renderBody()}
      </div>

      <KeywordImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        siteId={siteId}
        siteName={selectedSite ? siteNameOf(selectedSite) : null}
        onImport={importRows}
        existingKeywords={keywords}
        onImported={() => clearSelection()}
      />

      <Dialog open={confirmOpen} onOpenChange={(next) => !batchRunning && setConfirmOpen(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批次啟用自動生成？</DialogTitle>
            <DialogDescription>
              只會影響已勾選的 {selectedKeywords.length} 個詞；歷史關鍵字不會被全選。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-[13px]">
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">這是資料安全規則，不是一般篩選</p>
                <p className="mt-0.5">
                  本頁沒有「全選全部歷史詞」的動作，批次只處理你逐列勾選的詞。改為{' '}
                  <span className="font-mono">backlog</span> 後，planner 才可能把它們排入生成排程。
                </p>
              </div>
            </div>

            <ul className="space-y-1 text-[12px] text-slate-700">
              <li>
                將啟用：
                <span className="mx-1 font-semibold text-teal-700">{batchTargets.length}</span>
                個（pipeline_status → backlog）
              </li>
              <li>
                略過：
                <span className="mx-1 font-semibold text-slate-600">{batchSkipped}</span>
                個（已是 backlog 或狀態不允許批次啟用）
              </li>
            </ul>

            {batchTargets.length > 0 && (
              <div className="max-h-[150px] divide-y divide-slate-100 overflow-auto rounded-md border border-[rgba(13,26,45,0.08)]">
                {batchTargets.slice(0, 50).map((keyword) => (
                  <div
                    key={keyword.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-700">{keyword.keyword}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {keyword.pipeline_status
                        ? `${KEYWORD_PIPELINE_LABEL[keyword.pipeline_status]}（${keyword.pipeline_status}）`
                        : '未啟用（NULL）'}
                    </span>
                  </div>
                ))}
                {batchTargets.length > 50 && (
                  <p className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    另有 {batchTargets.length - 50} 個未列出，仍會一起處理。
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={batchRunning}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void runBatchEnable()}
              disabled={batchRunning || batchTargets.length === 0}
            >
              {batchRunning ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              確認啟用 {batchTargets.length} 個
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
