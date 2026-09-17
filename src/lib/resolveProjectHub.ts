import { supabase } from '@/lib/supabase';
import {
  PROJECTS_TABLE,
  isProjectHubRelatedType,
  mergeProjectHubIds,
  pickWriteProjectHubId,
} from '@/lib/projectsHub';

export const QUOTATION_CLIENT_PROJECT_TABLE = 'quotation_client_project';

export type RelatedProjectHubs = {
  projectIds: string[];
  writeProjectId: string | null;
};

async function lookupProjectHubId(
  relatedType: string,
  relatedId: string,
): Promise<{ data: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('id')
    .eq('related_type', relatedType)
    .eq('related_id', relatedId)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  return { data: data?.id ? String(data.id) : null, error: null };
}

async function lookupProjectHubIds(
  relatedType: string,
  relatedIds: string[],
): Promise<{ data: string[]; error: { message: string } | null }> {
  const ids = relatedIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('id')
    .eq('related_type', relatedType)
    .in('related_id', ids);
  if (error) return { data: [], error: { message: error.message } };
  return { data: mergeProjectHubIds((data ?? []).map((row) => String(row.id))), error: null };
}

async function linkedClientProjectIdsForWebsite(
  websiteId: string,
): Promise<{ data: string[]; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from(QUOTATION_CLIENT_PROJECT_TABLE)
    .select('id')
    .eq('webandsystem_list_id', websiteId);
  if (error) return { data: [], error: { message: error.message } };
  return { data: mergeProjectHubIds((data ?? []).map((row) => String(row.id))), error: null };
}

/** Look up public.projects.id for a source module row. Does not remap website → client project. */
export async function resolveProjectHubId(
  relatedType: string | undefined | null,
  relatedId: string | undefined | null,
): Promise<{ data: string | null; error: { message: string } | null }> {
  const sourceType = isProjectHubRelatedType(relatedType) ? relatedType : null;
  const sourceId = relatedId?.trim() || '';
  if (!sourceType || !sourceId) {
    return { data: null, error: { message: '缺少對應的 projects 來源' } };
  }

  const lookedUp = await lookupProjectHubId(sourceType, sourceId);
  if (lookedUp.error) return lookedUp;
  if (!lookedUp.data) return { data: null, error: { message: '找不到對應的 projects 紀錄' } };
  return lookedUp;
}

/**
 * Website detail pages include:
 * 1) projects.id where related_type=webandsystem and related_id=website id
 * 2) projects.id for every quotation_client_project linked via webandsystem_list_id
 */
export async function resolveRelatedProjectHubIds(
  relatedType: string | undefined | null,
  relatedId: string | undefined | null,
): Promise<{ data: RelatedProjectHubs | null; error: { message: string } | null }> {
  const sourceType = isProjectHubRelatedType(relatedType) ? relatedType : null;
  const sourceId = relatedId?.trim() || '';
  if (!sourceType || !sourceId) {
    return { data: null, error: { message: '缺少對應的 projects 來源' } };
  }

  const own = await lookupProjectHubId(sourceType, sourceId);
  if (own.error) return { data: null, error: own.error };

  let linkedProjectIds: string[] = [];
  if (sourceType === 'webandsystem') {
    const linkedQcps = await linkedClientProjectIdsForWebsite(sourceId);
    if (linkedQcps.error) return { data: null, error: linkedQcps.error };
    const linkedHubs = await lookupProjectHubIds('quotation_client', linkedQcps.data);
    if (linkedHubs.error) return { data: null, error: linkedHubs.error };
    linkedProjectIds = linkedHubs.data;
  }

  const projectIds = mergeProjectHubIds(own.data, linkedProjectIds);
  const writeProjectId = pickWriteProjectHubId(own.data, linkedProjectIds);
  if (!projectIds.length || !writeProjectId) {
    return { data: null, error: { message: '找不到對應的 projects 紀錄' } };
  }
  return { data: { projectIds, writeProjectId }, error: null };
}

/**
 * IDs that day_report_entries.related_id may use for this source row:
 * the module id itself, its projects-hub id(s), and (for websites) linked pitching ids.
 */
export async function resolveRelatedDayReportIds(
  relatedType: string | undefined | null,
  relatedId: string | undefined | null,
): Promise<{ data: string[]; error: { message: string } | null }> {
  const sourceId = relatedId?.trim() || '';
  if (!sourceId) return { data: [], error: { message: '缺少項目' } };

  const ids = new Set<string>([sourceId]);
  const hubs = await resolveRelatedProjectHubIds(relatedType, relatedId);
  if (hubs.error && !hubs.data) {
    // Still query the source id so hours can load before a hub row exists.
  } else {
    for (const id of hubs.data?.projectIds ?? []) ids.add(id);
  }

  if (relatedType === 'webandsystem') {
    const linked = await linkedClientProjectIdsForWebsite(sourceId);
    if (linked.error) return { data: [...ids], error: linked.error };
    for (const id of linked.data) ids.add(id);
  }

  return { data: [...ids], error: null };
}
