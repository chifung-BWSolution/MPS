import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Send,
  XCircle,
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
import { nextPublishAtHkt, socialPlatformLabel } from '@/lib/contentSocialGenerate.ts';
import { toZoneInputValue, fromZoneInputValue } from '@/lib/contentPlanner.ts';
import {
  findSocialPost,
  groupTargetsByPlatform,
  useSocialWorkspace,
} from '@/hooks/useSocialWorkspace.ts';
import type { SocialDeskPost } from '@/hooks/useSocialDesk.ts';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { ContentPageHeader } from '../shell/ContentPageHeader';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentStatusPill } from '../shell/ContentStatusPill';
import { ArticleBodyPreview } from '../seo/ArticleEditor';
import { socialPostStatusMeta } from './socialStatus';

type PlatformGroup = ReturnType<typeof groupTargetsByPlatform>[number];

export function StudioView({ route, navigate }: ContentViewProps) {
  const workspace = useSocialWorkspace();
  const { data, loading, error, missingSchema } = workspace;
  const post = findSocialPost(data, route.id);

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
        title="讀取批次失敗"
        description={error}
        action={<Button size="sm" variant="outline" onClick={() => void workspace.refresh()}>重試</Button>}
      />
    );
  }
  if (!post) {
    return (
      <ContentEmptyState
        title="請選擇一批稿件"
        description="從進度看板點一張卡片，或先到熱點雷達產生內容。"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate('social', 'queue')}>進度看板</Button>
            <Button size="sm" variant="outline" onClick={() => navigate('social', 'radar')}>熱點雷達</Button>
          </div>
        }
      />
    );
  }

  return <StudioBody post={post} workspace={workspace} navigate={navigate} />;
}

interface StudioBodyProps {
  post: SocialDeskPost;
  workspace: ReturnType<typeof useSocialWorkspace>;
  navigate: ContentViewProps['navigate'];
}

