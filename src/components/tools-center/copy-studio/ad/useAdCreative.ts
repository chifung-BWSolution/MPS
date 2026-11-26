import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  AdCreativeError,
  checkAdCreativeService,
  generateAdCreative,
  type AdServiceStatus,
} from '@/lib/adCreativeApi';
import {
  AD_ANGLE_ORDER,
  adCopyKey,
  applyAdCopyOverrides,
  buildAdCopyAllText,
  buildAdMatrixTsv,
  clampAdLimits,
  createDefaultAdBrief,
  limitsForPlatform,
  normalizeAdBrief,
  resolveAngleSelection,
  validateAdBrief,
  type AdAngleId,
  type AdBrief,
  type AdCopyField,
  type AdCopyOverrides,
  type AdCreativeResult,
  type AdLimits,
  type AdPlatform,
  type AdVariantKey,
} from '@/lib/adCreative';

export interface AdCreativeErrorState {
  code: string;
  message: string;
}

const SAMPLE_BRIEF = {
  productName: '手工低糖月餅禮盒',
  sellingPoints: '低糖配方，甜度減半\n每日手工烘焙\n獨立包裝，送禮體面',
  offer: '9 月 20 日前訂購享 85 折，限 200 盒',
  audience: '25–45 歲香港在職女性，中秋送禮',
  goal: 'conversion' as const,
  platform: 'meta' as const,
  tone: 'professional' as const,
  angleIds: ['pain', 'time', 'offer', 'proof'] as AdAngleId[],
  limits: limitsForPlatform('meta'),
  variation: 0,
};

export interface UseAdCreativeOptions {
  active: boolean;
}

/**
 * 文案多角度轉寫的狀態機：
 *   - 首次切到廣告 tab 才探測服務
 *   - 生成／取消／重試；失敗保留上一次成功結果
 *   - edits 只存改動過的欄位；CSV／複製用 effectiveResult
 *   - stale 以 brief 比對，不含 variation
 */
