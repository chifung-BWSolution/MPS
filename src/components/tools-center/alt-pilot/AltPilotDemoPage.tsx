import { useMemo, useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  buildAltExportRows,
  copyTextToClipboard,
  downloadTextFile,
  exportFilename,
  toCsv,
  toJson,
  toTsv,
} from '@/lib/altCsv.ts';
import { truncateText } from '@/lib/altText.ts';
import type {
  AltImageCandidate,
  AltRow,
  AltSuggestionRow,
  AltVerifyResult,
} from '@/lib/altTypes.ts';
import { AltDetailDrawer } from './AltDetailDrawer';
import { isExportableSuggestion } from './AltPilotUtils';
import { AltExportBar } from './AltExportBar';
import { AltImageTable } from './AltImageTable';
import { AltPilotHeader } from './AltPilotHeader';
import { AltRunHistory } from './AltRunHistory';
import { FramerPasteGuide } from './FramerPasteGuide';
import { PageSummaryCard } from './PageSummaryCard';
import {
  DEMO_HISTORY,
  DEMO_IMAGES,
  DEMO_KEYWORDS,
  DEMO_PAGE,
  DEMO_RUN,
  DEMO_SETTINGS,
  DEMO_SITES,
  DEMO_SUGGESTIONS,
  DEMO_USAGE,
  demoAltPool,
  makeDemoSuggestion,
} from './altDemoData';

export interface AltPilotDemoPageProps {
  onExit: () => void;
}

