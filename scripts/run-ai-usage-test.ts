import assert from 'node:assert/strict';
import { fetchWithAiUsage } from '../supabase/functions/_shared/ai-usage.ts';

const responses: (Response | Error)[] = [
  Response.json({ error: { message: 'rate limited' } }, { status: 429 }),
  Response.json({
    modelVersion: 'gemini-2.5-flash-001',
    usageMetadata: { promptTokenCount: 250, candidatesTokenCount: 100, thoughtsTokenCount: 50 },
  }),
  new Error('timeout'),
  Response.json({ model: 'unpriced-model', usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 15 } }),
  Response.json({
    usage: { prompt_tokens: 20, completion_tokens: 15, opencode: { list_cost: 0.004 } },
  }),
  new Response('not JSON'),
  Response.json({ ok: true }),
];

const jobs: Promise<void>[] = [];
const rows: Record<string, unknown>[] = [];
Object.assign(globalThis, {
  Deno: { env: { get: (key: string) => ({ SUPABASE_URL: 'https://mps.test', SUPABASE_SERVICE_ROLE_KEY: 'stub' })[key] } },
  EdgeRuntime: { waitUntil: (job: Promise<void>) => jobs.push(job) },
  fetch: async (url: string, options?: RequestInit) => {
    if (url === 'https://mps.test/rest/v1/ai_call_usage') {
      assert.equal(options?.method, 'POST');
      const row = JSON.parse(String(options?.body));
      rows.push(row);
      if (rows.length === 7) throw new Error('database unavailable');
      return new Response(null, { status: 201 });
    }

    assert.equal(url, 'https://model.test');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response);
    return response;
  },
});

const grok = { feature: 'ads-campaign-advisor', operation: 'advise', provider: 'grok', model: 'grok-4.7' } as const;
const gemini = { ...grok, provider: 'gemini', model: 'gemini-2.5-flash' } as const;
const invoke = (call: Parameters<typeof fetchWithAiUsage>[2]) =>
  fetchWithAiUsage('https://model.test', { method: 'POST', body: 'redacted for metering' }, call);

assert.equal((await invoke(grok)).status, 429);
const response = await invoke(gemini);
assert.equal((await response.json()).modelVersion, 'gemini-2.5-flash-001');
await assert.rejects(invoke(grok), /timeout/);
await invoke({ ...grok, model: 'unpriced-model' });
await invoke({ ...grok, provider: 'deepseek', model: 'deepseek-v4.1-flash' });
assert.equal(await (await invoke(grok)).text(), 'not JSON');
assert.deepEqual(await (await invoke(grok)).json(), { ok: true });

assert.equal(jobs.length, 7);
await Promise.all(jobs);
assert.equal(rows.length, 7);
const find = (match: (row: Record<string, unknown>) => boolean) => {
  const found = rows.filter(match);
  assert.equal(found.length, 1);
  return found[0];
};
assert.equal(find(row => row.status === 'http_error').http_status, 429);
assert.equal(find(row => row.status === 'network_error').http_status, null);
assert.equal(find(row => row.status === 'invalid_response').tokens_in, null);
const geminiRow = find(row => row.provider === 'gemini');
assert.equal(geminiRow.model, 'gemini-2.5-flash-001');
assert.equal(geminiRow.tokens_in, 250);
assert.equal(geminiRow.tokens_out, 150);
assert.equal(geminiRow.estimated_cost_usd, 0.00045);
const unpriced = find(row => row.model === 'unpriced-model');
assert.equal(unpriced.tokens_out, 5);
assert.equal(unpriced.estimated_cost_usd, null);
assert.equal(find(row => row.provider === 'deepseek').estimated_cost_usd, 0.004);
assert.ok(rows.every(row => !JSON.stringify(row).includes('redacted for metering')));
console.log('AI usage test passed');
