import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cachedQuery,
  invalidateCachedQuery,
  isAbortError,
  peekCachedQuery,
  resetQueryCacheForTests,
  setCachedQuery,
} from '../src/lib/queryCache';
import {
  CACHED_JWT_EXPIRY_MARGIN_MS,
  getCachedAccessToken,
  hydrateCachedAuthSessionFromStorage,
  installCachedAuthSession,
  isCachedSessionFresh,
  peekValidCachedSession,
  resetCachedAuthSessionForTests,
  setCachedAuthSession,
  supabaseAuthStorageKey,
} from '../src/lib/authSessionCache';
import {
  applyCachedAuthHeaders,
  beginPageNavigation,
  isKeepAliveLookupUrl,
  resetPageFetchGenerationForTests,
  shouldAttachCachedJwt,
  shouldBoundGetRequest,
} from '../src/lib/supabaseFetch';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(isAbortError({ name: 'AbortError', message: 'Aborted' }), true);
assert.equal(isAbortError({ message: 'The user aborted a request.' }), true);
assert.equal(isAbortError({ message: 'relation does not exist' }), false);

resetQueryCacheForTests();
setCachedQuery('k', { n: 1 }, 1_000);
assert.deepEqual(peekCachedQuery('k'), { n: 1 });
invalidateCachedQuery('k');
assert.equal(peekCachedQuery('k'), undefined);

let fetches = 0;
const slow = () => {
  fetches += 1;
  return new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 20));
};

const [a, b] = await Promise.all([
  cachedQuery('shared', slow),
  cachedQuery('shared', slow),
]);
assert.equal(a, 'ok');
assert.equal(b, 'ok');
assert.equal(fetches, 1);
assert.equal(await cachedQuery('shared', slow), 'ok');
assert.equal(fetches, 1);

invalidateCachedQuery('shared');
assert.equal(await cachedQuery('shared', slow), 'ok');
assert.equal(fetches, 2);

assert.equal(shouldBoundGetRequest('https://x.supabase.co/rest/v1/projects', 'GET'), true);
assert.equal(shouldBoundGetRequest('https://x.supabase.co/rest/v1/projects', 'POST'), false);
assert.equal(shouldBoundGetRequest('https://x.supabase.co/auth/v1/token', 'GET'), false);
assert.equal(isKeepAliveLookupUrl('https://x.supabase.co/rest/v1/company_list?select=*'), true);
assert.equal(isKeepAliveLookupUrl('https://x.supabase.co/rest/v1/quotation_entry?select=*'), false);
assert.equal(shouldAttachCachedJwt('https://x.supabase.co/rest/v1/projects'), true);
assert.equal(shouldAttachCachedJwt('https://x.supabase.co/functions/v1/sync-ga4'), true);
assert.equal(shouldAttachCachedJwt('https://x.supabase.co/auth/v1/token'), false);

resetCachedAuthSessionForTests();
assert.equal(getCachedAccessToken(), null);
assert.equal(peekValidCachedSession(), null);
assert.equal(supabaseAuthStorageKey('https://kwcevjcmdjadhrygjyfp.supabase.co'), 'sb-kwcevjcmdjadhrygjyfp-auth-token');

const freshExp = Math.floor(Date.now() / 1000) + 3600;
setCachedAuthSession({
  access_token: 'cached-jwt',
  refresh_token: 'r',
  expires_at: freshExp,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'u1', email: 'a@b.c' },
} as never);
assert.equal(getCachedAccessToken(), 'cached-jwt');
assert.equal(isCachedSessionFresh(peekValidCachedSession()), true);

const staleExp = Math.floor((Date.now() + CACHED_JWT_EXPIRY_MARGIN_MS / 2) / 1000);
setCachedAuthSession({
  access_token: 'stale-jwt',
  refresh_token: 'r',
  expires_at: staleExp,
  expires_in: 1,
  token_type: 'bearer',
  user: { id: 'u1', email: 'a@b.c' },
} as never);
assert.equal(peekValidCachedSession(), null);

