/**
 * 社媒自動化營運 · 狀態機（PRD §6.3）
 *
 * 這裡的轉換表是前後端唯一依據：
 *   - 前端據此隱藏／禁用動作
 *   - Edge Function 在每次寫入前用 assertTransition 再驗一次（不信任前端）
 *
 * 硬性不變量（見 PRD §6.3）由 DB CHECK 與這裡的 guard 雙重把關。
 */

import type {
  ContentArticle,
  ContentArticleStatus,
  ContentJobStatus,
  ContentKeywordPipelineStatus,
  ContentSiteHealth,
  ContentSlotStatus,
} from './contentTypes.ts';

export type ContentMachine = 'article' | 'slot' | 'keyword' | 'job';

type TransitionMap<S extends string> = Record<S, readonly S[]>;

// ============================================================
// 轉換表
// ============================================================

export const ARTICLE_TRANSITIONS: TransitionMap<ContentArticleStatus> = {
  draft: ['pending_review', 'cancelled', 'held'],
  pending_review: ['approved', 'changes_requested', 'cancelled', 'held', 'draft'],
  changes_requested: ['draft', 'pending_review', 'cancelled', 'held'],
  held: ['draft', 'pending_review', 'cancelled', 'scheduled'],
  approved: ['scheduled', 'cancelled', 'held'],
  scheduled: ['publishing', 'cancelled', 'held', 'approved'],
  publishing: ['published', 'publish_failed', 'manual_done', 'draft_published'],
  // cancelled 也是「遠端刪除」的終態（worker 實際刪除成功後才會轉入）
  published: ['updating', 'verify_failed', 'cancelled'],
  updating: ['published', 'verify_failed', 'cancelled'],
  publish_failed: ['scheduled', 'publishing', 'cancelled', 'held'],
  verify_failed: ['published', 'updating', 'publish_failed', 'cancelled'],
  manual_done: [],
  draft_published: ['cancelled'],
  cancelled: [],
};

export const SLOT_TRANSITIONS: TransitionMap<ContentSlotStatus> = {
  planned: ['generating', 'held', 'skipped', 'in_review'],
  generating: ['draft_ready', 'failed', 'held'],
  draft_ready: ['in_review', 'failed', 'held'],
  in_review: ['approved', 'held', 'failed'],
  approved: ['scheduled', 'held', 'failed'],
  scheduled: ['publishing', 'held', 'failed'],
  publishing: ['published', 'failed', 'held'],
  published: [],
  failed: ['planned', 'generating', 'held', 'skipped'],
  held: ['planned', 'generating', 'skipped'],
  skipped: ['planned'],
};

export const KEYWORD_TRANSITIONS: TransitionMap<ContentKeywordPipelineStatus> = {
  backlog: ['planned', 'generating', 'rejected', 'parked'],
  planned: ['generating', 'backlog', 'parked'],
  generating: ['in_review', 'backlog', 'parked'],
  in_review: ['published', 'backlog', 'rejected'],
  published: [],
  rejected: ['backlog'],
  parked: ['backlog'],
};

export const JOB_TRANSITIONS: TransitionMap<ContentJobStatus> = {
  queued: ['running', 'dead'],
  running: ['done', 'failed', 'queued'],
  failed: ['queued', 'dead'],
  done: [],
  dead: ['queued'],
};

// ============================================================
// 查詢與驗證
// ============================================================

const MACHINE_TABLES: Record<ContentMachine, TransitionMap<string>> = {
  article: ARTICLE_TRANSITIONS as TransitionMap<string>,
  slot: SLOT_TRANSITIONS as TransitionMap<string>,
  keyword: KEYWORD_TRANSITIONS as TransitionMap<string>,
  job: JOB_TRANSITIONS as TransitionMap<string>,
};

export class ContentTransitionError extends Error {
  readonly machine: ContentMachine;
  readonly from: string;
  readonly to: string;

