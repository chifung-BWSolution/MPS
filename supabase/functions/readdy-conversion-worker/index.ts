import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  isFramerSessionLimitError,
  jsonResponse,
  requireUser,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  supabaseAdmin,
} from "../_shared/framer-mcp.ts";
import { assembleReaddyPageCode } from "../_shared/readdy-analyzer.ts";
import { sendResendEmail } from "../_shared/resend.ts";
import {
  buildReaddyConversionResultEmail,
  hongKongDateLabel,
  READDY_CONVERSION_RESULT_TO,
  type ReaddyConversionPageResult,
} from "../../../src/lib/readdyConversionMail.ts";
import { formatFramerPublishNote, type FramerPublishResult } from "../../../src/lib/framerPublish.ts";

const PAGES_PER_WAKE = 3;
const MAX_WAKE_MS = 180_000;
const LEASE_MS = 4 * 60 * 1000;
const SESSION_RETRY_MS = 360_000;

type PageRecord = ReaddyConversionPageResult & {
  pageId?: string;
  jobId?: string | null;
  framerPageNodeId?: string | null;
  lastSyncedAt?: string | null;
};

type RunProgress = {
  currentLabel?: string;
  currentPageId?: string | null;
  done?: number;
  total?: number;
  pages?: PageRecord[];
  attempts?: number[];
  mcpSession?: Record<string, unknown> | null;
  retryAfter?: string | null;
  leaseToken?: string | null;
  leaseUntil?: string | null;
  emailError?: string;
  summary?: string;
};

type RunRow = {
  id: string;
  user_id: string | null;
  project_key: string;
  status: string;
  payload: {
    projectKey: string;
    siteName: string;
    readdyCode: string;
    framerProjectUrl: string;
    sourceType: "github" | "upload" | "paste";
    gridConfig: Record<string, unknown>;
    analysis: {
      sharedFiles: Record<string, string | undefined>;
      githubMeta?: { branch?: string } | null;
      storageBundlePath?: string | null;
      assetUrlMap?: Record<string, string>;
      cssTokens?: Record<string, unknown>;
      tailwindConfig?: string | null;
      pages?: unknown[];
    };
    fileMap?: Record<string, string>;
    githubRepoUrl?: string;
    githubAllPaths?: string[];
    pages: Array<{
      id: string;
      path: string;
      title: string;
      locale?: string;
      pageKind?: string;
      sourceFile?: string;
      sectionCount?: number;
    }>;
  };
  progress: RunProgress;
  page_index: number;
  error: string | null;
};

function edgeWaitUntil(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else void work;
}

async function callFunction(name: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as { error?: string; error_code?: string };
  if (!res.ok || json.error) {
    const message = json.error || `${res.status} ${res.statusText}`;
    const error = new Error(message);
    if (json.error_code === "framer_session_limit" || isFramerSessionLimitError(message)) {
      error.name = "FramerSessionLimit";
    }
    throw error;
  }
  return json as Record<string, unknown>;
}

async function loadRun(id: string): Promise<RunRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("framer_conversion_runs")
    .select("id, user_id, project_key, status, payload, progress, page_index, error")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RunRow | null) ?? null;
}

async function saveRun(
  id: string,
  patch: Record<string, unknown>,
  opts?: { onlyIfNotCancelled?: boolean },
): Promise<boolean> {
  let query = supabaseAdmin()
    .from("framer_conversion_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (opts?.onlyIfNotCancelled) {
    query = query.in("status", ["queued", "running"]);
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
  return true;
}

async function triggerNextWake(id: string, token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/readdy-conversion-worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "continue",
        run_id: id,
        lease_token: token,
      }),
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}

