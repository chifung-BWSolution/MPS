export const KOL_PRESET_TAGS = [
  '內容創作者',
  'MC',
  'Model',
  '直播',
  '影片',
  '美食',
  '美容',
  '試食',
  '探店',
] as const;

export const RATING_DIMENSIONS = [
  { key: 'score_professionalism', label: '專業度' },
  { key: 'score_cooperation', label: '配合度' },
  { key: 'score_content', label: '內容質量' },
  { key: 'score_engagement', label: '粉絲互動' },
] as const;

export type RatingDimensionKey = (typeof RATING_DIMENSIONS)[number]['key'];

export interface KolRatingRow {
  id: string;
  kol_profile_id: string;
  rated_by: string | null;
  score_professionalism: number;
  score_cooperation: number;
  score_content: number;
  score_engagement: number;
  overall_score: number;
  notes: string | null;
  created_at: string;
}

export type RatingDraft = Record<RatingDimensionKey, number>;

export const emptyRatingDraft = (): RatingDraft => ({
  score_professionalism: 3,
  score_cooperation: 3,
  score_content: 3,
  score_engagement: 3,
});

/** Suggested minimum average before star upgrade (soft gate). */
export const STAR_RATING_THRESHOLD = 3.5;

export function computeOverallScore(draft: RatingDraft): number {
  const values = RATING_DIMENSIONS.map((d) => draft[d.key]);
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export async function refreshKolRatingCache(kolProfileId: string): Promise<void> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .from('kol_rating')
    .select('overall_score, created_at')
    .eq('kol_profile_id', kolProfileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const count = rows.length;
  const avg =
    count === 0
      ? null
      : Math.round(
          (rows.reduce((s, r) => s + Number(r.overall_score), 0) / count) * 100
        ) / 100;
  const { error: updErr } = await supabase
    .from('kol_profile')
    .update({
      rating_avg: avg,
      rating_count: count,
      last_rated_at: count > 0 ? rows[0].created_at : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', kolProfileId);
  if (updErr) throw updErr;
}

export function starUpgradeWarning(ratingAvg: number | null | undefined): string | null {
  if (ratingAvg == null) return '尚未有評分記錄，建議先評分再升級星級。';
  if (ratingAvg < STAR_RATING_THRESHOLD) {
    return `平均分 ${ratingAvg.toFixed(1)} 低於建議標準 ${STAR_RATING_THRESHOLD}，仍要升級？`;
  }
  return null;
}
