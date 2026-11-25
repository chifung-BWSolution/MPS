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

export function getFramerOAuthRedirectUri(): string {
  const override = (Deno.env.get("FRAMER_OAUTH_REDIRECT_URI") || "").trim();
  if (override) return override;
  const base = SUPABASE_URL.replace(/\/+$/, "");
  return base ? `${base}/functions/v1/framer-oauth` : "";
}

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
  connected_at: string | null;
  last_used_at: string | null;
  updated_at: string | null;
};

export async function loadFramerConnection(
  supabase: SupabaseClient,
): Promise<FramerConnectionRow | null> {
  const { data, error } = await supabase
    .from("framer_oauth_connections")
    .select("*")
    .eq("id", FRAMER_OAUTH_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`讀取 framer_oauth_connections 失敗: ${error.message}`);
  return (data as FramerConnectionRow | null) ?? null;
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

export async function getValidFramerAccessToken(
  supabase: SupabaseClient,
): Promise<{ accessToken: string; row: FramerConnectionRow }> {
  const row = await loadFramerConnection(supabase);
  if (!row || (!row.access_token && !row.refresh_token)) {
    throw new Error("尚未連接 Framer MCP，請先點擊右上角「mcp.framer.com」完成授權。");
  }

  const expiresMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  const isFresh = Boolean(row.access_token) && (!expiresMs || expiresMs - Date.now() > 60_000);
  if (isFresh && row.access_token) {
    return { accessToken: row.access_token, row };
  }

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
  });

  return {
    accessToken: payload.access_token,
    row: {
      ...row,
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || row.refresh_token,
      expires_at: nextExpiresAt,
    },
  };
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

  constructor(accessToken: string) {
    this.accessToken = accessToken;
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
