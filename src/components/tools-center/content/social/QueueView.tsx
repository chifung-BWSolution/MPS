import { useMemo } from 'react';
import { ArrowRight, Columns3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatZoneDateTime, HONG_KONG_TIME_ZONE } from '@/lib/contentFormat.ts';
import { socialPlatformLabel } from '@/lib/contentSocialGenerate.ts';
import { useSocialWorkspace } from '@/hooks/useSocialWorkspace.ts';
import type { SocialDeskPost } from '@/hooks/useSocialDesk.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { QUEUE_COLUMNS, socialPostStatusMeta } from './socialStatus';

const METRICS = [
  { key: 'pending_review', label: '待審', tone: 'text-amber-700' },
  { key: 'changes_requested', label: '需修改', tone: 'text-amber-700' },
  { key: 'approved', label: '已批准', tone: 'text-teal-700' },
  { key: 'scheduled', label: '已排程', tone: 'text-blue-700' },
  { key: 'publishing', label: '待發佈', tone: 'text-indigo-700' },
  { key: 'published', label: '已發佈', tone: 'text-teal-800' },
  { key: 'failed', label: '失敗', tone: 'text-rose-700' },
];

function postStatus(post: SocialDeskPost): string {
  return post.status || 'draft';
}

function PlatformSummary({ post }: { post: SocialDeskPost }) {
  const byPlatform = useMemo(() => {
    const map = new Map<string, number>();
    for (const target of post.targets) {
      const key = target.platform || 'other';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [post.targets]);

  if (byPlatform.length === 0) {
    return <span className="text-[11px] text-slate-400">尚未綁定帳號</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {byPlatform.map(([platform, count]) => (
        <span
          key={platform}
          className="rounded border border-[rgba(13,26,45,0.08)] bg-white px-1.5 py-[1px] text-[10.5px] text-slate-600"
        >
          {socialPlatformLabel(platform)} · {count}
        </span>
      ))}
    </div>
  );
}

function PostCard({
  post,
  onOpen,
}: {
  post: SocialDeskPost;
  onOpen: (post: SocialDeskPost) => void;
}) {
  const meta = socialPostStatusMeta(post.status);
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="w-full rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 text-left shadow-card transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <ContentStatusPill label={meta.label} tone={meta.tone} />
        {post.group_name && (
          <span className="truncate rounded bg-slate-50 px-1.5 py-[1px] text-[10.5px] font-semibold text-slate-500">
            {post.group_name}
          </span>
        )}
      </div>
      <h3 className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-snug text-[#0d1a2d]">
        {post.title || '（未命名批次）'}
      </h3>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
        熱點：{post.event_title || '—'}
      </p>
      <div className="mt-1.5">
        <PlatformSummary post={post} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
        <span>
          {post.scheduled_at
            ? formatZoneDateTime(post.scheduled_at, HONG_KONG_TIME_ZONE)
            : '未排期'}
        </span>
        <ArrowRight size={11} />
      </div>
    </button>
  );
}

export function QueueView({ navigate }: ContentViewProps) {
  const { data, loading, error, missingSchema, refresh } = useSocialWorkspace();
  const posts = data?.posts ?? [];

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const post of posts) {
      const status = postStatus(post);
      map.set(status, (map.get(status) ?? 0) + 1);
    }
    return map;
  }, [posts]);

  const openPost = (post: SocialDeskPost) => navigate('social', 'studio', post.id);

  const renderBody = () => {
    if (missingSchema) {
      return <ContentEmptyState title="功能尚未啟用" description="資料表尚未建立；請先執行 content migration。" />;
    }
    if (loading && !data) {
      return (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-40 animate-pulse rounded-lg border bg-white" />
          ))}
        </div>
      );
    }
    if (error && !data) {
      return (
        <ContentEmptyState
          tone="error"
          title="讀取批次失敗"
          description={error}
          action={<Button size="sm" variant="outline" onClick={() => void refresh()}>重試</Button>}
        />
      );
    }
    if (posts.length === 0) {
      return (
        <ContentEmptyState
          icon={Columns3}
          title="還沒有批次"
          description="先到熱點雷達貼一個熱點，系統會自動產出「1 篇長文 + 每平台每帳號導流」。"
          action={
            <Button size="sm" onClick={() => navigate('social', 'radar')}>
              去熱點雷達
            </Button>
          }
        />
      );
    }

    return (
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[980px] gap-3">
          {QUEUE_COLUMNS.map((column) => {
            const columnPosts = posts
              .filter((post) => column.statuses.includes(postStatus(post)))
              .sort((left, right) => {
                const leftTime = left.scheduled_at ? new Date(left.scheduled_at).getTime() : 0;
                const rightTime = right.scheduled_at ? new Date(right.scheduled_at).getTime() : 0;
                if (leftTime !== rightTime) return leftTime - rightTime;
                return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
              });
            return (
              <section key={column.id} className="flex w-[240px] shrink-0 flex-col gap-2">
                <header className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 shadow-card">
                  <span className="text-[12px] font-bold text-[#0d1a2d]">{column.label}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                    {columnPosts.length}
                  </span>
                </header>
                <div className="flex flex-col gap-2">
                  {columnPosts.length === 0 ? (
                    <p className="rounded-md border border-dashed border-[rgba(13,26,45,0.1)] px-2 py-4 text-center text-[11px] text-slate-400">
                      暫無批次
                    </p>
                  ) : (
                    columnPosts.map((post) => (
                      <PostCard key={post.id} post={post} onOpen={openPost} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        title="進度看板"
        subtitle="話題 → 待審 → 已排程 → 已發佈；點卡片進審核工作室。"
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('social', 'calendar')}>
            發佈日曆
          </Button>
        }
        meta={
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            {METRICS.map((metric) => (
              <span key={metric.key} className={cn('inline-flex items-center gap-1', metric.tone)}>
                <span className="font-semibold tabular-nums">
                  {(counts.get(metric.key) ?? 0) + (metric.key === 'failed' ? counts.get('publish_failed') ?? 0 : 0)}
                </span>
                <span className="text-muted-foreground">{metric.label}</span>
              </span>
            ))}
            {loading && <Loader2 size={12} className="animate-spin text-slate-400" />}
          </div>
        }
      />
      {renderBody()}
    </div>
  );
}
