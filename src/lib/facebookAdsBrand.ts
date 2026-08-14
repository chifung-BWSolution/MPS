/** Infer a brand_list.brand_code from a Facebook ad account / Business name. */
export function inferFacebookBrandCode(
  accountName?: string | null,
  businessName?: string | null,
  businessKey?: string | null,
): string | null {
  const text = `${accountName || ''} ${businessName || ''} ${businessKey || ''}`.toLowerCase();
  if (!text.trim()) return null;
  if (text.includes('attitude')) return 'BSC';
  if (text.includes('winepassion') || text.includes('wine passion')) return 'Wine';
  if (
    text.includes('food channel') ||
    text.includes('food-channels') ||
    text.includes('lunchbox') ||
    text.includes('party food') ||
    text.includes('partyfood')
  ) {
    return 'FCC';
  }
  if (
    text.includes('branding work') ||
    text.includes('branding-works') ||
    text.includes('bw office') ||
    text.includes('eb space')
  ) {
    return 'BWA';
  }
  return null;
}

export function resolveFacebookBrandListId(
  campaignBrandListId: string | null | undefined,
  accountBrandListId: string | null | undefined,
  inferFrom: { accountName?: string | null; businessName?: string | null; businessKey?: string | null },
  brandIdByCode: Map<string, string>,
): string | null {
  const explicit = (campaignBrandListId || '').trim();
  if (explicit) return explicit;
  const fromAccount = (accountBrandListId || '').trim();
  if (fromAccount) return fromAccount;
  const code = inferFacebookBrandCode(inferFrom.accountName, inferFrom.businessName, inferFrom.businessKey);
  return code ? brandIdByCode.get(code) || null : null;
}
