import { categoryConfig } from '@/data/dayReportDataV2';

export type CategoryLookup = Record<string, { label: string; icon: string; color: string; bg: string }>;

export function buildCategoryLookup(
  dynamicTypes: Array<{ id: string; label: string; icon?: string; color?: string; bg?: string }>,
): CategoryLookup {
  const map: CategoryLookup = {};
  for (const [k, v] of Object.entries(categoryConfig)) {
    map[k] = { label: v.label, icon: v.icon, color: v.color, bg: v.bg };
  }
  for (const t of dynamicTypes) {
    map[t.id] = {
      label: t.label,
      icon: t.icon || '📋',
      color: t.color || 'text-gray-600',
      bg: t.bg || 'bg-gray-100',
    };
  }
  return map;
}

/** Resolve a stored category id to a display label. Never returns raw custom_* ids. */
export function resolveCategoryLabel(category: string, lookup: CategoryLookup): string {
  if (!category) return '—';
  const known = lookup[category];
  if (known?.label) return known.label;
  if (category.startsWith('custom_')) return '自訂類型';
  return category;
}
