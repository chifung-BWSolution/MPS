import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  discoverPitchingProjects,
  listProjectTasks,
  asanaTaskToRecord,
} from "../_shared/asana-pitching.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";
const ASANA_WORKSPACE_GID =
  Deno.env.get("ASANA_WORKSPACE_GID") || "6649488167653";

type ProjectRow = {
  project_gid: string;
  project_name: string;
  project_types: string[];
  enabled: boolean;
};

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
    const discover = Boolean((body as { discover?: boolean }).discover);

    let projects: ProjectRow[] = [];
    const { data: configured, error: cfgErr } = await supabase
      .from("asana_pitching_projects")
      .select("project_gid, project_name, project_types, enabled")
      .eq("enabled", true);
    if (cfgErr) throw new Error(`Load projects failed: ${cfgErr.message}`);
    projects = (configured || []) as ProjectRow[];

    if (discover || projects.length === 0) {
      const discovered = await discoverPitchingProjects(ASANA_WORKSPACE_GID);
      for (const p of discovered) {
        const exists = projects.some((row) => row.project_gid === p.gid);
        if (!exists) {
          projects.push({
            project_gid: p.gid,
            project_name: p.name,
            project_types: [],
            enabled: true,
          });
        }
        await supabase.from("asana_pitching_projects").upsert(
          {
            project_gid: p.gid,
            project_name: p.name,
            workspace_gid: ASANA_WORKSPACE_GID,
            enabled: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_gid" },
        );
      }
    }

    const syncedAt = new Date().toISOString();
    let tasksFetched = 0;
    let recordsUpserted = 0;
    const errors: string[] = [];

    for (const project of projects) {
      try {
        const tasks = await listProjectTasks(project.project_gid);
        tasksFetched += tasks.length;

        for (const task of tasks) {
          const row = asanaTaskToRecord(
            task,
            project.project_gid,
            project.project_name,
            project.project_types || [],
            syncedAt,
          );
          const { error: upsertErr } = await supabase
            .from("pitching_records")
            .upsert(row, { onConflict: "asana_task_gid" });
          if (upsertErr) {
            errors.push(`${task.gid}: ${upsertErr.message}`);
          } else {
            recordsUpserted += 1;
          }
        }

        await supabase
          .from("asana_pitching_projects")
          .update({ last_synced_at: syncedAt, updated_at: syncedAt })
          .eq("project_gid", project.project_gid);
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
        tasks_fetched: tasksFetched,
        records_upserted: recordsUpserted,
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