export function useAdCreative({ active }: UseAdCreativeOptions) {
  const [brief, setBrief] = useState<AdBrief>(() => createDefaultAdBrief('meta'));
  const [customLimits, setCustomLimits] = useState(false);
  const [service, setService] = useState<AdServiceStatus>('unknown');
  const [checking, setChecking] = useState(true);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const [result, setResult] = useState<AdCreativeResult | null>(null);
  const [edits, setEdits] = useState<AdCopyOverrides>({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<AdCreativeErrorState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const normalizedBrief = useMemo(() => normalizeAdBrief(brief), [brief]);
  const issues = useMemo(() => validateAdBrief(normalizedBrief), [normalizedBrief]);

  const stale = useMemo(() => {
    if (!result) return false;
    const current = { ...normalizedBrief, variation: 0 };
    const generated = { ...result.brief, variation: 0 };
    return JSON.stringify(current) !== JSON.stringify(generated);
  }, [normalizedBrief, result]);

  const effectiveResult = useMemo(
    () => (result ? applyAdCopyOverrides(result, edits) : null),
    [result, edits],
  );

  const editedCount = Object.keys(edits).length;

  const refreshService = useCallback(async () => {
    setChecking(true);
    try {
      setService(await checkAdCreativeService());
    } catch {
      setService('unknown');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!active || checkedOnce) return;
    setCheckedOnce(true);
    void refreshService();
  }, [active, checkedOnce, refreshService]);

  const patchBrief = useCallback((patch: Partial<AdBrief>) => {
    setBrief((previous) => {
      const next = { ...previous, ...patch };
      if (!next.offer.trim() && next.angleIds.includes('offer')) {
        next.angleIds = resolveAngleSelection(
          next.angleIds.filter((id) => id !== 'offer'),
          false,
        );
      }
      return next;
    });
  }, []);

  const changePlatform = useCallback((platform: AdPlatform) => {
    setBrief((previous) => ({
      ...previous,
      platform,
      limits: limitsForPlatform(platform),
    }));
    setCustomLimits(false);
  }, []);

  const toggleCustomLimits = useCallback((next: boolean) => {
    setCustomLimits(next);
    if (!next) {
      setBrief((previous) => ({
        ...previous,
        limits: limitsForPlatform(previous.platform),
      }));
    }
  }, []);

  const changeLimits = useCallback((patch: Partial<AdLimits>) => {
    setCustomLimits(true);
    setBrief((previous) => ({
      ...previous,
      limits: clampAdLimits({ ...previous.limits, ...patch }, previous.platform),
    }));
  }, []);

  const toggleAngle = useCallback(
    (id: AdAngleId) => {
      const selected = brief.angleIds.includes(id);

      if (selected) {
        if (brief.angleIds.length <= 3) {
          toast.info('至少保留 3 個切角');
          return;
        }
        const remaining = brief.angleIds.filter((item) => item !== id);
        setBrief((previous) => ({
          ...previous,
          angleIds: AD_ANGLE_ORDER.filter((item) => remaining.includes(item)),
        }));
        return;
      }

      if (id === 'offer' && !brief.offer.trim()) {
        toast.info('先填優惠條件，才能使用限時優惠切角');
        return;
      }
      if (brief.angleIds.length >= 5) {
        toast.info('最多 5 個切角');
        return;
      }

      const merged = resolveAngleSelection(
        [...brief.angleIds, id],
        brief.offer.trim().length > 0,
      );
      setBrief((previous) => ({
        ...previous,
        angleIds: AD_ANGLE_ORDER.filter((item) => merged.includes(item)),
      }));
    },
    [brief.angleIds, brief.offer],
  );

  const runGeneration = useCallback(async (briefToUse: AdBrief) => {
    const normalized = normalizeAdBrief(briefToUse);
    const nextIssues = validateAdBrief(normalized);
    if (nextIssues.length > 0) {
      setError({ code: 'invalid_input', message: nextIssues[0].message });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setGenerating(true);
    setError(null);

    try {
      const next = await generateAdCreative(normalized, { signal: controller.signal });
      if (requestIdRef.current !== requestId) return;
      setResult(next);
      setEdits({});
      setService('ready');
    } catch (caught) {
      if (requestIdRef.current !== requestId) return;
      if (caught instanceof AdCreativeError) {
        if (caught.code === 'aborted') return;
        if (caught.code === 'not_deployed') setService('missing');
        setError({ code: caught.code, message: caught.message });
      } else {
        setError({ code: 'unknown', message: '生成失敗，請重試' });
      }
    } finally {
      if (requestIdRef.current === requestId) setGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const generate = useCallback(() => {
    void runGeneration(brief);
  }, [brief, runGeneration]);

  /**
   * 回到表單（不自動生成）：
   *   keepBrief=true  → 保留目前填寫內容，讓使用者調整後再按「生成」（結果頁的「重新生成」）
   *   keepBrief=false → 清空回預設值（結果頁的「返回首頁」）
   */
  const backToBrief = useCallback(
    (keepBrief: boolean) => {
      abortRef.current?.abort();
      requestIdRef.current += 1;
      setGenerating(false);
      setResult(null);
      setEdits({});
      setError(null);
      if (!keepBrief) {
        setBrief(createDefaultAdBrief(brief.platform));
        setCustomLimits(false);
      }
    },
    [brief.platform],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setBrief(createDefaultAdBrief(brief.platform));
    setCustomLimits(false);
    setResult(null);
    setEdits({});
    setError(null);
    setGenerating(false);
  }, [brief.platform]);

  const loadExample = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setBrief(normalizeAdBrief(SAMPLE_BRIEF));
    setCustomLimits(false);
    setResult(null);
    setEdits({});
    setError(null);
    setGenerating(false);
  }, []);

  const updateCell = useCallback(
    (angleId: AdAngleId, variant: AdVariantKey, field: AdCopyField, value: string) => {
      setEdits((previous) => ({
        ...previous,
        [adCopyKey(angleId, variant, field)]: value,
      }));
    },
    [],
  );

  const resetCell = useCallback(
    (angleId: AdAngleId, variant: AdVariantKey, field: AdCopyField) => {
      setEdits((previous) => {
        const next = { ...previous };
        delete next[adCopyKey(angleId, variant, field)];
        return next;
      });
    },
    [],
  );

  const resetAllEdits = useCallback(() => setEdits({}), []);

  const copyAllText = useMemo(
    () => (effectiveResult ? buildAdCopyAllText(effectiveResult) : ''),
    [effectiveResult],
  );

  const matrixTsv = useMemo(
    () => (effectiveResult ? buildAdMatrixTsv(effectiveResult) : ''),
    [effectiveResult],
  );

  return {
    brief,
    normalizedBrief,
    issues,
    stale,
    service,
    checking,
    error,
    generating,
    result,
    effectiveResult,
    edits,
    editedCount,
    customLimits,
    copyAllText,
    matrixTsv,
    refreshService,
    generate,
    backToBrief,
    cancel,
    clear,
    loadExample,
    patchBrief,
    changePlatform,
    toggleAngle,
    changeLimits,
    toggleCustomLimits,
    updateCell,
    resetCell,
    resetAllEdits,
  };
}
