export interface KolWorkflowRow {
  primary_category?: string | null;
  lifecycle_status?: string | null;
}

export type KolPrimaryCategory = 'food' | 'beauty' | 'both' | 'other';
export type KolLifecycleStatus = 'unprocessed' | 'shortlist' | 'meeting' | 'cooperated' | 'star';
export type KolWorkflowView =
  | 'all'
  | 'food'
  | 'beauty'
  | 'new-beauty'
  | 'shortlist'
  | 'meeting'
  | 'cooperated'
  | 'star';

/** Supabase table for each KOL workflow view. */
export type KolTableName = 'kol_profile' | 'kol_new_beauty';

export function kolTableForView(view: KolWorkflowView): KolTableName {
  return view === 'new-beauty' ? 'kol_new_beauty' : 'kol_profile';
}

export function kolOwnerIdColumn(
  table: KolTableName
): 'kol_profile_id' | 'kol_new_beauty_id' {
  return table === 'kol_new_beauty' ? 'kol_new_beauty_id' : 'kol_profile_id';
}

export const LIFECYCLE_LABELS: Record<KolLifecycleStatus, string> = {
  unprocessed: '未處理',
  shortlist: '候選',
  meeting: '約見中',
  cooperated: '已合作',
  star: '星級',
};

export const CATEGORY_LABELS: Record<KolPrimaryCategory, string> = {
  food: '美食',
  beauty: '美容',
  both: '美食+美容',
  other: '其他',
};

/** Card/detail badge: use DB category, contextual label when both food+beauty. */
export function categoryBadgeLabel(
  primaryCategory: string | null | undefined,
  workflowView?: KolWorkflowView
): string {
  const cat = (primaryCategory || 'other') as KolPrimaryCategory;
  if (cat === 'both') {
    if (workflowView === 'beauty') return '美容';
    if (workflowView === 'food') return '美食';
    return CATEGORY_LABELS.both;
  }
  return CATEGORY_LABELS[cat] ?? CATEGORY_LABELS.other;
}

export const VIEW_META: Record<
  KolWorkflowView,
  { title: string; description: string }
> = {
  all: {
    title: '全部KOL',
    description: '全量 KOL 資料庫，含所有分類與狀態。',
  },
  food: {
    title: '美食KOL',
    description: '來自 Foodies／表單的美食類 KOL，狀態為未處理。',
  },
  beauty: {
    title: '美容KOL',
    description: '美麗事件 Beauty 類 KOL，狀態為未處理。',
  },
  'new-beauty': {
    title: '新美容KOL',
    description: 'Blog 主題或專長含 Beauty 的 KOL（含 KOL 申請批核匯入），獨立資料表 kol_new_beauty。',
  },
  shortlist: {
    title: '候選名單',
    description: '待篩選的潛在合作對象，可持續瀏覽與操作。',
  },
  meeting: {
    title: '預約見面',
    description: '正在安排或已安排見面的 KOL。',
  },
  cooperated: {
    title: '已合作 KOL',
    description: '記錄與 KOL 的合作項目、內容、平台與日期。',
  },
  star: {
    title: '星級藝人',
    description: '經評分認可、可跨團隊使用的 KOL。',
  },
};

export interface KolWorkflowRowWithSource extends KolWorkflowRow {
  source_system?: string | null;
}

/** Blog 主題或專長是否含 beauty（不分大小寫，含美麗／美容） */
export function rowHasBeautyKeyword(row: {
  blog_themes?: string[] | null;
  specialty?: string | null;
}): boolean {
  const pattern = /beauty|美麗|美容/i;
  const themes = row.blog_themes || [];
  if (themes.some((t) => pattern.test(t))) return true;
  return Boolean(row.specialty && pattern.test(row.specialty));
}

function rowHasFoodKeyword(row: {
  blog_themes?: string[] | null;
  specialty?: string | null;
}): boolean {
  const themes = row.blog_themes || [];
  if (themes.some((t) => /food|美食/i.test(t))) return true;
  return Boolean(row.specialty && /food|美食/i.test(row.specialty));
}

/** 依 Blog 主題／專長推導 primary_category */
export function resolvePrimaryCategoryFromThemes(row: {
  blog_themes?: string[] | null;
  specialty?: string | null;
}): KolPrimaryCategory {
  const hasBeauty = rowHasBeautyKeyword(row);
  const hasFood = rowHasFoodKeyword(row);
  if (hasFood && hasBeauty) return 'both';
  if (hasBeauty) return 'beauty';
  if (hasFood) return 'food';
  return 'other';
}

