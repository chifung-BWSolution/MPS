import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * IG 縮圖代理（不存檔）
 *
 * 背景：IG 的 `/p/{shortcode}/media/?size=m` 在伺服器端（Edge）可穩定取得，
 * 但部分瀏覽器請求會被 IG 的熱鏈／限流擋成非圖片，令卡片縮圖空白。
 * 這支函數即時向 IG 取圖再轉發，瀏覽器只需向本函數取圖：
 *   - 不落地、不佔儲存（只經記憶體串流）
 *   - 回應帶 6 小時 public cache，瀏覽器／CDN 會自行快取，重看不再打函數
 *
 * 用法：GET /functions/v1/hotspot-image?code={shortcode}&size=m|s|l
 * 安全：只接受合法 shortcode；不開放任意 URL，避免成為開放代理。
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const CODE_PATTERN = /^[A-Za-z0-9_-]{5,40}$/;
const SIZE_PATTERN = /^(s|m|l)$/;

function cors(headers: Record<string, string> = {}): HeadersInit {
  return { "access-control-allow-origin": "*", ...headers };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: cors() });
  }

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const requestedSize = (url.searchParams.get("size") ?? "m").trim();
  if (!CODE_PATTERN.test(code)) {
    return new Response("invalid code", { status: 400, headers: cors({ "cache-control": "no-store" }) });
  }

  // 先試要求的尺寸；失敗再退到 l（較大尺寸通常最穩）
  const sizes = SIZE_PATTERN.test(requestedSize)
    ? Array.from(new Set([requestedSize, "l"]))
    : ["m", "l"];

  for (const size of sizes) {
    try {
      const upstream = await fetch(
        `https://www.instagram.com/p/${code}/media/?size=${size}`,
        {
          headers: { "user-agent": UA, accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        },
      );
      const contentType = upstream.headers.get("content-type") ?? "";
      if (upstream.ok && contentType.startsWith("image/")) {
        return new Response(req.method === "HEAD" ? null : upstream.body, {
          status: 200,
          headers: cors({
            "content-type": contentType,
            // 6 小時：同一批卡片重看不用再打函數
            "cache-control": "public, max-age=21600, immutable",
            "x-content-type-options": "nosniff",
          }),
        });
      }
      await upstream.body?.cancel();
    } catch {
      // 換下一個尺寸
    }
  }

  return new Response("image not available", {
    status: 404,
    headers: cors({ "cache-control": "public, max-age=300" }),
  });
});
