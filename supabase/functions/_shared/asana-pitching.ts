export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASANA_API = "https://app.asana.com/api/1.0";

/** BWT Active 1 開始緊密跟進中 */
export const DEFAULT_PITCHING_PROJECT_GID = "1208704092427502";
/** BWT Active 3 已成交+開工 DONE Deal */
export const BWT_ACTIVE_3_PROJECT_GID = "1208704092427590";
export const DEFAULT_SYNC_YEAR = 2026;
export const DEFAULT_STATUS_FIELD_NAME = "狀態";

export type PitchingStatus = "initial" | "following_up" | "confirmed" | "closed";

export type AsanaCustomField = {
  gid?: string;
  name?: string;
  type?: string;
  display_value?: string | null;
  text_value?: string | null;
  enum_value?: { gid?: string; name?: string; color?: string } | null;
};

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
  custom_fields?: AsanaCustomField[];
  memberships?: Array<{
    project?: { gid?: string; name?: string };
    section?: { gid?: string; name?: string };
  }>;
};

export type SyncProjectConfig = {
  project_gid: string;
  project_name: string;
  project_types: string[];
  sync_year?: number | null;
  /** When set, include tasks with created_at year >= sync_year_from */
  sync_year_from?: number | null;
  status_field_name?: string | null;
  /** Force MPS status for synced rows (e.g. closed for DONE Deal projects) */
  sync_default_status?: PitchingStatus | null;
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
    "custom_fields",
    "custom_fields.name",
    "custom_fields.display_value",
    "custom_fields.text_value",
    "custom_fields.enum_value",
    "custom_fields.enum_value.name",
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
  if (/web|網頁|website|shopify|site/.test(name)) types.add("bwt_web");

  if (types.size === 0 && projectTypes.length) {
    projectTypes.forEach((t) => types.add(t));
  }
  if (types.size === 0 && /^bwt/i.test(taskName)) types.add("bwt_web");

  return [...types];
}

export function taskInquiryDate(task: AsanaTask): string {
  if (task.created_at) return task.created_at.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function taskCreatedYear(task: AsanaTask): number | null {
  if (!task.created_at) return null;
  const y = parseInt(task.created_at.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function resolveSyncYear(project: SyncProjectConfig): number {
  if (project.sync_year && project.sync_year > 2000) return project.sync_year;
  if (project.sync_year_from && project.sync_year_from > 2000) {
    return project.sync_year_from;
  }
  const envYear = parseInt(Deno.env.get("ASANA_SYNC_YEAR") || "", 10);
  if (Number.isFinite(envYear) && envYear > 2000) return envYear;
  return DEFAULT_SYNC_YEAR;
}

/** Filter by sync_year (exact) or sync_year_from (>=). */
export function isTaskInSyncRange(task: AsanaTask, project: SyncProjectConfig): boolean {
  const year = taskCreatedYear(task);
  if (year === null) return false;
  if (project.sync_year_from && project.sync_year_from > 2000) {
    return year >= project.sync_year_from;
  }
  const syncYear = resolveSyncYear(project);
  return year === syncYear;
}

export function customFieldDisplayValue(field: AsanaCustomField): string {
  if (field.display_value?.trim()) return field.display_value.trim();
  if (field.enum_value?.name?.trim()) return field.enum_value.name.trim();
  if (field.text_value?.trim()) return field.text_value.trim();
  return "";
}

export function findStatusCustomField(
  task: AsanaTask,
  preferredFieldName: string,
): AsanaCustomField | undefined {
  const fields = task.custom_fields || [];
  if (!fields.length) return undefined;

  const preferred = preferredFieldName.trim().toLowerCase();
  const exact = fields.find((f) => (f.name || "").trim().toLowerCase() === preferred);
  if (exact) return exact;

  return fields.find((f) => /狀態|status|pitching/i.test(f.name || ""));
}

export function extractStatusLabel(task: AsanaTask, statusFieldName: string): string {
  const field = findStatusCustomField(task, statusFieldName);
  if (!field) return "";
  return customFieldDisplayValue(field);
}

export function mapCustomFieldStatus(label: string, task: AsanaTask): PitchingStatus {
  const raw = label.trim();
  if (!raw) {
    if (task.completed) return "closed";
    return "initial";
  }

  if (/已結案|结案|closed|done|完成/.test(raw)) return "closed";
  if (/確認項目|确认项目|確認|confirmed/.test(raw)) return "confirmed";
  if (/跟進中|跟进中|following|follow/.test(raw)) return "following_up";
  if (/初步提案|初步|initial|proposal/.test(raw)) return "initial";

  return "initial";
}

export function taskSectionName(task: AsanaTask, projectGid: string): string {
  const membership = task.memberships?.find((m) => m.project?.gid === projectGid);
  return membership?.section?.name || "";
}

export function asanaTaskToRecord(
  task: AsanaTask,
  project: SyncProjectConfig,
  syncedAt: string,
) {
  const statusFieldName =
    project.status_field_name?.trim() ||
    Deno.env.get("ASANA_STATUS_FIELD_NAME") ||
    DEFAULT_STATUS_FIELD_NAME;
  const statusLabel = extractStatusLabel(task, statusFieldName);
  const sectionName = taskSectionName(task, project.project_gid);
  const description = taskDescription(task);
  const clientName = parseClientNameFromTaskName(task.name);
  const projectTypes = inferProjectTypes(
    task.name,
    project.project_types || [],
    project.project_name,
  );
  const status =
    project.sync_default_status ??
    mapCustomFieldStatus(statusLabel, task);

  return {
    id: `asana_${task.gid}`,
    asana_task_gid: task.gid,
    asana_project_gid: project.project_gid,
    asana_project_name: project.project_name,
    asana_section_name: sectionName || null,
    asana_status_label: statusLabel || null,
    pitching_code: `ASANA-${task.gid.slice(-8)}`,
    client_name: clientName || null,
    display_name: task.name.trim(),
    inquiry_date: taskInquiryDate(task),
    description: description || null,
    project_types: projectTypes,
    assigned_pm: task.assignee?.gid || null,
    assigned_pm_name: task.assignee?.name || "",
    status,
    asana_link: task.permalink_url || `https://app.asana.com/0/0/${task.gid}`,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}
