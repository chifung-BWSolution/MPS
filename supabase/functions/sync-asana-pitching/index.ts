import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  asanaTaskToRecord,
  DEFAULT_PITCHING_PROJECT_GID,
  DEFAULT_SYNC_YEAR,
  isTaskInSyncYear,
  listProjectTasks,
  resolveSyncYear,
  type SyncProjectConfig,
} from "../_shared/asana-pitching.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = `asana_pitch_${Date.now()}`;
  const startedMs = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    await supabase.from("asana_pitching_sync_runs").insert({
      id: runId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const projectGid =
      (body as { project_gid?: string }).project_gid ||
      Deno.env.get("ASANA_PITCHING_PROJECT_GID") ||
      DEFAULT_PITCHING_PROJECT_GID;

    const { data: configured, error: cfgErr } = await supabase
      .from("asana_pitching_projects")
      .select(
        "project_gid, project_name, project_types, sync_year, status_field_name, enabled",
      )
      .eq("enabled", true)
      .eq("project_gid", projectGid)
      .maybeSingle();

    if (cfgErr) throw new Error(`Load project failed: ${cfgErr.message}`);

    const project: SyncProjectConfig = configured
      ? (configured as SyncProjectConfig)
      : {
          project_gid: projectGid,
          project_name: "BWT Active 1 開始緊密跟進中",
          project_types: ["bwt_web", "bwt_system"],
          sync_year: DEFAULT_SYNC_YEAR,
          status_field_name: "狀態",
        };

    const syncYear = resolveSyncYear(project);
    const syncedAt = new Date().toISOString();
    let tasksFetched = 0;
    let tasksSkipped = 0;
    let recordsUpserted = 0;
    const errors: string[] = [];

    const tasks = await listProjectTasks(project.project_gid);
    tasksFetched = tasks.length;

    for (const task of tasks) {
      if (!isTaskInSyncYear(task, syncYear)) {
        tasksSkipped += 1;
        continue;
      }

      try {
        const row = asanaTaskToRecord(task, project, syncedAt);
        const { error: upsertErr } = await supabase
          .from("pitching_records")
          .upsert(row, { onConflict: "asana_task_gid" });
        if (upsertErr) {
          errors.push(`${task.gid}: ${upsertErr.message}`);
        } else {
          recordsUpserted += 1;
        }
      } catch (e) {
        errors.push(`${task.gid}: ${(e as Error).message}`);
      }
    }

    await supabase.from("asana_pitching_projects").upsert(
      {
        project_gid: project.project_gid,
        project_name: project.project_name,
        project_types: project.project_types || [],
        sync_year: syncYear,
        status_field_name: project.status_field_name || "狀態",
        enabled: true,
        last_synced_at: syncedAt,
        updated_at: syncedAt,
      },
      { onConflict: "project_gid" },
    );

    const durationMs = Date.now() - startedMs;
    await supabase
      .from("asana_pitching_sync_runs")
      .update({
        status: errors.length ? "completed_with_errors" : "completed",
        tasks_fetched: tasksFetched,
        tasks_skipped: tasksSkipped,
        records_upserted: recordsUpserted,
        projects_synced: 1,
        error_message: errors.length ? errors.slice(0, 20).join("\n") : null,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        duration_ms: durationMs,
        project_gid: project.project_gid,
        project_name: project.project_name,
        sync_year: syncYear,
        tasks_fetched: tasksFetched,
        tasks_skipped: tasksSkipped,
        records_upserted: recordsUpserted,
        sync_direction: "asana_to_mps",
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from("asana_pitching_sync_runs")
      .update({
        status: "failed",
        error_message: msg,
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedMs,
      })
      .eq("id", runId);
    return new Response(JSON.stringify({ success: false, error: msg, run_id: runId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
