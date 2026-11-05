import {
  importedProjectIdsFromAsanaRefs,
  parseAsanaTaskGidFromLink,
  type QuotationProjectAsanaRef,
} from '@/lib/asanaTaskLink';
import type { ProjectSelectItem } from '@/lib/searchableProjectSelect';

export const ASANA_PROJECT_SELECT_KIND = 'asana_task' as const;
export const ASANA_PROJECT_LABEL = 'Asana 項目';

export function isAsanaTaskGid(value: string | null | undefined): boolean {
  return /^\d{6,}$/.test((value ?? '').trim());
}

export type AsanaSyncedTaskRef = {
  asanaTaskGid: string;
  displayName: string;
  asanaProjectGid?: string;
  caseClosedReason?: string;
};

export type AsanaPitchingProjectRef = {
  projectGid: string;
  projectName: string;
};

export type QuotationClientAsanaCandidate = QuotationProjectAsanaRef & {
  created_at?: string | null;
};

/** Asana tasks for the day-report picker. Imported and cancelled tasks stay in the list so the status filters can show them. */
export function pendingAsanaProjectSelectItems(
  tasks: AsanaSyncedTaskRef[],
  imported: Map<string, string> | ReadonlySet<string>,
  pitchingProjects: AsanaPitchingProjectRef[] = [],
): ProjectSelectItem[] {
  const importedGids = imported instanceof Map ? new Set(imported.keys()) : imported;
  const pitchingNames = new Map<string, string>();
  for (const project of pitchingProjects) {
    const projectGid = project.projectGid.trim();
    if (!projectGid) continue;
    pitchingNames.set(projectGid, project.projectName.trim() || projectGid);
  }
  const items: ProjectSelectItem[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    const gid = task.asanaTaskGid.trim();
    if (!isAsanaTaskGid(gid) || seen.has(gid)) continue;
    seen.add(gid);
    const projectGid = task.asanaProjectGid?.trim() || '';
    const projectName = pitchingNames.get(projectGid);
    items.push({
      id: gid,
      name: task.displayName.trim() || gid,
      kind: ASANA_PROJECT_SELECT_KIND,
      relatedId: gid,
      asanaImported: importedGids.has(gid),
      asanaCaseClosed: Boolean(task.caseClosedReason?.trim()),
      ...(projectName ? { asanaProjectGid: projectGid, asanaProjectName: projectName } : {}),
    });
  }
  return items;
}

/**
 * Prefer the client project whose asana_task_gid equals the gid.
 * Otherwise the oldest created_at, then id.
 */
export function pickQuotationClientForAsanaGid(
  rows: QuotationClientAsanaCandidate[],
  gid: string,
): QuotationClientAsanaCandidate | null {
  const target = gid.trim();
  const matches = rows.filter((row) => {
    const fromColumn = row.asana_task_gid?.trim() || '';
    const fromLink = parseAsanaTaskGidFromLink(row.asana_link) || '';
    return fromColumn === target || fromLink === target;
  });
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const aExact = (a.asana_task_gid?.trim() || '') === target ? 1 : 0;
    const bExact = (b.asana_task_gid?.trim() || '') === target ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aCreated = a.created_at || '';
    const bCreated = b.created_at || '';
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return matches[0] ?? null;
}

export function importedAsanaGidSet(
  projects: QuotationProjectAsanaRef[],
): Set<string> {
  return new Set(importedProjectIdsFromAsanaRefs(projects).keys());
}
