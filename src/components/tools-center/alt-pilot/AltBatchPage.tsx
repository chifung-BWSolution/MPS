import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  History,
  Layers,
  Loader2,
  RefreshCw,
  ScanSearch,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { invokeAltFunction } from '@/lib/altApi.ts';
import { countChars, normalizeForCompare } from '@/lib/altText.ts';
import { hostOf } from '@/lib/altUrl.ts';
import type {
  AltAnalyzeResponse,
  AltDiscoverResult,
  AltSettingsRow,
  AltUsageSummary,
} from '@/lib/altTypes.ts';
import type { WebsiteProfileFull } from '@/types/app';
import { cn } from '@/lib/utils';

interface BatchPageResult {
  status: 'pending' | 'analyzing' | 'done' | 'error';
  runId?: string;
  title?: string;
  imageCount?: number;
  missing?: number;
  duplicates?: number;
  tooLong?: number;
  decorative?: number;
  error?: string;
}

export interface AltBatchPageProps {
  sites: WebsiteProfileFull[];
  sitesLoading: boolean;
  siteId: string;
  onSiteIdChange: (siteId: string) => void;
  usage: AltUsageSummary | null;
  settings: AltSettingsRow | null;
  onHistory: () => void;
  onOpenRun: (runId: string) => void;
  disabled: boolean;
}

