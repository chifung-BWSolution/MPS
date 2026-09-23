import { instagramProfileUrl } from '@/lib/instagram';
import {
  kolOwnerIdColumn,
  resolvePrimaryCategoryFromThemes,
  resolveSourceSystemFromApply,
  type KolTableName,
} from '@/components/talent/kolWorkflow';

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

export interface KolCooperationPerson {
  name: string | null;
  instagram_account: string | null;
  phone: string | null;
}

export interface KolCooperationRow {
  id: string;
  kol_profile_id: string | null;
  kol_new_beauty_id?: string | null;
  project_name: string | null;
  project_type: string | null;
  fee: string | null;
  evaluation: string | null;
  cooperation_content: string | null;
  platforms: string[] | null;
  cooperated_at: string;
  created_by: string | null;
  created_at: string;
  kol_profile?: KolCooperationPerson | null;
  kol_new_beauty?: KolCooperationPerson | null;
}

export function cooperationOwnerTable(row: {
  kol_profile_id?: string | null;
  kol_new_beauty_id?: string | null;
}): KolTableName {
  return row.kol_new_beauty_id && !row.kol_profile_id ? 'kol_new_beauty' : 'kol_profile';
}

export function cooperationOwnerId(row: {
  kol_profile_id?: string | null;
  kol_new_beauty_id?: string | null;
}): string {
  if (row.kol_new_beauty_id && !row.kol_profile_id) return row.kol_new_beauty_id;
  return row.kol_profile_id || row.kol_new_beauty_id || '';
}

export function cooperationPerson(row: KolCooperationRow): KolCooperationPerson | null {
  if (row.kol_new_beauty_id && !row.kol_profile_id) {
    return row.kol_new_beauty || row.kol_profile || null;
  }
  return row.kol_profile || row.kol_new_beauty || null;
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
    kol_profile_id: cooperationOwnerId(row),
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

/** Fields copied from a KOL application into kol_profile / kol_new_beauty. */
export interface KolApplyPromotionInput {
  id: string;
  name: string | null;
  salutation: string | null;
  email: string | null;
  phone: string | null;
  age_group: string | null;
  birth_month: string | null;
  residence_area: string | null;
  work_area: string | null;
  blog_themes: string[] | null;
  specialty: string | null;
  instagram_account: string | null;
  instagram_followers: number | null;
  facebook_url: string | null;
  facebook_likes: number | null;
  xiaohongshu_url: string | null;
  xiaohongshu_followers: number | null;
  youtube_url: string | null;
  youtube_subscribers: number | null;
  openrice_url: string | null;
  openrice_level: string | null;
  blog_url: string | null;
  blog_subscribers: number | null;
  other_channels: string | null;
  other_followers: number | null;
  publish_platforms: string | null;
  tasting_frequency: string | null;
  tasting_experience: string | null;
  model_experience: string | null;
  on_camera_experience: string | null;
  wine_club: string | null;
  cooperation_intent: string | null;
  available_times: string | null;
  video_blog_promo: string | null;
  facebook_live_interest: string | null;
  photo_url: string | null;
  work_photo_url: string | null;
  raw_payload: Record<string, unknown> | null;
  applied_at: string;
  source: string | null;
  kol_profile_id: string | null;
  kol_new_beauty_id: string | null;
}

function linkedKolOwner(row: {
  kol_profile_id?: string | null;
  kol_new_beauty_id?: string | null;
}): { id: string; table: KolTableName } | null {
  if (row.kol_new_beauty_id) return { id: row.kol_new_beauty_id, table: 'kol_new_beauty' };
  if (row.kol_profile_id) return { id: row.kol_profile_id, table: 'kol_profile' };
  return null;
}

/**
 * Attach an application to kol_profile or kol_new_beauty.
 * Already-linked rows are returned as-is unless updateExisting rewrites the profile (批核).
 */
export async function promoteKolApply(
  row: KolApplyPromotionInput,
  options?: { updateExisting?: boolean }
): Promise<{ id: string; table: KolTableName }> {
  const existing = linkedKolOwner(row);
  if (existing && !options?.updateExisting) return existing;

  const { supabase } = await import('@/lib/supabase');
  const primaryCategory = resolvePrimaryCategoryFromThemes(row);
  const sourceSystem = resolveSourceSystemFromApply(row);
  const isNewBeauty = sourceSystem === 'beauty18';
  const table: KolTableName = isNewBeauty ? 'kol_new_beauty' : 'kol_profile';

  const profilePayload = {
    name: row.name,
    salutation: row.salutation,
    email: row.email,
    phone: row.phone,
    age_group: row.age_group,
    birth_month: row.birth_month,
    residence_area: row.residence_area,
    work_area: row.work_area,
    blog_themes: row.blog_themes || [],
    specialty: row.specialty,
    instagram_account: row.instagram_account,
    instagram_followers: row.instagram_followers,
    facebook_url: row.facebook_url,
    facebook_likes: row.facebook_likes,
    xiaohongshu_url: row.xiaohongshu_url,
    xiaohongshu_followers: row.xiaohongshu_followers,
    youtube_url: row.youtube_url,
    youtube_subscribers: row.youtube_subscribers,
    openrice_url: row.openrice_url,
    openrice_level: row.openrice_level,
    blog_url: row.blog_url,
    blog_subscribers: row.blog_subscribers,
    other_channels: row.other_channels,
    other_followers: row.other_followers,
    publish_platforms: row.publish_platforms,
    tasting_frequency: row.tasting_frequency,
    tasting_experience: row.tasting_experience,
    model_experience: row.model_experience,
    on_camera_experience: row.on_camera_experience,
    wine_club: row.wine_club,
    cooperation_intent: row.cooperation_intent,
    available_times: row.available_times,
    video_blog_promo: row.video_blog_promo,
    facebook_live_interest: row.facebook_live_interest,
    photo_url: row.photo_url,
    work_photo_url: row.work_photo_url,
    raw_payload: {
      ...(row.raw_payload || {}),
      fromKolApplyId: row.id,
      source: row.source,
    },
    source_created_at: row.applied_at,
    source_status: 'from_apply',
    primary_category: primaryCategory,
    source_system: sourceSystem,
    lifecycle_status: 'unprocessed' as const,
    ...(isNewBeauty ? { kol_apply_id: row.id } : {}),
  };

  const existingId = isNewBeauty ? row.kol_new_beauty_id : row.kol_profile_id;
  let ownerId = existingId;
  if (!ownerId) {
    const { data, error: insErr } = await supabase
      .from(table)
      .insert(profilePayload)
      .select('id')
      .single();
    if (insErr) throw insErr;
    ownerId = data.id as string;
  } else {
    const { error: updProfileErr } = await supabase.from(table).update(profilePayload).eq('id', ownerId);
    if (updProfileErr) throw updProfileErr;
  }

  const { error: updErr } = await supabase
    .from('kol_apply')
    .update({
      audit_status: 'added_to_db',
      ...(isNewBeauty
        ? { kol_new_beauty_id: ownerId, kol_profile_id: null }
        : { kol_profile_id: ownerId }),
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (updErr) throw updErr;

  return { id: ownerId, table };
}

/** Resolve an application to a KOL owner, creating the profile when it is not linked yet. */
export async function ensureKolOwnerFromApply(
  applyId: string
): Promise<{ id: string; table: KolTableName }> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.from('kol_apply').select('*').eq('id', applyId).single();
  if (error) throw error;
  return promoteKolApply(data as KolApplyPromotionInput, { updateExisting: false });
}
