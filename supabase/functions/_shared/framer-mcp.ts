import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const FRAMER_MCP_ENDPOINT = "https://mcp.framer.com/mcp";
export const FRAMER_OAUTH_AUTH_URL = "https://api.framer.com/auth/oauth/authorize";
export const FRAMER_OAUTH_TOKEN_URL = "https://api.framer.com/auth/oauth/token";
export const FRAMER_OAUTH_REGISTER_URL = "https://api.framer.com/auth/oauth/register";
export const FRAMER_OAUTH_SCOPE = "mcp:project";
export const FRAMER_OAUTH_ROW_ID = "default";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
export const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

export function maskSecret(secret: string | null | undefined): string {
  const s = String(secret || "").trim();
  if (!s) return "";
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function supabaseAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export function extractBearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

export async function getOptionalUserId(req: Request): Promise<string | null> {
  const token = extractBearerToken(req);
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (token === SUPABASE_ANON_KEY || token === SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): { role?: string; ref?: string; exp?: number } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad));
  } catch {
    return null;
  }
}

async function isServiceRoleJwt(token: string): Promise<boolean> {
  const payload = decodeJwtPayload(token);
  if (payload?.role !== "service_role") return false;
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
  const ref = String(payload.ref || "");
  if (ref && SUPABASE_URL && !SUPABASE_URL.includes(ref)) return false;
  if (!SUPABASE_URL) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/framer_conversion_runs?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY || token,
        Authorization: `Bearer ${token}`,
      },
    });
    await res.body?.cancel().catch(() => undefined);
    return res.ok;
  } catch {
    return false;
  }
}

/** Reject missing and anon tokens. A logged-in user returns their id. The service role returns userId null so a background worker can call these functions. */
export async function requireUser(req: Request): Promise<{ userId: string | null } | { response: Response }> {
  const token = extractBearerToken(req);
  if (!token) {
    return { response: jsonResponse({ error: "未登入或缺少授權標頭" }, 401) };
  }
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) {
    return { userId: null };
  }
  if (token === SUPABASE_ANON_KEY) {
    return { response: jsonResponse({ error: "需要登入後才能使用此功能" }, 401) };
  }
  if (await isServiceRoleJwt(token)) {
    return { userId: null };
  }
  const userId = await getOptionalUserId(req);
  if (!userId) {
    return { response: jsonResponse({ error: "登入已失效，請重新登入" }, 401) };
  }
  return { userId };
}

export function getFramerOAuthRedirectUri(): string {
  const override = (Deno.env.get("FRAMER_OAUTH_REDIRECT_URI") || "").trim();
  if (override) return override;
  const base = SUPABASE_URL.replace(/\/+$/, "");
  return base ? `${base}/functions/v1/framer-oauth` : "";
}

export const FRAMER_ACCOUNT_SESSION_KEY = "__account__";
/** Matches the observed Framer account cap of 9 active sessions. */
export const FRAMER_SYNC_SLOT_COUNT = 9;

export function normalizeFramerSessionSlot(slot: unknown): number {
  const n = Number(slot ?? 0);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, FRAMER_SYNC_SLOT_COUNT - 1);
}

export function framerAccountSessionKey(slot = 0): string {
  const n = normalizeFramerSessionSlot(slot);
  return n === 0 ? FRAMER_ACCOUNT_SESSION_KEY : `${FRAMER_ACCOUNT_SESSION_KEY}#${n}`;
}

export function framerProjectSessionKey(projectId: string, slot = 0): string {
  const key = String(projectId || "").trim();
  const n = normalizeFramerSessionSlot(slot);
  return n === 0 ? key : `${key}#${n}`;
}

function isFramerAccountSessionKey(key: string): boolean {
  return key === FRAMER_ACCOUNT_SESSION_KEY || key.startsWith(`${FRAMER_ACCOUNT_SESSION_KEY}#`);
}
/** Keep a project handle or the shared MCP transport until Framer has had time to drop it. */
export const FRAMER_SESSION_REUSE_TTL_MS = 12 * 60 * 60 * 1000;
export const FRAMER_SESSION_IDLE_TTL_MS = FRAMER_SESSION_REUSE_TTL_MS;
export const FRAMER_SESSION_PRUNE_TTL_MS = FRAMER_SESSION_REUSE_TTL_MS;
/** Framer keeps an unused MCP session counted for 360s after its last call. */
export const FRAMER_SESSION_LIMIT_COOLDOWN_MS = 360_000;

