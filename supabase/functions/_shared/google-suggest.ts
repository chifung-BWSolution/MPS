import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  RADAR_SUGGEST_TIMEOUT_MS,
  parseSuggestPayload,
  toDisplayKeyword,
} from "../../../src/lib/seoRadar.ts";

/**
 * Google 搜尋建議（非官方端點）
 *
 * 契約：任何失敗都回 `{ terms: [], error }`，**不拋錯**。
 * 呼叫端（seo-radar）要把單一種子失敗降級成 warning，
 * 不能因為 Google 改格式就讓整次抓取失敗。
 */

const ENDPOINT = "https://suggestqueries.google.com/complete/search";
const MAX_TERMS_PER_SEED = 10;

export interface SuggestFetchOptions {
  hl: string;
  gl: string;
  /** 併發數，預設 3 */
  concurrency?: number;
  timeoutMs?: number;
  /** 絕對時間戳（ms）；超過就停止抓剩下的種子並記 warning */
  deadline?: number;
}

export interface SuggestTermPair {
  seed: string;
  keyword: string;
}

export interface SuggestFetchResult {
  terms: SuggestTermPair[];
  errors: string[];
  seeds_requested: string[];
  seeds_completed: string[];
}

interface SingleSeedResult {
  seed: string;
  terms: string[];
  error: string | null;
}

async function fetchOneSeed(
  seed: string,
  options: { hl: string; gl: string; timeoutMs: number },
): Promise<SingleSeedResult> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("client", "firefox");
  url.searchParams.set("ie", "utf-8");
  url.searchParams.set("oe", "utf-8");
  url.searchParams.set("hl", options.hl);
  url.searchParams.set("gl", options.gl);
  url.searchParams.set("q", seed);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json, text/javascript, */*",
        "Accept-Language": options.hl,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) {
      return { seed, terms: [], error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { seed, terms: [], error: "非 JSON 回應" };
    }

    const terms = parseSuggestPayload(payload).slice(0, MAX_TERMS_PER_SEED);
    return { seed, terms, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { seed, terms: [], error: message.slice(0, 120) };
  }
}

/** 逐批（預設 3 個種子）抓建議詞；一批失敗不影響其他批 */
export async function fetchSuggestions(
  seeds: readonly string[],
  options: SuggestFetchOptions,
): Promise<SuggestFetchResult> {
  const concurrency = Math.max(1, Math.min(5, Math.floor(options.concurrency ?? 3)));
  const timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? RADAR_SUGGEST_TIMEOUT_MS));
  const deadline = options.deadline ?? Date.now() + 90_000;

  const seedsRequested = [
    ...new Set(seeds.map((seed) => toDisplayKeyword(seed)).filter(Boolean)),
  ];

  const terms: SuggestTermPair[] = [];
  const errors: string[] = [];
  const seedsCompleted: string[] = [];

  for (let index = 0; index < seedsRequested.length; index += concurrency) {
    if (Date.now() >= deadline) {
      errors.push("建議詞抓取超出時間預算，已停止剩餘種子");
      break;
    }

    const batch = seedsRequested.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map((seed) =>
        fetchOneSeed(seed, { hl: options.hl, gl: options.gl, timeoutMs }),
      ),
    );

    for (const result of results) {
      if (result.error) {
        errors.push(`${result.seed}: ${result.error}`);
        continue;
      }
      seedsCompleted.push(result.seed);
      for (const keyword of result.terms) {
        terms.push({ seed: result.seed, keyword });
      }
    }
  }

  return { terms, errors, seeds_requested: seedsRequested, seeds_completed: seedsCompleted };
}
