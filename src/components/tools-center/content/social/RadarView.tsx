import { useMemo, useState } from 'react';
import {
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatZoneDateTime, HONG_KONG_TIME_ZONE } from '@/lib/contentFormat.ts';
import { useSocialWorkspace } from '@/hooks/useSocialWorkspace.ts';
import type { SocialDeskEvent } from '@/hooks/useSocialDesk.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { RadarCsvImportDialog } from './RadarCsvImportDialog';
import { relativeFromNow } from './socialStatus';

type StatusFilter = 'all' | 'open' | 'used' | 'ignored';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'open', label: '待生成' },
  { id: 'used', label: '已生成' },
  { id: 'ignored', label: '已忽略' },
];

const EVENT_STATUS_META: Record<string, { label: string; tone: 'slate' | 'teal' | 'muted' }> = {
  open: { label: '待生成', tone: 'amber' as never },
  used: { label: '已生成', tone: 'teal' },
  ignored: { label: '已忽略', tone: 'muted' },
};

function eventStatus(event: SocialDeskEvent): { label: string; tone: 'slate' | 'teal' | 'amber' | 'muted' } {
  if (event.status === 'used') return { label: '已生成', tone: 'teal' };
  if (event.status === 'ignored') return { label: '已忽略', tone: 'muted' };
  return { label: '待生成', tone: 'amber' };
}

export function RadarView({ navigate }: ContentViewProps) {
  const {
    data,
    loading,
    error,
    missingSchema,
    acting,
    refresh,
    createEvent,
    importEvents,
    generateNow,
  } = useSocialWorkspace();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const events = data?.events ?? [];
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return events.filter((event) => {
      if (statusFilter !== 'all' && event.status !== statusFilter) return false;
      if (!keyword) return true;
      return (
        event.title.toLowerCase().includes(keyword) ||
        (event.summary ?? '').toLowerCase().includes(keyword)
      );
    });
  }, [events, search, statusFilter]);

  const counts = useMemo(() => {
    const open = events.filter((event) => event.status === 'open').length;
    const used = events.filter((event) => event.status === 'used').length;
    return { open, used, total: events.length };
  }, [events]);

  const handleAdd = async () => {
    if (title.trim().length < 2) {
      toast.error('請輸入熱點標題（至少 2 個字）');
      return;
    }
    setSubmitting(true);
    try {
      await createEvent({
        title: title.trim(),
        ...(url.trim() ? { url: url.trim() } : {}),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
      });
      toast.success('已加入熱點，正在產生內容');
      setTitle('');
      setUrl('');
      setSummary('');
      setAddOpen(false);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '加入失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerate = async (event: SocialDeskEvent) => {
    try {
      const result = await generateNow(event.id);
      toast.success(
        result.duplicate
          ? '這個熱點與既有事件重複，已併入同一件事，不重複產稿'
          : result.created > 0
            ? `已產生 ${result.created} 篇稿件`
            : '目前沒有可產稿的品牌組或帳號',
      );
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '生成失敗');
    }
  };

  const renderBody = () => {
    if (missingSchema) {
      return (
        <ContentEmptyState
          title="功能尚未啟用"
          description="資料表尚未建立；請先執行 content migration。"
        />
      );
    }
    if (loading && !data) {
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white" />
          ))}
        </div>
      );
    }
    if (error && !data) {
      return (
        <ContentEmptyState
          tone="error"
          title="讀取熱點失敗"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              重試
            </Button>
          }
        />
      );
    }
    if (events.length === 0) {
      return (
        <ContentEmptyState
          title="還沒有熱點"
          description="貼上一個標題，或等系統每小時自動抓取；新熱點會在 2 分鐘內自動產稿。"
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={13} /> 貼上熱點
            </Button>
          }
        />
      );
    }
    if (filtered.length === 0) {
      return (
        <ContentEmptyState
          title="沒有符合條件的熱點"
          description="試試清除搜尋或切換狀態篩選。"
          action={
            <Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); }}>
              清除篩選
            </Button>
          }
        />
      );
    }

    return (
      <ul className="space-y-2">
        {filtered.map((event) => {
          const meta = eventStatus(event);
          const busy = acting === `generate_now:${event.id}`;
          return (
            <li
              key={event.id}
              className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start gap-3">
                <HeatBadge heat={event.heat} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {event.url ? (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="min-w-0 truncate text-[14px] font-semibold text-[#0d1a2d] underline-offset-2 hover:text-teal-700 hover:underline"
                      >
                        {event.title || '（未命名熱點）'}
                      </a>
                    ) : (
                      <span className="min-w-0 truncate text-[14px] font-semibold text-[#0d1a2d]">
                        {event.title || '（未命名熱點）'}
                      </span>
                    )}
                    <ContentStatusPill label={meta.label} tone={meta.tone} />
                    <span className="rounded border border-[rgba(13,26,45,0.08)] bg-slate-50 px-1.5 py-[1px] text-[10.5px] font-semibold text-slate-500">
                      {event.source === 'rss' ? '自動抓取' : '人工貼上'}
                    </span>
                  </div>
                  {event.summary && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                      {event.summary}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span title={formatZoneDateTime(event.created_at, HONG_KONG_TIME_ZONE)}>
                      {relativeFromNow(event.created_at)}
                    </span>
                    <span>已生成 {event.post_count} 批</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={event.post_count > 0 ? 'outline' : 'default'}
                    disabled={!!acting}
                    onClick={() => void handleGenerate(event)}
                    title="立即產稿（同一事件只產一篇，重複的會自動併入既有事件）"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {event.post_count > 0 ? '再生成' : '立即生成'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('social', 'queue')}
                    disabled={event.post_count === 0}
                  >
                    查看批次
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        title="熱點雷達"
        subtitle="系統每小時自動抓取 RSS；貼上的熱點會在 2 分鐘內自動產稿，你也可以按「立即生成」。"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCsvOpen(true)}>
              <FileUp size={13} /> 匯入 CSV
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus size={13} /> 貼上熱點
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
              重新整理
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>共 {counts.total} 則</span>
            <span className="text-amber-700">待生成 {counts.open}</span>
            <span className="text-teal-700">已生成 {counts.used}</span>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋標題或摘要"
            className="h-9 bg-white pl-8 text-[13px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors',
                statusFilter === filter.id
                  ? 'bg-[#0d1a2d] text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {renderBody()}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>貼上熱點</DialogTitle>
            <DialogDescription>
              標題必填；有摘要可以讓文章更貼題。加入後會立即產稿。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-slate-600">標題</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：秋冬轉季護膚品點樣換？"
                className="h-9 bg-white text-[13px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-slate-600">原文連結（選填）</span>
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
                className="h-9 bg-white text-[13px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-semibold text-slate-600">摘要（選填）</span>
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="一兩句說明這則熱點的重點"
                className="min-h-[76px] bg-white text-[13px]"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void handleAdd()} disabled={submitting}>
              {submitting ? '加入中…' : '加入並生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RadarCsvImportDialog
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImport={importEvents}
      />
    </div>
  );
}

function HeatBadge({ heat }: { heat: number }) {
  const tone =
    heat >= 80
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : heat >= 60
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-50 text-slate-500';
  return (
    <span
      title={`熱度 ${heat}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-bold tabular-nums',
        tone,
      )}
    >
      <Trash2 size={10} className="hidden" />
      🔥 {Math.round(heat)}
    </span>
  );
}