export type FramerActiveMcpSession = {
  project_id: string;
  project_url: string;
  mcp_session_id: string | null;
  project_session: string;
  opened_at: string;
  last_used_at: string;
  reopen_after?: string | null;
  blocked_until?: string | null;
};

export type FramerActiveMcpSessionsMap = Record<string, FramerActiveMcpSession>;

export type FramerConnectionRow = {
  id: string;
  client_id: string | null;
  redirect_uri: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  pending_state: string | null;
  pending_code_verifier: string | null;
  pending_expires_at: string | null;
  github_token: string | null;
  github_token_preview: string | null;
  active_mcp_sessions?: FramerActiveMcpSessionsMap | null;
  connected_at: string | null;
  last_used_at: string | null;
  updated_at: string | null;
  token_refresh_until?: string | null;
  auto_publish?: boolean | null;
};

export function isFramerSessionLimitError(message: string): boolean {
  return /active session limit|do not retry now|too many active sessions|同時開啟工作階段上限|等待至少\s*360\s*秒|等待至少\s*6\s*分鐘/i.test(
    String(message || ""),
  );
}

export function isFramerTransportStaleError(message: string): boolean {
  const msg = String(message || "");
  if (isFramerSessionLimitError(msg)) return false;
  if (/mcp-session-id|server not initialized|must initialize|no valid session|session not found/i.test(msg)) {
    return true;
  }
  return /Framer MCP\b/i.test(msg) && /HTTP\s*404/i.test(msg);
}

export function isFramerProjectSessionStaleError(message: string): boolean {
  const msg = String(message || "");
  if (isFramerSessionLimitError(msg) || isFramerTransportStaleError(msg)) return false;
  return /invalid session handle|unknown session|expired session|no longer valid|session handle/i.test(msg);
}

export function isFramerStaleSessionError(message: string): boolean {
  return isFramerTransportStaleError(message) || isFramerProjectSessionStaleError(message);
}

export function formatFramerSessionLimitError(rawDetail: string): string {
  const detail = String(rawDetail || "").trim();
  if (detail.startsWith("Framer MCP 帳號已達同時開啟工作階段上限")) return detail;
  return `Framer MCP 帳號已達同時開啟工作階段上限，請勿立即重試。請等待至少 360 秒，讓閒置工作階段釋放後再執行一次。（${detail}）`;
}

function normalizeSessionsMap(raw: unknown): FramerActiveMcpSessionsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: FramerActiveMcpSessionsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const projectSession = typeof row.project_session === "string" ? row.project_session.trim() : "";
    const lastUsedAt = typeof row.last_used_at === "string" ? row.last_used_at.trim() : "";
    const reopenAfter = typeof row.reopen_after === "string" ? row.reopen_after.trim() : "";
    const blockedUntil = typeof row.blocked_until === "string" ? row.blocked_until.trim() : "";
    const mcpSessionId = typeof row.mcp_session_id === "string" && row.mcp_session_id.trim()
      ? row.mcp_session_id.trim()
      : "";
    if (!projectSession && !reopenAfter && !blockedUntil && !mcpSessionId) continue;
    const stamp = lastUsedAt || reopenAfter || blockedUntil;
    if (!stamp) continue;
    result[key] = {
      project_id: typeof row.project_id === "string" && row.project_id.trim() ? row.project_id.trim() : key,
      project_url: typeof row.project_url === "string" ? row.project_url.trim() : "",
      mcp_session_id: mcpSessionId || null,
      project_session: projectSession,
      opened_at: typeof row.opened_at === "string" && row.opened_at.trim() ? row.opened_at.trim() : stamp,
      last_used_at: stamp,
      reopen_after: reopenAfter || null,
      blocked_until: blockedUntil || null,
    };
  }
  return result;
}

