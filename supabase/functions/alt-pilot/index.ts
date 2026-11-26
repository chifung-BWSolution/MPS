/**
 * ALT Pilot · Edge Function
 *
 * Actions:
 *   analyze   抓頁 + 解析，寫 alt_runs
 *   generate  抓圖 + Gemini/Grok vision，寫 alt_suggestions / alt_llm_usage
 *   regenerate 單張重生成
 *   verify    重新抓頁，比對已批准 ALT 是否已寫回
 *
 * 契約：{ ok: true, data } / { ok: false, code, error }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { analyzePage } from "../../../src/lib/altPageParser.ts";
import {
  AltModelParseError,
  buildAltPrompt,
  parseAltModelJson,
} from "../../../src/lib/altPrompt.ts";
import { combineIssues, evaluateAlt, normalizeModelIssues } from "../../../src/lib/altQuality.ts";
import { hostMatches, normalizePageUrl } from "../../../src/lib/altUrl.ts";
import { isSitemapUrl, parseSitemap } from "../../../src/lib/altSitemap.ts";
import { normalizeForCompare, normalizeWhitespace, truncateText } from "../../../src/lib/altText.ts";
import {
  DEFAULT_ALT_SETTINGS,
  type AltImageCandidate,
  type AltImageLocation,
  type AltPageContext,
  type AltRisk,
  type AltRunRow,
  type AltSettingsRow,
  type AltSuggestionDraft,
  type AltSuggestionRow,
} from "../../../src/lib/altTypes.ts";
import { isAltQuotaExceeded } from "../../../src/lib/altQuota.ts";
import {
  AltFetchError,
  bytesToBase64,
  extractBearerToken,
  fetchImageBytes,
  fetchPageHtml,
  fetchSitemapText,
  sha256Hex,
} from "./guard.ts";
import { AltProviderError, generateVision, type ProviderResult } from "./providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const ALLOW_ANON = (Deno.env.get("ALT_ALLOW_ANON") || "false").toLowerCase() === "true";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DbClient = SupabaseClient;

class AltRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AltRequestError";
    this.code = code;
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ ok: false, code, error: message }, status);
}

function adminClient(): DbClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new AltRequestError(
      "config_missing",
      "Edge Function 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY",
      500,
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isMissingTable(error: unknown): boolean {
  const shape = error as { code?: string; message?: string; details?: string };
  const code = String(shape?.code || "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table|schema cache/i.test(
    [shape?.message, shape?.details].filter(Boolean).join(" "),
  );
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asLocation(value: unknown): AltImageLocation {
  return value === "header" || value === "main" || value === "footer" ? value : "unknown";
}

function riskRank(risk: AltRisk): number {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

function maxRisk(a: AltRisk, b: AltRisk): AltRisk {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function hongKongDayStartIso(now = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const startUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - 8 * 60 * 60 * 1000;
  return new Date(startUtc).toISOString();
}

function settingsFromRow(row: Partial<AltSettingsRow> | null | undefined): AltSettingsRow {
  return {
    ...DEFAULT_ALT_SETTINGS,
    ...(row || {}),
    enabled: row?.enabled === true,
    model: asString(row?.model, DEFAULT_ALT_SETTINGS.model),
    fallback_model: asString(row?.fallback_model, DEFAULT_ALT_SETTINGS.fallback_model),
    daily_call_limit: Math.max(0, Math.round(asNumber(row?.daily_call_limit, DEFAULT_ALT_SETTINGS.daily_call_limit))),
    max_images_per_run: Math.max(1, Math.round(asNumber(row?.max_images_per_run, DEFAULT_ALT_SETTINGS.max_images_per_run))),
    max_images_per_call: Math.max(1, Math.round(asNumber(row?.max_images_per_call, DEFAULT_ALT_SETTINGS.max_images_per_call))),
  };
}

async function loadSettings(admin: DbClient): Promise<AltSettingsRow> {
  const { data, error } = await admin
    .from("alt_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  if (data) return settingsFromRow(data as Partial<AltSettingsRow>);

  const { error: insertError } = await admin.from("alt_settings").insert({ id: "default" });
  if (insertError) throw insertError;
  return { ...DEFAULT_ALT_SETTINGS };
}

async function usageSummary(
  admin: DbClient,
  settings: AltSettingsRow,
): Promise<{ today: number; limit: number; analyses: number }> {
  const start = hongKongDayStartIso();
  const [usageResult, runResult] = await Promise.all([
    admin
      .from("alt_llm_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start),
    admin
      .from("alt_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start),
  ]);
  if (usageResult.error) throw usageResult.error;
  if (runResult.error) throw runResult.error;
  return {
    today: usageResult.count ?? 0,
    limit: settings.daily_call_limit,
    analyses: runResult.count ?? 0,
  };
}

async function resolveAppUserId(
  admin: DbClient,
  authUserId: string,
  email: string,
): Promise<string | null> {
  if (!authUserId) return null;

  const byAuth = await admin.from("users").select("id").eq("auth_user_id", authUserId).maybeSingle();
  if (!byAuth.error && byAuth.data?.id) return String(byAuth.data.id);

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const byEmail = await admin.from("users").select("id").eq("email", normalizedEmail).limit(1).maybeSingle();
  if (!byEmail.error && byEmail.data?.id) return String(byEmail.data.id);

  const byGoogle = await admin
    .from("users")
    .select("id")
    .eq("google_email", normalizedEmail)
    .limit(1)
    .maybeSingle();
  if (!byGoogle.error && byGoogle.data?.id) return String(byGoogle.data.id);

  return null;
}

async function authenticate(admin: DbClient, req: Request): Promise<{
  authUserId: string;
  appUserId: string | null;
}> {
  const token = extractBearerToken(req);
  if (!token) throw new AltRequestError("unauthorized", "未登入", 401);

  if (token === SUPABASE_ANON_KEY) {
    if (!ALLOW_ANON) {
      throw new AltRequestError("unauthorized", "ALT Pilot 需要登入後才能使用", 401);
    }
    return { authUserId: "", appUserId: null };
  }

  let authUser: { id: string; email?: string } | null = null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) authUser = { id: data.user.id, email: data.user.email || "" };
  } catch {
    authUser = null;
  }
  if (!authUser) {
    throw new AltRequestError("unauthorized", "登入狀態已失效，請重新登入", 401);
  }

  const appUserId = await resolveAppUserId(admin, authUser.id, authUser.email || "");
  return { authUserId: authUser.id, appUserId };
}

async function loadAllowedHosts(admin: DbClient, siteId: string): Promise<string[]> {
  const hosts = new Set<string>();

  for (const value of (Deno.env.get("ALT_ALLOWED_HOSTS") || "").split(",")) {
    const host = value.trim();
    if (host) hosts.add(host);
  }

  let query = admin.from("webandsystem_list").select("id, domain_url");
  if (siteId) query = query.eq("id", siteId);
  const { data, error } = await query;
  if (error) throw error;

  for (const row of data || []) {
    const domain = String(row.domain_url || "").trim();
    if (!domain) continue;
    try {
      const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(domain) ? domain : `https://${domain}`);
      hosts.add(parsed.hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // 忽略格式不良的既有資料
    }
  }

  return Array.from(hosts);
}

async function loadSiteDomain(admin: DbClient, siteId: string): Promise<string> {
  if (!siteId) return "";
  const { data, error } = await admin
    .from("webandsystem_list")
    .select("domain_url")
    .eq("id", siteId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.domain_url || "").trim();
}

async function pickKeyword(admin: DbClient, siteId: string, pageUrl: string): Promise<string> {
  if (!siteId) return "";
  const { data, error } = await admin
    .from("seo_keywords")
    .select("keyword, level, target_page, search_volume")
    .eq("website_profile_id", siteId)
    .limit(200);
  if (error || !data || data.length === 0) return "";

  const pagePath = (() => {
    try {
      return new URL(pageUrl).pathname;
    } catch {
      return "";
    }
  })();

  const score = (row: { level?: string; target_page?: string | null; search_volume?: number | null }): number => {
    let value = 0;
    if (row.level === "level_1") value += 100;
    else if (row.level === "level_2") value += 60;
    else value += 30;
    value += Math.min(50, Math.round(asNumber(row.search_volume) / 100));
    if (row.target_page && pagePath) {
      try {
        const target = new URL(String(row.target_page), pageUrl).pathname;
        if (target === pagePath) value += 200;
      } catch {
        if (String(row.target_page).includes(pagePath)) value += 80;
      }
    }
    return value;
  };

  const best = [...data].sort((a, b) => score(b) - score(a))[0];
  return normalizeWhitespace(String(best?.keyword || ""));
}

function pageFromRun(run: AltRunRow): AltPageContext {
  const lines = String(run.context_summary || "").split("\n");
  const lineValue = (prefix: string): string => {
    const line = lines.find((item) => item.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : "";
  };
  const h2Line = lineValue("H2：");
  const bodyIndex = lines.findIndex((line) => line.startsWith("正文："));
  const paragraphs =
    bodyIndex >= 0
      ? lines
          .slice(bodyIndex + 1)
          .map((line) => line.replace(/^\d+\.\s*/, "").trim())
          .filter(Boolean)
      : [];

  return {
    url: run.page_url,
    host: run.page_host,
    title: run.page_title || lineValue("頁面："),
    description: lineValue("描述："),
    lang: run.page_lang,
    canonical: "",
    ogTitle: "",
    ogDescription: "",
    h1: lineValue("H1："),
    h2s: h2Line ? h2Line.split(" / ").map((item) => item.trim()).filter(Boolean) : [],
    h3s: [],
    paragraphs,
    wordCount: 0,
    summary: run.context_summary,
    imageCount: run.image_count,
    skippedImageCount: 0,
    backgroundImageCount: 0,
    truncated: false,
  };
}

