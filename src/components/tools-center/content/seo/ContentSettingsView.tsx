/**
 * 社媒自動化營運 · 設定（M2-01、PRD §6.2.7／§9.2.4）
 *
 * 分區：生成模型 / 每日上限（出廠 0 = 不自動生成）/ 熔斷 / 每日日報 / 危險區（只說明回滾）。
 * 表單一律先改本地草稿，按「儲存設定」才寫 `content_settings`；
 * 權限不足（canManageSettings = false）時全部唯讀。
 */

import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  AlertTriangle,
  DatabaseZap,
  Gauge,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CrudModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';
import { useContentSettings } from '@/hooks/useContentSettings';
import { useContentUsageToday } from '@/hooks/useContentUsage';
import { useStaffEmailRecipients } from '@/hooks/useStaffEmailRecipients';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { invalidRecipients, isValidDigestTime, normalizeRecipients } from '@/lib/contentDigest.ts';
import {
  LLM_PRICING,
  RECOMMENDED_DAILY_ARTICLE_LIMIT,
  RECOMMENDED_DAILY_LLM_CALL_LIMIT,
  formatNumber,
} from '@/lib/contentFormat.ts';
import { can, describeRole } from '@/lib/contentPermissions.ts';
import type { ContentBreakerMode, ContentSettings } from '@/lib/contentTypes.ts';
import { cn } from '@/lib/utils';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentPageHeader } from '../shell/ContentPageHeader';

// ============================================================
// 常數與小工具
// ============================================================

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen（建議）' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite（最省）' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash（舊版穩定）' },
];

const MODEL_DESCRIPTION: Record<string, string> = {
  'gemini-4-hydrogen': 'Gemini 4 的日常型號，速度和成本適合文章生成。',
  'gemini-2.5-flash-lite': '速度最快、成本最低，適合大量短篇或初稿。',
  'gemini-2.0-flash': '上一代模型，穩定但長文的 SEO 細節較弱。',
};

const BREAKER_OPTIONS: { value: ContentBreakerMode; label: string; description: string }[] = [
  {
    value: 'full',
    label: '完整生成（full）',
    description: 'LLM 全文、SEO 評分與配圖全部執行；預設值，品質最好。',
  },
  {
    value: 'single_score',
    label: '單次評分（single_score）',
    description: '降一級：只做一次 SEO 評分，跳過重複評分呼叫以節省 token。',
  },
  {
    value: 'vector_only',
    label: '只用圖卡（vector_only）',
    description: '再降一級：配圖只產 SVG 圖卡，不呼叫外部模型／抓取。',
  },
  {
    value: 'fetch_only',
    label: '只抓取（fetch_only）',
    description: '最低一級：只抓取與排程資料，不呼叫 LLM（額度用盡時的最後一級）。',
  },
];

interface EditableSettings {
  model: string;
  daily_article_limit: number;
  daily_llm_call_limit: number;
  breaker_mode: ContentBreakerMode;
  digest_enabled: boolean;
  digest_time: string;
  digest_recipients: string[];
}

function clampInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(999_999, Math.max(0, Math.floor(parsed)));
}

function toEditable(settings: ContentSettings): EditableSettings {
  return {
    model: MODEL_OPTIONS.some((option) => option.value === settings.model)
      ? settings.model
      : MODEL_OPTIONS[0].value,
    daily_article_limit: clampInt(settings.daily_article_limit),
    daily_llm_call_limit: clampInt(settings.daily_llm_call_limit),
    breaker_mode: BREAKER_OPTIONS.some((option) => option.value === settings.breaker_mode)
      ? settings.breaker_mode
      : 'full',
    digest_enabled: Boolean(settings.digest_enabled),
    digest_time: isValidDigestTime(settings.digest_time) ? settings.digest_time : '09:00',
    digest_recipients: normalizeRecipients(settings.digest_recipients),
  };
}

/** 比較草稿／設定用；收件人排序後比較，避免順序造成假 dirty */
function editableFingerprint(value: EditableSettings): string {
  return JSON.stringify({
    ...value,
    digest_recipients: [...value.digest_recipients]
      .map((email) => email.toLowerCase())
      .sort(),
  });
}

function modelPriceLabel(model: string): string {
  const price = LLM_PRICING[model];
  if (!price) return '牌價未設定，成本估算會以預設模型計算。';
  return `牌價：輸入 US$${price.input.toFixed(2)} / 輸出 US$${price.output.toFixed(2)}（每 100 萬 tokens，估算用）`;
}

