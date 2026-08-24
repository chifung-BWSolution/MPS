import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SendEmailBody = {
  to?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  idempotencyKey?: string;
};

type BrevoAddress = {
  email: string;
  name?: string;
};

function normalizeAddresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item).trim()).filter(Boolean);
}

function parseAddress(value: string): BrevoAddress {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) return { email: trimmed };
  const name = match[1].trim().replace(/^["']|["']$/g, "");
  const email = match[2].trim();
  return name ? { email, name } : { email };
}

function toBrevoAddresses(values: string[]): BrevoAddress[] {
  return values.map(parseAddress);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "BREVO_API_KEY is not configured. Set it with: supabase secrets set BREVO_API_KEY=xkeysib-xxx",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    const body = (await req.json()) as SendEmailBody;
    const to = normalizeAddresses(body.to);
    const subject = String(body.subject ?? "").trim();
    const html = body.html ? String(body.html) : undefined;
    const text = body.text ? String(body.text) : undefined;
    const fromRaw =
      String(body.from ?? "").trim() ||
      Deno.env.get("BREVO_FROM_EMAIL") ||
      "MPS <noreply@bwteam-marketing.com>";
    const sender = parseAddress(fromRaw);

    if (!to.length) {
      return new Response(JSON.stringify({ error: "to is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ error: "subject is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!html && !text) {
      return new Response(
        JSON.stringify({ error: "html or text is required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const payload: Record<string, unknown> = {
      sender,
      to: toBrevoAddresses(to),
      subject,
      htmlContent: html || `<p>${escapeHtml(text || "")}</p>`,
    };
    if (text) payload.textContent = text;

    const cc = normalizeAddresses(body.cc);
    const bcc = normalizeAddresses(body.bcc);
    const replyTo = normalizeAddresses(body.replyTo);
    if (cc.length) payload.cc = toBrevoAddresses(cc);
    if (bcc.length) payload.bcc = toBrevoAddresses(bcc);
    if (replyTo.length) payload.replyTo = parseAddress(replyTo[0]);

    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (idempotencyKey) {
      payload.headers = { "Idempotency-Key": idempotencyKey.slice(0, 256) };
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data && (data.message || data.error)) ||
        `Brevo API error (${res.status})`;
      return new Response(JSON.stringify({ error: String(message), details: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: res.status >= 400 && res.status < 600 ? res.status : 502,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: data?.messageId ?? null,
        from: fromRaw,
        to,
        subject,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
