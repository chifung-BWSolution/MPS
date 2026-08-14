import { supabase } from '@/lib/supabase';
import type { OutcomeType, AITool } from '@/data/dayReportDataV2';

export type PendingReportStatus = 'pending' | 'pulled' | 'consumed' | 'dismissed';

export type PendingReportItem = {
  id: string;
  staff_id: string;
  report_date: string;
  source_module: string;
  source_type: string;
  source_id: string;
  category: string;
  related_id: string | null;
  related_name: string | null;
  title: string;
  suggested_hours: number | null;
  outcome_type: string | null;
  outcome_url: string | null;
  metadata: Record<string, unknown> | null;
  status: PendingReportStatus;
  completed_at: string;
};

export type CreatePendingReportItemInput = {
  staffId: string;
  reportDate: string;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  category: string;
  title: string;
  suggestedHours: number;
  relatedId?: string;
  relatedName?: string;
  outcomeType?: string;
  outcomeUrl?: string;
  metadata?: Record<string, unknown>;
  completedAt?: string;
};

export type ReportFormEntry = {
  category: string;
  relatedId: string;
  relatedName: string;
  title: string;
  hours: number;
  outcomeType: OutcomeType | '';
  outcomeUrl: string;
  outcomeImages: string[];
  outcomeImageFiles: File[];
  growthExperience: string;
  isAiAssisted: boolean;
  aiTools: AITool[];
  aiToolsV2: {
    copywriting: string[];
    copywritingOther: string;
    image: string[];
    imageOther: string;
    video: string[];
    videoOther: string;
  };
  pendingReportItemId?: string;
  isAutoPulled?: boolean;
};

type SystemUserLike = {
  staff_id?: string;
  bubble_staff_id?: string;
  email?: string;
  google_email?: string;
} | null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Leftover placeholder staffs.id values created for the UUID FK migration.
 * Map them to the canonical Bubble staff row so submit / team-view share one identity.
 */
const STALE_MANUAL_STAFF_UUIDS: Record<string, string> = {
  // Lowell Lo (manual) → Lowell Lo (Bubble / BWT OB System)
  'd88d2465-42d1-4205-8a9b-8495083c3691': '04102dd8-8d0f-4536-82cd-904cc0769227',
};

/** True when value is a UUID (staffs.id / FK shape). */
export function isStaffUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value.trim());
}

