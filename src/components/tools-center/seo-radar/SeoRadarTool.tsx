/**
 * SEO 雷達 · 頁面（PRD §8）
 *
 * 資料來源：GSC 近 28 天查詢（真實曝光／點擊／排名）＋ Google 搜尋建議（新長尾詞）。
 * 抓取結果落在 seo_keyword_ideas（候選池），人工勾選後才寫入 seo_keywords。
 *
 * 安全規則：
 *   - 不勾「加入自動生成佇列」時，pipeline_status 保持 NULL（＝未啟用）
 *   - 勾了也只影響本次採納、且目前是 NULL / backlog 的詞
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  DatabaseZap,
  Loader2,
  Radar,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/contentPermissions';
import { buildContentHash } from '@/lib/contentNavigation';
import { cn } from '@/lib/utils';
import { MARKET_OPTIONS, detectMarket } from '@/lib/seoRadarMarket';
import { useRadarSites, useSeoRadar } from '@/hooks/useSeoRadar';
import type { RadarMarketCode, SeoRadarIdeaRow, SeoRadarRunRow } from '@/types/seoRadar';
import { AdoptDialog } from './AdoptDialog';
import { SeoRadarTable } from './SeoRadarTable';

const SITE_STORAGE_KEY = 'mps.seo-radar.site';

type FilterKey = 'all' | 'gsc' | 'suggest' | 'adopted' | 'ignored';

const WARNING_LABEL: Record<string, string> = {
  gsc_not_linked: '此站點尚未綁定 GSC，本次只有搜尋建議詞（沒有曝光數據）。',
  gsc_no_terms: 'GSC 近 28 天沒有可用的查詢詞，建議先同步 GSC。',
  suggest_unavailable: '部分 Google 搜尋建議抓取失敗，結果可能比預期少。',
  ideas_empty: '這次沒有抓到任何詞，請確認站點是否已同步 GSC。',
};

const FILTER_LABEL: Record<FilterKey, string> = {
  all: '全部',
  gsc: 'GSC',
  suggest: '建議詞',
  adopted: '已採納',
  ignored: '已忽略',
};

function readStoredSite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSite(siteId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SITE_STORAGE_KEY, siteId);
  } catch {
    // 私密模式忽略
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return '從未抓取';
  const startedAt = new Date(iso).getTime();
  if (!Number.isFinite(startedAt)) return '—';
  const diff = Date.now() - startedAt;
  if (diff < 60_000) return '剛剛';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function isStaleRunning(run: SeoRadarRunRow | null): boolean {
  if (!run || run.status !== 'running') return false;
  const startedAt = new Date(run.started_at).getTime();
  if (!Number.isFinite(startedAt)) return true;
  return Date.now() - startedAt > 10 * 60_000;
}

function matchesFilter(idea: SeoRadarIdeaRow, filter: FilterKey): boolean {
  switch (filter) {
    case 'gsc':
      return idea.source === 'gsc';
    case 'suggest':
      return idea.source === 'suggest';
    case 'adopted':
      return idea.status === 'adopted';
    case 'ignored':
      return idea.status === 'ignored';
    case 'all':
    default:
      return true;
  }
}

function MetricItem({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'teal' | 'emerald' | 'amber';
}) {
  return (
    <div
      className={cn(
        'flex min-w-[92px] flex-col rounded-md border px-3 py-2',
        tone === 'teal' && 'border-teal-200 bg-teal-50/60',
        tone === 'emerald' && 'border-emerald-200 bg-emerald-50/60',
        tone === 'amber' && 'border-amber-200 bg-amber-50/60',
        tone === 'default' && 'border-[rgba(13,26,45,0.08)] bg-white',
      )}
    >
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[16px] font-semibold tabular-nums">{value.toLocaleString('en-US')}</span>
    </div>
  );
}

export function SeoRadarTool() {
  const { systemUser } = useAuth();
  const canWrite = can({ role: systemUser?.role ?? null }, 'write');

  const { sites, loading: sitesLoading, error: sitesError, refresh: refreshSites } = useRadarSites();
  const [siteId, setSiteId] = useState<string | null>(() => readStoredSite());
  const [marketOverride, setMarketOverride] = useState<'auto' | RadarMarketCode>('auto');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [scanNotes, setScanNotes] = useState<string[]>([]);

  const radar = useSeoRadar(siteId);
  const {
    ideas,
    lastRun,
    loading: ideasLoading,
    error: ideasError,
    missingSchema,
    scanning,
    working,
    warnings,
    refresh,
    scan,
    adopt,
    ignore,
  } = radar;

  // 站點清單載入後修正選擇（保留上次選的，失效就退回第一個）
  useEffect(() => {
    if (sites.length === 0) return;
    if (siteId && sites.some((site) => site.id === siteId)) return;
    const stored = readStoredSite();
    const next = stored && sites.some((site) => site.id === stored) ? stored : sites[0].id;
    setSiteId(next);
  }, [sites, siteId]);

  useEffect(() => {
    if (siteId) writeStoredSite(siteId);
  }, [siteId]);

  useEffect(() => {
    setSelected(new Set());
    setFilter('all');
    setScanNotes([]);
  }, [siteId]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === siteId) ?? null,
    [sites, siteId],
  );

  const autoMarket = useMemo(
    () => detectMarket(selectedSite?.domainUrl ?? null),
    [selectedSite?.domainUrl],
  );

  const counts = useMemo(() => {
    const result = { all: ideas.length, gsc: 0, suggest: 0, adopted: 0, ignored: 0 };
    for (const idea of ideas) {
      if (idea.source === 'gsc') result.gsc += 1;
      if (idea.source === 'suggest') result.suggest += 1;
      if (idea.status === 'adopted') result.adopted += 1;
      if (idea.status === 'ignored') result.ignored += 1;
    }
    return result;
  }, [ideas]);

  const filtered = useMemo(
    () => ideas.filter((idea) => matchesFilter(idea, filter)),
    [ideas, filter],
  );

  const selectedIdeas = useMemo(
    () => ideas.filter((idea) => selected.has(idea.id)),
    [ideas, selected],
  );

  const toggleIdea = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[], next: boolean) => {
    setSelected((previous) => {
      const updated = new Set(previous);
      for (const id of ids) {
        if (next) updated.add(id);
        else updated.delete(id);
      }
      return updated;
    });
  }, []);

  const handleScan = useCallback(async () => {
    const result = await scan(marketOverride === 'auto' ? null : marketOverride);
    if (!result) return;

    const notes = (result.warnings ?? [])
      .map((code) => WARNING_LABEL[code] ?? code)
      .filter(Boolean);
    setScanNotes(notes);

    const total = (result.inserted ?? 0) + (result.updated ?? 0);
    toast.success(
      `已抓取 ${total} 個詞（GSC ${result.gsc_terms} · 建議 ${result.suggest_terms}）`,
    );
  }, [scan, marketOverride]);

  const handleAdoptConfirm = useCallback(
    async (enqueue: boolean) => {
      const ids = selectedIdeas.map((idea) => idea.id);
      const result = await adopt(ids, enqueue);
      setAdoptOpen(false);
      if (!result) return;
      setSelected(new Set());
      const enqueuedNote = result.enqueued > 0 ? `，${result.enqueued} 個已加入自動生成佇列` : '';
      toast.success(`已採納 ${result.adopted} 個詞${enqueuedNote}`);
    },
    [adopt, selectedIdeas],
  );

  const handleIgnore = useCallback(async () => {
    const ids = selectedIdeas.map((idea) => idea.id);
    const result = await ignore(ids);
    if (!result) return;
    setSelected(new Set());
    toast.success(`已忽略 ${result.updated} 個詞`);
  }, [ignore, selectedIdeas]);

  const openKeywordLibrary = useCallback(() => {
    if (!siteId) return;
    window.location.hash = buildContentHash('seo', 'keywords', siteId);
  }, [siteId]);

  // ------------------------------------------------------------
  // 阻擋態：資料表未建立
  // ------------------------------------------------------------
  if (missingSchema) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">SEO 雷達</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            抓取真實熱門關鍵詞：GSC 28 天曝光＋Google 搜尋建議。
          </p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
            <DatabaseZap size={18} />
            功能尚未啟用
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-amber-900/90">
            SEO 雷達的資料表還沒建立（Postgres 42P01）。請先推送本次 migration，再重新載入；
            在那之前這個入口不會影響工具中心的其他功能。
          </p>
          <ol className="mt-3 space-y-1 text-[12px] text-amber-900/80">
            <li>1. 在專案根目錄執行 `npm run db:push`（兩支 seo_radar migration）。</li>
            <li>2. 部署 `seo-radar` Edge Function。</li>
            <li>3. 回到本頁按「重新檢查」。</li>
          </ol>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => void refresh()}>
            <RefreshCw size={13} />
            重新檢查
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 頁首 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">SEO 雷達</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            抓取真實熱門關鍵詞：GSC 28 天曝光＋Google 搜尋建議，勾選後一鍵採納進關鍵字庫。
          </p>
        </div>
        <div className="text-right text-[12px] text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <Radar size={13} className="text-teal-600" />
            {isStaleRunning(lastRun) ? '上次抓取未完成' : `上次抓取 ${formatRelative(lastRun?.started_at ?? null)}`}
          </div>
          {lastRun?.status === 'error' && (
            <div className="mt-1 max-w-[280px] text-rose-600">{lastRun.error_message ?? '抓取失敗'}</div>
          )}
        </div>
      </div>

      {/* 控制列 */}
      <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto]">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">站點</label>
            <Select
              value={siteId ?? ''}
              onValueChange={(value) => setSiteId(value)}
              disabled={sitesLoading || sites.length === 0}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={sitesLoading ? '載入站點…' : '選擇站點'} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          site.gscConnected ? 'bg-emerald-500' : 'bg-slate-300',
                        )}
                      />
                      {site.websiteName}
                      <span className="text-[11px] text-muted-foreground">
                        {site.gscConnected ? 'GSC 已連接' : 'GSC 未連接'}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              市場（預設跟隨站點域名）
            </label>
            <Select
              value={marketOverride}
              onValueChange={(value) =>
                setMarketOverride(value === 'auto' ? 'auto' : (value as RadarMarketCode))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自動（{autoMarket.label}）</SelectItem>
                {MARKET_OPTIONS.map((market) => (
                  <SelectItem key={market.code} value={market.code}>
                    {market.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button
              onClick={() => void handleScan()}
              disabled={!canWrite || !siteId || scanning}
              title={canWrite ? undefined : '需要管理層／文案／市場推廣等角色'}
              className="h-9 bg-teal-600 text-white hover:bg-teal-700"
            >
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
              {scanning ? '抓取中…' : '抓取熱門關鍵詞'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => void refresh()}
              disabled={ideasLoading}
              title="重新載入候選詞"
            >
              <RefreshCw size={13} className={ideasLoading ? 'animate-spin' : undefined} />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>曝光＝GSC 近 28 天曝光次數，不是月搜尋量。</span>
          <span>每次最多 100 個詞。</span>
          {selectedSite && !selectedSite.gscConnected && (
            <span className="text-amber-700">此站點未綁定 GSC，只能抓到搜尋建議詞。</span>
          )}
        </div>
      </div>

      {/* 指標列 */}
      <div className="flex flex-wrap gap-2">
        <MetricItem label="抓取詞" value={counts.all} />
        <MetricItem label="GSC" value={counts.gsc} tone="teal" />
        <MetricItem label="建議詞" value={counts.suggest} />
        <MetricItem label="已採納" value={counts.adopted} tone="emerald" />
        <MetricItem label="已忽略" value={counts.ignored} />
      </div>

      {/* 警告 / 錯誤 */}
      {scanNotes.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {scanNotes.map((note) => (
              <div key={note}>{note}</div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && scanNotes.length === 0 && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
          上次抓取備註：{warnings.map((code) => WARNING_LABEL[code] ?? code).join(' ')}
        </div>
      )}

      {ideasError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {ideasError}
        </div>
      )}

      {sitesError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          站點清單載入失敗：{sitesError}
          <button type="button" className="ml-2 underline" onClick={() => void refreshSites()}>
            重試
          </button>
        </div>
      )}

      {/* 篩選 + 批次動作 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(FILTER_LABEL) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                filter === key
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-border bg-white text-muted-foreground hover:text-foreground',
              )}
            >
              {FILTER_LABEL[key]}
              <span className="ml-1 tabular-nums opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {selectedIdeas.length > 0 && (
            <span className="text-[12px] text-muted-foreground">已選 {selectedIdeas.length} 個</span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={openKeywordLibrary}
            disabled={!siteId}
            title="到關鍵字庫查看已採納的詞"
          >
            <ArrowUpRight size={13} />
            關鍵字庫
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void handleIgnore()}
            disabled={!canWrite || working || selectedIdeas.length === 0}
          >
            忽略
          </Button>
          <Button
            size="sm"
            className="h-8 bg-teal-600 text-white hover:bg-teal-700"
            onClick={() => setAdoptOpen(true)}
            disabled={!canWrite || selectedIdeas.length === 0}
          >
            採納到關鍵字庫（{selectedIdeas.length}）
          </Button>
        </div>
      </div>

      {/* 結果表 */}
      {ideasLoading && ideas.length === 0 ? (
        <div className="space-y-2">
          <div className="h-24 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-52 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      ) : (
        <SeoRadarTable
          ideas={filtered}
          selected={selected}
          onToggle={toggleIdea}
          onToggleMany={toggleMany}
          canWrite={canWrite}
          emptyMessage={
            ideas.length === 0
              ? '尚無候選詞。選好站點後按「抓取熱門關鍵詞」，系統會用 GSC 近 28 天數據＋Google 搜尋建議產生 100 個詞。'
              : '這個篩選下沒有詞，換個條件看看。'
          }
        />
      )}

      <AdoptDialog
        open={adoptOpen}
        count={selectedIdeas.length}
        busy={working}
        onClose={() => setAdoptOpen(false)}
        onConfirm={(enqueue) => void handleAdoptConfirm(enqueue)}
      />
    </div>
  );
}