  constructor(machine: ContentMachine, from: string, to: string) {
    super(`不允許的狀態轉換（${machine}）：${from} → ${to}`);
    this.name = 'ContentTransitionError';
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}

export function canTransition(
  machine: ContentMachine,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const allowed = MACHINE_TABLES[machine]?.[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertTransition(
  machine: ContentMachine,
  from: string,
  to: string,
): void {
  if (!canTransition(machine, from, to)) {
    throw new ContentTransitionError(machine, from, to);
  }
}

export function nextStatuses(
  machine: ContentMachine,
  from: string,
): readonly string[] {
  return MACHINE_TABLES[machine]?.[from] ?? [];
}

/** 只在必要時才寫入狀態（避免無意義的 update 與觸發器噪音） */
export function transitionValue<S extends string>(
  machine: ContentMachine,
  from: S,
  to: S,
): S | null {
  return from === to ? null : to;
}

// ============================================================
// 狀態語義
// ============================================================

const ARTICLE_TERMINAL: ReadonlySet<ContentArticleStatus> = new Set([
  'manual_done',
  'draft_published',
  'cancelled',
]);

/** 計入「已公開發布」漏斗的狀態（manual_done 不算，PRD §6.3 規則 5） */
const ARTICLE_PUBLIC: ReadonlySet<ContentArticleStatus> = new Set(['published']);

const ARTICLE_AWAITING_APPROVAL: ReadonlySet<ContentArticleStatus> = new Set([
  'pending_review',
  'changes_requested',
  'draft',
]);

const ARTICLE_LOCKED_FROM_AUTO_PUBLISH: ReadonlySet<ContentArticleStatus> = new Set([
  'draft',
  'pending_review',
  'changes_requested',
  'held',
  'cancelled',
]);

export function isArticleTerminal(status: ContentArticleStatus): boolean {
  return ARTICLE_TERMINAL.has(status);
}

export function isArticlePubliclyPublished(status: ContentArticleStatus): boolean {
  return ARTICLE_PUBLIC.has(status);
}

export function isArticleAwaitingApproval(status: ContentArticleStatus): boolean {
  return ARTICLE_AWAITING_APPROVAL.has(status);
}

/** held / draft / pending_review 永不得由自動流程轉為 published（PRD §6.3 規則 4） */
export function canAutoPublish(status: ContentArticleStatus): boolean {
  return status === 'scheduled' || status === 'approved';
}

export function isArticleAutoPublishBlocked(status: ContentArticleStatus): boolean {
  return ARTICLE_LOCKED_FROM_AUTO_PUBLISH.has(status);
}

/**
 * 自動發佈（direct／draft）的批准閘門：必須留下審核人與批准時間。
 * DB 只在 status='approved' 時強制這兩個欄位；scheduled 可能被繞過，
 * 所以 confirm 與 worker 都要再驗一次（PRD §6.3 不變量 1）。
 */
export function isApprovedForPublish(
  article: Pick<ContentArticle, 'reviewer_id' | 'approved_at'>,
): boolean {
  return Boolean(article.reviewer_id && article.approved_at);
}

export function isSlotOpen(status: ContentSlotStatus): boolean {
  return status !== 'published' && status !== 'skipped' && status !== 'failed';
}

export function isSlotFilled(status: ContentSlotStatus): boolean {
  return status === 'published' || status === 'publishing';
}

// ============================================================
// 標籤
// ============================================================

export const ARTICLE_STATUS_LABEL: Record<ContentArticleStatus, string> = {
  draft: '草稿',
  pending_review: '待審',
  changes_requested: '需修改',
  held: '已保留',
  approved: '已批准',
  scheduled: '已排程',
  publishing: '發布中',
  published: '已發佈',
  updating: '更新中',
  publish_failed: '發布失敗',
  verify_failed: '驗證失敗',
  cancelled: '已取消',
  manual_done: '已手動上線',
  draft_published: '已建草稿',
};

export const SLOT_STATUS_LABEL: Record<ContentSlotStatus, string> = {
  planned: '待生成',
  generating: '生成中',
  draft_ready: '草稿就緒',
  in_review: '待審',
  approved: '已批准',
  scheduled: '已排程',
  publishing: '發布中',
  published: '已發佈',
  failed: '生成失敗',
  held: '保留',
  skipped: '已跳過',
};

export const KEYWORD_PIPELINE_LABEL: Record<ContentKeywordPipelineStatus, string> = {
  backlog: '待生成',
  planned: '已排程',
  generating: '生成中',
  in_review: '待審',
  published: '已發佈',
  rejected: '已駁回',
  parked: '暫緩',
};

export const JOB_STATUS_LABEL: Record<ContentJobStatus, string> = {
  queued: '排隊中',
  running: '執行中',
  done: '完成',
  failed: '失敗待重試',
  dead: '已放棄',
};

export const JOB_TYPE_LABEL: Record<string, string> = {
  plan_slots: '產生排程',
  generate_article: '生成文章',
  publish_article: '發布文章',
  verify_publish: '驗證上線',
  refresh_site_pages: '刷新站內頁面',
  site_health: '站點健康檢查',
  send_digest: '寄送日報',
  generate_social: '生成社媒稿',
  delete_article: '刪除站點文章',
};

export const SITE_HEALTH_LABEL: Record<ContentSiteHealth, string> = {
  untested: '未測試',
  ok: '健康',
  degraded: '降級',
  down: '異常',
};

export const TIER_LABEL: Record<string, string> = {
  A1: 'A1 重點站',
  A2: 'A2 成長站',
  B: 'B 一般站',
};

export const ADAPTER_LABEL: Record<string, string> = {
  manual: '手動內容',
  next_custom: 'Next 自訂端點',
  shopify: 'Shopify',
  wordpress: 'WordPress',
  webflow: 'Webflow',
  beauty100: 'Beauty100 自動發佈',
};

/**
 * 需要封面才可發佈的 adapter（伺服器端另有 adapter.requiresCover 為最終依據）。
 * 前端用它提前禁用 Confirm；兩邊由 content-selftest 檢查一致。
 */
export const ADAPTER_REQUIRES_COVER: Readonly<Record<string, boolean>> = {
  beauty100: true,
};

export const PUBLISH_MODE_LABEL: Record<string, string> = {
  manual: '人工發佈',
  draft: '建立草稿',
  direct: '直接公開',
};

// ============================================================
// 給營運人員看的選項說明（下拉選單用；內部值不變）
//
// 原則：先說「這是什麼、會有什麼結果」，再看情況把技術詞放括號。
// 技術值（manual／A1／article…）永遠不變，只換顯示文字。
// ============================================================

export const TIER_OPTION_LABEL: Record<string, string> = {
  A1: 'A1 重點站（優先產出，可每日或高頻）',
  A2: 'A2 成長站（固定每週產出）',
  B: 'B 一般站（低頻維運）',
};

export const ADAPTER_OPTION_LABEL: Record<string, string> = {
  manual: '手動內容（用戶自行下載內容發佈）',
  next_custom: '網站 API（自動發佈到自家網站）',
  shopify: 'Shopify（自動發佈到商店部落格）',
  wordpress: 'WordPress（用應用程式密碼自動發佈）',
  webflow: 'Webflow（自動發佈到 CMS）',
  beauty100: 'Beauty100 自動發佈（用專用帳號寫入官網）',
};

export const PUBLISH_MODE_OPTION_LABEL: Record<string, string> = {
  manual: '人工發佈（下載內容包，自己貼上網站）',
  draft: '建立草稿（自動送進官網草稿匣，確認後再公開）',
  direct: '直接公開（自動發佈到官網）',
};

export const SECTION_TYPE_OPTION_LABEL: Record<string, string> = {
  article: '一般文章（適合 SEO 長文）',
  post: '短貼文（消息、動態）',
  page: '固定頁面（關於我們、服務介紹）',
};

export const CADENCE_FREQUENCY_OPTION_LABEL: Record<string, string> = {
  daily: '每日（每天一篇）',
  every_2_days: '隔日（每兩天一篇）',
  twice_weekly: '每週兩次（可自己選兩天）',
  weekly: '每週一次（可自己選一天）',
  custom: '自訂（自己挑星期）',
};

export const CADENCE_FREQUENCY_LABEL: Record<string, string> = {
  daily: '每日',
  every_2_days: '隔日',
  twice_weekly: '每週兩次',
  weekly: '每週一次',
  custom: '自訂',
};

export const KEYWORD_INTENT_LABEL: Record<string, string> = {
  informational: '資訊型',
  commercial: '商業型',
  transactional: '交易型',
  navigational: '導航型',
};

export function statusLabel(
  machine: ContentMachine | 'health' | 'site',
  status: string,
): string {
  switch (machine) {
    case 'article':
      return ARTICLE_STATUS_LABEL[status as ContentArticleStatus] ?? status;
    case 'slot':
      return SLOT_STATUS_LABEL[status as ContentSlotStatus] ?? status;
    case 'keyword':
      return KEYWORD_PIPELINE_LABEL[status as ContentKeywordPipelineStatus] ?? status;
    case 'job':
      return JOB_STATUS_LABEL[status as ContentJobStatus] ?? status;
    case 'health':
      return SITE_HEALTH_LABEL[status as ContentSiteHealth] ?? status;
    default:
      return status;
  }
}

// ============================================================
// 狀態色票（PRD §8.1：統一由 ContentStatusPill 輸出）
// ============================================================

export type ContentStatusTone =
  | 'slate'
  | 'amber'
  | 'amber-outline'
  | 'teal'
  | 'teal-dark'
  | 'blue'
  | 'indigo'
  | 'indigo-outline'
  | 'rose'
  | 'green'
  | 'muted';

const ARTICLE_STATUS_TONE: Record<ContentArticleStatus, ContentStatusTone> = {
  draft: 'slate',
  pending_review: 'amber',
  changes_requested: 'amber',
  held: 'amber-outline',
  approved: 'teal',
  scheduled: 'blue',
  publishing: 'blue',
  published: 'teal-dark',
  updating: 'blue',
  publish_failed: 'rose',
  verify_failed: 'rose',
  cancelled: 'muted',
  manual_done: 'indigo',
  draft_published: 'indigo-outline',
};

const SLOT_STATUS_TONE: Record<ContentSlotStatus, ContentStatusTone> = {
  planned: 'slate',
  generating: 'blue',
  draft_ready: 'teal',
  in_review: 'amber',
  approved: 'teal',
  scheduled: 'blue',
  publishing: 'blue',
  published: 'teal-dark',
  failed: 'rose',
  held: 'amber-outline',
  skipped: 'muted',
};

const KEYWORD_PIPELINE_TONE: Record<ContentKeywordPipelineStatus, ContentStatusTone> = {
  backlog: 'slate',
  planned: 'blue',
  generating: 'blue',
  in_review: 'amber',
  published: 'teal-dark',
  rejected: 'rose',
  parked: 'muted',
};

const JOB_STATUS_TONE: Record<ContentJobStatus, ContentStatusTone> = {
  queued: 'slate',
  running: 'blue',
  done: 'teal',
  failed: 'amber',
  dead: 'rose',
};

const HEALTH_TONE: Record<ContentSiteHealth, ContentStatusTone> = {
  untested: 'slate',
  ok: 'green',
  degraded: 'amber',
  down: 'rose',
};

export function statusTone(
  machine: ContentMachine | 'health',
  status: string,
): ContentStatusTone {
  switch (machine) {
    case 'article':
      return ARTICLE_STATUS_TONE[status as ContentArticleStatus] ?? 'slate';
    case 'slot':
      return SLOT_STATUS_TONE[status as ContentSlotStatus] ?? 'slate';
    case 'keyword':
      return KEYWORD_PIPELINE_TONE[status as ContentKeywordPipelineStatus] ?? 'slate';
    case 'job':
      return JOB_STATUS_TONE[status as ContentJobStatus] ?? 'slate';
    case 'health':
      return HEALTH_TONE[status as ContentSiteHealth] ?? 'slate';
    default:
      return 'slate';
  }
}

// ============================================================
// 發佈狀態（文章佇列／審核工作室共用）
//
// 只根據 content_articles 既有欄位推導，不新增 DB 欄位、不額外查 job。
// scheduled → 排隊中；publishing → 發佈中；published → 成功（或驗證中）；
// deleted_at → 已下架；publish_failed／verify_failed → 失敗。
// ============================================================

export type PublishStage =
  | 'manual'
  | 'deleted'
  | 'failed'
  | 'published'
  | 'verify_pending'
  | 'publishing'
  | 'queued'
  | 'approved'
  | 'draft'
  | 'blocked';

export interface PublishStageInfo {
  stage: PublishStage;
  label: string;
  tone: ContentStatusTone;
  /** 給 tooltip／副標的一句話；沒有就 null */
  hint: string | null;
}

export interface PublishStageOptions {
  /** 站點 publish_mode='manual'：沒有自動發佈 */
  manual?: boolean;
  /** 測試注入，避免 flaky */
  now?: Date;
}

/** 排程時間超過這個門檻仍在 scheduled → 顯示「延遲」提示（worker 可能沒跑） */
export const PUBLISH_DELAY_WARNING_MS = 10 * 60 * 1000;

export function publishStage(
  article: Pick<
    ContentArticle,
    'status' | 'deleted_at' | 'checks' | 'scheduled_publish_at'
  >,
  options: PublishStageOptions = {},
): PublishStageInfo {
  const status = article.status;
  const verify = article.checks?.verify;

  if (status === 'manual_done') {
    return {
      stage: 'manual',
      label: '已手動上線',
      tone: 'indigo',
      hint: '手動內容包已由人工回填上線 URL',
    };
  }

  if (options.manual) {
    return {
      stage: 'manual',
      label: '人工發佈',
      tone: 'indigo',
      hint: '這個站點是手動模式，內容包產生後由人工貼上',
    };
  }

  if (article.deleted_at) {
    return {
      stage: 'deleted',
      label: '已下架（遠端刪除）',
      tone: 'muted',
      hint: '站點上的文章已實際刪除；MPS 保留發佈回執',
    };
  }

  if (status === 'published') {
    if (verify && verify.ok === false) {
      return {
        stage: 'failed',
        label: '上線驗證失敗',
        tone: 'rose',
        hint: '文章已發出，但上線驗證未通過；可查看回執後重試',
      };
    }
    if (verify && verify.ok === true) {
      return {
        stage: 'published',
        label: '已發佈（成功）',
        tone: 'teal-dark',
        hint: '站點已上線，且通過上線驗證',
      };
    }
    return {
      stage: 'verify_pending',
      label: '已發佈（驗證中）',
      tone: 'teal',
      hint: '文章已送到站點，等待上線驗證完成',
    };
  }

  if (status === 'publishing') {
    return {
      stage: 'publishing',
      label: '發佈中',
      tone: 'blue',
      hint: 'worker 正在呼叫站點 API',
    };
  }

  if (status === 'scheduled') {
    const scheduledAt = article.scheduled_publish_at
      ? new Date(article.scheduled_publish_at).getTime()
      : Number.NaN;
    const now = (options.now ?? new Date()).getTime();
    const late =
      Number.isFinite(scheduledAt) &&
      now - scheduledAt > PUBLISH_DELAY_WARNING_MS;
    return {
      stage: 'queued',
      label: late ? '排隊中（延遲）' : '排隊中',
      tone: late ? 'amber' : 'blue',
      hint: late
        ? '已過排程時間超過 10 分鐘仍未發佈，請檢查 content-worker 是否正常執行'
        : '已排程，到點後由 worker 發佈',
    };
  }

  if (status === 'approved') {
    return {
      stage: 'approved',
      label: '已批准（未排程）',
      tone: 'teal',
      hint: '已通過審核，尚未 Confirm 排定發佈時間',
    };
  }

  if (status === 'updating') {
    return {
      stage: 'publishing',
      label: '更新中',
      tone: 'blue',
      hint: '站點文章更新中',
    };
  }

  if (status === 'draft_published') {
    return {
      stage: 'draft',
      label: '已建草稿',
      tone: 'indigo-outline',
      hint: '站點只建立草稿，尚未公開發佈',
    };
  }

  if (status === 'publish_failed') {
    return {
      stage: 'failed',
      label: '發佈失敗',
      tone: 'rose',
      hint: '發佈失敗；可在回執頁查看原因並重試',
    };
  }

  if (status === 'verify_failed') {
    return {
      stage: 'failed',
      label: '上線驗證失敗',
      tone: 'rose',
      hint: '文章已發出，但上線驗證未通過',
    };
  }

  if (status === 'cancelled') {
    return {
      stage: 'blocked',
      label: '已取消',
      tone: 'muted',
      hint: '文章已取消，不會發佈',
    };
  }

  return {
    stage: 'blocked',
    label: ARTICLE_STATUS_LABEL[status] ?? status,
    tone: ARTICLE_STATUS_TONE[status] ?? 'slate',
    hint: '尚未批准／排程，不會發佈到站點',
  };
}
