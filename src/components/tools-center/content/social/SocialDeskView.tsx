/**
 * 社媒自動化營運 · 今日工作（`social/overview`）
 *
 * 一個畫面走完「熱點 → 自動生成 → 審核 → 待發佈 → 已發佈」：
 *   左欄 熱點雷達：一個「貼上熱點」入口（標題／連結／摘要），未產稿的熱點可直接「立即生成」
 *   右欄 自動產出：每批一張卡，平台分組複製導流文案、展開長文、
 *                  通過並排期／駁回／標記已發（整批或逐帳號回填）
 *
 * 所有數字與卡片都來自 `content-social`（透過 useSocialDesk）；本檔不寫死任何資料，
 * 也不自行算統計。畫面每 20 秒自動同步，右上角顯示最後同步時間。
 *
 * 四態：首次 loading 骨架／error 可重試／missingSchema「功能尚未啟用」／空資料引導。
 */

import { useCallback, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Copy,
  DatabaseZap,
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import {
  HONG_KONG_TIME_ZONE,
  formatRelativeHours,
  formatZoneDateTime,
  hoursBetween,
  zoneTimeString,
} from '@/lib/contentFormat.ts';
import { platformOrder, socialPlatformLabel } from '@/lib/contentSocialGenerate.ts';
import { ContentApiError, contentErrorMessage } from '@/lib/contentApi.ts';
import type { ContentStatusTone } from '@/lib/contentState.ts';
import { useSocialDesk } from '@/hooks/useSocialDesk';
import type {
  SocialDeskEvent,
  SocialDeskPost,
  SocialDeskStats,
  SocialDeskTarget,
} from '@/hooks/useSocialDesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { ContentMetricBar, type ContentMetricItem } from '../shell/ContentMetricBar';

// ============================================================
// 常數與對照表
// ============================================================

/** 長文預覽字數（不引入 markdown 套件，直接顯示純文字） */
const LONG_BODY_PREVIEW_LIMIT = 1200;
/** 左欄一次最多顯示的熱點數（其餘用「共 N 個」提示，不假裝全部顯示） */
const EVENT_DISPLAY_LIMIT = 30;
/** 右欄一次最多顯示的批次數（待審／待發佈永遠排最前） */
const POST_DISPLAY_LIMIT = 24;

const EMPTY_STATS: SocialDeskStats = {
  openEvents: 0,
  pendingReview: 0,
  readyToPublish: 0,
  publishedToday: 0,
  accounts: 0,
  groups: 0,
};

/** 可審核（出現「通過並排期／駁回」）的狀態 */
const APPROVABLE_STATUSES = new Set<string>(['pending_review', 'changes_requested']);
/** 可標記已發（出現「待發佈／標記全部已發」）的狀態；failed 也給手動出口 */
const DEPLOYABLE_STATUSES = new Set<string>(['approved', 'scheduled', 'publishing', 'failed']);

/** 批次狀態 → 標籤與色票（社媒自己的狀態機，不套用文章狀態機） */
const POST_STATUS_META: Record<string, { label: string; tone: ContentStatusTone }> = {
  draft: { label: '草稿', tone: 'slate' },
  pending_review: { label: '待審', tone: 'amber' },
  changes_requested: { label: '需修改', tone: 'amber' },
  approved: { label: '已批准', tone: 'teal' },
  scheduled: { label: '已排期', tone: 'blue' },
  publishing: { label: '待手動發佈', tone: 'indigo' },
  published: { label: '已發佈', tone: 'teal-dark' },
  failed: { label: '失敗', tone: 'rose' },
  cancelled: { label: '已取消', tone: 'muted' },
};

/** 待處理的排前面：待審 → 需修改 → 已批准 → 已排期 → 待手動發佈 → 失敗 → 已發佈 → 已取消 */
const POST_STATUS_ORDER = [
  'pending_review',
  'changes_requested',
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'failed',
  'published',
  'cancelled',
];

/** 帳號（target）狀態點 */
const TARGET_STATUS_META: Record<string, { label: string; dot: string }> = {
  pending: { label: '待發', dot: 'bg-slate-300' },
  copied: { label: '已複製文案', dot: 'bg-blue-500' },
  published: { label: '已發', dot: 'bg-teal-500' },
  failed: { label: '發佈失敗', dot: 'bg-rose-500' },
  skipped: { label: '略過', dot: 'bg-slate-300' },
};

function postStatusMeta(status: string) {
  return POST_STATUS_META[status] ?? { label: status || '未知', tone: 'slate' as ContentStatusTone };
}

function targetStatusMeta(status: string) {
  return (
    TARGET_STATUS_META[status] ?? {
      label: status || '未知',
      dot: 'bg-slate-300',
    }
  );
}

// ============================================================
// 小工具
// ============================================================

function relativeFromNow(iso: string | null | undefined): string {
  const hours = hoursBetween(iso);
  if (hours == null) return '—';
  if (hours < 1) return '剛剛';
  return `${formatRelativeHours(hours)}前`;
}

/** 右上角「剛剛更新」：跟著每次 refresh（含 20 秒 polling）更新 */
function updatedLabel(timestamp: number | null): string {
  if (timestamp == null) return '等待同步';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 45) return '剛剛更新';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前更新`;
  return `${zoneTimeString(new Date(timestamp), HONG_KONG_TIME_ZONE)} 更新`;
}

function buildSubtitle(stats: SocialDeskStats, hasData: boolean): string {
  if (!hasData) {
    return '熱點掃描、長文與各平台導流自動生成；你只需要決定哪一批可以發。';
  }
  const parts: string[] = [];
  if (stats.openEvents > 0) parts.push(`${stats.openEvents} 個熱點待處理`);
  if (stats.pendingReview > 0) parts.push(`${stats.pendingReview} 批待審`);
  if (stats.readyToPublish > 0) parts.push(`${stats.readyToPublish} 批待發佈`);
  if (stats.publishedToday > 0) parts.push(`今日已發 ${stats.publishedToday} 則`);
  if (parts.length === 0) {
    return '今天還沒有新熱點；貼上一個標題，系統會自動產出長文與各平台導流。';
  }
  return `${parts.join(' · ')}；系統每 2 分鐘自動掃描新熱點。`;
}

interface PlatformGroup {
  platform: string;
  targets: SocialDeskTarget[];
  /** 同平台各帳號共用一份文案（PRD §10），取第一個有內容的 */
  copyText: string;
}

function groupTargetsByPlatform(targets: SocialDeskTarget[]): PlatformGroup[] {
  const buckets = new Map<string, SocialDeskTarget[]>();
  for (const target of targets) {
    const platform = target.platform || 'other';
    const bucket = buckets.get(platform);
    if (bucket) bucket.push(target);
    else buckets.set(platform, [target]);
  }
  return [...buckets.entries()]
    .map(([platform, list]) => ({
      platform,
      targets: list,
      copyText: list.find((item) => item.copy_text.trim())?.copy_text ?? list[0]?.copy_text ?? '',
    }))
    .sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
}

// ============================================================
// 版面小元件
// ============================================================

function DeskCard({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: ComponentType<LucideProps>;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card',
        className,
      )}
    >
      <header className="flex items-start gap-2 border-b border-[rgba(13,26,45,0.06)] px-3.5 py-2.5">
        {Icon && <Icon size={14} strokeWidth={1.9} className="mt-0.5 shrink-0 text-teal-600" />}
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-bold text-[#0d1a2d]">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="px-3.5 py-3">{children}</div>
    </section>
  );
}

function HeatBadge({ heat }: { heat: number }) {
  const toneClass =
    heat >= 80
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : heat >= 60
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span
      title={`熱度 ${heat}／100`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-[1px] text-[10.5px] font-bold leading-4 tabular-nums',
        toneClass,
      )}
    >
      <Flame size={9} strokeWidth={2.4} />
      {heat}
    </span>
  );
}

function DeskSkeleton() {
  const cardClass = 'animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card';
  return (
    <div className="space-y-4">
      <div className={cn(cardClass, 'h-[52px]')} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={cn(cardClass, 'h-[420px]')} />
        <div className="space-y-3">
          <div className={cn(cardClass, 'h-[176px]')} />
          <div className={cn(cardClass, 'h-[176px]')} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 熱點雷達 · 單一熱點
// ============================================================

function EventRow({
  event,
  acting,
  onGenerate,
}: {
  event: SocialDeskEvent;
  acting: string | null;
  onGenerate: (eventId: string) => void;
}) {
  const busy = acting === `generate_now:${event.id}`;
  const title = event.title || '（未命名熱點）';
  const statusNote =
    event.status === 'used' ? '已使用' : event.status === 'ignored' ? '已略過' : null;

  return (
    <li className="rounded-md border border-[rgba(13,26,45,0.08)] bg-white px-2.5 py-2 transition-colors hover:border-[rgba(13,26,45,0.16)]">
      <div className="flex items-start gap-2">
        <HeatBadge heat={event.heat} />
        <div className="min-w-0 flex-1">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              title="開啟原文"
              className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[#0d1a2d] underline-offset-2 hover:text-teal-700 hover:underline"
            >
              {title}
            </a>
          ) : (
            <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[#0d1a2d]">
              {title}
            </div>
          )}

          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
            {event.summary || '只貼了標題；生成時會自動補上摘要'}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
            {event.post_count > 0 ? (
              <span className="font-semibold text-teal-700">已生成 {event.post_count} 批</span>
            ) : (
              <button
                type="button"
                onClick={() => onGenerate(event.id)}
                disabled={!!acting}
                title="立即產出長文與各平台導流"
                className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-[1px] text-[10.5px] font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} strokeWidth={2.4} />}
                立即生成
              </button>
            )}
            <span className="text-muted-foreground" title={formatZoneDateTime(event.created_at, HONG_KONG_TIME_ZONE)}>
              {relativeFromNow(event.created_at)}
            </span>
            {statusNote && <span className="text-slate-400">{statusNote}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

// ============================================================
// 自動產出 · 單一批次
// ============================================================

interface PostCardProps {
  post: SocialDeskPost;
  acting: string | null;
  copiedKey: string | null;
  onApprove: (post: SocialDeskPost) => void;
  onReject: (post: SocialDeskPost) => void;
  onMarkAll: (post: SocialDeskPost) => void;
  onMarkTarget: (post: SocialDeskPost, target: SocialDeskTarget) => void;
  onCopy: (postId: string, platform: string, text: string) => void;
}

function PostCard({
  post,
  acting,
  copiedKey,
  onApprove,
  onReject,
  onMarkAll,
  onMarkTarget,
  onCopy,
}: PostCardProps) {
  const meta = postStatusMeta(post.status);
  const groups = useMemo(() => groupTargetsByPlatform(post.targets), [post.targets]);
  const approvable = APPROVABLE_STATUSES.has(post.status);
  const deployable = DEPLOYABLE_STATUSES.has(post.status);
  // 逐帳號「已發」只在已批准／已發佈的批次出現，避免把待審內容直接標成已發
  const canMarkTarget = deployable || post.status === 'published';
  const publishedAt = post.targets.find((target) => target.published_at)?.published_at ?? null;

  const scheduledLabel = post.scheduled_at
    ? `排定 ${formatZoneDateTime(post.scheduled_at, HONG_KONG_TIME_ZONE)}`
    : post.approved_at
      ? `批准 ${formatZoneDateTime(post.approved_at, HONG_KONG_TIME_ZONE)}`
      : '未排期';

  const bodyPreview =
    post.body_md.length > LONG_BODY_PREVIEW_LIMIT
      ? `${post.body_md.slice(0, LONG_BODY_PREVIEW_LIMIT)}\n\n…（僅顯示前 ${LONG_BODY_PREVIEW_LIMIT} 字）`
      : post.body_md;

  const reviewBusy = acting === `review:${post.id}`;
  const markBusy = acting === `mark:${post.id}`;

  return (
    <article className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3.5 shadow-card transition-shadow hover:shadow-card-hover">
      {/* 狀態／品牌組／熱點／排定時間 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ContentStatusPill label={meta.label} tone={meta.tone} />
        {post.group_name && (
          <span className="rounded border border-[rgba(13,26,45,0.08)] bg-slate-50 px-1.5 py-[1px] text-[10.5px] font-semibold text-slate-600">
            {post.group_name}
          </span>
        )}
        <span
          title={post.generator === 'grok' ? '由 Grok 生成' : '模板快版（未呼叫模型）'}
          className={cn(
            'rounded border px-1.5 py-[1px] text-[10.5px] font-semibold',
            post.generator === 'grok'
              ? 'border-teal-200 bg-teal-50 text-teal-700'
              : 'border-slate-200 bg-white text-slate-500',
          )}
        >
          {post.generator === 'grok' ? 'AI 生成' : '模板草稿'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={post.event_title}>
          熱點：{post.event_title || '—'}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title="香港時間">
          {scheduledLabel}
        </span>
      </div>

      <h3 className="mt-1.5 text-[15px] font-bold leading-snug text-[#0d1a2d]">
        {post.title || '（未命名長文）'}
      </h3>

      {/* 平台分組：平台名 + 帳號 chips + 複製文案 */}
      {groups.length > 0 ? (
        <div className="mt-2.5 space-y-1.5">
          {groups.map((group) => {
            const copyKey = `${post.id}:${group.platform}`;
            const copied = copiedKey === copyKey;
            return (
              <div
                key={group.platform}
                className="rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="text-[11.5px] font-bold text-[#0d1a2d]">
                      {socialPlatformLabel(group.platform)}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {group.targets.length} 個帳號
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!group.copyText.trim()}
                    title="複製這一組的導流文案"
                    onClick={() => onCopy(post.id, group.platform, group.copyText)}
                    className={cn(
                      'inline-flex h-6 shrink-0 items-center gap-1 rounded border px-1.5 text-[10.5px] font-semibold transition-colors',
                      copied
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-[rgba(13,26,45,0.08)] bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {copied ? <Check size={10} strokeWidth={2.4} /> : <Copy size={10} strokeWidth={2.2} />}
                    {copied ? '已複製' : '複製文案'}
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {group.targets.map((target) => {
                    const targetMeta = targetStatusMeta(target.status);
                    const targetBusy = acting === `mark:${post.id}:${target.id}`;
                    return (
                      <span
                        key={target.id}
                        className="inline-flex items-center gap-1 rounded border border-[rgba(13,26,45,0.08)] bg-white px-1.5 py-[2px] text-[10.5px]"
                      >
                        <span
                          title={`狀態：${targetMeta.label}`}
                          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', targetMeta.dot)}
                        />
                        <span className="font-semibold text-[#0d1a2d]">@{target.handle || '—'}</span>
                        {target.display_name && (
                          <span className="max-w-[96px] truncate text-muted-foreground">
                            {target.display_name}
                          </span>
                        )}
                        {target.published_url && (
                          <a
                            href={target.published_url}
                            target="_blank"
                            rel="noreferrer"
                            title="開啟已發佈連結"
                            className="text-teal-700 hover:text-teal-800"
                          >
                            <ExternalLink size={10} strokeWidth={2.2} />
                          </a>
                        )}
                        {canMarkTarget && target.status !== 'published' && (
                          <button
                            type="button"
                            disabled={!!acting}
                            title="標記這個帳號已發"
                            onClick={() => onMarkTarget(post, target)}
                            className="ml-0.5 inline-flex items-center rounded px-1 py-[1px] text-[10px] font-semibold text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {targetBusy ? <Loader2 size={9} className="animate-spin" /> : '已發'}
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-dashed border-[rgba(13,26,45,0.12)] bg-slate-50/60 px-2.5 py-2 text-[11px] text-muted-foreground">
          這批還沒有綁定帳號；在品牌組加入帳號後重新生成，就會長出各平台導流。
        </p>
      )}

      {/* 長文（純文字，不解析 markdown） */}
      {bodyPreview.trim() && (
        <details className="mt-2.5 rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/70 px-2.5 py-2">
          <summary className="cursor-pointer select-none text-[11.5px] font-semibold text-teal-700">
            查看長文（{Math.min(LONG_BODY_PREVIEW_LIMIT, post.body_md.length)} 字）
          </summary>
          <pre className="mt-2 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11.5px] leading-relaxed text-slate-700">
            {bodyPreview}
          </pre>
        </details>
      )}

      {/* 動作 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[rgba(13,26,45,0.06)] pt-2.5">
        {approvable ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={!!acting}
              onClick={() => onApprove(post)}
              className="h-7 gap-1 bg-teal-600 px-2 text-[11px] hover:bg-teal-700"
            >
              {reviewBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={2.4} />}
              通過並排期
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!acting}
              onClick={() => onReject(post)}
              className="h-7 gap-1 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <X size={11} strokeWidth={2.4} />
              駁回
            </Button>
          </>
        ) : deployable ? (
          <>
            {post.status === 'failed' ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                <AlertTriangle size={11} strokeWidth={2.2} />
                發佈失敗，可手動補發
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                <Send size={11} strokeWidth={2.2} />
                待發佈
              </span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!acting}
              onClick={() => onMarkAll(post)}
              className="h-7 gap-1 border-teal-200 px-2 text-[11px] text-teal-700 hover:bg-teal-50"
            >
              {markBusy ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} strokeWidth={2.2} />}
              標記全部已發
            </Button>
          </>
        ) : post.status === 'published' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700">
            <CheckCheck size={11} strokeWidth={2.2} />
            已發佈
            {publishedAt && (
              <span className="font-normal text-muted-foreground">
                {' '}
                {formatZoneDateTime(publishedAt, HONG_KONG_TIME_ZONE)}
              </span>
            )}
          </span>
        ) : post.status === 'cancelled' ? (
          <span className="text-[11px] text-slate-400">已取消，不會出現在待發佈清單</span>
        ) : post.status === 'draft' ? (
          <span className="text-[11px] text-slate-500">草稿，等待送審</span>
        ) : (
          <span className="text-[11px] text-muted-foreground">狀態：{meta.label}</span>
        )}

        <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">
          {post.targets.length} 個帳號 · {relativeFromNow(post.created_at)}建立
        </span>
      </div>
    </article>
  );
}

// ============================================================
// 頁面
// ============================================================

export function SocialDeskView({ route, navigate }: ContentViewProps) {
  // 今日工作固定是 overview，不在頁內切換子頁；route／navigate 由外殼注入以符合頁面契約。
  void route;
  void navigate;

  const {
    data,
    loading,
    error,
    missingSchema,
    refresh,
    createEvent,
    generateNow,
    review,
    markPublished,
    acting,
    lastUpdatedAt,
  } = useSocialDesk();

  const [refreshing, setRefreshing] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteSummary, setPasteSummary] = useState('');

  const [rejectPost, setRejectPost] = useState<SocialDeskPost | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [markPost, setMarkPost] = useState<SocialDeskPost | null>(null);
  const [markUrl, setMarkUrl] = useState('');

  const [copyFallback, setCopyFallback] = useState<{ platform: string; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** 右欄一次顯示的批次數；「顯示更多」只加不減，避免長清單一次畫完 */
  const [postLimit, setPostLimit] = useState(POST_DISPLAY_LIMIT);

  const stats = data?.stats ?? EMPTY_STATS;
  const hasData = Boolean(data);

  // ---- 資料排序（待處理的永遠最前，讓「今天要做什麼」一眼看到） ----
  const events = useMemo(() => {
    const list = [...(data?.events ?? [])];
    list.sort((a, b) => {
      const aHandled = a.post_count > 0 ? 1 : 0;
      const bHandled = b.post_count > 0 ? 1 : 0;
      if (aHandled !== bHandled) return aHandled - bHandled;
      if (b.heat !== a.heat) return b.heat - a.heat;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return list;
  }, [data?.events]);

  const posts = useMemo(() => {
    const list = [...(data?.posts ?? [])];
    list.sort((a, b) => {
      const aIndex = POST_STATUS_ORDER.indexOf(a.status);
      const bIndex = POST_STATUS_ORDER.indexOf(b.status);
      const aRank = aIndex < 0 ? POST_STATUS_ORDER.length : aIndex;
      const bRank = bIndex < 0 ? POST_STATUS_ORDER.length : bIndex;
      if (aRank !== bRank) return aRank - bRank;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return list;
  }, [data?.posts]);

  const visibleEvents = events.slice(0, EVENT_DISPLAY_LIMIT);
  const visiblePosts = posts.slice(0, postLimit);

  const metricItems = useMemo<ContentMetricItem[]>(
    () => [
      {
        label: '今日熱點',
        value: stats.openEvents,
        tone: stats.openEvents > 0 ? 'info' : 'default',
        hint: '還沒產稿的熱點數',
      },
      {
        label: '待審',
        value: stats.pendingReview,
        tone: stats.pendingReview > 0 ? 'warn' : 'default',
        hint: '等你決定通過或駁回',
      },
      {
        label: '待發佈',
        value: stats.readyToPublish,
        tone: stats.readyToPublish > 0 ? 'info' : 'default',
        hint: '已批准／已排期，等待貼上平台',
      },
      {
        label: '今日已發',
        value: stats.publishedToday,
        tone: stats.publishedToday > 0 ? 'ok' : 'default',
        hint: '今天已發佈的導流數（每個帳號一則）',
      },
      {
        label: '帳號',
        value: stats.accounts,
        tone: 'default',
        hint: `${stats.groups} 個品牌組`,
      },
    ],
    [stats],
  );

  const creating = acting === 'create_event';
  const rejecting = rejectPost ? acting === `review:${rejectPost.id}` : false;
  const markingAll = markPost ? acting === `mark:${markPost.id}` : false;

  const toastError = useCallback((thrown: unknown, fallback: string) => {
    if (thrown instanceof ContentApiError && thrown.code === 'no_accounts') {
      toast.error('請先建立品牌組與社群帳號');
      return;
    }
    toast.error(contentErrorMessage(thrown) || fallback);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handlePasteSubmit = async () => {
    const title = pasteTitle.trim();
    if (!title) {
      toast.error('請填熱點標題');
      return;
    }
    try {
      await createEvent({ title, url: pasteUrl, summary: pasteSummary });
      toast.success('已加入，正在產生內容');
      setPasteOpen(false);
      setPasteTitle('');
      setPasteUrl('');
      setPasteSummary('');
    } catch (thrown) {
      toastError(thrown, '加入熱點失敗');
    }
  };

  const handleGenerate = async (eventId: string) => {
    try {
      await generateNow(eventId);
      toast.success('已產出長文與各平台導流');
    } catch (thrown) {
      toastError(thrown, '生成失敗');
    }
  };

  const handleApprove = async (post: SocialDeskPost) => {
    try {
      await review(post.id, 'approve');
      toast.success('已通過，排入待發佈');
    } catch (thrown) {
      toastError(thrown, '審核失敗');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectPost) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('請填寫駁回原因');
      return;
    }
    try {
      await review(rejectPost.id, 'reject', { reason });
      toast.success('已駁回，這批回到需修改');
      setRejectPost(null);
      setRejectReason('');
    } catch (thrown) {
      toastError(thrown, '駁回失敗');
    }
  };

  const handleMarkAllSubmit = async () => {
    if (!markPost) return;
    const url = markUrl.trim();
    try {
      await markPublished(markPost.id, undefined, url || undefined);
      toast.success('已標記全部已發');
      setMarkPost(null);
      setMarkUrl('');
    } catch (thrown) {
      toastError(thrown, '標記失敗');
    }
  };

  const handleMarkTarget = async (post: SocialDeskPost, target: SocialDeskTarget) => {
    try {
      await markPublished(post.id, target.id);
      toast.success(`已標記 @${target.handle || '帳號'} 為已發`);
    } catch (thrown) {
      toastError(thrown, '標記失敗');
    }
  };

  const handleCopy = async (postId: string, platform: string, text: string) => {
    if (!text.trim()) {
      toast.error('這組還沒有文案');
      return;
    }
    const key = `${postId}:${platform}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${socialPlatformLabel(platform)} 文案已複製`);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      setCopyFallback({ platform, text });
      toast.error('瀏覽器不允許剪貼簿存取，已開窗讓你手動複製');
    }
  };

  const subtitle = buildSubtitle(stats, hasData);
  const updated = updatedLabel(lastUpdatedAt);

  const renderBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="社媒自動營運需要的資料表還沒建立；請先執行 migration，再按「重新檢查」。"
          action={
            <Button size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
              重新檢查
            </Button>
          }
        />
      );
    }

    if (loading && !data) {
      return <DeskSkeleton />;
    }

    if (error && !data) {
      return (
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="今日工作載入失敗"
          description={error}
          action={
            <Button size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
              再試一次
            </Button>
          }
        />
      );
    }

    return (
      <>
        <ContentMetricBar items={metricItems} loading={loading || refreshing} />

        {error && data && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
            <AlertTriangle size={13} strokeWidth={2.2} className="shrink-0" />
            <span className="min-w-0 flex-1">自動更新失敗：{error}（繼續顯示上一次成功的資料）</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="h-7 px-2 text-[11px]"
            >
              再試一次
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* ---- 左：熱點雷達 ---- */}
          <DeskCard
            icon={Radar}
            title="熱點雷達"
            description="貼上熱點後，系統會立即產出長文與各平台導流。"
          >
            <Button
              type="button"
              size="sm"
              onClick={() => setPasteOpen(true)}
              className="h-9 w-full justify-center gap-1 bg-teal-600 text-[12px] hover:bg-teal-700"
            >
              <Plus size={12} strokeWidth={2.4} />
              貼上熱點
            </Button>

            <div className="mt-2.5 max-h-[520px] overflow-y-auto pr-1">
              {visibleEvents.length === 0 ? (
                <ContentEmptyState
                  icon={Radar}
                  title="貼上第一個熱點"
                  description="系統會在 2 分鐘內自動產出長文與各平台導流，或按「立即生成」。"
                  className="px-4 py-9 shadow-none"
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPasteOpen(true)}
                      className="h-7 gap-1 px-2 text-[11px]"
                    >
                      <Plus size={11} strokeWidth={2.4} />
                      貼上熱點
                    </Button>
                  }
                />
              ) : (
                <ul className="space-y-1.5">
                  {visibleEvents.map((event) => (
                    <EventRow key={event.id} event={event} acting={acting} onGenerate={handleGenerate} />
                  ))}
                </ul>
              )}
            </div>

            {events.length > visibleEvents.length && (
              <p className="mt-2 text-[10.5px] text-muted-foreground">
                只顯示前 {visibleEvents.length} 個熱點，共 {events.length} 個。
              </p>
            )}
          </DeskCard>

          {/* ---- 右：自動產出 ---- */}
          <div className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} strokeWidth={1.9} className="text-teal-600" />
                <h2 className="text-[14px] font-bold text-[#0d1a2d]">自動產出</h2>
                <span className="text-[11px] text-muted-foreground">
                  {posts.length} 批 · 由熱點自動生成
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                待審 {stats.pendingReview} · 待發佈 {stats.readyToPublish}
              </span>
            </div>

            {visiblePosts.length === 0 ? (
              <ContentEmptyState
                icon={Sparkles}
                title="還沒有產出"
                description="加入一個熱點，系統會自動產生 1 篇長文 + 每平台每帳號一條導流。"
                action={
                  <Button
                    size="sm"
                    onClick={() => setPasteOpen(true)}
                    className="gap-1 bg-teal-600 hover:bg-teal-700"
                  >
                    <Plus size={13} strokeWidth={2.4} />
                    貼上熱點
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {visiblePosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    acting={acting}
                    copiedKey={copiedKey}
                    onApprove={handleApprove}
                    onReject={(target) => {
                      setRejectPost(target);
                      setRejectReason('');
                    }}
                    onMarkAll={(target) => {
                      setMarkPost(target);
                      setMarkUrl('');
                    }}
                    onMarkTarget={handleMarkTarget}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            )}

            {posts.length > visiblePosts.length && (
              <button
                type="button"
                onClick={() => setPostLimit((current) => current + POST_DISPLAY_LIMIT)}
                className="w-full rounded-md border border-dashed border-[rgba(13,26,45,0.12)] bg-white px-3 py-2 text-[11px] font-semibold text-teal-700 transition-colors hover:border-teal-200 hover:bg-teal-50"
              >
                顯示更多批次（還有 {posts.length - visiblePosts.length} 批）
              </button>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        eyebrow={
          <>
            {hasData && (
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            自動營運中
          </>
        }
        title="今日工作"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
              title="每 20 秒自動同步；熱點由系統每 2 分鐘掃描"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  refreshing || loading ? 'animate-pulse bg-amber-400' : 'bg-teal-500',
                )}
              />
              {updated}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
              重新整理
            </Button>
            <Button
              size="sm"
              onClick={() => setPasteOpen(true)}
              className="gap-1.5 bg-teal-600 hover:bg-teal-700"
            >
              <Plus size={13} strokeWidth={2.4} />
              貼上熱點
            </Button>
          </div>
        }
      />

      {renderBody()}

      {/* ---- 貼上熱點 ---- */}
      <Dialog
        open={pasteOpen}
        onOpenChange={(next) => {
          if (creating) return;
          setPasteOpen(next);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[16px]">
              <Plus size={16} strokeWidth={2.2} className="text-teal-600" />
              貼上熱點
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              標題必填。加入後系統立即產出 1 篇長文，並為每個品牌組的每個帳號產一條導流。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">標題（必填）</span>
              <Input
                autoFocus
                value={pasteTitle}
                onChange={(changeEvent) => setPasteTitle(changeEvent.target.value)}
                placeholder="例如：旅客深圳口岸排隊三小時"
                disabled={creating}
                className="mt-1 h-9 text-[12.5px]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">連結（選填）</span>
              <Input
                value={pasteUrl}
                onChange={(changeEvent) => setPasteUrl(changeEvent.target.value)}
                placeholder="https://..."
                disabled={creating}
                className="mt-1 h-9 text-[12.5px]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">摘要（選填）</span>
              <Textarea
                value={pasteSummary}
                onChange={(changeEvent) => setPasteSummary(changeEvent.target.value)}
                rows={3}
                placeholder="一兩句說清楚發生什麼事；摘要會影響長文與導流的切入角度。"
                disabled={creating}
                className="mt-1 min-h-[72px] text-[12.5px]"
              />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => setPasteOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!pasteTitle.trim() || creating}
              onClick={() => void handlePasteSubmit()}
              className="gap-1.5 bg-teal-600 hover:bg-teal-700"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={2.4} />}
              加入並立即生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- 駁回原因 ---- */}
      <Dialog
        open={Boolean(rejectPost)}
        onOpenChange={(next) => {
          if (rejecting) return;
          if (!next) {
            setRejectPost(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px]">駁回這批</DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              {rejectPost?.title || '（未命名長文）'}
              <br />
              請寫下駁回原因，方便下一輪修正。
            </DialogDescription>
          </DialogHeader>

          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">原因（必填）</span>
            <Textarea
              autoFocus
              value={rejectReason}
              onChange={(changeEvent) => setRejectReason(changeEvent.target.value)}
              rows={3}
              placeholder="例如：標題太軟、缺少地區資訊、導流文案重複"
              disabled={rejecting}
              className="mt-1 min-h-[84px] text-[12.5px]"
            />
          </label>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rejecting}
              onClick={() => {
                setRejectPost(null);
                setRejectReason('');
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!rejectReason.trim() || rejecting}
              onClick={() => void handleRejectSubmit()}
              className="gap-1.5 bg-rose-600 hover:bg-rose-700"
            >
              {rejecting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={2.4} />}
              確認駁回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- 標記全部已發 ---- */}
      <Dialog
        open={Boolean(markPost)}
        onOpenChange={(next) => {
          if (markingAll) return;
          if (!next) {
            setMarkPost(null);
            setMarkUrl('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px]">標記全部已發</DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              {markPost?.title || '（未命名長文）'}
              <br />
              貼上平台後回填連結（選填）；沒有連結也可以先標記，狀態會同步到今日已發。
            </DialogDescription>
          </DialogHeader>

          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">平台連結（選填）</span>
            <Input
              autoFocus
              value={markUrl}
              onChange={(changeEvent) => setMarkUrl(changeEvent.target.value)}
              placeholder="https://www.instagram.com/p/..."
              disabled={markingAll}
              className="mt-1 h-9 text-[12.5px]"
            />
          </label>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markingAll}
              onClick={() => {
                setMarkPost(null);
                setMarkUrl('');
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={markingAll}
              onClick={() => void handleMarkAllSubmit()}
              className="gap-1.5 bg-teal-600 hover:bg-teal-700"
            >
              {markingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} strokeWidth={2.2} />}
              確認已發
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- 剪貼簿被封鎖時的手動複製 ---- */}
      <Dialog
        open={Boolean(copyFallback)}
        onOpenChange={(next) => {
          if (!next) setCopyFallback(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[16px]">
              {copyFallback ? socialPlatformLabel(copyFallback.platform) : ''} 文案
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">
              瀏覽器拒絕剪貼簿存取，請按 Ctrl／⌘ + C 複製以下文案。
            </DialogDescription>
          </DialogHeader>

          <Textarea
            readOnly
            value={copyFallback?.text ?? ''}
            onFocus={(focusEvent) => focusEvent.currentTarget.select()}
            className="min-h-[220px] font-mono text-[11.5px] leading-relaxed"
          />

          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => setCopyFallback(null)}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
