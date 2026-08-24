/** @deprecated Session fallback; detail is opened from the hash `id` query. */
export const SELECTED_QUOTATION_PROJECT_KEY = 'mps_selected_quotation_project_id';

/** Hash query for `quotation_client_project.id`. */
export const QUOTATION_PROJECT_QUERY_KEY = 'id';
/** Older CRM / session links used `project`. */
export const QUOTATION_PROJECT_QUERY_KEY_LEGACY = 'project';

export type QuotationClientPage = 'pitching' | 'projects';

export function quotationProjectSubModule(status: string | undefined): QuotationClientPage {
  return status === 'confirmed' ? 'projects' : 'pitching';
}

function hashPathAndQuery(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return { path: raw, params: new URLSearchParams() };
  return {
    path: raw.slice(0, qIndex),
    params: new URLSearchParams(raw.slice(qIndex + 1)),
  };
}

function projectIdFromHash(hash: string): string | null {
  const { params } = hashPathAndQuery(hash);
  const id =
    params.get(QUOTATION_PROJECT_QUERY_KEY)?.trim() ||
    params.get(QUOTATION_PROJECT_QUERY_KEY_LEGACY)?.trim() ||
    '';
  return id || null;
}

function pageFromHash(hash: string): QuotationClientPage | null {
  const { path } = hashPathAndQuery(hash);
  const sub = path.split('/')[1];
  if (sub === 'pitching' || sub === 'projects') return sub;
  return null;
}

/** Hash path for a Pitching or Project detail, keyed by quotation_client_project.id. */
export function buildQuotationProjectHash(
  projectId: string,
  pageOrStatus?: QuotationClientPage | string,
): string {
  const page: QuotationClientPage =
    pageOrStatus === 'pitching' || pageOrStatus === 'projects'
      ? pageOrStatus
      : quotationProjectSubModule(pageOrStatus);
  const id = projectId.trim();
  if (!id) return `quotation/${page}`;
  const params = new URLSearchParams();
  params.set(QUOTATION_PROJECT_QUERY_KEY, id);
  return `quotation/${page}?${params.toString()}`;
}

/** Same-origin href that opens the project in a new tab. */
export function buildQuotationProjectHref(
  projectId: string,
  pageOrStatus?: QuotationClientPage | string,
): string {
  const hash = buildQuotationProjectHash(projectId, pageOrStatus);
  try {
    const loc = globalThis.window?.location;
    if (!loc) return `#${hash}`;
    return `${loc.pathname}${loc.search}#${hash}`;
  } catch {
    return `#${hash}`;
  }
}

export function readSelectedQuotationProjectId(
  hash = globalThis.window?.location?.hash ?? '',
): string | null {
  const fromHash = projectIdFromHash(hash);
  if (fromHash) return fromHash;
  try {
    return sessionStorage.getItem(SELECTED_QUOTATION_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setQuotationClientHash(page: QuotationClientPage, id?: string | null): void {
  const next = buildQuotationProjectHash(id?.trim() || '', page);
  try {
    const loc = globalThis.window?.location;
    if (!loc) return;
    const current = loc.hash.replace(/^#/, '');
    if (current === next) return;
    loc.hash = `#${next}`;
  } catch {
    /* ignore */
  }
}

export function writeSelectedQuotationProjectId(id: string | null): void {
  try {
    if (id === null) sessionStorage.removeItem(SELECTED_QUOTATION_PROJECT_KEY);
    else sessionStorage.setItem(SELECTED_QUOTATION_PROJECT_KEY, id);
  } catch {
    /* ignore */
  }
}

/** Persist project id and open Pitching or Project detail via a shareable hash. */
export function openQuotationProjectDetail(
  projectId: string,
  status: string | undefined,
  _navigateTo?: (module: string, subModule?: string) => void,
): void {
  const id = projectId.trim();
  if (!id) return;
  writeSelectedQuotationProjectId(id);
  setQuotationClientHash(quotationProjectSubModule(status), id);
}

export function readQuotationClientPage(
  hash = globalThis.window?.location?.hash ?? '',
): QuotationClientPage | null {
  return pageFromHash(hash);
}
