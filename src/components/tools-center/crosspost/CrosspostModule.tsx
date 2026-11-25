import { useCallback, useRef, useState } from 'react';
import { History as HistoryIcon, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useCrosspostSets } from '@/hooks/useCrosspostSets';
import { normalizeBrief, validateBrief, type CopyBrief } from '@/lib/crosspost';
import { generateCrosspost, saveCrosspostSet, type SavedCopySet } from '@/lib/crosspostApi';
import { cn } from '@/lib/utils';
import { CrosspostComposer } from './CrosspostComposer';
import { CrosspostHistoryView } from './CrosspostHistoryView';
import { CrosspostResultView } from './CrosspostResultView';
import type { CrosspostGenerationState } from './types';

const EMPTY_BRIEF: CopyBrief = {
  coreInfo: '',
  audience: '',
  cta: '',
  brandId: null,
  brandName: undefined,
  tone: '專業可信',
  language: 'zh-HK',
  extraNotes: '',
};

type Mode = 'compose' | 'history';

function makeToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function GeneratingPanel() {
  return (
    <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-6 shadow-card">
      <div className="space-y-3">
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <p className="mt-4 text-[12px] text-muted-foreground">
        正在按平台改寫，通常 20–40 秒；較慢時會自動改用後備模型。
      </p>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="rounded-md border border-dashed border-border bg-white p-10 text-center">
      <Sparkles size={28} className="mx-auto text-teal-600" />
      <p className="mt-3 text-[14px] font-medium text-[#0d1a2d]">
        填好左邊三個必填欄位，按「生成五版文案」
      </p>
      <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
        IG、FB、Threads、小紅書、eDM 會一次出稿；每個版本自動標示字數上限與 Hashtag 建議。
      </p>
    </div>
  );
}

