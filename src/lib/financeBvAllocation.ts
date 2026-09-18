import { pitchingStatusConfig, type PitchingStatus } from '@/data/pitchingData';
import { compareQuotationListValues, type QuotationListSortDir } from '@/lib/quotationListSort';
import { nextLedgerSort } from '@/lib/financeLedgers';
import {
  BV_RATIO_TOTAL,
  COMPANY_BV_LABEL,
  COMPANY_BV_RATIO,
  formatBvRatio,
  projectBvTotal,
  roundBvRatio,
  sumBvRatios,
} from '@/lib/quotationBv';
import type { ProjectHubRelatedType } from '@/lib/projectsHub';

export const BV_RATIO_FILTERS = ['all', 'equal', 'under', 'over'] as const;
export type BvRatioFilter = (typeof BV_RATIO_FILTERS)[number];
export type BvRatioStatus = Exclude<BvRatioFilter, 'all'>;

export const BV_RATIO_FILTER_LABELS: Record<BvRatioFilter, string> = {
  all: '全部 BV 狀態',
  equal: 'BV = 100%（已完成）',
  under: 'BV < 100%（未完成）',
  over: 'BV > 100%（超額）',
};

export type BvAllocationStaffRow = {
  id: string;
  projectId: string;
  staffId: string;
  staffName: string;
  staffPosition?: string;
  bvRatio: number;
};

export type BvStaffNameItem = {
  staffId: string;
  staffName: string;
  isMainPm: boolean;
};

export type BvMainPmRef = {
  id?: string;
  name?: string;
};

export type BvAllocationGroup = {
  projectId: string;
  projectName: string;
  pitchingCode?: string;
  clientName?: string;
  relatedType?: ProjectHubRelatedType;
  relatedId?: string;
  quotationClientProjectId?: string;
  websiteId?: string;
  projectStatus?: string;
  projectTypeLabel?: string;
  mainPmId?: string;
  mainPmName?: string;
  signedDate?: string;
  handoverDate?: string;
  estimatedIncome?: number;
  estimatedProfit?: number;
  staffNameItems: BvStaffNameItem[];
  staffNames: string;
  staffCount: number;
  staffTotal: number;
  totalRatio: number;
  ratioStatus: BvRatioStatus;
  staff: BvAllocationStaffRow[];
};

export type BvAllocationProjectInfo = Omit<
  BvAllocationGroup,
  'staffNameItems' | 'staffNames' | 'staffCount' | 'staffTotal' | 'totalRatio' | 'ratioStatus' | 'staff'
>;

export type BvAllocationSortKey =
  | 'signedDate'
  | 'handoverDate'
  | 'projectName'
  | 'projectTypeLabel'
  | 'staffNames'
  | 'projectStatus'
  | 'staffCount'
  | 'totalRatio'
  | 'estimatedIncome'
  | 'estimatedProfit';

export type BvAllocationSortDir = QuotationListSortDir;

export const DEFAULT_BV_ALLOCATION_SORT_KEY: BvAllocationSortKey = 'signedDate';
export const DEFAULT_BV_ALLOCATION_SORT_DIR: BvAllocationSortDir = 'desc';
export const DEFAULT_BV_RATIO_FILTER: BvRatioFilter = 'all';

export function classifyBvRatioStatus(totalRatio: number): BvRatioStatus {
  const total = roundBvRatio(totalRatio);
  if (total === BV_RATIO_TOTAL) return 'equal';
  if (total > BV_RATIO_TOTAL) return 'over';
  return 'under';
}

/** Website hub rows already represented by a linked quotation_client_project. */
export function isLinkedWebsiteListing(
  info: BvAllocationProjectInfo | undefined,
  projects: Iterable<BvAllocationProjectInfo>,
): boolean {
  if (info?.relatedType !== 'webandsystem' || !info.websiteId) return false;
  for (const project of projects) {
    if (project.relatedType !== 'quotation_client') continue;
    if (project.websiteId === info.websiteId) return true;
  }
  return false;
}

/** Fold website-hub BV onto the unique linked client-project hub. */
export function remapLinkedWebsiteBvProjectId(
  projectId: string,
  projects: Map<string, BvAllocationProjectInfo>,
): string {
  const info = projects.get(projectId);
  if (info?.relatedType !== 'webandsystem' || !info.websiteId) return projectId;
  const owners = [...projects.values()].filter(
    (project) => project.relatedType === 'quotation_client' && project.websiteId === info.websiteId,
  );
  return owners.length === 1 ? owners[0].projectId : projectId;
}

