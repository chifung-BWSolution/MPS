import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Database, FlaskConical, Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  approveAltSuggestions,
  altErrorMessage,
  fetchAltRunBundle,
  fetchAltSettings,
  fetchAltUsageToday,
  fetchSeoKeywordOptions,
  invokeAltFunction,
  isAltSchemaMissing,
  listAltRuns,
  markAltRunExported,
  rejectAltSuggestions,
  resetAltSuggestion,
  updateAltSuggestion,
  updateAltRunKeyword,
} from '@/lib/altApi.ts';
import {
  buildAltExportRows,
  copyTextToClipboard,
  downloadTextFile,
  exportFilename,
  toChecklist,
  toCsv,
  toJson,
  toTsv,
} from '@/lib/altCsv.ts';
import { truncateText } from '@/lib/altText.ts';
import { normalizePageUrl, sameHost } from '@/lib/altUrl.ts';
import type {
  AltAnalyzeResponse,
  AltGenerateResponse,
  AltImageCandidate,
  AltKeywordOption,
  AltPageContext,
  AltRegenerateResponse,
  AltRow,
  AltRunRow,
  AltSettingsRow,
  AltSuggestionRow,
  AltUsageSummary,
  AltVerifyResult,
} from '@/lib/altTypes.ts';
import { AltDetailDrawer } from './AltDetailDrawer';
import { AltEmptyState } from './AltEmptyState';
import { AltPilotDemoPage } from './AltPilotDemoPage';
import { AltExportBar } from './AltExportBar';
import { AltImageTable } from './AltImageTable';
import { AltPilotHeader } from './AltPilotHeader';
import {
  imageFromSuggestion,
  isPendingRow,
  pageFromRunRow,
  rowsFromSuggestions,
} from './AltPilotUtils';
import { AltRunHistory } from './AltRunHistory';
import { FramerPasteGuide } from './FramerPasteGuide';
import { PageSummaryCard } from './PageSummaryCard';

function readRunIdFromHash(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  const queryIndex = raw.indexOf('?');
  if (queryIndex < 0) return null;
  return new URLSearchParams(raw.slice(queryIndex + 1)).get('run');
}

function replaceRunHash(runId: string | null): void {
  const next = runId
    ? `#tools-center/alt-pilot?run=${encodeURIComponent(runId)}`
    : '#tools-center/alt-pilot';
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 leading-relaxed">{message}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2 text-[11px] text-rose-700 hover:bg-rose-100"
        onClick={onRetry}
      >
        重試
      </Button>
    </div>
  );
}

