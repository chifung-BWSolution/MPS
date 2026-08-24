import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getAttachment } from "../_shared/asana-pitching.ts";

type RequestBody = {
  attachment_gid?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const body = (req.method === "POST" ? await req.json().catch(() => ({})) : {}) as RequestBody;
    const attachmentGid = (
      body.attachment_gid ||
      url.searchParams.get("attachment_gid") ||
      ""
    ).trim();

    if (!attachmentGid) {
      return new Response(JSON.stringify({ error: "缺少附件編號" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attachment = await getAttachment(attachmentGid);
    return new Response(
      JSON.stringify({
        success: true,
        gid: attachment.gid,
        name: attachment.name,
        size: attachment.size,
        resource_subtype: attachment.resourceSubtype || null,
        download_url: attachment.downloadUrl || null,
        view_url: attachment.viewUrl || null,
        permanent_url: attachment.permanentUrl || null,
        host: attachment.host || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
