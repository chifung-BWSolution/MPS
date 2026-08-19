/** Insights Conv. parser + pixel event breakdown (shared by sync / backfill / live). */

export type ActionBreakdown = Record<string, number>;

const NON_CONVERSION_RESULT_INDICATORS = [
  "reach",
  "impressions",
  "link_click",
  "outbound_click",
  "landing_page_view",
  "omni_landing_page_view",
  "page_engagement",
  "post_engagement",
  "video_view",
  "video_thruplay",
  "like",
  "post_interaction",
  "estimated_ad_recallers",
];

const CONVERSION_ROLLUP_PRIORITY: string[][] = [
  ["omni_purchase", "purchase", "web_in_store_purchase"],
  ["omni_complete_registration", "complete_registration"],
  ["lead", "onsite_conversion.lead_grouped", "omni_lead"],
  ["omni_initiated_checkout", "initiate_checkout"],
  ["omni_add_to_cart", "add_to_cart"],
  ["omni_add_payment_info", "add_payment_info"],
  ["omni_subscribe", "subscribe"],
  ["omni_start_trial", "start_trial"],
  [
    "omni_submit_application",
    "submit_application",
    "submit_application_total",
    "submit_application_website",
    "submit_application_app",
  ],
  ["omni_schedule", "schedule"],
  ["omni_contact", "contact"],
  ["omni_donate", "donate"],
  ["find_location"],
  [
    "onsite_conversion.messaging_conversation_started_7d",
    "onsite_conversion.total_messaging_connection",
    "onsite_conversion.messaging_first_reply",
  ],
  ["omni_app_install", "mobile_app_install", "app_install"],
];

const FAMILY_ALIASES: Record<string, string> = {
  initiated_checkout: "initiate_checkout",
  web_in_store_purchase: "purchase",
  mobile_app_install: "app_install",
  lead_grouped: "lead",
};

function rowNumericValue(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const a = raw as Record<string, unknown>;
  if (a.value != null) return Number(a.value) || 0;
  if (Array.isArray(a.values)) {
    let sum = 0;
    for (const v of a.values) {
      if (v != null && typeof v === "object" && "value" in (v as object)) {
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

function sumResultsField(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  let sum = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const indicator = String((raw as Record<string, unknown>).indicator || "");
    if (indicator && isNonConversionResultIndicator(indicator)) continue;
    sum += rowNumericValue(raw);
  }
  return sum;
}

function isPixelOrCustomConversion(type: string): boolean {
  if (type.startsWith("offsite_conversion.custom.")) return true;
  if (type.startsWith("offline_conversion.")) return true;
  if (type.startsWith("app_custom_event.")) return true;
  if (!type.startsWith("offsite_conversion.fb_pixel_")) return false;
  const soft = new Set([
    "offsite_conversion.fb_pixel_view_content",
    "offsite_conversion.fb_pixel_search",
    "offsite_conversion.fb_pixel_add_to_wishlist",
  ]);
  return !soft.has(type);
}

function groupMatchTokens(group: string[]): string[] {
  const tokens = new Set<string>();
  for (const name of group) {
    const base = name.includes(".") ? name.split(".").pop() || name : name;
    tokens.add(base.replace(/^omni_/, "").replace(/^web_in_store_/, ""));
    tokens.add(base);
  }
  return [...tokens].filter(Boolean);
}

function actionMatchesTokens(type: string, tokens: string[]): boolean {
  if (
    type.includes("click") ||
    type.includes("view_content") ||
    type.includes("video_view") ||
    type.includes("impression") ||
    type.includes("engaged_user") ||
    type.includes("page_engagement") ||
    type.includes("post_engagement")
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
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || "").toLowerCase();
    if (!type) continue;
    const val = Number(a.value ?? 0) || 0;
    if (!val) continue;
    byType.set(type, (byType.get(type) || 0) + val);
  }
  return byType;
}

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
  if (type.includes("click")) return true;
  if (type.includes("impression")) return true;
  if (type.includes("engaged_user")) return true;
  if (type.includes("page_engagement")) return true;
  if (type.includes("post_engagement")) return true;
  if (type.includes("video_view") || type.includes("video_thruplay")) return true;
  if (type === "reach" || type.endsWith(".reach") || type.endsWith(":reach")) return true;
  if (type === "like" || type.endsWith(".like")) return true;
  return false;
}

export function normalizeActionFamily(type: string): string | null {
  let t = type.toLowerCase().trim();
  if (!t || shouldSkipBreakdownType(t)) return null;

  t = t.replace(/^offsite_conversion\.fb_pixel_/, "");
  t = t.replace(/^offsite_conversion\.custom\./, "custom.");
  t = t.replace(/^offline_conversion\./, "");
  t = t.replace(/^onsite_conversion\./, "");
  t = t.replace(/^app_custom_event\./, "");
  t = t.replace(/^omni_/, "");
  t = t.replace(/^web_in_store_/, "");
  t = t.replace(/_website$/, "");
  t = t.replace(/_app$/, "");
  t = t.replace(/_offline$/, "");
  t = t.replace(/_total$/, "");

  if (shouldSkipBreakdownType(t)) return null;
  return FAMILY_ALIASES[t] || t;
}

export function extractActionBreakdown(actions: unknown): ActionBreakdown {
  const familyMax = new Map<string, number>();
  if (!Array.isArray(actions)) return {};

  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const type = String(a.action_type || "");
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
