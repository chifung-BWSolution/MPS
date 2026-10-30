export type ReportProjectKind =
  | 'system'
  | 'website'
  | 'quotation_client'
  | 'vchannel'
  | 'manual'
  | 'orphan';

export type ReportProjectKindFilter = 'all' | ReportProjectKind;

export const REPORT_PROJECT_KIND_OPTIONS: { id: ReportProjectKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'system', label: '系統' },
  { id: 'website', label: '網站' },
  { id: 'quotation_client', label: '客戶項目' },
  { id: 'vchannel', label: '影片頻道' },
  { id: 'manual', label: '自訂' },
  { id: 'orphan', label: '異常' },
];

export const REPORT_PROJECT_KIND_LABELS: Record<ReportProjectKind, string> = {
  system: '系統',
  website: '網站',
  quotation_client: '客戶項目',
  vchannel: '影片頻道',
  manual: '自訂',
  orphan: '異常',
};

type ProjectKindSource = {
  relatedType?: string | null;
  profileType?: string | null;
};

/** Missing project rows are 異常. Website/system rows use profile type; other related types keep their own label. */
export function reportProjectKind(
  profile: ProjectKindSource | null | undefined,
): ReportProjectKind {
  if (!profile) return 'orphan';
  const related = (profile.relatedType || '').toLowerCase();
  const profileType = (profile.profileType || '').toLowerCase();
  if (related === 'quotation_client') return 'quotation_client';
  if (related === 'vchannel') return 'vchannel';
  if (related === 'manual') return 'manual';
  if (related === 'webandsystem') return profileType === 'system' ? 'system' : 'website';
  if (profileType === 'system' || related === 'system') return 'system';
  if (profileType === 'website' || related === 'website') return 'website';
  return 'orphan';
}
