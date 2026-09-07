/** @deprecated Session fallback; detail is opened from the hash `id` query. */
export const SELECTED_WEBSITE_KEY = 'mps_selected_website_id';

/** Hash query for `webandsystem_list.id`. */
export const WEBSITE_QUERY_KEY = 'id';

export type WebsiteListPage = 'list' | 'system-list' | 'featured';

const WEBSITE_LIST_PAGES = new Set<WebsiteListPage>(['list', 'system-list', 'featured']);

function hashPathAndQuery(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return { path: raw, params: new URLSearchParams() };
  return {
    path: raw.slice(0, qIndex),
    params: new URLSearchParams(raw.slice(qIndex + 1)),
  };
}

function websiteIdFromHash(hash: string): string | null {
  const { path, params } = hashPathAndQuery(hash);
  const id = params.get(WEBSITE_QUERY_KEY)?.trim() || '';
  if (id) return id;
  const parts = path.split('/');
  if (parts[0] === 'website' && WEBSITE_LIST_PAGES.has(parts[1] as WebsiteListPage) && parts[2]?.trim()) {
    return parts[2].trim();
  }
  return null;
}

function pageFromHash(hash: string): WebsiteListPage | null {
  const { path } = hashPathAndQuery(hash);
  const [mod, sub] = path.split('/');
  if (mod !== 'website') return null;
  if (WEBSITE_LIST_PAGES.has(sub as WebsiteListPage)) return sub as WebsiteListPage;
  return null;
}

/** Hash path for a website / system detail, keyed by webandsystem_list.id. */
export function buildWebsiteDetailHash(
  websiteId: string,
  page: WebsiteListPage = 'list',
): string {
  const id = websiteId.trim();
  if (!id) return `website/${page}`;
  const params = new URLSearchParams();
  params.set(WEBSITE_QUERY_KEY, id);
  return `website/${page}?${params.toString()}`;
}

/** Same-origin href that opens the website in a new tab. */
export function buildWebsiteDetailHref(
  websiteId: string,
  page: WebsiteListPage = 'list',
): string {
  const hash = buildWebsiteDetailHash(websiteId, page);
  try {
    const loc = globalThis.window?.location;
    if (!loc) return `#${hash}`;
    return `${loc.pathname}${loc.search}#${hash}`;
  } catch {
    return `#${hash}`;
  }
}

export function readWebsiteListPage(
  hash = globalThis.window?.location?.hash ?? '',
): WebsiteListPage | null {
  return pageFromHash(hash);
}

export function readSelectedWebsiteId(
  hash = globalThis.window?.location?.hash ?? '',
): string | null {
  const fromHash = websiteIdFromHash(hash);
  if (fromHash) return fromHash;
  if (pageFromHash(hash)) return null;
  try {
    return sessionStorage.getItem(SELECTED_WEBSITE_KEY);
  } catch {
    return null;
  }
}

export function setWebsiteDetailHash(page: WebsiteListPage, id?: string | null): void {
  const next = buildWebsiteDetailHash(id?.trim() || '', page);
  try {
    const loc = globalThis.window?.location;
    if (!loc) return;
    const current = loc.hash.replace(/^#/, '').replace(/^\/+/, '');
    if (current === next) return;
    loc.hash = `#${next}`;
  } catch {
    /* ignore */
  }
}

export function writeSelectedWebsiteId(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(SELECTED_WEBSITE_KEY);
    else sessionStorage.setItem(SELECTED_WEBSITE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Persist website id and open 網站+系統 detail via a shareable hash. */
export function openWebsiteDetail(
  websiteProfileId: string,
  _navigateTo?: (module: string, subModule?: string) => void,
  page: WebsiteListPage = 'list',
): void {
  const id = websiteProfileId.trim();
  if (!id) return;
  writeSelectedWebsiteId(id);
  setWebsiteDetailHash(page, id);
}