export function AltBatchPage({
  sites,
  sitesLoading,
  siteId,
  onSiteIdChange,
  usage,
  settings,
  onHistory,
  onOpenRun,
  disabled,
}: AltBatchPageProps) {
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, BatchPageResult>>({});
  const [manualText, setManualText] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const selectedUrls = useMemo(
    () => candidates.filter((url) => selected.has(url)).slice(0, 10),
    [candidates, selected],
  );

  const doneResults = useMemo(
    () => Object.values(results).filter((result) => result.status === 'done'),
    [results],
  );

  const totals = useMemo(
    () =>
      doneResults.reduce(
        (sum, result) => ({
          images: sum.images + (result.imageCount || 0),
          missing: sum.missing + (result.missing || 0),
          duplicates: sum.duplicates + (result.duplicates || 0),
          tooLong: sum.tooLong + (result.tooLong || 0),
        }),
        { images: 0, missing: 0, duplicates: 0, tooLong: 0 },
      ),
    [doneResults],
  );

  const handleSiteChange = (nextSiteId: string) => {
    onSiteIdChange(nextSiteId);
    setCandidates([]);
    setSelected(new Set());
    setResults({});
    setSitemapUrl('');
    setError(null);
    setWarnings([]);
  };

  const setCandidateList = (urls: string[], selectFirst = true) => {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      unique.push(url);
      if (unique.length >= 100) break;
    }
    setCandidates(unique);
    setResults({});
    setSelected(selectFirst ? new Set(unique.slice(0, 10)) : new Set());
  };

  const handleDiscover = async () => {
    if (disabled) return;
    setDiscovering(true);
    setError(null);
    setWarnings([]);
    try {
      const data = await invokeAltFunction<AltDiscoverResult>('discover', {
        site_id: siteId || undefined,
        sitemap_url: sitemapUrl.trim() || undefined,
      });
      setSitemapUrl(data.sitemap_url);
      setCandidateList(data.pages.map((page) => page.url));
      setWarnings(data.warnings || []);
      toast.success(`找到 ${data.pages.length} 個頁面${data.truncated ? '（已截取前 100 個）' : ''}`);
    } catch (discoverError) {
      setError(discoverError instanceof Error ? discoverError.message : String(discoverError));
      toast.error('抓取 sitemap 失敗');
    } finally {
      setDiscovering(false);
    }
  };

  const handleLoadManual = () => {
    const urls = manualText
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast.info('請貼上至少一個 URL');
      return;
    }
    setCandidateList(urls);
    setWarnings([]);
    setError(null);
  };

  const handleToggle = (url: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(url)) {
        next.delete(url);
      } else {
        if (next.size >= 10) {
          toast.info('每批最多分析 10 頁');
          return previous;
        }
        next.add(url);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selected.size >= Math.min(10, candidates.length)) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.slice(0, 10)));
    }
  };

  const handleAnalyze = async () => {
    if (disabled) return;
    if (selectedUrls.length === 0) {
      toast.info('請先選擇要分析的頁面');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setProgress({ done: 0, total: selectedUrls.length });
    setResults((previous) => {
      const next = { ...previous };
      for (const url of selectedUrls) next[url] = { status: 'pending' };
      return next;
    });

    try {
      for (let index = 0; index < selectedUrls.length; index += 1) {
        const url = selectedUrls[index];
        setResults((previous) => ({ ...previous, [url]: { status: 'analyzing' } }));
        try {
          const data = await invokeAltFunction<AltAnalyzeResponse>('analyze', {
            site_id: siteId || undefined,
            url,
          });
          const images = data.images || [];
          const nonEmpty = images
            .map((image) => normalizeForCompare(image.currentAlt))
            .filter(Boolean);
          const counts = new Map<string, number>();
          for (const alt of nonEmpty) counts.set(alt, (counts.get(alt) || 0) + 1);
          const duplicates = Array.from(counts.values()).reduce(
            (sum, count) => sum + Math.max(0, count - 1),
            0,
          );
          setResults((previous) => ({
            ...previous,
            [url]: {
              status: 'done',
              runId: data.run.id,
              title: data.page.title || data.run.page_title,
              imageCount: images.length,
              missing: images.filter((image) => !image.decorative && !image.currentAlt.trim()).length,
              duplicates,
              tooLong: images.filter((image) => countChars(image.currentAlt) > 125).length,
              decorative: images.filter((image) => image.decorative).length,
            },
          }));
        } catch (analyzeError) {
          setResults((previous) => ({
            ...previous,
            [url]: {
              status: 'error',
              error: analyzeError instanceof Error ? analyzeError.message : String(analyzeError),
            },
          }));
        }
        setProgress({ done: index + 1, total: selectedUrls.length });
      }
      toast.success(`已完成 ${selectedUrls.length} 頁分析`);
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : String(analyzeError));
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="sticky top-[48px] z-30 -mx-6 mb-5 space-y-3 border-b border-[rgba(13,26,45,0.06)] bg-[#f5f8fc]/95 px-6 pb-3 pt-1 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0D9488]/10 text-[#0D9488]">
                <Layers size={16} />
              </span>
              <h1 className="text-[32px] font-bold leading-none tracking-tight">站點 ALT 盤點</h1>
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">
              一次分析多頁，先找出缺 ALT、重複與過長的圖片；這一步不呼叫 Grok。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-700">
              <Activity size={12} />
              今日已分析 {usage ? (usage.analyses ?? usage.today) : '—'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 bg-white"
              onClick={onHistory}
            >
              <History size={14} />
              歷史紀錄
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto_auto]">
          <Select
            value={siteId || undefined}
            onValueChange={handleSiteChange}
            disabled={disabled || sitesLoading || sites.length === 0}
          >
            <SelectTrigger className="h-9 bg-white" aria-label="選擇站點">
              <SelectValue placeholder={sitesLoading ? '載入站點…' : '選擇站點'} />
            </SelectTrigger>
            <SelectContent className="z-[120] max-h-[320px]">
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.websiteName}
                  {site.domainUrl ? ` · ${hostOf(site.domainUrl)}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={sitemapUrl}
            onChange={(event) => setSitemapUrl(event.target.value)}
            placeholder="sitemap URL（留空會用站點的 /sitemap.xml）"
            className="h-9 bg-white"
            disabled={disabled}
            aria-label="sitemap URL"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 bg-white"
            onClick={() => void handleDiscover()}
            disabled={disabled || discovering}
          >
            {discovering ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            取得頁面
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 bg-[#0D9488] px-4 text-white hover:bg-[#0b8076]"
            onClick={() => void handleAnalyze()}
            disabled={disabled || analyzing || selectedUrls.length === 0}
          >
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
            分析選取（{selectedUrls.length}）
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          每批最多 10 頁；analyze 只抓頁面與圖片清單，不呼叫 LLM。要生成 ALT 請開啟單頁結果。
        </p>
      </div>

      {settings && !settings.enabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          ALT Pilot 目前已停用；盤點與分析暫停，請先開啟 `alt_settings.enabled`。
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700">
          {error}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
          {warnings.map((warning, index) => (
            <p key={`${warning}-${index}`}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: '已分析頁面', value: doneResults.length, tone: 'text-[#0D9488]' },
          { label: '可處理圖片', value: totals.images, tone: 'text-[#0d1a2d]' },
          { label: '缺 ALT', value: totals.missing, tone: 'text-amber-700' },
          { label: '重複／過長', value: `${totals.duplicates}／${totals.tooLong}`, tone: 'text-rose-700' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card"
          >
            <p className="text-[11px] text-muted-foreground">{metric.label}</p>
            <p className={cn('mt-1 text-[22px] font-bold leading-none', metric.tone)}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0d1a2d]">頁面清單</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {candidates.length > 0
                ? `共 ${candidates.length} 頁；已選 ${selectedUrls.length} 頁（最多 10 頁）`
                : '先取得 sitemap，或手動貼上頁面 URL。'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-[12px]"
              onClick={handleToggleAll}
              disabled={candidates.length === 0 || analyzing}
            >
              {selected.size >= Math.min(10, candidates.length) ? '取消全選' : '全選前 10 頁'}
            </Button>
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="space-y-4 px-4 py-5">
            <details className="rounded-md border border-border bg-[#f8fafc] p-3">
              <summary className="cursor-pointer text-[12px] font-medium text-[#0d1a2d]">
                沒有 sitemap？手動貼上頁面 URL
              </summary>
              <Textarea
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                rows={4}
                placeholder="一行一個 URL，例如：&#10;https://example.com/page-a&#10;https://example.com/page-b"
                className="mt-3 bg-white text-[12px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 gap-1.5 bg-white"
                onClick={handleLoadManual}
                disabled={disabled}
              >
                <ArrowRight size={13} />
                載入 URL
              </Button>
            </details>
          </div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc]">
                  <TableHead className="w-10 pl-3" />
                  <TableHead>頁面</TableHead>
                  <TableHead className="w-[90px]">圖片</TableHead>
                  <TableHead className="w-[80px]">缺 ALT</TableHead>
                  <TableHead className="w-[80px]">重複</TableHead>
                  <TableHead className="w-[80px]">過長</TableHead>
                  <TableHead className="w-[90px]">裝飾圖</TableHead>
                  <TableHead className="w-[110px]">狀態</TableHead>
                  <TableHead className="w-[90px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((url) => {
                  const result = results[url];
                  return (
                    <TableRow key={url} className={selected.has(url) ? 'bg-[#f0fdfa]/50' : undefined}>
                      <TableCell className="pl-3">
                        <Checkbox
                          checked={selected.has(url)}
                          onCheckedChange={() => handleToggle(url)}
                          disabled={analyzing}
                          aria-label={`選擇 ${url}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <p className="truncate text-[12px] font-medium text-[#0d1a2d]">
                          {result?.title || url}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">{url}</p>
                      </TableCell>
                      <TableCell className="text-[12px]">{result?.imageCount ?? '—'}</TableCell>
                      <TableCell className="text-[12px] text-amber-700">{result?.missing ?? '—'}</TableCell>
                      <TableCell className="text-[12px] text-rose-700">{result?.duplicates ?? '—'}</TableCell>
                      <TableCell className="text-[12px] text-rose-700">{result?.tooLong ?? '—'}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {result?.decorative ?? '—'}
                      </TableCell>
                      <TableCell>
                        {!result ? (
                          <span className="text-[11px] text-muted-foreground">未分析</span>
                        ) : result.status === 'analyzing' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#0D9488]">
                            <Loader2 size={11} className="animate-spin" />
                            分析中
                          </span>
                        ) : result.status === 'done' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-teal-700">
                            <Check size={11} />
                            完成
                          </span>
                        ) : result.status === 'error' ? (
                          <span className="line-clamp-2 text-[10px] text-rose-600" title={result.error}>
                            {result.error || '失敗'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">等待中</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-3 text-right">
                        {result?.runId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[11px] text-[#0D9488]"
                            onClick={() => onOpenRun(result.runId!)}
                          >
                            開啟
                            <ArrowRight size={11} />
                          </Button>
                        ) : (
                          <Sparkles size={13} className="ml-auto text-muted-foreground/30" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {analyzing && progress ? (
        <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-card">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>正在分析頁面（不呼叫 Grok）</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <Progress value={(progress.done / Math.max(1, progress.total)) * 100} className="h-1.5" />
        </div>
      ) : null}
    </div>
  );
}
