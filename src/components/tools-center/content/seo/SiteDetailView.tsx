/**
 * 站點詳情（M1-10、PRD §8.2.2、§9.1）
 *
 * 5 個分頁：設定／欄目／關鍵字／文章／健康。
 *   - 設定：tier/adapter/publish_mode/locale/timezone/status/notes、cadence 摘要、
 *           憑證（只顯示 fingerprint）、SEO 預設（內嵌 SeoDefaultsForm）
 *   - 欄目：新增／編輯／刪除（slug 全站唯一由後端把關）
 *   - 關鍵字：數量摘要 + 前 20 筆，可跳轉關鍵字庫
 *   - 文章：最近 20 篇，點擊進審核工作室
 *   - 健康：health／last_verified_at、檢查時間軸、測試連線入口
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutList,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
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
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  SITE_HEALTH_LABEL,
  TIER_LABEL,
  TIER_OPTION_LABEL,
  publishStage,
} from '@/lib/contentState';
import {
  BEAUTY100_CREDENTIAL_TEMPLATE,
  beauty100CategoryForSection,
} from '@/lib/contentBeauty100';
import {
  cadenceSummary,
  normalizeCadence,
  validateCadence,
} from '@/lib/contentPlanner';
import {
  domainFromUrl,
  formatZoneDateTime,
  formatZoneDate,
  suggestSectionSlug,
  truncateText,
} from '@/lib/contentFormat';
import { contentErrorMessage } from '@/lib/contentApi';
import {
  CONTENT_NOT_ENABLED_MESSAGE,
  type ContentArticleStatus,
  type ContentCadence,
  type ContentConnectionTestResult,
  type ContentCredentialKind,
  type ContentCredentialMeta,
  type ContentKeyword,
  type ContentPublishMode,
  type ContentSectionType,
  type ContentSiteCheck,
  type ContentSitePage,
  type ContentSiteSection,
  type ContentSiteStatus,
  type ContentSiteWithProfile,
  type ContentTier,
  type ContentAdapterName,
} from '@/lib/contentTypes';
import type { ContentViewProps } from '@/lib/contentNavigation';
import {
  CHECK_KIND_LABEL,
  CREDENTIAL_KIND_OPTIONS,
  LOCALE_OPTIONS,
  PUBLISH_MODE_OPTIONS,
  SECTION_TYPE_OPTIONS,
  SITE_STATUS_OPTIONS,
  TIMEZONE_OPTIONS,
  TIER_OPTIONS,
  ADAPTER_OPTIONS,
  WEEKDAY_OPTIONS,
  clearCredential,
  deleteSection,
  fetchSiteArticles,
  fetchSiteKeywords,
  runConnectionTest,
  removeSite,
  saveCredential,
  saveSite,
  setSiteStatus,
  siteDisplayName,
  upsertSection,
  useContentSite,
  type SiteArticleRow,
  type SiteKeywordSummary,
} from '@/hooks/useContentSites';
import { SeoDefaultsForm } from './SeoDefaultsForm';

// ============================================================
// 共用小元件
// ============================================================

const TAB_ITEMS = [
  { value: 'settings', label: '設定', icon: Settings2 },
  { value: 'sections', label: '欄目', icon: LayoutList },
  { value: 'keywords', label: '關鍵字', icon: KeyRound },
  { value: 'articles', label: '文章', icon: FileText },
  { value: 'health', label: '健康', icon: Activity },
] as const;

type DetailTab = (typeof TAB_ITEMS)[number]['value'];

const CREDENTIAL_STATUS_LABEL: Record<ContentCredentialMeta['status'], string> = {
  active: '已驗證',
  invalid: '驗證失敗',
  untested: '未測試',
};

const SITE_STATUS_LABEL: Record<ContentSiteStatus, string> = {
  active: '啟用中',
  paused: '已暫停',
  archived: '已歸檔',
};

const ARTICLE_STATUS_OPTIONS: readonly ContentArticleStatus[] = [
  'draft',
  'pending_review',
  'changes_requested',
  'held',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'updating',
  'publish_failed',
  'verify_failed',
  'cancelled',
  'manual_done',
  'draft_published',
];

interface SectionCounts {
  total: number;
  article: number;
  post: number;
  page: number;
}

function countSections(sections: ContentSiteSection[]): SectionCounts {
  const counts: SectionCounts = { total: sections.length, article: 0, post: 0, page: 0 };
  for (const section of sections) counts[section.content_type] += 1;
  return counts;
}

function describeCheck(check: ContentSiteCheck): string {
  const detail = check.detail ?? {};
  const error = typeof detail.error === 'string' ? detail.error : null;
  const adapterChecks = Array.isArray(detail.checks)
    ? (detail.checks as Array<{ label?: unknown; ok?: unknown; detail?: unknown }>)
    : null;
  if (check.kind === 'adapter') {
    if (detail.skipped) return '已略過（手動模式或沿用既有憑證檢查）';
    if (Array.isArray(detail.expected_kinds) && detail.expected_kinds.length > 0) {
      return `尚未設定 ${detail.expected_kinds.join('／')} 憑證`;
    }
    if (typeof detail.publish_mode === 'string' && !adapterChecks) {
      return `不支援 ${detail.publish_mode} 模式`;
    }
    if (adapterChecks) {
      const failed = adapterChecks.filter((item) => item.ok !== true);
      if (failed.length > 0) {
        return `失敗：${failed
          .map((item) => (typeof item.label === 'string' ? item.label : '未知項目'))
          .join('、')}`;
      }
      return `${adapterChecks.length} 項連接檢查通過`;
    }
  }
  if (!check.ok) {
    if (Array.isArray(detail.missing) && detail.missing.length > 0) {
      return `缺少：${detail.missing.join('、')}`;
    }
    if (typeof detail.status === 'number') {
      return `HTTP ${detail.status}${error ? `（${error}）` : ''}`;
    }
    if (error) return `錯誤：${error}`;
    if (detail.skipped) return '已略過（前一步失敗）';
    return '檢查未通過';
  }
  if (check.kind === 'domain' && typeof detail.status === 'number') {
    return `HTTP ${detail.status}`;
  }
  if (check.kind === 'sitemap' && typeof detail.url_count === 'number') {
    return `網站地圖可用（${detail.url_count} 個頁面）`;
  }
  if (check.kind === 'credential') {
    if (detail.configured === false) return '未設定憑證（手動貼上可略）';
    if (Array.isArray(detail.verified) && detail.verified.length > 0) {
      return `已確認 ${detail.verified.length} 筆憑證可用`;
    }
  }
  return '通過';
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

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '確認',
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SEO 預設入口（內嵌 SeoDefaultsForm）
// ============================================================

function SeoDefaultsCard({
  site,
  canManageSites,
  onSaved,
}: {
  site: ContentSiteWithProfile;
  canManageSites: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const defaults = site.seo_defaults;

  return (
    <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Sparkles size={14} className="text-teal-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">SEO 預設</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            title／meta／slug／canonical／JSON-LD／字數內鏈／categoryMap；右側即時預覽「這篇將送出的內容」。
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600 sm:inline">
            {defaults.titleTemplate || '（未設定模板）'}
          </span>
          <Button size="sm" variant={open ? 'outline' : 'default'} onClick={() => setOpen((prev) => !prev)}>
            {open ? '收起 SEO 預設' : '展開 SEO 預設'}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[rgba(13,26,45,0.08)] px-4 py-3.5">
          <SeoDefaultsForm
            site={site}
            disabled={!canManageSites}
            onSaved={async () => {
              await onSaved();
            }}
          />
        </div>
      )}
    </section>
  );
}

// ============================================================
// 憑證區塊
// ============================================================

function CredentialsCard({
  site,
  credentials,
  canManageSites,
  onRefresh,
}: {
  site: ContentSiteWithProfile;
  credentials: ContentCredentialMeta[];
  canManageSites: boolean;
  onRefresh: () => Promise<void>;
}) {
  const siteId = site.website_profile_id;
  const isBeauty100 = site.adapter === 'beauty100';
  const [kind, setKind] = useState<ContentCredentialKind>(
    isBeauty100 ? 'beauty100_admin' : 'http_bearer',
  );
  const [secret, setSecret] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingClear, setPendingClear] = useState<ContentCredentialKind | null>(null);
  const [clearing, setClearing] = useState(false);
  const [lastSaved, setLastSaved] = useState<ContentCredentialMeta | null>(null);

  // 站點切到 Beauty100 時，預設用它的 JSON 憑證；使用者仍可手動改。
  useEffect(() => {
    setKind(isBeauty100 ? 'beauty100_admin' : 'http_bearer');
  }, [isBeauty100]);

  const handleSave = async () => {
    if (!canManageSites) {
      toast.error('沒有管理憑證的權限');
      return;
    }
    if (!secret.trim()) {
      toast.error('請先貼上憑證內容');
      return;
    }
    setSaving(true);
    try {
      const meta = await saveCredential(
        siteId,
        kind,
        secret,
        expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      );
      setLastSaved(meta);
      setSecret('');
      setExpiresAt('');
      toast.success('憑證已加密儲存', {
        description: meta?.fingerprint
          ? `指紋 ${meta.fingerprint}；測試連線後會標記為已驗證。`
          : '測試連線後會標記為已驗證。',
      });
      await onRefresh();
    } catch (thrown) {
      toast.error('憑證儲存失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!pendingClear) return;
    setClearing(true);
    try {
      await clearCredential(siteId, pendingClear);
      if (lastSaved?.kind === pendingClear) setLastSaved(null);
      toast.success('已清除憑證');
      setPendingClear(null);
      await onRefresh();
    } catch (thrown) {
      toast.error('清除憑證失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setClearing(false);
    }
  };

  const pendingLabel = pendingClear
    ? CREDENTIAL_KIND_OPTIONS.find((option) => option.value === pendingClear)?.label ?? pendingClear
    : '';

  return (
    <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
      <header className="mb-3 flex items-center gap-2">
        <Lock size={14} className="text-teal-600" />
        <div>
          <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">憑證</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            明文只在 Edge Function 內加密（AES-256-GCM），前端永不保存；儲存後只會看到末 4 碼指紋與到期日。
          </p>
        </div>
      </header>

      {credentials.length > 0 ? (
        <ul className="mb-3 divide-y divide-[rgba(13,26,45,0.08)] rounded-md border border-[rgba(13,26,45,0.08)]">
          {credentials.map((credential) => {
            const label =
              CREDENTIAL_KIND_OPTIONS.find((option) => option.value === credential.kind)?.label ??
              credential.kind;
            return (
              <li
                key={credential.kind}
                className="flex flex-wrap items-center gap-2 px-2.5 py-2 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-[#0d1a2d]">
                  {label}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                  {credential.fingerprint ? `•••• ${credential.fingerprint}` : '無指紋'}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10.5px] font-semibold',
                    credential.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : credential.status === 'invalid'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {CREDENTIAL_STATUS_LABEL[credential.status]}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {credential.expires_at
                    ? `到期 ${formatZoneDate(credential.expires_at, site.timezone)}`
                    : '無到期日'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  disabled={!canManageSites}
                  onClick={() => setPendingClear(credential.kind)}
                >
                  清除
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mb-3 rounded-md border border-dashed border-[rgba(13,26,45,0.12)] px-3 py-2 text-[11.5px] text-muted-foreground">
          尚未設定憑證。手動貼上的站點可略過；需要自動發佈到網站才要填。
        </p>
      )}

      {lastSaved && lastSaved.fingerprint && (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-[11.5px] text-emerald-800">
          剛儲存：{CREDENTIAL_KIND_OPTIONS.find((option) => option.value === lastSaved.kind)?.label} ·
          指紋 {lastSaved.fingerprint}
          {lastSaved.expires_at ? ` · 到期 ${formatZoneDate(lastSaved.expires_at, site.timezone)}` : ''}
        </p>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="憑證類型">
          <Select
            value={kind}
            onValueChange={(value) => setKind(value as ContentCredentialKind)}
            disabled={!canManageSites}
          >
            <SelectTrigger className="h-9 bg-white text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CREDENTIAL_KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="到期日（可選）">
          <Input
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            disabled={!canManageSites}
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field
          label="憑證內容"
          hint={
            kind === 'beauty100_admin'
              ? '貼上 Beauty100 專用 staff 帳號的 JSON；內容只會加密送到後端，不會顯示或存進瀏覽器'
              : '只會加密送到後端，不會顯示在畫面上，也不會存進瀏覽器'
          }
          className="sm:col-span-2"
        >
          <div className="space-y-2">
            {kind === 'beauty100_admin' ? (
              <>
                <Textarea
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={BEAUTY100_CREDENTIAL_TEMPLATE}
                  disabled={!canManageSites}
                  className="min-h-[150px] bg-white font-mono text-[11.5px] leading-relaxed"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  帳號必須是 Beauty100 的 admin／marketing；JWT 只用來寫 `blog_articles` 與上傳封面。
                  若這個帳號停用或改密碼，請回來重存憑證。
                </p>
              </>
            ) : (
              <Input
                type="password"
                autoComplete="new-password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="貼上 token／應用程式密碼"
                disabled={!canManageSites}
                className="h-9 bg-white font-mono text-[12.5px]"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {kind === 'beauty100_admin' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 gap-1.5"
                  onClick={() => setSecret(BEAUTY100_CREDENTIAL_TEMPLATE)}
                  disabled={!canManageSites}
                >
                  <FileText size={13} />
                  貼上 JSON 範本
                </Button>
              )}
              <Button
                size="sm"
                className="ml-auto h-9 shrink-0 gap-1.5"
                onClick={() => void handleSave()}
                disabled={!canManageSites || saving || !secret.trim()}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                儲存憑證
              </Button>
            </div>
          </div>
        </Field>
      </div>

      <ConfirmDialog
        open={Boolean(pendingClear)}
        title="清除這筆憑證？"
        description={
          <>
            將刪除「{pendingLabel}」的密文。之後需要重新貼上才能通過憑證檢查；既有文章與排程不會被刪除。
          </>
        }
        confirmLabel="清除憑證"
        busy={clearing}
        onClose={() => setPendingClear(null)}
        onConfirm={() => void handleClear()}
      />
    </section>
  );
}

// ============================================================
// 設定分頁
// ============================================================

interface SettingsDraft {
  tier: ContentTier;
  adapter: ContentAdapterName;
  publish_mode: ContentPublishMode;
  locale: string;
  timezone: string;
  status: ContentSiteStatus;
  notes: string;
}

function toSettingsDraft(site: ContentSiteWithProfile): SettingsDraft {
  return {
    tier: site.tier,
    adapter: site.adapter,
    publish_mode: site.publish_mode,
    locale: site.locale,
    timezone: site.timezone,
    status: site.status,
    notes: site.notes ?? '',
  };
}

function looksLikeBeauty100Site(site: ContentSiteWithProfile): boolean {
  if (site.adapter === 'beauty100') return true;
  const haystack = `${site.profile?.website_name ?? ''} ${site.profile?.domain_url ?? ''}`.toLowerCase();
  return haystack.includes('beauty100');
}

/**
 * Beauty100 連接摘要：讓營運一眼看到「有沒有接好、發到哪個分類、憑證是否可用」。
 * 真正的細節（adapter checks）在健康分頁；這裡只放最關鍵的狀態與入口。
 */
