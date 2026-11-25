import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  FRAMER_MCP_ENDPOINT,
  FRAMER_OAUTH_AUTH_URL,
  FRAMER_OAUTH_REGISTER_URL,
  FRAMER_OAUTH_SCOPE,
  FRAMER_OAUTH_TOKEN_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  corsHeaders,
  extractBearerToken,
  getFramerOAuthRedirectUri,
  jsonResponse,
  loadFramerConnection,
  maskSecret,
  supabaseAdmin,
  upsertFramerConnection,
} from "../_shared/framer-mcp.ts";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64UrlToString(b64u: string): string {
  const padded = b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(digest));
}

function sanitizeReturnOrigin(raw?: string | null): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const isHttps = u.protocol === "https:";
    const isLocal =
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    if (!isHttps && !isLocal) return null;
    return u.origin;
  } catch {
    return null;
  }
}

function stateSecret(): string {
  return SUPABASE_SERVICE_ROLE_KEY || Deno.env.get("SUPABASE_ANON_KEY") || "mps-framer-oauth";
}

async function hmacSign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(stateSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(sig));
}

async function createSignedState(returnOrigin: string | null): Promise<string> {
  const payloadObj = {
    nonce: crypto.randomUUID(),
    exp: Date.now() + 15 * 60 * 1000,
    ...(returnOrigin ? { origin: returnOrigin } : {}),
  };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  return `${encoded}.${await hmacSign(encoded)}`;
}

async function verifySignedState(
  state: string,
): Promise<{ valid: boolean; origin: string | null }> {
  const parts = String(state || "").split(".");
  if (parts.length !== 2) return { valid: false, origin: null };
  const [encoded, sig] = parts;
  if (!encoded || !sig) return { valid: false, origin: null };
  const expected = await hmacSign(encoded);
  if (sig !== expected) return { valid: false, origin: null };

  try {
    const parsed = JSON.parse(fromBase64UrlToString(encoded)) as {
      nonce?: string;
      exp?: number;
      origin?: string;
    };
    if (!parsed.nonce || !Number.isFinite(parsed.exp) || Date.now() > Number(parsed.exp)) {
      return { valid: false, origin: null };
    }
    return {
      valid: true,
      origin: sanitizeReturnOrigin(parsed.origin),
    };
  } catch {
    return { valid: false, origin: null };
  }
}

function callbackResponse(
  ok: boolean,
  message: string,
  returnOrigin: string | null,
  status = 200,
): Response {
  if (returnOrigin) {
    const target = `${returnOrigin}/framer-oauth-callback?ok=${ok ? "1" : "0"}&message=${encodeURIComponent(message)}`;
    return Response.redirect(target, 302);
  }
  return new Response(
    `${ok ? "Framer MCP 授權成功" : "Framer MCP 授權失敗"}\n\n${message}\n\n請關閉此視窗並回到 MPS 頁面重新整理狀態。`,
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}

async function ensureClientRegistered(redirectUri: string): Promise<string> {
  const supabase = supabaseAdmin();
  const existing = await loadFramerConnection(supabase);
  if (
    existing?.client_id &&
    existing.redirect_uri === redirectUri &&
    (existing.access_token || existing.refresh_token)
  ) {
    return existing.client_id;
  }

  const res = await fetch(FRAMER_OAUTH_REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "MPS Readdy to Framer Workbench",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: FRAMER_OAUTH_SCOPE,
    }),
  });

  const payload = await res.json().catch(() => ({})) as {
    client_id?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !payload.client_id) {
    const detail = payload.error_description || payload.error || `HTTP ${res.status}`;
    throw new Error(`Framer OAuth 動態註冊失敗：${detail}`);
  }

  await upsertFramerConnection(supabase, {
    client_id: payload.client_id,
    redirect_uri: redirectUri,
  });

  return payload.client_id;
}

