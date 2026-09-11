/** Canonical website host stored on webandsystem_list.domain_url. */

export function canonicalizeDomainUrl(raw: string | null | undefined): string {
  if (raw == null) return '';
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.split(/[/?#]/)[0] ?? '';
  s = s.replace(/:\d+$/, '');
  return s;
}

export type CanonicalWebsiteRef = {
  id: string;
  websiteName?: string | null;
  domainUrl?: string | null;
};

/** First profile whose stored URL canonicalizes to the same host. */
export function findWebsiteByCanonicalUrl<T extends CanonicalWebsiteRef>(
  profiles: T[],
  rawUrl: string | null | undefined,
  excludeId?: string | null,
): T | null {
  const key = canonicalizeDomainUrl(rawUrl);
  if (!key) return null;
  const skip = (excludeId || '').trim();
  return (
    profiles.find((profile) => {
      if (skip && profile.id === skip) return false;
      return canonicalizeDomainUrl(profile.domainUrl) === key;
    }) ?? null
  );
}
