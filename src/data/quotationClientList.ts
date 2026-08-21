/** 客戶列表（quotation_client_list）類型與狀態設定 */

export type QuotationClientStatus = 'active' | 'inactive' | 'prospect';

export type QuotationClient = {
  id: string;
  displayName: string;
  companyNameZh: string;
  companyNameEn: string;
  /** Unique brand_list.id values stored as comma-separated brand_id. */
  brandIds: string[];
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  inquiryDate: string;
  status: QuotationClientStatus;
  notes?: string;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
};

export function parseBrandIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of value.split(',')) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function serializeBrandIds(ids: string[]): string {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort().join(',');
}

export type QuotationClientInput = Omit<
  QuotationClient,
  'id' | 'projectCount' | 'createdAt' | 'updatedAt'
>;

export const quotationClientStatusConfig: Record<
  QuotationClientStatus,
  { label: string; color: string; bgColor: string }
> = {
  active: { label: '合作中', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  inactive: { label: '已停止', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  prospect: { label: '潛在客戶', color: 'text-amber-700', bgColor: 'bg-amber-50' },
};

export const emptyQuotationClientInput = (): QuotationClientInput => ({
  displayName: '',
  companyNameZh: '',
  companyNameEn: '',
  brandIds: [],
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  inquiryDate: new Date().toISOString().slice(0, 10),
  status: 'prospect',
  notes: '',
});
