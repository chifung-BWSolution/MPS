import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  resendStatus,
  sendResendEmail,
} from "../_shared/resend.ts";

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

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (req.method === "GET") {
    return json(200, resendStatus());
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = (await req.json()) as SendEmailBody;
    const result = await sendResendEmail({
      to: body.to ?? [],
      subject: body.subject ?? "",
      html: body.html,
      text: body.text,
      from: body.from,
      replyTo: body.replyTo,
      cc: body.cc,
      bcc: body.bcc,
      idempotencyKey: body.idempotencyKey,
    });

    return json(200, {
      success: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /not configured|required/i.test(message)
      ? message.includes("not configured") ? 500 : 400
      : 502;
    return json(status, { error: message });
  }
});
