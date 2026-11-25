import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  downloadAsanaAttachment,
  fetchAsanaAttachmentDownload,
  fetchAsanaTaskStories,
  type AsanaAttachment,
  type AsanaTaskComment,
} from '@/lib/asanaPitchingApi';
import {
  attachmentOpenUrl,
  formatAttachmentSize,
  isImageAttachment,
  parseAsanaTaskGidFromLink,
} from '@/lib/asanaTaskLink';

function formatCommentTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-HK', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function AsanaAttachmentImage({ attachment }: { attachment: AsanaAttachment }) {
  const [src, setSrc] = useState(attachment.downloadUrl || attachment.viewUrl || '');
  const [failed, setFailed] = useState(!attachment.downloadUrl && !attachment.viewUrl);

  useEffect(() => {
    setSrc(attachment.downloadUrl || attachment.viewUrl || '');
    setFailed(!attachment.downloadUrl && !attachment.viewUrl);
  }, [attachment.downloadUrl, attachment.gid, attachment.viewUrl]);

  const refreshPreview = useCallback(async () => {
    try {
      const fresh = await fetchAsanaAttachmentDownload(attachment.gid);
      const next = fresh.download_url || fresh.view_url || '';
      if (!next) {
        setFailed(true);
        return;
      }
      setSrc(next);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [attachment.gid]);

  if (failed) {
    return (
      <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-sky-300 bg-sky-50 text-sky-800">
        <ImageIcon size={22} aria-hidden />
        <span className="sr-only">未能載入圖片預覽</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={attachment.name}
      className="max-h-64 w-full rounded-md border border-sky-200 bg-white object-contain"
      onError={() => {
        if (src && src === (attachment.downloadUrl || attachment.viewUrl || '')) {
          void refreshPreview();
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function AsanaAttachmentCard({ attachment }: { attachment: AsanaAttachment }) {
  const [downloading, setDownloading] = useState(false);
  const sizeLabel = formatAttachmentSize(attachment.size);
  const canPreview = isImageAttachment(attachment);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAsanaAttachment(attachment);
    } catch (e) {
      const fallback = attachmentOpenUrl(attachment);
      if (fallback) {
        window.open(fallback, '_blank', 'noopener,noreferrer');
      } else {
        toast.error((e as Error).message || '無法下載附件');
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-white',
        canPreview ? 'border-sky-200' : 'border-slate-200',
      )}
    >
      {canPreview && (
        <div className="bg-sky-50/80 p-2">
          <AsanaAttachmentImage attachment={attachment} />
        </div>
      )}
      <div className={cn('flex items-center gap-2 px-2.5 py-2', canPreview ? 'bg-white' : 'bg-slate-50')}>
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            canPreview ? 'bg-sky-200 text-sky-950' : 'bg-slate-200 text-slate-800',
          )}
        >
          {canPreview ? <ImageIcon size={16} aria-hidden /> : <FileText size={16} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-950" title={attachment.name}>
            {attachment.name}
          </p>
          <p className="text-[12px] text-slate-600">{canPreview ? '圖片' : '檔案'}{sizeLabel ? ` · ${sizeLabel}` : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          aria-label={`下載 ${attachment.name}`}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-sky-300 bg-white px-3 text-[12px] font-medium text-sky-950 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloading ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
          下載
        </button>
      </div>
    </div>
  );
}

function AsanaAttachmentList({ attachments }: { attachments: AsanaAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {attachments.map((attachment) => (
        <AsanaAttachmentCard key={attachment.gid} attachment={attachment} />
      ))}
    </div>
  );
}

function splitCommentText(text: string): Array<{ kind: 'text' | 'link'; value: string }> {
  const re = /https?:\/\/[^\s<>"']+/gi;
  const parts: Array<{ kind: 'text' | 'link'; value: string }> = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) });
    let url = match[0];
    let trail = '';
    while (url && /[.,);:\]]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    if (url) parts.push({ kind: 'link', value: url });
    if (trail) parts.push({ kind: 'text', value: trail });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

function CommentBody({ text }: { text: string }) {
  const parts = splitCommentText(text);
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-950">
      {parts.map((part, index) =>
        part.kind === 'link' ? (
          <a
            key={`${part.kind}-${index}`}
            href={part.value}
            target="_blank"
            rel="noreferrer"
            className="break-all font-medium text-teal-800 underline decoration-teal-400 underline-offset-2 hover:text-teal-950"
          >
            {part.value}
          </a>
        ) : (
          <span key={`${part.kind}-${index}`}>{part.value}</span>
        ),
      )}
    </p>
  );
}

function RecordBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'comment' | 'file' | 'task';
}) {
  const className =
    tone === 'comment'
      ? 'bg-teal-200 text-teal-950'
      : tone === 'file'
        ? 'bg-sky-200 text-sky-950'
        : 'bg-violet-200 text-violet-950';
  return <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', className)}>{children}</span>;
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <MessageSquare size={22} className="mx-auto mb-2 text-slate-400" aria-hidden />
      <p className="text-[13px] leading-6 text-slate-700">{children}</p>
    </div>
  );
}

