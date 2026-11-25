/**
 * 社媒自動化營運 · 排程計算（PRD §6.2.5、§9.2.1–9.2.2）
 *
 * 前後端共用的唯一排程演算法：
 *   cadence（站點時區的牆上時間） → 未來 N 天的 publish_at / generate_at
 *
 * 冪等性來自 `unique(site_id, publish_at)`；這裡輸出的 dedupe_key
 * 就是 `siteId:epochMs`，可直接作為 upsert 的比對鍵。
 */

import type {
  ContentCadence,
  ContentCadenceFrequency,
  ContentPlannedSlot,
  ContentSlot,
} from './contentTypes.ts';
import {
  DEFAULT_CADENCE,
  addDaysToDateString,
  pad2,
  todayInZone,
  zonedWallTimeToUtc,
} from './contentFormat.ts';

export const DEFAULT_PLAN_HORIZON_DAYS = 30;

/** 各頻率的預設星期（1 = 週一 … 7 = 週日） */
const FREQUENCY_WEEKDAYS: Record<Exclude<ContentCadenceFrequency, 'custom'>, number[]> = {
  daily: [1, 2, 3, 4, 5, 6, 7],
  every_2_days: [1, 2, 3, 4, 5, 6, 7],
  twice_weekly: [1, 4],
  weekly: [1],
};

export interface PlanSlotsInput {
  siteId: string;
  cadence: ContentCadence;
  timezone: string;
  /** 以這個瞬間為基準（預設 now），只產生「之後」的 slot */
  now?: Date;
  horizonDays?: number;
}

export interface PlanSlotsResult {
  slots: ContentPlannedSlot[];
  skippedBlackout: string[];
  warnings: string[];
}

/** 把 cadence 正規化：補預設值、修掉非法值，讓壞資料不會讓 planner 崩潰 */
export function normalizeCadence(cadence: Partial<ContentCadence> | null | undefined): ContentCadence {
  const merged: ContentCadence = {
    ...DEFAULT_CADENCE,
    ...(cadence || {}),
    weekdays: normalizeWeekdays(cadence?.weekdays),
    blackout_dates: Array.isArray(cadence?.blackout_dates)
      ? cadence.blackout_dates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
      : [],
  };

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(merged.publish_time)) {
    merged.publish_time = DEFAULT_CADENCE.publish_time;
  }
  merged.lead_time_hours = clampNumber(merged.lead_time_hours, 0, 24 * 14, 48);
  merged.review_cutoff_hours = clampNumber(merged.review_cutoff_hours, 0, 24 * 7, 4);
  merged.max_articles_per_day = clampNumber(merged.max_articles_per_day, 1, 5, 1);

  if (!Object.keys(FREQUENCY_WEEKDAYS).includes(merged.frequency) && merged.frequency !== 'custom') {
    merged.frequency = DEFAULT_CADENCE.frequency;
  }
  return merged;
}

