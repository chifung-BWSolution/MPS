/** Build an absolute http(s) href without double-prefixing an existing protocol. */
export function toExternalHref(url: string | null | undefined): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '#';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, '')}`;
}
