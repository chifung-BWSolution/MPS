import type { SeoKeywordRow } from '../types/seo';

/** Persist / show a query if it had any impressions in the synced window. */
export const GSC_KEYWORD_MIN_IMPRESSIONS = 1;

export type GscMetricKeywordSource = {
  query: string;
  impressions: number | string;
  position: number | string;
  metric_date: string;
  site_url: string;
  last_synced_at?: string | null;
};

function normalizeKeyword(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function aggregateGscMetricsToKeywordRows(
  websiteProfileId: string,
  rows: GscMetricKeywordSource[],
  minImpressions = GSC_KEYWORD_MIN_IMPRESSIONS,
): SeoKeywordRow[] {
  const byQuery = new Map<
    string,
    {
      display: string;
      impressions: number;
      positionWeighted: number;
      lastDate: string;
      lastPos: number;
      siteUrl: string;
      lastSyncedAt: string | null;
    }
  >();

  for (const row of rows) {
    const display = String(row.query || '').trim();
    const key = normalizeKeyword(display);
    if (!key) continue;
    const impressions = Number(row.impressions) || 0;
    const position = Number(row.position) || 0;
    const metricDate = String(row.metric_date || '');
    const prev = byQuery.get(key) || {
      display,
      impressions: 0,
      positionWeighted: 0,
      lastDate: metricDate,
      lastPos: position,
      siteUrl: String(row.site_url || ''),
      lastSyncedAt: row.last_synced_at ?? null,
    };
    prev.impressions += impressions;
    prev.positionWeighted += position * impressions;
    if (metricDate >= prev.lastDate) {
      prev.display = display;
      prev.lastDate = metricDate;
      prev.lastPos = position;
      prev.siteUrl = String(row.site_url || prev.siteUrl);
    }
    if (row.last_synced_at) prev.lastSyncedAt = row.last_synced_at;
    byQuery.set(key, prev);
  }

  return [...byQuery.entries()]
    .filter(([, agg]) => agg.impressions >= minImpressions)
    .map(([normalized, agg]) => {
      const avgPos = agg.impressions > 0
        ? Math.round((agg.positionWeighted / agg.impressions) * 10) / 10
        : agg.lastPos;
      return {
        id: `gsc:${websiteProfileId}:${normalized}`,
        website_profile_id: websiteProfileId,
        keyword: agg.display,
        normalized_keyword: normalized,
        level: 'level_3',
        search_volume: agg.impressions,
        current_ranking: avgPos,
        target_ranking: null,
        target_page: null,
        difficulty_score: null,
        status: 'monitoring',
        ai_generated: false,
        source: 'gsc',
        gsc_site_url: agg.siteUrl || null,
        last_gsc_sync_at: agg.lastSyncedAt,
      };
    })
    .sort((a, b) => a.keyword.localeCompare(b.keyword));
}
