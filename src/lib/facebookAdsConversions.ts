/** Facebook Insights Conv. + pixel event breakdown helpers (warehouse + UI). */

export type ActionBreakdown = Record<string, number>;

/** Result indicators that are traffic/awareness — not Conv. column outcomes. */
const NON_CONVERSION_RESULT_INDICATORS = [
  'reach',
  'impressions',
  'link_click',
  'outbound_click',
  'landing_page_view',
  'omni_landing_page_view',
  'page_engagement',
  'post_engagement',
  'video_view',
  'video_thruplay',
  'like',
  'post_interaction',
  'estimated_ad_recallers',
];

/**
 * Meta Insights `actions` names conversions differently per objective / pixel event.
 * Prefer rollup action_types when present to avoid double-counting pixel + omni variants.
 */
const CONVERSION_ROLLUP_PRIORITY: string[][] = [
  ['omni_purchase', 'purchase', 'web_in_store_purchase'],
  ['omni_complete_registration', 'complete_registration'],
  ['lead', 'onsite_conversion.lead_grouped', 'omni_lead'],
  ['omni_initiated_checkout', 'initiate_checkout'],
  ['omni_add_to_cart', 'add_to_cart'],
  ['omni_add_payment_info', 'add_payment_info'],
  ['omni_subscribe', 'subscribe'],
  ['omni_start_trial', 'start_trial'],
  [
    'omni_submit_application',
    'submit_application',
    'submit_application_total',
    'submit_application_website',
    'submit_application_app',
  ],
  ['omni_schedule', 'schedule'],
  ['omni_contact', 'contact'],
  ['omni_donate', 'donate'],
  ['find_location'],
  [
    'onsite_conversion.messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'onsite_conversion.messaging_first_reply',
  ],
  ['omni_app_install', 'mobile_app_install', 'app_install'],
];

const FAMILY_ALIASES: Record<string, string> = {
  initiated_checkout: 'initiate_checkout',
  web_in_store_purchase: 'purchase',
  mobile_app_install: 'app_install',
  lead_grouped: 'lead',
};

/** Ads Manager-style order for the hover card. */
export const ACTION_BREAKDOWN_ORDER = [
  'purchase',
  'add_payment_info',
  'add_to_cart',
  'initiate_checkout',
  'search',
  'view_content',
  'complete_registration',
  'lead',
  'subscribe',
  'start_trial',
  'submit_application',
  'schedule',
  'contact',
  'donate',
  'find_location',
  'app_install',
  'messaging_conversation_started_7d',
  'total_messaging_connection',
  'messaging_first_reply',
];

export const ACTION_BREAKDOWN_LABELS: Record<string, string> = {
  purchase: '網站購買',
  add_payment_info: '網站新增付款資料',
  add_to_cart: '網站加到購物車',
  initiate_checkout: '網站開始結帳',
  search: '網站搜尋',
  view_content: '網站內容瀏覽',
  complete_registration: '完成註冊',
  lead: '潛在顧客',
  subscribe: '訂閱',
  start_trial: '開始試用',
  submit_application: '提交申請',
  schedule: '預約',
  contact: '聯絡',
  donate: '捐款',
  find_location: '尋找地點',
  app_install: '應用程式安裝',
  messaging_conversation_started_7d: '開始訊息對話',
  total_messaging_connection: '訊息連結',
  messaging_first_reply: '首次回覆訊息',
};

function rowNumericValue(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const a = raw as Record<string, unknown>;
  if (a.value != null) return Number(a.value) || 0;
  if (Array.isArray(a.values)) {
    let sum = 0;
    for (const v of a.values) {
      if (v != null && typeof v === 'object' && 'value' in (v as object)) {
        sum += Number((v as { value?: unknown }).value) || 0;
      } else {
        sum += Number(v) || 0;
      }
    }
    return sum;
  }
  return 0;
}

