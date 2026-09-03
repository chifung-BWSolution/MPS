import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PITCHING_CURRENCY, optionalIsoDate, type PitchingExpenseItem, type PitchingProjectType, type PitchingRecord, type PitchingStatus } from '@/data/pitchingData';

/** Supabase table shared by Pitching and Project pages */
export const QUOTATION_CLIENT_PROJECT_TABLE = 'quotation_client_project';

type ClientListEmbed = {
  company_name_en: string | null;
  company_name_zh: string | null;
} | null;

type StaffEmbed = {
  display_name: string | null;
} | null;

type WebsiteEmbed = {
  website_name: string | null;
  domain_url: string | null;
  profile_type: string | null;
} | null;

type DbRow = {
  id: string;
  asana_task_gid: string | null;
  asana_project_gid: string | null;
  asana_project_name: string | null;
  pitching_code: string | null;
  client_id: string | null;
  client_name: string | null;
  display_name: string;
  inquiry_date: string;
  signed_date: string | null;
  handover_date: string | null;
  description: string | null;
  project_types: string[] | null;
  assigned_pm: string | null;
  assigned_pm_name: string | null;
  main_pm_id: string | null;
  main_pm?: StaffEmbed;
  status: string;
  asana_link: string | null;
  webandsystem_list_id: string | null;
  notes: string | null;
  estimated_income: number | null;
  estimated_expenses: PitchingExpenseItem[] | null;
  created_at: string;
  updated_at: string;
  quotation_client_list?: ClientListEmbed;
  webandsystem_list?: WebsiteEmbed;
};

function clientNamesFromEmbed(embed: ClientListEmbed | undefined): {
  companyNameEn?: string;
  companyNameZh?: string;
} {
  if (!embed) return {};
  return {
    companyNameEn: embed.company_name_en ?? undefined,
    companyNameZh: embed.company_name_zh ?? undefined,
  };
}

function parseExpenses(raw: unknown): PitchingExpenseItem[] {
  if (raw == null) return [];
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      return [];
    }
  } else {
    return [];
  }
  return items
    .filter((item): item is PitchingExpenseItem => {
      return (
        item != null &&
        typeof item === 'object' &&
        typeof (item as PitchingExpenseItem).id === 'string' &&
        typeof (item as PitchingExpenseItem).name === 'string' &&
        typeof (item as PitchingExpenseItem).amount === 'number'
      );
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      currency: item.currency || PITCHING_CURRENCY,
      notes: item.notes,
    }));
}

