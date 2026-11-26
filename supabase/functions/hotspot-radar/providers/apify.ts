import {
  classifyProviderStatus,
  DEFAULT_AD_UNIT_PRICE_USD_PER_1000,
  DEFAULT_UNIT_PRICE_USD_PER_1000,
  type HotspotItemDraft,
  type HotspotKind,
} from '../../../../src/lib/hotspotRadar.ts';
import { HotspotProviderError, mapItems, type HotspotProvider } from './types.ts';

/**
 * Apify provider（run-sync-get-dataset-items）
 *
 * 為什麼 input 有「預設 + JSON 覆寫」兩層：
 *   Apify 每個 actor 的 input schema 都不同，寫死任何一組欄位都可能在 M0 選到
 *   別的 actor 時失效。因此預設值只是常見命名，實際上線前用 env 覆寫即可，
 *   換 actor 不必改程式碼。
 *
 * 必要 secrets：
 *   HOTSPOT_APIFY_TOKEN            （必需）
 *   HOTSPOT_APIFY_ACTOR_ACCOUNT    （帳號類；未設 → 該類回 provider_not_configured）
 *   HOTSPOT_APIFY_ACTOR_HASHTAG
 *   HOTSPOT_APIFY_ACTOR_ADS
 * 可選：
 *   HOTSPOT_APIFY_TIMEOUT_MS
 *   HOTSPOT_APIFY_INPUT_ACCOUNT_JSON / _HASHTAG_JSON / _ADS_JSON
 *   HOTSPOT_UNIT_PRICE_USD_PER_1000 / HOTSPOT_UNIT_PRICE_ADS_USD_PER_1000
 */

const API_BASE = 'https://api.apify.com/v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;

interface ApifyConfig {
  token: string;
  actors: { account: string; hashtag: string; ads: string };
  timeoutMs: number;
  prices: { standard: number; ads: number };
}

function readEnv(name: string): string {
  return (Deno.env.get(name) ?? '').trim();
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readJsonEnv(name: string): Record<string, unknown> | null {
  const raw = readEnv(name);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildInput(
  defaults: Record<string, unknown>,
  overrideEnvName: string,
): Record<string, unknown> {
  const override = readJsonEnv(overrideEnvName);
  return override ? { ...defaults, ...override } : defaults;
}

async function runActorSync(
  config: ApifyConfig,
  actorId: string,
  input: Record<string, unknown>,
): Promise<unknown[]> {
  if (!actorId) {
    throw new HotspotProviderError(
      'provider_not_configured',
      '此類型的 Apify actor 尚未設定（HOTSPOT_APIFY_ACTOR_*）',
      503,
      false,
    );
  }

  const url =
    `${API_BASE}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(config.token)}&format=json&clean=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HotspotProviderError(
      'provider_unavailable',
      `無法連線抓取服務：${message}`,
      502,
      true,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const classified = classifyProviderStatus(response.status);
    throw new HotspotProviderError(
      classified.code,
      `抓取服務回應 ${response.status}：${body.slice(0, 200)}`,
      response.status === 429 ? 429 : 502,
      classified.retryable,
    );
  }

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) {
    throw new HotspotProviderError(
      'provider_unavailable',
      '抓取服務回應格式不是陣列（actor 可能尚未產生 dataset）',
      502,
      true,
    );
  }
  return payload as unknown[];
}

/**
 * 讀設定。token 缺失直接拋（整個功能不可用）；actor 缺失則延後到呼叫時拋，
 * 這樣只設了 IG actor 的人仍然可以抓 IG、廣告分頁顯示未設定。
 */
function readConfig(): ApifyConfig {
  const token = readEnv('HOTSPOT_APIFY_TOKEN');
  if (!token) {
    throw new HotspotProviderError(
      'provider_not_configured',
      '缺少 HOTSPOT_APIFY_TOKEN（請先 supabase secrets set HOTSPOT_APIFY_TOKEN=...）',
      503,
      false,
    );
  }

  const timeoutRaw = readNumberEnv('HOTSPOT_APIFY_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const timeoutMs = Math.min(Math.max(timeoutRaw, 5_000), MAX_TIMEOUT_MS);

  return {
    token,
    actors: {
      account: readEnv('HOTSPOT_APIFY_ACTOR_ACCOUNT'),
      hashtag: readEnv('HOTSPOT_APIFY_ACTOR_HASHTAG'),
      ads: readEnv('HOTSPOT_APIFY_ACTOR_ADS'),
    },
    timeoutMs,
    prices: {
      standard: readNumberEnv('HOTSPOT_UNIT_PRICE_USD_PER_1000', DEFAULT_UNIT_PRICE_USD_PER_1000),
      ads: readNumberEnv('HOTSPOT_UNIT_PRICE_ADS_USD_PER_1000', DEFAULT_AD_UNIT_PRICE_USD_PER_1000),
    },
  };
}

export function createApifyProvider(): HotspotProvider {
  const config = readConfig();

  async function fetchKind(
    kind: HotspotKind,
    actorId: string,
    input: Record<string, unknown>,
    limit: number,
  ): Promise<HotspotItemDraft[]> {
    const payload = await runActorSync(config, actorId, input);
    return mapItems(payload, kind, limit);
  }

  return {
    name: 'apify',

    async fetchAccount(handle: string, limit: number): Promise<HotspotItemDraft[]> {
      const input = buildInput(
        { username: [handle], resultsType: 'posts', resultsLimit: limit },
        'HOTSPOT_APIFY_INPUT_ACCOUNT_JSON',
      );
      return fetchKind('account', config.actors.account, input, limit);
    },

    async fetchHashtag(tag: string, limit: number): Promise<HotspotItemDraft[]> {
      const input = buildInput(
        { hashtags: [tag], resultsType: 'posts', resultsLimit: limit },
        'HOTSPOT_APIFY_INPUT_HASHTAG_JSON',
      );
      return fetchKind('hashtag', config.actors.hashtag, input, limit);
    },

    async fetchAds(keyword: string, limit: number): Promise<HotspotItemDraft[]> {
      const input = buildInput(
        { searchTerms: [keyword], maxResults: limit, activeStatus: 'ACTIVE' },
        'HOTSPOT_APIFY_INPUT_ADS_JSON',
      );
      return fetchKind('ad_keyword', config.actors.ads, input, limit);
    },

    unitPricePer1000(kind: HotspotKind): number {
      return kind === 'ad_keyword' ? config.prices.ads : config.prices.standard;
    },
  };
}
