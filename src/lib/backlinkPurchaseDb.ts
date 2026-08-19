import { normalizeBacklinkCosts } from '@/lib/backlinkCurrency';
import type { BacklinkPurchase } from '@/types/marketingOps';

/** Columns that exist on production backlink_purchases. */
export const BACKLINK_PURCHASE_DB_COLUMNS = [
  'id',
  'website_profile_id',
  'web_supplier_id',
  'cost',
  'currency',
  'purchase_date',
  'quantity',
  'notes',
  'google_ads_customer_id',
  'google_ads_account_name',
  'source_domain',
  'excel_sheet',
] as const;

export function toBacklinkInsertRow(data: Omit<BacklinkPurchase, 'id'> & { id: string }) {
  const { costUsd, costHkd } = normalizeBacklinkCosts(data.costUsd, data.costHkd);
  const useUsd = costUsd > 0;
  return {
    id: data.id,
    website_profile_id: data.websiteProfileId ?? null,
    web_supplier_id: data.webSupplierId,
    cost: useUsd ? costUsd : costHkd,
    currency: useUsd ? 'USD' : 'HKD',
    purchase_date: data.purchaseDate,
    quantity: data.quantity,
    notes: data.notes ?? null,
    google_ads_customer_id: data.googleAdsCustomerId ?? null,
    google_ads_account_name: data.googleAdsAccountName ?? null,
    source_domain: data.sourceDomain ?? null,
    excel_sheet: data.excelSheet ?? null,
  };
}

export function toBacklinkCostPatch(costUsd: number, costHkd: number) {
  const normalized = normalizeBacklinkCosts(costUsd, costHkd);
  const useUsd = normalized.costUsd > 0;
  return {
    cost: useUsd ? normalized.costUsd : normalized.costHkd,
    currency: useUsd ? 'USD' : 'HKD',
  };
}
