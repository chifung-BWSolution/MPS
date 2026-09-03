/** Marketing ops entities persisted in Supabase */

export const SUPPLIER_TYPE_CATEGORIES = ['網站', '活動', '影片'] as const;
export type SupplierTypeCategory = (typeof SUPPLIER_TYPE_CATEGORIES)[number];

export interface SupplierType {
  id: string;
  categories: SupplierTypeCategory;
  displayName: string;
  isActive: boolean;
  createdAt?: string;
}

export interface WebPageSupplier {
  id: string;
  supplierTypesId: string | null;
  displayName: string;
  description: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  remarks: string;
  url: string;
  isActive: boolean;
  createdAt?: string;
}

export type BacklinkBrand = 'BW' | 'FC' | 'BSC' | 'Wine';

export const BACKLINK_BRANDS: BacklinkBrand[] = ['BW', 'FC', 'BSC', 'Wine'];

export interface BacklinkPurchase {
  id: string;
  websiteProfileId?: string;
  webSupplierId: string;
  costUsd: number;
  costHkd: number;
  brand?: BacklinkBrand;
  purchaseDate: string;
  quantity: number;
  notes?: string;
  googleAdsCustomerId?: string;
  googleAdsAccountName?: string;
  sourceDomain?: string;
  excelSheet?: string;
}

export interface GoogleBusinessRegistration {
  id: string;
  websiteProfileId?: string;
  url: string;
  registeredAt: string;
  content: string;
}