/** KOL 申請批核寫入 kol_profile 時的 source_system */
export function resolveSourceSystemFromApply(row: {
  blog_themes?: string[] | null;
  specialty?: string | null;
}): 'beauty18' | 'emailmeform' {
  return rowHasBeautyKeyword(row) ? 'beauty18' : 'emailmeform';
}

export function matchesWorkflowView(row: KolWorkflowRowWithSource, view: KolWorkflowView): boolean {
  const cat = (row.primary_category || 'other') as KolPrimaryCategory;
  const status = (row.lifecycle_status || 'unprocessed') as KolLifecycleStatus;
  const source = row.source_system || 'manual';

  switch (view) {
    case 'all':
      return true;
    case 'food':
      return status === 'unprocessed' && (cat === 'food' || cat === 'both');
    case 'beauty':
      return (
        status === 'unprocessed' &&
        (cat === 'beauty' || cat === 'both') &&
        source !== 'beauty18'
      );
    case 'new-beauty':
      // Rows live in kol_new_beauty; list module filters lifecycle only.
      return status === 'unprocessed';
    case 'shortlist':
      return status === 'shortlist';
    case 'meeting':
      return status === 'meeting';
    case 'cooperated':
      return status === 'cooperated';
    case 'star':
      return status === 'star';
    default:
      return true;
  }
}

export type WorkflowAction =
  | { kind: 'shortlist' }
  | { kind: 'meeting' }
  | { kind: 'cooperated' }
  | { kind: 'star' }
  | { kind: 'back_shortlist' }
  | { kind: 'back_unprocessed' };

export const WORKFLOW_ACTION_LABELS: Record<WorkflowAction['kind'], string> = {
  shortlist: '加入候選',
  meeting: '安排約見',
  cooperated: '標記已合作',
  star: '升級星級',
  back_shortlist: '退回候選',
  back_unprocessed: '退回未處理',
};

export interface KolWorkflowRowFull extends KolWorkflowRow {
  lifecycle_status?: string | null;
  fee_standard?: string | null;
  recognized_at?: string | null;
  recognized_by?: string | null;
  shortlist_at?: string | null;
  meeting_at?: string | null;
  meeting_location?: string | null;
  meeting_notes?: string | null;
  meeting_status?: string | null;
  cooperated_at?: string | null;
}

export function availableWorkflowActions(row: KolWorkflowRowFull): WorkflowAction[] {
  const status = (row.lifecycle_status || 'unprocessed') as KolLifecycleStatus;

  switch (status) {
    case 'unprocessed':
      return [{ kind: 'shortlist' }];
    case 'shortlist':
      return [{ kind: 'meeting' }, { kind: 'cooperated' }, { kind: 'back_unprocessed' }];
    case 'meeting':
      return [
        { kind: 'cooperated' },
        { kind: 'star' },
        { kind: 'back_shortlist' },
      ];
    case 'cooperated':
      return [{ kind: 'star' }, { kind: 'back_shortlist' }];
    case 'star':
      return [{ kind: 'back_shortlist' }];
    default:
      return [];
  }
}

export function buildLifecyclePatch(
  action: WorkflowAction['kind'],
  extras?: { fee_standard?: string; recognized_by?: string }
): Record<string, unknown> {
  const now = new Date().toISOString();

  switch (action) {
    case 'shortlist':
      return { lifecycle_status: 'shortlist', shortlist_at: now };
    case 'meeting':
      return {
        lifecycle_status: 'meeting',
        meeting_status: 'pending',
        meeting_at: null,
      };
    case 'cooperated':
      return {
        lifecycle_status: 'cooperated',
        cooperated_at: now,
        meeting_status: 'completed',
      };
    case 'star':
      return {
        lifecycle_status: 'star',
        recognized_at: now,
        recognized_by: extras?.recognized_by || null,
        fee_standard: extras?.fee_standard || null,
      };
    case 'back_shortlist':
      return { lifecycle_status: 'shortlist' };
    case 'back_unprocessed':
      return { lifecycle_status: 'unprocessed' };
    default:
      return {};
  }
}
