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

export const CLIENT_DISPLAY_NAME_SOURCE_FIELDS = [
  'companyNameZh',
  'companyNameEn',
  'contactPerson',
  'phone',
] as const;

export function composeClientDisplayName(
  input: Pick<QuotationClientInput, 'companyNameZh' | 'companyNameEn' | 'contactPerson' | 'phone'>,
): string {
  return [input.companyNameZh, input.companyNameEn, input.contactPerson, input.phone]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export type QuotationClientSelectFields = Pick<
  QuotationClient,
  'id' | 'displayName' | 'companyNameZh' | 'companyNameEn' | 'contactPerson' | 'phone'
>;

export type QuotationClientSelectOption = {
  value: string;
  label: string;
  keywords: string;
  companyNameZh: string;
  companyNameEn: string;
};

function joinNameAndPhone(name: string, phone: string): string {
  return [name.trim(), phone.trim()].filter(Boolean).join(' ');
}

/**
 * Visible label for client pickers.
 * Prefer display_name; otherwise use the first present name and append phone when it exists.
 * An empty phone never skips a fallback level.
 */
export function quotationClientSelectLabel(client: Omit<QuotationClientSelectFields, 'id'>): string {
  const displayName = client.displayName.trim();
  if (displayName) return displayName;

  const companyNameZh = client.companyNameZh.trim();
  if (companyNameZh) return joinNameAndPhone(companyNameZh, client.phone);

  const companyNameEn = client.companyNameEn.trim();
  if (companyNameEn) return joinNameAndPhone(companyNameEn, client.phone);

  const contactPerson = client.contactPerson.trim();
  if (contactPerson) return joinNameAndPhone(contactPerson, client.phone);

  return joinNameAndPhone(client.companyNameZh, client.phone) || '未命名客戶';
}

export function toQuotationClientSelectOption(
  client: QuotationClientSelectFields,
): QuotationClientSelectOption {
  return {
    value: client.id,
    label: quotationClientSelectLabel(client),
    keywords: [
      client.displayName,
      client.companyNameZh,
      client.companyNameEn,
      client.contactPerson,
      client.phone,
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' '),
    companyNameZh: client.companyNameZh,
    companyNameEn: client.companyNameEn,
  };
}

/** Fill 顯示名稱 from source fields when the dialog opens with an empty value. */
export function seedClientDisplayName(input: QuotationClientInput): QuotationClientInput {
  if (input.displayName.trim()) return input;
  return { ...input, displayName: composeClientDisplayName(input) };
}

/** True when 顯示名稱 is empty or still the last auto-composed value. */
export function isClientDisplayNameFollowing(input: QuotationClientInput): boolean {
  return !input.displayName.trim() || input.displayName === composeClientDisplayName(input);
}

/**
 * Keep a custom 顯示名稱 as-is. While the field is empty or still matches the
 * composed source value, keep updating it as company / contact / phone change.
 */
export function applyClientDisplayNameAutofill(
  prev: QuotationClientInput,
  field: keyof QuotationClientInput,
  value: string,
): QuotationClientInput {
  const next = { ...prev, [field]: value };
  if (field === 'displayName') return next;
  const isSourceField = (CLIENT_DISPLAY_NAME_SOURCE_FIELDS as readonly string[]).includes(field);
  if (isSourceField && isClientDisplayNameFollowing(prev)) {
    next.displayName = composeClientDisplayName(next);
  }
  return next;
}

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
