/**
 * 接入精靈（M1-09、PRD §8.2.2）
 *
 * 5 步：選站 → 欄目 → 語言與品牌語氣 → cadence 與發布模式 → 連線測試。
 * 步驟條可點回上一步；所有輸入都存在 component state，回頭修改不丟資料。
 *
 * 第 5 步順序（後端函式要求）：
 *   1. upsert_settings 建站（tier/adapter/publish_mode/locale/timezone/cadence/
 *      seo_defaults/brand_voice，首次呼叫會建立 content_sites 列）
 *   2. 逐筆 upsert_section
 *   3. test_connection（回 health + 逐項 checks）
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  DatabaseZap,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/contentPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import {
  ADAPTER_LABEL,
  ADAPTER_OPTION_LABEL,
  CADENCE_FREQUENCY_LABEL,
  CADENCE_FREQUENCY_OPTION_LABEL,
  PUBLISH_MODE_LABEL,
  PUBLISH_MODE_OPTION_LABEL,
  SECTION_TYPE_OPTION_LABEL,
  TIER_LABEL,
  TIER_OPTION_LABEL,
} from '@/lib/contentState';
import { cadenceSummary, planSlots, validateCadence } from '@/lib/contentPlanner';
import { contentErrorMessage, isContentSchemaMissing } from '@/lib/contentApi';
import {
  DEFAULT_BRAND_VOICE,
  DEFAULT_CADENCE,
  DEFAULT_SEO_DEFAULTS,
  HONG_KONG_TIME_ZONE,
  formatZoneDateTime,
  suggestSectionSlug,
} from '@/lib/contentFormat';
import {
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentAdapterName,
  type ContentBrandVoice,
  type ContentCadence,
  type ContentCadenceFrequency,
  type ContentConnectionTestResult,
  type ContentPublishMode,
  type ContentSectionType,
  type ContentTier,
} from '@/lib/contentTypes';
import type { ContentViewProps } from '@/lib/contentNavigation';
import {
  ADAPTER_OPTIONS,
  LOCALE_OPTIONS,
  PUBLISH_MODE_OPTIONS,
  SECTION_TYPE_OPTIONS,
  TIMEZONE_OPTIONS,
  TIER_OPTIONS,
  WEEKDAY_OPTIONS,
  inferTierFromLevel,
  listSiteCandidates,
  parseListInput,
  runConnectionTest,
  saveSite,
  upsertSection,
  useContentSites,
  type ContentSiteSectionDraft,
  type SiteCandidate,
} from '@/hooks/useContentSites';

// ============================================================
// 步驟定義與常數
// ============================================================

interface WizardStepMeta {
  key: string;
  label: string;
  hint: string;
}

const WIZARD_STEPS: readonly WizardStepMeta[] = [
  { key: 'site', label: '選站', hint: '從站點主檔挑一個網站' },
  { key: 'sections', label: '欄目', hint: '文章要發到哪個欄目' },
  { key: 'voice', label: '語言與語氣', hint: 'Locale、讀者、禁用詞' },
  { key: 'cadence', label: '節奏與發布', hint: '頻率、時間、發布模式' },
  { key: 'test', label: '連線測試', hint: '基本設定 → 首頁可開啟 → 網站地圖 → 登入憑證' },
];

const LAST_STEP = WIZARD_STEPS.length - 1;

/** 各頻率的預設星期（1=週一）；custom 保留使用者自選 */
const FREQUENCY_PRESET_WEEKDAYS: Record<Exclude<ContentCadenceFrequency, 'custom'>, number[]> = {
  daily: [1, 2, 3, 4, 5, 6, 7],
  every_2_days: [1, 2, 3, 4, 5, 6, 7],
  twice_weekly: [1, 4],
  weekly: [1],
};

const AUTO_WEEKDAY_FREQUENCIES: readonly ContentCadenceFrequency[] = ['daily', 'every_2_days'];

interface SectionDraft {
  key: string;
  name: string;
  slug: string;
  external_id: string;
  content_type: ContentSectionType;
  /** 使用者手動改過網址代稱後，就不再跟著名稱自動變 */
  slugTouched: boolean;
}

type TestPhase = 'idle' | 'saving' | 'testing' | 'done' | 'error';

