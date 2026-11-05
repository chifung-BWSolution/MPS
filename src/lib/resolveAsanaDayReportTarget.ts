import { supabase } from '@/lib/supabase';
import {
  isAsanaTaskGid,
  pickQuotationClientForAsanaGid,
  type QuotationClientAsanaCandidate,
} from '@/lib/asanaDayReportLink';

export type ResolvedDayReportRelation = {
  relatedId: string;
  relatedName: string;
  retargeted: boolean;
};

/** If this gid already belongs to a client project, return that project's hub id. */
export async function resolveImportedAsanaDayReportTarget(
  relatedId: string,
  relatedName: string,
): Promise<ResolvedDayReportRelation> {
  const gid = relatedId.trim();
  if (!isAsanaTaskGid(gid)) {
    return { relatedId: gid, relatedName, retargeted: false };
  }

  const { data, error } = await supabase
    .from('quotation_client_project')
    .select('id, asana_link, asana_task_gid, created_at')
    .or(`asana_task_gid.eq.${gid},asana_link.ilike.%${gid}%`);

  if (error) throw new Error(error.message);

  const match = pickQuotationClientForAsanaGid(
    (data ?? []) as QuotationClientAsanaCandidate[],
    gid,
  );
  if (!match) {
    return { relatedId: gid, relatedName, retargeted: false };
  }

  const { data: hub, error: hubError } = await supabase
    .from('projects')
    .select('id, name')
    .eq('related_type', 'quotation_client')
    .eq('related_id', match.id)
    .maybeSingle();

  if (hubError) throw new Error(hubError.message);
  if (!hub?.id) {
    throw new Error('Asana 項目已成為客戶項目，但找不到 projects 紀錄');
  }

  return {
    relatedId: String(hub.id),
    relatedName: String(hub.name || '').trim() || relatedName,
    retargeted: true,
  };
}
