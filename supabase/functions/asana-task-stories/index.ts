import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  asanaStoryToComment,
  corsHeaders,
  getTask,
  listTaskAttachments,
  listTaskStories,
  parseAsanaTaskGidFromLink,
} from "../_shared/asana-pitching.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

type RequestBody = {
  project_id?: string;
  asana_link?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (req.method === "POST" ? await req.json().catch(() => ({})) : {}) as RequestBody;
    let asanaLink = (body.asana_link || "").trim();
    let asanaTaskGid = "";

    if (body.project_id?.trim()) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Missing SUPABASE_URL or service role key");
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase
        .from("quotation_client_project")
        .select("asana_link, asana_task_gid")
        .eq("id", body.project_id.trim())
        .maybeSingle();
      if (error) throw new Error(`Load project failed: ${error.message}`);
      if (!data) {
        return new Response(JSON.stringify({ error: "找不到對應的 Pitching 項目" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      asanaLink = (data.asana_link || asanaLink || "").trim();
      asanaTaskGid = (data.asana_task_gid || "").trim();
    }

    const taskGid = asanaTaskGid || parseAsanaTaskGidFromLink(asanaLink);
    if (!taskGid) {
      return new Response(
        JSON.stringify({
          error: asanaLink ? "無法從 Asana 連結解析任務" : "尚未設定 Asana 連結",
          asana_link: asanaLink || null,
          comments: [],
          attachments: [],
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const [task, stories, taskAttachments] = await Promise.all([
      getTask(taskGid),
      listTaskStories(taskGid),
      listTaskAttachments(taskGid),
    ]);
    const comments = stories
      .map(asanaStoryToComment)
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const commentAttachmentIds = new Set(
      comments.flatMap((comment) => comment.attachments.map((item) => item.gid)),
    );
    const attachments = taskAttachments.filter((item) => !commentAttachmentIds.has(item.gid));

    return new Response(
      JSON.stringify({
        success: true,
        task_gid: taskGid,
        task_name: task.name || "",
        asana_link: task.permalink_url || asanaLink || null,
        comments,
        attachments,
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
