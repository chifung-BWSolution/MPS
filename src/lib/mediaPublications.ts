import { toExternalHref } from './externalUrl';

/** One 媒體發佈 link stored in quotation_client_project.media_publications. */
export type MediaPublication = {
  id: string;
  url: string;
};

export function newMediaPublicationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Absolute http(s) URL, or null when the text is not a usable link. */
export function normalizeMediaPublicationUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const href = toExternalHref(trimmed);
  if (href === '#') return null;
  try {
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return href;
  } catch {
    return null;
  }
}

function uniqueId(preferred: string, index: number, seen: Set<string>): string {
  let id = preferred || `media_${index + 1}`;
  while (seen.has(id)) id = `${id}_${index + 1}`;
  seen.add(id);
  return id;
}

function publicationFromUnknown(raw: unknown, index: number, seen: Set<string>): MediaPublication | null {
  if (typeof raw === 'string') {
    const url = normalizeMediaPublicationUrl(raw);
    if (!url) return null;
    return { id: uniqueId('', index, seen), url };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as { id?: unknown; url?: unknown };
  const url = normalizeMediaPublicationUrl(typeof row.url === 'string' ? row.url : '');
  if (!url) return null;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  return { id: uniqueId(id, index, seen), url };
}

export function parseMediaPublications(raw: unknown): MediaPublication[] {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: MediaPublication[] = [];
  value.forEach((item, index) => {
    const publication = publicationFromUnknown(item, index, seen);
    if (publication) items.push(publication);
  });
  return items;
}

/** Drop blank rows and store absolute URLs. Invalid non-empty text is omitted. */
export function mediaPublicationsForWrite(
  items: readonly { id?: string; url: string }[],
): MediaPublication[] {
  const seen = new Set<string>();
  const itemsOut: MediaPublication[] = [];
  items.forEach((item, index) => {
    const url = normalizeMediaPublicationUrl(item.url);
    if (!url) return;
    itemsOut.push({ id: uniqueId(item.id?.trim() ?? '', index, seen), url });
  });
  return itemsOut;
}

export function mediaPublicationsEqual(
  left: readonly MediaPublication[],
  right: readonly MediaPublication[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.id === right[index]?.id && item.url === right[index]?.url);
}

export function mediaPublicationRowsHaveInvalidUrl(
  items: readonly { url: string }[],
): boolean {
  return items.some((item) => item.url.trim() !== '' && !normalizeMediaPublicationUrl(item.url));
}
