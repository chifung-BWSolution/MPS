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

export type AsanaTaskComment = {
  id: string;
  createdAt: string;
  authorName: string;
  text: string;
};

export type AsanaStoryLike = {
  gid?: string;
  created_at?: string;
  created_by?: { gid?: string; name?: string } | null;
  text?: string | null;
  html_text?: string | null;
  type?: string;
  resource_subtype?: string;
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

export function asanaStoryToComment(story: AsanaStoryLike): AsanaTaskComment | null {
  if (!isAsanaChatStory(story)) return null;
  const text = story.text?.trim() || (story.html_text ? stripAsanaHtml(story.html_text) : '');
  if (!text) return null;
  return {
    id: story.gid || `story_${story.created_at || Date.now()}`,
    createdAt: story.created_at || '',
    authorName: story.created_by?.name?.trim() || 'Asana',
    text,
  };
}
