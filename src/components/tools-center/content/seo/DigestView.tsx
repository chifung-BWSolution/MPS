/**
 * 社媒自動化營運 · 每日日報（M2-13、PRD §8.2.6／§9.2.4）
 *
 * 功能：日期選擇、HTML 預覽（sandbox iframe，不污染主文件樣式）、手動寄送、
 * 測試寄送（寄給自己）、寄送紀錄與重寄（resend）。
 *
 * 資料來源：
 *   - 設定（收件人／時間／digest_enabled）→ useContentSettings（content_settings）
 *   - 寄送紀錄 → useContentDigests（content_email_digests）
 *   - HTML／統計 → content-digest Edge Function 的 preview action
 *
 * 狀態語義（PRD §9.2.4）：寄送失敗保留 HTML、可重寄；未設定 Resend 或尚未寄出
 * 一律標「未寄出」，HTML 仍可預覽，不得顯示成已寄出。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  AlertTriangle,
  DatabaseZap,
  Eye,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import {
  previewContentDigest,
  sendContentDigest,
  useContentDigests,
} from '@/hooks/useContentDigest';
import { useContentSettings } from '@/hooks/useContentSettings';
import { useResendConnection } from '@/hooks/useResendConnection';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import {
  HONG_KONG_TIME_ZONE,
  formatNumber,
  formatUsd,
  formatZoneDate,
  formatZoneDateTime,
  todayInZone,
} from '@/lib/contentFormat.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { can } from '@/lib/contentPermissions.ts';
import type { ContentStatusTone } from '@/lib/contentState.ts';
import type {
  ContentDigestEmail,
  ContentDigestStatus,
  ContentEmailDigest,
} from '@/lib/contentTypes.ts';
import { cn } from '@/lib/utils';
import { sendEmail } from '@/lib/resendApi';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentStatusPill } from '../shell/ContentStatusPill';

// ============================================================
// 小工具
// ============================================================

const DIGEST_STATUS_META: Record<ContentDigestStatus, { label: string; tone: ContentStatusTone }> = {
  draft: { label: '未寄出', tone: 'slate' },
  sending: { label: '寄送中', tone: 'blue' },
  sent: { label: '已寄出', tone: 'teal' },
  failed: { label: '寄送失敗', tone: 'rose' },
  skipped: { label: '已跳過', tone: 'muted' },
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** digest_date 是「日」不是瞬間；用 HKT 中午換算，避免時區換日顯示錯日期 */
function formatDigestDate(date: string | null | undefined): string {
  const value = String(date || '').slice(0, 10);
  if (!DATE_PATTERN.test(value)) return value || '—';
  return formatZoneDate(`${value}T04:00:00Z`, HONG_KONG_TIME_ZONE);
}

function digestStatusMeta(status: ContentDigestStatus | null | undefined) {
  return status ? DIGEST_STATUS_META[status] : { label: '未寄出', tone: 'slate' as ContentStatusTone };
}

