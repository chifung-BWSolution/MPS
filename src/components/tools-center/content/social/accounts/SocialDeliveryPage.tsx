/**
 * 社媒半自動交付頁（C）—— `/social-delivery/:postId`
 *
 * 手機優先：複製文案 → 開平台 → 貼上發佈 → 回來標記已發。
 * 只讀取既有稿件資料；「標記已發」呼叫既有 `mark` action，不改審核／排期閘門。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  ImageDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import { formatZoneDateTime } from '@/lib/contentFormat.ts';
import {
  buildDeliveryPlatformGroups,
  deliveryProgress,
  deliveryTargetLabel,
} from '@/lib/contentSocialDelivery.ts';
import {
  fetchSocialDelivery,
  markSocialTargetPublished,
  type SocialDeliveryPost,
} from '@/lib/contentSocialApi.ts';

const HKT = 'Asia/Hong_Kong';

export function SocialDeliveryPage() {
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<SocialDeliveryPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyingKey, setCopyingKey] = useState<string | null>(null);
  const [copyingTarget, setCopyingTarget] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const data = await fetchSocialDelivery(postId);
      setPost(data.post);
      setError(null);
    } catch (thrown) {
      setError(contentErrorMessage(thrown));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(
    () => (post ? buildDeliveryPlatformGroups(post.targets) : []),
    [post],
  );
  const progress = useMemo(
    () => (post ? deliveryProgress(post.targets) : { total: 0, published: 0, remaining: 0 }),
    [post],
  );

  const copyText = async (key: string, text: string) => {
    if (!text.trim()) {
      toast.error('這組還沒有文案，請回 MPS 重新生成');
      return;
    }
    setCopyingKey(key);
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已複製文案');
    } catch {
      toast.error('瀏覽器不允許自動複製，請長按選取文案');
    } finally {
      setCopyingKey(null);
    }
  };

  const markTarget = async (targetId: string, handle: string) => {
    if (!post) return;
    setActing(`target:${targetId}`);
    try {
      await markSocialTargetPublished(post.id, targetId, urlDrafts[targetId] || null);
      toast.success(`已標記 @${handle || ''} 為已發`);
      await load();
    } catch (thrown) {
      toast.error(contentErrorMessage(thrown));
    } finally {
      setActing(null);
    }
  };

  const markAll = async () => {
    if (!post) return;
    setActing('all');
    try {
      await markSocialTargetPublished(post.id);
      toast.success('已把這批全部標記為已發');
      await load();
    } catch (thrown) {
      toast.error(contentErrorMessage(thrown));
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f8fc]">
        <Loader2 size={22} className="animate-spin text-teal-600" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-[#f5f8fc] px-6 text-center">
        <p className="text-[15px] font-bold text-[#0d1a2d]">無法載入交付頁</p>
        <p className="text-[12.5px] text-muted-foreground">{error || '找不到這批稿件'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600"
        >
          <RefreshCw size={13} /> 重試
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f8fc] pb-28">
      <div className="mx-auto max-w-md space-y-3 px-4 py-5">
        {/* 標頭 */}
        <div className="flex items-center justify-between">
          <a
            href="/#tools-center/social-automation?zone=social&page=overview"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700"
          >
            <ArrowLeft size={13} /> 回 MPS
          </a>
          <span className="text-[11px] text-slate-400">
            {post.scheduled_at ? formatZoneDateTime(post.scheduled_at, HKT) : '未排期'}
          </span>
        </div>

        <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card">
          <p className="text-[11px] font-semibold text-teal-700">
            {post.group_name || '全品牌組'}
            {post.event_title ? ` · ${post.event_title}` : ''}
          </p>
          <h1 className="mt-1 text-[18px] font-bold leading-6 text-[#0d1a2d]">{post.title || '（未命名）'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600">
              狀態 {post.status}
            </span>
            <span className="text-slate-500">
              已發 {progress.published}／{progress.total}（剩 {progress.remaining}）
            </span>
          </div>
        </div>

        {/* 封面 */}
        {post.cover_url && (
          <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
            <img src={post.cover_url} alt={post.title} className="aspect-video w-full object-cover" />
            <a
              href={post.cover_url}
              download
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-teal-700"
            >
              <ImageDown size={13} /> 下載封面（1 小時內有效）
            </a>
          </div>
        )}

        {/* 各平台交付卡 */}
        {groups.map((group) => (
          <section
            key={group.platform}
            className="space-y-2 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[#0d1a2d]">{group.label}</h2>
              <span className="text-[11px] text-slate-400">{group.targets.length} 個帳號</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{group.hint}</p>

            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50/70 p-2.5 font-sans text-[12px] leading-relaxed text-slate-700">
              {group.copyText || '（這組還沒有文案，請回 MPS 重新生成）'}
            </pre>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={copyingKey === group.platform || !group.copyText}
                onClick={() => void copyText(group.platform, group.copyText)}
                className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {copyingKey === group.platform ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Copy size={13} />
                )}
                複製文案
              </button>
              {group.links.map((link) => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"
                  title={link.note}
                >
                  <ExternalLink size={13} />
                  {link.label}
                </a>
              ))}
            </div>

            <div className="space-y-2 pt-1">
              {group.targets.map((target) => {
                const done = target.status === 'published';
                return (
                  <div
                    key={target.id}
                    className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[#0d1a2d]">
                        {deliveryTargetLabel(target)}
                      </span>
                      {done ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700">
                          <CheckCheck size={12} /> 已發
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={acting === `target:${target.id}` || acting === 'all'}
                          onClick={() => void markTarget(target.id, target.handle)}
                          className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                        >
                          {acting === `target:${target.id}` ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          標記已發
                        </button>
                      )}
                    </div>
                    {!done && (
                      <input
                        value={urlDrafts[target.id] ?? target.published_url ?? ''}
                        onChange={(event) =>
                          setUrlDrafts((current) => ({ ...current, [target.id]: event.target.value }))
                        }
                        placeholder="平台連結（選填，方便日後追溯）"
                        className="mt-1.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11.5px] text-slate-700"
                      />
                    )}
                    {target.published_url && (
                      <a
                        href={target.published_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-teal-700 underline"
                      >
                        <ExternalLink size={10} /> {target.published_url}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {groups.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            這批還沒有綁定帳號，請先到品牌組加入帳號並重新生成。
          </p>
        )}
      </div>

      {/* 底部固定：全部標記 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">
            已發 {progress.published}／{progress.total}
          </span>
          <button
            type="button"
            disabled={acting === 'all' || progress.total === 0 || progress.remaining === 0}
            onClick={() => void markAll()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0d1a2d] px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            {acting === 'all' ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
            全部標記已發
          </button>
        </div>
      </div>
    </div>
  );
}
