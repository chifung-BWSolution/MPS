/**
 * Beauty100 自動發佈 · 共用純函式
 *
 * 這個檔同時被三邊載入：
 *   - React（站點詳情／憑證提示）
 *   - Deno Edge Functions（content-sites／content-worker）
 *   - Node 測試（content-selftest／adapter 契約測試）
 *
 * 因此**不得**引入任何瀏覽器、Node 或 Deno API。
 *
 * Beauty100 沒有對外內容 API；MPS 只能用站方既有的 Supabase REST。
 * 這裡集中處理「憑證 JSON 長什麼樣、分類怎麼對、文章網址怎麼組」，
 * 避免 adapter／UI／驗證三邊各寫一份而漂移。
 */

// ============================================================
// 分類
// ============================================================

export const BEAUTY100_CATEGORIES = [
  'facial-care',
  'body-care',
  'body-shaping',
  'anti-aging',
  'skincare',
  'healthy-diet',
  'entertainment',
  'trending-topics',
  'topics',
] as const;

export type Beauty100Category = (typeof BEAUTY100_CATEGORIES)[number];

export const BEAUTY100_DEFAULT_CATEGORY: Beauty100Category = 'trending-topics';

export const BEAUTY100_CATEGORY_LABEL: Readonly<Record<Beauty100Category, string>> = {
  'facial-care': '面部護理',
  'body-care': '身體保養',
  'body-shaping': '身材管理',
  'anti-aging': '回復青春',
  skincare: '化妝護膚',
  'healthy-diet': '飲食健康',
  entertainment: '娛樂圈',
  'trending-topics': '焦點話題',
  topics: '話題',
};

/**
 * 分類 → 公開詳情路徑前綴。
 *
 * 注意：Beauty100 沒有 `body-shaping/[slug]` 路由，公開詳情會 fallback 到
 * `/topics/{handle}`（見站方 `topics/[slug]/page.tsx` 的 getArticleDetailPath）。
 */
const CATEGORY_PATH: Readonly<Record<Beauty100Category, string>> = {
  'facial-care': '/facial-care',
  'body-care': '/body-care',
  'body-shaping': '/topics',
  'anti-aging': '/anti-aging',
  skincare: '/skincare',
  'healthy-diet': '/healthy-diet',
  entertainment: '/entertainment',
  'trending-topics': '/topics',
  topics: '/topics',
};

