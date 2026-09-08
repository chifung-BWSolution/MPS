export type ProjectSelectKind = 'website' | 'system' | 'quotation_client' | 'vchannel';
export type ProjectSelectKindFilter = 'all' | ProjectSelectKind;

export type ProjectSelectItem = {
  id: string;
  name: string;
  kind?: ProjectSelectKind;
  relatedId?: string;
};

export const PROJECT_SELECT_KIND_ORDER: ProjectSelectKind[] = [
  'website',
  'system',
  'quotation_client',
  'vchannel',
];

export const PROJECT_SELECT_KIND_LABELS: Record<ProjectSelectKind, string> = {
  website: '網站',
  system: '系統',
  quotation_client: '客戶項目',
  vchannel: '影片頻道',
};

export const PROJECT_SELECT_KIND_BADGE_CLASS: Record<ProjectSelectKind, string> = {
  website: 'bg-teal-50 text-teal-700 border-teal-200',
  system: 'bg-purple-50 text-purple-700 border-purple-200',
  quotation_client: 'bg-amber-50 text-amber-700 border-amber-200',
  vchannel: 'bg-violet-50 text-violet-700 border-violet-200',
};

export function kindsInItems(items: ProjectSelectItem[]): ProjectSelectKind[] {
  const present = new Set<ProjectSelectKind>();
  for (const item of items) {
    if (item.kind) present.add(item.kind);
  }
  return PROJECT_SELECT_KIND_ORDER.filter((kind) => present.has(kind));
}

export function filterProjectSelectItems(
  items: ProjectSelectItem[],
  searchTerm: string,
  kind: ProjectSelectKindFilter,
): ProjectSelectItem[] {
  const query = searchTerm.trim().toLowerCase();
  return items.filter((item) => {
    if (kind !== 'all' && item.kind !== kind) return false;
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function projectSelectKindLabel(type: ProjectSelectKindFilter): string {
  return type === 'all' ? '全部' : PROJECT_SELECT_KIND_LABELS[type];
}
