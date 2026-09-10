import { getCachedAccessToken } from './authSessionCache';
import { isAbortError } from './queryCache';

export const REST_GET_TIMEOUT_MS = 25_000;

const LOOKUP_TABLES = [
  'company_list',
  'brand_list',
  'staffs',
  'system_options',
  'day_report_type',
  'supplier_types',
] as const;

let pageGeneration = 0;
let currentPagePath = '';
const controllersByGeneration = new Map<number, Set<AbortController>>();

export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function requestMethod(init?: RequestInit): string {
  return (init?.method || 'GET').toUpperCase();
}

export function isKeepAliveLookupUrl(url: string): boolean {
  if (!url.includes('/rest/v1/')) return false;
  return LOOKUP_TABLES.some((table) => new RegExp(`/rest/v1/${table}(?:\\?|$)`).test(url));
}

export function shouldBoundGetRequest(url: string, method: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return url.includes('/rest/v1/') || url.includes('/functions/v1/');
}

export function shouldAttachCachedJwt(url: string): boolean {
  return url.includes('/rest/v1/') || url.includes('/functions/v1/');
}

/** Attach the in-memory JWT when fetchWithAuth has not already set Authorization. */
export function applyCachedAuthHeaders(url: string, init?: RequestInit): RequestInit | undefined {
  if (!shouldAttachCachedJwt(url)) return init;
  const token = getCachedAccessToken();
  if (!token) return init;
  const headers = new Headers(init?.headers);
  if (headers.has('Authorization')) return init;
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

function abortGeneration(generation: number): void {
  const controllers = controllersByGeneration.get(generation);
  if (!controllers) return;
  controllers.forEach((controller) => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  });
  controllersByGeneration.delete(generation);
}

/** Cancel leftover page GETs when the hash route changes. Lookups stay alive to warm the cache. */
export function beginPageNavigation(path: string): boolean {
  const normalized = path.replace(/^#/, '');
  if (normalized === currentPagePath) return false;
  currentPagePath = normalized;
  const stale = pageGeneration;
  pageGeneration += 1;
  abortGeneration(stale);
  return true;
}

export function supabaseBoundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input);
  const nextInit = applyCachedAuthHeaders(url, init);
  const method = requestMethod(nextInit);
  if (!shouldBoundGetRequest(url, method)) {
    return fetch(input, nextInit).catch((err: Error) => {
      console.warn('[Supabase] Network error:', err.message);
      throw err;
    });
  }

  const controller = new AbortController();
  const keepAlive = isKeepAliveLookupUrl(url);
  if (!keepAlive) {
    const generation = pageGeneration;
    let set = controllersByGeneration.get(generation);
    if (!set) {
      set = new Set();
      controllersByGeneration.set(generation, set);
    }
    set.add(controller);
  }

  const timeoutId = setTimeout(() => controller.abort(), REST_GET_TIMEOUT_MS);
  const userSignal = nextInit?.signal;
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return fetch(input, { ...nextInit, signal: controller.signal })
    .catch((err: Error) => {
      if (!isAbortError(err)) {
        console.warn('[Supabase] Network error:', err.message);
      }
      throw err;
    })
    .finally(() => {
      clearTimeout(timeoutId);
      controllersByGeneration.forEach((set) => set.delete(controller));
    });
}

export function resetPageFetchGenerationForTests(): void {
  pageGeneration = 0;
  currentPagePath = '';
  controllersByGeneration.clear();
}
