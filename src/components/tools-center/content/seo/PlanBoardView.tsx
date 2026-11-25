/**
 * 排程表（M1-20、PRD §8.2.3）
 *
 * 站點 × 日期矩陣：
 *   - 列 = 站點（可用 SiteSelect 篩選；預設全部 active 站）
 *   - 欄 = 未來 7／14／30 天（欄頭以顯示時區呈現；每列依站點時區歸日）
 *   - 格子 = 當天該站的 slot；顏色／標籤一律走 ContentStatusPill
 *   - 缺關鍵字（keyword_id = null 且 status = planned）→ amber 邊框 + AlertTriangle
 *   - 審核逾期（isReviewOverdue，未批准）→ rose 邊框
 *   - 站點 down → 整列淡化 + AlertOctagon
 *   - 點格子 → 右側 Sheet：slot 詳情、改時間、暫停（held）、跳過（skipped）、補關鍵字、開工作室
 *
 * 「預覽重算」的語義（任務共識）：
 *   content_jobs 對 authenticated 只讀，content-worker 又只接受 service_role，
 *   契約也沒有 plan_now action，因此本頁**不寫入資料庫**。按鈕只用 planSlots()
 *   在本機計算「若現在重算，未來 30 天會新增幾個 slot」，並在 UI 誠實標示。
 *   真正重算由 cron 的 plan_slots job 或站點設定變更觸發。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CalendarDays,
  Clock,
  DatabaseZap,
  ExternalLink,
  KeyRound,
  Loader2,
  PauseCircle,
  RefreshCw,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { pageMeta } from '@/lib/contentNavigation.ts';
import type { ContentSlot, ContentSiteWithProfile } from '@/lib/contentTypes.ts';
import { can } from '@/lib/contentPermissions.ts';
import {
  HONG_KONG_TIME_ZONE,
  formatRelativeHours,
  formatZoneDateTime,
  formatZoneMonthDay,
  formatZoneWeekday,
  isoWeekday,
  todayInZone,
  zoneDateString,
  zonedWallTimeToUtc,
} from '@/lib/contentFormat.ts';
import {
  cadenceSummary,
  fromZoneInputValue,
  isReviewOverdue,
  normalizeCadence,
  reviewDeadline,
  slotNextAction,
  toZoneInputValue,
} from '@/lib/contentPlanner.ts';
import { canTransition, SITE_HEALTH_LABEL, statusLabel, statusTone } from '@/lib/contentState.ts';
import { useContentSlots, isSlotApproved, slotDateKeys } from '@/hooks/useContentSlots';
import type { ContentSlotWithArticle } from '@/hooks/useContentSlots';
import { useContentSites } from '@/hooks/useContentSites';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { SiteSelect } from '../shared/SiteSelect';
import { KeywordSelect } from '../shared/KeywordSelect';

type DayRange = 7 | 14 | 30;

const DAY_RANGE_OPTIONS: DayRange[] = [7, 14, 30];

/** 這些狀態不再是「等待審核」，不用算逾期 */
const NOT_PENDING_REVIEW: ReadonlySet<ContentSlot['status']> = new Set([
  'approved',
  'scheduled',
  'publishing',
  'published',
  'held',
  'skipped',
  'failed',
]);

interface OpenedCell {
  siteId: string;
  date: string;
  slotIds: string[];
}

function siteNameOf(site: ContentSiteWithProfile | undefined): string {
  if (!site) return '未知站點';
  return site.profile?.website_name || site.website_profile_id;
}

function siteTimezoneOf(site: ContentSiteWithProfile | undefined): string {
  return site?.timezone?.trim() || HONG_KONG_TIME_ZONE;
}

function siteDomainOf(site: ContentSiteWithProfile | undefined): string | null {
  return site?.profile?.domain_url ?? null;
}

