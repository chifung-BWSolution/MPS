export const LABOUR_HOURLY_RATE = 500;
export const LABOUR_RATE_LABEL = `$${LABOUR_HOURLY_RATE}/hr`;
export const LABOUR_COST_LABEL = '人工成本 Labour';

export type ClientProjectLabourSource = {
  id: string;
  webandsystemListId?: string | null;
};

export type LabourProjectHub = {
  id: string;
  relatedType: string;
  relatedId: string | null;
};

export type LabourHourRow = {
  relatedId: string | null;
  hours: number | string | null;
};

export type LabourTaskInput = {
  staffId: string;
  hours: number;
};

export type StaffLabourGroup<T extends LabourTaskInput = LabourTaskInput> = {
  staffId: string;
  totalHours: number;
  labourCost: number;
  ratio: number | null;
  tasks: Array<T & { labourCost: number }>;
};

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function roundHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * 10) / 10;
}

export function toHours(value: number | string | null | undefined): number {
  const n = value == null || value === '' ? 0 : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Internal staff cost. Not a supplier expense. */
export function labourCost(hours: number): number {
  return roundMoney(toHours(hours) * LABOUR_HOURLY_RATE);
}

/** Staff hours as a percent of the project total. Null when the project has no hours. */
export function hourSharePercent(part: number, total: number): number | null {
  if (!(total > 0)) return null;
  return Math.round((part / total) * 1000) / 10;
}

export function formatHourSharePercent(ratio: number | null): string {
  if (ratio == null) return '—';
  return `${ratio.toFixed(1)}%`;
}

/**
 * Day-report related ids that belong to one client project:
 * the project id, its projects-hub id, and a linked website plus that website's hub id.
 */
export function relatedIdsForClientProject(
  project: ClientProjectLabourSource,
  hubs: LabourProjectHub[],
): string[] {
  const projectId = project.id.trim();
  const ids = new Set<string>();
  if (projectId) ids.add(projectId);

  for (const hub of hubs) {
    const hubId = hub.id.trim();
    if (!hubId) continue;
    if (hub.relatedType === 'quotation_client' && hub.relatedId?.trim() === projectId) {
      ids.add(hubId);
    }
  }

  const websiteId = project.webandsystemListId?.trim() || '';
  if (!websiteId) return [...ids];
  ids.add(websiteId);

  for (const hub of hubs) {
    const hubId = hub.id.trim();
    if (!hubId) continue;
    if (hub.relatedType === 'webandsystem' && hub.relatedId?.trim() === websiteId) {
      ids.add(hubId);
    }
  }

  return [...ids];
}

export function collectClientProjectRelatedIds(
  projects: ClientProjectLabourSource[],
  hubs: LabourProjectHub[],
): string[] {
  const ids = new Set<string>();
  for (const project of projects) {
    for (const id of relatedIdsForClientProject(project, hubs)) ids.add(id);
  }
  return [...ids];
}

/** Sum hours onto each client project. A shared website's hours count on every linked project. */
export function attributeHoursToClientProjects(
  hourRows: LabourHourRow[],
  projects: ClientProjectLabourSource[],
  hubs: LabourProjectHub[],
): Map<string, number> {
  const owners = new Map<string, Set<string>>();
  for (const project of projects) {
    const projectId = project.id.trim();
    if (!projectId) continue;
    for (const relatedId of relatedIdsForClientProject(project, hubs)) {
      const set = owners.get(relatedId) ?? new Set<string>();
      set.add(projectId);
      owners.set(relatedId, set);
    }
  }

  const totals = new Map<string, number>();
  for (const row of hourRows) {
    const relatedId = row.relatedId?.trim();
    if (!relatedId) continue;
    const projectIds = owners.get(relatedId);
    if (!projectIds?.size) continue;
    const hours = toHours(row.hours);
    if (!hours) continue;
    for (const projectId of projectIds) {
      totals.set(projectId, (totals.get(projectId) ?? 0) + hours);
    }
  }

  for (const [projectId, hours] of totals) {
    const rounded = roundHours(hours);
    if (rounded <= 0) totals.delete(projectId);
    else totals.set(projectId, rounded);
  }
  return totals;
}

export function groupStaffLabour<T extends LabourTaskInput>(tasks: T[]): StaffLabourGroup<T>[] {
  const byStaff = new Map<string, Array<T & { labourCost: number }>>();
  for (const task of tasks) {
    const staffId = task.staffId.trim();
    if (!staffId) continue;
    const decorated = { ...task, staffId, labourCost: labourCost(task.hours) };
    const list = byStaff.get(staffId) ?? [];
    list.push(decorated);
    byStaff.set(staffId, list);
  }

  const drafts = [...byStaff.entries()].map(([staffId, staffTasks]) => {
    const totalHours = roundHours(staffTasks.reduce((sum, task) => sum + toHours(task.hours), 0));
    const cost = roundMoney(staffTasks.reduce((sum, task) => sum + task.labourCost, 0));
    return { staffId, totalHours, labourCost: cost, tasks: staffTasks };
  });
  const projectHours = roundHours(drafts.reduce((sum, group) => sum + group.totalHours, 0));
  return drafts.map((group) => ({
    ...group,
    ratio: hourSharePercent(group.totalHours, projectHours),
  }));
}

export function sumStaffLabourCost(groups: Array<Pick<StaffLabourGroup, 'labourCost'>>): number {
  return roundMoney(groups.reduce((sum, group) => sum + group.labourCost, 0));
}
