import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-gsc.ts";
import { resolveFccGmailOAuthClient } from "../_shared/fcc-asana-mail.ts";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const LOGIN_HINT = "foodchannels.plan@gmail.com";
const PROVIDER = "gmail_fcc";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

function redirectUri(): string {
  const override = (Deno.env.get("GOOGLE_GMAIL_FCC_OAUTH_REDIRECT_URI") || "").trim();
  if (override) return override;
  const base = SUPABASE_URL.replace(/\/+$/, "");
  return base ? `${base}/functions/v1/gmail-fcc-oauth` : "";
}

function stateSecret(): string {
  return (
    Deno.env.get("GOOGLE_GSC_CLIENT_SECRET") ||
    Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ||
    SUPABASE_SERVICE_ROLE_KEY ||
    "gmail-fcc-oauth"
  );
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
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function createState(): Promise<string> {
  const payload = `${crypto.randomUUID()}.${Date.now() + 15 * 60 * 1000}`;
  return `${payload}.${await hmacSign(payload)}`;
}

async function verifyState(state: string): Promise<boolean> {
  const parts = String(state || "").split(".");
  if (parts.length < 3) return false;
  const sig = parts.pop() || "";
  const payload = parts.join(".");
  const exp = Number(payload.split(".").pop());
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return sig === (await hmacSign(payload));
}

function callbackPage(ok: boolean, message: string) {
  const payload = JSON.stringify({ type: "mps-gmail-fcc-oauth", ok, message });
  const title = ok ? "FC 查詢 Gmail 授權完成" : "FC 查詢 Gmail 授權失敗";
  return `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;padding:32px;line-height:1.5">
  <h2>${title}</h2>
  <p>${message.replace(/</g, "&lt;")}</p>
  <p>可關閉此視窗，回到 MPS。</p>
  <script>
    try { window.opener && window.opener.postMessage(${payload}, "*"); } catch (e) {}
    setTimeout(function () { window.close(); }, 1200);
  </script>
</body>
</html>`;
}

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function authorizationUrl(): Promise<string> {
  const { clientId } = resolveFccGmailOAuthClient();
  const uri = redirectUri();
  if (!clientId || !uri) throw new Error("缺少 Google OAuth client 或 SUPABASE_URL");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: uri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: LOGIN_HINT,
    state: await createState(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function handleCallback(reqUrl: URL): Promise<Response> {
  const error = reqUrl.searchParams.get("error");
  if (error) return htmlResponse(callbackPage(false, `Google 拒絕授權：${error}`), 400);
  const code = reqUrl.searchParams.get("code") || "";
  const state = reqUrl.searchParams.get("state") || "";
  if (!code || !(await verifyState(state))) {
    return htmlResponse(callbackPage(false, "授權 state 無效或已過期，請回 MPS 再按一次。"), 400);
  }
  const { clientId, clientSecret } = resolveFccGmailOAuthClient();
  const uri = redirectUri();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: uri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await tokenRes.json() as {
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok) {
    return htmlResponse(
      callbackPage(
        false,
        `換 token 失敗：${payload.error_description || payload.error || tokenRes.status}。請把 ${uri} 加到 Google OAuth client 的 Authorized redirect URIs。`,
      ),
      400,
    );
  }
  const refresh = String(payload.refresh_token || "").trim();
  if (!refresh) {
    return htmlResponse(
      callbackPage(false, "Google 沒有回傳 refresh token。請到 Google 帳戶權限撤銷此 App 後再授權一次。"),
      400,
    );
  }
  const nowIso = new Date().toISOString();
  const { error: saveErr } = await admin().from("google_oauth_tokens").upsert({
    provider: PROVIDER,
    refresh_token: refresh,
    last_used_at: nowIso,
    last_rotated_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: "provider" });
  if (saveErr) return htmlResponse(callbackPage(false, saveErr.message), 500);
  return htmlResponse(callbackPage(true, `已連接。請用 ${LOGIN_HINT} 授權，並只讀「FC查詢」標籤。`));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reqUrl = new URL(req.url);
  if (req.method === "GET") {
    if (reqUrl.searchParams.get("action") === "start") {
      try {
        return Response.redirect(await authorizationUrl(), 302);
      } catch (err) {
        return htmlResponse(callbackPage(false, err instanceof Error ? err.message : String(err)), 500);
      }
    }
    return handleCallback(reqUrl);
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  let action = "status";
  try {
    action = String(((await req.json()) as { action?: string }).action || "status");
  } catch {
    action = "status";
  }
  try {
    if (action === "start") {
      return jsonResponse({
        authorization_url: await authorizationUrl(),
        redirect_uri: redirectUri(),
        login_hint: LOGIN_HINT,
      });
    }
    if (action === "status") {
      const { data } = await admin()
        .from("google_oauth_tokens")
        .select("updated_at")
        .eq("provider", PROVIDER)
        .maybeSingle();
      return jsonResponse({
        connected: Boolean(data),
        updated_at: data?.updated_at || null,
        login_hint: LOGIN_HINT,
        redirect_uri: redirectUri(),
      });
    }
    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
