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
  beginPageNavigation,
  isKeepAliveLookupUrl,
  resetPageFetchGenerationForTests,
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

resetPageFetchGenerationForTests();
assert.equal(beginPageNavigation('quotation/pitching'), true);
assert.equal(beginPageNavigation('quotation/pitching'), false);
assert.equal(beginPageNavigation('#quotation/projects'), true);

const quotation = read('src/components/quotation/QuotationModule.tsx');
const router = quotation.slice(
  quotation.indexOf('export function QuotationModule'),
  quotation.indexOf('function QuotationEntriesSection'),
);
assert.match(router, /if \(subModule === 'pitching'\)/);
assert.match(router, /return <PitchingModule/);
assert.doesNotMatch(router, /useQuotations\(/);
assert.match(quotation, /function QuotationEntriesSection/);
assert.match(quotation.slice(quotation.indexOf('function QuotationEntriesSection')), /useQuotations\(/);

const app = read('src/context/AppContext.tsx');
assert.match(app, /beginPageNavigation/);
assert.match(read('src/lib/supabase.ts'), /supabaseBoundedFetch/);
assert.match(read('src/hooks/useCompanies.ts'), /cachedQuery/);
assert.match(read('src/hooks/useQuotations.ts'), /isAbortError/);

console.log('page load stall: ok');
