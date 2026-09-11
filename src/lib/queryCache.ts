const DEFAULT_TTL_MS = 45_000;

type CacheRecord<T> = {
  value: T;
  expiresAt: number;
};

const memory = new Map<string, CacheRecord<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const QUERY_CACHE_KEYS = {
  companies: 'lookup:company_list',
  brands: 'lookup:brand_list',
  staffNames: 'lookup:staffs:names',
  staffOptions: 'lookup:staffs:active-options',
  systemOptions: 'lookup:system_options:platform',
  dayReportTypes: 'lookup:day_report_type',
  supplierTypes: 'lookup:supplier_types',
  quotationDocTypes: 'lookup:quotation_doc_types',
  quotationClientProjects: 'list:quotation_client_project',
  quotationClientList: 'list:quotation_client_list',
  websiteProfiles: 'list:webandsystem_list',
  ga4WebsiteListTraffic: 'list:ga4_website_list_traffic',
} as const;

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String((error as { name?: unknown }).name) : '';
  const message = 'message' in error ? String((error as { message?: unknown }).message) : '';
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  if (name === 'AbortError') return true;
  if (code === '20' || code === 'ABORT_ERR') return true;
  return /abort(ed|error)?/i.test(message);
}

export function peekCachedQuery<T>(key: string): T | undefined {
  const hit = memory.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return undefined;
  return hit.value as T;
}

export function setCachedQuery<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCachedQuery(key: string | ((candidate: string) => boolean)): void {
  if (typeof key === 'string') {
    memory.delete(key);
    inflight.delete(key);
    return;
  }
  for (const candidate of [...memory.keys()]) {
    if (key(candidate)) memory.delete(candidate);
  }
  for (const candidate of [...inflight.keys()]) {
    if (key(candidate)) inflight.delete(candidate);
  }
}

export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const cached = peekCachedQuery<T>(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((value) => {
      setCachedQuery(key, value, ttlMs);
      return value;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function resetQueryCacheForTests(): void {
  memory.clear();
  inflight.clear();
}
