/** Session key used to deep-open a quotation client project detail. */
export const SELECTED_QUOTATION_PROJECT_KEY = 'mps_selected_quotation_project_id';

/** Hash query key so a new tab can open the same project (`#quotation/projects?project=id`). */
export const QUOTATION_PROJECT_QUERY_KEY = 'project';

export function quotationProjectSubModule(status: string | undefined): 'projects' | 'pitching' {
  return status === 'confirmed' ? 'projects' : 'pitching';
}

function projectIdFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return null;
  const id = new URLSearchParams(raw.slice(qIndex + 1)).get(QUOTATION_PROJECT_QUERY_KEY)?.trim();
  return id || null;
}

/** Hash path used to open Pitching or Project detail, including the project id query. */
export function buildQuotationProjectHash(projectId: string, status?: string): string {
  const id = projectId.trim();
  const sub = quotationProjectSubModule(status);
  if (!id) return `quotation/${sub}`;
  const params = new URLSearchParams();
  params.set(QUOTATION_PROJECT_QUERY_KEY, id);
  return `quotation/${sub}?${params.toString()}`;
}

/** Same-origin href that opens the project in a new tab. */
export function buildQuotationProjectHref(projectId: string, status?: string): string {
  const hash = buildQuotationProjectHash(projectId, status);
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

function stripProjectIdFromHash(): void {
  try {
    const loc = globalThis.window?.location;
    const history = globalThis.window?.history;
    if (!loc || !history) return;
    const raw = loc.hash.replace(/^#/, '');
    const qIndex = raw.indexOf('?');
    if (qIndex === -1) return;
    const path = raw.slice(0, qIndex);
    const params = new URLSearchParams(raw.slice(qIndex + 1));
    if (!params.has(QUOTATION_PROJECT_QUERY_KEY)) return;
    params.delete(QUOTATION_PROJECT_QUERY_KEY);
    const qs = params.toString();
    const next = qs ? `${path}?${qs}` : path;
    if (next === raw) return;
    history.replaceState(null, '', `${loc.pathname}${loc.search}#${next}`);
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
  if (id === null) stripProjectIdFromHash();
}

/** Persist project id and open Pitching or Project detail. */
export function openQuotationProjectDetail(
  projectId: string,
  status: string | undefined,
  navigateTo: (module: string, subModule?: string) => void,
): void {
  const id = projectId.trim();
  if (!id) return;
  writeSelectedQuotationProjectId(id);
  navigateTo('quotation', quotationProjectSubModule(status));
}