async function finishRun(row: RunRow, progress: RunProgress, cancelled: boolean) {
  const pages = progress.pages ?? [];
  const unstarted = Math.max(0, row.payload.pages.length - pages.filter((page) => page.status).length);
  const failed = cancelled || unstarted > 0 || pages.some((page) => page.status === "failed");
  let publishNote: string | undefined;
  if (!cancelled && pages.some((page) => page.status === "migrated")) {
    try {
      const published = await callFunction("framer-mcp-sync", {
        action: "publish_project",
        framer_project_url: row.payload.framerProjectUrl,
        session_slot: 1,
        mcp_session: progress.mcpSession ?? null,
      });
      publishNote = formatFramerPublishNote(published.publish as FramerPublishResult) ?? undefined;
    } catch (err) {
      publishNote = `Publish 失敗：${err instanceof Error ? err.message : String(err)}`;
    }
  }
  const result = {
    kind: failed ? "failed" as const : "success" as const,
    pages,
    unstarted,
    cancelled,
    error: cancelled ? "已中止" : pages.find((page) => page.status === "failed")?.error,
  };
  let emailError: string | undefined;
  try {
    const email = buildReaddyConversionResultEmail({
      siteName: row.payload.siteName,
      readdyCode: row.payload.readdyCode,
      date: hongKongDateLabel(),
      framerProjectUrl: row.payload.framerProjectUrl,
      kind: result.kind,
      pages: result.pages,
      unstarted: result.unstarted,
      cancelled: result.cancelled,
      error: result.error,
      publishNote,
    });
    await sendResendEmail({
      to: READDY_CONVERSION_RESULT_TO,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `readdy-conversion/${row.project_key}/${row.id}`.slice(0, 256),
    });
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
  }
  const migrated = pages.filter((page) => page.status === "migrated").length;
  const failedCount = pages.filter((page) => page.status === "failed").length;
  const publishSuffix = publishNote ? `${publishNote}。` : "";
  const summary = emailError
    ? `完成 ${migrated} 頁、失敗 ${failedCount} 頁。${publishSuffix}結果郵件未能寄出：${emailError}`
    : `完成 ${migrated} 頁、失敗 ${failedCount} 頁。${publishSuffix}結果郵件已寄到 ${READDY_CONVERSION_RESULT_TO}`;
  await saveRun(row.id, {
    status: result.kind === "success" ? "success" : "failed",
    error: result.error ?? null,
    page_index: row.payload.pages.length,
    progress: {
      ...progress,
      emailError,
      summary,
      currentLabel: summary,
      currentPageId: null,
      leaseToken: null,
      leaseUntil: null,
    },
  });
}

async function saveRunningStep(
  id: string,
  fallbackRow: RunRow,
  patch: Record<string, unknown>,
  progress: RunProgress,
): Promise<boolean> {
  const ok = await saveRun(id, patch, { onlyIfNotCancelled: true });
  if (ok) return true;
  const latest = await loadRun(id);
  if (latest?.status === "cancelled") {
    await finishRun(latest ?? fallbackRow, progress, true);
  }
  return false;
}

