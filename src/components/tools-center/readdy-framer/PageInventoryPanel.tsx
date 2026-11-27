import { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Globe2,
  Layers,
  Loader2,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ReaddyDiscoveredPage,
  ReaddyPageKind,
  ReaddyProjectAnalysis,
} from '@/types/readdyFramer';

interface PageInventoryPanelProps {
  compact?: boolean;
  analysis: ReaddyProjectAnalysis | null;
  activePageId: string | null;
  loadingPageId: string | null;
  backgroundConverting?: boolean;
  onSelectPage: (page: ReaddyDiscoveredPage) => void;
  onToggleSkipPage: (pageId: string) => void;
}

const LOCALE_LABELS: Record<string, string> = {
  zh: '繁中 zh',
  en: '英文 en',
  cn: '簡中 cn',
  default: '預設',
};

const KIND_LABELS: Record<ReaddyPageKind, string> = {
  home: '主頁',
  page: '頁面',
  'layout-page': 'Layout頁',
  article: '文章',
  'locale-mirror': '簡中映射',
  'not-found': '404',
  'single-file': '單檔',
};

export function PageInventoryPanel({
  compact = false,
  analysis,
  activePageId,
  loadingPageId,
  backgroundConverting = false,
  onSelectPage,
  onToggleSkipPage,
}: PageInventoryPanelProps) {
  const [search, setSearch] = useState('');
  const [localeFilter, setLocaleFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [hideDone, setHideDone] = useState(false);

  const pages = analysis?.pages || [];

  const stats = useMemo(() => {
    let migrated = 0;
    let skipped = 0;
    let parsed = 0;
    let syncing = 0;
    let failed = 0;
    let pending = 0;
    for (const p of pages) {
      if (p.migrationStatus === 'migrated') migrated += 1;
      else if (p.migrationStatus === 'skipped') skipped += 1;
      else if (p.migrationStatus === 'parsed') parsed += 1;
      else if (p.migrationStatus === 'syncing') syncing += 1;
      else if (p.migrationStatus === 'failed') failed += 1;
      else pending += 1;
    }
    const activeTotal = Math.max(0, pages.length - skipped);
    const pct = activeTotal > 0 ? Math.round((migrated / activeTotal) * 100) : 0;
    return { total: pages.length, migrated, skipped, parsed, syncing, failed, pending, activeTotal, pct };
  }, [pages]);

  const localeOptions = useMemo(() => {
    if (!analysis) return [];
    return Object.entries(analysis.localeCounts).sort((a, b) => b[1] - a[1]);
  }, [analysis]);

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages.filter((p) => {
      if (localeFilter !== 'all' && p.locale !== localeFilter) return false;
      if (kindFilter === 'core') {
        if (p.pageKind === 'article' || p.pageKind === 'locale-mirror') return false;
      } else if (kindFilter === 'article') {
        if (p.pageKind !== 'article') return false;
      } else if (kindFilter === 'mirror') {
        if (p.pageKind !== 'locale-mirror') return false;
      }
      if (hideDone && (p.migrationStatus === 'migrated' || p.migrationStatus === 'skipped')) {
        return false;
      }
      if (q) {
        const haystack = `${p.path} ${p.title} ${p.sourceFile} ${p.articleSlug || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [pages, localeFilter, kindFilter, hideDone, search]);

  const colorSwatches = useMemo(() => {
    if (!analysis?.cssTokens) return [];
    const t = analysis.cssTokens;
    return [
      { label: '背景', hex: t.backgroundHex },
      { label: '主色', hex: t.primaryHex },
      { label: '強調', hex: t.accentHex },
      { label: '文字', hex: t.textHex },
    ].filter((s): s is { label: string; hex: string } => Boolean(s.hex));
  }, [analysis]);

  return (
    <section className="p-4 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-[#0BB59B]/15 text-[#08967F] font-mono text-[11px] font-bold shrink-0">
            02
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-[#101B2D] truncate">
              頁面盤點與逐頁遷移隊列
            </h2>
          </div>
        </div>
        {analysis && (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[#101B2D] font-mono text-[11px] font-bold shrink-0 tabular-nums">
            {stats.migrated}/{stats.activeTotal} 頁
          </span>
        )}
      </div>

      {!analysis ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center space-y-1.5">
          <Layers size={20} className="mx-auto text-slate-400" />
          <p className="text-[12.5px] font-semibold text-[#101B2D]">
            尚未分析專案結構
          </p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            請先在 Step 01 上傳 Readdy ZIP 工程包或掃描 GitHub 倉庫，系統將自動識別所有路由、子頁面與文章並生成搬移清單。
          </p>
        </div>
      ) : (
        <>
          {/* Project Summary Banner */}
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold text-[#101B2D] truncate">
                  {analysis.projectName}
                </div>
                <div className="text-[10.5px] text-slate-500 font-mono truncate mt-0.5">
                  {analysis.framework} · {analysis.totalFiles} files · {analysis.pages.length} routes
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#08967F] tabular-nums shrink-0">
                {stats.pct}%
              </span>
            </div>

            {/* Overall migration progress bar */}
            <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
              <div
                className="h-full bg-[#0BB59B] transition-all duration-300"
                style={{ width: `${stats.pct}%` }}
              />
            </div>

            {backgroundConverting && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-teal-50/70 px-2.5 py-1.5 text-[10.5px] font-medium text-[#08967F]">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Loader2 size={11} className="animate-spin shrink-0" />
                  <span>後台轉換中</span>
                </span>
                {stats.syncing > 0 && (
                  <span className="tabular-nums">進行中 {stats.syncing}</span>
                )}
                <span className="text-slate-600 tabular-nums">待轉換 {stats.pending}</span>
                {stats.failed > 0 && (
                  <span className="text-rose-600 tabular-nums">失敗 {stats.failed}</span>
                )}
              </div>
            )}

            {/* Extracted OKLCH Theme Swatches + Fonts */}
            {(colorSwatches.length > 0 || (!compact && analysis.cssTokens.fontHeading)) && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[10.5px] text-slate-500">
                <div className="flex items-center gap-2 flex-wrap">
                  <Palette size={11} className="text-slate-400 shrink-0" />
                  {colorSwatches.map((sw) => (
                    <span
                      key={sw.label}
                      className="inline-flex items-center gap-1 font-mono"
                      title={`${sw.label}: ${sw.hex}`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                        style={{ backgroundColor: sw.hex }}
                      />
                      {!compact && <span>{sw.hex}</span>}
                    </span>
                  ))}
                </div>
                {!compact && analysis.cssTokens.fontHeading && (
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[160px]">
                    {analysis.cssTokens.fontHeading.split(',')[0]}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Search + filters stay pinned while the page list scrolls in the rail */}
          <div className="sticky top-0 z-20 -mx-4 space-y-2 border-b border-slate-200/80 bg-white/95 px-4 pb-3 pt-3.5 backdrop-blur-sm !mt-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70 focus-within:border-[#0BB59B] focus-within:bg-white transition-colors">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋路由 /wedding、標題或檔名…"
                className="w-full bg-transparent text-[12px] text-[#101B2D] outline-none placeholder:text-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="text-[10.5px] text-slate-400 hover:text-slate-700 shrink-0"
                >
                  清除
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {localeOptions.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setLocaleFilter('all')}
                    className={cn(
                      'shrink-0 px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition-colors whitespace-nowrap',
                      localeFilter === 'all'
                        ? 'bg-[#101B2D] text-white border-[#101B2D]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                    )}
                  >
                    全部語系 ({pages.length})
                  </button>
                  {localeOptions.map(([loc, cnt]) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocaleFilter(loc)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition-colors whitespace-nowrap',
                        localeFilter === loc
                          ? 'bg-[#0BB59B] text-[#081018] border-[#0BB59B] font-semibold'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <Globe2 size={10} />
                      <span>{LOCALE_LABELS[loc] || loc}</span>
                      <span className="font-mono opacity-80">{cnt}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1">
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                  {[
                    { id: 'all', label: '全類型' },
                    { id: 'core', label: '核心頁面' },
                    { id: 'article', label: '文章頁' },
                    { id: 'mirror', label: '語言映射' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setKindFilter(tab.id)}
                      className={cn(
                        'shrink-0 px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors whitespace-nowrap',
                        kindFilter === tab.id
                          ? 'bg-teal-50 text-[#08967F] border border-teal-200 font-semibold'
                          : 'text-slate-500 hover:text-[#101B2D] border border-transparent',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <label className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10.5px] text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideDone}
                    onChange={(e) => setHideDone(e.target.checked)}
                    className="rounded border-slate-300 accent-[#0BB59B]"
                  />
                  <span>隱藏已搬/跳過</span>
                </label>
              </div>
            </div>
          </div>

          {/* Scrollable Page List */}
          <div className="rounded-lg border border-slate-200/90 divide-y divide-slate-100 max-h-[420px] overflow-y-auto xl:max-h-none xl:overflow-visible bg-white">
            {filteredPages.length === 0 ? (
              <div className="p-6 text-center text-[11.5px] text-slate-400">
                找不到符合條件的頁面
              </div>
            ) : (
              filteredPages.map((page) => {
                const isActive = activePageId === page.id;
                const isLoading = loadingPageId === page.id;
                const isSyncing = page.migrationStatus === 'syncing';
                const isMigrated = page.migrationStatus === 'migrated';
                const isParsed = page.migrationStatus === 'parsed';
                const isFailed = page.migrationStatus === 'failed';
                const isSkipped = page.migrationStatus === 'skipped';

                return (
                  <div
                    key={page.id}
                    onClick={() => onSelectPage(page)}
                    className={cn(
                      'px-3 py-2.5 flex items-start justify-between gap-2 cursor-pointer transition-colors group',
                      isActive
                        ? 'bg-teal-50/75 border-l-2 border-l-[#0BB59B]'
                        : isSyncing
                          ? 'bg-teal-50/45 border-l-2 border-l-[#0BB59B]/70'
                          : 'hover:bg-slate-50',
                      isSkipped && 'opacity-55',
                    )}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span
                        className="mt-0.5 shrink-0"
                        title={
                          isLoading
                            ? '載入頁面源碼中…'
                            : isSyncing
                              ? '正在轉換並寫入 Framer…'
                              : isMigrated
                                ? '已寫入 Framer'
                                : isParsed
                                  ? '已解析區塊，待寫入 Framer'
                                  : isFailed
                                    ? page.lastError
                                      ? `轉換失敗：${page.lastError}`
                                      : '上次解析或寫入失敗，可重新解析或同步'
                                    : isSkipped
                                      ? '已略過此頁'
                                      : backgroundConverting
                                        ? '排隊等待後台轉換'
                                        : '待解析'
                        }
                      >
                        {isLoading || isSyncing ? (
                          <Loader2 size={14} className="animate-spin text-[#0BB59B]" />
                        ) : isMigrated ? (
                          <CheckCircle2 size={14} className="text-[#0BB59B]" />
                        ) : isParsed ? (
                          <Sparkles size={14} className="text-sky-500" />
                        ) : isFailed ? (
                          <XCircle size={14} className="text-rose-500" />
                        ) : isSkipped ? (
                          <Ban size={14} className="text-slate-400" />
                        ) : backgroundConverting ? (
                          <Clock size={14} className="text-slate-400" />
                        ) : (
                          <Circle size={14} className="text-slate-300 group-hover:text-slate-400" />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[12px] font-semibold text-[#101B2D] truncate">
                            {page.title}
                          </span>
                          <span
                            className={cn(
                              'px-1.5 py-0.2 rounded text-[9.5px] font-medium shrink-0',
                              page.pageKind === 'home'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/70'
                                : page.pageKind === 'article'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                                  : page.pageKind === 'locale-mirror'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-teal-50 text-[#08967F]',
                            )}
                          >
                            {KIND_LABELS[page.pageKind] || page.pageKind}
                          </span>
                          {isSyncing && (
                            <span className="px-1.5 py-0.2 rounded bg-[#0BB59B]/15 text-[#08967F] text-[9.5px] font-semibold shrink-0">
                              轉換中
                            </span>
                          )}
                          {!isSyncing && isFailed && (
                            <span
                              className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200/70 text-[9.5px] font-semibold shrink-0"
                              title={
                                page.lastError
                                  ? `轉換失敗：${page.lastError}`
                                  : '上次解析或寫入失敗，可重新解析或同步'
                              }
                            >
                              失敗
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-400 truncate mt-0.5">
                          {page.path}
                        </div>
                        {isFailed && page.lastError && (
                          <div
                            className="text-[10.5px] leading-4 text-rose-600 line-clamp-2 mt-1 break-words"
                            title={page.lastError}
                          >
                            {page.lastError}
                          </div>
                        )}
                        {page.sectionHints && page.sectionHints.length > 0 && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                            <FileText size={9.5} className="shrink-0" />
                            <span className="truncate">
                              {page.sectionHints.length} 個區塊組件
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={backgroundConverting}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSkipPage(page.id);
                      }}
                      title={
                        backgroundConverting
                          ? '後台轉換進行中，暫時無法切換略過'
                          : isSkipped
                            ? '恢復此頁到遷移隊列'
                            : '標記略過此頁'
                      }
                      className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-[#101B2D] hover:bg-slate-200/60 transition-opacity shrink-0 disabled:pointer-events-none disabled:opacity-0"
                    >
                      {isSkipped ? (
                        <RotateCcw size={11} />
                      ) : (
                        '跳過'
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between text-[10.5px] text-slate-400">
            <span>顯示 {filteredPages.length} / {pages.length} 頁</span>
            <span>點擊任一頁面即可組裝並搬移</span>
          </div>
        </>
      )}
    </section>
  );
}