function normalizeWeekdays(weekdays: number[] | undefined): number[] {
  const raw = Array.isArray(weekdays) ? weekdays : [];
  const cleaned = raw
    .map((value) => Math.round(Number(value)))
    .filter((value) => value >= 1 && value <= 7);
  return [...new Set(cleaned)].sort((a, b) => a - b);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** 依頻率取出實際生效的星期清單 */
export function cadenceWeekdays(cadence: ContentCadence): number[] {
  if (cadence.frequency === 'custom') {
    return cadence.weekdays.length > 0 ? cadence.weekdays : DEFAULT_CADENCE.weekdays;
  }
  const preset = FREQUENCY_WEEKDAYS[cadence.frequency] ?? DEFAULT_CADENCE.weekdays;
  if (cadence.frequency === 'twice_weekly' || cadence.frequency === 'weekly') {
    const requested = cadence.weekdays.filter((day) => preset.includes(day));
    return requested.length > 0 ? requested : preset;
  }
  return preset;
}

/** 人類可讀的頻率摘要，例如「每週一、四 10:00（站點時區）」 */
export function cadenceSummary(cadence: ContentCadence | null | undefined): string {
  const normalized = normalizeCadence(cadence);
  const weekdays = cadenceWeekdays(normalized);
  const weekdayLabel = weekdays
    .map((day) => ['一', '二', '三', '四', '五', '六', '日'][day - 1])
    .join('、');

  switch (normalized.frequency) {
    case 'daily':
      return `每日 ${normalized.publish_time}`;
    case 'every_2_days':
      return `隔日 ${normalized.publish_time}`;
    case 'twice_weekly':
      return `每週${weekdayLabel} ${normalized.publish_time}`;
    case 'weekly':
      return `每週${weekdayLabel} ${normalized.publish_time}`;
    default:
      return `自訂：每週${weekdayLabel} ${normalized.publish_time}`;
  }
}

/** cadence 驗證；回傳的錯誤字串會直接顯示在精靈第 4 步 */
export function validateCadence(cadence: ContentCadence | null | undefined): string[] {
  const errors: string[] = [];
  const normalized = normalizeCadence(cadence);

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized.publish_time)) {
    errors.push('發佈時間必須是 HH:mm（24 小時制）');
  }
  if (normalized.frequency !== 'daily' && normalized.frequency !== 'every_2_days') {
    if (normalized.weekdays.length === 0) {
      errors.push('請至少選擇一個星期');
    }
  }
  if (normalized.review_cutoff_hours >= normalized.lead_time_hours) {
    errors.push('審核截止必須早於生成提前量（lead time）');
  }
  if (normalized.lead_time_hours < 1) {
    errors.push('生成提前量至少 1 小時');
  }
  return errors;
}

/**
 * 產生未來 N 天的 slot 草稿。
 *
 * 規則（PRD §9.2.2）：
 *   1. 按 cadence 算 publish_at
 *   2. generate_at = publish_at - lead_time_hours
 *   3. 黑名單日期跳過
 *   4. 只產生未來的 slot（過去的不補）
 *   5. 依 unique(site_id, publish_at) 冪等
 */
export function planSlots(input: PlanSlotsInput): PlanSlotsResult {
  const cadence = normalizeCadence(input.cadence);
  const timezone = input.timezone || 'Asia/Hong_Kong';
  const now = input.now ?? new Date();
  const horizonDays = Math.max(1, Math.min(120, input.horizonDays ?? DEFAULT_PLAN_HORIZON_DAYS));
  const weekdays = new Set(cadenceWeekdays(cadence));
  const blackout = new Set(cadence.blackout_dates);
  const startDate = todayInZone(timezone, now);

  const slots: ContentPlannedSlot[] = [];
  const skippedBlackout: string[] = [];
  const warnings: string[] = [];
  const perDayCount = new Map<string, number>();

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const dateStr = addDaysToDateString(startDate, offset);
    if (blackout.has(dateStr)) {
      if (offset === 0 || matchesFrequency(dateStr, weekdays, cadence, startDate, timezone)) {
        skippedBlackout.push(dateStr);
      }
      continue;
    }

    const publishAt = zonedWallTimeToUtc(dateStr, cadence.publish_time, timezone);
    const isoWeekday = isoWeekdayOfDateString(dateStr);

    if (!weekdays.has(isoWeekday)) continue;
    if (cadence.frequency === 'every_2_days' && ((dayDiff(startDate, dateStr) % 2) + 2) % 2 !== 0) {
      continue;
    }
    if (publishAt.getTime() <= now.getTime()) continue;

    const dayKey = dateStr;
    const usedToday = perDayCount.get(dayKey) ?? 0;
    if (usedToday >= cadence.max_articles_per_day) {
      warnings.push(`${dateStr} 已達單日上限 ${cadence.max_articles_per_day}，多餘排程略過`);
      continue;
    }
    perDayCount.set(dayKey, usedToday + 1);

    const generateAt = new Date(
      publishAt.getTime() - cadence.lead_time_hours * 3_600_000,
    );

    slots.push({
      site_id: input.siteId,
      publish_at: publishAt.toISOString(),
      generate_at: generateAt.toISOString(),
      dedupe_key: slotDedupeKey(input.siteId, publishAt),
      weekday: isoWeekday as ContentPlannedSlot['weekday'],
    });
  }

  return { slots, skippedBlackout, warnings };
}

