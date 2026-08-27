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

function normalizeAddresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item).trim()).filter(Boolean);
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
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "RESEND_API_KEY is not configured. Set it with: supabase secrets set RESEND_API_KEY=re_xxx",
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
    const from =
      String(body.from ?? "").trim() ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "MPS <onboarding@resend.dev>";

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
      from,
      to,
      subject,
    };
    if (html) payload.html = html;
    if (text) payload.text = text;

    const cc = normalizeAddresses(body.cc);
    const bcc = normalizeAddresses(body.bcc);
    const replyTo = normalizeAddresses(body.replyTo);
    if (cc.length) payload.cc = cc;
    if (bcc.length) payload.bcc = bcc;
    if (replyTo.length) payload.reply_to = replyTo;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey.slice(0, 256);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        (data && (data.message || data.error)) ||
        `Resend API error (${res.status})`;
      return new Response(JSON.stringify({ error: String(message), details: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: res.status >= 400 && res.status < 600 ? res.status : 502,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: data?.id ?? null,
        from,
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
