import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  GSC_OAUTH_LOGIN_HINT,
  GSC_READONLY_SCOPE,
  corsHeaders,
  getGscOAuthRedirectUri,
  hasWebmastersScope,
  listGscSites,
  maskRefreshToken,
  persistRefreshToken,
  resolveGscOAuthClient,
} from "../_shared/google-gsc.ts";

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

function callbackPage(ok: boolean, message: string, extra: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ type: "mps-gsc-oauth", ok, message, ...extra });
  const title = ok ? "Search Console 授權完成" : "Search Console 授權失敗";
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

function stateSecret(): string {
  return (
    Deno.env.get("GOOGLE_GSC_CLIENT_SECRET") ||
    Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ||
    SUPABASE_SERVICE_ROLE_KEY ||
    "gsc-oauth"
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
  const nonce = crypto.randomUUID();
  const exp = Date.now() + 15 * 60 * 1000;
  const payload = `${nonce}.${exp}`;
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

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function tokenInfo(accessToken: string): Promise<string> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) return "";
  const json = await res.json() as { scope?: string };
  return String(json.scope || "");
}

async function loadTokenRow(provider: "gsc" | "ga4") {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token, last_used_at, updated_at")
    .eq("provider", provider)
    .maybeSingle();
  return data;
}

async function buildStatus() {
  const { clientId } = resolveGscOAuthClient();
  const redirectUri = getGscOAuthRedirectUri();
  const storedGsc = await loadTokenRow("gsc");
  const storedGa4 = await loadTokenRow("ga4");
  const envGsc = (Deno.env.get("GOOGLE_GSC_REFRESH_TOKEN") || "").trim();
  const envGa4 = (Deno.env.get("GOOGLE_GA4_REFRESH_TOKEN") || "").trim();
  const gscToken = String(storedGsc?.refresh_token || envGsc || "").trim();
  const ga4Token = String(storedGa4?.refresh_token || envGa4 || "").trim();
  const activeToken = gscToken || ga4Token;
  const source = gscToken ? "gsc" : ga4Token ? "ga4" : null;

  let scopes = "";
  let hasWebmasters = false;
  let sitesListed: number | null = null;
  let probeError: string | null = null;
  if (activeToken) {
    try {
      const { clientId: id, clientSecret } = resolveGscOAuthClient();
      const body = new URLSearchParams({
        client_id: id,
        client_secret: clientSecret,
        refresh_token: activeToken,
        grant_type: "refresh_token",
      });
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        probeError = `refresh ${res.status}`;
      } else {
        const json = await res.json() as { access_token?: string };
        if (json.access_token) {
          scopes = await tokenInfo(json.access_token);
          hasWebmasters = hasWebmastersScope(scopes);
          if (hasWebmasters) {
            const sites = await listGscSites(json.access_token);
            sitesListed = sites.length;
          }
        }
      }
    } catch (err) {
      probeError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    connected: Boolean(activeToken),
    has_webmasters_scope: hasWebmasters,
    source,
    token_preview: maskRefreshToken(activeToken),
    last_used_at: storedGsc?.last_used_at || storedGa4?.last_used_at || null,
    scopes,
    sites_listed: sitesListed,
    probe_error: probeError,
    login_hint: GSC_OAUTH_LOGIN_HINT,
    client_id: clientId,
    redirect_uri: redirectUri,
  };
}

async function authorizationUrl(): Promise<string> {
  const { clientId } = resolveGscOAuthClient();
  const redirectUri = getGscOAuthRedirectUri();
  if (!clientId || !redirectUri) {
    throw new Error("Missing OAuth client or SUPABASE_URL redirect");
  }
  const state = await createState();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GSC_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: GSC_OAUTH_LOGIN_HINT,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function handleCallback(reqUrl: URL): Promise<Response> {
  const error = reqUrl.searchParams.get("error");
  if (error) {
    return htmlResponse(callbackPage(false, `Google 拒絕授權：${error}`), 400);
  }
  const code = reqUrl.searchParams.get("code") || "";
  const state = reqUrl.searchParams.get("state") || "";
  if (!code || !(await verifyState(state))) {
    return htmlResponse(callbackPage(false, "授權 state 無效或已過期，請回 MPS 再按一次。"), 400);
  }

  const { clientId, clientSecret } = resolveGscOAuthClient();
  const redirectUri = getGscOAuthRedirectUri();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok) {
    const detail = payload.error_description || payload.error || tokenRes.status;
    return htmlResponse(
      callbackPage(
        false,
        `換 token 失敗：${detail}。若是 redirect_uri_mismatch，請把 ${redirectUri} 加到這個 OAuth client 的 Authorized redirect URIs（Desktop client 請另建 Web client）。`,
      ),
      400,
    );
  }
  const refresh = String(payload.refresh_token || "").trim();
  if (!refresh) {
    return htmlResponse(
      callbackPage(
        false,
        "Google 沒有回傳 refresh token。請到 https://myaccount.google.com/permissions 撤銷此 App 後再授權一次。",
      ),
      400,
    );
  }

  const supabase = supabaseAdmin();
  await persistRefreshToken(supabase, "gsc", refresh, true);

  const scopes = payload.scope || (payload.access_token ? await tokenInfo(payload.access_token) : "");
  let sitesListed = 0;
  if (payload.access_token && hasWebmastersScope(scopes)) {
    try {
      sitesListed = (await listGscSites(payload.access_token)).length;
    } catch {
      sitesListed = 0;
    }
  }

  return htmlResponse(
    callbackPage(
      true,
      hasWebmastersScope(scopes)
        ? `已寫入 GSC refresh token。可見 ${sitesListed} 個 Search Console property。請用 chifung.login@gmail.com 授權。`
        : "已寫入 refresh token，但這次授權沒有 Search Console scope，請再按一次並同意檢視 Search Console 資料。",
      {
        has_webmasters_scope: hasWebmastersScope(scopes),
        sites_listed: sitesListed,
        token_preview: maskRefreshToken(refresh),
      },
    ),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);

  if (req.method === "GET") {
    if (reqUrl.searchParams.get("action") === "start") {
      try {
        const url = await authorizationUrl();
        return Response.redirect(url, 302);
      } catch (err) {
        return htmlResponse(
          callbackPage(false, err instanceof Error ? err.message : String(err)),
          500,
        );
      }
    }
    return handleCallback(reqUrl);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let action = "status";
  try {
    const body = await req.json() as { action?: string };
    action = String(body.action || "status");
  } catch {
    action = "status";
  }

  try {
    if (action === "start") {
      return jsonResponse({
        authorization_url: await authorizationUrl(),
        redirect_uri: getGscOAuthRedirectUri(),
        login_hint: GSC_OAUTH_LOGIN_HINT,
      });
    }
    if (action === "status") {
      return jsonResponse(await buildStatus());
    }
    if (action === "reveal") {
      const stored = await loadTokenRow("gsc");
      const envGsc = (Deno.env.get("GOOGLE_GSC_REFRESH_TOKEN") || "").trim();
      const token = String(stored?.refresh_token || envGsc || "").trim();
      if (!token) {
        return jsonResponse({ error: "尚未有 GSC refresh token，請先完成授權。" }, 404);
      }
      return jsonResponse({
        refresh_token: token,
        token_preview: maskRefreshToken(token),
        source: stored?.refresh_token ? "stored" : "secret",
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
