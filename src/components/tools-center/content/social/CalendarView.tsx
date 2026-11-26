import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatZoneDateTime, HONG_KONG_TIME_ZONE, zoneDateString } from '@/lib/contentFormat.ts';
import { socialPlatformLabel } from '@/lib/contentSocialGenerate.ts';
import { useSocialWorkspace } from '@/hooks/useSocialWorkspace.ts';
import type { SocialDeskPost } from '@/hooks/useSocialDesk.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { socialPostStatusMeta } from './socialStatus';

function startOfWeekHkt(offsetWeeks = 0): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HONG_KONG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const localNoon = Date.UTC(read('year'), read('month') - 1, read('day'), 4, 0, 0); // HKT 12:00
  const day = new Date(localNoon).getUTCDay();
  const diffToMonday = (day === 0 ? 7 : day) - 1;
  const monday = new Date(localNoon - diffToMonday * 86_400_000 + offsetWeeks * 7 * 86_400_000);
  return monday;
}

function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * 86_400_000));
}

function hktDateOf(iso: string | null): string {
  if (!iso) return '';
  return zoneDateString(new Date(iso), HONG_KONG_TIME_ZONE);
}

export function CalendarView({ navigate }: ContentViewProps) {
  const { data, loading, error, missingSchema, acting, refresh, schedulePost } = useSocialWorkspace();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragging, setDragging] = useState<SocialDeskPost | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);

  const monday = useMemo(() => startOfWeekHkt(weekOffset), [weekOffset]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const dayKeys = days.map((day) => hktDateOf(day.toISOString()));

  const posts = data?.posts ?? [];
  const scheduled = posts.filter((post) => post.scheduled_at);
  const unscheduled = posts.filter(
    (post) =>
      !post.scheduled_at &&
      ['approved', 'pending_review', 'changes_requested'].includes(post.status),
  );

  const postsForDay = (dateKey: string) =>
    scheduled
      .filter((post) => hktDateOf(post.scheduled_at) === dateKey)
      .sort(
        (left, right) =>
          new Date(left.scheduled_at ?? 0).getTime() - new Date(right.scheduled_at ?? 0).getTime(),
      );

  const handleDrop = async (dateKey: string) => {
    if (!dragging) return;
    const iso = new Date(`${dateKey}T10:00:00+08:00`).toISOString();
    try {
      await schedulePost(dragging.id, iso);
      toast.success(`已改期至 ${dateKey} 10:00`);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '改期失敗');
    } finally {
      setDragging(null);
      setHoverDay(null);
    }
  };

  const renderCard = (post: SocialDeskPost, draggable: boolean) => {
    const meta = socialPostStatusMeta(post.status);
    const locked = ['publishing', 'published'].includes(post.status);
    return (
      <button
        key={post.id}
        type="button"
        draggable={draggable && !locked}
        onDragStart={() => setDragging(post)}
        onDragEnd={() => {
          setDragging(null);
          setHoverDay(null);
        }}
        onClick={() => navigate('social', 'studio', post.id)}
        className={cn(
          'w-full rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-2 text-left shadow-card transition-shadow hover:shadow-card-hover',
          draggable && !locked ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <ContentStatusPill label={meta.label} tone={meta.tone} />
          {locked && <span title="已鎖定">🔒</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-[11.5px] font-semibold leading-snug text-[#0d1a2d]">
          {post.title || '（未命名批次）'}
        </p>
        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
          {post.group_name || '全品牌組'} · {post.targets.length} 帳號
        </p>
        {post.scheduled_at && (
          <p className="text-[10.5px] text-slate-400">
            {formatZoneDateTime(post.scheduled_at, HONG_KONG_TIME_ZONE).slice(-5)}
          </p>
        )}
      </button>
    );
  };

  const renderBody = () => {
    if (missingSchema) {
      return <ContentEmptyState title="功能尚未啟用" description="資料表尚未建立；請先執行 content migration。" />;
    }
    if (loading && !data) {
      return <div className="h-72 animate-pulse rounded-lg border bg-white" />;
    }
    if (error && !data) {
      return (
        <ContentEmptyState
          tone="error"
          title="讀取日曆失敗"
          description={error}
          action={<Button size="sm" variant="outline" onClick={() => void refresh()}>重試</Button>}
        />
      );
    }
    return (
      <>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[980px] gap-2">
            {days.map((day, index) => {
              const key = dayKeys[index];
              const list = postsForDay(key);
              const isToday = key === hktDateOf(new Date().toISOString());
              return (
                <section
                  key={key}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setHoverDay(key);
                  }}
                  onDragLeave={() => setHoverDay((current) => (current === key ? null : current))}
                  onDrop={() => void handleDrop(key)}
                  className={cn(
                    'flex min-h-[280px] min-w-[130px] flex-1 flex-col gap-1.5 rounded-lg border p-2 transition-colors',
                    isToday ? 'border-teal-300 bg-teal-50/40' : 'border-[rgba(13,26,45,0.08)] bg-white/60',
                    hoverDay === key && 'border-teal-400 bg-teal-50',
                  )}
                >
                  <header className="flex items-baseline justify-between px-0.5">
                    <span className={cn('text-[11.5px] font-bold', isToday ? 'text-teal-700' : 'text-slate-500')}>
                      {key.slice(5)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {['一', '二', '三', '四', '五', '六', '日'][index]}
                    </span>
                  </header>
                  {list.length === 0 ? (
                    <p className="mt-3 text-center text-[10.5px] text-slate-300">—</p>
                  ) : (
                    list.map((post) => renderCard(post, true))
                  )}
                </section>
              );
            })}
          </div>
        </div>

        <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
          <h3 className="mb-2 text-[12.5px] font-bold text-[#0d1a2d]">未排期</h3>
          {unscheduled.length === 0 ? (
            <p className="text-[11.5px] text-muted-foreground">沒有待排期的批次。</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unscheduled.map((post) => (
                <div
                  key={post.id}
                  draggable
                  onDragStart={() => setDragging(post)}
                  onDragEnd={() => setDragging(null)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  {renderCard(post, true)}
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        title="發佈日曆"
        subtitle="拖動批次改期（預設 10:00）；已發佈或有待發的批次不可拖。"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((value) => value - 1)}>
              <ChevronLeft size={13} /> 上一週
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
              本週
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((value) => value + 1)}>
              下一週 <ChevronRight size={13} />
            </Button>
          </>
        }
        meta={
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <CalendarDays size={13} />
            本週 {scheduled.filter((post) => dayKeys.includes(hktDateOf(post.scheduled_at))).length} 批
            {acting && <Loader2 size={11} className="animate-spin" />}
          </div>
        }
      />
      {renderBody()}
    </div>
  );
}
