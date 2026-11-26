import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// 1. Load supabase/functions/_shared/framer-mcp.ts with mocked Deno + fetch
const sharedSrc = readFileSync(new URL('../supabase/functions/_shared/framer-mcp.ts', import.meta.url), 'utf8')
  .replace(/import\s+\{[\s\S]*?\}\s+from\s+"https:\/\/esm\.sh\/@supabase\/supabase-js@2";\s*/g, '');

const sharedJs = ts.transpileModule(sharedSrc, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const fetchCalls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];

const sharedModule = { exports: {} as Record<string, unknown> };
const sharedContext = vm.createContext({
  exports: sharedModule.exports,
  module: sharedModule,
  Deno: {
    env: {
      get: () => '',
    },
  },
  createClient: () => ({}),
  fetch: async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    fetchCalls.push({
      url: String(url),
      method: init?.method || 'GET',
      headers: init?.headers || {},
      body: init?.body,
    });
    if (init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': 'transport-resp-123',
      },
    });
  },
  Response,
  URLSearchParams,
});

vm.runInContext(sharedJs, sharedContext, { filename: 'framer-mcp.ts' });

const {
  FramerMcpClient,
  FRAMER_SESSION_IDLE_TTL_MS,
  isFramerSessionLimitError,
  isFramerStaleSessionError,
  readCachedFramerSession,
  formatFramerSessionLimitError,
  getFramerSessionOpenBlock,
} = sharedModule.exports as {
  FramerMcpClient: new (accessToken: string, initialSessionId?: string | null) => {
    getSessionId: () => string | null;
    callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    close: () => Promise<void>;
  };
  FRAMER_SESSION_IDLE_TTL_MS: number;
  isFramerSessionLimitError: (msg: string) => boolean;
  isFramerStaleSessionError: (msg: string) => boolean;
  readCachedFramerSession: (row: unknown, projectId: string, nowMs?: number) => unknown;
  formatFramerSessionLimitError: (rawDetail: string) => string;
  getFramerSessionOpenBlock: (
    row: unknown,
    projectId: string,
    nowMs?: number,
  ) => { blocked: boolean; retryAfterSeconds: number };
};

