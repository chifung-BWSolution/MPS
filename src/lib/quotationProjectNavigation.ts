import { applyLocationHash, buildSameOriginHref } from './appNavigation';
import {
  copyQuotationListQueryParams,
  writeQuotationListQueryParams,
  type QuotationListQuery,
} from './quotationListQuery';
import {
  isQuotationSectionModule,
  type QuotationSectionModule,
} from './quotationSectionScope';

/** @deprecated Session fallback; detail is opened from the hash `id` query. */
export const SELECTED_QUOTATION_PROJECT_KEY = 'mps_selected_quotation_project_id';

/** Hash query for `quotation_client_project.id`. */
export const QUOTATION_PROJECT_QUERY_KEY = 'id';
/** Older CRM / session links used `project`. */
export const QUOTATION_PROJECT_QUERY_KEY_LEGACY = 'project';
export const QUOTATION_DOC_QUERY_KEY = 'doc';
export const QUOTATION_INCOME_QUERY_KEY = 'income';

export type InvoiceReceiptDocKind = 'invoice' | 'receipt';

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
  const { path, params } = hashPathAndQuery(hash);
  const id =
    params.get(QUOTATION_PROJECT_QUERY_KEY)?.trim() ||
    params.get(QUOTATION_PROJECT_QUERY_KEY_LEGACY)?.trim() ||
    '';
  if (id) return id;
  const parts = path.split('/');
  if ((parts[1] === 'pitching' || parts[1] === 'projects') && parts[2]?.trim()) {
    return parts[2].trim();
  }
  return null;
}

function pageFromHash(hash: string): QuotationClientPage | null {
  const { path } = hashPathAndQuery(hash);
  const sub = path.split('/')[1];
  if (sub === 'pitching' || sub === 'projects') return sub;
  return null;
}

export function quotationSectionModuleFromHash(
  hash = globalThis.window?.location?.hash ?? '',
): QuotationSectionModule {
  const { path } = hashPathAndQuery(hash);
  const mod = path.split('/')[0];
  return isQuotationSectionModule(mod) ? mod : 'quotation';
}

function quotationHashFromParams(page: QuotationClientPage, params: URLSearchParams): string {
  const section = quotationSectionModuleFromHash();
  const qs = params.toString();
  return qs ? `${section}/${page}?${qs}` : `${section}/${page}`;
}

function appendListQuery(
  params: URLSearchParams,
  sourceHash = globalThis.window?.location?.hash ?? '',
): void {
  copyQuotationListQueryParams(hashPathAndQuery(sourceHash).params, params);
}

/** Hash path for a Pitching or Project detail, keyed by quotation_client_project.id. */
export function buildQuotationProjectHash(
  projectId: string,
  pageOrStatus?: QuotationClientPage | string,
  sourceHash = globalThis.window?.location?.hash ?? '',
): string {
  const page: QuotationClientPage =
    pageOrStatus === 'pitching' || pageOrStatus === 'projects'
      ? pageOrStatus
      : quotationProjectSubModule(pageOrStatus);
  const id = projectId.trim();
  const params = new URLSearchParams();
  if (id) params.set(QUOTATION_PROJECT_QUERY_KEY, id);
  appendListQuery(params, sourceHash);
  return quotationHashFromParams(page, params);
}

/** Same-origin href that opens the project in a new tab. */
export function buildQuotationProjectHref(
  projectId: string,
  pageOrStatus?: QuotationClientPage | string,
): string {
  return buildSameOriginHref(buildQuotationProjectHash(projectId, pageOrStatus));
}

export function readSelectedQuotationProjectId(
  hash = globalThis.window?.location?.hash ?? '',
): string | null {
  const fromHash = projectIdFromHash(hash);
  if (fromHash) return fromHash;
  // List hashes (#quotation/projects) must not reopen a previous detail from session.
  if (pageFromHash(hash)) return null;
  try {
    return sessionStorage.getItem(SELECTED_QUOTATION_PROJECT_KEY);
  } catch {
    return null;
  }
}

function hashWithPreservedDoc(
  projectId: string,
  page: QuotationClientPage,
  hash = globalThis.window?.location?.hash ?? '',
): string {
  const current = readInvoiceReceiptDoc(hash);
  const currentProjectId = projectIdFromHash(hash);
  if (current && projectId && currentProjectId === projectId) {
    return buildInvoiceReceiptHash(projectId, page, current.kind, current.incomeId, hash);
  }
  return buildQuotationProjectHash(projectId, page, hash);
}

/** Update list filter/sort on the current Pitching or Project page without a new history entry. */
export function setQuotationListHash(page: QuotationClientPage, query: QuotationListQuery): void {
  try {
    const loc = globalThis.window?.location;
    if (!loc) return;
    const params = new URLSearchParams();
    writeQuotationListQueryParams(params, query);
    const next = quotationHashFromParams(page, params);
    const current = loc.hash.replace(/^#/, '');
    if (current === next) return;
    const history = globalThis.window.history;
    if (history?.replaceState) {
      history.replaceState(history.state, '', `${loc.pathname}${loc.search}#${next}`);
      return;
    }
    loc.hash = `#${next}`;
  } catch {
    /* ignore */
  }
}

/** @returns true when Ctrl/Cmd+click opened a new tab instead of this one */
export function setQuotationClientHash(
  page: QuotationClientPage,
  id?: string | null,
  options?: { preserveDoc?: boolean },
): boolean {
  const projectId = id?.trim() || '';
  const next = options?.preserveDoc
    ? hashWithPreservedDoc(projectId, page)
    : buildQuotationProjectHash(projectId, page);
  return applyLocationHash(next);
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
): boolean {
  const id = projectId.trim();
  if (!id) return false;
  writeSelectedQuotationProjectId(id);
  return setQuotationClientHash(quotationProjectSubModule(status), id, { preserveDoc: true });
}

export function readQuotationClientPage(
  hash = globalThis.window?.location?.hash ?? '',
): QuotationClientPage | null {
  return pageFromHash(hash);
}

export function readInvoiceReceiptDoc(
  hash = globalThis.window?.location?.hash ?? '',
): { kind: InvoiceReceiptDocKind; incomeId: string } | null {
  const { params } = hashPathAndQuery(hash);
  const kind = params.get(QUOTATION_DOC_QUERY_KEY)?.trim();
  const incomeId = params.get(QUOTATION_INCOME_QUERY_KEY)?.trim() || '';
  if ((kind === 'invoice' || kind === 'receipt') && incomeId) {
    return { kind, incomeId };
  }
  return null;
}

export function buildInvoiceReceiptHash(
  projectId: string,
  page: QuotationClientPage,
  kind: InvoiceReceiptDocKind,
  incomeId: string,
  sourceHash = globalThis.window?.location?.hash ?? '',
): string {
  const params = new URLSearchParams();
  params.set(QUOTATION_PROJECT_QUERY_KEY, projectId.trim());
  params.set(QUOTATION_DOC_QUERY_KEY, kind);
  params.set(QUOTATION_INCOME_QUERY_KEY, incomeId.trim());
  appendListQuery(params, sourceHash);
  return quotationHashFromParams(page, params);
}

export function openInvoiceReceiptEditor(
  projectId: string,
  page: QuotationClientPage,
  kind: InvoiceReceiptDocKind,
  incomeId: string,
): boolean {
  return applyLocationHash(buildInvoiceReceiptHash(projectId, page, kind, incomeId));
}

export function closeInvoiceReceiptEditor(projectId: string, page: QuotationClientPage): void {
  setQuotationClientHash(page, projectId);
}