export function isActiveBvStaffRow(row: BvAllocationStaffRow): boolean {
  return Number.isFinite(row.bvRatio) && row.bvRatio > 0;
}

export function isBvStaffMainPm(row: BvAllocationStaffRow, mainPm?: BvMainPmRef): boolean {
  const pmId = mainPm?.id?.trim();
  if (pmId) return row.staffId.trim() === pmId;
  const pmName = mainPm?.name?.trim();
  if (pmName) return row.staffName.trim() === pmName;
  return false;
}

/** Distinct collaborator names that still have a staff BV row. Main PM is first when they also have BV. */
export function listBvStaffNames(
  staff: BvAllocationStaffRow[],
  mainPm?: BvMainPmRef,
): BvStaffNameItem[] {
  const seen = new Set<string>();
  const items: BvStaffNameItem[] = [];
  const ordered = [...staff].filter(isActiveBvStaffRow).sort((a, b) => {
    const pmDelta = Number(isBvStaffMainPm(b, mainPm)) - Number(isBvStaffMainPm(a, mainPm));
    if (pmDelta !== 0) return pmDelta;
    return b.bvRatio - a.bvRatio || a.staffName.localeCompare(b.staffName, 'zh-Hant');
  });

  for (const row of ordered) {
    const key = row.staffId.trim() || row.staffName.trim();
    const name = row.staffName.trim();
    if (!key || !name || name === '—' || seen.has(key)) continue;
    seen.add(key);
    items.push({
      staffId: row.staffId,
      staffName: name,
      isMainPm: isBvStaffMainPm(row, mainPm),
    });
  }
  return items;
}

export function formatBvStaffNames(staff: BvAllocationStaffRow[], mainPm?: BvMainPmRef): string {
  return listBvStaffNames(staff, mainPm)
    .map((row) => row.staffName)
    .join('、');
}

function buildGroup(
  projectId: string,
  staff: BvAllocationStaffRow[],
  info: BvAllocationProjectInfo | undefined,
): BvAllocationGroup {
  const activeStaff = staff.filter(isActiveBvStaffRow);
  const mainPm = { id: info?.mainPmId, name: info?.mainPmName };
  const staffNameItems = listBvStaffNames(activeStaff, mainPm);
  const ratios = activeStaff.map((row) => row.bvRatio);
  const staffTotal = sumBvRatios(ratios);
  const totalRatio = projectBvTotal(ratios);
  return {
    projectId,
    projectName: info?.projectName?.trim() || '未指定項目',
    pitchingCode: info?.pitchingCode,
    clientName: info?.clientName,
    relatedType: info?.relatedType,
    relatedId: info?.relatedId,
    quotationClientProjectId: info?.quotationClientProjectId,
    websiteId: info?.websiteId,
    projectStatus: info?.projectStatus,
    projectTypeLabel: info?.projectTypeLabel,
    mainPmId: info?.mainPmId,
    mainPmName: info?.mainPmName,
    signedDate: info?.signedDate,
    handoverDate: info?.handoverDate,
    estimatedIncome: info?.estimatedIncome,
    estimatedProfit: info?.estimatedProfit,
    staffNameItems,
    staffNames: staffNameItems.map((row) => row.staffName).join('、'),
    staffCount: activeStaff.length,
    staffTotal,
    totalRatio,
    ratioStatus: classifyBvRatioStatus(totalRatio),
    staff: activeStaff,
  };
}

export function groupBvAllocations(
  rows: BvAllocationStaffRow[],
  projects: Map<string, BvAllocationProjectInfo>,
): BvAllocationGroup[] {
  const remapped = rows.map((row) => {
    const projectId = remapLinkedWebsiteBvProjectId(row.projectId, projects);
    return projectId === row.projectId ? row : { ...row, projectId };
  });

  const byProject = new Map<string, BvAllocationStaffRow[]>();
  for (const row of remapped) {
    const list = byProject.get(row.projectId) ?? [];
    list.push(row);
    byProject.set(row.projectId, list);
  }

  const projectIds: string[] = [];
  const seen = new Set<string>();
  for (const [projectId, info] of projects) {
    if (isLinkedWebsiteListing(info, projects.values())) continue;
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    projectIds.push(projectId);
  }
  for (const projectId of byProject.keys()) {
    if (isLinkedWebsiteListing(projects.get(projectId), projects.values())) continue;
    if (seen.has(projectId)) continue;
    seen.add(projectId);
    projectIds.push(projectId);
  }

  return projectIds.map((projectId) =>
    buildGroup(projectId, byProject.get(projectId) ?? [], projects.get(projectId)),
  );
}