/** 某個 slot 在 UI 上要顯示的警示（缺詞／逾期） */
function slotWarnings(
  slot: ContentSlotWithArticle,
  site: ContentSiteWithProfile | undefined,
  now: Date,
): { missingKeyword: boolean; overdue: boolean; overdueHours: number | null } {
  const missingKeyword = slot.keyword_id == null && slot.status === 'planned';
  if (!site || NOT_PENDING_REVIEW.has(slot.status)) {
    return { missingKeyword, overdue: false, overdueHours: null };
  }
  const cutoff = normalizeCadence(site.cadence).review_cutoff_hours;
  const overdue = isReviewOverdue(slot.publish_at, cutoff, isSlotApproved(slot), now);
  const overdueHours = overdue
    ? (now.getTime() - reviewDeadline(slot.publish_at, cutoff).getTime()) / 3_600_000
    : null;
  return { missingKeyword, overdue, overdueHours };
}

/** 站點 × 日期 → slots 的索引；每列依「該站時區」歸日 */
function buildCellIndex(
  slots: readonly ContentSlotWithArticle[],
  sites: readonly ContentSiteWithProfile[],
): Map<string, ContentSlotWithArticle[]> {
  const tzBySite = new Map<string, string>();
  for (const site of sites) {
    tzBySite.set(site.website_profile_id, siteTimezoneOf(site));
  }
  const index = new Map<string, ContentSlotWithArticle[]>();
  for (const slot of slots) {
    const timezone = tzBySite.get(slot.site_id) ?? HONG_KONG_TIME_ZONE;
    const key = `${slot.site_id}|${zoneDateString(new Date(slot.publish_at), timezone)}`;
    const list = index.get(key);
    if (list) list.push(slot);
    else index.set(key, [slot]);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.publish_at.localeCompare(b.publish_at));
  }
  return index;
}