function isNonConversionResultIndicator(indicator: string): boolean {
  const ind = indicator.toLowerCase();
  return NON_CONVERSION_RESULT_INDICATORS.some(
    (s) => ind === s || ind.endsWith(`:${s}`) || ind.endsWith(`.${s}`),
  );
}

function isPresentList(value: unknown): boolean {
  return Array.isArray(value);
}

/** Sum Insights `results` / `objective_results`. Indicator-only rows contribute 0. */
export function sumResultsField(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  let sum = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const indicator = String((raw as Record<string, unknown>).indicator || '');
    if (indicator && isNonConversionResultIndicator(indicator)) continue;
    sum += rowNumericValue(raw);
  }
  return sum;
}

function isPixelOrCustomConversion(type: string): boolean {
  if (type.startsWith('offsite_conversion.custom.')) return true;
  if (type.startsWith('offline_conversion.')) return true;
  if (type.startsWith('app_custom_event.')) return true;
  if (!type.startsWith('offsite_conversion.fb_pixel_')) return false;
  const soft = new Set([
    'offsite_conversion.fb_pixel_view_content',
    'offsite_conversion.fb_pixel_search',
    'offsite_conversion.fb_pixel_add_to_wishlist',
  ]);
  return !soft.has(type);
}

function groupMatchTokens(group: string[]): string[] {
  const tokens = new Set<string>();
  for (const name of group) {
    const base = name.includes('.') ? name.split('.').pop() || name : name;
    tokens.add(base.replace(/^omni_/, '').replace(/^web_in_store_/, ''));
    tokens.add(base);
  }
  return [...tokens].filter(Boolean);
}

function actionMatchesTokens(type: string, tokens: string[]): boolean {
  if (
    type.includes('click') ||
    type.includes('view_content') ||
    type.includes('video_view') ||
    type.includes('impression') ||
    type.includes('engaged_user') ||
    type.includes('page_engagement') ||
    type.includes('post_engagement')
  ) {
    return false;
  }
  for (const token of tokens) {
    if (
      type === token ||
      type.endsWith(`.${token}`) ||
      type.endsWith(`_${token}`) ||
      type === `offsite_conversion.fb_pixel_${token}` ||
      type === `offline_conversion.${token}` ||
      type === `onsite_conversion.${token}`
    ) {
      return true;
    }
  }
  return false;
}

function actionsByType(actions: unknown): Map<string, number> {
  const byType = new Map<string, number>();
  if (!Array.isArray(actions)) return byType;
  for (const raw of actions) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || '').toLowerCase();
    if (!type) continue;
    const val = Number(a.value ?? 0) || 0;
    if (!val) continue;
    byType.set(type, (byType.get(type) || 0) + val);
  }
  return byType;
}

/** First matching conversion family in priority order (purchase before add-to-cart). */
export function sumConversionsFromActions(actions: unknown): number {
  const byType = actionsByType(actions);
  if (byType.size === 0) return 0;

  for (const group of CONVERSION_ROLLUP_PRIORITY) {
    const tokens = groupMatchTokens(group);
    let picked = 0;

    for (const candidate of group) {
      if (byType.has(candidate)) {
        picked = byType.get(candidate) || 0;
        break;
      }
    }

    if (!picked) {
      for (const [type, val] of byType) {
        if (actionMatchesTokens(type, tokens)) {
          picked = val;
          break;
        }
      }
    }

    if (picked) return picked;
  }

  let customSum = 0;
  for (const [type, val] of byType) {
    if (isPixelOrCustomConversion(type)) customSum += val;
  }
  return customSum;
}

/**
 * Resolve Conv. count for an insights row.
 * If `results` / `objective_results` is present (including 0), that is Conv.
 * Otherwise first-match `actions` — never sum every conversion family.
 */
export function sumConversions(row: Record<string, unknown>): number {
  if (isPresentList(row.results)) return sumResultsField(row.results);
  if (isPresentList(row.objective_results)) return sumResultsField(row.objective_results);
  return sumConversionsFromActions(row.actions);
}