export function isBeauty100Category(value: unknown): value is Beauty100Category {
  return (
    typeof value === 'string' &&
    (BEAUTY100_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * MPS 欄目的 external_id 若填了合法 Beauty100 分類就用它；否則用預設焦點話題。
 * 空字串／null 是正常情況（只有一個欄目時不用特別填）。
 */
export function beauty100CategoryForSection(
  section: { external_id?: string | null } | null | undefined,
): Beauty100Category {
  const value = (section?.external_id ?? '').trim();
  // 站方 `/topics` 列表只撈 trending-topics；把 topics 視為同一個焦點話題，
  // 避免設了 topics 卻不在任何列表出現。
  if (value === 'topics') return BEAUTY100_DEFAULT_CATEGORY;
  return isBeauty100Category(value) ? value : BEAUTY100_DEFAULT_CATEGORY;
}

/** 把 webandsystem_list.domain_url 正規化成 origin；沒有網域回 null */
export function normalizeSiteOrigin(domain: string | null | undefined): string | null {
  const raw = (domain ?? '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const match = /^(https?:\/\/[^/]+)/i.exec(withScheme);
  if (!match) return null;
  return match[1].replace(/\/+$/, '');
}

/**
 * 組出 Beauty100 公開文章網址。
 * handle 可能是中文，必須 encodeURIComponent（站方 `useParams` 會 decode）。
 */
export function beauty100ArticleUrl(
  domain: string | null | undefined,
  category: Beauty100Category | string | null | undefined,
  handle: string,
): string | null {
  const origin = normalizeSiteOrigin(domain);
  const slug = (handle ?? '').trim();
  if (!origin || !slug) return null;
  const resolved = isBeauty100Category(category) ? category : BEAUTY100_DEFAULT_CATEGORY;
  return `${origin}${CATEGORY_PATH[resolved]}/${encodeURIComponent(slug)}`;
}

// ============================================================
// 憑證
// ============================================================

export interface Beauty100CredentialConfig {
  /** 例：https://gkqctvtteafjprkudgsb.supabase.co（不含結尾斜線） */
  supabaseUrl: string;
  /** Beauty100 的公開 anon key（前端 bundle 本來就有） */
  anonKey: string;
  /** 專用 staff 帳號（角色必須是 admin 或 marketing） */
  email: string;
  password: string;
  /** 封面要上傳的 public bucket；預設 uploads */
  bucket: string;
}

export type Beauty100CredentialParseResult =
  | { ok: true; config: Beauty100CredentialConfig }
  | { ok: false; errors: string[] };

export const BEAUTY100_DEFAULT_BUCKET = 'uploads';

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/;
const SUPABASE_ORIGIN_PATTERN = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{2,5})?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 解析並驗證 `beauty100_admin` 憑證。
 *
 * 規則刻意寬鬆到「站方 Supabase 可用」就好，不在這裡連網；
 * 真正帳密是否有效由 `content-sites` 的測試連線（adapter.testConnection）確認。
 */
export function parseBeauty100Credential(
  secret: string | null | undefined,
): Beauty100CredentialParseResult {
  const raw = (secret ?? '').trim();
  if (!raw) return { ok: false, errors: ['缺少憑證內容'] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: ['憑證必須是 JSON 物件（不要貼一般 token 或含註解的 JSON）'],
    };
  }

  if (!isRecord(parsed)) {
    return { ok: false, errors: ['憑證必須是 JSON 物件'] };
  }

  const errors: string[] = [];
  const supabaseUrl = trimmedString(parsed.supabase_url).replace(/\/+$/, '');
  const anonKey = trimmedString(parsed.anon_key);
  const email = trimmedString(parsed.email);
  const password = trimmedString(parsed.password);
  const bucket = trimmedString(parsed.bucket) || BEAUTY100_DEFAULT_BUCKET;

  if (!supabaseUrl) {
    errors.push('缺少 supabase_url');
  } else if (!SUPABASE_ORIGIN_PATTERN.test(supabaseUrl)) {
    errors.push('supabase_url 必須是 https://<project-ref>.supabase.co（不能含路徑或 query）');
  }

  if (!anonKey) {
    errors.push('缺少 anon_key');
  } else if (anonKey.length < 10) {
    errors.push('anon_key 長度不正確');
  }

  if (!email) {
    errors.push('缺少 email');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('email 格式不正確');
  }

  if (!password) {
    errors.push('缺少 password');
  } else if (password.length < 6) {
    errors.push('password 至少 6 個字元');
  }

  if (!BUCKET_PATTERN.test(bucket)) {
    errors.push('bucket 只能用小寫字母、數字、點、底線與減號');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      supabaseUrl,
      anonKey,
      email,
      password,
      bucket,
    },
  };
}

/**
 * 憑證 fingerprint 的來源：用 email 末四碼比 JSON 尾字元有意義。
 * 真正的密文仍由內容 vault 產生。
 */
export function beauty100FingerprintSource(
  config: Pick<Beauty100CredentialConfig, 'email' | 'supabaseUrl'>,
): string {
  const email = (config.email || '').trim();
  const localPart = email.includes('@') ? email.split('@')[0] : email;
  return localPart || email || config.supabaseUrl;
}

/** 給站點詳情「貼上範本」用；不含任何真實 secret */
export const BEAUTY100_CREDENTIAL_TEMPLATE = `{
  "supabase_url": "https://<project-ref>.supabase.co",
  "anon_key": "<Beauty100 public anon key>",
  "email": "<dedicated staff email>",
  "password": "<password>",
  "bucket": "uploads"
}`;

/** 上傳測試檔的固定前綴（連線測試用；不影響文章） */
export const BEAUTY100_PROBE_PREFIX = '_mps_probe';