async function processRun(id: string, token?: string) {
  const wakeStartedAt = Date.now();
  const row = await loadRun(id);
  if (!row || row.status === "success" || row.status === "failed") return;
  if (row.status === "cancelled") {
    await finishRun(row, { ...(row.progress || {}) }, true);
    return;
  }
  const progress: RunProgress = { ...(row.progress || {}) };
  const leaseUntil = Date.parse(progress.leaseUntil || "");
  const leaseLive = Boolean(progress.leaseToken) && Number.isFinite(leaseUntil) && leaseUntil > Date.now();
  if (leaseLive && progress.leaseToken !== token) return;
  const nextToken = token && leaseLive ? token : crypto.randomUUID();
  progress.leaseToken = nextToken;
  progress.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  progress.total = row.payload.pages.length;
  if (!(await saveRunningStep(id, row, { status: "running", progress }, progress))) {
    return;
  }

  const pages = progress.pages ?? [];
  progress.pages = pages;
  const attempts = progress.attempts ?? [];
  progress.attempts = attempts;
  let processed = 0;
  let index = row.page_index;

  while (
    processed < PAGES_PER_WAKE &&
    index < row.payload.pages.length &&
    (processed === 0 || Date.now() - wakeStartedAt < MAX_WAKE_MS)
  ) {
    const latest = await loadRun(id);
    if (!latest || latest.status === "cancelled") {
      await finishRun(latest ?? row, progress, true);
      return;
    }
    if (progress.retryAfter && Date.parse(progress.retryAfter) > Date.now()) return;

    const page = row.payload.pages[index];
    progress.currentPageId = page.id;
    progress.currentLabel = `正在轉換 ${page.path}（${index + 1}/${row.payload.pages.length}）`;
    progress.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
    if (!(await saveRunningStep(id, latest, { status: "running", page_index: index, progress }, progress))) {
      return;
    }

    try {
      let loaded: { code: string; includedFiles: string[]; repoMeta: Record<string, unknown> | null };
      if (row.payload.sourceType === "github" && row.payload.analysis.githubMeta) {
        const bundle = await callFunction("readdy-github-fetch", {
          action: "fetch_page_bundle",
          repo_url: row.payload.githubRepoUrl,
          branch: row.payload.analysis.githubMeta.branch,
          page,
          shared_files: row.payload.analysis.sharedFiles,
          all_paths: row.payload.githubAllPaths,
        });
        loaded = {
          code: String(bundle.code || ""),
          includedFiles: Array.isArray(bundle.included_files) ? bundle.included_files as string[] : [],
          repoMeta: (bundle.repo_meta as Record<string, unknown> | null) ?? null,
        };
      } else {
        const assembled = assembleReaddyPageCode(
          page as never,
          row.payload.fileMap || {},
          row.payload.analysis as never,
        );
        loaded = { code: assembled.code, includedFiles: assembled.includedFiles, repoMeta: null };
      }
      if (!loaded.code.trim() && !(row.payload.analysis as { sourceOrigin?: string }).sourceOrigin?.trim()) {
        throw new Error("這個頁面沒有可解析的代碼");
      }

      const parsed = await callFunction("readdy-parse-ir", {
        user_id: row.user_id,
        framer_project_url: row.payload.framerProjectUrl,
        source_type: row.payload.sourceType,
        github_repo_meta: loaded.repoMeta,
        storage_bundle_path: row.payload.analysis.storageBundlePath ?? null,
        grid_config: row.payload.gridConfig,
        raw_readdy_code: loaded.code,
        tailwind_config: row.payload.analysis.tailwindConfig ?? null,
        asset_url_map: row.payload.analysis.assetUrlMap ?? {},
        page_meta: {
          path: page.path,
          title: page.title,
          locale: page.locale,
          pageKind: page.pageKind,
          sourceFile: page.sourceFile,
          includedFiles: loaded.includedFiles,
        },
        css_tokens: row.payload.analysis.cssTokens,
        project_name: row.payload.siteName,
        source_origin: (row.payload.analysis as { sourceOrigin?: string }).sourceOrigin,
      });
      const sectionCount = Array.isArray((parsed.ir_payload as { sections?: unknown[] } | undefined)?.sections)
        ? ((parsed.ir_payload as { sections: unknown[] }).sections.length)
        : 0;
      if (sectionCount === 0) throw new Error("解析後沒有可寫入的區塊");

      const synced = await callFunction("framer-mcp-sync", {
        job_id: parsed.job_id,
        sync_page: true,
        framer_project_url: row.payload.framerProjectUrl,
        page_path: page.path,
        page_title: page.title,
        session_slot: 1,
        mcp_session: progress.mcpSession ?? null,
        publish: false,
      });
      progress.mcpSession = (synced.mcp_session as Record<string, unknown> | null) ?? progress.mcpSession ?? null;
      progress.retryAfter = null;
      pages[index] = {
        path: page.path,
        title: page.title,
        status: "migrated",
        sectionCount,
        pageId: page.id,
        jobId: typeof parsed.job_id === "string" ? parsed.job_id : null,
        framerPageNodeId: typeof synced.framer_page_node_id === "string" ? synced.framer_page_node_id : null,
        lastSyncedAt: new Date().toISOString(),
      };
      index += 1;
      processed += 1;
      progress.currentPageId = row.payload.pages[index]?.id ?? null;
      progress.done = pages.filter((item) => item?.status === "migrated" || item?.status === "failed").length;
      progress.currentLabel = `${page.path} 已寫入 Framer`;
      if (!(await saveRunningStep(id, row, { status: "running", page_index: index, progress }, progress))) {
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const limited = (err instanceof Error && err.name === "FramerSessionLimit") || isFramerSessionLimitError(message);
      const used = attempts[index] ?? 0;
      if (limited && used < 1) {
        attempts[index] = used + 1;
        progress.mcpSession = null;
        progress.retryAfter = new Date(Date.now() + SESSION_RETRY_MS).toISOString();
        progress.leaseUntil = progress.retryAfter;
        progress.leaseToken = null;
        progress.currentLabel = `${page.path} 已達 Framer 工作階段上限，360 秒後再試`;
        await saveRunningStep(id, row, { status: "running", page_index: index, progress }, progress);
        return;
      }
      pages[index] = {
        path: page.path,
        title: page.title,
        status: "failed",
        sectionCount: page.sectionCount ?? 0,
        error: message,
        pageId: page.id,
      };
      index += 1;
      processed += 1;
      progress.currentPageId = row.payload.pages[index]?.id ?? null;
      progress.done = pages.filter((item) => item?.status === "migrated" || item?.status === "failed").length;
      progress.currentLabel = `${page.path} 失敗：${message}`;
      if (!(await saveRunningStep(id, row, { status: "running", page_index: index, progress }, progress))) {
        return;
      }
    }
  }

  if (index >= row.payload.pages.length) {
    await finishRun({ ...row, page_index: index }, progress, false);
    return;
  }
  const latest = await loadRun(id);
  if (!latest || latest.status === "cancelled") {
    await finishRun(latest ?? row, progress, true);
    return;
  }
  const handedOff = await triggerNextWake(id, nextToken);
  if (!handedOff) {
    progress.leaseToken = null;
    progress.leaseUntil = null;
    await saveRunningStep(id, latest, { status: "running", page_index: index, progress }, progress);
  }
}

async function tick() {
  const staleBefore = new Date(Date.now() - 60_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("framer_conversion_runs")
    .select("id, progress, updated_at")
    .in("status", ["queued", "running"])
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(3);
  if (error) return jsonResponse({ error: error.message }, 500);
  const now = Date.now();
  const due = (data ?? []).filter((row) => {
    const p = (row.progress as RunProgress | null) ?? {};
    const retryAfter = Date.parse(String(p.retryAfter || ""));
    if (Number.isFinite(retryAfter) && retryAfter > now) return false;
    const leaseUntil = Date.parse(String(p.leaseUntil || ""));
    if (Boolean(p.leaseToken) && Number.isFinite(leaseUntil) && leaseUntil > now) return false;
    return true;
  });
  for (const row of due) edgeWaitUntil(processRun(String(row.id)));
  return jsonResponse({ ok: true, queued: due.length });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  try {
    if (req.method === "GET" || auth.userId === null) {
      const body = req.method === "POST"
        ? await req.json().catch(() => ({})) as {
            action?: string;
            run_id?: string;
            lease_token?: string;
          }
        : {};
      if (body?.action === "enqueue") {
        return jsonResponse({ error: "需要登入後才能開始轉換" }, 401);
      }
      if (auth.userId === null && body?.action === "continue") {
        const runId = typeof body.run_id === "string" ? body.run_id.trim() : "";
        if (!runId) return jsonResponse({ error: "缺少 run_id" }, 400);
        const leaseToken = typeof body.lease_token === "string" ? body.lease_token : undefined;
        edgeWaitUntil(processRun(runId, leaseToken));
        return jsonResponse({ ok: true, continued: runId });
      }
      return await tick();
    }

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      input?: RunRow["payload"];
      run_id?: string;
    };
    if (body.action === "cancel") {
      if (!body.run_id) return jsonResponse({ error: "缺少 run_id" }, 400);
      await saveRun(body.run_id, { status: "cancelled" });
      return jsonResponse({ ok: true });
    }
    if (body.action !== "enqueue") return jsonResponse({ error: "未知動作" }, 400);
    const input = body.input;
    if (!input?.projectKey || !Array.isArray(input.pages)) {
      return jsonResponse({ error: "缺少轉換內容" }, 400);
    }
    const { data, error } = await supabaseAdmin()
      .from("framer_conversion_runs")
      .insert({
        user_id: auth.userId,
        project_key: input.projectKey,
        status: "queued",
        payload: input,
        progress: {
          currentLabel: `準備重新解析並同步 ${input.pages.length} 個頁面`,
          currentPageId: null,
          done: 0,
          total: input.pages.length,
          pages: [],
        },
        page_index: 0,
      })
      .select("id")
      .single();
    if (error || !data?.id) return jsonResponse({ error: error?.message || "無法建立轉換佇列" }, 500);
    edgeWaitUntil(processRun(String(data.id)));
    return jsonResponse({ ok: true, run_id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