export function filterBvAllocations(
  groups: BvAllocationGroup[],
  opts: { search?: string; ratioStatus?: BvRatioFilter; staffId?: string } = {},
): BvAllocationGroup[] {
  const query = opts.search?.trim().toLowerCase() ?? '';
  const ratioStatus = opts.ratioStatus ?? DEFAULT_BV_RATIO_FILTER;
  const staffId = opts.staffId?.trim() ?? '';

  return groups.filter((group) => {
    if (ratioStatus !== 'all' && group.ratioStatus !== ratioStatus) return false;
    if (staffId && !group.staff.some((row) => row.staffId === staffId)) return false;
    if (!query) return true;
    const haystack = [
      group.projectName,
      group.pitchingCode,
      group.clientName,
      group.projectTypeLabel,
      group.staffNames,
      group.projectStatus,
      projectStatusLabel(group.projectStatus),
      ...group.staff.map((row) => row.staffName),
      ...group.staff.map((row) => row.staffPosition),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function summarizeBvAllocations(groups: BvAllocationGroup[]) {
  return groups.reduce(
    (acc, group) => {
      acc.total += 1;
      acc[group.ratioStatus] += 1;
      return acc;
    },
    { total: 0, equal: 0, under: 0, over: 0 },
  );
}

export function uniqueBvStaffOptions(groups: BvAllocationGroup[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const group of groups) {
    for (const row of group.staff) {
      if (!row.staffId || seen.has(row.staffId)) continue;
      seen.set(row.staffId, row.staffName);
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

function sortValue(group: BvAllocationGroup, key: BvAllocationSortKey): string | number | null {
  switch (key) {
    case 'signedDate':
      return group.signedDate ?? null;
    case 'handoverDate':
      return group.handoverDate ?? null;
    case 'projectName':
      return group.projectName;
    case 'projectTypeLabel':
      return group.projectTypeLabel ?? null;
    case 'staffNames':
      return group.staffNames || null;
    case 'projectStatus':
      return projectStatusLabel(group.projectStatus);
    case 'staffCount':
      return group.staffCount;
    case 'totalRatio':
      return group.totalRatio;
    case 'estimatedIncome':
      return group.estimatedIncome ?? null;
    case 'estimatedProfit':
      return group.estimatedProfit ?? null;
  }
}

export function sortBvAllocations(
  groups: BvAllocationGroup[],
  key: BvAllocationSortKey = DEFAULT_BV_ALLOCATION_SORT_KEY,
  dir: BvAllocationSortDir = DEFAULT_BV_ALLOCATION_SORT_DIR,
): BvAllocationGroup[] {
  return [...groups].sort((a, b) => {
    const primary = compareQuotationListValues(sortValue(a, key), sortValue(b, key), dir);
    if (primary !== 0) return primary;
    return compareQuotationListValues(a.projectName, b.projectName, 'asc');
  });
}

export function nextBvAllocationSort(
  currentKey: BvAllocationSortKey,
  currentDir: BvAllocationSortDir,
  clickedKey: BvAllocationSortKey,
): { key: BvAllocationSortKey; dir: BvAllocationSortDir } {
  return nextLedgerSort(currentKey, currentDir, clickedKey);
}

export function projectStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  const known = pitchingStatusConfig[status as PitchingStatus];
  return known?.label ?? status;
}

export function formatBvPercent(value: number): string {
  return `${formatBvRatio(value)}%`;
}

export function companyBvDetailRow(): Pick<BvAllocationStaffRow, 'staffName' | 'staffPosition' | 'bvRatio'> {
  return {
    staffName: COMPANY_BV_LABEL,
    staffPosition: '固定政策',
    bvRatio: COMPANY_BV_RATIO,
  };
}
