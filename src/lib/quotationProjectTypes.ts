export const QUOTATION_PROJECT_TYPES_TABLE = 'quotation_project_types';

export const QUOTATION_PROJECT_TYPE_SECTIONS = ['quotation', 'system-dev'] as const;
export type QuotationProjectTypeSection = (typeof QUOTATION_PROJECT_TYPE_SECTIONS)[number];

export const QUOTATION_PROJECT_TYPE_SECTION_LABELS: Record<QuotationProjectTypeSection, string> = {
  quotation: '市場項目管理',
  'system-dev': '系統開發管理',
};

export const QUOTATION_PROJECT_TYPE_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
export const QUOTATION_PROJECT_TYPE_CODE_INITIAL_PATTERN = /^[A-Z0-9]+-[A-Z0-9]+$/;

export type QuotationProjectType = {
  id: string;
  code: string;
  display: string;
  codeInitial: string;
  section: QuotationProjectTypeSection;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuotationProjectTypeInput = {
  code?: string;
  display: string;
  codeInitial: string;
  section: QuotationProjectTypeSection;
  isActive?: boolean;
};

export function isQuotationProjectTypeSection(value: string): value is QuotationProjectTypeSection {
  return value === 'quotation' || value === 'system-dev';
}

export function normalizeProjectTypeCode(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeProjectTypeCodeInitial(value: string): string {
  return value.trim().toUpperCase();
}

export function validateProjectTypeCode(code: string): string | null {
  const normalized = normalizeProjectTypeCode(code);
  if (!normalized) return '請輸入識別碼';
  if (!QUOTATION_PROJECT_TYPE_CODE_PATTERN.test(normalized)) {
    return '識別碼須為小寫英數與底線，例如 bwt_web';
  }
  return null;
}

export function validateProjectTypeCodeInitial(codeInitial: string): string | null {
  const normalized = normalizeProjectTypeCodeInitial(codeInitial);
  if (!normalized) return '請輸入代碼前綴';
  if (!QUOTATION_PROJECT_TYPE_CODE_INITIAL_PATTERN.test(normalized)) {
    return '代碼前綴格式須為 XXX-X，例如 BWT-W';
  }
  return null;
}

export function slugifyProjectTypeCode(display: string): string {
  return display
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Prefer bwt_system when a row still has both web and system codes. */
export function collapseProjectTypeCodes(codes: readonly string[] | null | undefined): string | null {
  const list = (codes ?? []).map((code) => code.trim()).filter(Boolean);
  const set = new Set(list);
  if (set.has('bwt_web') && set.has('bwt_system')) return 'bwt_system';
  if (set.has('bwt_system')) return 'bwt_system';
  if (set.has('bwl_event')) return 'bwl_event';
  if (set.has('bwg_gift')) return 'bwg_gift';
  if (set.has('bwt_web')) return 'bwt_web';
  return list[0] ?? null;
}

export function projectTypeIdFromCodes(
  codes: readonly string[] | null | undefined,
  types: readonly Pick<QuotationProjectType, 'id' | 'code'>[],
): string {
  const code = collapseProjectTypeCodes(codes);
  if (!code) return '';
  return types.find((type) => type.code === code)?.id ?? '';
}

let projectTypeCodeByRef = new Map<string, string>();

export function setProjectTypeCodeMap(types: readonly Pick<QuotationProjectType, 'id' | 'code'>[]) {
  projectTypeCodeByRef = new Map(
    types.flatMap((type) => [
      [type.id, type.code],
      [type.code, type.code],
    ]),
  );
}

export function resolveProjectTypeCode(ref: string | null | undefined): string {
  const value = ref?.trim() ?? '';
  if (!value) return '';
  return projectTypeCodeByRef.get(value) ?? value;
}

export function projectTypeByIdOrCode(
  ref: string | null | undefined,
  types: readonly Pick<QuotationProjectType, 'id' | 'code' | 'display' | 'section'>[],
) {
  const value = ref?.trim() ?? '';
  if (!value) return undefined;
  return types.find((type) => type.id === value || type.code === value);
}
