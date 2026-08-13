/** Normalize a URL or domain to a bare hostname (no www) for display / merge. */
export function normalizeDisplayDomain(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\/+$/, '');
  return s.split(/[/?#]/)[0] || '';
}

/** Keep one website per normalized domain. `isPreferred` wins over the current pick. */
export function mergeWebsitesByDomain<T extends { domain: string; websiteProfileId: string }>(
  websites: T[],
  isPreferred?: (candidate: T, current: T) => boolean,
): T[] {
  const byDomain = new Map<string, T>();
  for (const w of websites) {
    const domain = normalizeDisplayDomain(w.domain);
    if (!domain) continue;
    const next = { ...w, domain };
    const prev = byDomain.get(domain);
    if (!prev || (isPreferred && isPreferred(next, prev))) {
      byDomain.set(domain, next);
    }
  }
  return [...byDomain.values()].sort((a, b) =>
    a.domain.localeCompare(b.domain, undefined, { sensitivity: 'base' }),
  );
}
