/** Session key used to deep-open a website detail from other modules. */
export const SELECTED_WEBSITE_KEY = 'mps_selected_website_id';

export function readSelectedWebsiteId(): string | null {
  try {
    return sessionStorage.getItem(SELECTED_WEBSITE_KEY);
  } catch {
    return null;
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

/** Persist website id and navigate to 網站+系統 → 網站列表 (detail opens from session). */
export function openWebsiteDetail(
  websiteProfileId: string,
  navigateTo: (module: string, subModule?: string) => void,
): void {
  const id = websiteProfileId.trim();
  if (!id) return;
  writeSelectedWebsiteId(id);
  navigateTo('website', 'list');
}
