import type { AsanaCaseClosedFilter, AsanaImportFilter } from '@/lib/asanaPendingFilters';
import { matchesAsanaPendingFilters } from '@/lib/asanaPendingFilters';

export type ProjectSelectKind = 'website' | 'system' | 'quotation_client' | 'vchannel' | 'asana_task';
export type ProjectSelectKindFilter = 'all' | ProjectSelectKind;

export type ProjectSelectItem = {
  id: string;
  name: string;
  kind?: ProjectSelectKind;
  relatedId?: string;
  asanaProjectGid?: string;
  asanaProjectName?: string;
  asanaImported?: boolean;
  asanaCaseClosed?: boolean;
};

export type AsanaProjectFilterOption = {
  id: string;
  name: string;
};

export const PROJECT_SELECT_KIND_ORDER: ProjectSelectKind[] = [
  'website',
  'system',
  'quotation_client',
  'vchannel',
  'asana_task',
];

export const PROJECT_SELECT_KIND_LABELS: Record<ProjectSelectKind, string> = {
  website: '網站',
  system: '系統',
  quotation_client: '客戶項目',
  vchannel: '影片頻道',
  asana_task: 'Asana 項目',
};

export const PROJECT_SELECT_KIND_BADGE_CLASS: Record<ProjectSelectKind, string> = {
  website: 'bg-teal-50 text-teal-700 border-teal-200',
  system: 'bg-purple-50 text-purple-700 border-purple-200',
  quotation_client: 'bg-amber-50 text-amber-700 border-amber-200',
  vchannel: 'bg-violet-50 text-violet-700 border-violet-200',
  asana_task: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function kindsInItems(items: ProjectSelectItem[]): ProjectSelectKind[] {
  const present = new Set<ProjectSelectKind>();
  for (const item of items) {
    if (item.kind) present.add(item.kind);
  }
  return PROJECT_SELECT_KIND_ORDER.filter((kind) => present.has(kind));
}

/** Pitching boards that actually have a task in this list, using the board name. */
export function asanaPitchingProjectFilters(items: ProjectSelectItem[]): AsanaProjectFilterOption[] {
  const names = new Map<string, string>();
  for (const item of items) {
    if (item.kind !== 'asana_task' || !item.asanaProjectGid) continue;
    if (!names.has(item.asanaProjectGid)) {
      names.set(item.asanaProjectGid, item.asanaProjectName || item.asanaProjectGid);
    }
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

export function filterProjectSelectItems(
  items: ProjectSelectItem[],
  searchTerm: string,
  kind: ProjectSelectKindFilter,
  asanaProjectGid = 'all',
  asanaImportFilter: AsanaImportFilter = 'pending',
  asanaCaseClosedFilter: AsanaCaseClosedFilter = 'pending',
): ProjectSelectItem[] {
  const query = searchTerm.trim().toLowerCase();
  const projectGid = asanaProjectGid.trim();
  return items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (item.kind === 'asana_task' && !matchesAsanaPendingFilters(
      {
        imported: Boolean(item.asanaImported),
        inquiryDate: '',
        caseClosedReason: item.asanaCaseClosed ? 'closed' : '',
      },
      { importFilter: asanaImportFilter, caseClosedFilter: asanaCaseClosedFilter },
    )) {
      return false;
    }
    if (
      kind === 'asana_task'
      && projectGid
      && projectGid !== 'all'
      && item.asanaProjectGid !== projectGid
    ) {
      return false;
    }
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function projectSelectKindLabel(type: ProjectSelectKindFilter): string {
  return type === 'all' ? '全部' : PROJECT_SELECT_KIND_LABELS[type];
}