function Beauty100ConnectionCard({
  site,
  sections,
  credentials,
  testing,
  onTest,
}: {
  site: ContentSiteWithProfile;
  sections: ContentSiteSection[];
  credentials: ContentCredentialMeta[];
  testing: boolean;
  onTest: () => void;
}) {
  const credential = credentials.find((item) => item.kind === 'beauty100_admin');
  const configured = site.adapter === 'beauty100';
  const firstSection = sections[0] ?? null;
  const externalId = (firstSection?.external_id ?? '').trim();
  const category = beauty100CategoryForSection(firstSection);
  const domain = site.profile?.domain_url?.trim() || '';
  const liveHref = domain
    ? /^https?:\/\//i.test(domain)
      ? domain
      : `https://${domain}`
    : null;

  const status = !configured
    ? { label: '未啟用自動發佈', tone: 'amber-outline' as const }
    : site.publish_mode !== 'direct'
      ? { label: '手動模式（未自動發佈）', tone: 'amber-outline' as const }
      : site.status !== 'active'
        ? { label: '已暫停', tone: 'amber-outline' as const }
        : !credential
          ? { label: '未設定憑證', tone: 'amber' as const }
          : site.health === 'down'
            ? { label: '連接異常', tone: 'rose' as const }
            : site.health === 'ok'
              ? { label: '已連接', tone: 'green' as const }
              : site.health === 'degraded'
                ? { label: '連接正常（sitemap 警告）', tone: 'amber' as const }
                : { label: '尚未測試', tone: 'slate' as const };

  return (
    <section className="rounded-lg border border-teal-200 bg-teal-50/40 p-4 shadow-card">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <ShieldCheck size={14} className="text-teal-700" />
        <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">Beauty100 自動發佈</h3>
        <ContentStatusPill label={status.label} tone={status.tone} />
        {!configured && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
            請把「發佈方式」改成 Beauty100 自動發佈
          </span>
        )}
        {site.publish_mode !== 'direct' && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
            上線方式不是「直接公開」
          </span>
        )}
        {!externalId && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
            未指定欄目，預設 trending-topics
          </span>
        )}
      </header>

      <div className="grid gap-2 text-[12px] sm:grid-cols-2">
        <div className="rounded-md border border-teal-100 bg-white/80 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            發佈分類
          </p>
          <p className="mt-0.5 font-semibold text-[#0d1a2d]">
            {category}
            {category === 'trending-topics' ? '（焦點話題）' : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            文章會出現在 Beauty100 的 /topics 列表，詳情網址 /topics/文章代稱
          </p>
        </div>

        <div className="rounded-md border border-teal-100 bg-white/80 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            專用帳號憑證
          </p>
          {credential ? (
            <>
              <p className="mt-0.5 font-semibold text-[#0d1a2d]">
                {credential.fingerprint ? `•••• ${credential.fingerprint}` : '已設定'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {CREDENTIAL_STATUS_LABEL[credential.status]}
                {credential.last_verified_at
                  ? ` · ${formatZoneDateTime(credential.last_verified_at, site.timezone)}`
                  : ' · 尚未測試'}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-[11.5px] text-amber-700">
              尚未設定。請在下方「憑證」貼上 beauty100_admin JSON。
            </p>
          )}
        </div>

        <div className="rounded-md border border-teal-100 bg-white/80 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            連接狀態
          </p>
          <p className="mt-0.5 font-semibold text-[#0d1a2d]">
            {SITE_HEALTH_LABEL[site.health] ?? site.health}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {site.last_verified_at
              ? `最後測試 ${formatZoneDateTime(site.last_verified_at, site.timezone)}`
              : '尚未測試連線'}
          </p>
        </div>

        <div className="rounded-md border border-teal-100 bg-white/80 px-2.5 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            官網
          </p>
          {liveHref ? (
            <a
              href={liveHref}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 inline-flex items-center gap-1 font-semibold text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-800"
            >
              {domain}
              <ExternalLink size={11} />
            </a>
          ) : (
            <p className="mt-0.5 text-[11.5px] text-amber-700">
              站點主檔沒有 domain_url，無法組出文章網址。
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11.5px]"
          onClick={onTest}
          disabled={testing || !configured || site.publish_mode !== 'direct'}
          title={
            configured && site.publish_mode === 'direct'
              ? '測試 Beauty100 登入／文章表／封面 bucket'
              : '先把發佈方式改成 Beauty100、上線方式改成直接公開'
          }
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
          測試 Beauty100 連接
        </Button>
        {liveHref && (
          <a
            href={liveHref}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[rgba(13,26,45,0.12)] bg-white px-2 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={11} />
            前往官網
          </a>
        )}
        <span className="text-[11px] text-slate-500">
          測試會真的登入、讀 `blog_articles`、上傳／刪除一個 probe 檔。
        </span>
      </div>
    </section>
  );
}

function SettingsTab({
  site,
  sections,
  credentials,
  canManageSites,
  onRefresh,
  onTest,
  onOpenPlan,
  onRemove,
  testing,
}: {
  site: ContentSiteWithProfile;
  sections: ContentSiteSection[];
  credentials: ContentCredentialMeta[];
  canManageSites: boolean;
  onRefresh: () => Promise<void>;
  onTest: () => void;
  onOpenPlan: () => void;
  onRemove: () => void;
  testing: boolean;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(() => toSettingsDraft(site));
  const [saving, setSaving] = useState(false);
  // 只在站點設定真的變更（updated_at 由 DB trigger 更新）時重置表單，
  // 避免「儲存憑證／測試連線」的 refresh 把使用者尚未儲存的編輯洗掉。
  const siteVersion = `${site.website_profile_id}:${site.updated_at}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseline = useMemo(() => toSettingsDraft(site), [siteVersion]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    setDraft(baseline);
  }, [baseline]);

  const update = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = async () => {
    if (!canManageSites) {
      toast.error('沒有儲存站點設定的權限');
      return;
    }
    setSaving(true);
    try {
      await saveSite(site.website_profile_id, {
        tier: draft.tier,
        adapter: draft.adapter,
        publish_mode: draft.publish_mode,
        locale: draft.locale.trim(),
        timezone: draft.timezone,
        status: draft.status,
        notes: draft.notes.trim() || null,
      });
      toast.success('站點設定已儲存');
      await onRefresh();
    } catch (thrown) {
      toast.error('儲存站點設定失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <Settings2 size={14} className="text-teal-600" />
          <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">站點設定</h3>
          {dirty && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
              有未儲存的變更
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11.5px]"
              onClick={() => setDraft(toSettingsDraft(site))}
              disabled={!dirty || saving}
            >
              還原
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[11.5px]"
              onClick={() => void handleSave()}
              disabled={!canManageSites || saving || !dirty}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              儲存設定
            </Button>
          </div>
        </header>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="站點等級（Tier）" hint="等級越高，系統越優先安排產出">
            <Select
              value={draft.tier}
              onValueChange={(value) => update('tier', value as ContentTier)}
              disabled={!canManageSites}
            >
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
          <Field label="發佈方式（Adapter）" hint="先選「手動內容」；接好網站 API 再改自動">
            <Select
              value={draft.adapter}
              onValueChange={(value) => update('adapter', value as ContentAdapterName)}
              disabled={!canManageSites}
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
          <Field label="上線方式">
            <Select
              value={draft.publish_mode}
              onValueChange={(value) => update('publish_mode', value as ContentPublishMode)}
              disabled={!canManageSites}
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
          <Field label="網站語言">
            <Select
              value={draft.locale}
              onValueChange={(value) => update('locale', value)}
              disabled={!canManageSites}
            >
              <SelectTrigger className="h-9 bg-white text-[13px]">
                <SelectValue />
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
          <Field label="網站時區">
            <Select
              value={draft.timezone}
              onValueChange={(value) => update('timezone', value)}
              disabled={!canManageSites}
            >
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
          <Field label="營運狀態">
            <Select
              value={draft.status}
              onValueChange={(value) => update('status', value as ContentSiteStatus)}
              disabled={!canManageSites}
            >
              <SelectTrigger className="h-9 bg-white text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {SITE_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="備註（選填）" className="sm:col-span-2 lg:col-span-3">
            <Textarea
              value={draft.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="給團隊看的站點備註：聯絡人、特殊規則、契約限制…"
              disabled={!canManageSites}
              className="min-h-[56px] bg-white text-[13px]"
            />
          </Field>
        </div>
      </section>

      {looksLikeBeauty100Site(site) && (
        <Beauty100ConnectionCard
          site={site}
          sections={sections}
          credentials={credentials}
          testing={testing}
          onTest={onTest}
        />
      )}

      <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <CalendarDays size={14} className="text-teal-600" />
          <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">發佈節奏（cadence）</h3>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
            {CADENCE_FREQUENCY_LABEL[site.cadence.frequency] ?? site.cadence.frequency}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 px-2 text-[11.5px]"
            onClick={onOpenPlan}
          >
            到排程表
          </Button>
        </header>
        <CadenceEditor
          site={site}
          canManageSites={canManageSites}
          onSaved={onRefresh}
        />
      </section>

      <CredentialsCard
        site={site}
        credentials={credentials}
        canManageSites={canManageSites}
        onRefresh={onRefresh}
      />

      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-2.5 shadow-card">
        <Wifi size={13} className="text-teal-600" />
        <span className="text-[12px] text-slate-600">
          設定齊全後請測試連線；未通過（health 非 ok）不會排程與自動生成。
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1.5 px-2 text-[11.5px]"
          onClick={onTest}
          disabled={testing}
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
          測試連線
        </Button>
      </section>

      {sections.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          目前 {sections.length} 個欄目（{TIER_LABEL[site.tier] ?? site.tier}）。
        </p>
      )}

      {looksLikeBeauty100Site(site) ? (
        <section className="rounded-lg border border-teal-200 bg-teal-50/40 p-3">
          <div className="flex flex-wrap items-start gap-2">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal-700" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-bold text-teal-900">Beauty100 接入由系統維護</h3>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-teal-800/90">
                這個站點不提供「移除接入」，避免一次連帶刪除 MPS 的文章、排程與憑證。
                要停止自動發佈，請把「上線方式」改成手動，或把營運狀態改成暫停。
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
          <div className="flex flex-wrap items-start gap-2">
            <Trash2 size={14} className="mt-0.5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-bold text-rose-800">移除接入</h3>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-rose-700/90">
                把這個站點退回「未接入」，之後可以重新走接入精靈。欄目、排程、文章與版本、憑證、檢查紀錄會一併刪除且無法復原；不影響官網清單與 GSC／廣告資料。
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1 px-2 text-[11.5px]"
              onClick={onRemove}
              disabled={!canManageSites}
              title={canManageSites ? '移除接入（可重新接入）' : '只有管理層可以移除接入'}
            >
              <Trash2 size={11} />
              移除接入
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// 欄目分頁
// ============================================================

interface SectionEditorState {
  mode: 'create' | 'edit';
  section: ContentSiteSection | null;
}

function SectionEditorDialog({
  open,
  mode,
  section,
  siteId,
  canManageSites,
  takenSlugs,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  section: ContentSiteSection | null;
  siteId: string;
  canManageSites: boolean;
  /** 其他欄目已用的網址代稱，用來避免自動帶入時撞名 */
  takenSlugs: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [externalId, setExternalId] = useState('');
  const [contentType, setContentType] = useState<ContentSectionType>('article');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(section?.name ?? '');
    setSlug(section?.slug ?? '');
    setSlugTouched(Boolean(section?.slug));
    setExternalId(section?.external_id ?? '');
    setContentType(section?.content_type ?? 'article');
    setError(null);
  }, [open, section]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (slugTouched) return;
    setSlug(suggestSectionSlug(value, takenSlugs.length, takenSlugs));
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) {
      setError('請填欄目名稱。');
      return;
    }
    if (trimmedSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      setError('網址代稱只能用小寫英文、數字與連字號。');
      return;
    }
    const finalSlug =
      trimmedSlug || suggestSectionSlug(trimmedName, takenSlugs.length, takenSlugs);
    setSaving(true);
    setError(null);
    try {
      await upsertSection(siteId, {
        ...(section?.id ? { id: section.id } : {}),
        name: trimmedName,
        slug: finalSlug,
        external_id: externalId.trim() || null,
        content_type: contentType,
      });
      toast.success(mode === 'create' ? '已新增欄目' : '已更新欄目', {
        description: `${trimmedName}（${finalSlug}）`,
      });
      await onSaved();
      onClose();
    } catch (thrown) {
      const message = contentErrorMessage(thrown);
      setError(message);
      toast.error('欄目儲存失敗', { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {mode === 'create' ? '新增欄目' : '編輯欄目'}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            slug 是站內路徑片段，同一站點不可重複；external_id 供外部系統對應，手動站可留空。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="欄目名稱" hint="會顯示在網站的選單或分類頁" className="sm:col-span-2">
            <Input
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="例如：裝修知識"
              disabled={!canManageSites || saving}
              className="h-9 bg-white text-[13px]"
            />
          </Field>
          <details className="group rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/50 px-2.5 py-2 sm:col-span-2">
            <summary className="cursor-pointer list-none text-[11.5px] font-medium text-slate-600">
              進階：自訂網址代稱（可選，不用填）
              <span className="ml-1 text-[10.5px] text-muted-foreground">
                目前：{slug || '系統將自動產生'}
              </span>
            </summary>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              不用填。系統會自動產生（例如 category-1），只在後台分類識別用，不會出現在官網文章網址。
              只有你想指定英文代稱時才需要改；官網分類頁網址的最後一段英文就是它（例：/category/renovation → renovation）。
            </p>
            <Input
              value={slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(true);
              }}
              placeholder="renovation"
              disabled={!canManageSites || saving}
              className="mt-1.5 h-9 bg-white font-mono text-[12.5px]"
            />
          </details>
          <Field label="官網分類編號（選填）" hint="外部系統的欄目 ID；不知道可留空">
            <Input
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder="category-123"
              disabled={!canManageSites || saving}
              className="h-9 bg-white font-mono text-[12.5px]"
            />
          </Field>
          <Field label="文章形式（選填）" className="sm:col-span-2">
            <Select
              value={contentType}
              onValueChange={(value) => setContentType(value as ContentSectionType)}
              disabled={!canManageSites || saving}
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
        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-[11.5px] text-rose-700">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canManageSites || saving}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {mode === 'create' ? '新增欄目' : '儲存欄目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionsTab({
  site,
  sections,
  canManageSites,
  onRefresh,
}: {
  site: ContentSiteWithProfile;
  sections: ContentSiteSection[];
  canManageSites: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<SectionEditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContentSiteSection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSection(site.website_profile_id, pendingDelete.id);
      toast.success('已刪除欄目', { description: pendingDelete.name });
      setPendingDelete(null);
      await onRefresh();
    } catch (thrown) {
      toast.error('刪除欄目失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          文章生成時會指定欄目；slug 全站唯一（重複會回 409）。
        </p>
        <Button
          size="sm"
          className="ml-auto h-8 gap-1.5 px-3 text-[12px]"
          onClick={() => setEditor({ mode: 'create', section: null })}
          disabled={!canManageSites}
        >
          <Plus size={13} />
          新增欄目
        </Button>
      </div>

      {sections.length === 0 ? (
        <ContentEmptyState
          icon={LayoutList}
          title="還沒有任何欄目"
          description="至少需要一個欄目，連線測試的「設定完整」與文章生成才有地方落。"
          action={
            <Button
              size="sm"
              onClick={() => setEditor({ mode: 'create', section: null })}
              disabled={!canManageSites}
            >
              <Plus size={13} />
              新增第一個欄目
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="text-[11.5px]">名稱</TableHead>
                <TableHead className="text-[11.5px]">slug</TableHead>
                <TableHead className="text-[11.5px]">external_id</TableHead>
                <TableHead className="text-[11.5px]">型別</TableHead>
                <TableHead className="w-[120px] text-right text-[11.5px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.id}>
                  <TableCell className="text-[12.5px] font-semibold text-[#0d1a2d]">
                    {section.name}
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px] text-slate-600">
                    {section.slug}
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px] text-slate-500">
                    {section.external_id || '—'}
                  </TableCell>
                  <TableCell>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
                      {section.content_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11.5px]"
                        onClick={() => setEditor({ mode: 'edit', section })}
                        disabled={!canManageSites}
                      >
                        編輯
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11.5px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => setPendingDelete(section)}
                        disabled={!canManageSites}
                      >
                        刪除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SectionEditorDialog
        open={Boolean(editor)}
        mode={editor?.mode ?? 'create'}
        section={editor?.section ?? null}
        siteId={site.website_profile_id}
        canManageSites={canManageSites}
        takenSlugs={sections
          .filter((item) => item.id !== (editor?.section?.id ?? ''))
          .map((item) => item.slug)}
        onClose={() => setEditor(null)}
        onSaved={onRefresh}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="刪除這個欄目？"
        description={
          <>
            將刪除欄目「{pendingDelete?.name}」（{pendingDelete?.slug}）。已存在的文章不會被刪除，但之後不能再指定到這個欄目。
          </>
        }
        confirmLabel="刪除欄目"
        busy={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

// ============================================================
// 關鍵字分頁
// ============================================================

function KeywordsTab({
  site,
  navigate,
}: {
  site: ContentSiteWithProfile;
  navigate: ContentViewProps['navigate'];
}) {
  const siteId = site.website_profile_id;
  const [data, setData] = useState<SiteKeywordSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSiteKeywords(siteId, 20));
    } catch (thrown) {
      setError(contentErrorMessage(thrown));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-10 animate-pulse rounded-md border border-[rgba(13,26,45,0.08)] bg-white"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ContentEmptyState
        icon={AlertTriangle}
        tone="error"
        title="關鍵字載入失敗"
        description={error}
        action={
          <Button size="sm" onClick={() => void load()}>
            <RefreshCw size={13} />
            重試
          </Button>
        }
      />
    );
  }

  if (!data || data.total === 0) {
    return (
      <ContentEmptyState
        icon={KeyRound}
        title="這個站點還沒有關鍵字"
        description="到關鍵字庫匯入 CSV 或掃描 GSC 機會詞，planner 才有關鍵字可以排程與生成。"
        action={
          <Button size="sm" className="gap-1" onClick={() => navigate('seo', 'keywords', siteId)}>
            前往關鍵字庫
          </Button>
        }
      />
    );
  }

  const summaryChips: { label: string; value: number; tone: string }[] = [
    { label: '總數', value: data.total, tone: 'text-[#0d1a2d]' },
    { label: '待生成', value: data.backlog, tone: 'text-slate-600' },
    { label: '已排程', value: data.planned, tone: 'text-blue-700' },
    { label: '生成中', value: data.generating, tone: 'text-blue-700' },
    { label: '待審', value: data.inReview, tone: 'text-amber-700' },
    { label: '已發佈', value: data.published, tone: 'text-teal-700' },
    { label: '未分級', value: data.unclassified, tone: 'text-slate-400' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {summaryChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-md border border-[rgba(13,26,45,0.08)] bg-white px-2 py-1 text-[11.5px] shadow-card"
            >
              <span className="text-muted-foreground">{chip.label}</span>
              <strong className={cn('tabular-nums', chip.tone)}>{chip.value}</strong>
            </span>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1 px-2.5 text-[12px]"
          onClick={() => navigate('seo', 'keywords', siteId)}
        >
          <KeyRound size={12} />
          前往關鍵字庫
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70">
              <TableHead className="text-[11.5px]">關鍵字</TableHead>
              <TableHead className="text-[11.5px]">意圖</TableHead>
              <TableHead className="text-right text-[11.5px]">優先級</TableHead>
              <TableHead className="text-[11.5px]">pipeline 狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((keyword: ContentKeyword) => (
              <TableRow key={keyword.id}>
                <TableCell className="max-w-[280px] truncate text-[12.5px] font-medium text-[#0d1a2d]">
                  {keyword.keyword}
                </TableCell>
                <TableCell className="text-[11.5px] text-slate-500">
                  {keyword.intent ?? '未分級'}
                </TableCell>
                <TableCell className="text-right text-[11.5px] tabular-nums text-slate-500">
                  {keyword.priority ?? '—'}
                </TableCell>
                <TableCell>
                  {keyword.pipeline_status ? (
                    <ContentStatusPill status={keyword.pipeline_status} machine="keyword" />
                  ) : (
                    <ContentStatusPill label="未分級" tone="muted" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        只顯示最近 20 筆；完整清單（匯入、GSC 掃描、批次改狀態）在關鍵字庫。
      </p>
    </div>
  );
}

// ============================================================
// 文章分頁
// ============================================================

function ArticlesTab({
  site,
  navigate,
}: {
  site: ContentSiteWithProfile;
  navigate: ContentViewProps['navigate'];
}) {
  const siteId = site.website_profile_id;
  const [rows, setRows] = useState<SiteArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSiteArticles(siteId, 20));
    } catch (thrown) {
      setError(contentErrorMessage(thrown));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-10 animate-pulse rounded-md border border-[rgba(13,26,45,0.08)] bg-white"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ContentEmptyState
        icon={AlertTriangle}
        tone="error"
        title="文章載入失敗"
        description={error}
        action={
          <Button size="sm" onClick={() => void load()}>
            <RefreshCw size={13} />
            重試
          </Button>
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <ContentEmptyState
        icon={FileText}
        title="這個站點還沒有文章"
        description="排程格到達 generate_at 後會自動生成草稿；也可以到排程表手動觸發或先補關鍵字。"
        action={
          <Button size="sm" onClick={() => navigate('seo', 'articles', siteId)}>
            到文章佇列
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[12px] text-muted-foreground">最近 20 篇（點擊進審核工作室）</p>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 gap-1 px-2.5 text-[12px]"
          onClick={() => navigate('seo', 'articles', siteId)}
        >
          <FileText size={12} />
          文章佇列
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/70">
              <TableHead className="text-[11.5px]">標題</TableHead>
              <TableHead className="text-[11.5px]">狀態</TableHead>
              <TableHead className="text-[11.5px]">發佈</TableHead>
              <TableHead className="text-[11.5px]">建立時間</TableHead>
              <TableHead className="text-[11.5px]">發佈時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const stage = publishStage(
                {
                  status: row.status,
                  deleted_at: row.deleted_at,
                  checks: row.checks,
                  scheduled_publish_at: null,
                },
                { manual: site.publish_mode === 'manual' },
              );
              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate('seo', 'studio', row.id)}
                >
                  <TableCell className="max-w-[320px] truncate text-[12.5px] font-medium text-[#0d1a2d]">
                    {row.title || '（未命名文章）'}
                  </TableCell>
                  <TableCell>
                    <ContentStatusPill
                      status={ARTICLE_STATUS_OPTIONS.includes(row.status) ? row.status : 'draft'}
                      machine="article"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[110px] flex-wrap items-center gap-1">
                      <ContentStatusPill label={stage.label} tone={stage.tone} />
                      {row.live_url && (
                        <a
                          href={row.live_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-0.5 text-[10.5px] text-teal-700 underline decoration-teal-200 underline-offset-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          連結
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[11.5px] text-slate-500">
                    {formatZoneDateTime(row.created_at, site.timezone)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[11.5px] text-slate-500">
                    {row.published_at ? formatZoneDateTime(row.published_at, site.timezone) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================================
// 健康分頁
// ============================================================

function HealthTab({
  site,
  checks,
  pages,
  canManageSites,
  testing,
  onTest,
}: {
  site: ContentSiteWithProfile;
  checks: ContentSiteCheck[];
  pages: ContentSitePage[];
  canManageSites: boolean;
  testing: boolean;
  onTest: () => void;
}) {
  const passedBlocking = checks.filter((check) => check.ok).length;

  return (
    <div className="space-y-3">
      <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
          <p className="text-[10.5px] text-muted-foreground">健康狀態</p>
          <div className="mt-1 flex items-center gap-2">
            <ContentStatusPill status={site.health} machine="health" />
            <span className="text-[11.5px] text-muted-foreground">
              {SITE_HEALTH_LABEL[site.health] ?? site.health}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
          <p className="text-[10.5px] text-muted-foreground">最近驗證</p>
          <p className="mt-1 text-[12px] font-semibold text-[#0d1a2d]">
            {site.last_verified_at
              ? formatZoneDateTime(site.last_verified_at, site.timezone)
              : '尚未測試'}
          </p>
        </div>
        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
          <p className="text-[10.5px] text-muted-foreground">檢查紀錄</p>
          <p className="mt-1 text-[12px] font-semibold text-[#0d1a2d]">
            {checks.length} 筆 · 通過 {passedBlocking}
          </p>
        </div>
        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
          <p className="text-[10.5px] text-muted-foreground">站內頁面（內鏈用）</p>
          <p className="mt-1 text-[12px] font-semibold text-[#0d1a2d]">{pages.length} 筆</p>
        </div>
      </section>

      <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
        <header className="flex flex-wrap items-center gap-2 border-b border-[rgba(13,26,45,0.08)] px-4 py-2.5">
          <Activity size={14} className="text-teal-600" />
          <h3 className="text-[13.5px] font-bold text-[#0d1a2d]">檢查時間軸</h3>
          <span className="text-[11px] text-muted-foreground">最近 20 筆</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 gap-1.5 px-2 text-[11.5px]"
            onClick={onTest}
            disabled={!canManageSites || testing}
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
            測試連線
          </Button>
        </header>

        {checks.length === 0 ? (
          <div className="px-4 py-6">
            <ContentEmptyState
              icon={Wifi}
              title="還沒有連線檢查紀錄"
              description="設定齊全後按「測試連線」：會依序檢查設定完整、網域可達、sitemap 與憑證，並更新健康狀態。"
              action={
                <Button size="sm" onClick={onTest} disabled={!canManageSites || testing}>
                  <Wifi size={13} />
                  測試連線
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[rgba(13,26,45,0.08)]">
            {checks.map((check) => {
              const Icon = check.ok ? CheckCircle2 : AlertTriangle;
              return (
                <li key={check.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Icon
                    size={14}
                    className={cn('mt-0.5 shrink-0', check.ok ? 'text-emerald-600' : 'text-rose-600')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-[#0d1a2d]">
                      {CHECK_KIND_LABEL[check.kind] ?? check.kind}
                      <span
                        className={cn(
                          'rounded px-1 py-0.5 text-[10px] font-bold',
                          check.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                        )}
                      >
                        {check.ok ? '通過' : '未通過'}
                      </span>
                    </p>
                    <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-muted-foreground">
                      {describeCheck(check)}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
                    {formatZoneDateTime(check.checked_at, site.timezone)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pages.length > 0 && (
        <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
          <p className="text-[12px] font-semibold text-[#0d1a2d]">站內頁面樣本（內鏈候選）</p>
          <ul className="mt-1.5 space-y-0.5">
            {pages.slice(0, 5).map((page) => (
              <li key={page.id} className="truncate text-[11.5px] text-muted-foreground">
                {truncateText(page.title || page.url, 90)}
              </li>
            ))}
          </ul>
          {pages.length > 5 && (
            <p className="mt-1 text-[11px] text-slate-400">另有 {pages.length - 5} 筆…</p>
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================
// 發佈節奏編輯（PRD §9.2.1；變更後由 planner 於每日 00:10 重算）
// ============================================================

function CadenceEditor({
  site,
  canManageSites,
  onSaved,
}: {
  site: ContentSiteWithProfile;
  canManageSites: boolean;
  onSaved: () => Promise<void>;
}) {
  const baseline = useMemo(
    () => normalizeCadence(site.cadence),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site.website_profile_id, site.updated_at],
  );
  const [draft, setDraft] = useState<ContentCadence>(baseline);
  const [blackoutText, setBlackoutText] = useState(baseline.blackout_dates.join(', '));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(baseline);
    setBlackoutText(baseline.blackout_dates.join(', '));
  }, [baseline]);

  const errors = useMemo(() => validateCadence(draft), [draft]);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(baseline) ||
    parseBlackoutDates(blackoutText).join(',') !== baseline.blackout_dates.join(',');

  const update = <K extends keyof ContentCadence>(key: K, value: ContentCadence[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const toggleWeekday = (day: number) => {
    setDraft((previous) => {
      const weekdays = previous.weekdays.includes(day)
        ? previous.weekdays.filter((item) => item !== day)
        : [...previous.weekdays, day].sort((a, b) => a - b);
      return { ...previous, weekdays };
    });
  };

  const handleSave = async () => {
    if (!canManageSites) {
      toast.error('沒有變更發佈節奏的權限', {
        description: '站點接入與頻率屬於 manage_sites：只有管理層可以修改。',
      });
      return;
    }
    if (errors.length > 0) {
      toast.error('發佈節奏有問題', { description: errors.join('；') });
      return;
    }
    setSaving(true);
    try {
      const next: ContentCadence = { ...draft, blackout_dates: parseBlackoutDates(blackoutText) };
      await saveSite(site.website_profile_id, { cadence: next });
      toast.success('發佈節奏已更新', {
        description: '下一次排程重算（每日 00:10 HKT）後生效；既有文章與已排程時段不會被覆蓋。',
      });
      await onSaved();
    } catch (thrown) {
      toast.error('更新發佈節奏失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setSaving(false);
    }
  };

  const usesWeekdays = draft.frequency !== 'daily' && draft.frequency !== 'every_2_days';

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="發佈頻率">
          <Select
            value={draft.frequency}
            onValueChange={(value) => update('frequency', value as ContentCadence['frequency'])}
            disabled={!canManageSites}
          >
            <SelectTrigger className="h-9 bg-white text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CADENCE_FREQUENCY_OPTION_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="發佈時間" hint={`網站時區 ${site.timezone}`}>
          <Input
            type="time"
            value={draft.publish_time}
            onChange={(event) => update('publish_time', event.target.value)}
            disabled={!canManageSites}
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="提前多久開始準備（小時）" hint="發佈前多久開始生成，預留審稿時間">
          <Input
            type="number"
            min={1}
            max={168}
            value={draft.lead_time_hours}
            onChange={(event) => update('lead_time_hours', Number(event.target.value) || 0)}
            disabled={!canManageSites}
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="最遲審稿時間（小時）" hint="發佈前幾小時還沒批准，就會自動保留、不會上線">
          <Input
            type="number"
            min={0}
            max={168}
            value={draft.review_cutoff_hours}
            onChange={(event) => update('review_cutoff_hours', Number(event.target.value) || 0)}
            disabled={!canManageSites}
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field label="每日最多幾篇">
          <Input
            type="number"
            min={1}
            max={5}
            value={draft.max_articles_per_day}
            onChange={(event) => update('max_articles_per_day', Number(event.target.value) || 1)}
            disabled={!canManageSites}
            className="h-9 bg-white text-[13px]"
          />
        </Field>
        <Field
          label="不發佈的日期"
          hint="以逗號分隔 YYYY-MM-DD，最多 10 個（例：2026-12-25, 2027-01-01）"
          className="sm:col-span-3"
        >
          <Input
            value={blackoutText}
            onChange={(event) => setBlackoutText(event.target.value)}
            disabled={!canManageSites}
            placeholder="2026-12-25, 2027-01-01"
            className="h-9 bg-white font-mono text-[12.5px]"
          />
        </Field>
      </div>

      {usesWeekdays && (
        <div className="space-y-1.5">
          <Label className="text-[12px] font-semibold text-slate-600">星期</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((option) => {
              const active = draft.weekdays.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  disabled={!canManageSites}
                  onClick={() => toggleWeekday(option.value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50',
                    active
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-[rgba(13,26,45,0.12)] bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {dirty ? '有未儲存的變更。' : `目前：${cadenceSummary(baseline)}（${site.timezone}）`}
          {errors.length > 0 && <span className="ml-1 font-medium text-rose-600">{errors[0]}</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setDraft(baseline);
              setBlackoutText(baseline.blackout_dates.join(', '));
            }}
            disabled={!dirty || saving}
          >
            還原
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => void handleSave()}
            disabled={!canManageSites || !dirty || saving || errors.length > 0}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            儲存節奏
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        變更只影響之後的排程；既有文章與已排定的時段不會被覆蓋。
      </p>
    </div>
  );
}

/** 把「2026-12-25, 2027-01-01」解析成合法日期陣列（非法片段直接忽略） */
function parseBlackoutDates(value: string): string[] {
  const dates = String(value || '')
    .split(/[,，;；\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
  return [...new Set(dates)].slice(0, 10);
}

// ============================================================
// 主元件
// ============================================================

export function SiteDetailView({ route, navigate }: ContentViewProps) {
  const siteId = route.id;
  const { systemUser } = useAuth();
  const canManageSites = can({ role: systemUser?.role ?? null }, 'manage_sites');
  const { site, sections, checks, credentials, pages, loading, error, missingSchema, refresh } =
    useContentSite(siteId);

  const [tab, setTab] = useState<DetailTab>('settings');
  const [testing, setTesting] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<ContentConnectionTestResult | null>(null);
  const [testFailure, setTestFailure] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const name = site ? siteDisplayName(site) : '';
  const domain = site ? domainFromUrl(site.profile?.domain_url ?? '') || '—' : '—';
  const sectionCounts = useMemo(() => countSections(sections), [sections]);

  const handleTest = async () => {
    if (!siteId) return;
    if (!canManageSites) {
      toast.error('沒有測試連線的權限', {
        description: '連線測試屬於 manage_sites：只有管理層可以執行。',
      });
      return;
    }
    setTesting(true);
    setTestFailure(null);
    setTestResult(null);
    try {
      const result = await runConnectionTest(siteId);
      setTestResult(result);
      setTestDialogOpen(true);
      if (result.health === 'ok') {
        toast.success('連線測試通過', { description: '站點健康，已可排程與自動生成。' });
      } else if (result.health === 'degraded') {
        toast.message('站點可用但降級', { description: '非阻擋檢查（sitemap）失敗，請看逐項結果。' });
      } else {
        toast.error('連線測試未通過', { description: '請看逐項結果並修正設定或憑證。' });
      }
      await refresh();
    } catch (thrown) {
      const message = contentErrorMessage(thrown);
      setTestFailure(message);
      setTestDialogOpen(true);
      toast.error('測試連線失敗', { description: message });
    } finally {
      setTesting(false);
    }
  };

  const handleRemoveSite = async () => {
    if (!site) return;
    if (!canManageSites) {
      toast.error('沒有移除接入的權限', {
        description: '只有管理層（management／system_dev）可以移除接入。',
      });
      return;
    }
    setRemoving(true);
    try {
      const result = await removeSite(site.website_profile_id);
      toast.success(`已移除「${siteDisplayName(site)}」的接入`, {
        description: `已刪除 ${result.deleted.sections} 個欄目、${result.deleted.slots} 個排程、${result.deleted.articles} 篇文章；可重新接入。`,
      });
      setRemoveOpen(false);
      navigate('seo', 'sites');
    } catch (thrown) {
      toast.error('移除接入失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setRemoving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!site) return;
    if (!canManageSites) {
      toast.error('沒有變更站點狀態的權限');
      return;
    }
    const next: ContentSiteStatus = site.status === 'active' ? 'paused' : 'active';
    setStatusBusy(true);
    try {
      await setSiteStatus(site.website_profile_id, next);
      toast.success(next === 'paused' ? `已暫停「${name}」` : `已啟用「${name}」`);
      await refresh();
    } catch (thrown) {
      toast.error('站點狀態更新失敗', { description: contentErrorMessage(thrown) });
    } finally {
      setStatusBusy(false);
    }
  };

  const backToList = () => navigate('seo', 'sites');

  const pageHeader = (
    <ContentPageHeader
      eyebrow={
        <button
          type="button"
          onClick={backToList}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-teal-50"
        >
          <ArrowLeft size={12} />
          站點
        </button>
      }
      title={site ? name : '站點詳情'}
      subtitle={
        site
          ? `${domain} · ${ADAPTER_LABEL[site.adapter] ?? site.adapter} · ${TIER_LABEL[site.tier] ?? site.tier} · ${site.timezone}`
          : '設定／欄目／關鍵字／文章／健康'
      }
      meta={
        site ? (
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusPill status={site.health} machine="health" />
            {site.status !== 'active' && (
              <ContentStatusPill
                label={SITE_STATUS_LABEL[site.status]}
                tone={site.status === 'paused' ? 'amber-outline' : 'muted'}
              />
            )}
            <span className="text-[11.5px] text-muted-foreground">
              {CADENCE_FREQUENCY_LABEL[site.cadence.frequency] ?? site.cadence.frequency} ·{' '}
              {cadenceSummary(site.cadence)}（{site.timezone}）
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {sectionCounts.total} 個欄目 · {PUBLISH_MODE_LABEL[site.publish_mode] ?? site.publish_mode}
            </span>
            {site.last_verified_at && (
              <span className="text-[11.5px] text-slate-400">
                最近驗證 {formatZoneDateTime(site.last_verified_at, site.timezone)}
              </span>
            )}
          </div>
        ) : null
      }
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={backToList}>
            <ArrowLeft size={13} />
            站點清單
          </Button>
          {site && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void handleTest()}
                disabled={testing || !canManageSites}
                title={canManageSites ? '測試連線（會寫入檢查紀錄）' : '只有管理層可以測試連線'}
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                測試連線
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void handleToggleStatus()}
                disabled={statusBusy || !canManageSites || site.status === 'archived'}
                title={
                  site.status === 'archived'
                    ? '已歸檔站點不會自動運作'
                    : canManageSites
                      ? site.status === 'active'
                        ? '暫停排程與自動生成'
                        : '恢復排程與自動生成'
                      : '只有管理層可以變更站點狀態'
                }
              >
                {statusBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : site.status === 'paused' ? (
                  <Play size={13} />
                ) : (
                  <Pause size={13} />
                )}
                {site.status === 'paused' ? '啟用' : '暫停'}
              </Button>
            </>
          )}
        </>
      }
    />
  );

  const renderBody = () => {
    if (!siteId) {
      return (
        <ContentEmptyState
          icon={AlertTriangle}
          title="找不到站點"
          description="這個連結缺少站點 ID。請從站點清單重新進入。"
          action={
            <Button size="sm" onClick={backToList}>
              回到站點清單
            </Button>
          }
        />
      );
    }

    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description={CONTENT_NOT_ENABLED_MESSAGE}
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新檢查
            </Button>
          }
        />
      );
    }

    if (error) {
      return (
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="站點載入失敗"
          description={error}
          action={
            <Button size="sm" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重試
            </Button>
          }
        />
      );
    }

    if (loading && !site) {
      return (
        <div className="space-y-3">
          <div className="h-9 w-full animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="h-64 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      );
    }

    if (!site) {
      return (
        <ContentEmptyState
          icon={AlertTriangle}
          title="這個站點尚未接入內容自動化"
          description="找不到 content_sites 設定列。可回到站點清單重新接入，或確認資料是否已被移除。"
          action={
            <Button size="sm" onClick={backToList}>
              回到站點清單
            </Button>
          }
        />
      );
    }

    return (
      <div className="space-y-3">
        {site.health !== 'ok' && (
          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-amber-800">
                站點尚未通過連線測試（{SITE_HEALTH_LABEL[site.health] ?? site.health}）
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-amber-700">
                未通過前不會排程與自動生成。請先到「設定」確認 cadence／SEO 必填項與欄目，再按「測試連線」。
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-[11.5px]"
              onClick={() => void handleTest()}
              disabled={testing || !canManageSites}
            >
              <Wifi size={12} />
              測試連線
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)} className="space-y-3">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-card">
            {TAB_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-slate-500 data-[state=active]:bg-[#0d1a2d] data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  <Icon size={13} />
                  {item.label}
                  {item.value === 'sections' && sectionCounts.total > 0 && (
                    <span className="rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-500">
                      {sectionCounts.total}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="settings" className="mt-0">
            <SettingsTab
              site={site}
              sections={sections}
              credentials={credentials}
              canManageSites={canManageSites}
              onRefresh={refresh}
              onTest={() => void handleTest()}
              onOpenPlan={() => navigate('seo', 'plan', site.website_profile_id)}
              onRemove={() => setRemoveOpen(true)}
              testing={testing}
            />
            <ConfirmDialog
              open={removeOpen}
              title="移除這個站點的接入？"
              description={
                <>
                  移除後會回到「未接入」，可以重新走接入精靈。以下內容會一併刪除且無法復原：
                  欄目、排程格、文章與版本紀錄、憑證、健康檢查紀錄。
                  <br />
                  不會影響：官網清單（網站+系統）、GSC 與廣告資料、其他模組；素材庫圖片仍會保留。
                </>
              }
              confirmLabel="確認移除接入"
              busy={removing}
              onClose={() => setRemoveOpen(false)}
              onConfirm={() => void handleRemoveSite()}
            />
            <div className="mt-3">
              <SeoDefaultsCard site={site} canManageSites={canManageSites} onSaved={refresh} />
            </div>
          </TabsContent>

          <TabsContent value="sections" className="mt-0">
            <SectionsTab
              site={site}
              sections={sections}
              canManageSites={canManageSites}
              onRefresh={refresh}
            />
          </TabsContent>

          <TabsContent value="keywords" className="mt-0">
            <KeywordsTab site={site} navigate={navigate} />
          </TabsContent>

          <TabsContent value="articles" className="mt-0">
            <ArticlesTab site={site} navigate={navigate} />
          </TabsContent>

          <TabsContent value="health" className="mt-0">
            <HealthTab
              site={site}
              checks={checks}
              pages={pages}
              canManageSites={canManageSites}
              testing={testing}
              onTest={() => void handleTest()}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {pageHeader}
      {renderBody()}

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[15px]">連線測試結果</DialogTitle>
            <DialogDescription className="text-[12px]">
              依序檢查設定完整 → 網域可達 → sitemap → 憑證；阻擋性項目未通過時站點不會排程。
            </DialogDescription>
          </DialogHeader>
          {testFailure ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-[12px] text-rose-700">
              <XCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{testFailure}</span>
            </div>
          ) : testResult ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <ContentStatusPill status={testResult.health} machine="health" />
                <span className="text-[11.5px] text-muted-foreground">
                  測試時間 {formatZoneDateTime(testResult.testedAt, site?.timezone)}
                </span>
              </div>
              <ul className="space-y-1.5">
                {testResult.checks.map((check) => {
                  const Icon = check.ok ? CheckCircle2 : check.blocking ? XCircle : AlertTriangle;
                  return (
                    <li
                      key={check.kind}
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
                          check.ok
                            ? 'text-emerald-600'
                            : check.blocking
                              ? 'text-rose-600'
                              : 'text-amber-600',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-[#0d1a2d]">
                          {check.label}
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
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">沒有測試結果。</p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTestDialogOpen(false)}>
              關閉
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setTestDialogOpen(false);
                void handleTest();
              }}
              disabled={testing}
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              重新測試
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
