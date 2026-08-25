export type ProjectSelectRelatedType =
  | 'quotation_client'
  | 'webandsystem'
  | 'vchannel'
  | 'manual';

export type ProjectSelectRelatedTypeFilter = 'all' | ProjectSelectRelatedType;

export type ProjectSelectItem = {
  id: string;
  name: string;
  relatedType?: ProjectSelectRelatedType;
};

export const PROJECT_RELATED_TYPE_ORDER: ProjectSelectRelatedType[] = [
  'webandsystem',
  'quotation_client',
  'vchannel',
  'manual',
];

export const PROJECT_SELECT_TYPE_LABELS: Record<ProjectSelectRelatedType, string> = {
  webandsystem: '網站/系統',
  quotation_client: '客戶項目',
  vchannel: '影片頻道',
  manual: '自訂',
};

export function relatedTypesInItems(items: ProjectSelectItem[]): ProjectSelectRelatedType[] {
  const present = new Set<ProjectSelectRelatedType>();
  for (const item of items) {
    if (item.relatedType) present.add(item.relatedType);
  }
  return PROJECT_RELATED_TYPE_ORDER.filter((type) => present.has(type));
}

export function filterProjectSelectItems(
  items: ProjectSelectItem[],
  searchTerm: string,
  relatedType: ProjectSelectRelatedTypeFilter,
): ProjectSelectItem[] {
  const query = searchTerm.trim().toLowerCase();
  return items.filter((item) => {
    if (relatedType !== 'all' && item.relatedType !== relatedType) return false;
    if (query && !item.name.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function projectSelectTypeLabel(type: ProjectSelectRelatedTypeFilter): string {
  return type === 'all' ? '全部' : PROJECT_SELECT_TYPE_LABELS[type];
}
