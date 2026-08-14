/** Infer a brand_list.brand_code from a Facebook ad account / Business name. */
export function inferFacebookBrandCode(
  accountName?: string | null,
  businessName?: string | null,
  businessKey?: string | null,
): string | null {
  const text = `${accountName || ""} ${businessName || ""} ${businessKey || ""}`.toLowerCase();
  if (!text.trim()) return null;
  if (text.includes("attitude")) return "BSC";
  if (text.includes("winepassion") || text.includes("wine passion")) return "Wine";
  if (
    text.includes("food channel") ||
    text.includes("food-channels") ||
    text.includes("lunchbox") ||
    text.includes("party food") ||
    text.includes("partyfood")
  ) {
    return "FCC";
  }
  if (
    text.includes("branding work") ||
    text.includes("branding-works") ||
    text.includes("bw office") ||
    text.includes("eb space")
  ) {
    return "BWA";
  }
  return null;
}

type BrandRow = { id: string; brand_code: string };

type AccountBrandRow = {
  ad_account_id: string;
  account_name: string | null;
  business_name: string | null;
  business_key: string | null;
};

/** Copy inferred account brands onto campaigns that still have none. */
export async function applyFacebookAccountBrands(supabase: {
  from: (table: string) => {
    select: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => {
        is: (col: string, val: null) => PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
}): Promise<{ accountsUpdated: number; campaignsUpdated: number }> {
  const { data: brandData, error: brandErr } = await supabase
    .from("brand_list")
    .select("id, brand_code");
  if (brandErr) throw new Error(`Load brands failed: ${brandErr.message}`);
  const brandIdByCode = new Map(
    ((brandData as BrandRow[] | null) ?? []).map((b) => [b.brand_code, b.id]),
  );

  const { data: accountData, error: accErr } = await supabase
    .from("facebook_ads_accounts")
    .select("ad_account_id, account_name, business_name, business_key");
  if (accErr) throw new Error(`Load Facebook accounts failed: ${accErr.message}`);

  let campaignsUpdated = 0;
  for (const account of (accountData as AccountBrandRow[] | null) ?? []) {
    const code = inferFacebookBrandCode(
      account.account_name,
      account.business_name,
      account.business_key,
    );
    const brandId = code ? brandIdByCode.get(code) : undefined;
    if (!brandId) continue;
    const { error } = await supabase
      .from("facebook_ads_campaigns")
      .update({
        brand_list_id: brandId,
        updated_at: new Date().toISOString(),
      })
      .eq("ad_account_id", account.ad_account_id)
      .is("brand_list_id", null);
    if (error) throw new Error(`Campaign brand backfill failed: ${error.message}`);
    campaignsUpdated += 1;
  }

  return { accountsUpdated: 0, campaignsUpdated };
}
