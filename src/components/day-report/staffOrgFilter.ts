/** Sentinel values for 公司 / 品牌 / 團隊 filters on staffs. */
export const STAFF_ORG_ALL = '__ALL__';
export const STAFF_ORG_UNASSIGNED_COMPANY = '__UNASSIGNED_COMPANY__';
export const STAFF_ORG_UNASSIGNED_BRAND = '__UNASSIGNED_BRAND__';
export const STAFF_ORG_UNASSIGNED_TEAM = '__UNASSIGNED_TEAM__';

export type StaffOrgFields = {
  company_list_id?: string | null;
  brand_list_id?: string | null;
  team_name?: string | null;
};

export type StaffOrgFilter = {
  companyId: string;
  brandId: string;
  teamName: string;
};

function norm(value: string | null | undefined): string {
  return (value || '').trim();
}

export function matchesCompanyFilter(
  companyListId: string | null | undefined,
  selected: string,
): boolean {
  if (!selected || selected === STAFF_ORG_ALL) return true;
  const id = norm(companyListId);
  if (selected === STAFF_ORG_UNASSIGNED_COMPANY) return !id;
  return id === selected;
}

export function matchesBrandFilter(
  brandListId: string | null | undefined,
  selected: string,
): boolean {
  if (!selected || selected === STAFF_ORG_ALL) return true;
  const id = norm(brandListId);
  if (selected === STAFF_ORG_UNASSIGNED_BRAND) return !id;
  return id === selected;
}

export function matchesTeamFilter(
  teamName: string | null | undefined,
  selected: string,
): boolean {
  if (!selected || selected === STAFF_ORG_ALL) return true;
  const name = norm(teamName);
  if (selected === STAFF_ORG_UNASSIGNED_TEAM) return !name;
  return name === selected;
}

export function matchesStaffOrgFilter(
  staff: StaffOrgFields,
  filter: StaffOrgFilter,
): boolean {
  return matchesCompanyFilter(staff.company_list_id, filter.companyId)
    && matchesBrandFilter(staff.brand_list_id, filter.brandId)
    && matchesTeamFilter(staff.team_name, filter.teamName);
}

export function distinctTeamNames(staffList: StaffOrgFields[]): string[] {
  const set = new Set<string>();
  staffList.forEach((s) => {
    const name = norm(s.team_name);
    if (name) set.add(name);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

export function brandsForCompany<T extends { companyId: string }>(
  brands: T[],
  companyId: string,
): T[] {
  if (!companyId || companyId === STAFF_ORG_ALL || companyId === STAFF_ORG_UNASSIGNED_COMPANY) {
    return brands;
  }
  return brands.filter((b) => b.companyId === companyId);
}

export function nextBrandAfterCompanyChange<T extends { id: string; companyId: string }>(
  currentBrandId: string,
  brands: T[],
  companyId: string,
): string {
  if (currentBrandId === STAFF_ORG_ALL || currentBrandId === STAFF_ORG_UNASSIGNED_BRAND) {
    return currentBrandId;
  }
  const allowed = brandsForCompany(brands, companyId);
  return allowed.some((b) => b.id === currentBrandId) ? currentBrandId : STAFF_ORG_ALL;
}

export function nextTeamAfterScopeChange(
  currentTeam: string,
  teamOptions: string[],
): string {
  if (currentTeam === STAFF_ORG_ALL || currentTeam === STAFF_ORG_UNASSIGNED_TEAM) {
    return currentTeam;
  }
  return teamOptions.includes(currentTeam) ? currentTeam : STAFF_ORG_ALL;
}

export function companyOptionValue(company: { uuid?: string | null; id: string }): string {
  return (company.uuid || company.id || '').trim();
}
