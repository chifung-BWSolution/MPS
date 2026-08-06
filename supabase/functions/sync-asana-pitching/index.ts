import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  asanaTaskToRecord,
  isTaskInSyncRange,
  listProjectTasks,
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
    const filterGid = (body as { project_gid?: string }).project_gid;

    let query = supabase
      .from("asana_pitching_projects")
      .select(
        "project_gid, project_name, project_types, sync_year, sync_year_from, sync_date_mode, status_field_name, sync_default_status, enabled",
      )
      .eq("enabled", true);

    if (filterGid) {
      query = query.eq("project_gid", filterGid);
    }

    const { data: configured, error: cfgErr } = await query;
    if (cfgErr) throw new Error(`Load projects failed: ${cfgErr.message}`);

    const projects = (configured || []) as SyncProjectConfig[];
    if (!projects.length) {
      throw new Error("No enabled Asana pitching projects configured");
    }

    const syncedAt = new Date().toISOString();
    let tasksFetched = 0;
    let tasksSkipped = 0;
    let recordsUpserted = 0;
    const errors: string[] = [];

    for (const project of projects) {
      try {
        const tasks = await listProjectTasks(project.project_gid);
        tasksFetched += tasks.length;

        for (const task of tasks) {
          if (!isTaskInSyncRange(task, project)) {
            tasksSkipped += 1;
            continue;
          }

          try {
            const row = asanaTaskToRecord(task, project, syncedAt);
            const { error: upsertErr } = await supabase
              .from("quotation_client_project")
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
            sync_year: project.sync_year ?? null,
            sync_year_from: project.sync_year_from ?? null,
            sync_date_mode: project.sync_date_mode ?? null,
            status_field_name: project.status_field_name || "狀態",
            sync_default_status: project.sync_default_status ?? null,
            enabled: true,
            last_synced_at: syncedAt,
            updated_at: syncedAt,
          },
          { onConflict: "project_gid" },
        );
      } catch (e) {
        errors.push(`${project.project_name}: ${(e as Error).message}`);
      }
    }

    const durationMs = Date.now() - startedMs;
    await supabase
      .from("asana_pitching_sync_runs")
      .update({
        status: errors.length ? "completed_with_errors" : "completed",
        tasks_fetched: tasksFetched,
        tasks_skipped: tasksSkipped,
        records_upserted: recordsUpserted,
        projects_synced: projects.length,
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
        projects_synced: projects.length,
        project_gids: projects.map((p) => p.project_gid),
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
