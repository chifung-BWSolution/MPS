import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { SeoUpgradeRow } from '@/types/seo';

type WebsiteJoin = {
  website_name: string | null;
  company: string | null;
  brand: string | null;
};

type UpgradeDbRow = {
  id: string;
  website_profile_id: string;
  upgrade_type: string;
  supplier: string | null;
  cost: number | string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  staff_name: string | null;
  hours_spent: number | string;
  status: SeoUpgradeRow['status'];
  keyword_id: string | null;
  notes: string | null;
  webandsystem_list?: WebsiteJoin | WebsiteJoin[] | null;
};

type HistoryPoint = {
  keyword_id: string;
  metric_date: string;
  ranking_position: number | string | null;
};

function pickWebsite(join: UpgradeDbRow['webandsystem_list']): WebsiteJoin | null {
  if (!join) return null;
  return Array.isArray(join) ? join[0] ?? null : join;
}

function nearestRank(
  history: HistoryPoint[],
  keywordId: string,
  targetDate: string | null,
  preferLatestWhenMissingEnd: boolean,
): number | null {
  const points = history
    .filter((h) => h.keyword_id === keywordId && h.ranking_position != null)
    .map((h) => ({
      date: String(h.metric_date).slice(0, 10),
      rank: Number(h.ranking_position),
    }))
    .filter((h) => !Number.isNaN(h.rank))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) return null;

  if (!targetDate) {
    return preferLatestWhenMissingEnd ? points[points.length - 1]!.rank : null;
  }

  const target = targetDate.slice(0, 10);
  let best = points[0]!;
  let bestDiff = Math.abs(Date.parse(best.date) - Date.parse(target));
  for (const p of points) {
    const diff = Math.abs(Date.parse(p.date) - Date.parse(target));
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  return best.rank;
}

function mapUpgrade(row: UpgradeDbRow, rankBefore: number | null, rankAfter: number | null): SeoUpgradeRow {
  const ws = pickWebsite(row.webandsystem_list);
  return {
    id: row.id,
    website_profile_id: row.website_profile_id,
    upgrade_type: row.upgrade_type,
    supplier: row.supplier,
    cost: Number(row.cost) || 0,
    currency: row.currency || 'HKD',
    start_date: row.start_date,
    end_date: row.end_date,
    staff_name: row.staff_name,
    hours_spent: Number(row.hours_spent) || 0,
    status: row.status,
    keyword_id: row.keyword_id,
    notes: row.notes,
    websiteName: ws?.website_name ?? undefined,
    company: ws?.company ?? undefined,
    brand: ws?.brand ?? undefined,
    rankBefore,
    rankAfter,
  };
}

export type AddSeoUpgradeInput = {
  website_profile_id: string;
  upgrade_type: string;
  supplier?: string | null;
  cost?: number;
  currency?: string;
  start_date?: string | null;
  end_date?: string | null;
  staff_name?: string | null;
  hours_spent?: number;
  status?: SeoUpgradeRow['status'];
  keyword_id?: string | null;
  notes?: string | null;
};

export function useSeoUpgrades() {
  const { session } = useAuth();
  const [upgrades, setUpgrades] = useState<SeoUpgradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('seo_upgrades')
      .select(
        'id, website_profile_id, upgrade_type, supplier, cost, currency, start_date, end_date, staff_name, hours_spent, status, keyword_id, notes, webandsystem_list(website_name, company, brand)',
      )
      .order('start_date', { ascending: false });

    if (err) {
      setError(err.message);
      setUpgrades([]);
      setLoading(false);
      return;
    }

    const rows = (data as UpgradeDbRow[] | null) ?? [];
    const keywordIds = [...new Set(rows.map((r) => r.keyword_id).filter(Boolean))] as string[];

    let history: HistoryPoint[] = [];
    if (keywordIds.length) {
      const { data: histData } = await supabase
        .from('seo_ranking_history')
        .select('keyword_id, metric_date, ranking_position')
        .in('keyword_id', keywordIds)
        .order('metric_date', { ascending: true });
      history = (histData as HistoryPoint[] | null) ?? [];
    }

    setError(null);
    setUpgrades(
      rows.map((row) => {
        if (!row.keyword_id) {
          return mapUpgrade(row, null, null);
        }
        const rankBefore = nearestRank(history, row.keyword_id, row.start_date, false);
        const rankAfter = nearestRank(history, row.keyword_id, row.end_date, true);
        return mapUpgrade(row, rankBefore, rankAfter);
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addUpgrade = useCallback(async (input: AddSeoUpgradeInput) => {
    if (!input.website_profile_id || !input.upgrade_type) {
      return { data: null, error: { message: '網站與服務類型為必填' } };
    }
    const row = {
      website_profile_id: input.website_profile_id,
      upgrade_type: input.upgrade_type,
      supplier: input.supplier ?? null,
      cost: input.cost ?? 0,
      currency: input.currency ?? 'HKD',
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      staff_name: input.staff_name ?? null,
      hours_spent: input.hours_spent ?? 0,
      status: input.status ?? 'active',
      keyword_id: input.keyword_id ?? null,
      notes: input.notes ?? null,
    };
    const { data, error: err } = await supabase
      .from('seo_upgrades')
      .insert(row)
      .select(
        'id, website_profile_id, upgrade_type, supplier, cost, currency, start_date, end_date, staff_name, hours_spent, status, keyword_id, notes, webandsystem_list(website_name, company, brand)',
      )
      .single();

    if (err || !data) {
      return { data: null, error: err };
    }

    const mapped = mapUpgrade(data as UpgradeDbRow, null, null);
    if (mapped.keyword_id) {
      const { data: histData } = await supabase
        .from('seo_ranking_history')
        .select('keyword_id, metric_date, ranking_position')
        .eq('keyword_id', mapped.keyword_id)
        .order('metric_date', { ascending: true });
      const history = (histData as HistoryPoint[] | null) ?? [];
      mapped.rankBefore = nearestRank(history, mapped.keyword_id, mapped.start_date, false);
      mapped.rankAfter = nearestRank(history, mapped.keyword_id, mapped.end_date, true);
    }

    setUpgrades((prev) => [mapped, ...prev]);
    return { data: mapped, error: null };
  }, []);

  return { upgrades, loading, error, refresh, addUpgrade };
}