export function readCachedFramerSession(
  row: FramerConnectionRow | null,
  projectId: string,
  nowMs = Date.now(),
): FramerActiveMcpSession | null {
  const key = String(projectId || "").trim();
  if (!key || !row) return null;
  const map = normalizeSessionsMap(row.active_mcp_sessions);
  const entry = map[key];
  if (!entry?.project_session) return null;
  if (!isFramerAccountSessionKey(key) && entry.project_session === "transport") return null;
  const lastUsedMs = Date.parse(entry.last_used_at);
  if (!Number.isFinite(lastUsedMs) || nowMs - lastUsedMs >= FRAMER_SESSION_REUSE_TTL_MS) {
    return null;
  }
  return entry;
}

function futureTimestamp(value: string | null | undefined, nowMs: number): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts) || ts <= nowMs) return null;
  return ts;
}

export function getFramerSessionOpenBlock(
  row: FramerConnectionRow | null,
  projectId: string,
  nowMs = Date.now(),
  slot = 0,
): { blocked: boolean; retryAfterSeconds: number } {
  const map = normalizeSessionsMap(row?.active_mcp_sessions);
  const projectKey = framerProjectSessionKey(String(projectId || ""), slot);
  const untils = [
    futureTimestamp(map[FRAMER_ACCOUNT_SESSION_KEY]?.blocked_until, nowMs),
    futureTimestamp(map[framerAccountSessionKey(slot)]?.blocked_until, nowMs),
    futureTimestamp(map[projectKey]?.reopen_after, nowMs),
  ].filter((ts): ts is number => ts !== null);
  if (untils.length === 0) return { blocked: false, retryAfterSeconds: 0 };
  const until = Math.max(...untils);
  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((until - nowMs) / 1000)) };
}

