/** 客戶列表（quotation_client_list）類型與狀態設定 */

export type QuotationClientStatus = 'active' | 'inactive' | 'prospect';

export type LatestQuotationClientProject = {
  id: string;
  displayName: string;
  status: string;
};

export type QuotationClientProjectRef = {
  id: string;
  clientId: string;
  displayName: string;
  status?: string | null;
  inquiryDate?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

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
  latestProject: LatestQuotationClientProject | null;
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

export type QuotationClientListFilters = {
  statusFilter?: string;
  brandFilter?: string;
  searchQuery?: string;
  brandNames?: (ids: string[]) => string[];
};

/** Client-side filters for 客戶列表: status, brand, and search. */
export function filterQuotationClients(
  clients: QuotationClient[],
  {
    statusFilter = 'all',
    brandFilter = 'all',
    searchQuery = '',
    brandNames = () => [],
  }: QuotationClientListFilters = {},
): QuotationClient[] {
  const query = searchQuery.trim();
  return clients.filter((client) => {
    if (statusFilter !== 'all' && client.status !== statusFilter) return false;
    if (brandFilter !== 'all' && !client.brandIds.includes(brandFilter)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      client.displayName.toLowerCase().includes(q) ||
      client.companyNameZh.includes(query) ||
      client.companyNameEn.toLowerCase().includes(q) ||
      client.contactPerson.toLowerCase().includes(q) ||
      (client.latestProject?.displayName || '').toLowerCase().includes(q) ||
      brandNames(client.brandIds).some((name) => name.toLowerCase().includes(q))
    );
  });
}

export type QuotationClientInput = Omit<
  QuotationClient,
  'id' | 'latestProject' | 'createdAt' | 'updatedAt'
>;

function projectRecencyKey(row: QuotationClientProjectRef): string {
  return [row.inquiryDate ?? '', row.updatedAt ?? '', row.createdAt ?? '', row.id].join('|');
}

/** Pick the most recent quotation_client_project per client. */
export function selectLatestProjectsByClient(
  rows: QuotationClientProjectRef[],
): Record<string, LatestQuotationClientProject> {
  const latest: Record<string, { project: LatestQuotationClientProject; key: string }> = {};
  for (const row of rows) {
    const clientId = row.clientId.trim();
    if (!clientId || !row.id) continue;
    const key = projectRecencyKey(row);
    const current = latest[clientId];
    if (!current || key > current.key) {
      latest[clientId] = {
        project: {
          id: row.id,
          displayName: row.displayName,
          status: row.status ?? '',
        },
        key,
      };
    }
  }
  return Object.fromEntries(
    Object.entries(latest).map(([clientId, value]) => [clientId, value.project]),
  );
}

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
