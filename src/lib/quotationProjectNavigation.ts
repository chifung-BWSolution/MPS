/** Session key used to deep-open a quotation client project detail. */
export const SELECTED_QUOTATION_PROJECT_KEY = 'mps_selected_quotation_project_id';

export function readSelectedQuotationProjectId(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_QUOTATION_PROJECT_KEY);
  } catch {
    return null;
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

/** Persist project id and open Pitching or Project detail. */
export function openQuotationProjectDetail(
  projectId: string,
  status: string | undefined,
  navigateTo: (module: string, subModule?: string) => void,
): void {
  const id = projectId.trim();
  if (!id) return;
  writeSelectedQuotationProjectId(id);
  navigateTo('quotation', status === 'confirmed' ? 'projects' : 'pitching');
}