export function AltPilotDemoPage({ onExit }: AltPilotDemoPageProps) {
  const [siteId, setSiteId] = useState(DEMO_SITES[0]?.id || 'demo-bw');
  const [url, setUrl] = useState(DEMO_PAGE.url);
  const [keyword, setKeyword] = useState('辦公室設計');
  const [run] = useState(DEMO_RUN);
  const [suggestions, setSuggestions] = useState<AltSuggestionRow[]>(DEMO_SUGGESTIONS);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(
    new Set(DEMO_IMAGES.filter((image) => !image.decorative).map((image) => image.url)),
  );
  const [usage, setUsage] = useState(DEMO_USAGE);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailUrl, setDetailUrl] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState<AltVerifyResult | null>(null);

  const suggestionByUrl = useMemo(
    () => new Map(suggestions.map((suggestion) => [suggestion.image_url, suggestion])),
    [suggestions],
  );
  const rows: AltRow[] = useMemo(
    () =>
      DEMO_IMAGES.map((image) => ({
        image,
        suggestion: suggestionByUrl.get(image.url) || null,
      })),
    [suggestionByUrl],
  );

  const exportableCount = suggestions.filter(isExportableSuggestion).length;
  const failedCount = suggestions.filter((suggestion) => suggestion.status === 'failed').length;
  const detailRow = detailUrl ? rows.find((row) => row.image.url === detailUrl) || null : null;

  const applySuggestion = (next: AltSuggestionRow) => {
    setSuggestions((previous) =>
      previous.some((item) => item.image_url === next.image_url)
        ? previous.map((item) => (item.image_url === next.image_url ? next : item))
        : [...previous, next],
    );
  };

  const generateImages = async (targets: AltImageCandidate[]) => {
    if (targets.length === 0) {
      toast.info('請先勾選尚未生成的圖片');
      return;
    }
    setGenerating(true);
    setProgress({ done: 0, total: targets.length });

    for (let index = 0; index < targets.length; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const image = targets[index];
      const existing = suggestions.find((item) => item.image_url === image.url);
      const pool = demoAltPool(image);
      const currentIndex = existing ? pool.indexOf(existing.suggested_alt) : -1;
      const alt = pool[(currentIndex + 1) % Math.max(1, pool.length)] || '';
      applySuggestion(makeDemoSuggestion(image, alt, Date.now() + index, keyword));
      setProgress({ done: index + 1, total: targets.length });
    }

    setGenerating(false);
    setProgress(null);
    setUsage((previous) => ({ ...previous, today: previous.today + targets.length }));
    setSelected(new Set());
    setDrafts({});
    setVerifyResult(null);
    toast.success('示範生成完成（沒有呼叫 LLM）');
  };

  const handleGenerateSelected = () => {
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
  };

  const handleApprove = (id: string, alt: string) => {
    const now = new Date().toISOString();
    setSuggestions((previous) =>
      previous.map((suggestion) =>
        suggestion.id === id
          ? {
              ...suggestion,
              status: 'approved',
              suggested_alt: alt,
              final_alt: alt,
              short_alt: truncateText(alt, 60),
              reviewed_by: null,
              reviewed_at: now,
              updated_at: now,
            }
          : suggestion,
      ),
    );
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    toast.success('已批准（示範，不會寫入資料庫）');
  };

  const handleReject = (id: string) => {
    const now = new Date().toISOString();
    setSuggestions((previous) =>
      previous.map((suggestion) =>
        suggestion.id === id
          ? {
              ...suggestion,
              status: 'rejected',
              final_alt: null,
              reviewed_at: now,
              updated_at: now,
            }
          : suggestion,
      ),
    );
  };

  const handleUnapprove = (id: string) => {
    setSuggestions((previous) =>
      previous.map((suggestion) =>
        suggestion.id === id
          ? {
              ...suggestion,
              status: 'pending',
              final_alt: null,
              reviewed_at: null,
              updated_at: new Date().toISOString(),
            }
          : suggestion,
      ),
    );
  };

  const handleSaveAlt = (id: string, alt: string) => {
    setSuggestions((previous) =>
      previous.map((suggestion) =>
        suggestion.id === id
          ? {
              ...suggestion,
              suggested_alt: alt,
              short_alt: truncateText(alt, 60),
              final_alt: suggestion.status === 'approved' ? alt : suggestion.final_alt,
              updated_at: new Date().toISOString(),
            }
          : suggestion,
      ),
    );
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  };

  const handleDraftChange = (id: string, alt: string) => {
    setDrafts((previous) => ({ ...previous, [id]: alt }));
  };

  const handleRegenerate = (id: string) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion) return;
    const image = DEMO_IMAGES.find((item) => item.url === suggestion.image_url);
    if (!image) return;
    const pool = demoAltPool(image);
    const currentIndex = pool.indexOf(suggestion.suggested_alt);
    const nextAlt = pool[(currentIndex + 1) % Math.max(1, pool.length)] || '';
    setBusyKey(id);
    applySuggestion({
      ...makeDemoSuggestion(image, nextAlt, Date.now(), keyword),
      id,
    });
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setBusyKey(null);
    toast.success('已重新生成（示範）');
  };

  const handleApproveSelected = () => {
    const now = new Date().toISOString();
    const ids = new Set(
      rows
        .filter(
          (row) =>
            selected.has(row.image.url) &&
            row.suggestion &&
            (row.suggestion.status === 'pending' || row.suggestion.status === 'failed'),
        )
        .map((row) => row.suggestion!.id),
    );
    if (ids.size === 0) {
      toast.info('請選擇待批准的圖片');
      return;
    }
    setSuggestions((previous) =>
      previous.map((suggestion) => {
        if (!ids.has(suggestion.id)) return suggestion;
        const draft = drafts[suggestion.id];
        const alt = draft == null ? suggestion.suggested_alt : draft.trim();
        return {
          ...suggestion,
          suggested_alt: alt,
          short_alt: truncateText(alt, 60),
          status: 'approved',
          final_alt: alt,
          reviewed_at: now,
          updated_at: now,
        };
      }),
    );
    setSelected(new Set());
    setDrafts({});
    toast.success(`已批准 ${ids.size} 張（示範）`);
  };

  const handleRejectSelected = () => {
    const now = new Date().toISOString();
    const ids = new Set(
      rows
        .filter(
          (row) =>
            selected.has(row.image.url) &&
            row.suggestion &&
            row.suggestion.status !== 'approved',
        )
        .map((row) => row.suggestion!.id),
    );
    if (ids.size === 0) {
      toast.info('請先選擇圖片');
      return;
    }
    setSuggestions((previous) =>
      previous.map((suggestion) =>
        ids.has(suggestion.id)
          ? {
              ...suggestion,
              status: 'rejected',
              final_alt: null,
              reviewed_at: now,
              updated_at: now,
            }
          : suggestion,
      ),
    );
    setSelected(new Set());
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
    else toast.error('複製失敗');
  };

  const handleCopyApproved = async () => {
    const exportable = suggestions.filter(isExportableSuggestion);
    if (exportable.length === 0) {
      toast.info('先選擇或生成至少一張 ALT');
      return;
    }
    const copied = await copyTextToClipboard(toTsv(buildAltExportRows(run, exportable)));
    if (copied) toast.success(`已複製 ${exportable.length} 張（示範）`);
    else toast.error('複製失敗');
  };

  const handleExport = (format: 'csv' | 'json') => {
    const exportable = suggestions.filter(isExportableSuggestion);
    if (exportable.length === 0) {
      toast.info('先選擇或生成至少一張 ALT 再匯出');
      return;
    }
    const exportRows = buildAltExportRows(run, exportable);
    if (format === 'csv') {
      downloadTextFile(exportFilename(run, 'csv'), toCsv(exportRows), 'text/csv;charset=utf-8');
    } else {
      downloadTextFile(
        exportFilename(run, 'json'),
        toJson(run, exportRows),
        'application/json;charset=utf-8',
      );
    }
    toast.success(`已匯出 ${exportRows.length} 張（示範，不會寫入資料庫）`);
  };

  const handleVerify = () => {
    const exportable = suggestions.filter(isExportableSuggestion);
    setVerifyResult({
      checked: exportable.length,
      matched: 0,
      missing: exportable.map((suggestion) => ({
        image_url: suggestion.image_url,
        expected: suggestion.final_alt || suggestion.suggested_alt,
        actual: '（示範模式未抓取真實頁面）',
      })),
    });
    toast.info('示範模式不會抓取真實頁面；請在真實模式按「驗證已填」。');
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <FlaskConical size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <p className="text-[13px] font-semibold text-amber-900">本地預覽模式</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
                畫面上的頁面、圖片與 ALT 都是示範資料；不會寫入 Supabase，也不會呼叫 LLM。批准、編輯、匯出都可以試。
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-amber-300 bg-white text-[12px] text-amber-900 hover:bg-amber-100"
            onClick={onExit}
          >
            <RotateCcw size={13} />
            返回真實模式
          </Button>
        </div>

        <AltPilotHeader
          sites={DEMO_SITES}
          sitesLoading={false}
          siteId={siteId}
          onSiteIdChange={setSiteId}
          url={url}
          onUrlChange={setUrl}
          onAnalyze={() => toast.info('示範模式不會抓取真實頁面；請在真實模式分析。')}
          analyzing={false}
          usage={usage}
          settings={DEMO_SETTINGS}
          onHistory={() => setHistoryOpen(true)}
        />

        <PageSummaryCard
          page={DEMO_PAGE}
          run={run}
          keywords={DEMO_KEYWORDS}
          keyword={keyword}
          onKeywordChange={setKeyword}
          onReanalyze={() => toast.info('示範模式不會重新抓取頁面。')}
          reanalyzing={false}
          onVerify={handleVerify}
          verifying={false}
          verifyResult={verifyResult}
        />

        <AltImageTable
          rows={rows}
          selected={selected}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onOpenDetail={setDetailUrl}
          onCopy={(text) => void handleCopy(text)}
          onApprove={handleApprove}
          onReject={handleReject}
          onUnapprove={handleUnapprove}
          onRegenerate={handleRegenerate}
          onGenerateOne={(image) => void generateImages([image])}
          onSaveAlt={handleSaveAlt}
          onDraftChange={handleDraftChange}
          onGenerateSelected={handleGenerateSelected}
          onApproveSelected={handleApproveSelected}
          onRejectSelected={handleRejectSelected}
          generating={generating}
          progress={progress}
          bulkBusy={busyKey === 'bulk'}
          busyForRow={() => null}
        />

        <AltExportBar
          generatedCount={exportableCount}
          failedCount={failedCount}
          onExportCsv={() => handleExport('csv')}
          onExportJson={() => handleExport('json')}
          onCopyAll={() => void handleCopyApproved()}
          onMarkExported={() => toast.info('示範模式不會寫入資料庫。')}
          canMarkExported={false}
        />

        <FramerPasteGuide />

        <AltRunHistory
          runs={DEMO_HISTORY}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onSelect={() => {
            setHistoryOpen(false);
            toast.info('示範模式只展示目前這筆 run。');
          }}
          loading={false}
        />

        <AltDetailDrawer
          row={detailRow}
          open={Boolean(detailRow)}
          onOpenChange={(open) => {
            if (!open) setDetailUrl(null);
          }}
          onCopy={(text) => void handleCopy(text)}
          onApprove={handleApprove}
          onReject={handleReject}
          onUnapprove={handleUnapprove}
          onRegenerate={handleRegenerate}
          onGenerateOne={(image) => void generateImages([image])}
          onSaveAlt={handleSaveAlt}
          busy={busyKey === detailRow?.suggestion?.id}
        />
      </div>
    </TooltipProvider>
  );
}
