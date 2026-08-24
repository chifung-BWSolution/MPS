import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2, MessageSquare, Paperclip, RefreshCw } from 'lucide-react';
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function authorInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'A';
  return trimmed.slice(0, 1).toUpperCase();
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
      <div className="h-28 rounded-md bg-white border border-[rgba(13,26,45,0.08)] flex items-center justify-center text-muted-foreground">
        <ImageIcon size={20} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={attachment.name}
      className="h-28 w-full object-cover rounded-md bg-white border border-[rgba(13,26,45,0.08)]"
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

function AsanaAttachmentCard({
  attachment,
  compact = false,
}: {
  attachment: AsanaAttachment;
  compact?: boolean;
}) {
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
        'rounded-md border border-[rgba(13,26,45,0.08)] bg-white overflow-hidden',
        compact ? 'min-w-[180px] max-w-[240px]' : '',
      )}
    >
      {canPreview && (
        <AsanaAttachmentImage attachment={attachment} />
      )}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="w-7 h-7 rounded-md bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
          {canPreview ? <ImageIcon size={14} /> : <FileText size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium truncate" title={attachment.name}>
            {attachment.name}
          </p>
          {sizeLabel && <p className="text-[11px] text-muted-foreground">{sizeLabel}</p>}
        </div>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-teal-700 hover:bg-teal-50 disabled:opacity-50 shrink-0"
        >
          {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          下載
        </button>
      </div>
    </div>
  );
}

function AsanaAttachmentList({
  attachments,
  compact = false,
}: {
  attachments: AsanaAttachment[];
  compact?: boolean;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
      {attachments.map((attachment) => (
        <AsanaAttachmentCard key={attachment.gid} attachment={attachment} compact={compact} />
      ))}
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
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
        <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-[13px] text-muted-foreground">尚未設定 Asana 連結</p>
        <p className="text-[12px] text-muted-foreground/80 mt-1">請先在基本資訊填寫 Asana 連結，即可載入任務留言。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate">
            {taskName || 'Asana 任務留言'}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {loading
              ? '載入中…'
              : `${comments.length} 則留言 · ${totalAttachmentCount} 個附件`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {permalink && (
            <a
              href={permalink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[12px] text-teal-700 hover:text-teal-800"
            >
              <ExternalLink size={12} /> 開啟 Asana
            </a>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            重新整理
          </button>
        </div>
      </div>

      {loading && !hasContent ? (
        <div className="p-10 text-center text-[13px] text-muted-foreground">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin text-teal-600" />
          正在載入 Asana 留言…
        </div>
      ) : error ? (
        <div className="p-8 text-center">
          <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-amber-800">{error}</p>
        </div>
      ) : !hasContent ? (
        <div className="p-8 text-center">
          <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">此 Asana 任務尚無留言或附件</p>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {attachments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                <Paperclip size={13} />
                任務附件（{attachments.length}）
              </div>
              <AsanaAttachmentList attachments={attachments} />
            </div>
          )}

          {comments.length > 0 ? (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 text-[12px] font-semibold flex items-center justify-center shrink-0">
                    {authorInitial(comment.authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[13px] font-medium">{comment.authorName}</span>
                      <span className="text-[11px] text-muted-foreground">{formatCommentTime(comment.createdAt)}</span>
                    </div>
                    {comment.text && (
                      <div className="mt-1 rounded-md bg-[#f5f8fc] border border-[rgba(13,26,45,0.06)] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                        {comment.text}
                      </div>
                    )}
                    {comment.attachments?.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Paperclip size={11} />
                          留言附件
                        </div>
                        <AsanaAttachmentList attachments={comment.attachments} compact />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">此 Asana 任務尚無留言</p>
          )}
        </div>
      )}
    </div>
  );
}
