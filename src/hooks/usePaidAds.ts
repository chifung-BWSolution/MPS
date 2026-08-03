import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { PaidAd } from '@/types/app';

type DbRow = {
  id: string;
  website_profile_id: string | null;
  project_id: string | null;
  campaign_name: string;
  platform: string;
  ad_type: string;
  budget: number | string;
  actual_spend: number | string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  target_audience: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  cpc: number | string | null;
  ctr: number | string | null;
  roas: number | string | null;
  credit_card_id: string | null;
  report_date: string | null;
  man_hours: number | string | null;
  asana_link: string | null;
  output_link: string | null;
  notes: string | null;
};

export type PaidAdRecord = PaidAd & {
  reportDate?: string;
  manHours?: number;
  asanaLink?: string;
  outputLink?: string;
};

function dateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return String(value).substring(0, 10);
}

function mapRow(row: DbRow): PaidAdRecord {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id ?? undefined,
    projectId: row.project_id ?? undefined,
    campaignName: row.campaign_name ?? '',
    platform: (row.platform as PaidAd['platform']) || 'google_ads',
    adType: (row.ad_type as PaidAd['adType']) || 'search',
    budget: Number(row.budget) || 0,
    actualSpend: Number(row.actual_spend) || 0,
    currency: (row.currency as PaidAd['currency']) || 'HKD',
    startDate: dateOnly(row.start_date) || '',
    endDate: dateOnly(row.end_date),
    status: (row.status as PaidAd['status']) || 'planning',
    targetAudience: row.target_audience ?? undefined,
    impressions: row.impressions ?? undefined,
    clicks: row.clicks ?? undefined,
    conversions: row.conversions ?? undefined,
    cpc: row.cpc != null ? Number(row.cpc) : undefined,
    ctr: row.ctr != null ? Number(row.ctr) : undefined,
    roas: row.roas != null ? Number(row.roas) : undefined,
    creditCardId: row.credit_card_id ?? undefined,
    notes: row.notes ?? undefined,
    reportDate: dateOnly(row.report_date),
    manHours: row.man_hours != null ? Number(row.man_hours) : undefined,
    asanaLink: row.asana_link ?? undefined,
    outputLink: row.output_link ?? undefined,
  };
}

function toInsertRow(ad: PaidAdRecord) {
  return {
    id: ad.id,
    website_profile_id: ad.websiteProfileId ?? null,
    project_id: ad.projectId ?? null,
    campaign_name: ad.campaignName,
    platform: ad.platform,
    ad_type: ad.adType,
    budget: ad.budget,
    actual_spend: ad.actualSpend,
    currency: ad.currency,
    start_date: ad.startDate || null,
    end_date: ad.endDate ?? null,
    status: ad.status,
    target_audience: ad.targetAudience ?? null,
    impressions: ad.impressions ?? null,
    clicks: ad.clicks ?? null,
    conversions: ad.conversions ?? null,
    cpc: ad.cpc ?? null,
    ctr: ad.ctr ?? null,
    roas: ad.roas ?? null,
    credit_card_id: ad.creditCardId ?? null,
    report_date: ad.reportDate ?? null,
    man_hours: ad.manHours ?? null,
    asana_link: ad.asanaLink ?? null,
    output_link: ad.outputLink ?? null,
    notes: ad.notes ?? null,
  };
}

export function usePaidAds() {
  const { session } = useAuth();
  const [ads, setAds] = useState<PaidAdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('paid_ads')
      .select('*')
      .order('start_date', { ascending: false, nullsFirst: false });
    if (err) {
      setError(err.message);
      setAds([]);
    } else {
      setError(null);
      setAds((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addAd = useCallback(async (data: Omit<PaidAdRecord, 'id'> & { id?: string }) => {
    const id = data.id || `ad_${Date.now()}`;
    const record: PaidAdRecord = { ...data, id };
    const { error: err } = await supabase.from('paid_ads').insert(toInsertRow(record));
    if (!err) setAds(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updateAd = useCallback(async (id: string, data: Partial<PaidAdRecord>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId ?? null;
    if (data.projectId !== undefined) patch.project_id = data.projectId ?? null;
    if (data.campaignName !== undefined) patch.campaign_name = data.campaignName;
    if (data.platform !== undefined) patch.platform = data.platform;
    if (data.adType !== undefined) patch.ad_type = data.adType;
    if (data.budget !== undefined) patch.budget = data.budget;
    if (data.actualSpend !== undefined) patch.actual_spend = data.actualSpend;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.startDate !== undefined) patch.start_date = data.startDate || null;
    if (data.endDate !== undefined) patch.end_date = data.endDate || null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.targetAudience !== undefined) patch.target_audience = data.targetAudience ?? null;
    if (data.impressions !== undefined) patch.impressions = data.impressions ?? null;
    if (data.clicks !== undefined) patch.clicks = data.clicks ?? null;
    if (data.conversions !== undefined) patch.conversions = data.conversions ?? null;
    if (data.cpc !== undefined) patch.cpc = data.cpc ?? null;
    if (data.ctr !== undefined) patch.ctr = data.ctr ?? null;
    if (data.roas !== undefined) patch.roas = data.roas ?? null;
    if (data.creditCardId !== undefined) patch.credit_card_id = data.creditCardId ?? null;
    if (data.reportDate !== undefined) patch.report_date = data.reportDate || null;
    if (data.manHours !== undefined) patch.man_hours = data.manHours ?? null;
    if (data.asanaLink !== undefined) patch.asana_link = data.asanaLink ?? null;
    if (data.outputLink !== undefined) patch.output_link = data.outputLink ?? null;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    const { error: err } = await supabase.from('paid_ads').update(patch).eq('id', id);
    if (!err) setAds(prev => prev.map(a => (a.id === id ? { ...a, ...data } : a)));
    return err;
  }, []);

  const deleteAd = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('paid_ads').delete().eq('id', id);
    if (!err) setAds(prev => prev.filter(a => a.id !== id));
    return err;
  }, []);

  return { ads, loading, error, refresh, addAd, updateAd, deleteAd };
}