function shouldSkipBreakdownType(type: string): boolean {
  if (type.includes('click')) return true;
  if (type.includes('impression')) return true;
  if (type.includes('engaged_user')) return true;
  if (type.includes('page_engagement')) return true;
  if (type.includes('post_engagement')) return true;
  if (type.includes('video_view') || type.includes('video_thruplay')) return true;
  if (type === 'reach' || type.endsWith('.reach') || type.endsWith(':reach')) return true;
  if (type === 'like' || type.endsWith('.like')) return true;
  return false;
}

/** Normalize Meta action_type variants to one family key (max-per-family, no double count). */
export function normalizeActionFamily(type: string): string | null {
  let t = type.toLowerCase().trim();
  if (!t || shouldSkipBreakdownType(t)) return null;

  t = t.replace(/^offsite_conversion\.fb_pixel_/, '');
  t = t.replace(/^offsite_conversion\.custom\./, 'custom.');
  t = t.replace(/^offline_conversion\./, '');
  t = t.replace(/^onsite_conversion\./, '');
  t = t.replace(/^app_custom_event\./, '');
  t = t.replace(/^omni_/, '');
  t = t.replace(/^web_in_store_/, '');
  t = t.replace(/_website$/, '');
  t = t.replace(/_app$/, '');
  t = t.replace(/_offline$/, '');
  t = t.replace(/_total$/, '');

  if (shouldSkipBreakdownType(t)) return null;
  return FAMILY_ALIASES[t] || t;
}

/** Collapse Insights `actions` into a family → count map for the hover card. */
export function extractActionBreakdown(actions: unknown): ActionBreakdown {
  const familyMax = new Map<string, number>();
  if (!Array.isArray(actions)) return {};

  for (const raw of actions) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || '');
    const family = normalizeActionFamily(type);
    if (!family) continue;
    const val = Number(a.value ?? 0) || 0;
    if (!val) continue;
    familyMax.set(family, Math.max(familyMax.get(family) || 0, val));
  }

  const out: ActionBreakdown = {};
  for (const [key, val] of familyMax) {
    if (val) out[key] = val;
  }
  return out;
}

export function parseActionBreakdown(raw: unknown): ActionBreakdown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ActionBreakdown = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(val);
    if (!key || !Number.isFinite(n) || n === 0) continue;
    out[key] = n;
  }
  return out;
}

export function mergeActionBreakdowns(maps: ActionBreakdown[]): ActionBreakdown {
  const out: ActionBreakdown = {};
  for (const map of maps) {
    for (const [key, val] of Object.entries(map)) {
      const n = Number(val) || 0;
      if (!key || !n) continue;
      out[key] = (out[key] || 0) + n;
    }
  }
  return out;
}

export function actionBreakdownLabel(key: string): string {
  if (ACTION_BREAKDOWN_LABELS[key]) return ACTION_BREAKDOWN_LABELS[key];
  if (key.startsWith('custom.')) return `自訂：${key.slice(7)}`;
  return key.replace(/_/g, ' ');
}

export function listActionBreakdownRows(
  breakdown?: ActionBreakdown | null,
): { key: string; label: string; value: number }[] {
  const map = breakdown || {};
  const seen = new Set<string>();
  const rows: { key: string; label: string; value: number }[] = [];

  for (const key of ACTION_BREAKDOWN_ORDER) {
    const value = Number(map[key]) || 0;
    if (!value) continue;
    seen.add(key);
    rows.push({ key, label: actionBreakdownLabel(key), value });
  }

  const rest = Object.keys(map)
    .filter((key) => !seen.has(key) && (Number(map[key]) || 0) > 0)
    .sort((a, b) => (Number(map[b]) || 0) - (Number(map[a]) || 0) || a.localeCompare(b));

  for (const key of rest) {
    rows.push({ key, label: actionBreakdownLabel(key), value: Number(map[key]) || 0 });
  }
  return rows;
}
