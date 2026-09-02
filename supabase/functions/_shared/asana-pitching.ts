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
  assignee?: { gid?: string; name?: string; email?: string } | null;
  custom_fields?: AsanaCustomField[];
  memberships?: Array<{
    project?: { gid?: string; name?: string };
    section?: { gid?: string; name?: string };
  }>;
};

export type SyncDateMode = "created_exact" | "created_from" | "active_deal";

export type SyncProjectConfig = {
  project_gid: string;
  project_name: string;
  project_types: string[];
  sync_year?: number | null;
  /** When set, include tasks with created_at year >= sync_year_from */
  sync_year_from?: number | null;
  /** How to decide which tasks to sync */
  sync_date_mode?: SyncDateMode | null;
  status_field_name?: string | null;
  /** Force MPS status for synced rows (e.g. closed for DONE Deal projects) */
  sync_default_status?: PitchingStatus | null;
  /** When set, only sync tasks whose Asana section name contains this text */
  sync_section_name?: string | null;
  /** When true, use project_types from config only (no name-based inference) */
  sync_project_types_only?: boolean | null;
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

export async function getAsanaUser(
  userGid: string,
): Promise<{ gid: string; email?: string; name?: string }> {
  const qs = new URLSearchParams({
    opt_fields: ["email", "name"].join(","),
  });
  const data = await asanaFetch<{ data: { gid: string; email?: string; name?: string } }>(
    `/users/${userGid}?${qs}`,
  );
  return data.data;
}

export type AsanaAttachmentRaw = {
  gid?: string;
  name?: string | null;
  created_at?: string;
  resource_subtype?: string;
  size?: number | null;
  download_url?: string | null;
  view_url?: string | null;
  permanent_url?: string | null;
  host?: string | null;
};

export type AsanaAttachment = {
  gid: string;
  name: string;
  createdAt: string;
  resourceSubtype?: string;
  size?: number | null;
  downloadUrl?: string | null;
  viewUrl?: string | null;
  permanentUrl?: string | null;
  host?: string | null;
};

export type AsanaStory = {
  gid: string;
  created_at?: string;
  created_by?: { gid?: string; name?: string } | null;
  text?: string | null;
  html_text?: string | null;
  type?: string;
  resource_subtype?: string;
  attachments?: AsanaAttachmentRaw[] | null;
};

export type AsanaTaskComment = {
  id: string;
  createdAt: string;
  authorName: string;
  text: string;
  attachments: AsanaAttachment[];
};

export const ATTACHMENT_OPT_FIELDS = [
  "name",
  "created_at",
  "resource_subtype",
  "size",
  "download_url",
  "view_url",
  "permanent_url",
  "host",
  "parent",
  "parent.name",
  "parent.resource_type",
  "parent.resource_subtype",
].join(",");

/** Parse an Asana task GID from permalink, inbox URL, or a bare numeric id. */
export function parseAsanaTaskGidFromLink(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (/^\d{6,}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    const digits = value.match(/\d{6,}/g);
    return digits?.[digits.length - 1] ?? null;
  }

  const path = url.pathname.replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);

  const taskIdx = parts.lastIndexOf("task");
  if (taskIdx >= 0 && parts[taskIdx + 1] && /^\d+$/.test(parts[taskIdx + 1])) {
    return parts[taskIdx + 1];
  }

  const listIdx = parts.lastIndexOf("list");
  if (listIdx >= 0 && parts[listIdx + 1] && /^\d+$/.test(parts[listIdx + 1])) {
    return parts[listIdx + 1];
  }

  if (parts[0] === "0" && parts.length >= 3) {
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
  }

  const queryGid = url.searchParams.get("task") || url.searchParams.get("focus");
  if (queryGid && /^\d+$/.test(queryGid)) return queryGid;

  const digits = path.match(/\d{6,}/g);
  return digits?.[digits.length - 1] ?? null;
}

export function isAsanaChatStory(story: AsanaStory): boolean {
  return story.resource_subtype === "comment_added" || story.type === "comment";
}

