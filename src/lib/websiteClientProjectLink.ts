export type ClientProjectSelectOption = {
  value: string;
  label: string;
  keywords?: string;
};

export const UNLINKED_CLIENT_PROJECT_OPTION: ClientProjectSelectOption = {
  value: '',
  label: '尚未連結',
};

export type ClientProjectSelectRecord = {
  id: string;
  displayName: string;
  clientName?: string;
  pitchingId?: string;
  companyNameZh?: string;
  companyNameEn?: string;
  webandsystemListId?: string;
};

export function clientProjectSelectLabel(
  record: Pick<ClientProjectSelectRecord, 'displayName' | 'clientName'>,
): string {
  const name = record.displayName.trim() || '未命名';
  const client = record.clientName?.trim();
  if (client && client !== '—' && client !== name) return `${name} (${client})`;
  return name;
}

export function toClientProjectSelectOptions(
  records: ClientProjectSelectRecord[],
): ClientProjectSelectOption[] {
  return [
    UNLINKED_CLIENT_PROJECT_OPTION,
    ...records.map((record) => ({
      value: record.id,
      label: clientProjectSelectLabel(record),
      keywords: [
        record.displayName,
        record.clientName,
        record.pitchingId,
        record.companyNameZh,
        record.companyNameEn,
      ]
        .filter(Boolean)
        .join(' '),
    })),
  ];
}

export function linkedClientProjectId(
  records: Array<{ id: string; webandsystemListId?: string }>,
  websiteId: string,
): string {
  const id = websiteId.trim();
  if (!id) return '';
  return records.find((record) => (record.webandsystemListId ?? '') === id)?.id ?? '';
}

type LinkUpdate = (
  id: string,
  data: { webandsystemListId: string },
) => Promise<{ error: { message: string } | null }>;

/** Keep quotation_client_project.webandsystem_list_id in sync with the website dialog selection. */
export async function syncWebsiteClientProjectLink({
  websiteId,
  nextProjectId,
  records,
  updateRecord,
}: {
  websiteId: string;
  nextProjectId: string;
  records: Array<{ id: string; webandsystemListId?: string }>;
  updateRecord: LinkUpdate;
}): Promise<{ error: { message: string } | null }> {
  const siteId = websiteId.trim();
  const nextId = nextProjectId.trim();
  if (!siteId) return { error: { message: '缺少網站 ID' } };

  const linked = records.filter((record) => (record.webandsystemListId ?? '') === siteId);
  for (const record of linked) {
    if (record.id === nextId) continue;
    const { error } = await updateRecord(record.id, { webandsystemListId: '' });
    if (error) return { error };
  }

  if (!nextId) return { error: null };
  const next = records.find((record) => record.id === nextId);
  if (next && (next.webandsystemListId ?? '') === siteId) return { error: null };
  return updateRecord(nextId, { webandsystemListId: siteId });
}

export function nextClientProjectIdForWebsite(
  projectCategory: string,
  quotationClientProjectId?: string,
): string {
  return projectCategory === 'client' ? quotationClientProjectId?.trim() || '' : '';
}