/** True for leftover `manual_*` / "(manual)" staff rows that must not own live reports. */
export function isPlaceholderStaff(row: {
  bubble_staff_id?: string | null;
  display_name?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  const bubble = (row.bubble_staff_id || '').trim().toLowerCase();
  const name = (row.display_name || '').trim().toLowerCase();
  return bubble.startsWith('manual_') || name.includes('(manual)');
}

/** Rewrite a known leftover manual staff UUID to the canonical staffs.id. */
export function remapStaleStaffUuid(value: string | null | undefined): string {
  const raw = (value || '').trim();
  return STALE_MANUAL_STAFF_UUIDS[raw] || raw;
}

export function localDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolve staffs.id (uuid) for FK writes.
 * Prefer work_email (canonical person) over a leftover manual UUID from bypass/fallback sessions.
 */
export async function resolveStaffUuid(systemUser: SystemUserLike): Promise<string | null> {
  if (!systemUser) return null;

  const staffIdRaw = remapStaleStaffUuid(systemUser.staff_id);
  const email = (systemUser.email || systemUser.google_email || '').toLowerCase().trim();

  if (email) {
    const { data } = await supabase
      .from('staffs')
      .select('id, bubble_staff_id, display_name')
      .ilike('work_email', email)
      .eq('status', 'active');
    const match = (data || []).find((row) => !isPlaceholderStaff(row));
    if (match?.id) return match.id;
  }

  if (isStaffUuid(staffIdRaw)) return staffIdRaw;

  // Prefer explicit bubble id; also accept legacy sessions that stuffed Bubble text into staff_id.
  const bubbleId = (systemUser.bubble_staff_id || '').trim()
    || (!isStaffUuid(staffIdRaw) ? staffIdRaw : '');
  if (bubbleId && !bubbleId.toLowerCase().startsWith('manual_')) {
    const { data } = await supabase
      .from('staffs')
      .select('id, bubble_staff_id, display_name')
      .eq('bubble_staff_id', bubbleId)
      .limit(1)
      .maybeSingle();
    if (data?.id && !isPlaceholderStaff(data)) return data.id;
  }

  return isStaffUuid(staffIdRaw) ? staffIdRaw : null;
}

/** @deprecated Use resolveStaffUuid — FK columns now store staffs.id (uuid). */
export async function resolveBubbleStaffId(systemUser: SystemUserLike): Promise<string | null> {
  return resolveStaffUuid(systemUser);
}

export async function createPendingReportItem(
  input: CreatePendingReportItemInput,
): Promise<{ created: boolean; id?: string }> {
  if (!input.suggestedHours || input.suggestedHours <= 0) {
    throw new Error('匯報工時必須大於 0');
  }

  const { data: existing, error: existingError } = await supabase
    .from('pending_report_items')
    .select('id, status')
    .eq('staff_id', input.staffId)
    .eq('source_module', input.sourceModule)
    .eq('source_type', input.sourceType)
    .eq('source_id', input.sourceId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    if (existing.status === 'dismissed') {
      const { data, error } = await supabase
        .from('pending_report_items')
        .update({
          report_date: input.reportDate,
          category: input.category,
          related_id: input.relatedId ?? null,
          related_name: input.relatedName ?? null,
          title: input.title,
          suggested_hours: input.suggestedHours,
          outcome_type: input.outcomeType ?? null,
          outcome_url: input.outcomeUrl ?? null,
          metadata: input.metadata ?? {},
          status: 'pending',
          completed_at: input.completedAt ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw error;
      return { created: true, id: data.id as string };
    }
    if (existing.status !== 'consumed') {
      return { created: false, id: existing.id as string };
    }
    return { created: false, id: existing.id as string };
  }

  const row = {
    staff_id: input.staffId,
    report_date: input.reportDate,
    source_module: input.sourceModule,
    source_type: input.sourceType,
    source_id: input.sourceId,
    category: input.category,
    related_id: input.relatedId ?? null,
    related_name: input.relatedName ?? null,
    title: input.title,
    suggested_hours: input.suggestedHours,
    outcome_type: input.outcomeType ?? null,
    outcome_url: input.outcomeUrl ?? null,
    metadata: input.metadata ?? {},
    status: 'pending' as const,
    completed_at: input.completedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('pending_report_items')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { created: false };
    throw error;
  }

  return { created: true, id: data.id as string };
}

export async function updatePendingReportHours(
  staffId: string,
  sourceModule: string,
  sourceType: string,
  sourceId: string,
  suggestedHours: number,
): Promise<void> {
  if (!suggestedHours || suggestedHours <= 0) {
    throw new Error('匯報工時必須大於 0');
  }

  const { error } = await supabase
    .from('pending_report_items')
    .update({
      suggested_hours: suggestedHours,
      updated_at: new Date().toISOString(),
    })
    .eq('staff_id', staffId)
    .eq('source_module', sourceModule)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .in('status', ['pending', 'pulled']);

  if (error) throw error;
}

export async function pullPendingItems(
  staffId: string,
  reportDate: string,
): Promise<PendingReportItem[]> {
  const { data, error } = await supabase
    .from('pending_report_items')
    .select('*')
    .eq('staff_id', staffId)
    .eq('report_date', reportDate)
    .eq('status', 'pending')
    .order('completed_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as PendingReportItem[];
}

export async function countPendingItems(
  staffId: string,
  reportDate: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('pending_report_items')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .eq('report_date', reportDate)
    .eq('status', 'pending');

  if (error) throw error;
  return count ?? 0;
}

export async function markPendingAsPulled(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('pending_report_items')
    .update({ status: 'pulled', updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function consumePendingItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('pending_report_items')
    .update({ status: 'consumed', updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function dismissPendingItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('pending_report_items')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function pendingToFormEntry(
  item: PendingReportItem,
  emptyAiTools: ReportFormEntry['aiToolsV2'],
): ReportFormEntry {
  return {
    category: item.category,
    relatedId: item.related_id ?? '',
    relatedName: item.related_name ?? '',
    title: item.title,
    hours: Number(item.suggested_hours) || 0,
    outcomeType: (item.outcome_type ?? '') as OutcomeType | '',
    outcomeUrl: item.outcome_url ?? '',
    outcomeImages: [],
    outcomeImageFiles: [],
    growthExperience: '',
    isAiAssisted: false,
    aiTools: [],
    aiToolsV2: { ...emptyAiTools },
    pendingReportItemId: item.id,
    isAutoPulled: true,
  };
}

export function stripEmptyReportEntries(entries: ReportFormEntry[]): ReportFormEntry[] {
  return entries.filter(e => e.category || e.title || e.pendingReportItemId);
}

export async function mergePendingIntoReportEntries(
  staffId: string,
  reportDate: string,
  currentEntries: ReportFormEntry[],
  emptyAiTools: ReportFormEntry['aiToolsV2'],
  createBlankEntry: () => ReportFormEntry,
): Promise<{ entries: ReportFormEntry[]; mergedCount: number }> {
  const pending = await pullPendingItems(staffId, reportDate);
  const existingIds = new Set(
    currentEntries.map(e => e.pendingReportItemId).filter(Boolean),
  );
  const fresh = pending.filter(p => !existingIds.has(p.id));
  if (fresh.length === 0) {
    return { entries: currentEntries, mergedCount: 0 };
  }

  const merged = [
    ...stripEmptyReportEntries(currentEntries),
    ...fresh.map(item => pendingToFormEntry(item, emptyAiTools)),
  ];

  await markPendingAsPulled(fresh.map(p => p.id));

  return {
    entries: merged.length > 0 ? merged : [createBlankEntry()],
    mergedCount: fresh.length,
  };
}
