import {
  PITCHING_PROJECT_TYPE_OPTIONS,
  type PitchingProjectType,
} from '../data/pitchingData';

export const QUOTATION_SECTION_MODULES = ['quotation', 'system-dev'] as const;
export type QuotationSectionModule = (typeof QUOTATION_SECTION_MODULES)[number];

/** 市場項目管理：活動 + 禮品 */
export const MARKET_PROJECT_TYPES = ['bwl_event', 'bwg_gift'] as const satisfies readonly PitchingProjectType[];

/** 系統開發管理：活動 + 網頁 */
export const SYSTEM_DEV_PROJECT_TYPES = ['bwl_event', 'bwt_web'] as const satisfies readonly PitchingProjectType[];

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
 * A record belongs to the section when it has no types yet (so it can be classified)
 * or at least one of the section's allowed types.
 */
export function matchesSectionProjectTypes(
  types: readonly PitchingProjectType[] | null | undefined,
  allowed: readonly PitchingProjectType[],
): boolean {
  const list = types ?? [];
  if (list.length === 0) return true;
  const allowedSet = new Set<string>(allowed);
  return list.some((type) => allowedSet.has(type));
}

export function filterBySectionProjectTypes<T extends { projectTypes: readonly PitchingProjectType[] }>(
  records: T[],
  allowed: readonly PitchingProjectType[],
): T[] {
  return records.filter((record) => matchesSectionProjectTypes(record.projectTypes, allowed));
}

/** Keep types outside this section; replace only the section's own types from the form. */
export function mergeScopedProjectTypes(
  existing: readonly PitchingProjectType[] | null | undefined,
  selected: readonly PitchingProjectType[],
  allowed: readonly PitchingProjectType[],
): PitchingProjectType[] {
  const allowedSet = new Set<string>(allowed);
  const preserved = (existing ?? []).filter((type) => !allowedSet.has(type));
  const next = selected.filter((type) => allowedSet.has(type));
  const seen = new Set<PitchingProjectType>();
  const out: PitchingProjectType[] = [];
  for (const type of [...next, ...preserved]) {
    if (seen.has(type)) continue;
    seen.add(type);
    out.push(type);
  }
  return out;
}
