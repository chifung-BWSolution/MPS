import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type SeoUpgradeRecord = {
  id: string;
  websiteProfileId?: string;
  websiteName: string;
  company: string;
  brand: string;
  upgradeType: string;
  supplier: string;
  cost: number;
  currency: string;
  startDate: string;
  endDate?: string | null;
  staff: string;
  hoursSpent: number;
  rankBefore?: { main: number } | null;
  rankAfter?: { main: number } | null;
  status: 'active' | 'completed' | 'cancelled';
  notes?: string;
};

type DbRow = {
  id: string;
  website_profile_id: string | null;
  website_name: string | null;
  company: string | null;
  brand: string | null;
  upgrade_type: string;
  supplier: string | null;
  cost: number | string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  staff: string | null;
  hours_spent: number | string | null;
  ranking_before: { main?: number } | null;
  ranking_after: { main?: number } | null;
  status: string;
  notes: string | null;
};

function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).substring(0, 10);
}

function mapRow(row: DbRow): SeoUpgradeRecord {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id ?? undefined,
    websiteName: row.website_name ?? '',
    company: row.company ?? '',
    brand: row.brand ?? '',
    upgradeType: row.upgrade_type || 'other',
    supplier: row.supplier ?? '',
    cost: Number(row.cost) || 0,
    currency: row.currency || 'HKD',
    startDate: dateOnly(row.start_date),
    endDate: row.end_date ? dateOnly(row.end_date) : null,
    staff: row.staff ?? '',
    hoursSpent: row.hours_spent != null ? Number(row.hours_spent) : 0,
    rankBefore: row.ranking_before?.main != null ? { main: Number(row.ranking_before.main) } : null,
    rankAfter: row.ranking_after?.main != null ? { main: Number(row.ranking_after.main) } : null,
    status: (row.status as SeoUpgradeRecord['status']) || 'active',
    notes: row.notes ?? undefined,
  };
}

function toInsertRow(r: SeoUpgradeRecord) {
  return {
    id: r.id,
    website_profile_id: r.websiteProfileId ?? null,
    website_name: r.websiteName || null,
    company: r.company || null,
    brand: r.brand || null,
    upgrade_type: r.upgradeType,
    supplier: r.supplier || null,
    cost: r.cost,
    currency: r.currency,
    start_date: r.startDate || null,
    end_date: r.endDate || null,
    staff: r.staff || null,
    hours_spent: r.hoursSpent ?? null,
    ranking_before: r.rankBefore ?? null,
    ranking_after: r.rankAfter ?? null,
    status: r.status,
    notes: r.notes ?? null,
  };
}

export function useSeoUpgrades() {
  const { session } = useAuth();
  const [upgrades, setUpgrades] = useState<SeoUpgradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('seo_upgrades')
      .select('*')
      .order('start_date', { ascending: false, nullsFirst: false });
    if (err) {
      setError(err.message);
      setUpgrades([]);
    } else {
      setError(null);
      setUpgrades((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addUpgrade = useCallback(async (data: Omit<SeoUpgradeRecord, 'id'> & { id?: string }) => {
    const id = data.id || `su_${Date.now()}`;
    const record: SeoUpgradeRecord = { ...data, id };
    const { error: err } = await supabase.from('seo_upgrades').insert(toInsertRow(record));
    if (!err) setUpgrades(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updateUpgrade = useCallback(async (id: string, data: Partial<SeoUpgradeRecord>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId ?? null;
    if (data.websiteName !== undefined) patch.website_name = data.websiteName || null;
    if (data.company !== undefined) patch.company = data.company || null;
    if (data.brand !== undefined) patch.brand = data.brand || null;
    if (data.upgradeType !== undefined) patch.upgrade_type = data.upgradeType;
    if (data.supplier !== undefined) patch.supplier = data.supplier || null;
    if (data.cost !== undefined) patch.cost = data.cost;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.startDate !== undefined) patch.start_date = data.startDate || null;
    if (data.endDate !== undefined) patch.end_date = data.endDate || null;
    if (data.staff !== undefined) patch.staff = data.staff || null;
    if (data.hoursSpent !== undefined) patch.hours_spent = data.hoursSpent ?? null;
    if (data.rankBefore !== undefined) patch.ranking_before = data.rankBefore ?? null;
    if (data.rankAfter !== undefined) patch.ranking_after = data.rankAfter ?? null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    const { error: err } = await supabase.from('seo_upgrades').update(patch).eq('id', id);
    if (!err) setUpgrades(prev => prev.map(u => (u.id === id ? { ...u, ...data } : u)));
    return err;
  }, []);

  const deleteUpgrade = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('seo_upgrades').delete().eq('id', id);
    if (!err) setUpgrades(prev => prev.filter(u => u.id !== id));
    return err;
  }, []);

  return { upgrades, loading, error, refresh, addUpgrade, updateUpgrade, deleteUpgrade };
}
