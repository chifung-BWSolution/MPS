import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { normalizeBacklinkCosts } from '@/lib/backlinkCurrency';
import { toBacklinkCostPatch, toBacklinkInsertRow } from '@/lib/backlinkPurchaseDb';
import type { BacklinkBrand, BacklinkPurchase } from '@/types/marketingOps';

type DbRow = {
  id: string;
  website_profile_id: string | null;
  web_supplier_id: string;
  cost: number | string;
  currency: string;
  cost_usd: number | string | null;
  cost_hkd: number | string | null;
  brand: string | null;
  purchase_date: string;
  quantity: number;
  notes: string | null;
  google_ads_customer_id: string | null;
  google_ads_account_name: string | null;
  source_domain: string | null;
  excel_sheet: string | null;
};

const VALID_BRANDS = new Set(['BW', 'FC', 'BSC', 'Wine']);

function mapBrand(value: string | null | undefined): BacklinkBrand | undefined {
  if (value && VALID_BRANDS.has(value)) return value as BacklinkBrand;
  return undefined;
}

function resolveCosts(row: DbRow): { costUsd: number; costHkd: number } {
  const hasNewColumns = row.cost_usd != null || row.cost_hkd != null;
  if (hasNewColumns) {
    return normalizeBacklinkCosts(
      row.cost_usd != null ? Number(row.cost_usd) : null,
      row.cost_hkd != null ? Number(row.cost_hkd) : null,
    );
  }

  const legacyCost = Number(row.cost) || 0;
  if (row.currency === 'HKD') {
    return normalizeBacklinkCosts(null, legacyCost);
  }
  return normalizeBacklinkCosts(legacyCost, null);
}

function mapRow(row: DbRow): BacklinkPurchase {
  const { costUsd, costHkd } = resolveCosts(row);
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id ?? undefined,
    webSupplierId: row.web_supplier_id,
    costUsd,
    costHkd,
    brand: mapBrand(row.brand),
    purchaseDate: String(row.purchase_date).substring(0, 10),
    quantity: Number(row.quantity) || 1,
    notes: row.notes ?? undefined,
    googleAdsCustomerId: row.google_ads_customer_id ?? undefined,
    googleAdsAccountName: row.google_ads_account_name ?? undefined,
    sourceDomain: row.source_domain ?? undefined,
    excelSheet: row.excel_sheet ?? undefined,
  };
}

function toDbCosts(data: Pick<BacklinkPurchase, 'costUsd' | 'costHkd'>) {
  return normalizeBacklinkCosts(data.costUsd, data.costHkd);
}

export function useBacklinkPurchases() {
  const { session } = useAuth();
  const [purchases, setPurchases] = useState<BacklinkPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('backlink_purchases')
      .select('*')
      .order('purchase_date', { ascending: false });
    if (err) {
      setError(err.message);
      setPurchases([]);
    } else {
      setError(null);
      setPurchases((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addPurchase = useCallback(async (data: Omit<BacklinkPurchase, 'id'> & { id?: string }) => {
    const id = data.id || `bl_${Date.now()}`;
    const row = toBacklinkInsertRow({ ...data, id });
    const { error: err } = await supabase.from('backlink_purchases').insert(row);
    const record = mapRow(row as DbRow);
    if (!err) setPurchases(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updatePurchase = useCallback(async (id: string, data: Partial<BacklinkPurchase>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId || null;
    if (data.webSupplierId !== undefined) patch.web_supplier_id = data.webSupplierId;
    if (data.costUsd !== undefined || data.costHkd !== undefined) {
      const current = purchases.find((p) => p.id === id);
      const { costUsd, costHkd } = toDbCosts({
        costUsd: data.costUsd ?? current?.costUsd ?? 0,
        costHkd: data.costHkd ?? current?.costHkd ?? 0,
      });
      Object.assign(patch, toBacklinkCostPatch(costUsd, costHkd));
    }
    if (data.purchaseDate !== undefined) patch.purchase_date = data.purchaseDate;
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.googleAdsCustomerId !== undefined) patch.google_ads_customer_id = data.googleAdsCustomerId || null;
    if (data.googleAdsAccountName !== undefined) patch.google_ads_account_name = data.googleAdsAccountName || null;
    if (data.sourceDomain !== undefined) patch.source_domain = data.sourceDomain || null;
    if (data.excelSheet !== undefined) patch.excel_sheet = data.excelSheet || null;
    const { error: err } = await supabase.from('backlink_purchases').update(patch).eq('id', id);
    if (!err) {
      setPurchases(prev => prev.map(p => {
        if (p.id !== id) return p;
        const next = { ...p, ...data };
        if (data.costUsd !== undefined || data.costHkd !== undefined) {
          const normalized = toDbCosts({
            costUsd: next.costUsd,
            costHkd: next.costHkd,
          });
          next.costUsd = normalized.costUsd;
          next.costHkd = normalized.costHkd;
        }
        return next;
      }));
    }
    return err;
  }, [purchases]);

  const deletePurchase = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('backlink_purchases').delete().eq('id', id);
    if (!err) setPurchases(prev => prev.filter(p => p.id !== id));
    return err;
  }, []);

  const bulkImport = useCallback(async (items: Omit<BacklinkPurchase, 'id'>[]) => {
    if (!items.length) return { inserted: 0, error: null as { message: string } | null };
    const rows = items.map((data, i) => toBacklinkInsertRow({
      ...data,
      id: `bl_imp_${Date.now()}_${i}`,
    }));
    const { error: err } = await supabase.from('backlink_purchases').insert(rows);
    if (!err) {
      const records = rows.map((row) => mapRow(row as DbRow));
      setPurchases(prev => [...records, ...prev]);
    }
    return { inserted: err ? 0 : rows.length, error: err };
  }, []);

  return { purchases, loading, error, refresh, addPurchase, updatePurchase, deletePurchase, bulkImport };
}
