import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAsanaTaskStories, type AsanaTaskComment } from '@/lib/asanaPitchingApi';
import { parseAsanaTaskGidFromLink } from '@/lib/asanaTaskLink';

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
      setTaskName(result.task_name || '');
      setPermalink(result.asana_link || resolvedLink);
    } catch (e) {
      setComments([]);
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

  if ((missingLink && !loading && !comments.length) || (missingLinkError && !loading && !comments.length)) {
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
            {loading ? '載入中…' : `${comments.length} 則留言`}
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

      {loading && comments.length === 0 ? (
        <div className="p-10 text-center text-[13px] text-muted-foreground">
          <Loader2 size={20} className="mx-auto mb-2 animate-spin text-teal-600" />
          正在載入 Asana 留言…
        </div>
      ) : error ? (
        <div className="p-8 text-center">
          <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-amber-800">{error}</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="p-8 text-center">
          <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">此 Asana 任務尚無留言</p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
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
                <div className="mt-1 rounded-md bg-[#f5f8fc] border border-[rgba(13,26,45,0.06)] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                  {comment.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