async function buildAuthorizationUrl(
  returnOrigin: string | null = null,
): Promise<{ authorization_url: string; redirect_uri: string }> {
  const redirectUri = getFramerOAuthRedirectUri();
  if (!redirectUri) {
    throw new Error("缺少 SUPABASE_URL，無法建立 Framer OAuth redirect URI。");
  }

  const clientId = await ensureClientRegistered(redirectUri);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = await createSignedState(returnOrigin);
  const pendingExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const supabase = supabaseAdmin();
  await upsertFramerConnection(supabase, {
    client_id: clientId,
    redirect_uri: redirectUri,
    pending_state: state,
    pending_code_verifier: codeVerifier,
    pending_expires_at: pendingExpiresAt,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: FRAMER_OAUTH_SCOPE,
    resource: FRAMER_MCP_ENDPOINT,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    authorization_url: `${FRAMER_OAUTH_AUTH_URL}?${params.toString()}`,
    redirect_uri: redirectUri,
  };
}

async function handleOAuthCallback(reqUrl: URL): Promise<Response> {
  const state = reqUrl.searchParams.get("state") || "";
  const stateCheck = await verifySignedState(state);
  const returnOrigin = stateCheck.origin;

  const errorParam = reqUrl.searchParams.get("error");
  if (errorParam) {
    const desc = reqUrl.searchParams.get("error_description") || errorParam;
    return callbackResponse(false, `Framer 拒絕授權：${desc}`, returnOrigin, 400);
  }

  const code = reqUrl.searchParams.get("code") || "";
  if (!code || !stateCheck.valid) {
    return callbackResponse(
      false,
      "授權 state 無效或已過期，請回到 MPS 重新點擊授權。",
      returnOrigin,
      400,
    );
  }

  const supabase = supabaseAdmin();
  const row = await loadFramerConnection(supabase);
  if (!row || row.pending_state !== state || !row.pending_code_verifier || !row.client_id) {
    return callbackResponse(
      false,
      "找不到對應的授權工作階段（PKCE verifier 遺失），請重試。",
      returnOrigin,
      400,
    );
  }

  if (row.pending_expires_at && Date.now() > Date.parse(row.pending_expires_at)) {
    return callbackResponse(false, "本次授權請求已超時，請回到 MPS 再試一次。", returnOrigin, 400);
  }

  const redirectUri = row.redirect_uri || getFramerOAuthRedirectUri();
  const tokenRes = await fetch(FRAMER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: row.client_id,
      code_verifier: row.pending_code_verifier,
      resource: FRAMER_MCP_ENDPOINT,
    }),
  });

  const payload = await tokenRes.json().catch(() => ({})) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || `HTTP ${tokenRes.status}`;
    return callbackResponse(false, `交換 Framer Token 失敗：${detail}`, returnOrigin, 400);
  }

  const nowIso = new Date().toISOString();
  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  await upsertFramerConnection(supabase, {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || row.refresh_token,
    token_type: payload.token_type || "Bearer",
    scope: payload.scope || FRAMER_OAUTH_SCOPE,
    expires_at: expiresAt,
    connected_at: nowIso,
    last_used_at: nowIso,
    pending_state: null,
    pending_code_verifier: null,
    pending_expires_at: null,
  });

  return callbackResponse(
    true,
    "已成功授權團隊共用的 Framer MCP 帳號，現在可以同步頁面到 Framer。",
    returnOrigin,
  );
}

async function buildStatusResponse() {
  const supabase = supabaseAdmin();
  const row = await loadFramerConnection(supabase);
  const envGithub = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const dbGithub = (row?.github_token || "").trim();
  const githubConfigured = Boolean(dbGithub || envGithub);
  const githubPreview = dbGithub
    ? row?.github_token_preview || maskSecret(dbGithub)
    : envGithub
      ? maskSecret(envGithub)
      : "";

  return {
    connected: Boolean(row?.access_token || row?.refresh_token),
    token_preview: maskSecret(row?.access_token || row?.refresh_token),
    expires_at: row?.expires_at || null,
    connected_at: row?.connected_at || null,
    last_used_at: row?.last_used_at || null,
    redirect_uri: getFramerOAuthRedirectUri(),
    client_id: row?.client_id || null,
    github_configured: githubConfigured,
    github_token_preview: githubPreview,
    github_source: dbGithub ? "stored" : envGithub ? "env" : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);

  if (req.method === "GET") {
    if (reqUrl.searchParams.get("action") === "start") {
      const origin = sanitizeReturnOrigin(reqUrl.searchParams.get("return_origin"));
      try {
        const { authorization_url } = await buildAuthorizationUrl(origin);
        return Response.redirect(authorization_url, 302);
      } catch (err) {
        return callbackResponse(
          false,
          err instanceof Error ? err.message : String(err),
          origin,
          500,
        );
      }
    }
    return handleOAuthCallback(reqUrl);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!extractBearerToken(req)) {
    return jsonResponse({ error: "未提供授權標頭" }, 401);
  }

  let body: { action?: string; token?: string; return_origin?: string } = {};
  try {
    body = (await req.json()) as { action?: string; token?: string; return_origin?: string };
  } catch {
    body = {};
  }

  const action = String(body.action || "status");

  try {
    if (action === "status") {
      return jsonResponse(await buildStatusResponse());
    }

    if (action === "start") {
      const origin = sanitizeReturnOrigin(body.return_origin);
      return jsonResponse(await buildAuthorizationUrl(origin));
    }

    if (action === "disconnect") {
      const supabase = supabaseAdmin();
      await upsertFramerConnection(supabase, {
        access_token: null,
        refresh_token: null,
        expires_at: null,
        connected_at: null,
        pending_state: null,
        pending_code_verifier: null,
        pending_expires_at: null,
      });
      return jsonResponse({ ok: true, ...(await buildStatusResponse()) });
    }

    if (action === "save_github_token") {
      const rawToken = String(body.token || "").trim();
      const supabase = supabaseAdmin();

      if (!rawToken) {
        await upsertFramerConnection(supabase, {
          github_token: null,
          github_token_preview: null,
        });
        return jsonResponse({ ok: true, github_login: null, ...(await buildStatusResponse()) });
      }

      // Verify token with GitHub API so user gets immediate feedback on typos/expiry
      const ghRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${rawToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "MPS-Readdy-Framer-Workbench",
        },
      });
      if (!ghRes.ok) {
        const ghText = await ghRes.text().catch(() => "");
        return jsonResponse(
          {
            error: `GitHub Token 驗證失敗（HTTP ${ghRes.status}），請確認 PAT 是否有效且包含 Contents Read 權限。${ghText.slice(0, 120)}`,
          },
          400,
        );
      }
      const ghUser = (await ghRes.json().catch(() => ({}))) as { login?: string };

      await upsertFramerConnection(supabase, {
        github_token: rawToken,
        github_token_preview: maskSecret(rawToken),
      });

      return jsonResponse({
        ok: true,
        github_login: ghUser.login || null,
        ...(await buildStatusResponse()),
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
