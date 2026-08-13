import { useCallback } from 'react';
import { useBrands } from '@/hooks/useBrands';
import { useCompanies } from '@/hooks/useCompanies';
import { brandLabelOf, companyBrandLine, companyLabelOf } from '@/lib/projectOrg';

export function useProjectOrgLabels() {
  const { companies } = useCompanies();
  const { brands } = useBrands();

  const companyLabel = useCallback(
    (companyListId?: string | null) => companyLabelOf(companies, companyListId),
    [companies],
  );

  const brandLabel = useCallback(
    (brandListId?: string | null) => brandLabelOf(brands, brandListId),
    [brands],
  );

  const orgLine = useCallback(
    (companyListId?: string | null, brandListId?: string | null) =>
      companyBrandLine(companies, brands, companyListId, brandListId),
    [companies, brands],
  );

  return { companies, brands, companyLabel, brandLabel, orgLine };
}
