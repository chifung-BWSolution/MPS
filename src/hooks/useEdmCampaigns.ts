import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { EdmCampaign } from '@/types/app';

type DbRow = {
  id: string;
  website_profile_id: string;
  campaign_type: string;
  subject: string;
  template_name: string | null;
  recipient_type: string | null;
  recipient_count: number | null;
  send_date: string | null;
  status: string;
  hours_spent: number | string | null;
  open_rate: number | string | null;
  click_rate: number | string | null;
  report_date: string | null;
  asana_link: string | null;
  output_link: string | null;
  notes: string | null;
};

export type EdmCampaignRecord = EdmCampaign & {
  reportDate?: string;
  asanaLink?: string;
  outputLink?: string;
  notes?: string;
};

function dateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return String(value).substring(0, 10);
}

function mapRow(row: DbRow): EdmCampaignRecord {
  return {
    id: row.id,
    websiteProfileId: row.website_profile_id,
    campaignType: (row.campaign_type as EdmCampaign['campaignType']) || 'email',
    subject: row.subject ?? '',
    templateName: row.template_name ?? undefined,
    recipientType: row.recipient_type ?? undefined,
    recipientCount: row.recipient_count ?? undefined,
    sendDate: dateOnly(row.send_date),
    status: (row.status as EdmCampaign['status']) || 'draft',
    hoursSpent: row.hours_spent != null ? Number(row.hours_spent) : undefined,
    openRate: row.open_rate != null ? Number(row.open_rate) : undefined,
    clickRate: row.click_rate != null ? Number(row.click_rate) : undefined,
    reportDate: dateOnly(row.report_date),
    asanaLink: row.asana_link ?? undefined,
    outputLink: row.output_link ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toInsertRow(c: EdmCampaignRecord) {
  return {
    id: c.id,
    website_profile_id: c.websiteProfileId,
    campaign_type: c.campaignType,
    subject: c.subject,
    template_name: c.templateName ?? null,
    recipient_type: c.recipientType ?? null,
    recipient_count: c.recipientCount ?? null,
    send_date: c.sendDate ?? null,
    status: c.status,
    hours_spent: c.hoursSpent ?? null,
    open_rate: c.openRate ?? null,
    click_rate: c.clickRate ?? null,
    report_date: c.reportDate ?? null,
    asana_link: c.asanaLink ?? null,
    output_link: c.outputLink ?? null,
    notes: c.notes ?? null,
  };
}

export function useEdmCampaigns() {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<EdmCampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('edm_campaigns')
      .select('*')
      .order('send_date', { ascending: false, nullsFirst: false });
    if (err) {
      setError(err.message);
      setCampaigns([]);
    } else {
      setError(null);
      setCampaigns((data as DbRow[] | null)?.map(mapRow) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [session, refresh]);

  const addCampaign = useCallback(async (data: Omit<EdmCampaignRecord, 'id'> & { id?: string }) => {
    const id = data.id || `edm_${Date.now()}`;
    const record: EdmCampaignRecord = { ...data, id };
    const { error: err } = await supabase.from('edm_campaigns').insert(toInsertRow(record));
    if (!err) setCampaigns(prev => [record, ...prev]);
    return { data: err ? null : record, error: err };
  }, []);

  const updateCampaign = useCallback(async (id: string, data: Partial<EdmCampaignRecord>) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.websiteProfileId !== undefined) patch.website_profile_id = data.websiteProfileId;
    if (data.campaignType !== undefined) patch.campaign_type = data.campaignType;
    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.templateName !== undefined) patch.template_name = data.templateName ?? null;
    if (data.recipientType !== undefined) patch.recipient_type = data.recipientType ?? null;
    if (data.recipientCount !== undefined) patch.recipient_count = data.recipientCount ?? null;
    if (data.sendDate !== undefined) patch.send_date = data.sendDate || null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.hoursSpent !== undefined) patch.hours_spent = data.hoursSpent ?? null;
    if (data.openRate !== undefined) patch.open_rate = data.openRate ?? null;
    if (data.clickRate !== undefined) patch.click_rate = data.clickRate ?? null;
    if (data.reportDate !== undefined) patch.report_date = data.reportDate || null;
    if (data.asanaLink !== undefined) patch.asana_link = data.asanaLink ?? null;
    if (data.outputLink !== undefined) patch.output_link = data.outputLink ?? null;
    if (data.notes !== undefined) patch.notes = data.notes ?? null;
    const { error: err } = await supabase.from('edm_campaigns').update(patch).eq('id', id);
    if (!err) setCampaigns(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)));
    return err;
  }, []);

  const deleteCampaign = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('edm_campaigns').delete().eq('id', id);
    if (!err) setCampaigns(prev => prev.filter(c => c.id !== id));
    return err;
  }, []);

  return { campaigns, loading, error, refresh, addCampaign, updateCampaign, deleteCampaign };
}