function splitFramerSessionKey(key: string): { slot: number; projectKey: string } {
  const match = key.match(/#(\d+)$/);
  if (!match) return { slot: 0, projectKey: key };
  return { slot: Number(match[1]), projectKey: key.slice(0, -match[0].length) };
}

function sessionKeyFromRow(slot: number, projectKey: string): string {
  return slot === 0 ? projectKey : `${projectKey}#${slot}`;
}

function isMissingSessionTable(message: string): boolean {
  return /framer_mcp_sessions|schema cache|does not exist|42P01/i.test(message);
}

async function upsertFramerMcpSessionRow(
  supabase: SupabaseClient,
  key: string,
  entry: FramerActiveMcpSession,
): Promise<boolean> {
  const { slot, projectKey } = splitFramerSessionKey(key);
  const { error } = await supabase.from("framer_mcp_sessions").upsert(
    {
      slot,
      project_key: projectKey,
      project_id: entry.project_id,
      project_url: entry.project_url,
      mcp_session_id: entry.mcp_session_id,
      project_session: entry.project_session,
      opened_at: entry.opened_at,
      last_used_at: entry.last_used_at,
      reopen_after: entry.reopen_after ?? null,
      blocked_until: entry.blocked_until ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slot,project_key" },
  );
  if (!error) return true;
  if (isMissingSessionTable(error.message)) return false;
  throw new Error(`儲存 framer_mcp_sessions 失敗: ${error.message}`);
}

export async function saveCachedFramerSession(
  supabase: SupabaseClient,
  projectId: string,
  entry: FramerActiveMcpSession,
): Promise<void> {
  const key = String(projectId || "").trim();
  if (!key) return;
  if (await upsertFramerMcpSessionRow(supabase, key, entry)) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await loadFramerConnection(supabase);
    const map = normalizeSessionsMap(latest?.active_mcp_sessions);
    const nowMs = Date.now();
    const next: FramerActiveMcpSessionsMap = {};
    for (const [k, existing] of Object.entries(map)) {
      const lastUsedMs = Date.parse(existing.last_used_at);
      const recent = Number.isFinite(lastUsedMs) && nowMs - lastUsedMs < FRAMER_SESSION_PRUNE_TTL_MS;
      const waiting = futureTimestamp(existing.reopen_after, nowMs) !== null ||
        futureTimestamp(existing.blocked_until, nowMs) !== null;
      if (recent || waiting || (isFramerAccountSessionKey(k) && existing.mcp_session_id)) {
        next[k] = existing;
      }
    }
    next[key] = entry;
    const stamp = latest?.updated_at ?? null;
    if (!stamp) {
      await upsertFramerConnection(supabase, {
        active_mcp_sessions: next,
        last_used_at: entry.last_used_at,
      });
      return;
    }
    const { data, error } = await supabase
      .from("framer_oauth_connections")
      .update({
        active_mcp_sessions: next,
        last_used_at: entry.last_used_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", FRAMER_OAUTH_ROW_ID)
      .eq("updated_at", stamp)
      .select("id");
    if (error) throw new Error(`儲存 framer_oauth_connections 失敗: ${error.message}`);
    if (Array.isArray(data) && data.length > 0) return;
  }
  throw new Error("儲存 Framer 工作階段失敗，請再試一次。");
}

export async function clearCachedFramerSession(
  supabase: SupabaseClient,
  projectId: string,
): Promise<void> {
  const key = String(projectId || "").trim();
  if (!key) return;
  const { slot, projectKey } = splitFramerSessionKey(key);
  const { error } = await supabase
    .from("framer_mcp_sessions")
    .delete()
    .eq("slot", slot)
    .eq("project_key", projectKey);
  if (!error) return;
  if (!isMissingSessionTable(error.message)) {
    throw new Error(`清除 framer_mcp_sessions 失敗: ${error.message}`);
  }
  const latest = await loadFramerConnection(supabase);
  const map = normalizeSessionsMap(latest?.active_mcp_sessions);
  if (!(key in map)) return;
  const next: FramerActiveMcpSessionsMap = { ...map };
  delete next[key];
  await upsertFramerConnection(supabase, {
    active_mcp_sessions: next,
  });
}

export async function markFramerSessionLimit(
  supabase: SupabaseClient,
  nowMs = Date.now(),
): Promise<void> {
  const latest = await loadFramerConnection(supabase);
  const existing = normalizeSessionsMap(latest?.active_mcp_sessions)[FRAMER_ACCOUNT_SESSION_KEY];
  const nowIso = new Date(nowMs).toISOString();
  await saveCachedFramerSession(supabase, FRAMER_ACCOUNT_SESSION_KEY, {
    project_id: FRAMER_ACCOUNT_SESSION_KEY,
    project_url: "",
    mcp_session_id: existing?.mcp_session_id ?? null,
    project_session: existing?.project_session || "transport",
    opened_at: existing?.opened_at || nowIso,
    last_used_at: nowIso,
    reopen_after: existing?.reopen_after ?? null,
    blocked_until: new Date(nowMs + FRAMER_SESSION_LIMIT_COOLDOWN_MS).toISOString(),
  });
}

export async function blockFramerProjectReopen(
  supabase: SupabaseClient,
  projectId: string,
  projectUrl: string,
  nowMs = Date.now(),
  slot = 0,
): Promise<void> {
  const projectKey = framerProjectSessionKey(projectId, slot);
  if (!projectKey) return;
  const key = projectKey;
  const nowIso = new Date(nowMs).toISOString();
  await saveCachedFramerSession(supabase, key, {
    project_id: String(projectId || "").trim() || key,
    project_url: projectUrl,
    mcp_session_id: null,
    project_session: "",
    opened_at: nowIso,
    last_used_at: nowIso,
    reopen_after: new Date(nowMs + FRAMER_SESSION_LIMIT_COOLDOWN_MS).toISOString(),
    blocked_until: null,
  });
}

async function rememberSharedFramerTransport(
  supabase: SupabaseClient,
  sessionId: string | null,
  slot = 0,
): Promise<void> {
  const accountKey = framerAccountSessionKey(slot);
  const nowMs = Date.now();
  const latest = await loadFramerConnection(supabase);
  const existing = normalizeSessionsMap(latest?.active_mcp_sessions)[accountKey];
  const nowIso = new Date(nowMs).toISOString();
  const blockedUntil = futureTimestamp(existing?.blocked_until, nowMs) ? existing?.blocked_until ?? null : null;
  await saveCachedFramerSession(supabase, accountKey, {
    project_id: accountKey,
    project_url: "",
    mcp_session_id: sessionId,
    project_session: "transport",
    opened_at: existing?.opened_at || nowIso,
    last_used_at: nowIso,
    reopen_after: null,
    blocked_until: blockedUntil,
  });
}

export async function connectSharedFramerMcp(
  supabase: SupabaseClient,
  accessToken: string,
  row: FramerConnectionRow | null,
  slot = 0,
): Promise<FramerMcpClient> {
  const accountKey = framerAccountSessionKey(slot);
  const cached = readCachedFramerSession(row, accountKey);
  if (cached?.mcp_session_id) {
    return new FramerMcpClient(accessToken, cached.mcp_session_id);
  }
  const gate = getFramerSessionOpenBlock(row, accountKey, Date.now(), slot);
  if (gate.blocked) {
    throw new Error(formatFramerSessionLimitError(`retry after ${gate.retryAfterSeconds}s`));
  }
  const client = new FramerMcpClient(accessToken);
  try {
    await client.initialize();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isFramerSessionLimitError(msg)) {
      await markFramerSessionLimit(supabase);
      throw new Error(formatFramerSessionLimitError(msg));
    }
    throw error;
  }
  await rememberSharedFramerTransport(supabase, client.getSessionId(), slot);
  return client;
}

export async function replaceSharedFramerTransport(
  supabase: SupabaseClient,
  accessToken: string,
  slot = 0,
): Promise<FramerMcpClient> {
  const latest = await loadFramerConnection(supabase);
  const gate = getFramerSessionOpenBlock(latest, framerAccountSessionKey(slot), Date.now(), slot);
  if (gate.blocked) {
    throw new Error(formatFramerSessionLimitError(`retry after ${gate.retryAfterSeconds}s`));
  }
  await rememberSharedFramerTransport(supabase, null, slot);
  const client = new FramerMcpClient(accessToken);
  try {
    await client.initialize();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isFramerSessionLimitError(msg)) {
      await markFramerSessionLimit(supabase);
      throw new Error(formatFramerSessionLimitError(msg));
    }
    throw error;
  }
  await rememberSharedFramerTransport(supabase, client.getSessionId(), slot);
  return client;
}

const FRAMER_TRANSPORT_TOUCH_MS = 60_000;

export async function touchSharedFramerTransport(
  supabase: SupabaseClient,
  sessionId: string | null,
  slot = 0,
): Promise<void> {
  if (!sessionId) return;
  const accountKey = framerAccountSessionKey(slot);
  const latest = await loadFramerConnection(supabase);
  const existing = normalizeSessionsMap(latest?.active_mcp_sessions)[accountKey];
  const lastUsedMs = existing ? Date.parse(existing.last_used_at) : NaN;
  if (
    existing?.mcp_session_id === sessionId &&
    Number.isFinite(lastUsedMs) &&
    Date.now() - lastUsedMs < FRAMER_TRANSPORT_TOUCH_MS
  ) {
    return;
  }
  await rememberSharedFramerTransport(supabase, sessionId, slot);
}

export async function loadFramerConnection(
  supabase: SupabaseClient,
): Promise<FramerConnectionRow | null> {
  const { data, error } = await supabase
    .from("framer_oauth_connections")
    .select("*")
    .eq("id", FRAMER_OAUTH_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`讀取 framer_oauth_connections 失敗: ${error.message}`);
  const row = (data as FramerConnectionRow | null) ?? null;
  if (!row) return null;
  const { data: sessions, error: sessionError } = await supabase
    .from("framer_mcp_sessions")
    .select("slot, project_key, project_id, project_url, mcp_session_id, project_session, opened_at, last_used_at, reopen_after, blocked_until");
  if (sessionError) {
    if (isMissingSessionTable(sessionError.message)) return row;
    throw new Error(`讀取 framer_mcp_sessions 失敗: ${sessionError.message}`);
  }
  const map: FramerActiveMcpSessionsMap = {};
  for (const item of sessions ?? []) {
    const projectKey = String(item.project_key || "");
    const slot = Number(item.slot) || 0;
    const sessionKey = sessionKeyFromRow(slot, projectKey);
    const stamp = String(item.last_used_at || item.opened_at || "");
    if (!sessionKey || !stamp) continue;
    map[sessionKey] = {
      project_id: String(item.project_id || projectKey),
      project_url: String(item.project_url || ""),
      mcp_session_id: item.mcp_session_id ? String(item.mcp_session_id) : null,
      project_session: String(item.project_session || ""),
      opened_at: String(item.opened_at || stamp),
      last_used_at: stamp,
      reopen_after: item.reopen_after ? String(item.reopen_after) : null,
      blocked_until: item.blocked_until ? String(item.blocked_until) : null,
    };
  }
  row.active_mcp_sessions = map;
  return row;
}

export async function upsertFramerConnection(
  supabase: SupabaseClient,
  patch: Partial<FramerConnectionRow>,
): Promise<void> {
  const { error } = await supabase
    .from("framer_oauth_connections")
    .upsert(
      {
        id: FRAMER_OAUTH_ROW_ID,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  if (error) throw new Error(`儲存 framer_oauth_connections 失敗: ${error.message}`);
}

function framerAccessTokenIsFresh(row: FramerConnectionRow | null): boolean {
  if (!row?.access_token) return false;
  const expiresMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  return !expiresMs || expiresMs - Date.now() > 60_000;
}

/** null means the claim function is not deployed yet, so the caller refreshes directly. */
async function claimFramerTokenRefresh(supabase: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("claim_framer_token_refresh", {
    claim_until: new Date(Date.now() + 20_000).toISOString(),
  });
  if (error) {
    if (/claim_framer_token_refresh|PGRST202|schema cache|does not exist/i.test(error.message)) {
      return null;
    }
    throw new Error(`無法鎖定 Framer Token 續期: ${error.message}`);
  }
  return Boolean(data);
}

async function clearFramerTokenRefreshClaim(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from("framer_oauth_connections")
    .update({ token_refresh_until: null, updated_at: new Date().toISOString() })
    .eq("id", FRAMER_OAUTH_ROW_ID);
  if (error && !/token_refresh_until|schema cache|PGRST204|does not exist/i.test(error.message)) {
    throw new Error(`清除 Framer Token 續期鎖失敗: ${error.message}`);
  }
}

async function refreshFramerAccessToken(
  supabase: SupabaseClient,
  row: FramerConnectionRow,
  clearClaim: boolean,
): Promise<{ accessToken: string; row: FramerConnectionRow }> {
  if (!row.refresh_token || !row.client_id) {
    throw new Error("Framer MCP 授權已過期且缺少 refresh_token，請重新點擊「mcp.framer.com」授權。");
  }

  const res = await fetch(FRAMER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: row.client_id,
      resource: FRAMER_MCP_ENDPOINT,
    }),
  });

  const payload = await res.json().catch(() => ({})) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !payload.access_token) {
    const msg = payload.error_description || payload.error || `HTTP ${res.status}`;
    throw new Error(`Framer Token 續期失敗（${msg}），請重新授權。`);
  }

  const nextExpiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  await upsertFramerConnection(supabase, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || row.refresh_token,
    token_type: payload.token_type || row.token_type || "Bearer",
    scope: payload.scope || row.scope || FRAMER_OAUTH_SCOPE,
    expires_at: nextExpiresAt,
    last_used_at: new Date().toISOString(),
    ...(clearClaim ? { token_refresh_until: null } : {}),
  });

  return {
    accessToken: payload.access_token,
    row: {
      ...row,
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || row.refresh_token,
      expires_at: nextExpiresAt,
      token_refresh_until: clearClaim ? null : row.token_refresh_until,
    },
  };
}

