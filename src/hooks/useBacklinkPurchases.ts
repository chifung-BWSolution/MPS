import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { BacklinkPurchase } from '@/types/marketingOps';

type DbRow = {
  id: string;
  website_profile_id: string | null;
  web_supplier_id: string;
  cost: number | string;
  currency: string;
  purchase_date: string;
  quantity: number;
  notes: string | null;
  google_ads_customer_id: string | null;
  google_ads_account_name: string | null;
  source_domain: string | null;
  excel_sheet: string | null;
};

function mapRow(row: DbRow): BacklinkPurchase {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id ?? undefined,
    webSupplierId: row.web_supplier_id,
    cost: Number(row.cost) || 0,
    currency: row.currency === 'HKD' ? 'HKD' : 'USD',
    purchaseDate: String(row.purchase_date).substring(0, 10),
    quantity: Number(row.quantity) || 1,
    notes: row.notes ?? undefined,
    googleAdsCustomerId: row.google_ads_customer_id ?? undefined,
    googleAdsAccountName: row.google_ads_account_name ?? undefined,
    sourceDomain: row.source_domain ?? undefined,
    excelSheet: row.excel_sheet ?? undefined,
  };
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
    const row = {
      id,
      website_profile_id: data.websiteProfileId ?? null,
      web_supplier_id: data.webSupplierId,
      cost: data.cost,
      currency: data.currency,
      purchase_date: data.purchaseDate,
      quantity: data.quantity,
      notes: data.notes ?? null,
      google_ads_customer_id: data.googleAdsCustomerId ?? null,
      google_ads_account_name: data.googleAdsAccountName ?? null,
      source_domain: data.sourceDomain ?? null,
      excel_sheet: data.excelSheet ?? null,
    };
    const { error: err } = await supabase.from('backlink_purchases').insert(row);
    const record = { ...data, id };
    if (!err) setPurchases(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updatePurchase = useCallback(async (id: string, data: Partial<BacklinkPurchase>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId || null;
    if (data.webSupplierId !== undefined) patch.web_supplier_id = data.webSupplierId;
    if (data.cost !== undefined) patch.cost = data.cost;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.purchaseDate !== undefined) patch.purchase_date = data.purchaseDate;
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    if (data.googleAdsCustomerId !== undefined) patch.google_ads_customer_id = data.googleAdsCustomerId || null;
    if (data.googleAdsAccountName !== undefined) patch.google_ads_account_name = data.googleAdsAccountName || null;
    if (data.sourceDomain !== undefined) patch.source_domain = data.sourceDomain || null;
    if (data.excelSheet !== undefined) patch.excel_sheet = data.excelSheet || null;
    const { error: err } = await supabase.from('backlink_purchases').update(patch).eq('id', id);
    if (!err) {
      setPurchases(prev => prev.map(p => (p.id === id ? { ...p, ...data } : p)));
    }
    return err;
  }, []);

  const deletePurchase = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('backlink_purchases').delete().eq('id', id);
    if (!err) setPurchases(prev => prev.filter(p => p.id !== id));
    return err;
  }, []);

  const bulkImport = useCallback(async (items: Omit<BacklinkPurchase, 'id'>[]) => {
    if (!items.length) return { inserted: 0, error: null as { message: string } | null };
    const rows = items.map((data, i) => ({
      id: `bl_imp_${Date.now()}_${i}`,
      website_profile_id: data.websiteProfileId ?? null,
      web_supplier_id: data.webSupplierId,
      cost: data.cost,
      currency: data.currency,
      purchase_date: data.purchaseDate,
      quantity: data.quantity,
      notes: data.notes ?? null,
      google_ads_customer_id: data.googleAdsCustomerId ?? null,
      google_ads_account_name: data.googleAdsAccountName ?? null,
      source_domain: data.sourceDomain ?? null,
      excel_sheet: data.excelSheet ?? null,
    }));
    const { error: err } = await supabase.from('backlink_purchases').insert(rows);
    if (!err) {
      const records = rows.map((row, i) => ({
        id: row.id,
        websiteProfileId: items[i]!.websiteProfileId,
        webSupplierId: items[i]!.webSupplierId,
        cost: items[i]!.cost,
        currency: items[i]!.currency,
        purchaseDate: items[i]!.purchaseDate,
        quantity: items[i]!.quantity,
        notes: items[i]!.notes,
        googleAdsCustomerId: items[i]!.googleAdsCustomerId,
        googleAdsAccountName: items[i]!.googleAdsAccountName,
        sourceDomain: items[i]!.sourceDomain,
        excelSheet: items[i]!.excelSheet,
      }));
      setPurchases(prev => [...records, ...prev]);
    }
    return { inserted: err ? 0 : rows.length, error: err };
  }, []);

  return { purchases, loading, error, refresh, addPurchase, updatePurchase, deletePurchase, bulkImport };
}