export function PitchingFollowUpsTab({
  projectId,
  asanaLink,
  asanaTaskGid,
}: {
  projectId: string;
  asanaLink: string;
  asanaTaskGid?: string;
}) {
  const [comments, setComments] = useState<AsanaTaskComment[]>([]);
  const [attachments, setAttachments] = useState<AsanaAttachment[]>([]);
  const [taskName, setTaskName] = useState('');
  const [permalink, setPermalink] = useState(asanaLink);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedLink = asanaLink.trim();
  const canFetch = Boolean(
    projectId || asanaTaskGid || parseAsanaTaskGidFromLink(resolvedLink),
  );

  const load = useCallback(async () => {
    if (!canFetch) {
      setComments([]);
      setAttachments([]);
      setTaskName('');
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await fetchAsanaTaskStories({
        projectId,
        asanaLink: resolvedLink,
      });
      setComments(result.comments || []);
      setAttachments(result.attachments || []);
      setTaskName(result.task_name || '');
      setPermalink(result.asana_link || resolvedLink);
    } catch (e) {
      setComments([]);
      setAttachments([]);
      setError((e as Error).message || '無法載入 Asana 留言');
    } finally {
      setLoading(false);
    }
  }, [canFetch, projectId, resolvedLink]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingLink = !resolvedLink && !asanaTaskGid;
  const missingLinkError = error === '尚未設定 Asana 連結' || error === '無法從 Asana 連結解析任務';
  const commentAttachmentCount = comments.reduce((sum, comment) => sum + (comment.attachments?.length || 0), 0);
  const totalAttachmentCount = attachments.length + commentAttachmentCount;
  const hasContent = comments.length > 0 || attachments.length > 0;

  if ((missingLink && !loading && !hasContent) || (missingLinkError && !loading && !hasContent)) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-8 text-center shadow-card">
        <MessageSquare size={22} className="mx-auto mb-2 text-slate-400" aria-hidden />
        <p className="text-[13px] font-medium text-slate-950">尚未設定 Asana 連結</p>
        <p className="mt-1 text-[13px] leading-6 text-slate-600">請先在基本資訊填寫 Asana 連結，即可載入任務留言。</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-950">
            {taskName || 'Asana 任務留言'}
          </p>
          {loading && !hasContent ? (
            <p className="mt-1 text-[12px] text-slate-600">載入中…</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <RecordBadge tone="comment">{comments.length} 則留言</RecordBadge>
              <RecordBadge tone="file">{totalAttachmentCount} 個附件</RecordBadge>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {permalink && (
            <a
              href={permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-teal-800 hover:bg-teal-50 hover:text-teal-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <ExternalLink size={14} aria-hidden /> 開啟 Asana
            </a>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-[12px] font-medium text-slate-700 hover:bg-muted/50 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(loading && 'motion-safe:animate-spin')} aria-hidden />
            重新整理
          </button>
        </div>
      </div>

      {loading && !hasContent ? (
        <div className="px-5 py-10 text-center text-[13px] text-slate-600">
          <Loader2 size={20} className="mx-auto mb-2 motion-safe:animate-spin text-teal-700" aria-hidden />
          正在載入 Asana 留言…
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] leading-6 text-amber-950">{error}</p>
        </div>
      ) : !hasContent ? (
        <EmptyNote>此 Asana 任務尚無留言或附件</EmptyNote>
      ) : (
        <div className="space-y-4 bg-[#f5f8fc] p-4">
          {attachments.length > 0 && (
            <section className="rounded-md border border-violet-200 bg-violet-50 p-3">
              <p className="flex flex-wrap items-center gap-2 text-[12px] text-violet-950">
                <RecordBadge tone="task">任務附件</RecordBadge>
                <span>{attachments.length} 個</span>
              </p>
              <div className="mt-2">
                <AsanaAttachmentList attachments={attachments} />
              </div>
            </section>
          )}

          {comments.length > 0 ? (
            <ol className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-700">
                    <RecordBadge tone="comment">留言</RecordBadge>
                    <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
                    <span className="font-medium text-slate-900">{comment.authorName}</span>
                  </p>
                  {comment.text && (
                    <div className="mt-2 rounded-md bg-white px-3 py-2">
                      <CommentBody text={comment.text} />
                    </div>
                  )}
                  {comment.attachments?.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="flex flex-wrap items-center gap-2 text-[12px] text-sky-950">
                        <RecordBadge tone="file">留言附件</RecordBadge>
                        <span>{comment.attachments.length} 個</span>
                      </p>
                      <AsanaAttachmentList attachments={comment.attachments} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-[13px] text-teal-950">
              此 Asana 任務尚無留言
            </p>
          )}
        </div>
      )}
    </div>
  );
}
