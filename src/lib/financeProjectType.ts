/** Project-type filter used on every 會計財務 page. */

export const FINANCE_PROJECT_TYPE_OPTIONS = [
  { key: 'bwg_gift', label: 'BWG 禮品' },
  { key: 'bwl_brand', label: 'BWL 品牌' },
  { key: 'bwl_event', label: 'BWL 活動' },
  { key: 'bwt_system', label: 'BWT 系統' },
  { key: 'bwt_web', label: 'BWT 網頁' },
] as const;

export type FinanceProjectTypeKey = (typeof FINANCE_PROJECT_TYPE_OPTIONS)[number]['key'];

const CODE_TO_KEY = new Map<string, FinanceProjectTypeKey>([
  ['bwg_gift', 'bwg_gift'],
  ['bwl_brand', 'bwl_brand'],
  ['bwl_branding', 'bwl_brand'],
  ['bwl_event', 'bwl_event'],
  ['bwt_system', 'bwt_system'],
  ['bwt_web', 'bwt_web'],
]);

export type FinanceProjectTypeRecord = {
  code?: string | null;
  display?: string | null;
};

export function compactProjectTypeLabel(value: string): string {
  return value.replace(/[\s\-－—_]/g, '').toUpperCase();
}

export function financeProjectTypeLabel(key: string | null | undefined): string | undefined {
  return FINANCE_PROJECT_TYPE_OPTIONS.find((option) => option.key === key)?.label;
}

/** Map a quotation_project_types row (or legacy slug) onto a finance filter key. */
export function financeProjectTypeKeyFromType(
  type: FinanceProjectTypeRecord | null | undefined,
): FinanceProjectTypeKey | undefined {
  const code = type?.code?.trim() ?? '';
  if (code) {
    const mapped = CODE_TO_KEY.get(code);
    if (mapped) return mapped;
    if (code.startsWith('bwl_brand')) return 'bwl_brand';
  }

  const compact = compactProjectTypeLabel(type?.display ?? '');
  if (!compact) return undefined;

  let best: { key: FinanceProjectTypeKey; length: number } | undefined;
  for (const option of FINANCE_PROJECT_TYPE_OPTIONS) {
    const needle = compactProjectTypeLabel(option.label);
    if (compact !== needle && !compact.startsWith(needle)) continue;
    if (!best || needle.length > best.length) best = { key: option.key, length: needle.length };
  }
  return best?.key;
}

/** Standalone website / system rows with no quotation project type. */
export function financeProjectTypeKeyFromProfileType(
  profileType: string | null | undefined,
): FinanceProjectTypeKey | undefined {
  const value = profileType?.trim().toLowerCase();
  if (value === 'system') return 'bwt_system';
  if (value === 'website') return 'bwt_web';
  return undefined;
}

export function resolveFinanceProjectTypeKey(input: {
  projectType?: FinanceProjectTypeRecord | null;
  profileType?: string | null;
  allowProfileFallback?: boolean;
}): FinanceProjectTypeKey | undefined {
  const fromType = financeProjectTypeKeyFromType(input.projectType);
  if (fromType) return fromType;
  if (input.allowProfileFallback === false) return undefined;
  return financeProjectTypeKeyFromProfileType(input.profileType);
}

/**
 * Several quotation projects can point at one website.
 * One shared type wins; conflicting types do not fall back to website/system.
 */
export function pickFinanceProjectType<T extends FinanceProjectTypeRecord>(
  types: readonly T[],
): { projectType?: T; allowProfileFallback: boolean } {
  if (types.length === 0) return { allowProfileFallback: true };
  const keyed = types.flatMap((type) => {
    const key = financeProjectTypeKeyFromType(type);
    return key ? [{ type, key }] : [];
  });
  const keys = [...new Set(keyed.map((item) => item.key))];
  if (keys.length === 1) {
    return {
      projectType: keyed.find((item) => item.key === keys[0])?.type,
      allowProfileFallback: false,
    };
  }
  return { allowProfileFallback: false };
}

export function indexFinanceProjectTypes(
  rows: readonly { id: string; code: string; display: string }[],
): Map<string, { code: string; display: string }> {
  const byRef = new Map<string, { code: string; display: string }>();
  for (const row of rows) {
    const type = { code: row.code, display: row.display };
    if (row.id) byRef.set(row.id, type);
    if (row.code) byRef.set(row.code, type);
  }
  return byRef;
}

export function financeProjectTypeFromRef(
  ref: string | null | undefined,
  byRef: ReadonlyMap<string, { code: string; display: string }>,
) {
  const value = ref?.trim();
  if (!value) return undefined;
  return byRef.get(value);
}

export function matchesFinanceProjectTypeFilter(
  projectTypeKey: string | null | undefined,
  filter: string | null | undefined,
): boolean {
  if (!filter || filter === 'all') return true;
  return projectTypeKey === filter;
}
