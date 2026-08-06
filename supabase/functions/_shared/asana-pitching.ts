export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASANA_API = "https://app.asana.com/api/1.0";

export type PitchingStatus = "initial" | "following_up" | "confirmed" | "closed";

export type AsanaTask = {
  gid: string;
  name: string;
  notes?: string;
  html_notes?: string;
  due_on?: string | null;
  created_at?: string;
  completed?: boolean;
  permalink_url?: string;
  assignee?: { gid?: string; name?: string } | null;
  memberships?: Array<{
    project?: { gid?: string; name?: string };
    section?: { gid?: string; name?: string };
  }>;
};

export type AsanaProject = {
  gid: string;
  name: string;
};

function getToken(): string {
  const token = Deno.env.get("ASANA_ACCESS_TOKEN")?.trim();
  if (!token) {
    throw new Error(
      "Missing ASANA_ACCESS_TOKEN. Set a Personal Access Token in Supabase Edge Function secrets.",
    );
  }
  return token;
}

async function asanaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ASANA_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (json as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
      res.statusText;
    throw new Error(`Asana API ${path}: ${msg}`);
  }
  return json as T;
}

export async function listWorkspaceProjects(workspaceGid: string): Promise<AsanaProject[]> {
  const out: AsanaProject[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      opt_fields: "name,gid",
      ...(offset ? { offset } : {}),
    });
    const data = await asanaFetch<{
      data: AsanaProject[];
      next_page?: { offset?: string } | null;
    }>(`/workspaces/${workspaceGid}/projects?${qs}`);
    out.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);
  return out;
}

export async function listProjectTasks(projectGid: string): Promise<AsanaTask[]> {
  const optFields = [
    "name",
    "notes",
    "html_notes",
    "due_on",
    "created_at",
    "completed",
    "permalink_url",
    "assignee.name",
    "memberships.project.name",
    "memberships.section.name",
  ].join(",");
  const out: AsanaTask[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      opt_fields: optFields,
      ...(offset ? { offset } : {}),
    });
    const data = await asanaFetch<{
      data: AsanaTask[];
      next_page?: { offset?: string } | null;
    }>(`/projects/${projectGid}/tasks?${qs}`);
    out.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);
  return out;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function taskDescription(task: AsanaTask): string {
  if (task.notes?.trim()) return task.notes.trim();
  if (task.html_notes?.trim()) return stripHtml(task.html_notes);
  return "";
}

export function parseClientNameFromTaskName(taskName: string): string {
  const parts = taskName.split(/\s[-–—]\s/);
  if (parts.length < 2) return "";
  const tail = parts.slice(1).join(" - ").trim();
  return tail.replace(/\s+\d{4,}\s*\d*.*$/, "").trim() || tail;
}

export function inferProjectTypes(
  taskName: string,
  projectTypes: string[],
  projectName: string,
): string[] {
  const name = `${taskName} ${projectName}`.toLowerCase();
  const types = new Set<string>(projectTypes);

  if (/bwl|活動|event|catering|fcc/.test(name)) types.add("bwl_event");
  if (/system|系統|ngo|platform|app/.test(name)) types.add("bwt_system");
  if (/web|網頁|website|shopify|site|platform/.test(name)) types.add("bwt_web");

  if (types.size === 0 && projectTypes.length) {
    projectTypes.forEach((t) => types.add(t));
  }
  if (types.size === 0) {
    if (/^bwt/i.test(taskName)) types.add("bwt_web");
    else if (/^bwl/i.test(taskName)) types.add("bwl_event");
  }

  return [...types];
}

export function mapAsanaStatus(
  task: AsanaTask,
  sectionName: string,
  projectName: string,
): PitchingStatus {
  const blob = `${sectionName} ${projectName} ${task.name}`.toLowerCase();
  if (task.completed || /done|已成交|已結案|closed|完成/.test(blob)) {
    return "closed";
  }
  if (/確認|confirmed|quote ready|準備報價/.test(blob)) {
    return "confirmed";
  }
  if (/跟進|active|follow|進行|pitching/.test(blob)) {
    return "following_up";
  }
  return "initial";
}

export function taskInquiryDate(task: AsanaTask): string {
  if (task.due_on) return task.due_on;
  if (task.created_at) return task.created_at.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function taskSectionName(task: AsanaTask, projectGid: string): string {
  const membership = task.memberships?.find((m) => m.project?.gid === projectGid);
  return membership?.section?.name || "";
}

export function asanaTaskToRecord(
  task: AsanaTask,
  projectGid: string,
  projectName: string,
  defaultProjectTypes: string[],
  syncedAt: string,
) {
  const sectionName = taskSectionName(task, projectGid);
  const description = taskDescription(task);
  const clientName = parseClientNameFromTaskName(task.name);
  const projectTypes = inferProjectTypes(task.name, defaultProjectTypes, projectName);

  return {
    id: `asana_${task.gid}`,
    asana_task_gid: task.gid,
    asana_project_gid: projectGid,
    asana_project_name: projectName,
    asana_section_name: sectionName || null,
    pitching_code: `ASANA-${task.gid.slice(-8)}`,
    client_name: clientName || null,
    display_name: task.name.trim(),
    inquiry_date: taskInquiryDate(task),
    description: description || null,
    project_types: projectTypes,
    assigned_pm: task.assignee?.gid || null,
    assigned_pm_name: task.assignee?.name || "",
    status: mapAsanaStatus(task, sectionName, projectName),
    asana_link: task.permalink_url || `https://app.asana.com/0/0/${task.gid}`,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

export async function discoverPitchingProjects(workspaceGid: string): Promise<AsanaProject[]> {
  const all = await listWorkspaceProjects(workspaceGid);
  return all.filter((p) =>
    /active|pitching|報價|quote|bwt|bwl|bwa/i.test(p.name),
  );
}