function SchemaMissingNotice({
  onRetry,
  retrying,
  onPreviewDemo,
}: {
  onRetry: () => void;
  retrying: boolean;
  onPreviewDemo: () => void;
}) {
  return (
    <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <Database size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-[#0d1a2d]">ALT Pilot 尚未啟用</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            資料表還未建立。請先執行本機 migration，再按「重新檢查」。
          </p>
          <code className="mt-2 inline-block rounded border border-border bg-[#f8fafc] px-2 py-1 text-[11px] text-[#0d1a2d]">
            supabase/migrations/20261125183000_alt_pilot.sql
          </code>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 bg-white"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? <Loader2 size={13} className="animate-spin" /> : null}
          重新檢查
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[#0D9488] hover:bg-[#f0fdfa]"
          onClick={onPreviewDemo}
        >
          <FlaskConical size={13} />
          預覽介面（示範資料）
        </Button>
      </div>
    </div>
  );
}

function AltPilotDisabledNotice({
  onHistory,
  onRetry,
  retrying,
}: {
  onHistory: () => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <Power size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-[#0d1a2d]">ALT Pilot 目前已停用</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            <code className="rounded bg-[#f5f8fc] px-1">alt_settings.enabled = false</code>
            。歷史與已批准資料仍在；管理員確認後可用 SQL 開啟。
          </p>
          <code className="mt-2 block rounded border border-border bg-[#f8fafc] px-3 py-2 text-[11px] text-[#0d1a2d]">
            update public.alt_settings set enabled = true where id = 'default';
          </code>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 bg-white"
          onClick={onHistory}
        >
          查看歷史
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[#0D9488] hover:bg-[#f0fdfa]"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? <Loader2 size={13} className="animate-spin" /> : null}
          重新檢查
        </Button>
      </div>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-6 py-16 text-[12px] text-muted-foreground shadow-card">
      <Loader2 size={16} className="animate-spin text-[#0D9488]" />
      {label}
    </div>
  );
}

function AltPilotRealPage({ onPreviewDemo }: { onPreviewDemo: () => void }) {
  const { profiles, loading: sitesLoading } = useWebsiteProfiles();
  const { user } = useApp();
  const reviewerId = user.id && user.id !== '0' ? user.id : null;

  const [settings, setSettings] = useState<AltSettingsRow | null>(null);
  const [usage, setUsage] = useState<AltUsageSummary | null>(null);
  const [runs, setRuns] = useState<AltRunRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);

  const [siteId, setSiteId] = useState('');
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState<AltKeywordOption[]>([]);
  const [keyword, setKeyword] = useState('');

  const [run, setRun] = useState<AltRunRow | null>(null);
  const [page, setPage] = useState<AltPageContext | null>(null);
  const [images, setImages] = useState<AltImageCandidate[]>([]);
  const [suggestions, setSuggestions] = useState<AltSuggestionRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<AltVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailUrl, setDetailUrl] = useState<string | null>(null);

  const runIdRef = useRef<string | null>(null);

  const sites = useMemo(() => {
    const websites = profiles.filter((profile) => profile.profileType === 'website');
    const source = websites.length > 0 ? websites : profiles;
    return [...source].sort((a, b) => a.level - b.level || a.websiteName.localeCompare(b.websiteName));
  }, [profiles]);

  const refreshRuns = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setRuns(await listAltRuns(30));
    } catch (refreshError) {
      if (isAltSchemaMissing(refreshError)) setSchemaMissing(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!settings) return;
    try {
      setUsage(await fetchAltUsageToday(settings.daily_call_limit));
    } catch (refreshError) {
      if (isAltSchemaMissing(refreshError)) setSchemaMissing(true);
    }
  }, [settings]);

  const refreshRun = useCallback(async (runId: string) => {
    try {
      const bundle = await fetchAltRunBundle(runId);
      setRun(bundle.run);
      setSuggestions(bundle.suggestions);
    } catch (refreshError) {
      if (isAltSchemaMissing(refreshError)) setSchemaMissing(true);
      else setError(altErrorMessage(refreshError));
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setSchemaMissing(false);
    setError(null);
    try {
      const nextSettings = await fetchAltSettings();
      const [nextUsage, nextRuns] = await Promise.all([
        fetchAltUsageToday(nextSettings.daily_call_limit),
        listAltRuns(30),
      ]);
      setSettings(nextSettings);
      setUsage(nextUsage);
      setRuns(nextRuns);
    } catch (bootstrapError) {
      if (isAltSchemaMissing(bootstrapError)) {
        setSchemaMissing(true);
      } else {
        setError(altErrorMessage(bootstrapError));
      }
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  const loadRun = useCallback(async (runId: string) => {
    setRunLoading(true);
    setError(null);
    try {
      const bundle = await fetchAltRunBundle(runId);
      setRun(bundle.run);
      runIdRef.current = bundle.run.id;
      setSiteId(bundle.run.site_id || '');
      setUrl(bundle.run.page_url);
      setKeyword(bundle.run.keyword || '');
      setPage(pageFromRunRow(bundle.run));
      setSuggestions(bundle.suggestions);
      setImages(bundle.suggestions.map(imageFromSuggestion));
      setSelected(new Set());
      setDrafts({});
      setVerifyResult(null);
      replaceRunHash(bundle.run.id);
    } catch (loadError) {
      if (isAltSchemaMissing(loadError)) setSchemaMissing(true);
      else setError(altErrorMessage(loadError));
    } finally {
      setRunLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
    const initial = readRunIdFromHash();
    if (initial) void loadRun(initial);

    const onHashChange = () => {
      const next = readRunIdFromHash();
      if (next && next !== runIdRef.current) void loadRun(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [loadBootstrap, loadRun]);

  useEffect(() => {
    if (siteId || sites.length === 0) return;
    const first = sites.find((site) => site.domainUrl) || sites[0];
    if (!first) return;
    setSiteId(first.id);
    if (!url.trim() && first.domainUrl) setUrl(first.domainUrl);
  }, [sites, siteId, url]);

  useEffect(() => {
    if (!siteId) {
      setKeywords([]);
      return;
    }
    let cancelled = false;
    void fetchSeoKeywordOptions(siteId)
      .then((options) => {
        if (cancelled) return;
        setKeywords(options);
        setKeyword((previous) => {
          if (previous) return previous;
          const preferred =
            options.find((option) => option.level === 'level_1') || options[0] || null;
          return preferred?.keyword || '';
        });
      })
      .catch(() => {
        if (!cancelled) setKeywords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const mergeSuggestions = useCallback((incoming: AltSuggestionRow[]) => {
    if (incoming.length === 0) return;
    setSuggestions((previous) => {
      const map = new Map(previous.map((suggestion) => [suggestion.image_url, suggestion]));
      for (const suggestion of incoming) map.set(suggestion.image_url, suggestion);
      return Array.from(map.values());
    });
  }, []);

  const suggestionByUrl = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.image_url, suggestion])),
    [suggestions],
  );

  const rows: AltRow[] = useMemo(
    () =>
      images.map((image) => ({
        image,
        suggestion: suggestionByUrl.get(image.url) || null,
      })),
    [images, suggestionByUrl],
  );

  const approvedCount = suggestions.filter((suggestion) => suggestion.status === 'approved').length;
  const pendingCount = suggestions.filter(
    (suggestion) => suggestion.status === 'pending' || suggestion.status === 'failed',
  ).length;

  const handleSiteChange = (nextSiteId: string) => {
    const previous = sites.find((site) => site.id === siteId);
    const next = sites.find((site) => site.id === nextSiteId);
    setSiteId(nextSiteId);
    setKeyword('');
    if (next?.domainUrl && (!url.trim() || (previous?.domainUrl && sameHost(url, previous.domainUrl)))) {
      setUrl(next.domainUrl);
    }
  };

  const analyzeUrl = useCallback(
    async (rawUrl: string, siteOverride?: string) => {
      setAnalyzing(true);
      setError(null);
      setVerifyResult(null);
      try {
        const effectiveSiteId = siteOverride ?? siteId;
        const site = sites.find((item) => item.id === effectiveSiteId);
        const normalized = normalizePageUrl(rawUrl, site?.domainUrl);
        setUrl(normalized);
        const data = await invokeAltFunction<AltAnalyzeResponse>('analyze', {
          site_id: effectiveSiteId || undefined,
          url: normalized,
          keyword: keyword || undefined,
        });
        setRun(data.run);
        runIdRef.current = data.run.id;
        replaceRunHash(data.run.id);
        setPage(data.page);
        setImages(data.images);
        setSuggestions([]);
        setDrafts({});
        setKeyword(data.run.keyword || keyword);
        setUsage(data.usage);
        setSelected(
          new Set(
            data.images
              .filter((image) => !image.decorative && !image.skipReason)
              .map((image) => image.url),
          ),
        );
        toast.success(`已抓到 ${data.images.length} 張可處理圖片`);
        void refreshRuns();
      } catch (analyzeError) {
        if (isAltSchemaMissing(analyzeError)) setSchemaMissing(true);
        else setError(altErrorMessage(analyzeError));
        toast.error(altErrorMessage(analyzeError));
      } finally {
        setAnalyzing(false);
      }
    },
    [sites, siteId, keyword, refreshRuns],
  );

  const handleAnalyze = () => {
    if (settings && !settings.enabled) {
      toast.info('ALT Pilot 目前已停用，請先由管理員開啟 alt_settings.enabled。');
      return;
    }
    if (!url.trim()) {
      toast.info('請先貼上頁面 URL');
      return;
    }
    void analyzeUrl(url);
  };

  const handleReanalyze = () => {
    if (!run) return;
    void analyzeUrl(run.page_url, run.site_id || siteId);
  };

  const generateImages = useCallback(
    async (targets: AltImageCandidate[]) => {
      if (!run) return;
      if (settings && !settings.enabled) {
        toast.info('ALT Pilot 目前已停用，無法生成 ALT。');
        return;
      }
      if (targets.length === 0) {
        toast.info('請先勾選尚未批准的圖片');
        return;
      }

      const chunkSize = Math.max(1, Math.min(settings?.max_images_per_call ?? 6, 6));
      setGenerating(true);
      setProgress({ done: 0, total: targets.length });
      setError(null);

      try {
        for (let index = 0; index < targets.length; index += chunkSize) {
          const chunk = targets.slice(index, index + chunkSize);
          const data = await invokeAltFunction<AltGenerateResponse>('generate', {
            run_id: run.id,
            images: chunk,
            keyword: keyword || undefined,
          });
          mergeSuggestions(data.suggestions);
          setUsage(data.usage);
          setProgress({
            done: Math.min(index + chunk.length, targets.length),
            total: targets.length,
          });
          if (data.errors.length > 0) {
            const quota = data.errors.some((item) => item.code === 'quota_exceeded');
            toast.warning(
              `${data.errors.length} 張未成功${quota ? '（今日配額用盡）' : ''}，詳情請看列表提示。`,
            );
            if (quota) break;
          }
        }

        await refreshRun(run.id);
        void refreshUsage();
        void refreshRuns();
        setSelected(new Set());
        setDrafts({});
        toast.success('ALT 生成完成');
      } catch (generateError) {
        if (isAltSchemaMissing(generateError)) setSchemaMissing(true);
        setError(altErrorMessage(generateError));
        toast.error(altErrorMessage(generateError));
        await refreshRun(run.id);
      } finally {
        setGenerating(false);
        setProgress(null);
      }
    },
    [run, settings, keyword, mergeSuggestions, refreshRun, refreshUsage, refreshRuns],
  );

  const handleGenerateOne = (image: AltImageCandidate) => {
    void generateImages([image]);
  };

  const handleDraftChange = (id: string, value: string) => {
    setDrafts((previous) => ({ ...previous, [id]: value }));
  };

  const saveInlineAlt = async (id: string, value: string): Promise<AltSuggestionRow | null> => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion) return null;
    const clean = value.trim();
    if (clean === (suggestion.suggested_alt || '').trim()) {
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      return suggestion;
    }

    const patch: Parameters<typeof updateAltSuggestion>[1] = {
      suggested_alt: clean,
      short_alt: truncateText(clean, 60),
    };
    if (suggestion.status === 'approved') patch.final_alt = clean;

    const saved = await updateAltSuggestion(id, patch);
    mergeSuggestions([saved]);
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    return saved;
  };

  const handleSaveAlt = (id: string, value: string) => {
    void saveInlineAlt(id, value).catch((saveError) => {
      toast.error(altErrorMessage(saveError));
    });
  };

  const handleApprove = async (id: string, alt: string) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion) return;
    setBusyKey(id);
    try {
      const saved = await saveInlineAlt(id, alt);
      if (!saved) return;
      const updated = await approveAltSuggestions([id], reviewerId);
      mergeSuggestions(updated);
      await refreshRun(suggestion.run_id);
      toast.success('已批准');
    } catch (approveError) {
      toast.error(altErrorMessage(approveError));
    } finally {
      setBusyKey(null);
    }
  };

  const handleReject = async (id: string) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion) return;
    setBusyKey(id);
    try {
      const updated = await rejectAltSuggestions([id], reviewerId);
      mergeSuggestions(updated);
      await refreshRun(suggestion.run_id);
      toast.success('已略過');
    } catch (rejectError) {
      toast.error(altErrorMessage(rejectError));
    } finally {
      setBusyKey(null);
    }
  };

  const handleUnapprove = async (id: string) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion) return;
    setBusyKey(id);
    try {
      const updated = await resetAltSuggestion(id);
      mergeSuggestions([updated]);
      await refreshRun(suggestion.run_id);
      toast.success('已解除批准');
    } catch (unapproveError) {
      toast.error(altErrorMessage(unapproveError));
    } finally {
      setBusyKey(null);
    }
  };

  const handleRegenerate = async (id: string) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion) return;
    setBusyKey(id);
    try {
      const data = await invokeAltFunction<AltRegenerateResponse>('regenerate', {
        suggestion_id: id,
        keyword: keyword || undefined,
      });
      mergeSuggestions([data.suggestion]);
      setUsage(data.usage);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      await refreshRun(suggestion.run_id);
      toast.success('已重新生成');
    } catch (regenerateError) {
      setError(altErrorMessage(regenerateError));
      toast.error(altErrorMessage(regenerateError));
      await refreshRun(suggestion.run_id);
    } finally {
      setBusyKey(null);
    }
  };

  const handleApproveSelected = async () => {
    const targets = rows.filter(
      (row) => selected.has(row.image.url) && row.suggestion && isPendingRow(row),
    );
    if (targets.length === 0) {
      toast.info('請選擇待批准或待生成的圖片');
      return;
    }

    setBusyKey('bulk');
    try {
      for (const row of targets) {
        const suggestion = row.suggestion!;
        const draft = drafts[suggestion.id];
        if (draft != null && draft.trim() !== (suggestion.suggested_alt || '').trim()) {
          await saveInlineAlt(suggestion.id, draft);
        }
      }
      const ids = targets.map((row) => row.suggestion!.id);
      const updated = await approveAltSuggestions(ids, reviewerId);
      mergeSuggestions(updated);
      await refreshRun(targets[0].suggestion!.run_id);
      setSelected(new Set());
      toast.success(`已批准 ${updated.length} 張`);
    } catch (approveError) {
      toast.error(altErrorMessage(approveError));
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectSelected = async () => {
    const targets = rows.filter(
      (row) =>
        selected.has(row.image.url) &&
        row.suggestion &&
        row.suggestion.status !== 'approved',
    );
    if (targets.length === 0) {
      toast.info('請先選擇圖片');
      return;
    }
    setBusyKey('bulk');
    try {
      const ids = targets.map((row) => row.suggestion!.id);
      const updated = await rejectAltSuggestions(ids, reviewerId);
      mergeSuggestions(updated);
      await refreshRun(targets[0].suggestion!.run_id);
      setSelected(new Set());
      toast.success(`已略過 ${updated.length} 張`);
    } catch (rejectError) {
      toast.error(altErrorMessage(rejectError));
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggle = (imageUrl: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(imageUrl)) next.delete(imageUrl);
      else next.add(imageUrl);
      return next;
    });
  };

  const handleToggleAll = () => {
    const selectable = rows.filter(
      (row) =>
        !row.image.skipReason &&
        row.suggestion?.status !== 'approved' &&
        row.suggestion?.status !== 'rejected',
    );
    if (selectable.length === 0) return;
    const allSelected = selectable.every((row) => selected.has(row.image.url));
    setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.image.url)));
  };

  const handleCopy = async (text: string) => {
    if (!text.trim()) {
      toast.info('沒有可複製的 ALT');
      return;
    }
    const copied = await copyTextToClipboard(text);
    if (copied) toast.success('已複製');
    else toast.error('複製失敗，請手動選取');
  };

  const handleCopyApproved = async () => {
    if (!run) return;
    const approved = suggestions.filter((suggestion) => suggestion.status === 'approved');
    if (approved.length === 0) {
      toast.info('先批准至少一張 ALT');
      return;
    }
    const exportRows = buildAltExportRows(run, approved);
    const copied = await copyTextToClipboard(toTsv(exportRows));
    if (copied) toast.success(`已複製 ${exportRows.length} 張（檔名 + ALT）`);
    else toast.error('複製失敗');
  };

  const markExported = async (approved: AltSuggestionRow[]) => {
    if (!run || approved.length === 0) return;
    try {
      await markAltRunExported(run.id, approved.length);
      await refreshRun(run.id);
      void refreshRuns();
    } catch (exportError) {
      toast.error(altErrorMessage(exportError));
    }
  };

  const handleExport = async (format: 'csv' | 'json' | 'checklist') => {
    if (!run) return;
    const approved = suggestions.filter((suggestion) => suggestion.status === 'approved');
    if (approved.length === 0) {
      toast.info('先批准至少一張 ALT 再匯出');
      return;
    }

    const exportRows = buildAltExportRows(run, approved);
    if (format === 'csv') {
      downloadTextFile(exportFilename(run, 'csv'), toCsv(exportRows), 'text/csv;charset=utf-8');
    } else if (format === 'json') {
      downloadTextFile(
        exportFilename(run, 'json'),
        toJson(run, exportRows),
        'application/json;charset=utf-8',
      );
    } else {
      downloadTextFile(
        exportFilename(run, 'txt'),
        toChecklist(exportRows),
        'text/plain;charset=utf-8',
      );
    }

    await markExported(approved);
    toast.success(`已匯出 ${exportRows.length} 張 ALT`);
  };

  const handleMarkExported = async () => {
    const approved = suggestions.filter((suggestion) => suggestion.status === 'approved');
    if (approved.length === 0) {
      toast.info('沒有已批准的 ALT');
      return;
    }
    await markExported(approved);
    toast.success('已標記為已匯出');
  };

  const handleVerify = async () => {
    if (!run) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await invokeAltFunction<AltVerifyResult>('verify', { run_id: run.id });
      setVerifyResult(result);
      if (result.checked === 0) toast.info('沒有已批准的 ALT 可驗證');
      else if (result.missing.length === 0) toast.success(`已寫回 ${result.matched}/${result.checked} 張`);
      else toast.warning(`已寫回 ${result.matched}/${result.checked} 張，仍有 ${result.missing.length} 張是舊值`);
    } catch (verifyError) {
      toast.error(altErrorMessage(verifyError));
    } finally {
      setVerifying(false);
    }
  };

  const handleKeywordChange = (nextKeyword: string) => {
    setKeyword(nextKeyword);
    if (run) {
      void updateAltRunKeyword(run.id, nextKeyword).catch(() => {
        // 關鍵字只是提示，不阻塞流程
      });
    }
  };

  const handleHistorySelect = (runId: string) => {
    setHistoryOpen(false);
    replaceRunHash(runId);
    void loadRun(runId);
  };

  const detailRow = detailUrl ? rows.find((row) => row.image.url === detailUrl) || null : null;
  const detailBusy = Boolean(
    generating ||
      busyKey === 'bulk' ||
      (detailRow?.suggestion && busyKey === detailRow.suggestion.id) ||
      (detailRow && busyKey === detailRow.image.url),
  );

  const busyForRow = (row: AltRow): string | null => {
    const suggestion = row.suggestion;
    if (suggestion && busyKey === suggestion.id) return busyKey;
    if (busyKey === row.image.url) return busyKey;
    return null;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 pb-10">
        <AltPilotHeader
          sites={sites}
          sitesLoading={sitesLoading}
          siteId={siteId}
          onSiteIdChange={handleSiteChange}
          url={url}
          onUrlChange={setUrl}
          onAnalyze={handleAnalyze}
          analyzing={analyzing}
          usage={usage}
          settings={settings}
          onHistory={() => {
            setHistoryOpen(true);
            void refreshRuns();
          }}
          disabled={Boolean(settings && !settings.enabled)}
        />

        {error ? (
          <ErrorBanner
            message={error}
            onRetry={() => {
              setError(null);
              if (run) void refreshRun(run.id);
              else void loadBootstrap();
            }}
          />
        ) : null}

        {settings && !settings.enabled ? (
          <AltPilotDisabledNotice
            onHistory={() => {
              setHistoryOpen(true);
              void refreshRuns();
            }}
            onRetry={() => void loadBootstrap()}
            retrying={bootstrapLoading}
          />
        ) : schemaMissing ? (
          <SchemaMissingNotice
            onRetry={() => void loadBootstrap()}
            retrying={bootstrapLoading}
            onPreviewDemo={onPreviewDemo}
          />
        ) : (
          <>
            {bootstrapLoading ? <LoadingCard label="正在載入 ALT Pilot…" /> : null}
            {!bootstrapLoading && runLoading ? <LoadingCard label="正在載入分析紀錄…" /> : null}
            {!bootstrapLoading && !runLoading && analyzing && !run ? (
              <LoadingCard label="正在抓取頁面與圖片…" />
            ) : null}
            {!bootstrapLoading && !runLoading && !run && !analyzing ? <AltEmptyState /> : null}

            {run && page ? (
              <>
                <PageSummaryCard
                  page={page}
                  run={run}
                  keywords={keywords}
                  keyword={keyword}
                  onKeywordChange={handleKeywordChange}
                  onReanalyze={handleReanalyze}
                  reanalyzing={analyzing}
                  onVerify={() => void handleVerify()}
                  verifying={verifying}
                  verifyResult={verifyResult}
                />

                <AltImageTable
                  rows={rows}
                  selected={selected}
                  onToggle={handleToggle}
                  onToggleAll={handleToggleAll}
                  onOpenDetail={setDetailUrl}
                  onCopy={(text) => void handleCopy(text)}
                  onApprove={(id, alt) => void handleApprove(id, alt)}
                  onReject={(id) => void handleReject(id)}
                  onUnapprove={(id) => void handleUnapprove(id)}
                  onRegenerate={(id) => void handleRegenerate(id)}
                  onGenerateOne={handleGenerateOne}
                  onSaveAlt={handleSaveAlt}
                  onDraftChange={handleDraftChange}
                  onGenerateSelected={() => {
                    const targets = rows
                      .filter(
                        (row) =>
                          selected.has(row.image.url) &&
                          (!row.suggestion ||
                            row.suggestion.status === 'pending' ||
                            row.suggestion.status === 'failed'),
                      )
                      .map((row) => row.image);
                    void generateImages(targets);
                  }}
                  onApproveSelected={() => void handleApproveSelected()}
                  onRejectSelected={() => void handleRejectSelected()}
                  generating={generating}
                  progress={progress}
                  bulkBusy={busyKey === 'bulk'}
                  busyForRow={busyForRow}
                />

                <AltExportBar
                  approvedCount={approvedCount}
                  pendingCount={pendingCount}
                  onExportCsv={() => void handleExport('csv')}
                  onExportJson={() => void handleExport('json')}
                  onCopyApproved={() => void handleCopyApproved()}
                  onMarkExported={() => void handleMarkExported()}
                  canMarkExported={Boolean(run && run.status !== 'exported')}
                />

                <FramerPasteGuide />
              </>
            ) : null}
          </>
        )}

        <AltRunHistory
          runs={runs}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onSelect={handleHistorySelect}
          loading={historyLoading}
        />

        <AltDetailDrawer
          row={detailRow}
          open={Boolean(detailRow)}
          onOpenChange={(open) => {
            if (!open) setDetailUrl(null);
          }}
          onCopy={(text) => void handleCopy(text)}
          onApprove={(id, alt) => void handleApprove(id, alt)}
          onReject={(id) => void handleReject(id)}
          onUnapprove={(id) => void handleUnapprove(id)}
          onRegenerate={(id) => void handleRegenerate(id)}
          onGenerateOne={handleGenerateOne}
          onSaveAlt={handleSaveAlt}
          busy={detailBusy}
        />
      </div>
    </TooltipProvider>
  );
}

function isDemoHash(): boolean {
  const raw = window.location.hash.replace(/^#/, '');
  const queryIndex = raw.indexOf('?');
  if (queryIndex < 0) return false;
  return new URLSearchParams(raw.slice(queryIndex + 1)).get('demo') === '1';
}

/**
 * 外殼只負責切換「真實模式 / 示範預覽」。
 * 真實模式的所有 hooks 都在 AltPilotRealPage 內，避免條件式 hook。
 */
export function AltPilotPage() {
  const [demoPreview, setDemoPreview] = useState(isDemoHash);

  const exitDemo = () => {
    setDemoPreview(false);
    if (isDemoHash()) {
      window.history.replaceState(null, '', '#tools-center/alt-pilot');
    }
  };

  if (demoPreview) {
    return <AltPilotDemoPage onExit={exitDemo} />;
  }

  return <AltPilotRealPage onPreviewDemo={() => setDemoPreview(true)} />;
}
