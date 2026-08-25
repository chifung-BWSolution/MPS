import { useMemo } from 'react';
import { useDayReportTypes } from '@/hooks/useDayReportTypes';
import { buildCategoryLookup, type CategoryLookup } from '@/lib/workCategoryLabel';

export type { CategoryLookup };
export { buildCategoryLookup, resolveCategoryLabel } from '@/lib/workCategoryLabel';

export function useCategoryLookup(): CategoryLookup {
  const { types: dynamicTypes } = useDayReportTypes();
  return useMemo(() => buildCategoryLookup(dynamicTypes), [dynamicTypes]);
}