export function mapAsanaAttachment(raw: AsanaAttachmentRaw | null | undefined): AsanaAttachment | null {
  const gid = raw?.gid?.trim();
  if (!gid) return null;
  return {
    gid,
    name: raw?.name?.trim() || "未命名附件",
    createdAt: raw?.created_at || "",
    resourceSubtype: raw?.resource_subtype || undefined,
    size: typeof raw?.size === "number" && Number.isFinite(raw.size) ? raw.size : null,
    downloadUrl: raw?.download_url || null,
    viewUrl: raw?.view_url || null,
    permanentUrl: raw?.permanent_url || null,
    host: raw?.host || null,
  };
}

export function mapAsanaAttachments(raw: AsanaAttachmentRaw[] | null | undefined): AsanaAttachment[] {
  return (raw || [])
    .map(mapAsanaAttachment)
    .filter((item): item is AsanaAttachment => item != null);
}

export function asanaStoryToComment(story: AsanaStory): AsanaTaskComment | null {
  if (!isAsanaChatStory(story)) return null;
  const attachments = mapAsanaAttachments(story.attachments);
  const text = story.text?.trim() || (story.html_text ? stripHtml(story.html_text) : "");
  if (!text && attachments.length === 0) return null;
  return {
    id: story.gid,
    createdAt: story.created_at || "",
    authorName: story.created_by?.name?.trim() || "Asana",
    text,
    attachments,
  };
}

export async function getTask(taskGid: string): Promise<AsanaTask> {
  const qs = new URLSearchParams({
    opt_fields: ["name", "permalink_url", "notes", "created_at", "assignee.name", "assignee.email"].join(","),
  });
  const data = await asanaFetch<{ data: AsanaTask }>(`/tasks/${taskGid}?${qs}`);
  return data.data;
}

export async function listTaskStories(taskGid: string): Promise<AsanaStory[]> {
  const optFields = [
    "created_at",
    "created_by.name",
    "text",
    "html_text",
    "type",
    "resource_subtype",
    "attachments",
    ...ATTACHMENT_OPT_FIELDS.split(",").map((field) => `attachments.${field}`),
  ].join(",");
  const out: AsanaStory[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams({
      limit: "100",
      opt_fields: optFields,
      ...(offset ? { offset } : {}),
    });
    const data = await asanaFetch<{
      data: AsanaStory[];
      next_page?: { offset?: string } | null;
    }>(`/tasks/${taskGid}/stories?${qs}`);
    out.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);
  return out;
}

export async function listTaskAttachments(taskGid: string): Promise<AsanaAttachment[]> {
  const out: AsanaAttachment[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams({
      parent: taskGid,
      limit: "100",
      opt_fields: ATTACHMENT_OPT_FIELDS,
      ...(offset ? { offset } : {}),
    });
    const data = await asanaFetch<{
      data: AsanaAttachmentRaw[];
      next_page?: { offset?: string } | null;
    }>(`/attachments?${qs}`);
    out.push(...mapAsanaAttachments(data.data));
    offset = data.next_page?.offset;
  } while (offset);
  return out;
}

export async function getAttachment(attachmentGid: string): Promise<AsanaAttachment> {
  const qs = new URLSearchParams({ opt_fields: ATTACHMENT_OPT_FIELDS });
  const data = await asanaFetch<{ data: AsanaAttachmentRaw }>(
    `/attachments/${attachmentGid}?${qs}`,
  );
  const mapped = mapAsanaAttachment(data.data);
  if (!mapped) throw new Error("找不到 Asana 附件");
  return mapped;
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
    "assignee.email",
    "assignee.gid",
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

  // BWT-prefixed tasks default to web+system unless clearly BWL event
  if (/^bwt/i.test(taskName.trim()) && !/\bbwl\b/i.test(taskName)) {
    types.add("bwt_web");
    types.add("bwt_system");
    types.delete("bwl_event");
  }

  if (types.size === 0 && projectTypes.length) {
    projectTypes.forEach((t) => types.add(t));
  }
  if (types.size === 0 && /^bwt/i.test(taskName)) types.add("bwt_web");

  return [...types];
}

