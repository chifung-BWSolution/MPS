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
  | 'shortlist'
  | 'meeting'
  | 'cooperated'
  | 'star';

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

export const VIEW_META: Record<
  KolWorkflowView,
  { title: string; description: string }
> = {
  all: {
    title: 'KOL列表',
    description: '全量 KOL 資料庫，含所有分類與狀態。',
  },
  food: {
    title: '美食 KOL',
    description: '來自 Foodies／表單的美食類 KOL，狀態為未處理。',
  },
  beauty: {
    title: '美容 KOL',
    description: '美麗事件 Beauty 類 KOL，狀態為未處理。',
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
    description: '曾經或正在合作的 KOL 記錄。',
  },
  star: {
    title: '星級藝人',
    description: '經評分認可、可跨團隊使用的 KOL。',
  },
};

export function matchesWorkflowView(row: KolWorkflowRow, view: KolWorkflowView): boolean {
  const cat = (row.primary_category || 'other') as KolPrimaryCategory;
  const status = (row.lifecycle_status || 'unprocessed') as KolLifecycleStatus;

  switch (view) {
    case 'all':
      return true;
    case 'food':
      return status === 'unprocessed' && (cat === 'food' || cat === 'both');
    case 'beauty':
      return status === 'unprocessed' && (cat === 'beauty' || cat === 'both');
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