let sectionRowSeed = 0;
function createSectionRow(partial?: Partial<SectionDraft>): SectionDraft {
  sectionRowSeed += 1;
  return {
    key: `section-${sectionRowSeed}`,
    name: partial?.name ?? '',
    slug: partial?.slug ?? '',
    external_id: partial?.external_id ?? '',
    content_type: partial?.content_type ?? 'article',
    slugTouched: partial?.slugTouched ?? false,
  };
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[12px] font-semibold text-slate-600">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StepBar({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {WIZARD_STEPS.map((meta, index) => {
        const done = index < current;
        const active = index === current;
        // 只允許點回上一步（往前請用「下一步」，確保每一步都通過驗證）
        const reachable = index <= current;
        return (
          <li key={meta.key}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onSelect(index)}
              title={reachable ? `回到第 ${index + 1} 步：${meta.label}` : `請用「下一步」前往第 ${index + 1} 步`}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                active
                  ? 'border-teal-500 bg-teal-50/70 ring-1 ring-inset ring-teal-200'
                  : done
                    ? 'border-[rgba(13,26,45,0.08)] bg-white hover:border-teal-300'
                    : 'border-dashed border-[rgba(13,26,45,0.12)] bg-white/60',
                !reachable && 'cursor-not-allowed opacity-60',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  active
                    ? 'bg-teal-600 text-white'
                    : done
                      ? 'bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200'
                      : 'bg-slate-100 text-slate-500',
                )}
              >
                {done ? <Check size={11} /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[12.5px] font-semibold leading-tight',
                    active ? 'text-teal-800' : 'text-[#0d1a2d]',
                  )}
                >
                  {meta.label}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted-foreground">
                  {meta.hint}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function CheckList({ checks }: { checks: ContentConnectionTestResult['checks'] }) {
  if (checks.length === 0) {
    return <p className="text-[12px] text-muted-foreground">沒有回傳檢查項目。</p>;
  }
  return (
    <ul className="space-y-1.5">
      {checks.map((check) => {
        const Icon = check.ok ? CheckCircle2 : check.blocking ? XCircle : AlertTriangle;
        return (
          <li
            key={`${check.kind}-${check.label}`}
            className={cn(
              'flex items-start gap-2 rounded-md border px-2.5 py-2',
              check.ok
                ? 'border-emerald-200 bg-emerald-50/50'
                : check.blocking
                  ? 'border-rose-200 bg-rose-50/50'
                  : 'border-amber-200 bg-amber-50/50',
            )}
          >
            <Icon
              size={14}
              className={cn(
                'mt-0.5 shrink-0',
                check.ok ? 'text-emerald-600' : check.blocking ? 'text-rose-600' : 'text-amber-600',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-[#0d1a2d]">
                {check.label || check.kind}
                {!check.ok && (
                  <span
                    className={cn(
                      'rounded px-1 py-0.5 text-[10px] font-bold',
                      check.blocking
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    {check.blocking ? '阻擋排程' : '僅警告'}
                  </span>
                )}
              </p>
              <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-muted-foreground">
                {check.detail || '—'}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================
// 主元件
// ============================================================

export function SiteWizard({ navigate }: ContentViewProps) {
  const { systemUser } = useAuth();
  const canManageSites = can({ role: systemUser?.role ?? null }, 'manage_sites');
  const { sites, loading: sitesLoading, error: sitesError, missingSchema: sitesMissingSchema, refresh: refreshSites } =
    useContentSites();

  const [step, setStep] = useState(0);

  // ---- 步驟 1：選站 ----
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidates, setCandidates] = useState<SiteCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [candidatesSchemaMissing, setCandidatesSchemaMissing] = useState(false);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<SiteCandidate | null>(null);
  const [tier, setTier] = useState<ContentTier>('B');
  const [adapter, setAdapter] = useState<ContentAdapterName>('manual');
  const [timezone, setTimezone] = useState(HONG_KONG_TIME_ZONE);

  // ---- 步驟 2：欄目 ----
  const [sectionRows, setSectionRows] = useState<SectionDraft[]>([createSectionRow()]);
  /** 第 5 步已成功建立的欄目 id（key = row.key）；重試時改用 update，避免 slug 重複 */
  const [savedSectionIds, setSavedSectionIds] = useState<Record<string, string>>({});

  // ---- 步驟 3：語言與品牌語氣 ----
  const [locale, setLocale] = useState('zh-HK');
  const [tone, setTone] = useState(DEFAULT_BRAND_VOICE.tone);
  const [audience, setAudience] = useState('');
  const [cta, setCta] = useState('');
  const [factBoundaries, setFactBoundaries] = useState('');
  const [bannedWordsInput, setBannedWordsInput] = useState('');
  const [allowAiImages, setAllowAiImages] = useState(DEFAULT_BRAND_VOICE.allowAiImages);

  // ---- 步驟 4：cadence 與發布模式 ----
  const [cadence, setCadence] = useState<ContentCadence>(DEFAULT_CADENCE);
  const [publishMode, setPublishMode] = useState<ContentPublishMode>('manual');
  const [blackoutDateInput, setBlackoutDateInput] = useState('');

  // ---- 步驟 5：連線測試 ----
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [testProgress, setTestProgress] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ContentConnectionTestResult | null>(null);
  const [testRequested, setTestRequested] = useState(false);

  // ------------------------------------------------------------
  // 候選站點（Edge Function：list_site_candidates）
  // ------------------------------------------------------------
  const loadCandidates = useCallback(async (query: string) => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    try {
      const rows = await listSiteCandidates(query.trim() || undefined);
      setCandidates(rows);
      setCandidatesSchemaMissing(false);
    } catch (thrown) {
      setCandidates([]);
      if (isContentSchemaMissing(thrown)) {
        setCandidatesSchemaMissing(true);
        setCandidatesError(null);
      } else {
        setCandidatesError(contentErrorMessage(thrown));
      }
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCandidates(candidateQuery);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [candidateQuery, loadCandidates]);

  const connectedIds = useMemo(
    () => new Set(sites.map((site) => site.website_profile_id)),
    [sites],
  );

  const mergedCandidates = useMemo(
    () =>
      candidates.map((candidate) => ({
        ...candidate,
        connected: candidate.connected || connectedIds.has(candidate.id),
      })),
    [candidates, connectedIds],
  );

  const handleSelectCandidate = (candidate: SiteCandidate & { connected?: boolean }) => {
    if (candidate.connected) {
      toast.error('這個站點已經接入', { description: '請從站點清單進入詳情，或選擇其他站點。' });
      return;
    }
    setSiteId(candidate.id);
    setSelectedCandidate(candidate);
    setTier(inferTierFromLevel(candidate.level));
  };

  // ------------------------------------------------------------
  // 欄目驗證
  // ------------------------------------------------------------
  const sectionIssues = useMemo(() => {
    const issues: string[] = [];
    if (sectionRows.length === 0) issues.push('至少需要一個欄目。');
    const seen = new Set<string>();
    sectionRows.forEach((row, index) => {
      const label = `第 ${index + 1} 列`;
      if (!row.name.trim()) issues.push(`${label}：請填欄目名稱。`);
      // 網址代稱是選填：留空會在送出時自動產生，只有「有填但格式不對」才擋。
      const slug = row.slug.trim();
      if (!slug) return;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        issues.push(`${label}：網址代稱只能用小寫英文、數字與連字號。`);
      } else if (seen.has(slug)) {
        issues.push(`${label}：網址代稱「${slug}」與其他欄目重複。`);
      } else {
        seen.add(slug);
      }
    });
    return issues;
  }, [sectionRows]);

  /**
   * 送出前補齊空白網址代稱（選填欄位，不逼營運人員填）：
   * 名稱含英文就轉 kebab；純中文給 category-N；撞名自動加序號。
   */
  const withResolvedSlugs = <T extends { name: string; slug: string }>(rows: T[]): T[] => {
    const used: string[] = [];
    return rows.map((row, index) => {
      const candidate = row.slug.trim() || suggestSectionSlug(row.name, index, used);
      const slug = used.includes(candidate)
        ? suggestSectionSlug(candidate, index, used)
        : candidate;
      used.push(slug);
      return { ...row, slug };
    });
  };

  const updateSectionRow = (key: string, patch: Partial<SectionDraft>) => {
    setSectionRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  /**
   * 名稱一改就自動帶入網址代稱（純中文名稱會先給 category-N），
   * 使用者手動改過之後就不再覆蓋。
   */
  const handleSectionNameChange = (row: SectionDraft, index: number, name: string) => {
    setSectionRows((rows) =>
      rows.map((item, itemIndex) => {
        if (item.key !== row.key) return item;
        if (item.slugTouched) return { ...item, name };
        const taken = rows
          .filter((candidate) => candidate.key !== item.key)
          .map((candidate) => candidate.slug);
        return {
          ...item,
          name,
          slug: suggestSectionSlug(name, itemIndex >= 0 ? itemIndex : index, taken),
        };
      }),
    );
  };

  // ------------------------------------------------------------
  // cadence 驗證與 30 天預估
  // ------------------------------------------------------------
  const cadenceIssues = useMemo(() => validateCadence(cadence), [cadence]);

  const cadencePreview = useMemo(() => {
    const planned = planSlots({
      siteId: 'preview',
      cadence,
      timezone,
      horizonDays: 30,
    });
    return {
      count: planned.slots.length,
      warnings: [...new Set(planned.warnings)],
      skippedBlackout: planned.skippedBlackout,
    };
  }, [cadence, timezone]);

  const autoWeekdays = AUTO_WEEKDAY_FREQUENCIES.includes(cadence.frequency);

  const changeFrequency = (next: ContentCadenceFrequency) => {
    setCadence((previous) => {
      if (next === 'custom') {
        return {
          ...previous,
          frequency: next,
          weekdays: previous.weekdays.length > 0 ? previous.weekdays : [1],
        };
      }
      return { ...previous, frequency: next, weekdays: [...FREQUENCY_PRESET_WEEKDAYS[next]] };
    });
  };

  const toggleWeekday = (weekday: number) => {
    setCadence((previous) => {
      const exists = previous.weekdays.includes(weekday);
      const weekdays = exists
        ? previous.weekdays.filter((day) => day !== weekday)
        : [...previous.weekdays, weekday].sort((a, b) => a - b);
      return { ...previous, weekdays };
    });
  };

  const addBlackoutDate = () => {
    const value = blackoutDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      toast.error('請選擇有效的日期（YYYY-MM-DD）。');
      return;
    }
    setCadence((previous) =>
      previous.blackout_dates.includes(value)
        ? previous
        : { ...previous, blackout_dates: [...previous.blackout_dates, value].sort() },
    );
    setBlackoutDateInput('');
  };

  const removeBlackoutDate = (value: string) => {
    setCadence((previous) => ({
      ...previous,
      blackout_dates: previous.blackout_dates.filter((date) => date !== value),
    }));
  };

  // ------------------------------------------------------------
  // 步驟切換與驗證
  // ------------------------------------------------------------
  const stepIssue = useMemo(() => {
    if (step === 0) return siteId ? null : '請先選擇要接入的站點。';
    if (step === 1) return sectionIssues[0] ?? null;
    if (step === 2) return locale.trim() ? null : '請選擇站點語言（locale）。';
    if (step === 3) return cadenceIssues[0] ?? null;
    return null;
  }, [cadenceIssues, locale, sectionIssues, siteId, step]);

  const goToStep = (index: number) => {
    if (index < 0 || index > LAST_STEP || index > step) return;
    if (index < step && step === LAST_STEP) {
      // 從連線測試回上一步：重置測試狀態，下次進來會用新設定重測
      setTestRequested(false);
      setTestPhase('idle');
      setTestResult(null);
      setTestError(null);
      setTestProgress(null);
    }
    setStep(index);
  };

  const goNext = () => {
    if (!canManageSites) {
      toast.error('沒有接入站點的權限', {
        description: '只有管理層（management／system_dev）可以接入站點。',
      });
      return;
    }
    if (stepIssue) {
      toast.error('這一步還沒完成', { description: stepIssue });
      return;
    }
    const next = Math.min(LAST_STEP, step + 1);
    setStep(next);
  };

  // ------------------------------------------------------------
  // 第 5 步：儲存設定 → 欄目 → 連線測試
  // ------------------------------------------------------------
  const runWizardTest = useCallback(async () => {
    if (!siteId) return;
    const candidate = selectedCandidate;
    const bannedWords = parseListInput(bannedWordsInput);
    const brandVoice: ContentBrandVoice = {
      tone: tone.trim() || DEFAULT_BRAND_VOICE.tone,
      audience: audience.trim(),
      cta: cta.trim(),
      bannedWords,
      factBoundaries: factBoundaries.trim(),
      allowAiImages,
    };
    const seoDefaults = {
      ...DEFAULT_SEO_DEFAULTS,
      locale: locale.trim() || DEFAULT_SEO_DEFAULTS.locale,
      canonicalBase: candidate?.domain_url?.trim() || '',
      author: candidate?.brand?.trim() || '',
      publisher: candidate?.website_name?.trim() || '',
      bannedWords: brandVoice.bannedWords,
    };
    const resolvedSections = withResolvedSlugs(sectionRows);
    setSectionRows(resolvedSections);
    const sectionDrafts: (ContentSiteSectionDraft & { rowKey: string })[] = resolvedSections.map((row) => ({
      rowKey: row.key,
      ...(savedSectionIds[row.key] ? { id: savedSectionIds[row.key] } : {}),
      name: row.name.trim(),
      slug: row.slug.trim(),
      external_id: row.external_id.trim() || null,
      content_type: row.content_type,
    }));

    setTestPhase('saving');
    setTestError(null);
    setTestResult(null);
    setTestProgress('正在儲存站點設定…');
    try {
      await saveSite(siteId, {
        tier,
        adapter,
        publish_mode: publishMode,
        locale: locale.trim(),
        timezone,
        status: 'active',
        cadence,
        seo_defaults: seoDefaults,
        brand_voice: brandVoice,
      });

      for (let index = 0; index < sectionDrafts.length; index += 1) {
        const draft = sectionDrafts[index];
        setTestProgress(`正在儲存欄目 ${index + 1}/${sectionDrafts.length}：${draft.name}`);
        const saved = await upsertSection(siteId, draft);
        if (saved?.id) {
          setSavedSectionIds((previous) =>
            previous[draft.rowKey] === saved.id
              ? previous
              : { ...previous, [draft.rowKey]: saved.id },
          );
        }
      }

      setTestPhase('testing');
      setTestProgress('正在檢查網站首頁、網站地圖與登入憑證（每項最多 10 秒）…');
      const result = await runConnectionTest(siteId);
      setTestResult(result);
      setTestPhase('done');
      setTestProgress(null);

      if (result.health === 'ok') {
        toast.success('連線測試通過', { description: '站點已可排程與自動生成。' });
      } else if (result.health === 'degraded') {
        toast.message('連線測試完成：站點可用但降級', {
          description: '網站地圖（sitemap）讀不到只會提醒，不影響排程。',
        });
      } else if (result.health === 'untested') {
        toast.error('設定仍未齊全', { description: '請回上一步補齊設定後重新測試。' });
      } else {
        toast.error('連線測試未通過', {
          description: '網站首頁或登入憑證檢查未通過；可回上一步修正，或稍後重新測試。',
        });
      }
      await refreshSites();
    } catch (thrown) {
      const message = contentErrorMessage(thrown);
      setTestPhase('error');
      setTestError(message);
      setTestProgress(null);
      toast.error('接入失敗', { description: message });
    }
  }, [
    adapter,
    allowAiImages,
    audience,
    bannedWordsInput,
    cadence,
    cta,
    factBoundaries,
    locale,
    publishMode,
    refreshSites,
    savedSectionIds,
    sectionRows,
    selectedCandidate,
    siteId,
    tier,
    timezone,
    tone,
  ]);

  // 進入第 5 步自動跑一次（回到上一步後再進來會重跑）
  useEffect(() => {
    if (step !== LAST_STEP || testRequested || !siteId) return;
    setTestRequested(true);
    void runWizardTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, testRequested, siteId]);

  // ------------------------------------------------------------
  // 頁面四態
  // ------------------------------------------------------------
  const missingSchema = sitesMissingSchema || candidatesSchemaMissing;

  const pageHeader = (
    <ContentPageHeader
      title="接入新站"
      subtitle="5 步完成接入：選站 → 欄目 → 語言與語氣 → 節奏與發布 → 連線測試。每一步都可回頭修改，資料不會丟。"
      actions={
        <Button variant="outline" size="sm" onClick={() => navigate('seo', 'sites')}>
          <ArrowLeft size={13} />
          回到站點清單
        </Button>
      }
    />
  );

  if (missingSchema) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description={CONTENT_NOT_ENABLED_MESSAGE}
          action={
            <Button size="sm" variant="outline" onClick={() => void refreshSites()}>
              <RefreshCw size={13} />
              重新檢查
            </Button>
          }
        />
      </div>
    );
  }

  if (!canManageSites) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <ContentEmptyState
          icon={ShieldCheck}
          tone="warning"
          title="需要站點管理權限"
          description="接入站點、寫入憑證與連線測試屬於 manage_sites：只有管理層（management／system_dev）可以執行。可請管理員代為接入，或請對方把角色調整後再試。"
          action={
            <Button size="sm" onClick={() => navigate('seo', 'sites')}>
              回到站點清單
            </Button>
          }
        />
      </div>
    );
  }

  if (sitesError) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="站點資料載入失敗"
          description={sitesError}
          action={
            <Button size="sm" onClick={() => void refreshSites()}>
              <RefreshCw size={13} />
              重試
            </Button>
          }
        />
      </div>
    );
  }

  if (sitesLoading && sites.length === 0 && candidates.length === 0 && candidatesLoading) {
    return (
      <div className="space-y-5">
        {pageHeader}
        <div className="grid gap-2 sm:grid-cols-5">
          {WIZARD_STEPS.map((meta) => (
            <div
              key={meta.key}
              className="h-14 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
      </div>
    );
  }

  // ------------------------------------------------------------
  // 各步驟內容
  // ------------------------------------------------------------
  const renderSiteStep = () => (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={candidateQuery}
            onChange={(event) => setCandidateQuery(event.target.value)}
            placeholder="搜尋站點名稱或網域（例如 BWA、bwteam.com）"
            className="h-9 bg-white pl-8 text-[13px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => void loadCandidates(candidateQuery)}
          disabled={candidatesLoading}
        >
          <RefreshCw size={13} className={candidatesLoading ? 'animate-spin' : undefined} />
          搜尋
        </Button>
      </div>

      {candidatesLoading && mergedCandidates.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-md border border-[rgba(13,26,45,0.08)] bg-white"
            />
          ))}
        </div>
      )}

      {candidatesError && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-rose-700">站點主檔載入失敗</p>
            <p className="mt-0.5 break-words text-[11.5px] text-rose-600">{candidatesError}</p>
          </div>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => void loadCandidates(candidateQuery)}>
            重試
          </Button>
        </div>
      )}

      {!candidatesLoading && !candidatesError && mergedCandidates.length === 0 && (
        <ContentEmptyState
          icon={Globe2}
          title="找不到符合的站點"
          description={
            candidateQuery.trim()
              ? `站點主檔沒有符合「${candidateQuery.trim()}」的網站。可換個關鍵字，或先到「網站」模組新增站點主檔。`
              : '站點主檔（webandsystem_list）目前沒有資料。請先到「網站」模組建立站點。'
          }
        />
      )}

      {mergedCandidates.length > 0 && (
        <div className="max-h-[336px] space-y-1.5 overflow-y-auto pr-1">
          {mergedCandidates.map((candidate) => {
            const active = candidate.id === siteId;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => handleSelectCandidate(candidate)}
                disabled={candidate.connected}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-teal-500 bg-teal-50/60 ring-1 ring-inset ring-teal-200'
                    : candidate.connected
                      ? 'cursor-not-allowed border-[rgba(13,26,45,0.08)] bg-slate-50/70 opacity-70'
                      : 'border-[rgba(13,26,45,0.08)] bg-white hover:border-teal-300',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white',
                  )}
                >
                  {active && <Check size={10} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-[#0d1a2d]">
                      {candidate.website_name}
                    </span>
                    {candidate.connected && (
                      <span className="shrink-0 rounded bg-slate-200 px-1 py-0.5 text-[10px] font-bold text-slate-600">
                        已接入
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {(candidate.domain_url || '—').replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                    </span>
                    {candidate.platform && <span>· {candidate.platform}</span>}
                    {candidate.brand && <span>· {candidate.brand}</span>}
                    {candidate.level != null && <span>· Level {candidate.level}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedCandidate && (
        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-slate-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
            <ShieldCheck size={12} className="text-teal-600" />
            已選「{selectedCandidate.website_name}」的基本設定
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="站點等級（Tier）" hint="等級越高，系統越優先安排產出">
              <Select value={tier} onValueChange={(value) => setTier(value as ContentTier)}>
                <SelectTrigger className="h-9 bg-white text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {TIER_OPTION_LABEL[option] ?? TIER_LABEL[option] ?? option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="發佈方式（Adapter）" hint="先選「手動內容」；日後接好網站 API 再改自動">
              <Select
                value={adapter}
                onValueChange={(value) => setAdapter(value as ContentAdapterName)}
              >
                <SelectTrigger className="h-9 bg-white text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADAPTER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ADAPTER_OPTION_LABEL[option] ?? ADAPTER_LABEL[option] ?? option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="網站時區" hint="排程時間與畫面顯示都用這個時區">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="h-9 bg-white text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            站點等級由站點主檔的 level 推薦（1 → A1、2 → A2、其餘 B），可依實際優先級調整。
          </p>
        </div>
      )}
    </section>
  );

  const renderSectionsStep = () => (
    <section className="space-y-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        欄目就是網站上的分類（例如「裝修知識」）。文章會發到這個分類；「網址代稱」會出現在文章網址中，
        全站不可重複；手動貼上的站點不需要填「官網分類編號」。
      </p>

      <div className="space-y-2">
        {sectionRows.map((row, index) => (
          <div
            key={row.key}
            className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-2.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">
                欄目 {index + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setSectionRows((rows) => rows.filter((item) => item.key !== row.key))}
                disabled={sectionRows.length <= 1}
                title={sectionRows.length <= 1 ? '至少要保留一個欄目' : '刪除這個欄目'}
              >
                <Trash2 size={11} />
                移除
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="欄目名稱" hint="會顯示在網站的選單或分類頁">
                <Input
                  value={row.name}
                  onChange={(event) => handleSectionNameChange(row, index, event.target.value)}
                  placeholder="例如：裝修知識"
                  className="h-9 bg-white text-[13px]"
                />
              </Field>
              <details className="group rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/50 px-2.5 py-2 sm:col-span-2">
                <summary className="cursor-pointer list-none text-[11.5px] font-medium text-slate-600">
                  進階：自訂網址代稱（可選，不用填）
                  <span className="ml-1 text-[10.5px] text-muted-foreground">
                    目前：{row.slug || '系統將自動產生'}
                  </span>
                </summary>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  不用填。系統會自動產生（例如 category-1），只在後台分類識別用，不會出現在官網文章網址。
                  只有你想指定英文代稱時才需要改；官網分類頁網址的最後一段英文就是它（例：/category/renovation → renovation）。
                </p>
                <Input
                  value={row.slug}
                  onChange={(event) =>
                    updateSectionRow(row.key, { slug: event.target.value, slugTouched: true })
                  }
                  placeholder="renovation"
                  className="mt-1.5 h-9 bg-white font-mono text-[12.5px]"
                />
              </details>
              <Field label="官網分類編號（選填）" hint="外部系統的欄目 ID；不知道可留空">
                <Input
                  value={row.external_id}
                  onChange={(event) => updateSectionRow(row.key, { external_id: event.target.value })}
                  placeholder="category-123"
                  className="h-9 bg-white font-mono text-[12.5px]"
                />
              </Field>
              <Field label="文章形式（選填）">
                <Select
                  value={row.content_type}
                  onValueChange={(value) =>
                    updateSectionRow(row.key, { content_type: value as ContentSectionType })
                  }
                >
                  <SelectTrigger className="h-9 bg-white text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {SECTION_TYPE_OPTION_LABEL[option] ?? option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        ))}
      </div>

      {sectionIssues.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] text-amber-800">
          {sectionIssues.map((issue) => (
            <li key={issue} className="flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setSectionRows((rows) => [...rows, createSectionRow()])}
      >
        <Plus size={13} />
        新增欄目
      </Button>
    </section>
  );

  const renderVoiceStep = () => (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="網站語言">
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="h-9 bg-white text-[13px]">
              <SelectValue placeholder="選擇語言" />
            </SelectTrigger>
            <SelectContent>
              {LOCALE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="品牌語氣（選填）" hint="生成文章時會提供給 AI 參考，例如「專業、可信、具體」">
          <Input
            value={tone}
            onChange={(event) => setTone(event.target.value)}
            placeholder={DEFAULT_BRAND_VOICE.tone}
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="目標讀者（選填）" hint="例如「香港 30–45 歲業主、餐飲創業者」">
          <Input
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            placeholder="描述讀者是誰、在意什麼"
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="希望讀者下一步做什麼（CTA，選填）" hint="例如「預約免費度尺」">
          <Input
            value={cta}
            onChange={(event) => setCta(event.target.value)}
            placeholder="文章結尾希望讀者做什麼"
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field
          label="不可編造的內容（事實邊界，選填）"
          hint="例如「不得捏造價格、獎項與客戶名稱」"
          className="sm:col-span-2"
        >
          <Textarea
            value={factBoundaries}
            onChange={(event) => setFactBoundaries(event.target.value)}
            placeholder="例如：價格、獎項、客戶名稱必須有資料來源"
            className="min-h-[64px] bg-white text-[13px]"
          />
        </Field>
        <Field
          label="禁用詞（選填）"
          hint="逗號、頓號或換行分隔；同時套用到品牌語氣與 SEO 檢查"
          className="sm:col-span-2"
        >
          <Textarea
            value={bannedWordsInput}
            onChange={(event) => setBannedWordsInput(event.target.value)}
            placeholder="療效、保證有效、最好"
            className="min-h-[56px] bg-white text-[13px]"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/60 px-3 py-2">
        <div>
          <p className="text-[12.5px] font-semibold text-[#0d1a2d]">允許 AI 生成配圖</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            關閉時只會從素材庫挑圖，不會自動生成圖片。
          </p>
        </div>
        <Switch checked={allowAiImages} onCheckedChange={setAllowAiImages} />
      </div>
    </section>
  );

  const renderCadenceStep = () => (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="發佈頻率">
          <Select
            value={cadence.frequency}
            onValueChange={(value) => changeFrequency(value as ContentCadenceFrequency)}
          >
            <SelectTrigger className="h-9 bg-white text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                ['daily', 'every_2_days', 'twice_weekly', 'weekly', 'custom'] as ContentCadenceFrequency[]
              ).map((option) => (
                <SelectItem key={option} value={option}>
                  {CADENCE_FREQUENCY_OPTION_LABEL[option] ?? CADENCE_FREQUENCY_LABEL[option] ?? option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="發佈時間（網站時區）">
          <Input
            type="time"
            value={cadence.publish_time}
            onChange={(event) =>
              setCadence((previous) => ({ ...previous, publish_time: event.target.value }))
            }
            className="h-9 bg-white text-[13px]"
          />
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[12px] font-semibold text-slate-600">
          發佈星期 {autoWeekdays && <span className="font-normal text-muted-foreground">（由頻率自動決定）</span>}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_OPTIONS.map((option) => {
            const active = cadence.weekdays.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                disabled={autoWeekdays}
                onClick={() => toggleWeekday(option.value)}
                className={cn(
                  'rounded-md border px-2 py-1 text-[12px] font-medium transition-colors',
                  active
                    ? 'border-teal-500 bg-teal-50 text-teal-700'
                    : 'border-[rgba(13,26,45,0.12)] bg-white text-slate-600 hover:border-teal-300',
                  autoWeekdays && 'cursor-not-allowed opacity-60',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="提前多久開始準備（小時）" hint="預設 48 小時：發佈前兩天開始生成，預留審稿時間">
          <Input
            type="number"
            min={1}
            max={336}
            value={String(cadence.lead_time_hours)}
            onChange={(event) =>
              setCadence((previous) => ({
                ...previous,
                lead_time_hours: Number(event.target.value) || 0,
              }))
            }
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="最遲審稿時間（小時）" hint="發佈前幾小時還沒批准，就會自動保留、不會上線">
          <Input
            type="number"
            min={0}
            max={168}
            value={String(cadence.review_cutoff_hours)}
            onChange={(event) =>
              setCadence((previous) => ({
                ...previous,
                review_cutoff_hours: Number(event.target.value) || 0,
              }))
            }
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="每日最多幾篇" hint="同一站點同一天最多幾篇">
          <Input
            type="number"
            min={1}
            max={5}
            value={String(cadence.max_articles_per_day)}
            onChange={(event) =>
              setCadence((previous) => ({
                ...previous,
                max_articles_per_day: Number(event.target.value) || 1,
              }))
            }
            className="h-9 bg-white text-[13px]"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="上線方式">
          <Select
            value={publishMode}
            onValueChange={(value) => setPublishMode(value as ContentPublishMode)}
          >
            <SelectTrigger className="h-9 bg-white text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLISH_MODE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {PUBLISH_MODE_OPTION_LABEL[option] ?? PUBLISH_MODE_LABEL[option] ?? option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="不發佈的日期（選填）" hint="例如長假、活動檔期；這些日期不會安排文章">
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={blackoutDateInput}
              onChange={(event) => setBlackoutDateInput(event.target.value)}
              className="h-9 bg-white text-[13px]"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 px-2"
              onClick={addBlackoutDate}
              disabled={!blackoutDateInput}
            >
              <Plus size={13} />
            </Button>
          </div>
        </Field>
      </div>

      {cadence.blackout_dates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {cadence.blackout_dates.map((date) => (
            <span
              key={date}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800"
            >
              {date}
              <button
                type="button"
                onClick={() => removeBlackoutDate(date)}
                className="text-amber-600 hover:text-rose-600"
                title="移除"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-3 py-2.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#0d1a2d]">
          <CalendarDays size={13} className="text-teal-600" />
          <strong>{cadenceSummary(cadence)}</strong>
          <span className="text-muted-foreground">（{timezone}）</span>
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          未來 30 天約{' '}
          <strong className="text-[13px] tabular-nums text-teal-700">{cadencePreview.count}</strong>{' '}
          篇
          {cadence.blackout_dates.length > 0 &&
            `；已排除 ${cadence.blackout_dates.length} 個不發佈日期`}
        </p>
      </div>

      {cadenceIssues.length > 0 ? (
        <ul className="space-y-0.5 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11.5px] text-rose-700">
          {cadenceIssues.map((issue) => (
            <li key={issue} className="flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              {issue}
            </li>
          ))}
        </ul>
      ) : (
        cadencePreview.warnings.length > 0 && (
          <ul className="space-y-0.5 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] text-amber-800">
            {cadencePreview.warnings.slice(0, 4).map((warning) => (
              <li key={warning} className="flex items-start gap-1.5">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {warning}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );

  const renderTestStep = () => {
    const busy = testPhase === 'saving' || testPhase === 'testing';
    return (
      <section className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/60 px-3 py-2 text-[12px] text-slate-700">
            <p className="font-semibold text-[#0d1a2d]">將送出</p>
            <p className="mt-1 leading-relaxed">
              {selectedCandidate?.website_name ?? siteId} · {TIER_LABEL[tier] ?? tier} ·{' '}
              {ADAPTER_LABEL[adapter] ?? adapter} · {timezone} · {locale}
            </p>
            <p className="mt-1 leading-relaxed">
              {cadenceSummary(cadence)} · {PUBLISH_MODE_LABEL[publishMode] ?? publishMode} ·{' '}
              {sectionRows.length} 個欄目
            </p>
          </div>
          <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/60 px-3 py-2 text-[12px] text-slate-700">
            <p className="font-semibold text-[#0d1a2d]">檢查順序</p>
            <ol className="mt-1 space-y-0.5 pl-4 leading-relaxed [list-style:decimal]">
              <li>基本設定完整（站點等級、語言、SEO 必填項、至少一個欄目）</li>
              <li>網站首頁可開啟（最多等 10 秒）</li>
              <li>網站地圖（sitemap.xml）可讀取（讀不到只提醒，不阻擋）</li>
              <li>登入憑證可使用（有填才檢查）</li>
            </ol>
          </div>
        </div>

        {(testPhase === 'saving' || testPhase === 'testing') && (
          <div className="flex items-center gap-2.5 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-[12.5px] text-blue-800">
            <Loader2 size={15} className="animate-spin" />
            <span>{testProgress ?? '處理中…'}</span>
          </div>
        )}

        {testPhase === 'idle' && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[rgba(13,26,45,0.08)] bg-white px-3 py-2.5">
            <p className="text-[12.5px] text-muted-foreground">
              尚未開始測試。按「開始測試」會先儲存設定與欄目，再依序檢查。
            </p>
            <Button size="sm" className="ml-auto gap-1.5" onClick={() => void runWizardTest()}>
              <Wifi size={13} />
              開始測試
            </Button>
          </div>
        )}

        {testPhase === 'error' && (
          <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-700">
              <XCircle size={14} />
              測試沒有完成
            </p>
            <p className="break-words text-[11.5px] leading-relaxed text-rose-600">{testError}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void runWizardTest()}>
                <RefreshCw size={13} />
                重新測試
              </Button>
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => goToStep(step - 1)}>
                <ArrowLeft size={13} />
                回上一步調整
              </Button>
            </div>
          </div>
        )}

        {testPhase === 'done' && testResult && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <ContentStatusPill status={testResult.health} machine="health" />
              <span className="text-[11.5px] text-muted-foreground">
                測試時間 {formatZoneDateTime(testResult.testedAt, timezone)}
              </span>
            </div>
            <CheckList checks={testResult.checks} />
            {testResult.health !== 'ok' && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  站點已接入，但健康狀態不是 OK：阻擋性項目未通過時不會排程與自動生成。可回到上一步修正後重新測試，
                  或先完成接入，稍後在站點詳情「健康」分頁重新檢查。
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => void runWizardTest()}
                disabled={busy}
              >
                <RefreshCw size={13} />
                重新測試
              </Button>
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => goToStep(step - 1)}>
                <ArrowLeft size={13} />
                回上一步調整
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(13,26,45,0.08)] pt-3">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => goToStep(step - 1)}>
            <ArrowLeft size={13} />
            上一步
          </Button>
          <Button
            size="sm"
            className="ml-auto gap-1"
            disabled={busy}
            onClick={() => {
              if (!siteId) return;
              navigate('seo', 'site', siteId);
            }}
            title={
              testPhase === 'done'
                ? '完成接入並前往站點詳情'
                : '仍要完成接入（設定已儲存，可稍後再測）'
            }
          >
            完成接入
            <ArrowRight size={13} />
          </Button>
        </div>
      </section>
    );
  };

  const stepBodies: Record<string, () => React.ReactNode> = {
    site: renderSiteStep,
    sections: renderSectionsStep,
    voice: renderVoiceStep,
    cadence: renderCadenceStep,
    test: renderTestStep,
  };

  return (
    <div className="space-y-5">
      {pageHeader}
      <StepBar current={step} onSelect={goToStep} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(13,26,45,0.08)] px-4 py-2.5">
            <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10.5px] font-bold text-teal-700">
              步驟 {step + 1} / {WIZARD_STEPS.length}
            </span>
            <h2 className="text-[14px] font-bold text-[#0d1a2d]">{WIZARD_STEPS[step].label}</h2>
            <span className="text-[11.5px] text-muted-foreground">{WIZARD_STEPS[step].hint}</span>
          </div>
          <div className="px-4 py-3.5">{stepBodies[WIZARD_STEPS[step].key]?.()}</div>
        </div>

        <aside className="min-w-0 self-start space-y-2 lg:sticky lg:top-4">
          <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
            <p className="text-[12px] font-bold text-[#0d1a2d]">接入摘要</p>
            <dl className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">站點</dt>
                <dd className="min-w-0 truncate font-semibold text-[#0d1a2d]">
                  {selectedCandidate?.website_name ?? '尚未選擇'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">Tier／Adapter</dt>
                <dd className="min-w-0 truncate">
                  {tier} · {ADAPTER_LABEL[adapter] ?? adapter}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">語言／時區</dt>
                <dd className="min-w-0 truncate">
                  {locale} · {timezone}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">節奏</dt>
                <dd className="min-w-0">{cadenceSummary(cadence)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">發布模式</dt>
                <dd className="min-w-0 truncate">
                  {PUBLISH_MODE_LABEL[publishMode] ?? publishMode}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">欄目</dt>
                <dd className="min-w-0">{sectionRows.length} 個</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">30 天預估</dt>
                <dd className="min-w-0">約 {cadencePreview.count} 篇</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 text-[11px] leading-relaxed text-muted-foreground shadow-card">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
              <ShieldCheck size={12} className="text-teal-600" />
              接入後會發生什麼
            </p>
            <p>
              站點狀態為 active；排程由 planner 依 cadence 產生，生成提前量到了才會呼叫模型。
              未通過連線測試（health 非 ok）前，站點不會排程或自動生成。
            </p>
          </div>
        </aside>
      </div>

      {step < LAST_STEP && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={step === 0}
            onClick={() => goToStep(step - 1)}
          >
            <ArrowLeft size={13} />
            上一步
          </Button>
          <Button size="sm" className="ml-auto gap-1" onClick={goNext} disabled={Boolean(stepIssue)}>
            下一步：{WIZARD_STEPS[Math.min(LAST_STEP, step + 1)].label}
            <ArrowRight size={13} />
          </Button>
          {stepIssue && (
            <span className="w-full text-[11.5px] text-amber-700 sm:w-auto">{stepIssue}</span>
          )}
        </div>
      )}
    </div>
  );
}