function mapRow(row: DbRow): PitchingRecord {
  const status = (['initial', 'following_up', 'confirmed', 'closed'].includes(row.status)
    ? row.status
    : 'initial') as PitchingStatus;

  return {
    id: row.id,
    pitchingId: row.pitching_code || row.id,
    clientId: row.client_id ?? undefined,
    clientName: row.client_name || '—',
    displayName: row.display_name,
    ...clientNamesFromEmbed(row.quotation_client_list),
    inquiryDate: String(row.inquiry_date).slice(0, 10),
    signedDate: optionalIsoDate(row.signed_date),
    handoverDate: optionalIsoDate(row.handover_date),
    description: row.description ?? undefined,
    projectTypes: (row.project_types || []) as PitchingProjectType[],
    asanaTaskGid: row.asana_task_gid ?? undefined,
    asanaProjectGid: row.asana_project_gid ?? undefined,
    asanaProjectName: row.asana_project_name ?? undefined,
    assignedPm: row.assigned_pm || '',
    assignedPmName: row.assigned_pm_name || '—',
    mainPmId: row.main_pm_id || undefined,
    mainPmName: row.main_pm?.display_name?.trim() || undefined,
    status,
    asanaLink: row.asana_link ?? undefined,
    webandsystemListId: row.webandsystem_list_id ?? undefined,
    webandsystemName: row.webandsystem_list?.website_name ?? undefined,
    webandsystemDomainUrl: row.webandsystem_list?.domain_url ?? undefined,
    notes: row.notes ?? undefined,
    estimatedIncome: row.estimated_income != null ? Number(row.estimated_income) : undefined,
    estimatedExpenses: parseExpenses(row.estimated_expenses),
    followUps: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Fields updatable from Pitching / Project detail page. */
export type QuotationClientProjectUpdate = Partial<
  Pick<
    PitchingRecord,
    | 'clientId'
    | 'clientName'
    | 'displayName'
    | 'inquiryDate'
    | 'signedDate'
    | 'handoverDate'
    | 'description'
    | 'projectTypes'
    | 'assignedPmName'
    | 'mainPmId'
    | 'mainPmName'
    | 'asanaLink'
    | 'webandsystemListId'
    | 'status'
    | 'notes'
    | 'estimatedIncome'
    | 'estimatedExpenses'
  >
>;

/** Load all client projects from quotation_client_project (Pitching + Project pages). */
export function useQuotationClientProjects() {
  
  const [records, setRecords] = useState<PitchingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from(QUOTATION_CLIENT_PROJECT_TABLE)
      .select('*, quotation_client_list ( company_name_zh, company_name_en ), main_pm:staffs!main_pm_id ( display_name ), webandsystem_list ( website_name, domain_url, profile_type )')
      .order('inquiry_date', { ascending: false });

    if (err) {
      setError(err.message);
      setRecords([]);
    } else {
      setError(null);
      const mapped = ((data as DbRow[] | null) ?? []).map(mapRow);
      setRecords(mapped);
      const latest = mapped.map((r) => r.updatedAt).filter(Boolean).sort().pop();
      setLastSyncedAt(latest ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addRecord = useCallback(
    async (
      data: Omit<PitchingRecord, 'id' | 'pitchingId' | 'followUps' | 'createdAt' | 'updatedAt'> & {
        pitchingId?: string;
        asanaSectionName?: string;
      },
    ) => {
      const id = `pitch_${Date.now()}`;
      const now = new Date().toISOString();
      const row = {
        id,
        pitching_code: data.pitchingId || `MPS-${id.slice(-8)}`,
        client_id: data.clientId?.trim() || null,
        client_name: data.clientName || null,
        display_name: data.displayName,
        inquiry_date: data.inquiryDate,
        signed_date: optionalIsoDate(data.signedDate) ?? null,
        handover_date: optionalIsoDate(data.handoverDate) ?? null,
        description: data.description ?? null,
        project_types: data.projectTypes,
        assigned_pm: data.assignedPm || null,
        assigned_pm_name: data.assignedPmName || '',
        main_pm_id: data.mainPmId?.trim() || null,
        status: data.status,
        asana_task_gid: data.asanaTaskGid?.trim() || null,
        asana_project_gid: data.asanaProjectGid?.trim() || null,
        asana_project_name: data.asanaProjectName?.trim() || null,
        asana_section_name: data.asanaSectionName?.trim() || null,
        asana_link: data.asanaLink ?? null,
        webandsystem_list_id: data.webandsystemListId?.trim() || null,
        notes: data.notes ?? null,
        created_at: now,
        updated_at: now,
      };
      const { error: err } = await supabase.from(QUOTATION_CLIENT_PROJECT_TABLE).insert(row);
      const record: PitchingRecord = {
        ...data,
        id,
        pitchingId: row.pitching_code,
        mainPmName: data.mainPmName || (data.mainPmId ? data.assignedPmName : undefined),
        followUps: [],
        createdAt: now,
        updatedAt: now,
      };
      if (!err) setRecords((prev) => [record, ...prev]);
      return { data: err ? null : record, error: err };
    },
    [],
  );

  const updateStatus = useCallback(async (id: string, status: PitchingStatus) => {
    const now = new Date().toISOString();
    const { error: err } = await supabase
      .from(QUOTATION_CLIENT_PROJECT_TABLE)
      .update({ status, updated_at: now })
      .eq('id', id);

    if (!err) {
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status, updatedAt: now } : r)),
      );
    }
    return { error: err };
  }, []);

  const updateRecord = useCallback(async (id: string, data: QuotationClientProjectUpdate) => {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = { updated_at: now };
    if (data.clientId !== undefined) row.client_id = data.clientId?.trim() || null;
    if (data.clientName !== undefined) row.client_name = data.clientName || null;
    if (data.displayName !== undefined) row.display_name = data.displayName;
    if (data.inquiryDate !== undefined) row.inquiry_date = data.inquiryDate;
    if (data.signedDate !== undefined) row.signed_date = optionalIsoDate(data.signedDate) ?? null;
    if (data.handoverDate !== undefined) row.handover_date = optionalIsoDate(data.handoverDate) ?? null;
    if (data.description !== undefined) row.description = data.description || null;
    if (data.projectTypes !== undefined) row.project_types = data.projectTypes;
    if (data.assignedPmName !== undefined) row.assigned_pm_name = data.assignedPmName || '';
    if (data.mainPmId !== undefined) row.main_pm_id = data.mainPmId?.trim() || null;
    if (data.asanaLink !== undefined) row.asana_link = data.asanaLink || null;
    if (data.webandsystemListId !== undefined) {
      row.webandsystem_list_id = data.webandsystemListId.trim() || null;
    }
    if (data.status !== undefined) row.status = data.status;
    if (data.notes !== undefined) row.notes = data.notes || null;
    if (data.estimatedIncome !== undefined) row.estimated_income = data.estimatedIncome;
    if (data.estimatedExpenses !== undefined) row.estimated_expenses = data.estimatedExpenses;

    const { error: err } = await supabase
      .from(QUOTATION_CLIENT_PROJECT_TABLE)
      .update(row)
      .eq('id', id);

    if (!err) {
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...data, updatedAt: now } : r)),
      );
    }
    return { error: err };
  }, []);

  return { records, loading, error, lastSyncedAt, refresh, addRecord, updateStatus, updateRecord };
}

/** @deprecated Use useQuotationClientProjects */
export const usePitchingRecords = useQuotationClientProjects;
