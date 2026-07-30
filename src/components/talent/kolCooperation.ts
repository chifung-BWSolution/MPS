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

export async function markKolAsCooperated(
  kolProfileId: string,
  cooperatedAt: string
): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const { data: profile, error: readErr } = await supabase
    .from('kol_profile')
    .select('lifecycle_status')
    .eq('id', kolProfileId)
    .single();
  if (readErr) throw readErr;
  if (profile?.lifecycle_status === 'star') return;

  const at = cooperatedAt.includes('T')
    ? cooperatedAt
    : `${cooperatedAt}T12:00:00.000Z`;

  const { error } = await supabase
    .from('kol_profile')
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
  createdBy: string
): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const cooperatedAt = values.cooperated_at.includes('T')
    ? values.cooperated_at
    : `${values.cooperated_at}T12:00:00.000Z`;

  const { error } = await supabase.from('kol_cooperation').insert({
    kol_profile_id: values.kol_profile_id,
    project_name: values.project_name.trim(),
    cooperation_content: values.cooperation_content.trim(),
    evaluation: values.cooperation_content.trim(),
    platforms: values.platforms,
    cooperated_at: cooperatedAt,
    created_by: createdBy,
  });
  if (error) throw error;
  await markKolAsCooperated(values.kol_profile_id, cooperatedAt);
}