export function CrosspostModule() {
  const { user } = useApp();
  const {
    sets,
    loading,
    error: historyError,
    available,
    refresh: refreshHistory,
    remove: removeSet,
  } = useCrosspostSets();

  const [mode, setMode] = useState<Mode>('compose');
  const [brief, setBrief] = useState<CopyBrief>(EMPTY_BRIEF);
  const [generatedBrief, setGeneratedBrief] = useState<CopyBrief | null>(null);
  const [result, setResult] = useState<CrosspostGenerationState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const generatingRef = useRef(false);
  const savingTokenRef = useRef<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (generatingRef.current) return;

    const validationError = validateBrief(brief);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const snapshot = normalizeBrief(brief);
    const token = makeToken();
    generatingRef.current = true;
    setFormError(null);
    setGenerating(true);

    try {
      const generation = await generateCrosspost(snapshot);
      const next: CrosspostGenerationState = {
        token,
        variants: generation.variants,
        provider: generation.provider,
        model: generation.model,
        latencyMs: generation.latencyMs,
        missingPlatforms: generation.missingPlatforms,
        savedId: null,
        savedAt: null,
        saveError: null,
      };

      setGeneratedBrief(snapshot);
      setResult(next);
      setMode('compose');

      setSaving(true);
      savingTokenRef.current = token;
      try {
        const saved = await saveCrosspostSet({
          brief: snapshot,
          variants: generation.variants,
          provider: generation.provider,
          model: generation.model,
          createdBy: user.id,
          createdByName: user.name,
        });
        setResult((prev) =>
          prev && prev.token === token
            ? { ...prev, savedId: saved.id, savedAt: saved.createdAt, saveError: null }
            : prev,
        );
        void refreshHistory({ silent: true });
        toast.success('五版文案已生成並存入歷史');
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : '未能存入歷史';
        setResult((prev) =>
          prev && prev.token === token ? { ...prev, saveError: message } : prev,
        );
        toast.error('文案已生成，但未能存入歷史，可按「重試儲存」');
      } finally {
        if (savingTokenRef.current === token) {
          savingTokenRef.current = null;
          setSaving(false);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失敗';
      setFormError(message);
      toast.error(message);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [brief, refreshHistory, user.id, user.name]);

  const handleRetrySave = useCallback(async () => {
    if (!result || !generatedBrief || savingTokenRef.current || generatingRef.current) return;
    const token = result.token;
    savingTokenRef.current = token;
    setSaving(true);
    try {
      const saved = await saveCrosspostSet({
        brief: generatedBrief,
        variants: result.variants,
        provider: result.provider,
        model: result.model,
        createdBy: user.id,
        createdByName: user.name,
      });
      setResult((prev) =>
        prev && prev.token === token
          ? { ...prev, savedId: saved.id, savedAt: saved.createdAt, saveError: null }
          : prev,
      );
      void refreshHistory({ silent: true });
      toast.success('已存入歷史');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未能存入歷史';
      setResult((prev) =>
        prev && prev.token === token ? { ...prev, saveError: message } : prev,
      );
      toast.error(message);
    } finally {
      if (savingTokenRef.current === token) {
        savingTokenRef.current = null;
        setSaving(false);
      }
    }
  }, [generatedBrief, refreshHistory, result, user.id, user.name]);

  const handleOpen = useCallback((set: SavedCopySet) => {
    setBrief(set.brief);
    setGeneratedBrief(set.brief);
    setResult({
      token: `saved-${set.id}`,
      variants: set.variants,
      provider: set.provider,
      model: set.model,
      latencyMs: null,
      missingPlatforms: [],
      savedId: set.id,
      savedAt: set.createdAt,
      saveError: null,
    });
    setFormError(null);
    setMode('compose');
  }, []);

  const handleReuse = useCallback((set: SavedCopySet) => {
    setBrief(set.brief);
    setGeneratedBrief(null);
    setResult(null);
    setFormError(null);
    setMode('compose');
    toast.success('已填入 brief，按「生成五版文案」重新生成');
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await removeSet(id);
        if (result?.savedId === id) {
          setResult(null);
          setGeneratedBrief(null);
        }
        toast.success('已刪除');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '刪除失敗');
      }
    },
    [removeSet, result],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="AI跨平台一稿多發頁籤"
          className="inline-flex items-center gap-1 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-card"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'compose'}
            onClick={() => setMode('compose')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors',
              mode === 'compose'
                ? 'bg-[#0d1a2d] text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
            )}
          >
            <Sparkles size={14} />
            生成文案
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'history'}
            onClick={() => setMode('history')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors',
              mode === 'history'
                ? 'bg-[#0d1a2d] text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
            )}
          >
            <HistoryIcon size={14} />
            歷史紀錄
            {sets.length > 0 && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-4',
                  mode === 'history' ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700',
                )}
              >
                {sets.length > 99 ? '99+' : sets.length}
              </span>
            )}
          </button>
        </div>

        {mode === 'compose' && (
          <p className="text-[11px] text-muted-foreground">
            生成後自動存入歷史；字數超標只提示，不會自動裁剪。
          </p>
        )}
      </div>

      {mode === 'compose' ? (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-4">
            <CrosspostComposer
              value={brief}
              onChange={setBrief}
              onGenerate={() => {
                void handleGenerate();
              }}
              generating={generating}
              error={formError}
            />
          </div>

          <div>
            {generating && !result ? (
              <GeneratingPanel />
            ) : result ? (
              <CrosspostResultView
                brief={generatedBrief ?? brief}
                generation={result}
                regenerating={generating}
                saving={saving}
                onRetrySave={() => {
                  void handleRetrySave();
                }}
                onRegenerate={() => {
                  void handleGenerate();
                }}
              />
            ) : (
              <EmptyResult />
            )}
          </div>
        </div>
      ) : (
        <CrosspostHistoryView
          sets={sets}
          loading={loading}
          error={historyError}
          available={available}
          onOpen={handleOpen}
          onReuse={handleReuse}
          onDelete={handleDelete}
          onRefresh={() => {
            void refreshHistory();
          }}
        />
      )}
    </div>
  );
}
