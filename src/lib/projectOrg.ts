import type { Brand, Company } from '@/types/app';

export function findCompany(companies: Company[], id?: string | null): Company | undefined {
  if (!id) return undefined;
  return companies.find(c => c.uuid === id || c.id === id);
}

export function findBrand(brands: Brand[], id?: string | null): Brand | undefined {
  if (!id) return undefined;
  return brands.find(b => b.id === id);
}

export function companyLabelOf(companies: Company[], id?: string | null): string {
  const company = findCompany(companies, id);
  return company?.companyCode || company?.companyNameZh || '';
}

export function brandLabelOf(brands: Brand[], id?: string | null): string {
  const brand = findBrand(brands, id);
  return brand?.brandCode || brand?.displayName || '';
}

export function companyBrandLine(
  companies: Company[],
  brands: Brand[],
  companyListId?: string | null,
  brandListId?: string | null,
): string {
  return [companyLabelOf(companies, companyListId), brandLabelOf(brands, brandListId)]
    .filter(Boolean)
    .join(' · ');
}