function normalizeImageInputs(value: unknown, max: number): AltImageCandidate[] {
  if (!Array.isArray(value)) {
    throw new AltRequestError("invalid_images", "images 必須是陣列", 400);
  }

  const images: AltImageCandidate[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = asString(record.url).trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    images.push({
      url,
      filename: truncateText(asString(record.filename), 120),
      location: asLocation(record.location),
      currentAlt: truncateText(asString(record.currentAlt ?? record.current_alt), 300),
      hasAltAttr: Boolean(record.hasAltAttr),
      width: record.width == null ? null : Math.round(asNumber(record.width)) || null,
      height: record.height == null ? null : Math.round(asNumber(record.height)) || null,
      ariaHidden: Boolean(record.ariaHidden),
      role: asString(record.role),
      decorative: Boolean(record.decorative),
      skipReason: null,
      nearbyHeading: truncateText(asString(record.nearbyHeading), 220),
      nearbyCaption: truncateText(asString(record.nearbyCaption), 220),
      nearbyParagraph: truncateText(asString(record.nearbyParagraph), 220),
    });

    if (images.length >= max) break;
  }

  return images;
}

function imageContextExcerpt(image: AltImageCandidate): string {
  return truncateText(
    [image.nearbyHeading, image.nearbyCaption, image.nearbyParagraph]
      .map((value) => normalizeWhitespace(value))
      .filter(Boolean)
      .join(" | "),
    500,
  );
}

function imageHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function existingAltValues(suggestions: AltSuggestionRow[], excludeUrl: string): string[] {
  return suggestions
    .filter((suggestion) => suggestion.image_url !== excludeUrl && suggestion.status !== "rejected")
    .map((suggestion) => normalizeWhitespace(suggestion.final_alt || suggestion.suggested_alt))
    .filter(Boolean);
}

async function loadRun(admin: DbClient, runId: string): Promise<AltRunRow> {
  if (!runId) throw new AltRequestError("invalid_run", "缺少 run_id", 400);
  const { data, error } = await admin.from("alt_runs").select("*").eq("id", runId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AltRequestError("not_found", "找不到這次 ALT 分析紀錄", 404);
  return data as AltRunRow;
}

async function loadSuggestions(admin: DbClient, runId: string): Promise<AltSuggestionRow[]> {
  const { data, error } = await admin
    .from("alt_suggestions")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as AltSuggestionRow[];
}

async function updateRunCounts(admin: DbClient, runId: string, model?: string): Promise<void> {
  const suggestions = await loadSuggestions(admin, runId);
  const generated = suggestions.filter((suggestion) =>
    normalizeWhitespace(suggestion.suggested_alt).length > 0
  ).length;
  const approved = suggestions.filter((suggestion) => suggestion.status === "approved").length;

  const { error } = await admin
    .from("alt_runs")
    .update({
      generated_count: generated,
      approved_count: approved,
      status: generated > 0 ? "ready" : "analyzed",
      ...(model ? { model } : {}),
    })
    .eq("id", runId);
  if (error) throw error;
}

async function recordUsage(
  admin: DbClient,
  runId: string,
  suggestionId: string | null,
  result: ProviderResult,
): Promise<void> {
  const { error } = await admin.from("alt_llm_usage").insert({
    run_id: runId,
    suggestion_id: suggestionId,
    model: result.model,
    provider: result.provider,
    use_case: "alt_generate",
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_usd: result.costUsd,
  });
  if (error) console.error("[alt-pilot] usage insert failed", error.message);
}

interface UsageState {
  calls: number;
  limit: number;
}

interface GeneratedImageResult {
  draft: AltSuggestionDraft;
  result: ProviderResult;
  imageHash: string;
  issues: ReturnType<typeof combineIssues>;
  risk: AltRisk;
}

async function generateForImage(params: {
  admin: DbClient;
  run: AltRunRow;
  image: AltImageCandidate;
  settings: AltSettingsRow;
  keyword: string;
  existingAlts: string[];
  usage: UsageState;
}): Promise<GeneratedImageResult> {
  const { admin, run, image, settings, keyword, existingAlts, usage } = params;

  if (isAltQuotaExceeded(usage.calls, usage.limit)) {
    throw new AltRequestError(
      "quota_exceeded",
      "今日 ALT 生成次數已達上限，請明天再試或請管理員調整 alt_settings.daily_call_limit。",
      429,
    );
  }

  const fetched = await fetchImageBytes(image.url);
  const page = pageFromRun(run);
  const prompt = buildAltPrompt({ page, image, keyword, existingAlts });

  const callProvider = async (user: string): Promise<{ draft: AltSuggestionDraft; result: ProviderResult }> => {
    if (isAltQuotaExceeded(usage.calls, usage.limit)) {
      throw new AltRequestError("quota_exceeded", "今日 ALT 生成次數已達上限。", 429);
    }
    usage.calls += 1;
    const result = await generateVision({
      system: prompt.system,
      user,
      mimeType: fetched.mimeType,
      base64: bytesToBase64(fetched.bytes),
      model: settings.model,
      fallbackModel: settings.fallback_model,
    });
    await recordUsage(admin, run.id, null, result);
    return { draft: parseAltModelJson(result.text), result };
  };

  let attempt: { draft: AltSuggestionDraft; result: ProviderResult };
  try {
    attempt = await callProvider(prompt.user);
  } catch (error) {
    if (!(error instanceof AltModelParseError)) throw error;
    attempt = await callProvider(
      `${prompt.user}\n\n上一次的輸出不是有效 JSON。請只輸出一個 JSON 物件，不要 Markdown、不要解釋。`,
    );
  }

  const quality = evaluateAlt({
    alt: attempt.draft.alt,
    page,
    image,
    keyword,
    existingAlts,
    decorative: attempt.draft.decorative,
  });
  const issues = combineIssues(
    quality.issues,
    normalizeModelIssues(attempt.draft.issues),
  );
  const risk = maxRisk(quality.risk, attempt.draft.risk);

  return {
    draft: attempt.draft,
    result: attempt.result,
    imageHash: fetched.hash,
    issues,
    risk,
  };
}

async function upsertSuggestion(params: {
  admin: DbClient;
  run: AltRunRow;
  image: AltImageCandidate;
  keyword: string;
  generated: GeneratedImageResult;
}): Promise<AltSuggestionRow> {
  const { admin, run, image, keyword, generated } = params;
  const row = {
    run_id: run.id,
    image_url: image.url,
    image_host: imageHost(image.url),
    image_hash: generated.imageHash,
    filename: image.filename,
    location: image.location,
    current_alt: image.currentAlt,
    context_excerpt: imageContextExcerpt(image),
    suggested_alt: generated.draft.alt,
    short_alt: generated.draft.short_alt,
    alternatives: generated.draft.alternatives,
    rationale: generated.draft.rationale,
    keyword,
    confidence: generated.draft.confidence,
    risk: generated.risk,
    issues: generated.issues,
    decorative: generated.draft.decorative,
    provider: generated.result.provider,
    status: "pending",
    final_alt: null,
    reviewed_by: null,
    reviewed_at: null,
  };

  const { data, error } = await admin
    .from("alt_suggestions")
    .upsert(row, { onConflict: "run_id,image_url" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AltSuggestionRow;
}

async function upsertFailedSuggestion(params: {
  admin: DbClient;
  run: AltRunRow;
  image: AltImageCandidate;
  keyword: string;
  code: string;
  message: string;
}): Promise<AltSuggestionRow> {
  const { admin, run, image, keyword, code, message } = params;
  const row = {
    run_id: run.id,
    image_url: image.url,
    image_host: imageHost(image.url),
    image_hash: null,
    filename: image.filename,
    location: image.location,
    current_alt: image.currentAlt,
    context_excerpt: imageContextExcerpt(image),
    suggested_alt: "",
    short_alt: "",
    alternatives: [],
    rationale: "",
    keyword,
    confidence: 0,
    risk: "high",
    issues: [{ id: code, severity: "hard", message: truncateText(message, 500) }],
    decorative: image.decorative,
    provider: "",
    status: "failed",
    final_alt: null,
    reviewed_by: null,
    reviewed_at: null,
  };

  const { data, error } = await admin
    .from("alt_suggestions")
    .upsert(row, { onConflict: "run_id,image_url" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AltSuggestionRow;
}

async function handleDiscover(admin: DbClient, body: Record<string, unknown>) {
  const siteId = asString(body.site_id).trim();
  const siteDomain = await loadSiteDomain(admin, siteId);
  const inputUrl = asString(body.sitemap_url).trim();

  if (!inputUrl && !siteDomain) {
    throw new AltRequestError(
      "invalid_sitemap",
      "請提供 sitemap URL，或先選擇一個已登記站點。",
      400,
    );
  }

  const sitemapUrl = normalizePageUrl(
    inputUrl || new URL("/sitemap.xml", normalizePageUrl(siteDomain)).href,
    siteDomain || undefined,
  );
  const allowedHosts = await loadAllowedHosts(admin, siteId);
  const root = await fetchSitemapText(sitemapUrl, allowedHosts);
  const parsed = parseSitemap(root.xml, root.finalUrl);
  const warnings: string[] = [];
  const pages = new Set<string>();

  const addPages = (urls: string[]): void => {
    for (const url of urls) {
      if (pages.size >= 300) return;
      // 子 sitemap 若仍是 index，其 loc 會是 .xml；不要把它當成頁面。
      if (isSitemapUrl(url)) continue;
      try {
        const host = new URL(url).hostname;
        if (allowedHosts.some((allowed) => hostMatches(host, allowed))) pages.add(url);
      } catch {
        // skip malformed URL
      }
    }
  };

  if (parsed.kind === "sitemapindex") {
    const children = parsed.urls.slice(0, 5);
    for (const child of children) {
      try {
        const fetched = await fetchSitemapText(child, allowedHosts);
        const childParsed = parseSitemap(fetched.xml, fetched.finalUrl);
        addPages(childParsed.urls);
      } catch (error) {
        warnings.push(
          `略過子 sitemap：${child}（${error instanceof Error ? error.message : String(error)}）`,
        );
      }
    }
  } else {
    addPages(parsed.urls);
  }

  const allPages = Array.from(pages);
  return {
    sitemap_url: root.finalUrl,
    kind: parsed.kind,
    sitemap_count: parsed.kind === "sitemapindex" ? parsed.urls.length : 1,
    pages: allPages.slice(0, 100).map((url) => ({ url })),
    truncated: allPages.length > 100,
    warnings: warnings.slice(0, 5),
  };
}

async function handleAnalyze(admin: DbClient, body: Record<string, unknown>, appUserId: string | null) {
  const settings = await loadSettings(admin);
  if (!settings.enabled) {
    throw new AltRequestError("disabled", "ALT Pilot 已停用，請聯絡管理員。", 503);
  }

  const siteId = asString(body.site_id).trim();
  const siteDomain = await loadSiteDomain(admin, siteId);
  let pageUrl: string;
  try {
    pageUrl = normalizePageUrl(asString(body.url), siteDomain || undefined);
  } catch (error) {
    throw new AltRequestError(
      "invalid_url",
      error instanceof Error ? error.message : "頁面 URL 格式不正確",
      400,
    );
  }

  const allowedHosts = await loadAllowedHosts(admin, siteId);
  const fetched = await fetchPageHtml(pageUrl, allowedHosts);
  const analysis = analyzePage(fetched.html, fetched.finalUrl);

  if (analysis.images.length === 0 && analysis.page.paragraphs.length === 0) {
    throw new AltRequestError(
      "parse_empty",
      "此頁沒有抓到可讀正文或圖片；可能是 JS 渲染、需要登入，或不是公開頁面。",
      422,
    );
  }

  const pageHash = await sha256Hex(
    new TextEncoder().encode(
      `${analysis.page.title}\n${analysis.page.h1}\n${analysis.page.summary}`,
    ),
  );

  const keyword =
    normalizeWhitespace(asString(body.keyword)) ||
    (await pickKeyword(admin, siteId, pageUrl));

  const { data: inserted, error } = await admin
    .from("alt_runs")
    .insert({
      site_id: siteId || null,
      page_url: pageUrl,
      page_host: analysis.page.host,
      page_title: analysis.page.title,
      page_lang: analysis.page.lang,
      page_hash: pageHash,
      context_summary: analysis.page.summary,
      keyword,
      status: "analyzed",
      image_count: analysis.images.length,
      generated_count: 0,
      approved_count: 0,
      model: settings.model,
      created_by: appUserId,
    })
    .select("*")
    .single();

  if (error) throw error;

  return {
    run: inserted as AltRunRow,
    page: analysis.page,
    images: analysis.images,
    usage: await usageSummary(admin, settings),
  };
}

async function handleGenerate(admin: DbClient, body: Record<string, unknown>) {
  const settings = await loadSettings(admin);
  if (!settings.enabled) {
    throw new AltRequestError("disabled", "ALT Pilot 已停用，請聯絡管理員。", 503);
  }

  const run = await loadRun(admin, asString(body.run_id));
  const images = normalizeImageInputs(body.images, settings.max_images_per_call);
  if (images.length === 0) {
    throw new AltRequestError("invalid_images", "請至少選擇一張可處理的圖片", 400);
  }

  const existing = await loadSuggestions(admin, run.id);
  const existingUrls = new Set(existing.map((suggestion) => suggestion.image_url));
  const newImageCount = images.filter((image) => !existingUrls.has(image.url)).length;
  if (existing.length + newImageCount > settings.max_images_per_run) {
    throw new AltRequestError(
      "too_many_images",
      `每個頁面最多 ${settings.max_images_per_run} 張圖，這次會超過上限。`,
      400,
    );
  }

  const keyword = normalizeWhitespace(asString(body.keyword) || run.keyword);
  const usageToday = await usageSummary(admin, settings);
  const usage: UsageState = { calls: usageToday.today, limit: usageToday.limit };
  const existingByUrl = new Map(existing.map((suggestion) => [suggestion.image_url, suggestion]));
  const results: AltSuggestionRow[] = [];
  const errors: Array<{ image_url: string; code: string; error: string }> = [];

  for (const image of images) {
    const previous = existingByUrl.get(image.url);
    if (previous?.status === "approved") {
      results.push(previous);
      continue;
    }

    if (isAltQuotaExceeded(usage.calls, usage.limit)) {
      errors.push({
        image_url: image.url,
        code: "quota_exceeded",
        error: "今日 ALT 生成次數已達上限。",
      });
      break;
    }

    try {
      const generated = await generateForImage({
        admin,
        run,
        image,
        settings,
        keyword,
        existingAlts: existingAltValues(
          [...existing, ...results],
          image.url,
        ),
        usage,
      });
      const suggestion = await upsertSuggestion({ admin, run, image, keyword, generated });
      results.push(suggestion);
    } catch (error) {
      const code = error instanceof AltRequestError
        ? error.code
        : error instanceof AltFetchError
          ? error.code
          : error instanceof AltProviderError
            ? error.code
            : error instanceof AltModelParseError
              ? error.code
              : "generate_failed";
      const message = error instanceof Error ? error.message : String(error);
      try {
        const failed = await upsertFailedSuggestion({
          admin,
          run,
          image,
          keyword,
          code,
          message,
        });
        results.push(failed);
      } catch (insertError) {
        console.error("[alt-pilot] failed suggestion insert", insertError);
      }
      errors.push({ image_url: image.url, code, error: message });
      if (code === "quota_exceeded") break;
    }
  }

  await updateRunCounts(admin, run.id, settings.model);

  return {
    suggestions: results,
    errors,
    usage: await usageSummary(admin, settings),
  };
}

async function handleRegenerate(admin: DbClient, body: Record<string, unknown>) {
  const settings = await loadSettings(admin);
  if (!settings.enabled) {
    throw new AltRequestError("disabled", "ALT Pilot 已停用，請聯絡管理員。", 503);
  }

  const suggestionId = asString(body.suggestion_id);
  if (!suggestionId) throw new AltRequestError("invalid_suggestion", "缺少 suggestion_id", 400);

  const { data: suggestion, error } = await admin
    .from("alt_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .maybeSingle();
  if (error) throw error;
  if (!suggestion) throw new AltRequestError("not_found", "找不到這張圖的 ALT 建議", 404);

  const run = await loadRun(admin, String(suggestion.run_id));
  const existing = await loadSuggestions(admin, run.id);
  const keyword = normalizeWhitespace(asString(body.keyword) || run.keyword);
  const usageToday = await usageSummary(admin, settings);
  const usage: UsageState = { calls: usageToday.today, limit: usageToday.limit };

  const image: AltImageCandidate = {
    url: String(suggestion.image_url),
    filename: String(suggestion.filename || ""),
    location: asLocation(suggestion.location),
    currentAlt: String(suggestion.current_alt || ""),
    hasAltAttr: true,
    width: null,
    height: null,
    ariaHidden: false,
    role: "",
    decorative: Boolean(suggestion.decorative),
    skipReason: null,
    nearbyHeading: "",
    nearbyCaption: "",
    nearbyParagraph: String(suggestion.context_excerpt || ""),
  };

  try {
    const generated = await generateForImage({
      admin,
      run,
      image,
      settings,
      keyword,
      existingAlts: existingAltValues(existing, image.url),
      usage,
    });

    const { data: updated, error: updateError } = await admin
      .from("alt_suggestions")
      .update({
        image_hash: generated.imageHash,
        suggested_alt: generated.draft.alt,
        short_alt: generated.draft.short_alt,
        alternatives: generated.draft.alternatives,
        rationale: generated.draft.rationale,
        keyword,
        confidence: generated.draft.confidence,
        risk: generated.risk,
        issues: generated.issues,
        decorative: generated.draft.decorative,
        provider: generated.result.provider,
        status: "pending",
        final_alt: null,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", suggestionId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await updateRunCounts(admin, run.id, settings.model);

    return {
      suggestion: updated as AltSuggestionRow,
      usage: await usageSummary(admin, settings),
    };
  } catch (error) {
    const code = error instanceof AltRequestError
      ? error.code
      : error instanceof AltFetchError
        ? error.code
        : error instanceof AltProviderError
          ? error.code
          : error instanceof AltModelParseError
            ? error.code
            : "generate_failed";
    const message = error instanceof Error ? error.message : String(error);
    await admin
      .from("alt_suggestions")
      .update({
        status: "failed",
        risk: "high",
        issues: [{ id: code, severity: "hard", message: truncateText(message, 500) }],
      })
      .eq("id", suggestionId);
    throw error;
  }
}

async function handleVerify(admin: DbClient, body: Record<string, unknown>) {
  const run = await loadRun(admin, asString(body.run_id));
  const allowedHosts = await loadAllowedHosts(admin, run.site_id || "");
  const fetched = await fetchPageHtml(run.page_url, allowedHosts);
  const analysis = analyzePage(fetched.html, fetched.finalUrl);
  const suggestions = await loadSuggestions(admin, run.id);
  const approved = suggestions.filter((suggestion) => suggestion.status === "approved");

  const byUrl = new Map(analysis.images.map((image) => [image.url, image]));
  const missing: Array<{ image_url: string; expected: string; actual: string }> = [];
  let matched = 0;

  for (const suggestion of approved) {
    const expected = normalizeWhitespace(suggestion.final_alt || suggestion.suggested_alt);
    const image = byUrl.get(suggestion.image_url);
    const actual = image ? image.currentAlt : "";
    if (normalizeForCompare(actual) === normalizeForCompare(expected)) {
      matched += 1;
    } else {
      missing.push({
        image_url: suggestion.image_url,
        expected,
        actual,
      });
    }
  }

  return {
    checked: approved.length,
    matched,
    missing,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }
  if (req.method !== "POST") {
    return errorResponse("method_not_allowed", "只接受 POST", 405);
  }

  try {
    const admin = adminClient();
    const auth = await authenticate(admin, req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = asString(body.action);

    if (action === "discover") {
      return jsonResponse({ ok: true, data: await handleDiscover(admin, body) });
    }
    if (action === "analyze") {
      return jsonResponse({ ok: true, data: await handleAnalyze(admin, body, auth.appUserId) });
    }
    if (action === "generate") {
      return jsonResponse({ ok: true, data: await handleGenerate(admin, body) });
    }
    if (action === "regenerate") {
      return jsonResponse({ ok: true, data: await handleRegenerate(admin, body) });
    }
    if (action === "verify") {
      return jsonResponse({ ok: true, data: await handleVerify(admin, body) });
    }

    return errorResponse("invalid_action", `未知的 action：${action || "（空白）"}`, 400);
  } catch (error) {
    if (error instanceof AltRequestError) {
      return errorResponse(error.code, error.message, error.status);
    }
    if (error instanceof AltFetchError) {
      return errorResponse(error.code, error.message, error.status);
    }
    if (error instanceof AltProviderError) {
      return errorResponse(error.code, error.message, error.status);
    }
    if (error instanceof AltModelParseError) {
      return errorResponse(error.code, error.message, 422);
    }
    if (isMissingTable(error)) {
      return errorResponse(
        "schema_missing",
        "ALT Pilot 功能尚未啟用，請先執行 migration（20261125183000_alt_pilot.sql）。",
        500,
      );
    }
    console.error("[alt-pilot] unexpected error", error);
    return errorResponse(
      "internal_error",
      error instanceof Error ? error.message : "ALT Pilot 發生未預期錯誤",
      500,
    );
  }
});
