import {
  PITCHING_PROJECT_TYPE_OPTIONS,
  type PitchingProjectType,
} from '../data/pitchingData';

export const QUOTATION_SECTION_MODULES = ['quotation', 'system-dev'] as const;
export type QuotationSectionModule = (typeof QUOTATION_SECTION_MODULES)[number];

/** 市場項目管理：活動 + 禮品 */
export const MARKET_PROJECT_TYPES = ['bwl_event', 'bwg_gift'] as const satisfies readonly PitchingProjectType[];

/** 系統開發管理：系統 + 網頁 */
export const SYSTEM_DEV_PROJECT_TYPES = ['bwt_system', 'bwt_web'] as const satisfies readonly PitchingProjectType[];

export function isQuotationSectionModule(module: string): module is QuotationSectionModule {
  return module === 'quotation' || module === 'system-dev';
}

export function allowedProjectTypesForSection(module: string): readonly PitchingProjectType[] {
  return module === 'system-dev' ? SYSTEM_DEV_PROJECT_TYPES : MARKET_PROJECT_TYPES;
}

export function projectTypeOptionsForSection(module: string) {
  const allowed = new Set<string>(allowedProjectTypesForSection(module));
  return PITCHING_PROJECT_TYPE_OPTIONS.filter((opt) => allowed.has(opt.id));
}

/**
 * A record belongs to the section when it has no type yet (so it can be classified)
 * or its type is one of the section's allowed ids/codes.
 */
export function matchesSectionProjectTypes(
  value: string | readonly string[] | null | undefined,
  allowed: readonly string[],
): boolean {
  const list = value == null ? [] : Array.isArray(value) ? value : [value];
  const refs = list.map((item) => String(item).trim()).filter(Boolean);
  if (refs.length === 0) return true;
  const allowedSet = new Set<string>(allowed);
  return refs.some((ref) => allowedSet.has(ref));
}

export function filterBySectionProjectTypes<T extends { projectTypes?: readonly string[]; projectTypeId?: string }>(
  records: T[],
  allowed: readonly string[],
): T[] {
  return records.filter((record) =>
    matchesSectionProjectTypes(record.projectTypeId || record.projectTypes, allowed),
  );
}
