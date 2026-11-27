import assert from 'node:assert/strict';
import {
  estimateReaddyLlmCostUsd,
  extractGeminiUsage,
  extractGrokUsage,
  recordReaddyLlmUsage,
  type ReaddyUsageDbClient,
} from '../supabase/functions/_shared/readdy-llm-usage.ts';

// Gemini usage extraction
assert.deepEqual(
  extractGeminiUsage({
    usageMetadata: {
      promptTokenCount: 12000,
      candidatesTokenCount: 3500,
      thoughtsTokenCount: 450,
    },
  }),
  { tokensIn: 12000, tokensOut: 3950 },
);

assert.deepEqual(
  extractGeminiUsage({
    usageMetadata: {
      promptTokenCount: -5,
      candidatesTokenCount: 'bad',
      thoughtsTokenCount: 100,
    },
  }),
  { tokensIn: 0, tokensOut: 100 },
);

assert.deepEqual(extractGeminiUsage(null), { tokensIn: 0, tokensOut: 0 });

// Grok usage extraction (OpenAI-style: total_tokens === prompt + completion)
assert.deepEqual(
  extractGrokUsage({
    usage: {
      prompt_tokens: 4000,
      completion_tokens: 1200,
      total_tokens: 5200,
    },
  }),
  { tokensIn: 4000, tokensOut: 1200 },
);

// Grok usage extraction (xAI-style: total_tokens includes separate reasoning tokens)
assert.deepEqual(
  extractGrokUsage({
    usage: {
      prompt_tokens: 4000,
      completion_tokens: 1200,
      total_tokens: 5800,
    },
  }),
  { tokensIn: 4000, tokensOut: 1800 },
);

// Grok fallback when total_tokens is missing
assert.deepEqual(
  extractGrokUsage({
    usage: {
      prompt_tokens: 900,
      completion_tokens: 250,
    },
  }),
  { tokensIn: 900, tokensOut: 250 },
);

// Cost estimation
assert.equal(estimateReaddyLlmCostUsd('grok-4.7', 1_000_000, 100_000), 4.5);
assert.equal(estimateReaddyLlmCostUsd('grok-3-mini', 1_000_000, 1_000_000), 0.8);
assert.equal(estimateReaddyLlmCostUsd('gemini-4-hydrogen', 1_000_000, 100_000), 0.55);
assert.equal(estimateReaddyLlmCostUsd('gemini-2.0-flash', 1_000_000, 1_000_000), 0.5);
assert.equal(estimateReaddyLlmCostUsd('grok-future-model', 500_000, 100_000), 3);

// DB insert helper: skips zero-usage entries
const insertedRows: Array<{ table: string; row: Record<string, unknown> }> = [];
const mockDb: ReaddyUsageDbClient = {
  from(table: string) {
    return {
      async insert(row: Record<string, unknown>) {
        insertedRows.push({ table, row });
        return { error: null };
      },
    };
  },
};

await recordReaddyLlmUsage(mockDb, {
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  useCase: 'github_interpret',
  status: 'ok',
  tokensIn: 0,
  tokensOut: 0,
});
assert.equal(insertedRows.length, 0);

await recordReaddyLlmUsage(mockDb, {
  jobId: 'job-123',
  projectName: 'BW Event Music',
  pagePath: '/services/',
  provider: 'grok',
  model: 'grok-4.7',
  useCase: 'parse_ir',
  status: 'ok',
  tokensIn: 10000,
  tokensOut: 2000,
});
assert.equal(insertedRows.length, 1);
assert.equal(insertedRows[0].table, 'readdy_llm_usage');
assert.deepEqual(insertedRows[0].row, {
  job_id: 'job-123',
  project_name: 'BW Event Music',
  page_path: '/services/',
  provider: 'grok',
  model: 'grok-4.7',
  use_case: 'parse_ir',
  status: 'ok',
  tokens_in: 10000,
  tokens_out: 2000,
  cost_usd: 0.06,
});

// DB errors are swallowed without throwing
const failingDb: ReaddyUsageDbClient = {
  from() {
    return {
      async insert() {
        return { error: { message: 'db unavailable' } };
      },
    };
  },
};
await recordReaddyLlmUsage(failingDb, {
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  useCase: 'github_interpret',
  status: 'rejected',
  tokensIn: 100,
  tokensOut: 50,
});

console.log('readdy-llm-usage-test passed');
