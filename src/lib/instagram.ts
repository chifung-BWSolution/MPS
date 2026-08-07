const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

function stripInlineNotes(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function extractHandleToken(token: string): string | null {
  let t = token.trim().replace(/^@+/, '');
  if (!t || /facebook\.com|http/i.test(t)) return null;
  const m = t.match(/^([A-Za-z0-9._]+)/);
  if (!m) return null;
  const h = m[1];
  if (h.length < 2) return null;
  if (['p', 'reel', 'stories'].includes(h.toLowerCase())) return null;
  if (!IG_HANDLE.test(h)) return null;
  return h;
}

/** Parse one or more IG handles from messy import / form values. */
export function parseInstagramAccounts(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];

  let s = stripInlineNotes(raw.trim());
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) {
    try {
      s = decodeURIComponent(urlMatch[1]);
    } catch {
      s = urlMatch[1];
    }
  }
  s = s.replace(/^@+/, '');

  const segments = s
    .split(/[\s]*(?:\/|,|\||;)|(?:\bor\b)/i)
    .map((x) => x.trim())
    .filter(Boolean);

  const handles: string[] = [];
  for (const seg of segments) {
    const candidates = seg.includes(' ')
      ? [...seg.split(/\s+/), seg.replace(/\s+/g, '')]
      : [seg];
    for (const c of candidates) {
      const h = extractHandleToken(c);
      if (h && !handles.some((x) => x.toLowerCase() === h.toLowerCase())) {
        handles.push(h);
      }
    }
  }

  return handles;
}

export function primaryInstagramHandle(raw: string | null | undefined): string | null {
  const handles = parseInstagramAccounts(raw);
  if (handles.length) return handles[0];

  const trimmed = raw?.trim().replace(/^@+/, '') ?? '';
  if (!trimmed || /[/|]|(?:\bor\b)/i.test(trimmed) || /facebook|http/i.test(trimmed)) {
    return null;
  }
  return extractHandleToken(trimmed);
}

/** Display label, e.g. "@a · @b" when multiple handles are listed. */
export function formatInstagramDisplay(raw: string | null | undefined): string | null {
  const handles = parseInstagramAccounts(raw);
  if (handles.length) return handles.map((h) => `@${h}`).join(' · ');

  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return `@${trimmed.replace(/^@+/, '')}`;
}

export function instagramProfileUrl(raw: string | null | undefined): string | null {
  const handle = primaryInstagramHandle(raw);
  if (!handle) return null;
  return `https://www.instagram.com/${handle}`;
}

/** Normalize stored instagram_account to primary handle (for save/import). */
export function normalizeInstagramAccount(raw: string | null | undefined): string | null {
  return primaryInstagramHandle(raw);
}

/** Whether DB/import value should be cleaned to primary handle. */
export function instagramAccountNeedsNormalization(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const s = raw.trim();
  return (
    /[/|]|(?:\bor\b)/i.test(s) ||
    /facebook\.com/i.test(s) ||
    /(?:^|\s)https?:\/\//i.test(s)
  );
}