async function runTests() {
  // Test 1: FramerMcpClient passes initialSessionId as Mcp-Session-Id, exposes getSessionId(), sends DELETE on close()
  const client = new FramerMcpClient('tok-abc', 'sess-initial-001');
  assert.equal(client.getSessionId(), 'sess-initial-001');
  await client.callTool('exec', { session: 'proj-sess-1', program: 'return {}' });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].method, 'POST');
  assert.equal(fetchCalls[0].headers['Mcp-Session-Id'], 'sess-initial-001');
  assert.equal(client.getSessionId(), 'transport-resp-123');

  await client.close();
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[1].method, 'DELETE');
  assert.equal(fetchCalls[1].headers['Mcp-Session-Id'], 'transport-resp-123');
  assert.equal(client.getSessionId(), null);

  // Closing again should be a no-op
  await client.close();
  assert.equal(fetchCalls.length, 2);

  // Test 2: readCachedFramerSession returns fresh sessions (<330s) and null for expired sessions (>=330s)
  const nowMs = Date.parse('2026-11-25T09:30:00.000Z');
  const freshAt = new Date(nowMs - (FRAMER_SESSION_IDLE_TTL_MS - 5000)).toISOString();
  const expiredAt = new Date(nowMs - FRAMER_SESSION_IDLE_TTL_MS).toISOString();
  const row = {
    active_mcp_sessions: {
      projFresh: {
        project_id: 'projFresh',
        project_url: 'https://framer.com/projects/Demo--projFresh',
        mcp_session_id: 'mcp-1',
        project_session: 'ps-1',
        opened_at: freshAt,
        last_used_at: freshAt,
        reopen_after: null,
        blocked_until: null,
      },
      projExpired: {
        project_id: 'projExpired',
        project_url: 'https://framer.com/projects/Demo--projExpired',
        mcp_session_id: 'mcp-2',
        project_session: 'ps-2',
        opened_at: expiredAt,
        last_used_at: expiredAt,
      },
    },
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(readCachedFramerSession(row, 'projFresh', nowMs))),
    row.active_mcp_sessions.projFresh,
  );
  assert.equal(readCachedFramerSession(row, 'projExpired', nowMs), null);
  assert.equal(readCachedFramerSession(row, 'unknown', nowMs), null);

  const stillCountedAt = new Date(nowMs - 331_000).toISOString();
  const stillCounted = {
    active_mcp_sessions: {
      projRecent: {
        project_id: 'projRecent',
        project_url: 'https://framer.com/projects/Demo--projRecent',
        mcp_session_id: 'mcp-3',
        project_session: 'ps-3',
        opened_at: stillCountedAt,
        last_used_at: stillCountedAt,
      },
    },
  };
  assert.ok(
    readCachedFramerSession(stillCounted, 'projRecent', nowMs),
    'A handle last used 331s ago is still inside Framer’s 360s window and must be reused',
  );

  const blockedUntil = new Date(nowMs + 120_000).toISOString();
  const blockedRow = {
    active_mcp_sessions: {
      __account__: {
        project_id: '__account__',
        project_url: '',
        mcp_session_id: 'mcp-account',
        project_session: 'transport',
        opened_at: freshAt,
        last_used_at: freshAt,
        blocked_until: blockedUntil,
      },
      projHeld: {
        project_id: 'projHeld',
        project_url: '',
        mcp_session_id: null,
        project_session: '',
        opened_at: freshAt,
        last_used_at: freshAt,
        reopen_after: new Date(nowMs + 360_000).toISOString(),
      },
    },
  };
  assert.equal(getFramerSessionOpenBlock(blockedRow, 'projHeld', nowMs).blocked, true);
  assert.equal(readCachedFramerSession(blockedRow, 'projHeld', nowMs), null);
  assert.equal(isFramerStaleSessionError('HTTP 404: file missing'), false);

  // Test 3: Session limit vs stale session vs normal exec errors
  const limitMsg =
    'Your account has reached its active session limit. Do not retry now. If you already have an active session for this task on the same project and branch, use its handle with project tools instead of calling open_project. (ref 1f57ec)';
  assert.equal(isFramerSessionLimitError(limitMsg), true);
  assert.equal(isFramerStaleSessionError(limitMsg), false, 'Session limit error must never be treated as stale/retryable');

  assert.equal(isFramerStaleSessionError('Framer MCP tools/call HTTP 404: Session not found'), true);
  assert.equal(isFramerStaleSessionError('Invalid session handle provided'), true);
  assert.equal(isFramerStaleSessionError('Server not initialized'), true);
  assert.equal(isFramerStaleSessionError('TypeError: cannot read properties of undefined'), false);
  assert.equal(isFramerSessionLimitError('TypeError: cannot read properties of undefined'), false);
  assert.ok(formatFramerSessionLimitError(limitMsg).includes('360 秒'));

  // Test 4: runReaddyConversion forwards mcp_session across steps & pages and stops immediately on session limit
  const apiSrc = readFileSync(new URL('../src/lib/readdyFramerApi.ts', import.meta.url), 'utf8');
  const limitFnMatch = apiSrc.match(/export function isFramerSessionLimitError[\s\S]*?\n\}/);
  assert.ok(limitFnMatch, 'Located isFramerSessionLimitError in src/lib/readdyFramerApi.ts');

  const convSrc = readFileSync(new URL('../src/lib/readdyConversionRun.ts', import.meta.url), 'utf8')
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+'@\/lib\/readdyProjectAnalyzer';\s*/g, '')
    .replace(/import\s+\{[\s\S]*?\}\s+from\s+'@\/lib\/readdyFramerApi';\s*/g, `${limitFnMatch[0]}\n`)
    .replace(
      'export const FRAMER_SESSION_LIMIT_RETRY_MS = 360_000;',
      'const FRAMER_SESSION_LIMIT_RETRY_MS = 0;',
    )
    .replace(/import\s+type\s+\{[\s\S]*?\}\s+from\s+'@\/lib\/readdyConversionMail';\s*/g, '')
    .replace(/import\s+type\s+\{[\s\S]*?\}\s+from\s+'@\/types\/readdyFramer';\s*/g, '');

  const convJs = ts.transpileModule(convSrc, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const compileRunConversion = (syncMock: (params: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
    const mod = { exports: {} as Record<string, unknown> };
    const ctx = vm.createContext({
      exports: mod.exports,
      module: mod,
      setTimeout,
      clearTimeout,
      Date,
      assembleReaddyPageCode: (page: { path: string }) => ({
        code: `export default function Page() { return <div>${page.path}</div>; }`,
        includedFiles: ['Page.tsx'],
        summary: 'ok',
      }),
      fetchGitHubPageBundle: async () => {
        throw new Error('not used');
      },
      parseReaddyToIr: async (params: { page_meta?: { path?: string } }) => ({
        job_id: `job-${params.page_meta?.path}`,
        ir_payload: {
          sections: [
            { id: 'sec-1', name: 'Hero' },
            { id: 'sec-2', name: 'Footer' },
          ],
        },
      }),
      syncFramerPage: syncMock,
      syncFramerStep: syncMock,
    });
    vm.runInContext(convJs, ctx, { filename: 'readdyConversionRun.ts' });
    return {
      concurrency: Number(mod.exports.FRAMER_PAGE_SYNC_CONCURRENCY),
      run: mod.exports.runReaddyConversion as (
        input: Record<string, unknown>,
        report: (p: unknown) => void,
        isCancelled: () => boolean,
      ) => Promise<{
        kind: 'success' | 'failed';
        pages: Array<{ path: string; status: string; error?: string }>;
        unstarted: number;
        cancelled: boolean;
        error?: string;
      }>,
    };
  };

  const baseInput = (paths: string[]) => ({
    projectKey: 'pk-1',
    siteName: 'TestSite',
    readdyCode: '',
    framerProjectUrl: 'https://framer.com/projects/Test--proj123',
    sourceType: 'upload',
    gridConfig: { desktop_width: 1440, container_max_width: 1200, columns: 12, gutter: 24 },
    analysis: { sharedFiles: {}, cssTokens: {} },
    fileMap: {},
    githubRepoUrl: '',
    githubAllPaths: [],
    pages: paths.map((p) => ({
      id: p,
      path: p,
      title: `Page ${p}`,
      locale: 'zh',
      pageKind: 'subpage',
      componentName: 'Page',
      sourceFile: 'Page.tsx',
      migrationStatus: 'pending',
    })),
  });

  // 4a: Each worker reuses the session for later steps of the same page, and two pages use two slots.
  const seenSyncCalls: Array<{
    step_index: number;
    page_path: string;
    session_slot: number;
    mcp_session: unknown;
    sync_page?: unknown;
  }> = [];
  const forward = compileRunConversion(async (params) => {
    seenSyncCalls.push({
      step_index: Number(params.step_index),
      page_path: String(params.page_path),
      session_slot: Number(params.session_slot),
      mcp_session: params.mcp_session ?? null,
      sync_page: params.sync_page,
    });
    return {
      ok: true,
      step_index: params.step_index,
      framer_page_node_id: 'node-1',
      mcp_session: {
        project_id: 'proj123',
        mcp_session_id: 'mcp-shared',
        project_session: 'proj-sess-shared',
      },
    };
  });

  const sharedSession = {
    project_id: 'proj123',
    mcp_session_id: 'mcp-shared',
    project_session: 'proj-sess-shared',
  };
  const okRes = await forward.run(baseInput(['/', '/about']), () => {}, () => false);
  assert.equal(forward.concurrency, 6);
  assert.equal(okRes.kind, 'success');
  assert.equal(okRes.pages.length, 2);
  assert.equal(seenSyncCalls.length, 2);
  const byPage = new Map<string, typeof seenSyncCalls>();
  for (const call of seenSyncCalls) {
    const list = byPage.get(call.page_path) ?? [];
    list.push(call);
    byPage.set(call.page_path, list);
  }
  assert.equal(byPage.size, 2);
  const usedSlots = new Set<number>();
  for (const calls of byPage.values()) {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].mcp_session, null);
    usedSlots.add(calls[0].session_slot);
    assert.notEqual(calls[0].session_slot, 0);
  }
  assert.equal(usedSlots.size, 2);

  // 4b: A session-limit error returns the page to the queue and retries once.
  const attemptedPages: string[] = [];
  const abort = compileRunConversion(async (params) => {
    attemptedPages.push(String(params.page_path));
    throw new Error(formatFramerSessionLimitError('active session limit (ref 1f57ec)'));
  });

  const limitPaths = Array.from({ length: abort.concurrency + 2 }, (_, index) => `/p${index}`);
  const abortRes = await abort.run(baseInput(limitPaths), () => {}, () => false);
  assert.equal(abortRes.kind, 'failed');
  assert.equal(abortRes.pages.length, limitPaths.length);
  assert.equal(abortRes.unstarted, 0);
  assert.equal(abortRes.pages.every((page) => page.status === 'failed'), true);
  for (const path of limitPaths) {
    const calls = attemptedPages.filter((item) => item === path);
    assert.equal(calls.length, 2, `${path} should be tried twice`);
  }

  console.log('All Framer MCP session reuse & limit guard tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
