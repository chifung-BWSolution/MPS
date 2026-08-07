import { instagramProfileUrl } from '@/lib/instagram';
import { kolOwnerIdColumn, type KolTableName } from '@/components/talent/kolWorkflow';

export function formatSupabaseError(error: unknown, fallback = '操作失敗'): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof e.message === 'string' && e.message.trim()) {
      const parts = [e.message.trim()];
      if (typeof e.details === 'string' && e.details.trim()) parts.push(e.details.trim());
      if (typeof e.hint === 'string' && e.hint.trim()) parts.push(e.hint.trim());
      return parts.join(' — ');
    }
  }
  return fallback;
}

function isHttpUrl(value: string): boolean {
  const s = value.trim();
  return /^https?:\/\//i.test(s) || /^www\./i.test(s);
}

function normalizeHttpUrl(value: string): string {
  const s = value.trim();
  if (/^www\./i.test(s)) return `https://${s}`;
  return s;
}

function formatUrlLabel(url: string): string {
  try {
    const u = new URL(normalizeHttpUrl(url));
    const path = u.pathname.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path === '' ? '' : path}`;
  } catch {
    return url.length > 36 ? `${url.slice(0, 33)}...` : url;
  }
}

export interface CooperationPlatformLink {
  label: string;
  href: string | null;
}

export function parseCooperationPlatformLinks(
  platforms: string[] | null | undefined,
  kolProfile?: { instagram_account?: string | null } | null
): CooperationPlatformLink[] {
  const items = (platforms || []).map((p) => p.trim()).filter(Boolean);
  const links: CooperationPlatformLink[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (isHttpUrl(item)) {
      links.push({ label: formatUrlLabel(item), href: normalizeHttpUrl(item) });
      continue;
    }

    const next = items[i + 1];
    if (next && isHttpUrl(next)) {
      links.push({ label: item, href: normalizeHttpUrl(next) });
      i++;
      continue;
    }

    let href: string | null = null;
    if (/instagram/i.test(item)) {
      href = instagramProfileUrl(kolProfile?.instagram_account);
    }
    links.push({ label: item, href });
  }

  return links;
}

export const KOL_COOP_PRESET_PLATFORMS = [
  'Instagram',
  'Facebook',
  '小紅書',
  'YouTube',
] as const;

export type KolCoopPresetPlatform = (typeof KOL_COOP_PRESET_PLATFORMS)[number];

export interface KolCooperationRow {
  id: string;
  kol_profile_id: string;
  project_name: string | null;
  project_type: string | null;
  fee: string | null;
  evaluation: string | null;
  cooperation_content: string | null;
  platforms: string[] | null;
  cooperated_at: string;
  created_by: string | null;
  created_at: string;
  kol_profile?: {
    name: string | null;
    instagram_account: string | null;
    phone: string | null;
  } | null;
}

export interface KolCooperationFormValues {
  kol_profile_id: string;
  project_name: string;
  cooperation_content: string;
  platforms: string[];
  cooperated_at: string;
}

export const emptyCooperationForm = (): Omit<KolCooperationFormValues, 'kol_profile_id'> => ({
  project_name: '',
  cooperation_content: '',
  platforms: [],
  cooperated_at: new Date().toISOString().slice(0, 10),
});

export function cooperationRowToForm(row: KolCooperationRow): KolCooperationFormValues {
  return {
    kol_profile_id: row.kol_profile_id,
    project_name: row.project_name || '',
    cooperation_content: row.cooperation_content || row.evaluation || '',
    platforms: row.platforms || [],
    cooperated_at: row.cooperated_at.slice(0, 10),
  };
}

function toCooperatedAt(value: string): string {
  return value.includes('T') ? value : `${value}T12:00:00.000Z`;
}

export async function markKolAsCooperated(
  kolProfileId: string,
  cooperatedAt: string,
  table: KolTableName = 'kol_profile'
): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const { data: profile, error: readErr } = await supabase
    .from(table)
    .select('lifecycle_status')
    .eq('id', kolProfileId)
    .single();
  if (readErr) throw readErr;
  if (profile?.lifecycle_status === 'star') return;

  const at = cooperatedAt.includes('T')
    ? cooperatedAt
    : `${cooperatedAt}T12:00:00.000Z`;

  const { error } = await supabase
    .from(table)
    .update({
      lifecycle_status: 'cooperated',
      cooperated_at: at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', kolProfileId);
  if (error) throw error;
}

export async function saveCooperationRecord(
  values: KolCooperationFormValues,
  createdBy: string,
  table: KolTableName = 'kol_profile'
): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const cooperatedAt = toCooperatedAt(values.cooperated_at);
  const ownerColumn = kolOwnerIdColumn(table);

  const { error } = await supabase.from('kol_cooperation').insert({
    [ownerColumn]: values.kol_profile_id,
    project_name: values.project_name.trim(),
    cooperation_content: values.cooperation_content.trim(),
    evaluation: values.cooperation_content.trim(),
    platforms: values.platforms,
    cooperated_at: cooperatedAt,
    created_by: createdBy,
  });
  if (error) throw error;
  await markKolAsCooperated(values.kol_profile_id, cooperatedAt, table);
}

export async function updateCooperationRecord(
  id: string,
  values: KolCooperationFormValues,
  table: KolTableName = 'kol_profile'
): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const cooperatedAt = toCooperatedAt(values.cooperated_at);
  const ownerColumn = kolOwnerIdColumn(table);

  const { error } = await supabase
    .from('kol_cooperation')
    .update({
      [ownerColumn]: values.kol_profile_id,
      project_name: values.project_name.trim(),
      cooperation_content: values.cooperation_content.trim(),
      evaluation: values.cooperation_content.trim(),
      platforms: values.platforms,
      cooperated_at: cooperatedAt,
    })
    .eq('id', id);
  if (error) throw error;
  await markKolAsCooperated(values.kol_profile_id, cooperatedAt, table);
}

export async function deleteCooperationRecord(id: string): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const { error } = await supabase.from('kol_cooperation').delete().eq('id', id);
  if (error) throw error;
}
