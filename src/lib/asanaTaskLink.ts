/** Parse an Asana task GID from permalink, inbox URL, or a bare numeric id. */
export function parseAsanaTaskGidFromLink(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (/^\d{6,}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    const digits = value.match(/\d{6,}/g);
    return digits?.[digits.length - 1] ?? null;
  }

  const path = url.pathname.replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);

  const taskIdx = parts.lastIndexOf('task');
  if (taskIdx >= 0 && parts[taskIdx + 1] && /^\d+$/.test(parts[taskIdx + 1]!)) {
    return parts[taskIdx + 1]!;
  }

  const listIdx = parts.lastIndexOf('list');
  if (listIdx >= 0 && parts[listIdx + 1] && /^\d+$/.test(parts[listIdx + 1]!)) {
    return parts[listIdx + 1]!;
  }

  if (parts[0] === '0' && parts.length >= 3) {
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
  }

  const queryGid = url.searchParams.get('task') || url.searchParams.get('focus');
  if (queryGid && /^\d+$/.test(queryGid)) return queryGid;

  const digits = path.match(/\d{6,}/g);
  return digits?.[digits.length - 1] ?? null;
}

export type AsanaAttachment = {
  gid: string;
  name: string;
  createdAt: string;
  resourceSubtype?: string;
  size?: number | null;
  downloadUrl?: string | null;
  viewUrl?: string | null;
  permanentUrl?: string | null;
  host?: string | null;
};

export type AsanaAttachmentLike = {
  gid?: string;
  name?: string | null;
  created_at?: string;
  resource_subtype?: string;
  size?: number | null;
  download_url?: string | null;
  view_url?: string | null;
  permanent_url?: string | null;
  host?: string | null;
};

export type AsanaTaskComment = {
  id: string;
  createdAt: string;
  authorName: string;
  text: string;
  attachments: AsanaAttachment[];
};

export type AsanaStoryLike = {
  gid?: string;
  created_at?: string;
  created_by?: { gid?: string; name?: string } | null;
  text?: string | null;
  html_text?: string | null;
  type?: string;
  resource_subtype?: string;
  attachments?: AsanaAttachmentLike[] | null;
};

export function isAsanaChatStory(story: AsanaStoryLike): boolean {
  return story.resource_subtype === 'comment_added' || story.type === 'comment';
}

export function stripAsanaHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function mapAsanaAttachment(raw: AsanaAttachmentLike | null | undefined): AsanaAttachment | null {
  const gid = raw?.gid?.trim();
  if (!gid) return null;
  return {
    gid,
    name: raw?.name?.trim() || '未命名附件',
    createdAt: raw?.created_at || '',
    resourceSubtype: raw?.resource_subtype || undefined,
    size: typeof raw?.size === 'number' && Number.isFinite(raw.size) ? raw.size : null,
    downloadUrl: raw?.download_url || null,
    viewUrl: raw?.view_url || null,
    permanentUrl: raw?.permanent_url || null,
    host: raw?.host || null,
  };
}

export function mapAsanaAttachments(raw: AsanaAttachmentLike[] | null | undefined): AsanaAttachment[] {
  return (raw || [])
    .map(mapAsanaAttachment)
    .filter((item): item is AsanaAttachment => item != null);
}

export function isImageAttachment(attachment: Pick<AsanaAttachment, 'name'>): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.name || '');
}

export function formatAttachmentSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function attachmentOpenUrl(attachment: AsanaAttachment): string | null {
  return attachment.downloadUrl || attachment.viewUrl || attachment.permanentUrl || null;
}

export function asanaStoryToComment(story: AsanaStoryLike): AsanaTaskComment | null {
  if (!isAsanaChatStory(story)) return null;
  const attachments = mapAsanaAttachments(story.attachments);
  const text = story.text?.trim() || (story.html_text ? stripAsanaHtml(story.html_text) : '');
  if (!text && attachments.length === 0) return null;
  return {
    id: story.gid || `story_${story.created_at || Date.now()}`,
    createdAt: story.created_at || '',
    authorName: story.created_by?.name?.trim() || 'Asana',
    text,
    attachments,
  };
}
