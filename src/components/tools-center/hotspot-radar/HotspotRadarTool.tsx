/**
 * 熱點雷達 · 頁面（PRD §8）
 *
 * 資料來源：第三方抓取 API（IG 帳號／Hashtag／Meta 廣告庫）→ hotspot_items 熱門池。
 * 排序：絕對互動量＋帳號內相對熱度；廣告改用投放天數（抓不到讚／留言）。
 * v1 只做「瀏覽 → 收藏 → 標記」，不生成腳本、不推排期。
 */

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/contentPermissions';
import { isHotItem, sortHotspotItems } from '@/lib/hotspotRadar';
import { cn } from '@/lib/utils';
import { useHotspotRadar } from '@/hooks/useHotspotRadar';
import type { HotspotFavoriteStatus, HotspotFeedItem } from '@/types/hotspotRadar';
import { HotspotCard } from './HotspotCard';
import { HotspotEmptyState } from './HotspotEmptyState';
import {
  DEFAULT_FILTERS,
  HotspotFilterBar,
  type HotspotFilters,
  type HotspotSourceTab,
} from './HotspotFilterBar';
import { HotspotTargetsPanel } from './HotspotTargetsPanel';

const FILTER_STORAGE_KEY = 'mps.hotspot-radar.filters';

function readStoredFilters(): HotspotFilters {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FILTERS };
    const parsed = JSON.parse(raw) as Partial<HotspotFilters>;
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

function writeStoredFilters(filters: HotspotFilters): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // 私密模式忽略
  }
}

/** 把 Edge Function 的 warning code 轉成看得懂的一句話 */
function describeWarning(code: string): string {
  if (code === 'no_targets') return '還沒有啟用中的監測目標，請先按「監測目標」新增。';
  if (code === 'auto_daily_off') return '每日自動抓取已關閉，這次是刻意跳過的。';
  if (code === 'time_budget_exhausted') return '這次時間用完，剩下的目標會留到下一輪。';
  if (code.startsWith('budget_trimmed:')) {
    const count = code.split(':')[1] ?? '';
    return `本月剩餘預算只夠抓 ${count} 個目標，其餘留到下次（或調高月上限）。`;
  }
  if (code.startsWith('target_failed:')) {
    return `目標 ${code.slice('target_failed:'.length)} 這次抓取失敗，已記錄在該目標上。`;
  }
  if (code.startsWith('unsupported_source:')) {
    const kind = code.split(':')[1] ?? '';
    const label =
      kind === 'hashtag' ? 'Hashtag' : kind === 'ad_keyword' ? '廣告' : kind;
    return `${label} 來源尚未接入，這次只抓已支援的帳號。`;
  }
  return code;
}