// ============================================================
// 版面小元件
// ============================================================

function SectionCard({
  icon: Icon,
  title,
  description,
  tone = 'default',
  children,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border bg-white shadow-card',
        tone === 'danger' ? 'border-rose-200' : 'border-[rgba(13,26,45,0.08)]',
      )}
    >
      <header className="flex items-start gap-2.5 border-b border-[rgba(13,26,45,0.06)] px-5 py-3.5">
        <Icon
          size={15}
          strokeWidth={1.9}
          className={cn('mt-0.5 shrink-0', tone === 'danger' ? 'text-rose-600' : 'text-teal-600')}
        />
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold text-[#0d1a2d]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-[12px] font-medium text-muted-foreground">
      {children}
    </Label>
  );
}

/** 今日用量／上限／剩餘（HKT 當日；計數以 content_llm_usage 與 content_articles 為準） */
function UsageMeter({
  label,
  used,
  limit,
  loading,
  error,
  zeroHint,
}: {
  label: string;
  used: number;
  limit: number;
  loading: boolean;
  error: string | null;
  zeroHint: string;
}) {
  const hasLimit = limit > 0;
  const over = hasLimit && used > limit;
  const near = hasLimit && !over && used / limit >= 0.8;
  const remaining = Math.max(0, limit - used);
  const percent = hasLimit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        {loading ? (
          <span className="text-[12px] text-muted-foreground">讀取中…</span>
        ) : (
          <span
            className={cn(
              'text-[13px] font-bold tabular-nums',
              over ? 'text-rose-600' : near ? 'text-amber-600' : 'text-[#0d1a2d]',
            )}
          >
            今日 {formatNumber(used)} / 上限 {formatNumber(limit)}
          </span>
        )}
      </div>

      {!hasLimit ? (
        loading ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">讀取中…</p>
        ) : (
          <p className="mt-1.5 text-[12px] leading-relaxed text-amber-700">{zeroHint}</p>
        )
      ) : (
        <>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                over ? 'bg-rose-500' : near ? 'bg-amber-500' : 'bg-teal-600',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {error
              ? `今日用量讀取失敗（${error}），以上為現有值。`
              : over
                ? `已超出 ${formatNumber(used - limit)}；剩餘 job 會順延至次日 00:05。`
                : `剩餘 ${formatNumber(remaining)}`}
          </p>
        </>
      )}
    </div>
  );
}

// ============================================================
// 頁面
// ============================================================