export async function getValidFramerAccessToken(
  supabase: SupabaseClient,
): Promise<{ accessToken: string; row: FramerConnectionRow }> {
  const row = await loadFramerConnection(supabase);
  if (!row || (!row.access_token && !row.refresh_token)) {
    throw new Error("尚未連接 Framer MCP，請先點擊右上角「mcp.framer.com」完成授權。");
  }
  if (framerAccessTokenIsFresh(row) && row.access_token) {
    return { accessToken: row.access_token, row };
  }

  for (let round = 0; round < 8; round++) {
    const current = round === 0 ? row : await loadFramerConnection(supabase);
    if (!current || (!current.access_token && !current.refresh_token)) {
      throw new Error("尚未連接 Framer MCP，請先點擊右上角「mcp.framer.com」完成授權。");
    }
    if (framerAccessTokenIsFresh(current) && current.access_token) {
      return { accessToken: current.access_token, row: current };
    }

    const claimed = await claimFramerTokenRefresh(supabase);
    if (claimed === null || claimed) {
      try {
        return await refreshFramerAccessToken(supabase, current, claimed === true);
      } catch (error) {
        if (claimed) await clearFramerTokenRefreshClaim(supabase).catch(() => undefined);
        throw error;
      }
    }

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const latest = await loadFramerConnection(supabase);
      if (latest && framerAccessTokenIsFresh(latest) && latest.access_token) {
        return { accessToken: latest.access_token, row: latest };
      }
      const until = latest?.token_refresh_until ? Date.parse(latest.token_refresh_until) : 0;
      if (!until || until <= Date.now()) break;
    }
  }

  throw new Error("Framer Token 續期進行中，請稍後再試一次。");
}