export function taskInquiryDate(task: AsanaTask, project?: SyncProjectConfig): string {
  if (project?.sync_date_mode === "active_deal" && task.due_on) {
    return task.due_on;
  }
  if (task.created_at) return task.created_at.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function taskCreatedYear(task: AsanaTask): number | null {
  if (!task.created_at) return null;
  const y = parseInt(task.created_at.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export function taskDueYear(task: AsanaTask): number | null {
  if (!task.due_on) return null;
  const y = parseInt(task.due_on.slice(0, 4), 10);
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

/** Filter by sync_date_mode and year config. */
export function isTaskInSyncRange(task: AsanaTask, project: SyncProjectConfig): boolean {
  const minYear =
    (project.sync_year_from && project.sync_year_from > 2000
      ? project.sync_year_from
      : null) ?? resolveSyncYear(project);

  const mode = project.sync_date_mode ?? (
    project.sync_year_from ? "created_from" : "created_exact"
  );

  if (mode === "active_deal") {
    if (task.completed) return false;
    const dueYear = taskDueYear(task);
    const createdYear = taskCreatedYear(task);
    if (dueYear !== null && dueYear >= minYear) return true;
    if (createdYear !== null && createdYear >= minYear) return true;
    if (!task.due_on) return true;
    return false;
  }

  const year = taskCreatedYear(task);
  if (year === null) return false;
  if (mode === "created_from") return year >= minYear;
  return year === minYear;
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

/** Optional section filter — partial case-insensitive match on section name. */
export function taskMatchesSectionFilter(
  task: AsanaTask,
  project: SyncProjectConfig,
): boolean {
  const pattern = project.sync_section_name?.trim();
  if (!pattern) return true;
  const section = taskSectionName(task, project.project_gid);
  return section.toLowerCase().includes(pattern.toLowerCase());
}

export function asanaTaskToSyncedRow(
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
  const projectTypes = project.sync_project_types_only
    ? [...(project.project_types || [])]
    : inferProjectTypes(task.name, project.project_types || [], project.project_name);
  const mappedStatus =
    project.sync_default_status ??
    mapCustomFieldStatus(statusLabel, task);

  return {
    asana_task_gid: task.gid,
    asana_project_gid: project.project_gid,
    asana_project_name: project.project_name,
    asana_section_name: sectionName || null,
    client_name: clientName || null,
    display_name: task.name.trim(),
    inquiry_date: taskInquiryDate(task, project),
    description: description || null,
    project_types: projectTypes,
    assigned_pm: task.assignee?.gid || null,
    assigned_pm_name: task.assignee?.name || "",
    mapped_status: mappedStatus,
    asana_link: task.permalink_url || `https://app.asana.com/0/0/${task.gid}`,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

/** @deprecated Sync writes asana_synced_tasks via asanaTaskToSyncedRow. Kept for tests / callers. */
export function asanaTaskToRecord(
  task: AsanaTask,
  project: SyncProjectConfig,
  syncedAt: string,
) {
  const row = asanaTaskToSyncedRow(task, project, syncedAt);
  return {
    id: `asana_${task.gid}`,
    asana_task_gid: row.asana_task_gid,
    asana_project_gid: row.asana_project_gid,
    asana_project_name: row.asana_project_name,
    asana_section_name: row.asana_section_name,
    pitching_code: `ASANA-${task.gid.slice(-8)}`,
    client_name: row.client_name,
    display_name: row.display_name,
    inquiry_date: row.inquiry_date,
    description: row.description,
    project_types: row.project_types,
    assigned_pm: row.assigned_pm,
    assigned_pm_name: row.assigned_pm_name,
    status: row.mapped_status,
    asana_link: row.asana_link,
    synced_at: row.synced_at,
    updated_at: row.updated_at,
  };
}
