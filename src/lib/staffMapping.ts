/** MPS 部門選項（與 StaffDirectory 下拉一致） */
export const MPS_DEPARTMENTS = [
  'FC',
  'Wine',
  'Accounting & Admin',
  'Marketing & Video',
  'System',
] as const;

export type MpsDepartment = (typeof MPS_DEPARTMENTS)[number];

/** MPS 辦公室選項 */
export const MPS_OFFICES = ['香港', '深圳'] as const;
export type MpsOffice = (typeof MPS_OFFICES)[number];

const DEPARTMENT_SET = new Set<string>(MPS_DEPARTMENTS);
const OFFICE_SET = new Set<string>(MPS_OFFICES);

/** 將 OTC base_location 正規化為 MPS 辦公室值（香港 / 深圳） */
export function normalizeOffice(baseLocation: string | null | undefined): MpsOffice | null {
  const raw = (baseLocation || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('sz') || raw.includes('深圳') || raw.includes('shenzhen')) return '深圳';
  if (raw.includes('hk') || raw.includes('香港') || raw.includes('hong kong')) return '香港';
  return null;
}

/**
 * 根據 OTC Team 名稱（及可選 BU）映射至 MPS 部門。
 * Team 名稱來自 OTC2 staff.team_name，同步後存於 staffs.team_id。
 */
export function resolveDepartmentFromTeam(
  teamName: string | null | undefined,
  businessUnit?: string | null,
): MpsDepartment | null {
  const team = (teamName || '').trim();
  const bu = (businessUnit || '').trim().toLowerCase();
  if (!team && !bu) return null;

  if (/operation\s*admin|accounting|營運行政|會計/i.test(team)) {
    return 'Accounting & Admin';
  }

  if (/ob\s*system|商業系統/i.test(team) || (/\bsystem\b/i.test(team) && /ob|bwt/i.test(team))) {
    return 'System';
  }

  if (/^fc\s|fc\s*marketing|\bfc\b/i.test(team)) {
    return 'FC';
  }

  if (/marketing\s*and\s*branding|市場推廣|品牌設計/i.test(team)) {
    if (bu === 'wine' || bu.includes('wine')) return 'Wine';
    return 'Marketing & Video';
  }

  if (bu === 'wine' || bu.includes('wine')) {
    return 'Wine';
  }

  if (/bwa|bwf|bw\s*pm|ob\s*&\s*design|project\s*design|3d\s*design|furniture|工程項目/i.test(team)) {
    return 'FC';
  }

  return null;
}

export function resolveStaffOfficeAndDepartment(row: {
  office?: string | null;
  base_location?: string | null;
  department?: string | null;
  team_id?: string | null;
  business_unit?: string | null;
}): { office: MpsOffice | null; department: MpsDepartment | null } {
  const storedOffice = (row.office || '').trim();
  const office =
    (storedOffice && OFFICE_SET.has(storedOffice) ? storedOffice as MpsOffice : null)
    ?? normalizeOffice(row.base_location);

  const storedDepartment = (row.department || '').trim();
  const department =
    (storedDepartment && DEPARTMENT_SET.has(storedDepartment) ? storedDepartment as MpsDepartment : null)
    ?? resolveDepartmentFromTeam(row.team_id, row.business_unit);

  return { office, department };
}