export function HotspotRadarTool() {
  const { systemUser } = useAuth();
  const canWrite = can({ role: systemUser?.role ?? null }, 'write');
  const canManage = can({ role: systemUser?.role ?? null }, 'manage_settings');

  const {
    items,
    targets,
    runs,
    daily,
    loading,
    error,
    missingSchema,
    scanningAll,
    saving,
    warnings,
    refresh,
    actions,
  } = useHotspotRadar();

  const [filters, setFilters] = useState<HotspotFilters>(() => readStoredFilters());
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [noteItem, setNoteItem] = useState<HotspotFeedItem | null>(null);
  const [noteText, setNoteText] = useState('');


  const updateFilters = useCallback((patch: Partial<HotspotFilters>) => {
    setFilters((previous) => {
      const next = { ...previous, ...patch };
      writeStoredFilters(next);
      return next;
    });
  }, []);

  const activeTargetCount = useMemo(
    () => targets.filter((target) => target.active).length,
    [targets],
  );

  const counts = useMemo<Record<HotspotSourceTab, number>>(() => {
    const next: Record<HotspotSourceTab, number> = {
      all: items.length,
      account: 0,
      hashtag: 0,
      ad_keyword: 0,
      library: 0,
    };
    for (const item of items) {
      next[item.source_kind] += 1;
      if (item.favorite) next.library += 1;
    }
    return next;
  }, [items]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const windowMs = filters.days * 86_400_000;

    return items.filter((item) => {
      const isLibraryTab = filters.source === 'library';
      if (isLibraryTab) {
        if (!item.favorite) return false;
      } else if (filters.source !== 'all' && item.source_kind !== filters.source) {
        return false;
      }

      if (!isLibraryTab && filters.onlyUnfavorited && item.favorite) return false;
      if (filters.platform !== 'all' && item.platform !== filters.platform) return false;
      if (filters.media !== 'all' && item.media_type !== filters.media) return false;

      // 已無互動門檻：所有入池內容預設都顯示（使用者要求移除互動數閘門）
      if (filters.onlyHot && !isHotItem(item)) return false;

      // posted_at 為 NULL 的列不因時間窗被丟掉（PRD §7.2）
      if (item.posted_at) {
        const time = Date.parse(item.posted_at);
        if (Number.isFinite(time) && now - time > windowMs) return false;
      }
      return true;
    });
  }, [items, filters]);

  const sorted = useMemo(() => sortHotspotItems(filtered, filters.sort), [filtered, filters.sort]);

  const lastRun = useMemo(() => runs.find((run) => run.meta?.kind !== 'test') ?? null, [runs]);
  /** 示範模式：最近一次抓取用的是內建樣本供應商（未設定第三方金鑰時的行為） */
  const demoMode = lastRun?.meta?.provider === 'mock';
  const otherError = error;

  const handleScan = useCallback(async () => {
    if (activeTargetCount === 0) {
      toast.error('請先新增至少一個啟用中的監測目標');
      setTargetsOpen(true);
      return;
    }
    const ok = await actions.scanAll();
    if (ok) toast.success('已更新熱門內容');
  }, [actions, activeTargetCount]);

  const handleToggleDaily = useCallback(async () => {
    try {
      await actions.setDaily(!(daily?.enabled ?? false));
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '切換失敗');
    }
  }, [actions, daily?.enabled]);

  const handleFavorite = useCallback(
    async (itemId: string, status: HotspotFavoriteStatus) => {
      try {
        await actions.favorite(itemId, status);
      } catch {
        // 錯誤已寫進 hook 的 error，這裡不重複 toast
      }
    },
    [actions],
  );

  const handleUnfavorite = useCallback(
    async (itemId: string) => {
      try {
        await actions.unfavorite(itemId);
      } catch {
        // 同上
      }
    },
    [actions],
  );

  const openNote = useCallback((item: HotspotFeedItem) => {
    setNoteItem(item);
    setNoteText(item.favorite?.note ?? '');
  }, []);

  const saveNote = useCallback(async () => {
    if (!noteItem) return;
    try {
      await actions.favorite(noteItem.id, noteItem.favorite?.status ?? 'saved', noteText.trim() || null);
      toast.success('已儲存備註');
      setNoteItem(null);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '儲存失敗');
    }
  }, [actions, noteItem, noteText]);

  // ------------------------------------------------------------
  // 阻擋態：資料表未建立
  // ------------------------------------------------------------
  if (missingSchema) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">熱點雷達</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            對標 IG 熱門內容與競品廣告，收藏成靈感庫。
          </p>
        </div>
        <HotspotEmptyState
          tone="warning"
          title="功能尚未啟用"
          description="熱點雷達的資料表還沒建立（Postgres 42P01）。請先套用本次 migration 再重新載入；在那之前這個入口不會影響工具中心的其他功能。"
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新檢查
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 頁首 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[32px] font-bold tracking-tight">
            熱點雷達
            {demoMode && (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                <FlaskConical size={11} />
                示範
              </span>
            )}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            抓取對標帳號、Hashtag 與競品廣告的近期熱門內容；用互動量與帳號內相對熱度排序，收藏成靈感庫。
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-[12px]"
              onClick={() => setTargetsOpen(true)}
            >
              <Target size={13} />
              監測目標
              <span className="tabular-nums text-muted-foreground">{targets.length}</span>
            </Button>

            <Button
              size="sm"
              variant={daily?.enabled ? 'default' : 'outline'}
              className={cn(
                'h-8 gap-1.5 px-3 text-[12px] font-medium',
                daily?.enabled && 'bg-teal-600 text-white hover:bg-teal-700',
              )}
              onClick={() => void handleToggleDaily()}
              disabled={!canManage || saving}
              title={
                canManage
                  ? '香港時間。週一至六：00:00、06:00、09:00、11:00、12:00、13:00、15:00、17:00、18:00。週日：00:00、06:00、12:00、18:00。'
                  : '只有管理層可以切換每日自動抓取'
              }
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : daily?.enabled ? (
                <Pause size={13} />
              ) : (
                <Play size={13} />
              )}
              每日自動抓取
            </Button>

            <Button
              size="sm"
              className="h-8 gap-1.5 bg-teal-600 px-3 text-[12px] text-white hover:bg-teal-700"
              onClick={() => void handleScan()}
              disabled={!canWrite || scanningAll}
              title={canWrite ? '立即為所有啟用中的目標更新內容' : '需要文案／市場推廣／管理層等角色'}
            >
              {scanningAll ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {scanningAll ? '抓取中…' : '立即抓取'}
            </Button>
          </div>

        </div>
      </div>

      {demoMode && (
        <div className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[12px] leading-relaxed text-indigo-800">
          <FlaskConical size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">示範模式：用內建樣本資料</div>
            <div>
              按「立即抓取」會即時產生卡片，方便先看效果；內容不是真實 IG／廣告數據，也不花 API 費用。
              設定 Apify 金鑰並把 <code className="rounded bg-white/70 px-1">HOTSPOT_PROVIDER</code> 改為{' '}
              <code className="rounded bg-white/70 px-1">apify</code> 後，會自動切換為真實抓取。
            </div>
          </div>
        </div>
      )}

      {otherError && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>{otherError}</div>
          <button
            type="button"
            className="ml-auto shrink-0 underline"
            onClick={() => void refresh()}
          >
            重試
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          {warnings.map((code) => (
            <div key={code}>{describeWarning(code)}</div>
          ))}
        </div>
      )}

      <HotspotFilterBar filters={filters} counts={counts} onChange={updateFilters} />

      {/* 內容 */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div
              key={index}
              className="h-[320px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card"
            />
          ))}
        </div>
      ) : targets.length === 0 && items.length === 0 ? (
        <HotspotEmptyState
          title="先新增一個對標目標"
          description="可以加 Instagram 對標帳號、Hashtag，或 Meta 廣告關鍵字。加好後按「立即抓取」，系統會把近期熱門內容放進這裡。"
          action={
            <Button
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => setTargetsOpen(true)}
            >
              <Target size={13} />
              新增監測目標
            </Button>
          }
        />
      ) : sorted.length === 0 ? (
        <HotspotEmptyState
          title="這個條件下沒有內容"
          description={
            items.length === 0
              ? '還沒有抓到任何內容。按「立即抓取」或等每日自動抓取。'
              : '試試放寬時間窗，或取消「只看爆款」。'
          }
          action={
            <Button size="sm" variant="outline" onClick={() => updateFilters({ ...DEFAULT_FILTERS })}>
              重設篩選
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <span>
              顯示 {sorted.length} / {items.length} 則
              {filters.source === 'library' ? '（靈感庫）' : ''}
            </span>
            <button type="button" className="underline" onClick={() => void refresh()} disabled={loading}>
              重新整理
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">
            {sorted.map((item) => (
              <HotspotCard
                key={item.id}
                item={item}
                canWrite={canWrite}
                busy={saving}
                onFavorite={(itemId, status) => void handleFavorite(itemId, status)}
                onUnfavorite={(itemId) => void handleUnfavorite(itemId)}
                onEditNote={openNote}
              />
            ))}
          </div>
        </>
      )}

      <HotspotTargetsPanel
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        targets={targets}
        canManage={canManage}
        saving={saving}
        onCreate={actions.createTarget}
        onUpdate={actions.updateTarget}
        onDelete={actions.deleteTarget}
        onTest={actions.testTarget}
      />

      <Dialog open={Boolean(noteItem)} onOpenChange={(next) => (!next ? setNoteItem(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>備註</DialogTitle>
            <DialogDescription>
              記下這則內容值得參考的地方（例：開頭 3 秒 hook、字幕節奏、CTA 寫法）。最多 500 字。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            maxLength={500}
            placeholder="例：前 3 秒用對比畫面抓注意力，中段切成 3 個賣點"
            className="min-h-[96px] bg-white text-[13px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteItem(null)} disabled={saving}>
              取消
            </Button>
            <Button
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void saveNote()}
              disabled={saving || !canWrite}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