function matchesFrequency(
  dateStr: string,
  weekdays: Set<number>,
  cadence: ContentCadence,
  startDate: string,
  timezone: string,
): boolean {
  void timezone;
  const weekday = isoWeekdayOfDateString(dateStr);
  if (!weekdays.has(weekday)) return false;
  if (cadence.frequency === 'every_2_days') {
    return ((dayDiff(startDate, dateStr) % 2) + 2) % 2 === 0;
  }
  return true;
}

function dayDiff(fromDateStr: string, toDateStr: string): number {
  const from = Date.parse(`${fromDateStr}T00:00:00Z`);
  const to = Date.parse(`${toDateStr}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function isoWeekdayOfDateString(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function slotDedupeKey(siteId: string, publishAt: Date): string {
  return `${siteId}:${publishAt.getTime()}`;
}

/** 審核截止時刻 = publish_at - review_cutoff_hours */
export function reviewDeadline(publishAt: string, cutoffHours: number): Date {
  return new Date(new Date(publishAt).getTime() - cutoffHours * 3_600_000);
}

/** 是否已過審核截止仍未批准（M3-13：轉 held，永不自動發） */
export function isReviewOverdue(
  publishAt: string,
  cutoffHours: number,
  approved: boolean,
  now: Date = new Date(),
): boolean {
  if (approved) return false;
  return now.getTime() >= reviewDeadline(publishAt, cutoffHours).getTime();
}

/**
 * 錯過原定時間時的下一個可用排程時間。
 * Confirm 時 `publish_at` 已過超過 2 小時 → 排到下一個空 slot（PRD §9.3.3）。
 */
export function findNextPublishAt(
  cadence: ContentCadence,
  timezone: string,
  after: Date,
  takenPublishAt: readonly string[] = [],
  lookaheadDays = 45,
): string | null {
  const normalized = normalizeCadence(cadence);
  const taken = new Set(
    takenPublishAt
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value)),
  );
  const result = planSlots({
    siteId: 'probe',
    cadence: normalized,
    timezone,
    now: after,
    horizonDays: lookaheadDays,
  });

  for (const slot of result.slots) {
    const timestamp = new Date(slot.publish_at).getTime();
    if (taken.has(timestamp)) continue;
    return slot.publish_at;
  }
  return null;
}

/** 供 planner job 判斷哪些既有 slot 不該被覆蓋（PRD §9.2.2 規則 4） */
export function shouldPreserveSlot(slot: Pick<ContentSlot, 'status' | 'article_id'>): boolean {
  if (slot.article_id) return true;
  return ['published', 'publishing', 'approved', 'scheduled', 'in_review', 'draft_ready'].includes(
    slot.status,
  );
}

/** 給 UI 顯示「這個 slot 現在的下一步」 */
export function slotNextAction(status: ContentSlot['status']): string {
  switch (status) {
    case 'planned':
      return '到 generate_at 自動生成，或先人工排關鍵字';
    case 'generating':
      return '生成中，完成後進待審';
    case 'draft_ready':
      return '草稿已完成，等待送審';
    case 'in_review':
      return '等待總編輯審核';
    case 'approved':
      return '已批准，等待到點發布';
    case 'scheduled':
      return '已排入發佈佇列';
    case 'publishing':
      return '發布中';
    case 'published':
      return '已完成';
    case 'failed':
      return '生成失敗，可重試或改由人工補稿';
    case 'held':
      return '已保留（不會自動發布），請處理原因後重新排程';
    default:
      return '已跳過';
  }
}

/** 把 Date 轉成 `<input type="datetime-local">` 需要的站點時區字串 */
export function toZoneInputValue(iso: string | null, timezone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('year')}-${read('month')}-${read('day')}T${pad2(Number(read('hour')))}:${read('minute')}`;
}

/** datetime-local 字串（站點時區）→ UTC ISO */
export function fromZoneInputValue(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return zonedWallTimeToUtc(`${year}-${month}-${day}`, `${hour}:${minute}`, timezone).toISOString();
}