function StudioBody({ post, workspace, navigate }: StudioBodyProps) {
  const { acting, refresh, updatePost, updateTarget, review, buildPackage, markPublished } = workspace;
  const meta = socialPostStatusMeta(post.status);
  const groups = useMemo(() => groupTargetsByPlatform(post.targets), [post.targets]);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(post.title);
  const [bodyMd, setBodyMd] = useState(post.body_md);
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [markOpen, setMarkOpen] = useState(false);
  const [markUrl, setMarkUrl] = useState('');

  useEffect(() => {
    setTitle(post.title);
    setBodyMd(post.body_md);
    setEditing(false);
    setCopies({});
    // 只在切換批次時重置；輪詢更新不覆蓋正在編輯的內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  useEffect(() => {
    setCopies((previous) => {
      const next: Record<string, string> = {};
      for (const group of groups) {
        next[group.platform] = previous[group.platform] ?? group.copyText;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map((group) => `${group.platform}:${group.copyText}`).join('|')]);

  const approvable = ['pending_review', 'changes_requested'].includes(post.status);
  const deployable = ['approved', 'scheduled', 'publishing'].includes(post.status);
  const reviewBusy = acting === `review:${post.id}`;
  const packageBusy = acting === `package:${post.id}`;

  const saveArticle = async () => {
    if (!title.trim() || !bodyMd.trim()) {
      toast.error('標題與正文不可空白');
      return;
    }
    try {
      await updatePost(post.id, { title: title.trim(), body_md: bodyMd });
      toast.success('已儲存長文');
      setEditing(false);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '儲存失敗');
    }
  };

  const saveCopy = async (group: PlatformGroup) => {
    const text = (copies[group.platform] ?? '').trim();
    if (!text) {
      toast.error('文案不可空白');
      return;
    }
    try {
      for (const target of group.targets) {
        await updateTarget(target.id, text);
      }
      toast.success(`${socialPlatformLabel(group.platform)} 文案已更新`);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '更新文案失敗');
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
      toast.success('已複製');
    } catch {
      toast.error('瀏覽器阻擋了剪貼簿，請手動選取複製');
    }
  };

  const openSchedule = () => {
    const suggested = post.scheduled_at ?? nextPublishAtHkt();
    setScheduleValue(toZoneInputValue(suggested, HONG_KONG_TIME_ZONE));
    setScheduleOpen(true);
  };

  const submitSchedule = async () => {
    const iso = fromZoneInputValue(scheduleValue, HONG_KONG_TIME_ZONE);
    if (!iso) {
      toast.error('請選擇有效的時間');
      return;
    }
    try {
      await review(post.id, 'approve', { scheduledAt: iso });
      setScheduleOpen(false);
      toast.success('已批准並排期');
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '批准失敗');
    }
  };

  const submitReject = async () => {
    try {
      await review(post.id, 'reject', { reason: rejectReason.trim() || undefined });
      setRejectOpen(false);
      setRejectReason('');
      toast.success('已退回修改');
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '退回失敗');
    }
  };

  const downloadPackage = async () => {
    try {
      const result = await buildPackage(post.id);
      window.open(result.signed_url, '_blank', 'noopener,noreferrer');
      toast.success(`已產生內容包 ${result.filename}`);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '產生內容包失敗');
    }
  };

  const submitMarkAll = async () => {
    try {
      await markPublished(post.id, undefined, markUrl.trim() || undefined);
      setMarkOpen(false);
      setMarkUrl('');
      toast.success('已標記全部帳號為已發佈');
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : '標記失敗');
    }
  };

  return (
    <div className="space-y-4">
      <ContentPageHeader
        eyebrow={
          <button
            type="button"
            onClick={() => navigate('social', 'queue')}
            className="inline-flex items-center gap-1 hover:text-teal-700"
          >
            <ArrowLeft size={12} /> 進度看板
          </button>
        }
        title={post.title || '（未命名批次）'}
        subtitle={`${post.group_name ?? '全品牌組'} · 熱點：${post.event_title || '—'}`}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
            <ContentStatusPill label={meta.label} tone={meta.tone} />
            <span>{post.scheduled_at ? `排定 ${formatZoneDateTime(post.scheduled_at, HONG_KONG_TIME_ZONE)}` : '未排期'}</span>
            <span>· {post.targets.length} 個帳號</span>
            <span>· {post.generator === 'grok' ? 'AI 生成' : '模板草稿'}</span>
          </div>
        }
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refresh()}>
            <Clock size={13} /> 重新整理
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-[#0d1a2d]">
              <FileText size={14} className="text-teal-600" /> 站內長文
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11.5px]"
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil size={12} /> {editing ? '取消編輯' : '編輯長文'}
            </Button>
          </div>
          {editing ? (
            <div className="space-y-2">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 bg-white text-[14px] font-semibold" />
              <Textarea
                value={bodyMd}
                onChange={(event) => setBodyMd(event.target.value)}
                className="min-h-[420px] bg-white font-mono text-[12.5px]"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => void saveArticle()}>
                  儲存變更
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[820px]">
              <h1 className="text-[24px] font-bold leading-snug text-[#0d1a2d]">{post.title}</h1>
              <div className="mt-3 text-[14px] leading-7 text-[#1f2937]">
                <ArticleBodyPreview markdown={post.body_md} />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
            <h2 className="mb-2 text-[13px] font-bold text-[#0d1a2d]">平台導流文案</h2>
            {groups.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">這批尚未綁定帳號。</p>
            ) : (
              <div className="space-y-2.5">
                {groups.map((group) => {
                  const key = `${post.id}:${group.platform}`;
                  return (
                    <div key={group.platform} className="rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold text-[#0d1a2d]">
                          {socialPlatformLabel(group.platform)}
                          <span className="ml-1 font-normal text-slate-400">{group.targets.length} 個帳號</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10.5px]"
                            onClick={() => void copyText(key, copies[group.platform] ?? group.copyText)}
                          >
                            {copied === key ? <Check size={11} /> : <Copy size={11} />}
                            {copied === key ? '已複製' : '複製'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-1.5 text-[10.5px]"
                            disabled={!!acting}
                            onClick={() => void saveCopy(group)}
                          >
                            儲存文案
                          </Button>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {group.targets.map((target) => (
                          <span
                            key={target.id}
                            className="rounded border border-[rgba(13,26,45,0.08)] bg-white px-1.5 py-[1px] text-[10.5px] text-slate-600"
                          >
                            @{target.handle || '—'}
                            {target.status === 'published' && (
                              <span className="ml-1 text-teal-700">已發</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <Textarea
                        value={copies[group.platform] ?? group.copyText}
                        onChange={(event) =>
                          setCopies((previous) => ({ ...previous, [group.platform]: event.target.value }))
                        }
                        className="mt-1.5 min-h-[110px] bg-white text-[12px]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
            <h2 className="mb-2 text-[13px] font-bold text-[#0d1a2d]">帳號狀態</h2>
            <ul className="space-y-1">
              {post.targets.map((target) => (
                <li key={target.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-slate-600">
                    {socialPlatformLabel(target.platform)} · @{target.handle || '—'}
                  </span>
                  <span className={cn('shrink-0 text-[10.5px]', target.status === 'published' ? 'text-teal-700' : 'text-slate-400')}>
                    {target.status === 'published' ? '已發佈' : '待發'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-3 shadow-card">
        <div className="text-[11.5px] text-muted-foreground">
          {approvable
            ? '通過後會排入發佈佇列；未批准前不會上線。'
            : deployable
              ? '內容包可交付人工貼上；貼好後回 MPS 標記已發。'
              : '這批已完成，可回去看其他批次。'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {approvable && (
            <>
              <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)} disabled={!!acting}>
                <XCircle size={13} /> 退回修改
              </Button>
              <Button size="sm" className="gap-1.5" onClick={openSchedule} disabled={reviewBusy}>
                {reviewBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                通過並排期
              </Button>
            </>
          )}
          {deployable && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void downloadPackage()} disabled={packageBusy}>
                {packageBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                下載內容包
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setMarkOpen(true)} disabled={!!acting}>
                <Check size={13} /> 標記全部已發
              </Button>
            </>
          )}
          {post.status === 'published' && post.targets[0]?.published_url && (
            <a
              href={post.targets[0].published_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[12px] text-teal-700 hover:underline"
            >
              <ExternalLink size={12} /> 已發佈連結
            </a>
          )}
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>通過並排期</DialogTitle>
            <DialogDescription>選一個香港時間；到點前仍可在日曆改期。</DialogDescription>
          </DialogHeader>
          <Input
            type="datetime-local"
            value={scheduleValue}
            onChange={(event) => setScheduleValue(event.target.value)}
            className="h-10 bg-white text-[13px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>取消</Button>
            <Button onClick={() => void submitSchedule()} disabled={reviewBusy}>確認批准</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>退回修改</DialogTitle>
            <DialogDescription>寫下原因，下一輪編輯會看到。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="例如：第二段需要更具體的例子"
            className="min-h-[90px] bg-white text-[13px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>取消</Button>
            <Button onClick={() => void submitReject()} disabled={reviewBusy}>確認退回</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>標記全部已發</DialogTitle>
            <DialogDescription>貼上已發佈的連結（可留空）；標記後這批會進「已發佈」。</DialogDescription>
          </DialogHeader>
          <Input
            value={markUrl}
            onChange={(event) => setMarkUrl(event.target.value)}
            placeholder="https://www.instagram.com/p/…"
            className="h-9 bg-white text-[13px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkOpen(false)}>取消</Button>
            <Button onClick={() => void submitMarkAll()} disabled={!!acting}>確認標記</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