export type McpToolInfo = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export class FramerMcpClient {
  private accessToken: string;
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(accessToken: string, initialSessionId?: string | null) {
    this.accessToken = accessToken;
    this.sessionId = initialSessionId?.trim() || null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async close(): Promise<void> {
    const sessionId = this.sessionId;
    this.sessionId = null;
    if (!sessionId) return;
    try {
      await fetch(FRAMER_MCP_ENDPOINT, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Mcp-Session-Id": sessionId,
        },
      });
    } catch {
      // Best-effort MCP transport close; ignore network or unsupported DELETE errors.
    }
  }

  private async postJsonRpc(
    method: string,
    params?: Record<string, unknown>,
    isNotification = false,
  ): Promise<unknown> {
    const id = isNotification ? undefined : this.nextId++;
    const body = isNotification
      ? { jsonrpc: "2.0", method, ...(params ? { params } : {}) }
      : { jsonrpc: "2.0", id, method, params: params ?? {} };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const res = await fetch(FRAMER_MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const respSession = res.headers.get("mcp-session-id") || res.headers.get("Mcp-Session-Id");
    if (respSession) {
      this.sessionId = respSession;
    }

    if (isNotification) {
      if (!res.ok && res.status !== 202 && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(`MCP notification ${method} failed (${res.status}): ${text}`);
      }
      return null;
    }

    const contentType = res.headers.get("content-type") || "";
    const rawText = await res.text();

    if (!res.ok) {
      throw new Error(`Framer MCP ${method} HTTP ${res.status}: ${rawText.slice(0, 400)}`);
    }

    let parsed: Record<string, unknown> | null = null;
    if (contentType.includes("text/event-stream")) {
      const lines = rawText.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonPart = trimmed.slice(5).trim();
        if (!jsonPart || jsonPart === "[DONE]") continue;
        try {
          const candidate = JSON.parse(jsonPart) as Record<string, unknown>;
          if (candidate.id === id || "result" in candidate || "error" in candidate) {
            parsed = candidate;
          }
        } catch {
          // ignore non-json SSE keepalive lines
        }
      }
    } else {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    }

    if (!parsed) {
      throw new Error(`Framer MCP ${method} 回傳格式無法解析: ${rawText.slice(0, 250)}`);
    }

    if (parsed.error && typeof parsed.error === "object") {
      const errObj = parsed.error as { code?: unknown; message?: unknown; data?: unknown };
      throw new Error(
        `MCP Error (${errObj.code ?? "unknown"}): ${errObj.message ?? JSON.stringify(errObj)}`,
      );
    }

    return parsed.result;
  }

  async initialize(): Promise<unknown> {
    const result = await this.postJsonRpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "MPS-Readdy-Framer-Workbench",
        version: "1.2.0",
      },
    });
    await this.postJsonRpc("notifications/initialized", undefined, true).catch(() => null);
    return result;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.postJsonRpc("tools/list", {})) as {
      tools?: McpToolInfo[];
    } | null;
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.postJsonRpc("tools/call", {
      name,
      arguments: args,
    });
  }
}