export function ContentSettingsView({ navigate }: ContentViewProps) {
  const { systemUser } = useAuth();
  const canManage = can({ role: systemUser?.role }, 'manage_settings');

  const { settings, loading, error, missingSchema, refresh, save } = useContentSettings();
  const today = useContentUsageToday();
  const { recipients: staffRecipients, loading: staffLoading } = useStaffEmailRecipients();

  const [draft, setDraft] = useState<EditableSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [staffQuery, setStaffQuery] = useState('');
  const [selectedStaffEmails, setSelectedStaffEmails] = useState<Set<string>>(new Set());
  const [externalEmail, setExternalEmail] = useState('');

  // 設定載入（或儲存後 refresh）時同步草稿：
  // 只有「草稿目前等於舊設定」才跟隨新設定，避免蓋掉尚未保存的修改。
  useEffect(() => {
    if (!settings) return;
    const next = toEditable(settings);
    setDraft((current) =>
      current && editableFingerprint(current) !== editableFingerprint(next) ? current : next,
    );
  }, [settings]);

  const baseline = useMemo(() => (settings ? toEditable(settings) : null), [settings]);
  const dirty = Boolean(draft && baseline && editableFingerprint(draft) !== editableFingerprint(baseline));
  const invalidEmails = useMemo(
    () => (draft ? invalidRecipients(draft.digest_recipients) : []),
    [draft],
  );
  const digestTimeValid = !draft || isValidDigestTime(draft.digest_time);
  const enablingGeneration = Boolean(
    draft && baseline && baseline.daily_article_limit === 0 && draft.daily_article_limit > 0,
  );

  const staffNameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const recipient of staffRecipients) {
      map.set(recipient.email.trim().toLowerCase(), recipient.name);
    }
    return map;
  }, [staffRecipients]);

  const update = (patch: Partial<EditableSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const onLimitChange = (key: 'daily_article_limit' | 'daily_llm_call_limit', raw: string) => {
    const digits = raw.replace(/[^\d]/g, '').slice(0, 6);
    const value = digits ? Math.min(999_999, Number(digits)) : 0;
    update(
      key === 'daily_article_limit'
        ? { daily_article_limit: value }
        : { daily_llm_call_limit: value },
    );
  };

  const addExternalEmail = () => {
    if (!draft) return;
    const [valid] = normalizeRecipients([externalEmail]);
    if (!valid) {
      toast.error('電郵格式不正確', { description: '請輸入類似 name@example.com 的地址。' });
      return;
    }
    if (draft.digest_recipients.some((email) => email.toLowerCase() === valid.toLowerCase())) {
      toast.error('這位收件人已在清單中');
      return;
    }
    update({ digest_recipients: normalizeRecipients([...draft.digest_recipients, valid]) });
    setExternalEmail('');
  };

  const removeRecipient = (email: string) => {
    if (!draft) return;
    const key = email.trim().toLowerCase();
    update({
      digest_recipients: draft.digest_recipients.filter((item) => item.toLowerCase() !== key),
    });
  };

  const openStaffDialog = () => {
    if (!draft) return;
    const current = new Set(draft.digest_recipients.map((email) => email.toLowerCase()));
    setSelectedStaffEmails(
      new Set(
        staffRecipients
          .filter((recipient) => current.has(recipient.email.trim().toLowerCase()))
          .map((recipient) => recipient.email.trim().toLowerCase()),
      ),
    );
    setStaffQuery('');
    setStaffDialogOpen(true);
  };

  const toggleStaffEmail = (emailKey: string) => {
    setSelectedStaffEmails((previous) => {
      const next = new Set(previous);
      if (next.has(emailKey)) next.delete(emailKey);
      else next.add(emailKey);
      return next;
    });
  };

  const applyStaffSelection = () => {
    if (!draft) return;
    const staffEmailSet = new Set(staffRecipients.map((row) => row.email.trim().toLowerCase()));
    // 非員工的外部電郵原樣保留，避免套用名單時被清掉
    const external = draft.digest_recipients.filter(
      (email) => !staffEmailSet.has(email.toLowerCase()),
    );
    const selected = staffRecipients
      .filter((row) => selectedStaffEmails.has(row.email.trim().toLowerCase()))
      .map((row) => row.email);
    update({ digest_recipients: normalizeRecipients([...external, ...selected]) });
    setStaffDialogOpen(false);
  };

  const handleSave = async () => {
    if (!draft || !baseline || !canManage) return;
    const invalid = invalidRecipients(draft.digest_recipients);
    if (invalid.length > 0) {
      toast.error('有無效的收件人電郵', { description: invalid.join('、') });
      return;
    }
    if (!isValidDigestTime(draft.digest_time)) {
      toast.error('日報時間格式不正確', { description: '請使用 HH:mm（00:00–23:59）。' });
      return;
    }
    if (draft.digest_enabled && normalizeRecipients(draft.digest_recipients).length === 0) {
      toast.error('啟用日報前請至少加入一位收件人');
      return;
    }

    setSaving(true);
    try {
      await save({
        model: draft.model,
        daily_article_limit: clampInt(draft.daily_article_limit),
        daily_llm_call_limit: clampInt(draft.daily_llm_call_limit),
        breaker_mode: draft.breaker_mode,
        digest_enabled: draft.digest_enabled,
        digest_time: draft.digest_time.trim(),
        digest_recipients: normalizeRecipients(draft.digest_recipients),
      });
    } catch {
      // hook 已顯示錯誤 toast；保留草稿讓使用者修正後再存。
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = saving ? '儲存中…' : enablingGeneration ? '啟用自動生成並儲存' : '儲存設定';

  return (
    <div className="space-y-5">
      <ContentPageHeader
        eyebrow={
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
            SEO · 全域設定
          </span>
        }
        title="內容自動化 · 設定"
        subtitle="模型、每日上限、熔斷與每日日報。儲存後即時生效；出廠每日篇數上限為 0（不自動生成），需由人明確開啟。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground"
              onClick={() => void refresh()}
              disabled={loading || saving}
              title="重新載入設定"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
              重新載入
            </Button>
            {canManage && dirty && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft(baseline)}
                disabled={saving}
              >
                取消變更
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={!dirty || saving || !digestTimeValid || missingSchema}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saveLabel}
              </Button>
            )}
          </div>
        }
      />

      {!canManage && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <p>
            目前角色為「{describeRole(systemUser?.role)}」，只能檢視全域設定。修改模型、每日上限、熔斷與日報需要管理層權限。
          </p>
        </div>
      )}

      {error && settings && (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-rose-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p>重新載入設定時發生錯誤：{error}。畫面上是目前已知的設定值，儲存前請先確認。</p>
        </div>
      )}

      {missingSchema ? (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="content_settings 資料表還沒建立（Postgres 42P01）。請先執行本次 migration，再回到本頁重新載入。"
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新檢查
            </Button>
          }
        />
      ) : loading && !draft ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-44 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card"
            />
          ))}
        </div>
      ) : error && !settings ? (
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="讀取設定失敗"
          description={error}
          action={
            <Button size="sm" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              再試一次
            </Button>
          }
        />
      ) : !draft ? (
        <ContentEmptyState
          title="沒有可顯示的設定"
          description="請重新載入；若問題持續，確認 content_settings 的 id = default 資料列是否存在。"
          action={
            <Button size="sm" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新載入
            </Button>
          }
        />
      ) : (
        <>
          {/* 1. 生成模型 */}
          <SectionCard
            icon={Sparkles}
            title="生成模型"
            description="所有站點的自動生成共用這個模型；成本與品質取捨見右側牌價說明。"
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-start">
              <div className="space-y-1.5">
                <FieldLabel>模型</FieldLabel>
                <Select
                  value={draft.model}
                  onValueChange={(value) => update({ model: value })}
                  disabled={!canManage || saving}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="選擇模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[13px]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-[#0d1a2d]">
                  {MODEL_DESCRIPTION[draft.model] || '—'}
                </p>
                <p className="mt-1">{modelPriceLabel(draft.model)}</p>
                <p className="mt-1">實際費用依 Google 帳單；本頁與用量頁的成本都是估算。</p>
              </div>
            </div>
          </SectionCard>

          {/* 2. 每日上限 */}
          <SectionCard
            icon={Gauge}
            title="每日上限"
            description="控制每日自動生成量；達到上限後剩餘 job 會順延至次日 00:05，slot 轉 held 並在日報標示「額度不足」（PRD §12）。"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="content-daily-article-limit">
                  每日生成篇數上限（daily_article_limit）
                </FieldLabel>
                <Input
                  id="content-daily-article-limit"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={draft.daily_article_limit}
                  onChange={(event) => onLimitChange('daily_article_limit', event.target.value)}
                  disabled={!canManage || saving}
                  className="h-9 text-[13px] tabular-nums"
                />
                <p className="text-[11.5px] text-muted-foreground">
                  出廠 0 = 不自動生成；設定為 0 不會刪除任何既有文章。
                </p>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="content-daily-llm-call-limit">
                  每日 LLM 呼叫上限（daily_llm_call_limit）
                </FieldLabel>
                <Input
                  id="content-daily-llm-call-limit"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={draft.daily_llm_call_limit}
                  onChange={(event) => onLimitChange('daily_llm_call_limit', event.target.value)}
                  disabled={!canManage || saving}
                  className="h-9 text-[13px] tabular-nums"
                />
                <p className="text-[11.5px] text-muted-foreground">
                  以 content_llm_usage 的呼叫數計；0 = 完全不呼叫 LLM。
                </p>
              </div>
            </div>

            {draft.daily_article_limit === 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <p>
                  <strong>0 = 不自動生成（目前關閉）。</strong>
                  裝好不等於開跑：目前沒有自動生成配額。要用免費層跑，可套用建議上限（
                  {RECOMMENDED_DAILY_ARTICLE_LIMIT} 篇 / {RECOMMENDED_DAILY_LLM_CALL_LIMIT}{' '}
                  次），或自行輸入大於 0 的數字後按「儲存設定」。
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  update({
                    daily_article_limit: RECOMMENDED_DAILY_ARTICLE_LIMIT,
                    daily_llm_call_limit: RECOMMENDED_DAILY_LLM_CALL_LIMIT,
                  })
                }
                disabled={!canManage || saving}
              >
                套用建議免費層上限（{RECOMMENDED_DAILY_ARTICLE_LIMIT} 篇 /{' '}
                {RECOMMENDED_DAILY_LLM_CALL_LIMIT} 次）
              </Button>
              <span className="text-[11.5px] text-muted-foreground">
                建議值來自 PRD 假設 A5，可按實際額度調整。
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <UsageMeter
                label="今日 LLM 呼叫"
                used={today.calls}
                limit={draft.daily_llm_call_limit}
                loading={today.loading}
                error={today.error}
                zeroHint="上限 0 = 不呼叫 LLM，自動生成不會執行。"
              />
              <UsageMeter
                label="今日生成篇數"
                used={today.articles}
                limit={draft.daily_article_limit}
                loading={today.loading}
                error={today.error}
                zeroHint="上限 0 = 不自動生成（出廠預設）。"
              />
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              計數以 content_llm_usage 為準、香港時間當日 00:00 起算；文章數另查 content_articles。
            </p>
          </SectionCard>

          {/* 3. 熔斷 */}
          <SectionCard
            icon={ShieldAlert}
            title="熔斷（breaker_mode）"
            description="成本／錯誤時的降級階梯：full → single_score → vector_only → fetch_only。設定值即時生效，實際判定由 worker 執行。"
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-start">
              <div className="space-y-1.5">
                <FieldLabel>熔斷模式</FieldLabel>
                <Select
                  value={draft.breaker_mode}
                  onValueChange={(value) => update({ breaker_mode: value as ContentBreakerMode })}
                  disabled={!canManage || saving}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="選擇熔斷模式" />
                  </SelectTrigger>
                  <SelectContent>
                    {BREAKER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-[13px]">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] px-3.5 py-2.5">
                {BREAKER_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        draft.breaker_mode === option.value ? 'bg-teal-600' : 'bg-slate-300',
                      )}
                    />
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      <span
                        className={cn(
                          'font-semibold',
                          draft.breaker_mode === option.value
                            ? 'text-teal-800'
                            : 'text-[#0d1a2d]',
                        )}
                      >
                        {option.label}
                      </span>
                      ／{option.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* 4. 每日日報 */}
          <SectionCard
            icon={Mail}
            title="每日日報"
            description="每天在指定時間（香港時間）寄出營運摘要給指定同事；未設定 Resend 時仍可在「每日日報」頁預覽與查看歷史 HTML。"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#0d1a2d]">自動寄送日報</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {draft.digest_enabled
                    ? '已啟用：每天按設定時間寄出；寄送失敗會保留 HTML 並可重寄。'
                    : '未啟用：不會自動寄送，仍可到「每日日報」手動寄送、測試寄送或預覽。'}
                </p>
              </div>
              <Switch
                checked={draft.digest_enabled}
                onCheckedChange={(checked) => update({ digest_enabled: checked })}
                disabled={!canManage || saving}
                aria-label="啟用每日日報"
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)] md:items-start">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="content-digest-time">寄送時間（HKT）</FieldLabel>
                <Input
                  id="content-digest-time"
                  type="time"
                  value={draft.digest_time}
                  onChange={(event) => update({ digest_time: event.target.value })}
                  disabled={!canManage || saving}
                  className="h-9 w-[150px] text-[13px] tabular-nums"
                />
                {!digestTimeValid && (
                  <p className="text-[11.5px] text-rose-600">格式需為 HH:mm（00:00–23:59）</p>
                )}
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  預設 09:00；由 pg_cron 的 content-digest tick 觸發。
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FieldLabel>收件人（{draft.digest_recipients.length}）</FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11.5px]"
                    onClick={openStaffDialog}
                    disabled={!canManage || saving}
                  >
                    <Users size={13} />
                    從員工挑選
                  </Button>
                </div>

                {draft.digest_recipients.length === 0 ? (
                  <p className="rounded-md border border-dashed border-[rgba(13,26,45,0.14)] px-3 py-2.5 text-[12px] text-muted-foreground">
                    尚未加入收件人；啟用日報前至少要有一位。
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.digest_recipients.map((email) => {
                      const staffName = staffNameByEmail.get(email.toLowerCase());
                      return (
                        <span
                          key={email}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[rgba(13,26,45,0.12)] bg-white px-2 py-1 text-[12px]"
                        >
                          {staffName && (
                            <span className="font-medium text-[#0d1a2d]">{staffName}</span>
                          )}
                          <span className="truncate text-muted-foreground">{email}</span>
                          {canManage && (
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground transition-colors hover:text-rose-600"
                              onClick={() => removeRecipient(email)}
                              aria-label={`移除 ${email}`}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {invalidEmails.length > 0 && (
                  <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    以下電郵格式無效，儲存前請移除：{invalidEmails.join('、')}
                  </p>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <FieldLabel htmlFor="content-digest-external-email">加入外部電郵</FieldLabel>
                    <Input
                      id="content-digest-external-email"
                      type="email"
                      value={externalEmail}
                      onChange={(event) => setExternalEmail(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addExternalEmail();
                        }
                      }}
                      placeholder="name@example.com"
                      disabled={!canManage || saving}
                      className="h-9 text-[13px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addExternalEmail}
                    disabled={!canManage || saving || !externalEmail.trim()}
                  >
                    <Plus size={13} />
                    加入
                  </Button>
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  員工名單來自 staffs.work_email（在職者）；外部電郵請逐個加入並確認格式。
                </p>
              </div>
            </div>

            <div className="mt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-teal-700"
                onClick={() => navigate('seo', 'digest')}
              >
                <Mail size={13} />
                到「每日日報」預覽／測試寄送
              </Button>
            </div>
          </SectionCard>

          {/* 5. 危險區（只說明，不提供刪除按鈕） */}
          <SectionCard
            icon={ShieldAlert}
            tone="danger"
            title="危險區（回滾語義）"
            description="這裡只有說明，不提供刪除資料的按鈕；任何回滾都先做 L1，確認不夠再往下。"
          >
            <ol className="space-y-2.5 text-[12.5px] leading-relaxed text-[#0d1a2d]">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                  L1
                </span>
                <span>
                  <strong>隱藏入口</strong>：從 AppContext 移除 social-automation 子項並重新部署前端。資料與函式全保留，零資料損失。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-700">
                  L2
                </span>
                <span>
                  <strong>停止生成</strong>：把「每日生成篇數上限」設為 0、關閉自動日報（就是上方這組設定）。只影響插件；已排程 slot 會轉 held。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
                  L3
                </span>
                <span>
                  <strong>停用排程</strong>：由管理者在資料庫逐一 cron.unschedule 四支 content-* 排程。只停插件排程，既有 job 不動。
                </span>
              </li>
              <li className="flex items-start gap-2 text-muted-foreground">
                <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
                  L4
                </span>
                <span>
                  完整移除（drop 資料表）不在本頁提供；需先備份、逐表確認，由工程師執行。本頁永遠不會提供「刪除全部資料」按鈕。
                </span>
              </li>
            </ol>
          </SectionCard>
        </>
      )}

      {/* 員工多選 dialog */}
      <CrudModal
        isOpen={staffDialogOpen}
        onClose={() => setStaffDialogOpen(false)}
        title="從員工名單挑選日報收件人"
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              已選 {selectedStaffEmails.size} 位；外部電郵會保留。
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStaffDialogOpen(false)}>
                取消
              </Button>
              <Button size="sm" onClick={applyStaffSelection}>
                套用
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            value={staffQuery}
            onChange={(event) => setStaffQuery(event.target.value)}
            placeholder="搜尋姓名或電郵…"
            className="h-9 text-[13px]"
          />
          {staffLoading ? (
            <p className="text-[13px] text-muted-foreground">載入員工名單…</p>
          ) : staffRecipients.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              沒有可用的員工電郵。請確認 staffs.work_email 已填寫且在職。
            </p>
          ) : (
            (() => {
              const q = staffQuery.trim().toLowerCase();
              const visible = q
                ? staffRecipients.filter(
                    (row) =>
                      row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q),
                  )
                : staffRecipients;
              if (visible.length === 0) {
                return <p className="text-[13px] text-muted-foreground">沒有符合的員工。</p>;
              }
              return (
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {visible.map((row) => {
                    const key = row.email.trim().toLowerCase();
                    const checked = selectedStaffEmails.has(key);
                    return (
                      <div
                        key={row.id || row.email}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleStaffEmail(key)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleStaffEmail(key);
                          }
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                          checked
                            ? 'border-teal-200 bg-teal-50/60'
                            : 'border-border hover:bg-muted/40',
                        )}
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{row.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {row.email}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      </CrudModal>
    </div>
  );
}
