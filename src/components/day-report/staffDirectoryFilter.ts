import type { Company } from '@/types/app';

export const STAFF_FILTER_ALL = 'all';

export type StaffStatusFilter = 'all' | 'active' | 'inactive';

/** Fields used to filter 管理分析 pages by employment status, BU, team, and position. */
export type StaffFilterFields = {
  id: string;
  status?: string | null;
  termination_date?: string | null;
  company_list_id?: string | null;
  team_name?: string | null;
  position?: string | null;
};

export type StaffDirectoryFilterState = {
  status: StaffStatusFilter;
  buId: string;
  team: string;
  position: string;
};

export type BuOption = { id: string; label: string };

export const DEFAULT_STAFF_DIRECTORY_FILTER: StaffDirectoryFilterState = {
  status: 'active',
  buId: STAFF_FILTER_ALL,
  team: STAFF_FILTER_ALL,
  position: STAFF_FILTER_ALL,
};

function norm(value: string | null | undefined): string {
  return (value || '').trim();
}

export function isActiveEmployment(staff: {
  status?: string | null;
  termination_date?: string | null;
}): boolean {
  return norm(staff.status).toLowerCase() === 'active' && !norm(staff.termination_date);
}

export function matchesStaffDirectoryFilter(
  staff: StaffFilterFields,
  filter: StaffDirectoryFilterState,
): boolean {
  const active = isActiveEmployment(staff);
  const matchStatus = filter.status === 'all'
    || (filter.status === 'active' && active)
    || (filter.status === 'inactive' && !active);
  const matchBu = filter.buId === STAFF_FILTER_ALL || norm(staff.company_list_id) === filter.buId;
  const matchTeam = filter.team === STAFF_FILTER_ALL || norm(staff.team_name) === filter.team;
  const matchPosition = filter.position === STAFF_FILTER_ALL || norm(staff.position) === filter.position;
  return matchStatus && matchBu && matchTeam && matchPosition;
}

function distinctSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function companyLabel(company: Company | undefined, fallbackId: string): string {
  if (!company) return fallbackId;
  return norm(company.companyCode) || norm(company.companyNameZh) || norm(company.companyNameEn) || fallbackId;
}

export function buOptionsFor(
  roster: StaffFilterFields[],
  companies: Company[],
  filter: StaffDirectoryFilterState,
): BuOption[] {
  const scoped = roster.filter((s) => matchesStaffDirectoryFilter(s, {
    ...filter,
    buId: STAFF_FILTER_ALL,
    team: STAFF_FILTER_ALL,
    position: STAFF_FILTER_ALL,
  }));
  const byKey = new Map<string, Company>();
  companies.forEach((company) => {
    if (company.uuid) byKey.set(company.uuid, company);
    if (company.id) byKey.set(company.id, company);
  });
  const ids = distinctSorted(scoped.map((s) => norm(s.company_list_id)));
  return ids
    .map((id) => ({ id, label: companyLabel(byKey.get(id), id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}

export function teamOptionsFor(
  roster: StaffFilterFields[],
  filter: StaffDirectoryFilterState,
): string[] {
  const scoped = roster.filter((s) => matchesStaffDirectoryFilter(s, {
    ...filter,
    team: STAFF_FILTER_ALL,
    position: STAFF_FILTER_ALL,
  }));
  return distinctSorted(scoped.map((s) => norm(s.team_name)));
}

export function positionOptionsFor(
  roster: StaffFilterFields[],
  filter: StaffDirectoryFilterState,
): string[] {
  const scoped = roster.filter((s) => matchesStaffDirectoryFilter(s, {
    ...filter,
    position: STAFF_FILTER_ALL,
  }));
  return distinctSorted(scoped.map((s) => norm(s.position)));
}