resetCachedAuthSessionForTests();
const store = new Map<string, string>();
store.set('sb-demo-auth-token', JSON.stringify({
  access_token: 'from-storage',
  expires_at: freshExp,
  user: { id: 'u2' },
}));
const hydrated = hydrateCachedAuthSessionFromStorage('https://demo.supabase.co', {
  getItem: (key) => store.get(key) ?? null,
});
assert.equal(hydrated?.access_token, 'from-storage');
assert.equal(getCachedAccessToken(), 'from-storage');

const attached = applyCachedAuthHeaders('https://x.supabase.co/rest/v1/projects');
assert.equal(new Headers(attached?.headers).get('Authorization'), 'Bearer from-storage');
const alreadySet = applyCachedAuthHeaders('https://x.supabase.co/rest/v1/projects', {
  headers: { Authorization: 'Bearer existing' },
});
assert.equal(new Headers(alreadySet?.headers).get('Authorization'), 'Bearer existing');
assert.equal(applyCachedAuthHeaders('https://x.supabase.co/auth/v1/token')?.headers, undefined);

let originalGetSessionCalls = 0;
const fakeClient = {
  auth: {
    getSession: async () => {
      originalGetSessionCalls += 1;
      return { data: { session: null }, error: null };
    },
  },
};
setCachedAuthSession({
  access_token: 'cached-jwt',
  refresh_token: 'r',
  expires_at: freshExp,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'u1', email: 'a@b.c' },
} as never);
installCachedAuthSession(fakeClient as never, 'https://demo.supabase.co');
const wrapped = await fakeClient.auth.getSession();
assert.equal(wrapped.data.session?.access_token, 'cached-jwt');
assert.equal(originalGetSessionCalls, 0);
resetCachedAuthSessionForTests();

resetPageFetchGenerationForTests();
assert.equal(beginPageNavigation('quotation/pitching'), true);
assert.equal(beginPageNavigation('quotation/pitching'), false);
assert.equal(beginPageNavigation('#quotation/projects'), true);

const quotation = read('src/components/quotation/QuotationModule.tsx');
assert.match(quotation, /if \(subModule === 'pitching'\)/);
assert.match(quotation, /return <PitchingModule/);
assert.match(quotation, /subModule === 'doc-types'/);
assert.match(quotation, /QuotationDocsList/);
assert.doesNotMatch(quotation, /useQuotations\(/);
assert.doesNotMatch(quotation, /QuotationEntriesSection/);
assert.doesNotMatch(quotation, /NewQuotationWizard/);
assert.doesNotMatch(quotation, /QuotationItemsManagement/);

const app = read('src/context/AppContext.tsx');
assert.match(app, /beginPageNavigation/);
assert.match(app, /replace\(\/\^\\\/\+\/, ''\)/);
const supabaseClient = read('src/lib/supabase.ts');
assert.match(supabaseClient, /supabaseBoundedFetch/);
assert.match(supabaseClient, /installCachedAuthSession/);
assert.doesNotMatch(supabaseClient, /lock: async \(_name, _timeout, fn\) => fn\(\)/);

const auth = read('src/context/AuthContext.tsx');
assert.match(auth, /Same session identity — skip re-verify/);
assert.match(auth, /void verifyAndFetchUser/);
assert.doesNotMatch(auth, /await verifyAndFetchUser/);
assert.match(read('src/lib/supabaseFetch.ts'), /applyCachedAuthHeaders/);
assert.match(read('src/hooks/useCompanies.ts'), /cachedQuery/);
assert.match(read('src/hooks/useQuotationDocs.ts'), /useQuotationDocsList/);

const useProjects = read('src/hooks/useProjects.ts');
assert.match(useProjects, /requestIdRef/);
assert.match(useProjects, /finally \{\s*if \(requestId === requestIdRef\.current\) setLoading\(false\);/);

console.log('page load stall: ok');
