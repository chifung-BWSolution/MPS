import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  can,
  resolveInternalRole,
} from "../../../src/lib/contentPermissions.ts";
import type { ContentAction } from "../../../src/lib/contentTypes.ts";

/**
 * content-* Edge Functions 共用的輸入輸出、身分與權限。
 *
 * 共通契約（PRD §7.1）：
 *   - 入口先驗 JWT；cron 以 service_role 呼叫
 *   - 每次寫入前重算角色權限，不信任前端
 *   - 回應一律 `{ ok, data }` / `{ ok: false, code, error }`
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
export const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

export function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function okJson(data: unknown, status = 200): Response {
  return json(status, { ok: true, data });
}

export function failJson(
  status: number,
  code: string,
  error: string,
  details?: unknown,
): Response {
  return json(status, {
    ok: false,
    code,
    error,
    ...(details === undefined ? {} : { details }),
  });
}

/** OPTIONS + POST 守門；回傳非 null 代表請求已處理完畢 */
export function guardMethod(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return failJson(405, "method_not_allowed", "Method not allowed");
  }
  return null;
}

export async function readBody<T extends Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const parsed = await req.json();
    return (parsed && typeof parsed === "object" ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}

export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

/** 由 JWT payload 判斷是否 service_role（不必遠端驗證） */
export function isServiceRoleToken(token: string): boolean {
  if (!token) return false;
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized)) as { role?: string };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

export function serviceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or service role key");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export function userClient(token: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or anon key");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export interface ContentActor {
  kind: "user" | "service";
  /** users.id（uuid）；service 呼叫為 null */
  userId: string | null;
  authUserId: string | null;
  role: string;
  displayName: string | null;
  email: string | null;
}

export interface RequireActorResult {
  actor?: ContentActor;
  response?: Response;
}

/**
 * 遠端 users 表的欄位集在不同環境並不一致（本專案 production 只有
 * id / role_tag / email / staff_id / auth_user_id，沒有 classification / display_name）。
 * 因此查詢採「完整 → 最小」兩段式：欄位不存在（42703 / PGRST204）時自動退回最小欄位，
 * 其他錯誤一律往上拋，避免把「查詢壞掉」偽裝成「沒有權限」。
 */
interface UserRoleRow {
  id: string;
  role_tag: string | null;
  email: string | null;
  auth_user_id?: string | null;
  classification?: string | null;
  display_name?: string | null;
}

const USER_SELECT_FULL = "id, role_tag, email, staff_id, auth_user_id, classification, display_name";
const USER_SELECT_MINIMAL = "id, role_tag, email, staff_id, auth_user_id";

async function selectUserRow(
  admin: ReturnType<typeof serviceClient>,
  filter: { column: "auth_user_id" | "email"; value: string; ilike?: boolean },
): Promise<UserRoleRow | null> {
  let lastError: unknown = null;

  for (const columns of [USER_SELECT_FULL, USER_SELECT_MINIMAL]) {
    const base = admin.from("users").select(columns);
    const query = filter.ilike
      ? base.ilike(filter.column, filter.value)
      : base.eq(filter.column, filter.value);
    const { data, error } = await query.maybeSingle();

    if (!error) return (data as UserRoleRow | null) ?? null;
    lastError = error;

    const message = String((error as { message?: string }).message || "");
    // 欄位不存在 → 換最小欄位再試；其他錯誤（網路、權限、RLS…）直接拋
    if (!/42703|PGRST204|column .* does not exist/i.test(message)) {
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(dbError(lastError));
}

/**
 * 驗 JWT 並解析出內部角色。
 * - service_role：cron / worker 內部呼叫，視為 management（完整權限）
 * - 一般使用者：以 users.auth_user_id → users.role_tag 映射，查不到時 fallback email
 */
export async function requireActor(req: Request): Promise<RequireActorResult> {
  const token = bearerToken(req);
  if (!token) {
    return { response: failJson(401, "invalid_session", "Missing authorization") };
  }

  if (isServiceRoleToken(token)) {
    return {
      actor: {
        kind: "service",
        userId: null,
        authUserId: null,
        role: "management",
        displayName: "service",
        email: null,
      },
    };
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { response: failJson(500, "config_missing", "Missing Supabase auth configuration") };
  }

  const admin = serviceClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { response: failJson(401, "invalid_session", "Invalid session") };
  }

  const email = (data.user.email || "").toLowerCase() || null;

  let row: UserRoleRow | null = null;
  try {
    row = await selectUserRow(admin, { column: "auth_user_id", value: data.user.id });
    if (!row && email) {
      row = await selectUserRow(admin, { column: "email", value: email, ilike: true });
    }
  } catch (lookupError) {
    // 不要讓「查不到角色」看起來像「沒有權限」——保留可診斷的錯誤。
    return {
      response: failJson(
        500,
        "identity_lookup_failed",
        `無法查詢使用者角色：${dbError(lookupError)}`,
      ),
    };
  }

  const role = resolveInternalRole(row?.role_tag ?? null, row?.classification ?? null);
  return {
    actor: {
      kind: "user",
      userId: row?.id ?? null,
      authUserId: data.user.id,
      role,
      displayName: row?.display_name ?? null,
      email: email ?? row?.email ?? null,
    },
  };
}

/** 權限守門；回傳非 null 代表 403 */
export function requireAction(actor: ContentActor, action: ContentAction): Response | null {
  if (can({ role: actor.role }, action)) return null;
  return failJson(403, "forbidden", `目前角色（${actor.role}）沒有「${action}」權限`);
}

/** 只有 cron / 內部任務可以呼叫（content-worker 的 enqueue 與 tick） */
export function requireServiceRole(req: Request): Response | null {
  return isServiceRoleToken(bearerToken(req))
    ? null
    : failJson(403, "forbidden", "需要 service_role 才能呼叫此操作");
}

/** actor → users.id（寫入 published_logs.actor_id 用） */
export function actorUserId(actor: ContentActor): string | null {
  return actor.userId;
}

/** 排除 PostgREST 的 count/§ 標頭噪音，集中錯誤訊息 */
export function dbError(error: unknown): string {
  const shape = error as { message?: string; details?: string; hint?: string };
  return [shape?.message, shape?.details, shape?.hint].filter(Boolean).join(' · ') || "資料庫操作失敗";
}
