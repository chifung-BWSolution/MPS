export type SeoKeywordRow = {
  id: string;
  website_profile_id: string;
  keyword: string;
  normalized_keyword: string;
  level: 'level_1' | 'level_2' | 'level_3';
  search_volume: number | null;
  current_ranking: number | null;
  target_ranking: number | null;
  target_page: string | null;
  difficulty_score: number | null;
  status: 'monitoring' | 'optimizing' | 'achieved' | 'paused';
  ai_generated: boolean;
  source: 'manual' | 'gsc' | 'ads' | 'import';
  gsc_site_url: string | null;
  last_gsc_sync_at: string | null;
  // joined for UI
  websiteName?: string;
  company?: string;
  brand?: string;
};

export type SeoUpgradeRow = {
  id: string;
  website_profile_id: string;
  upgrade_type: string;
  supplier: string | null;
  cost: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  staff_name: string | null;
  hours_spent: number;
  status: 'active' | 'completed' | 'cancelled';
  keyword_id: string | null;
  notes: string | null;
  websiteName?: string;
  company?: string;
  brand?: string;
  rankBefore?: number | null;
  rankAfter?: number | null;
};

export type GscSyncRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  sites_synced: number;
  rows_upserted: number;
  keywords_upserted: number;
  error_message: string | null;
};