export function PlanBoardView({ route, navigate }: ContentViewProps) {
  const meta = pageMeta(route);
  const { systemUser } = useAuth();
  const canEdit = can({ role: systemUser?.role ?? null }, 'write');

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(route.id ?? null);
  const [dayRange, setDayRange] = useState<DayRange>(14);
  const [openedCell, setOpenedCell] = useState<OpenedCell | null>(null);

  const {
    sites,
    loading: sitesLoading,
    error: sitesError,
    missingSchema: sitesMissing,
    refresh: refreshSites,
  } = useContentSites();

  const {
    slots,
    loading: slotsLoading,
    error: slotsError,
    missingSchema: slotsMissing,
    refresh,
    planNow,
    updateSlot,
    planPreview,
    planning,
    clearPlanPreview,
  } = useContentSlots({ siteId: selectedSiteId, days: 30 });

  // route.id 可能是從站點詳情帶過來的 site id
  useEffect(() => {
    setSelectedSiteId(route.id ?? null);
  }, [route.id]);

  const siteById = useMemo(() => {
    const map = new Map<string, ContentSiteWithProfile>();
    for (const site of sites) map.set(site.website_profile_id, site);
    return map;
  }, [sites]);

  const activeSites = useMemo(
    () => sites.filter((site) => site.status === 'active'),
    [sites],
  );

  /** 矩陣實際列出的站點：指定站點時即使 paused/archived 也顯示（讓使用者知道原因） */
  const visibleSites = useMemo(() => {
    if (!selectedSiteId) return activeSites;
    const matched = sites.filter((site) => site.website_profile_id === selectedSiteId);
    return matched.length > 0 ? matched : activeSites;
  }, [activeSites, selectedSiteId, sites]);

  const selectedSite = selectedSiteId ? siteById.get(selectedSiteId) : undefined;
  const displayTimezone = selectedSite ? siteTimezoneOf(selectedSite) : HONG_KONG_TIME_ZONE;

  const columnDates = useMemo(
    () => slotDateKeys(displayTimezone, dayRange),
    [dayRange, displayTimezone],
  );

  const cellIndex = useMemo(() => buildCellIndex(slots, sites), [slots, sites]);

  const now = new Date();

  // 統計量小（30 天 × 站點），直接算即可，不需要 useMemo；也避免 now 造成的 memo 失效
  const stats = (() => {
    let missingKeyword = 0;
    let overdue = 0;
    for (const slot of slots) {
      const warnings = slotWarnings(slot, siteById.get(slot.site_id), now);
      if (warnings.missingKeyword) missingKeyword += 1;
      if (warnings.overdue) overdue += 1;
    }
    return {
      missingKeyword,
      overdue,
      down: visibleSites.filter((site) => site.health === 'down').length,
    };
  })();

  const cadenceChips = useMemo(() => {
    if (selectedSite) return [cadenceSummary(selectedSite.cadence)];
    const unique = new Set<string>();
    for (const site of activeSites) {
      unique.add(cadenceSummary(site.cadence));
      if (unique.size >= 3) break;
    }
    return [...unique];
  }, [activeSites, selectedSite]);

  const openedSlots = useMemo(() => {
    if (!openedCell) return [];
    const ids = new Set(openedCell.slotIds);
    return slots.filter((slot) => ids.has(slot.id));
  }, [openedCell, slots]);

  const handlePreview = useCallback(async () => {
    try {
      const result = await planNow(selectedSiteId ?? undefined);
      if (result.created === 0) {
        toast.info('預覽完成：目前 cadence 下未來 30 天的排程格都已存在，沒有需要新增的。');
      } else {
        toast.success(`預覽完成：若現在重算，會新增 ${result.created} 個排程格（尚未寫入）。`);
      }
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '預覽重算失敗');
    }
  }, [planNow, selectedSiteId]);

  const handleRefresh = useCallback(async () => {
    clearPlanPreview();
    await Promise.allSettled([refresh(), refreshSites()]);
  }, [clearPlanPreview, refresh, refreshSites]);

  const handleUpdateSlot = useCallback(
    async (id: string, patch: Partial<ContentSlot>) => {
      await updateSlot(id, patch);
    },
    [updateSlot],
  );

  const openCell = useCallback((siteId: string, date: string, cellSlots: ContentSlotWithArticle[]) => {
    setOpenedCell({ siteId, date, slotIds: cellSlots.map((slot) => slot.id) });
  }, []);

  const loading = sitesLoading || (slotsLoading && slots.length === 0);
  const missingSchema = sitesMissing || slotsMissing;
  const loadError = sitesError || slotsError;

  const renderBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="排程表需要的資料表還沒建立（content_slots／content_sites）。請先執行 migration 後重新載入，其他模組不受影響。"
        />
      );
    }

    if (loadError) {
      return (
        <ContentEmptyState
          icon={AlertOctagon}
          tone="error"
          title="排程表載入失敗"
          description={loadError}
          action={
            <Button size="sm" variant="outline" onClick={() => void handleRefresh()}>
              <RefreshCw size={13} />
              重新載入
            </Button>
          }
        />
      );
    }

    if (loading) {
      return (
        <div className="space-y-2" aria-busy="true" aria-label="載入排程表">
          <div className="h-12 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-64 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      );
    }

    if (activeSites.length === 0) {
      return (
        <ContentEmptyState
          icon={CalendarDays}
          title="還沒有啟用中的站點"
          description="排程表以站點為列。先接入站點、設定 cadence，cron 才會依頻率產生排程格。"
          action={<Button size="sm" onClick={() => navigate('seo', 'sites')}>前往站點清單</Button>}
        />
      );
    }

    if (slots.length === 0) {
      return (
        <ContentEmptyState
          icon={CalendarDays}
          title={selectedSiteId ? '這 30 天沒有這個站點的排程格' : '未來 30 天還沒有排程格'}
          description={
            <>
              排程格由 cron 的 plan_slots job（每日 00:10）依 cadence 產生，或站點設定變更時重算。
              可先用「預覽重算」在本機試算會新增幾格——這一步不會寫入資料庫。
            </>
          }
          action={
            <Button size="sm" onClick={() => void handlePreview()} disabled={planning}>
              {planning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              預覽重算
            </Button>
          }
        />
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="w-full min-w-max border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="sticky left-0 top-0 z-20 min-w-[240px] border-b border-r border-[rgba(13,26,45,0.06)] bg-slate-50 px-3 py-2 text-left text-[12px] font-semibold text-[#0d1a2d]">
                  站點
                </th>
                {columnDates.map((date) => {
                  const noonIso = zonedWallTimeToUtc(date, '12:00', displayTimezone).toISOString();
                  const isToday = date === todayInZone(displayTimezone);
                  const weekend = isoWeekday(new Date(noonIso), displayTimezone) >= 6;
                  return (
                    <th
                      key={date}
                      className={cn(
                        'sticky top-0 z-10 min-w-[104px] border-b border-[rgba(13,26,45,0.06)] px-2 py-2 text-center',
                        isToday ? 'bg-teal-50/90' : 'bg-slate-50/95',
                      )}
                    >
                      <div
                        className={cn(
                          'text-[12px] font-semibold',
                          isToday ? 'text-teal-700' : weekend ? 'text-slate-400' : 'text-[#0d1a2d]',
                        )}
                      >
                        {formatZoneMonthDay(noonIso, displayTimezone)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                        {formatZoneWeekday(noonIso, displayTimezone)}
                        {isToday ? ' · 今天' : ''}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleSites.map((site) => {
                const down = site.health === 'down';
                const timezone = siteTimezoneOf(site);
                const domain = siteDomainOf(site);
                return (
                  <tr
                    key={site.website_profile_id}
                    className={cn('align-top', down && 'opacity-60')}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-[5] border-b border-r border-[rgba(13,26,45,0.06)] bg-white px-3 py-2 text-left align-top"
                    >
                      <div className="flex items-center gap-1.5">
                        {down && (
                          <AlertOctagon
                            size={13}
                            className="shrink-0 text-rose-600"
                            aria-label="站點異常"
                          />
                        )}
                        <span className="max-w-[190px] truncate text-[13px] font-semibold text-[#0d1a2d]">
                          {siteNameOf(site)}
                        </span>
                        <ContentStatusPill
                          label={SITE_HEALTH_LABEL[site.health]}
                          tone={statusTone('health', site.health)}
                          dot={false}
                          className="px-1.5 py-0 text-[10px] leading-4"
                        />
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {site.tier} · {cadenceSummary(site.cadence)}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {domain || '未設定網域'} · {timezone}
                      </div>
                      {down && (
                        <>
                          <p className="mt-1 text-[11px] font-medium text-rose-600">
                            站點異常：相關文章會 hold，不自動發布
                          </p>
                          <button
                            type="button"
                            className="mt-0.5 text-[11px] font-medium text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-800"
                            onClick={() => navigate('seo', 'site', site.website_profile_id)}
                          >
                            前往修復連線
                          </button>
                        </>
                      )}
                      {!down && site.health === 'untested' && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-medium text-amber-700 underline decoration-amber-200 underline-offset-2 hover:text-amber-800"
                          onClick={() => navigate('seo', 'site', site.website_profile_id)}
                        >
                          未測試連線：先測試再排程
                        </button>
                      )}
                    </th>
                    {columnDates.map((date) => {
                      const cellSlots =
                        cellIndex.get(`${site.website_profile_id}|${date}`) ?? [];
                      const hasMissingKeyword = cellSlots.some(
                        (slot) => slotWarnings(slot, site, now).missingKeyword,
                      );
                      const hasOverdue = cellSlots.some(
                        (slot) => slotWarnings(slot, site, now).overdue,
                      );
                      const statuses = [...new Set(cellSlots.map((slot) => slot.status))];
                      const firstSlot = cellSlots[0];
                      const articleTitle =
                        cellSlots.map((slot) => slot.article?.title).find(Boolean) ?? null;

                      if (cellSlots.length === 0) {
                        return (
                          <td
                            key={date}
                            className="h-[68px] border-b border-[rgba(13,26,45,0.06)] p-1 align-top"
                          >
                            <div className="flex h-full min-h-[60px] items-center justify-center rounded-md border border-dashed border-slate-100 text-[11px] text-slate-300">
                              —
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={date}
                          className="h-[68px] border-b border-[rgba(13,26,45,0.06)] p-1 align-top"
                        >
                          <button
                            type="button"
                            onClick={() => openCell(site.website_profile_id, date, cellSlots)}
                            title={[
                              `${cellSlots.length} 個排程格`,
                              hasMissingKeyword ? '含缺關鍵字的排程格' : '',
                              hasOverdue ? '含審核逾期的排程格' : '',
                            ]
                              .filter(Boolean)
                              .join('；')}
                            className={cn(
                              'flex h-full min-h-[60px] w-full flex-col items-start gap-1 rounded-md border bg-white p-1.5 text-left transition hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              hasOverdue
                                ? 'border-rose-300 bg-rose-50/40'
                                : hasMissingKeyword
                                  ? 'border-amber-300 bg-amber-50/40'
                                  : 'border-slate-100 hover:border-teal-200',
                            )}
                          >
                            <div className="flex w-full items-center gap-1">
                              <ContentStatusPill
                                machine="slot"
                                status={firstSlot.status}
                                dot={false}
                                className="px-1.5 py-0 text-[10px] leading-4"
                              />
                              {cellSlots.length > 1 && (
                                <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
                                  ×{cellSlots.length}
                                </span>
                              )}
                              <div className="ml-auto flex items-center gap-0.5">
                                {hasMissingKeyword && (
                                  <AlertTriangle
                                    size={13}
                                    className="text-amber-600"
                                    aria-label="缺關鍵字"
                                  />
                                )}
                                {hasOverdue && (
                                  <Clock size={13} className="text-rose-600" aria-label="審核逾期" />
                                )}
                              </div>
                            </div>
                            <span className="line-clamp-2 text-[11px] leading-4 text-slate-700">
                              {articleTitle || firstSlot.keyword?.keyword || statusLabel('slot', firstSlot.status)}
                            </span>
                            {statuses.length > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                {statuses.map((status) => statusLabel('slot', status)).join('、')}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const openedSite = openedCell ? siteById.get(openedCell.siteId) : undefined;
  const openedTimezone = siteTimezoneOf(openedSite);
  const openedDateLabel = openedCell
    ? (() => {
        const noonIso = zonedWallTimeToUtc(openedCell.date, '12:00', openedTimezone).toISOString();
        return `${formatZoneMonthDay(noonIso, openedTimezone)}（${formatZoneWeekday(
          noonIso,
          openedTimezone,
        )}）`;
      })()
    : '';

  return (
    <div className="space-y-4">
      <ContentPageHeader
        title={meta.label}
        subtitle={meta.description}
        actions={
          <>
            <SiteSelect
              value={selectedSiteId}
              onChange={setSelectedSiteId}
              sites={sites}
              allowAll
              placeholder="全部啟用站點"
              className="w-[220px]"
            />
            <div className="inline-flex overflow-hidden rounded-md border border-[rgba(13,26,45,0.12)] bg-white">
              {DAY_RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDayRange(option)}
                  className={cn(
                    'px-2.5 py-1.5 text-[12px] font-medium transition',
                    dayRange === option
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {option} 天
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefresh()}
              title="重新整理排程表"
            >
              <RefreshCw size={13} />
              重新整理
            </Button>
            <Button size="sm" onClick={() => void handlePreview()} disabled={planning}>
              {planning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              預覽重算
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} className="text-slate-400" />
              時區：
              <span className="font-medium text-slate-700">
                {selectedSite ? displayTimezone : `各站時區（欄頭以 ${HONG_KONG_TIME_ZONE} 顯示）`}
              </span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CalendarDays size={13} className="text-slate-400" />
              cadence：
              <span className="truncate font-medium text-slate-700">
                {cadenceChips.length > 0
                  ? cadenceChips.join(' ／ ')
                  : '—'}
                {!selectedSite && activeSites.length > cadenceChips.length
                  ? ` 等 ${activeSites.length} 站`
                  : ''}
              </span>
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
                stats.missingKeyword > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white text-slate-500',
              )}
            >
              <AlertTriangle size={12} />
              缺詞 {stats.missingKeyword}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
                stats.overdue > 0
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-500',
              )}
            >
              <Clock size={12} />
              審核逾期 {stats.overdue}
            </span>
            {stats.down > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-rose-700">
                <AlertOctagon size={12} />
                站點異常 {stats.down}
              </span>
            )}
            <span className="text-slate-400">視窗內排程格 {slots.length} 個</span>
          </div>
        }
      />

      {/* 重算說明列：誠實標示「只預覽、不寫入」 */}
      <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-4 py-3 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-[#0d1a2d]">關於「預覽重算」：</span>
            排程格由背景工作產生（cron 每日 00:10 依 cadence upsert 未來 30 天，或站點設定變更時重算）。
            目前後端沒有提供手動重算的 action，因此這裡的「預覽重算」只在本機用 planner 試算會新增幾格，
            <span className="font-medium text-amber-700">不會寫入資料庫</span>
            ；真正寫入由 cron／設定變更負責。
          </p>
          <div className="text-[12px] text-muted-foreground">
            欄頭日期以 {selectedSite ? displayTimezone : HONG_KONG_TIME_ZONE} 顯示；每列依各站時區歸日。
          </div>
        </div>

        {planPreview && (
          <div className="mt-3 rounded-md border border-teal-200 bg-teal-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-teal-800">
                重算預覽（未寫入）· 未來 {planPreview.horizonDays} 天
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-teal-900">
                  將新增 <strong>{planPreview.totalWouldCreate}</strong> 格 · 已存在{' '}
                  {planPreview.totalExisting} 格（冪等略過）
                </span>
                <Button size="sm" variant="ghost" onClick={clearPlanPreview}>
                  收起
                </Button>
              </div>
            </div>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-700">
              {planPreview.scopes.map((scope) => (
                <li key={scope.siteId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{scope.siteName}</span>
                  <span className="text-muted-foreground">{scope.timezone}</span>
                  <span>
                    將新增 <strong>{scope.wouldCreate}</strong> 格（planner 共 {scope.total}，已存在{' '}
                    {scope.existing}）
                  </span>
                  {scope.skippedBlackout.length > 0 && (
                    <span className="text-amber-700">
                      黑名單日 {scope.skippedBlackout.length} 天
                    </span>
                  )}
                  {scope.warnings.length > 0 && (
                    <span className="text-amber-700" title={scope.warnings.join('\n')}>
                      {scope.warnings.length} 項提醒
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
              以上只是本機試算結果，資料庫沒有任何變更。若需要立即重算，請等待 cron
              下一輪或請管理員在站點設定變更後觸發。
            </p>
          </div>
        )}
      </div>

      {renderBody()}

      <Sheet
        open={Boolean(openedCell) && openedSlots.length > 0}
        onOpenChange={(open) => {
          if (!open) setOpenedCell(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {siteNameOf(openedSite)} · {openedDateLabel}
            </SheetTitle>
            <SheetDescription>
              {openedTimezone} · {openedSlots.length} 個排程格 ·{' '}
              {openedSite ? cadenceSummary(openedSite.cadence) : '—'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {openedSlots.map((slot) => (
              <SlotDetailCard
                key={slot.id}
                slot={slot}
                site={openedSite}
                canEdit={canEdit}
                onUpdate={handleUpdateSlot}
                onOpenStudio={() => {
                  if (slot.article_id) navigate('seo', 'studio', slot.article_id);
                }}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface SlotDetailCardProps {
  slot: ContentSlotWithArticle;
  site: ContentSiteWithProfile | undefined;
  canEdit: boolean;
  onUpdate: (id: string, patch: Partial<ContentSlot>) => Promise<void>;
  onOpenStudio: () => void;
}

function SlotDetailCard({ slot, site, canEdit, onUpdate, onOpenStudio }: SlotDetailCardProps) {
  const timezone = siteTimezoneOf(site);
  const [timeValue, setTimeValue] = useState(() => toZoneInputValue(slot.publish_at, timezone));
  const [reason, setReason] = useState(slot.reason ?? '');
  const [saving, setSaving] = useState(false);
  const warnings = slotWarnings(slot, site, new Date());

  useEffect(() => {
    setTimeValue(toZoneInputValue(slot.publish_at, timezone));
  }, [slot.publish_at, timezone]);

  useEffect(() => {
    setReason(slot.reason ?? '');
  }, [slot.reason]);

  const guard = useCallback(
    async (label: string, action: () => Promise<void>) => {
      if (!canEdit) {
        toast.error('你的角色只能檢視排程；調整排程需要編輯權限。');
        return;
      }
      setSaving(true);
      try {
        await action();
        toast.success(label);
      } catch (thrown) {
        toast.error(thrown instanceof Error ? thrown.message : `${label} 失敗`);
      } finally {
        setSaving(false);
      }
    },
    [canEdit],
  );

  const applyPublishAt = () => {
    const iso = fromZoneInputValue(timeValue, timezone);
    if (!iso) {
      toast.error('請輸入有效的發佈時間（YYYY-MM-DD HH:mm）。');
      return;
    }
    void guard('已更新發佈時間（generate_at 已同步）', () =>
      onUpdate(slot.id, { publish_at: iso }),
    );
  };

  const canHold = canEdit && canTransition('slot', slot.status, 'held');
  const canSkip = canEdit && canTransition('slot', slot.status, 'skipped');
  const canAssignKeyword = canEdit && !slot.article_id;
  const reasonOrDefault = reason.trim();

  return (
    <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ContentStatusPill machine="slot" status={slot.status} />
          <span className="text-[13px] font-semibold text-[#0d1a2d]">
            {formatZoneDateTime(slot.publish_at, timezone)}
          </span>
          <span className="text-[11px] text-muted-foreground">發布時間</span>
        </div>
        {slot.article_id && (
          <Button size="sm" variant="outline" onClick={onOpenStudio}>
            <ExternalLink size={13} />
            開啟工作室
          </Button>
        )}
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-muted-foreground">站點：</dt>
          <dd className="truncate font-medium text-slate-700">{siteNameOf(site)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-muted-foreground">時區：</dt>
          <dd className="truncate text-slate-700">{timezone}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-muted-foreground">關鍵字：</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-slate-700">
              {slot.keyword?.keyword ?? '未指派'}
            </span>
            {slot.keyword?.pipeline_status && (
              <ContentStatusPill
                machine="keyword"
                status={slot.keyword.pipeline_status}
                dot={false}
                className="px-1.5 py-0 text-[10px] leading-4"
              />
            )}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-muted-foreground">生成時間：</dt>
          <dd className="truncate text-slate-700">
            {formatZoneDateTime(slot.generate_at, timezone)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 text-muted-foreground">文章：</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
            {slot.article ? (
              <>
                <span className="truncate text-slate-700">{slot.article.title || '（無標題）'}</span>
                <ContentStatusPill
                  machine="article"
                  status={slot.article.status}
                  dot={false}
                  className="px-1.5 py-0 text-[10px] leading-4"
                />
              </>
            ) : (
              <span className="text-slate-500">尚未生成</span>
            )}
          </dd>
        </div>
        <div className="flex gap-1.5 sm:col-span-2">
          <dt className="shrink-0 text-muted-foreground">下一步：</dt>
          <dd className="text-slate-700">{slotNextAction(slot.status)}</dd>
        </div>
        {slot.reason && (
          <div className="flex gap-1.5 sm:col-span-2">
            <dt className="shrink-0 text-muted-foreground">原因：</dt>
            <dd className="text-slate-700">{slot.reason}</dd>
          </div>
        )}
      </dl>

      {(warnings.missingKeyword || warnings.overdue) && (
        <div className="mt-2 space-y-1.5">
          {warnings.missingKeyword && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                這個排程格還沒有指派關鍵字。到 generate_at 會轉為 held 並在日報告警（PRD §9.2.2 規則
                6）。可用下方「補關鍵字」指定 backlog 的詞。
              </span>
            </div>
          )}
          {warnings.overdue && (
            <div className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50/70 px-2 py-1.5 text-[11px] leading-relaxed text-rose-800">
              <Clock size={13} className="mt-0.5 shrink-0" />
              <span>
                已過審核截止
                {warnings.overdueHours != null
                  ? ` ${formatRelativeHours(warnings.overdueHours)}`
                  : ''}
                ，仍未批准。依規則會轉為 held，永遠不會自動發布；請重新排程或補審核。
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[210px] flex-1">
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              改發佈時間（{timezone}）
            </label>
            <Input
              type="datetime-local"
              className="h-8 bg-white text-[12px]"
              value={timeValue}
              disabled={!canEdit || saving}
              onChange={(event) => setTimeValue(event.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" onClick={applyPublishAt} disabled={!canEdit || saving}>
            套用時間
          </Button>
          <span className="text-[11px] text-muted-foreground">
            generate_at 會依站點 lead time 同步重算
          </span>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600">
            原因／備註（暫停、跳過時寫入）
          </label>
          <Input
            className="h-8 bg-white text-[12px]"
            placeholder="例如：等品牌方確認主視覺"
            value={reason}
            disabled={!canEdit || saving}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canHold || saving}
            title={canHold ? '把這個排程格改為 held，保留不會自動發布' : '目前狀態不可暫停'}
            onClick={() =>
              void guard('已暫停這個排程格（held）', () =>
                onUpdate(slot.id, {
                  status: 'held',
                  reason: reasonOrDefault || '人工暫停',
                }),
              )
            }
          >
            <PauseCircle size={13} />
            暫停（held）
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canSkip || saving}
            title={canSkip ? '跳過這個排程格' : '目前狀態不可跳過'}
            onClick={() =>
              void guard('已跳過這個排程格', () =>
                onUpdate(slot.id, {
                  status: 'skipped',
                  reason: reasonOrDefault || '人工跳過',
                }),
              )
            }
          >
            <SkipForward size={13} />
            跳過（skipped）
          </Button>
          {saving && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
            <KeyRound size={12} />
            補關鍵字（只列 pipeline_status = backlog 的詞）
          </label>
          <KeywordSelect
            siteId={slot.site_id}
            value={slot.keyword_id}
            onChange={(keywordId) => {
              if (keywordId === slot.keyword_id) return;
              void guard(keywordId ? '已指派關鍵字' : '已清除關鍵字', () =>
                onUpdate(slot.id, { keyword_id: keywordId }),
              );
            }}
            onlyBacklog
            placeholder="選擇 backlog 關鍵字"
            disabled={!canAssignKeyword || saving}
            className="max-w-md"
          />
          {!canAssignKeyword && (
            <p className="mt-1 text-[11px] text-amber-700">
              {slot.article_id
                ? '文章已建立，關鍵字不可再改（DB UNIQUE(site_id, keyword_id)）。'
                : '你的角色沒有編輯權限。'}
            </p>
          )}
        </div>

        <p className="font-mono text-[10px] text-slate-400">slot: {slot.id}</p>
      </div>
    </div>
  );
}