function SectionCard({
  icon: Icon,
  title,
  description,
  actions,
  children,
  className,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(13,26,45,0.06)] px-4 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <Icon size={14} strokeWidth={1.9} className="mt-0.5 shrink-0 text-teal-600" />
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-bold text-[#0d1a2d]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

// ============================================================
// 頁面
// ============================================================

export function DigestView({ navigate }: ContentViewProps) {
  const { systemUser } = useAuth();
  const roleUser = useMemo(() => ({ role: systemUser?.role }), [systemUser?.role]);
  const canView = can(roleUser, 'view');
  const canManage = can(roleUser, 'manage_settings');
  const selfEmail = String(systemUser?.email || '').trim();

  const {
    digests,
    loading: digestsLoading,
    error: digestsError,
    missingSchema,
    refresh: refreshDigests,
  } = useContentDigests();
  const { settings, loading: settingsLoading, error: settingsError } = useContentSettings();
  // Resend 設定狀態（沿用既有 useResendConnection）：null = 載入中／無法確認
  const resend = useResendConnection();
  const resendConfigured = resend.loading ? null : resend.status ? Boolean(resend.status.configured) : null;

  const [date, setDate] = useState(() => todayInZone(HONG_KONG_TIME_ZONE));
  const [preview, setPreview] = useState<ContentDigestEmail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recordHtml, setRecordHtml] = useState<{
    date: string;
    subject: string;
    html: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'send' | 'resend'; date: string } | null>(null);

  const today = todayInZone(HONG_KONG_TIME_ZONE);
  const recipients = settings?.digest_recipients ?? [];
  const recipientCount = recipients.length;
  const digestEnabled = Boolean(settings?.digest_enabled);
  const digestTime = settings?.digest_time || '09:00';

  const loadPreview = useCallback(async (targetDate: string) => {
    if (!targetDate) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const email = await previewContentDigest(targetDate);
      setPreview(email);
    } catch (err) {
      setPreview(null);
      setPreviewError(contentErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // 換日期就重新載入該日預覽（保留紀錄 HTML 的檢視則由 recordHtml 控制）
  useEffect(() => {
    if (!canView) return;
    setRecordHtml(null);
    void loadPreview(date);
  }, [canView, date, loadPreview]);

  const selectedRecord = useMemo(
    () => digests.find((item) => item.digest_date === date) ?? null,
    [digests, date],
  );

  const shownHtml = recordHtml?.html || preview?.html || '';
  const shownSubject = recordHtml?.subject || preview?.subject || '';
  const stats = preview?.stats ?? null;
  const lastSent = useMemo(() => {
    const sent = digests
      .filter((item) => item.status === 'sent')
      .sort((a, b) => (b.sent_at || '').localeCompare(a.sent_at || ''));
    return sent[0] ?? null;
  }, [digests]);

  const selectedStatusMeta = digestStatusMeta(selectedRecord?.status);
  const selectedStatusLabel = selectedRecord
    ? selectedStatusMeta.label
    : settingsLoading
      ? '未寄出'
      : digestEnabled
        ? '未寄出'
        : '未寄出（自動日報未啟用）';

  const performSend = useCallback(
    async (target: { kind: 'send' | 'resend'; date: string }) => {
      setSending(true);
      try {
        const result = await sendContentDigest({
          date: target.date,
          resend: target.kind === 'resend',
        });
        const deliveredCount = Array.isArray(result.recipients) ? result.recipients.length : 0;
        toast.success(
          target.kind === 'resend'
            ? `已重寄 ${formatDigestDate(target.date)} 日報`
            : `已寄出 ${formatDigestDate(target.date)} 日報`,
          {
            description:
              deliveredCount > 0 ? `收件人 ${deliveredCount} 位` : '未回傳收件人數，請看寄送紀錄',
          },
        );
        await refreshDigests();
        if (target.date === date) {
          setRecordHtml(null);
          void loadPreview(target.date);
        }
      } catch (err) {
        toast.error('日報寄送失敗', { description: contentErrorMessage(err) });
      } finally {
        setSending(false);
      }
    },
    [date, loadPreview, refreshDigests],
  );

  const handleTestSend = async () => {
    if (!selfEmail) {
      toast.error('找不到你的登入電郵，無法測試寄送');
      return;
    }
    if (resendConfigured !== true) {
      toast.error('尚未設定 Resend，無法寄送測試信');
      return;
    }
    setTesting(true);
    try {
      // 測試信 = 目前日期的預覽 HTML，只寄給自己，不寫 content_email_digests、不影響正式寄送紀錄。
      const email =
        preview && preview.date === date ? preview : await previewContentDigest(date);
      const result = await sendEmail({
        to: selfEmail,
        subject: `[測試] ${email.subject}`,
        html: email.html,
        text: email.text,
        idempotencyKey: `content-digest-test/${date}/${Date.now()}`,
      });
      toast.success(`已寄出測試信到 ${selfEmail}`, {
        description: result.id ? `Resend ID：${result.id}` : undefined,
      });
    } catch (err) {
      toast.error('測試寄送失敗', { description: contentErrorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const initialLoading =
    (settingsLoading || digestsLoading) && !settings && digests.length === 0;

  if (!canView) {
    return (
      <div className="space-y-5">
        <ContentPageHeader title="內容自動化 · 每日日報" subtitle="預覽、寄送與寄送紀錄。" />
        <ContentEmptyState
          icon={ShieldAlert}
          tone="warning"
          title="沒有檢視權限"
          description="目前的帳號角色無法檢視內容自動化的日報；請聯絡管理層開通權限。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ContentPageHeader
        eyebrow={
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
            SEO · 每日營運摘要
          </span>
        }
        title="內容自動化 · 每日日報"
        subtitle="預覽指定日期的日報、手動寄送或測試寄送給自己，並檢視最近 30 筆寄送紀錄與重寄。未設定 Resend 或尚未寄出時一律標示「未寄出」。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPreview(date)}
              disabled={previewLoading || sending}
            >
              {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
              {previewLoading ? '載入中…' : '預覽'}
            </Button>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleTestSend()}
                disabled={testing || sending || resendConfigured !== true}
                title={
                  resendConfigured === true
                    ? '用目前預覽內容寄一封信給自己的登入電郵（不寫寄送紀錄）'
                    : '尚未設定 Resend，測試寄送不可用'
                }
              >
                {testing ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                {testing ? '寄送中…' : '測試寄送（寄給自己）'}
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                onClick={() => setConfirm({ kind: 'send', date })}
                disabled={sending || testing || resendConfigured === false}
                title={resendConfigured === false ? '尚未設定 Resend，無法寄送' : '寄出所選日期的日報'}
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {sending ? '寄送中…' : '寄送'}
              </Button>
            )}
          </div>
        }
      />

      {/* 日期 + 所選日期狀態 */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-4 py-3 shadow-card">
        <div className="space-y-1">
          <Label className="text-[11.5px] font-medium text-muted-foreground">
            日報日期（HKT）
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value || today)}
              className="h-9 w-[168px] text-[13px] tabular-nums"
            />
            <ContentStatusPill
              label={selectedStatusLabel}
              tone={selectedStatusMeta.tone}
              dot={Boolean(selectedRecord)}
              title={
                selectedRecord?.error
                  ? `最近錯誤：${selectedRecord.error}`
                  : selectedRecord
                    ? `寄送紀錄狀態：${selectedStatusLabel}`
                    : '所選日期沒有寄送紀錄'
              }
            />
            {selectedRecord?.sent_at && (
              <span className="text-[11.5px] text-muted-foreground">
                寄送時間 {formatZoneDateTime(selectedRecord.sent_at)}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          <p>
            {settingsLoading
              ? '讀取日報設定…'
              : digestEnabled
                ? `自動日報已啟用：每天 ${digestTime}（HKT）寄出`
                : '自動日報未啟用：目前不會自動寄送'}
          </p>
          <p>
            Resend：
            <span
              className={cn(
                'ml-0.5 font-semibold',
                resendConfigured === true
                  ? 'text-teal-700'
                  : resendConfigured === false
                    ? 'text-rose-600'
                    : 'text-slate-500',
              )}
              title={resend.error || undefined}
            >
              {resend.loading
                ? '確認中…'
                : resendConfigured === true
                  ? '已設定'
                  : resendConfigured === false
                    ? '未設定'
                    : '無法確認'}
            </span>
            {resendConfigured === false && '（寄送會失敗，HTML 仍可預覽）'}
          </p>
        </div>
      </div>

      {missingSchema ? (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="content_email_digests 資料表還沒建立（Postgres 42P01）。請先執行本次 migration，再重新載入。"
        />
      ) : initialLoading ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[560px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          <div className="space-y-3">
            <div className="h-40 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
            <div className="h-40 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
          </div>
        </div>
      ) : (
        <>
          {digestsError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-[12.5px] text-rose-800">
              <span className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                讀取寄送紀錄失敗：{digestsError}
              </span>
              <Button variant="outline" size="sm" onClick={() => void refreshDigests()}>
                重試
              </Button>
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            {/* 左：HTML 預覽 */}
            <SectionCard
              icon={Mail}
              title="HTML 預覽"
              description={
                recordHtml
                  ? `顯示 ${formatDigestDate(recordHtml.date)} 的寄送紀錄 HTML`
                  : `即時預覽 ${formatDigestDate(date)} 的日報（不寄信）`
              }
              actions={
                recordHtml ? (
                  <Button variant="ghost" size="sm" onClick={() => setRecordHtml(null)}>
                    回到即時預覽
                  </Button>
                ) : null
              }
            >
              <p className="mb-2 truncate text-[12px] font-medium text-[#0d1a2d]" title={shownSubject}>
                {shownSubject || '（尚未取得主旨）'}
              </p>
              {previewLoading && !recordHtml ? (
                <div className="h-[600px] animate-pulse rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50" />
              ) : shownHtml ? (
                /*
                 * sandbox="" 讓 iframe 成為不含 same-origin／script 的獨立文件：
                 * 郵件 HTML 的 <style> 不會污染 MPS 樣式，也不需要把 HTML inject 主文件。
                 * 等同「在 sandbox iframe 內 dangerouslySetInnerHTML」，但風險更低。
                 */
                <iframe
                  title={`日報 HTML 預覽 ${recordHtml?.date || date}`}
                  srcDoc={shownHtml}
                  sandbox=""
                  className="h-[600px] w-full rounded-md border border-[rgba(13,26,45,0.08)] bg-white"
                />
              ) : previewError ? (
                <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50/60 px-5 text-center">
                  <AlertTriangle size={22} className="text-rose-500" />
                  <p className="text-[13px] font-semibold text-rose-900">無法載入 HTML 預覽</p>
                  <p className="max-w-md text-[12px] leading-relaxed text-rose-800">
                    {previewError}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void loadPreview(date)}>
                    <RefreshCw size={13} />
                    再試一次
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    content-digest 尚未部署或未回傳 preview 時會出現這個錯誤；已寄送／失敗的日報仍可從下方紀錄按「查看」讀取保存的 HTML。
                  </p>
                </div>
              ) : (
                <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[rgba(13,26,45,0.12)] bg-[#fbfdff] px-5 text-center">
                  <Mail size={22} className="text-slate-300" />
                  <p className="text-[13px] font-semibold text-[#0d1a2d]">尚未載入日報 HTML</p>
                  <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                    按右上角「預覽」載入 {formatDigestDate(date)} 的內容。即使未設定 Resend 或尚未寄出，也能在這裡檢視 HTML。
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void loadPreview(date)}>
                    <Eye size={13} />
                    載入預覽
                  </Button>
                </div>
              )}
            </SectionCard>

            {/* 右：收件人／寄送設定／摘要 */}
            <div className="space-y-3">
              <SectionCard
                icon={Users}
                title={`收件人（${recipientCount}）`}
                description="寄送名單存在 content_settings.digest_recipients。"
              >
                {settingsError ? (
                  <p className="text-[12px] text-rose-600">讀取設定失敗：{settingsError}</p>
                ) : settingsLoading ? (
                  <p className="text-[12px] text-muted-foreground">載入設定…</p>
                ) : recipientCount === 0 ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[12px] leading-relaxed text-amber-800">
                    尚未設定收件人；自動日報不會寄出。請到設定頁加入員工或外部電郵。
                  </p>
                ) : (
                  <ul className="max-h-[168px] space-y-1 overflow-y-auto pr-1">
                    {recipients.map((email) => (
                      <li
                        key={email}
                        className="truncate text-[12px] leading-relaxed text-[#0d1a2d]"
                        title={email}
                      >
                        {email}
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 gap-1 px-1.5 text-teal-700"
                  onClick={() => navigate('seo', 'settings')}
                >
                  <Settings2 size={13} />
                  修改收件人與寄送時間
                </Button>
              </SectionCard>

              <SectionCard icon={Send} title="寄送設定">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                  <dt className="text-muted-foreground">寄送時間</dt>
                  <dd className="text-right font-semibold tabular-nums text-[#0d1a2d]">
                    {digestTime}（HKT）
                  </dd>
                  <dt className="text-muted-foreground">自動日報</dt>
                  <dd className="text-right">
                    <ContentStatusPill
                      label={digestEnabled ? '已啟用' : '未啟用'}
                      tone={digestEnabled ? 'teal' : 'slate'}
                    />
                  </dd>
                  <dt className="text-muted-foreground">Resend</dt>
                  <dd className="text-right">
                    <ContentStatusPill
                      label={
                        resend.loading
                          ? '確認中'
                          : resendConfigured === true
                            ? '已設定'
                            : resendConfigured === false
                              ? '未設定'
                              : '無法確認'
                      }
                      tone={
                        resend.loading
                          ? 'slate'
                          : resendConfigured === true
                            ? 'teal'
                            : resendConfigured === false
                              ? 'rose'
                              : 'slate'
                      }
                      title={resend.error || undefined}
                    />
                  </dd>
                  <dt className="text-muted-foreground">最近成功寄送</dt>
                  <dd className="text-right font-medium text-[#0d1a2d]">
                    {lastSent?.sent_at ? formatZoneDateTime(lastSent.sent_at) : '—'}
                  </dd>
                </dl>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  未設定 Resend 時仍可預覽 HTML；寄送失敗會保留 HTML 並可重寄。
                </p>
              </SectionCard>

              <SectionCard
                icon={Mail}
                title="預覽摘要"
                description="來自 content-digest 的 preview.stats（不寄信）。"
              >
                {stats ? (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                    <dt className="text-muted-foreground">今日生成</dt>
                    <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.generated)}</dd>
                    <dt className="text-muted-foreground">待審</dt>
                    <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.pendingReview)}</dd>
                    <dt className="text-muted-foreground">已發布</dt>
                    <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.published)}</dd>
                    <dt className="text-muted-foreground">失敗</dt>
                    <dd className="text-right font-semibold tabular-nums">{formatNumber(stats.failed)}</dd>
                    <dt className="text-muted-foreground">LLM 呼叫</dt>
                    <dd className="text-right font-semibold tabular-nums">
                      {formatNumber(stats.totals?.llmCalls ?? 0)}
                    </dd>
                    <dt className="text-muted-foreground">估算成本</dt>
                    <dd className="text-right font-semibold tabular-nums">
                      {formatUsd(stats.totals?.costUsd ?? 0)}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    按「預覽」載入後，這裡會顯示當日生成、待審、已發布、失敗與 LLM 用量摘要。
                  </p>
                )}
              </SectionCard>
            </div>
          </div>

          {/* 寄送紀錄 */}
          <SectionCard
            icon={RefreshCw}
            title="寄送紀錄"
            description="content_email_digests，最近 30 筆（digest_date 新到舊）。"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshDigests()}
                disabled={digestsLoading}
                title="重新整理寄送紀錄"
              >
                <RefreshCw size={13} className={digestsLoading ? 'animate-spin' : undefined} />
                重新整理
              </Button>
            }
          >
            {digestsLoading && digests.length === 0 ? (
              <div className="space-y-2 py-2">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="h-9 animate-pulse rounded bg-slate-50" />
                ))}
              </div>
            ) : digests.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                尚無寄送紀錄。寄出或重寄後會出現在這裡；寄送失敗的紀錄仍保留 HTML，可在此按「查看」。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-[12.5px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">日期</TableHead>
                      <TableHead className="h-8">狀態</TableHead>
                      <TableHead className="h-8 text-right">收件人數</TableHead>
                      <TableHead className="h-8">寄送時間</TableHead>
                      <TableHead className="h-8">錯誤</TableHead>
                      <TableHead className="h-8 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {digests.map((record: ContentEmailDigest) => {
                      const meta = digestStatusMeta(record.status);
                      return (
                        <TableRow key={record.id || record.digest_date}>
                          <TableCell className="py-2 font-medium tabular-nums text-[#0d1a2d]">
                            {formatDigestDate(record.digest_date)}
                          </TableCell>
                          <TableCell className="py-2">
                            <ContentStatusPill
                              label={meta.label}
                              tone={meta.tone}
                              title={record.error || undefined}
                            />
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums">
                            {record.recipients.length}
                          </TableCell>
                          <TableCell className="py-2 tabular-nums text-muted-foreground">
                            {record.sent_at ? formatZoneDateTime(record.sent_at) : '—'}
                          </TableCell>
                          <TableCell
                            className="max-w-[240px] truncate py-2 text-rose-700"
                            title={record.error || undefined}
                          >
                            {record.error || '—'}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11.5px]"
                                disabled={!record.html}
                                onClick={() =>
                                  setRecordHtml({
                                    date: record.digest_date,
                                    subject: record.subject,
                                    html: record.html,
                                  })
                                }
                              >
                                查看
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11.5px]"
                                disabled={
                                  !canManage ||
                                  sending ||
                                  resendConfigured === false ||
                                  record.status === 'sending'
                                }
                                title={
                                  resendConfigured === false
                                    ? '尚未設定 Resend，無法重寄'
                                    : '以 resend=true 重新寄出（會二次確認）'
                                }
                                onClick={() =>
                                  setConfirm({ kind: 'resend', date: record.digest_date })
                                }
                              >
                                重寄
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* 寄送／重寄二次確認 */}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'resend' ? '確定重寄這份日報？' : '確定寄出日報？'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-[13px] leading-relaxed">
                {confirm ? (
                  <>
                    <p>
                      將{confirm.kind === 'resend' ? '以「重寄」方式重新寄出' : '寄出'}{' '}
                      {formatDigestDate(confirm.date)} 的日報給 {recipientCount} 位收件人。
                    </p>
                    <p>
                      {confirm.kind === 'resend'
                        ? '重寄會保留原本的寄送紀錄，並更新狀態與寄送時間。'
                        : '寄出後會寫入寄送紀錄；若同日已寄過，請改用「重寄」以保留追溯。'}
                    </p>
                    {resendConfigured === false && (
                      <p className="text-rose-600">
                        目前偵測不到 Resend 設定，這次寄送很可能失敗（失敗仍會保留 HTML）。
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={() => {
                if (!confirm) return;
                const target = confirm;
                setConfirm(null);
                void performSend(target);
              }}
            >
              確認寄出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
