/** 客戶列表（quotation_client_list）類型與狀態設定 */

export type QuotationClientStatus = 'active' | 'inactive' | 'prospect';

export type QuotationClient = {
  id: string;
  companyNameZh: string;
  companyNameEn: string;
  brandId: string;
  brandCode: string;
  brandName: string;
  contactPerson: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  inquiryDate: string;
  status: QuotationClientStatus;
  notes?: string;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
};

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
  companyNameZh: '',
  companyNameEn: '',
  brandId: '',
  brandCode: '',
  brandName: '',
  contactPerson: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  inquiryDate: new Date().toISOString().slice(0, 10),
  status: 'prospect',
  notes: '',
});
