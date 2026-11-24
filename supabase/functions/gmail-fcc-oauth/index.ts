import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-gsc.ts";
import { resolveFccGmailOAuthClient } from "../_shared/fcc-asana-mail.ts";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const MAILBOX = {
  fcc: { provider: "gmail_fcc", login: "foodchannels.plan@gmail.com" },
  bw: { provider: "gmail_bw", login: "brandingworks.services@gmail.com" },
} as const;
type Mailbox = keyof typeof MAILBOX;

function asMailbox(value: unknown): Mailbox {
  return value === "bw" ? "bw" : "fcc";
}

function mailboxFromState(state: string): Mailbox {
  return asMailbox(String(state || "").split(".")[0]);
}

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

async function createState(mailbox: Mailbox): Promise<string> {
  const payload = `${mailbox}.${crypto.randomUUID()}.${Date.now() + 15 * 60 * 1000}`;
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

function htmlEntities(text: string): string {
  return Array.from(text).map((char) => {
    const code = char.codePointAt(0) || 0;
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return code > 127 ? `&#${code};` : char;
  }).join("");
}

function callbackPage(ok: boolean, message: string, mailbox: Mailbox = "fcc") {
  const payload = JSON.stringify({
    type: mailbox === "bw" ? "mps-gmail-bw-oauth" : "mps-gmail-fcc-oauth",
    ok,
    message,
  })
    .replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const title = htmlEntities(ok
    ? (mailbox === "bw" ? "BW 查詢 Gmail 授權完成" : "FC 查詢 Gmail 授權完成")
    : (mailbox === "bw" ? "BW 查詢 Gmail 授權失敗" : "FC 查詢 Gmail 授權失敗"));
  const english = ok
    ? "Gmail connected. You can close this window and return to MPS."
    : "Gmail connection failed. Close this window and try again from MPS.";
  return `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;padding:32px;line-height:1.5">
  <h2>${title}</h2>
  <p>${htmlEntities(message)}</p>
  <p>${htmlEntities("可關閉此視窗，回到 MPS。")}</p>
  <p>${english}</p>
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

async function authorizationUrl(mailbox: Mailbox): Promise<string> {
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
    login_hint: MAILBOX[mailbox].login,
    state: await createState(mailbox),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function handleCallback(reqUrl: URL): Promise<Response> {
  const state = reqUrl.searchParams.get("state") || "";
  const mailbox = mailboxFromState(state);
  const login = MAILBOX[mailbox].login;
  const error = reqUrl.searchParams.get("error");
  if (error) return htmlResponse(callbackPage(false, `Google 拒絕授權：${error}`, mailbox), 400);
  const code = reqUrl.searchParams.get("code") || "";
  if (!code || !(await verifyState(state))) {
    return htmlResponse(callbackPage(false, "授權 state 無效或已過期，請回 MPS 再按一次。", mailbox), 400);
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
        mailbox,
      ),
      400,
    );
  }
  const refresh = String(payload.refresh_token || "").trim();
  if (!refresh) {
    return htmlResponse(
      callbackPage(false, "Google 沒有回傳 refresh token。請到 Google 帳戶權限撤銷此 App 後再授權一次。", mailbox),
      400,
    );
  }
  const nowIso = new Date().toISOString();
  const { error: saveErr } = await admin().from("google_oauth_tokens").upsert({
    provider: MAILBOX[mailbox].provider,
    refresh_token: refresh,
    last_used_at: nowIso,
    last_rotated_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: "provider" });
  if (saveErr) return htmlResponse(callbackPage(false, saveErr.message, mailbox), 500);
  const done = mailbox === "bw"
    ? `已連接 ${login}。而家只係授權讀信，未會開 Asana task。`
    : `已連接。請用 ${login} 授權，並只讀「FC查詢」標籤。`;
  return htmlResponse(callbackPage(true, done, mailbox));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const reqUrl = new URL(req.url);
  if (req.method === "GET") {
    if (reqUrl.searchParams.get("action") === "start") {
      const mailbox = asMailbox(reqUrl.searchParams.get("mailbox"));
      try {
        return Response.redirect(await authorizationUrl(mailbox), 302);
      } catch (err) {
        return htmlResponse(callbackPage(false, err instanceof Error ? err.message : String(err), mailbox), 500);
      }
    }
    return handleCallback(reqUrl);
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  let action = "status";
  let mailbox: Mailbox = "fcc";
  try {
    const body = (await req.json()) as { action?: string; mailbox?: string };
    action = String(body.action || "status");
    mailbox = asMailbox(body.mailbox);
  } catch {
    action = "status";
  }
  try {
    if (action === "start") {
      return jsonResponse({
        authorization_url: await authorizationUrl(mailbox),
        redirect_uri: redirectUri(),
        login_hint: MAILBOX[mailbox].login,
      });
    }
    if (action === "status") {
      const { data } = await admin()
        .from("google_oauth_tokens")
        .select("updated_at")
        .eq("provider", MAILBOX[mailbox].provider)
        .maybeSingle();
      return jsonResponse({
        connected: Boolean(data),
        updated_at: data?.updated_at || null,
        login_hint: MAILBOX[mailbox].login,
        redirect_uri: redirectUri(),
      });
    }
    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
