import { useCallback, useEffect, useState } from 'react';
import { isAbortError } from '@/lib/queryCache';
import { optionalIsoDate } from '@/lib/quotationIncomes';
import { PROJECTS_TABLE, isProjectHubRelatedType } from '@/lib/projectsHub';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/lib/resolveProjectHub';
import { QUOTATION_PROJECT_TYPES_TABLE, projectTypeByIdOrCode } from '@/lib/quotationProjectTypes';
import { computeGp, sumEstimatedExpenses, toMoneyAmount } from '@/lib/quotationListMoney';
import { BV_SOURCE_RELATED_TYPES, QUOTATION_BV_TABLE } from '@/lib/quotationBv';
import {
  groupBvAllocations,
  type BvAllocationGroup,
  type BvAllocationProjectInfo,
  type BvAllocationStaffRow,
} from '@/lib/financeBvAllocation';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

type StaffEmbed = {
  display_name: string | null;
  position: string | null;
};

type BvDbRow = {
  id: string;
  project_id: string;
  staff_id: string;
  bv_ratio: number | string;
  created_at: string;
  staff?: StaffEmbed | StaffEmbed[] | null;
};

type ProjectDbRow = {
  id: string;
  name: string | null;
  related_type: string | null;
  related_id: string | null;
};

type QcpDbRow = {
  id: string;
  display_name: string | null;
  pitching_code: string | null;
  client_name: string | null;
  status: string | null;
  project_types: string | null;
  signed_date: string | null;
  handover_date: string | null;
  estimated_income: number | string | null;
  estimated_expenses: unknown;
  webandsystem_list_id: string | null;
  main_pm?: { display_name: string | null } | Array<{ display_name: string | null }> | null;
};

type WebsiteDbRow = {
  id: string;
  website_name: string | null;
};

type ProjectTypeDbRow = {
  id: string;
  code: string;
  display: string;
};

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

function parseEstimatedExpenses(raw: unknown): Array<{ amount: number }> {
  if (raw == null) return [];
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      return [];
    }
  } else {
    return [];
  }
  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || !('amount' in item)) return null;
      const amount = toMoneyAmount((item as { amount: number | string | null }).amount);
      return Number.isFinite(amount) ? { amount } : null;
    })
    .filter((item): item is { amount: number } => item != null);
}

function mapStaffRow(row: BvDbRow): BvAllocationStaffRow {
  const staff = firstJoin(row.staff);
  return {
    id: row.id,
    projectId: row.project_id,
    staffId: row.staff_id,
    staffName: staff?.display_name?.trim() || '—',
    staffPosition: optionalText(staff?.position),
    bvRatio: Number(row.bv_ratio),
  };
}

export function useFinanceBvAllocation() {
  const [groups, setGroups] = useState<BvAllocationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [bvRows, sourceProjects, projectTypes] = await Promise.all([
        fetchAllRows<BvDbRow>((from, to) =>
          supabase
            .from(QUOTATION_BV_TABLE)
            .select('id, project_id, staff_id, bv_ratio, created_at, staff:staffs!staff_id ( display_name, position )')
            .order('created_at', { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<ProjectDbRow>((from, to) =>
          supabase
            .from(PROJECTS_TABLE)
            .select('id, name, related_type, related_id')
            .in('related_type', [...BV_SOURCE_RELATED_TYPES])
            .order('id', { ascending: true })
            .range(from, to),
        ),
        supabase
          .from(QUOTATION_PROJECT_TYPES_TABLE)
          .select('id, code, display')
          .then(({ data, error: typeError }) => {
            if (typeError) throw new Error(typeError.message);
            return (data as ProjectTypeDbRow[] | null) ?? [];
          }),
      ]);

      const knownIds = new Set(sourceProjects.map((row) => String(row.id)));
      const missingIds = uniqueIds(bvRows.map((row) => row.project_id).filter((id) => !knownIds.has(id)));
      const extraProjects = await fetchInChunks<ProjectDbRow>(missingIds, (chunk) =>
        supabase.from(PROJECTS_TABLE).select('id, name, related_type, related_id').in('id', chunk),
      );
      const projects = [...sourceProjects, ...extraProjects];

      const qcpIds = uniqueIds(
        projects
          .filter((row) => row.related_type === 'quotation_client')
          .map((row) => row.related_id),
      );
      const websiteIds = uniqueIds(
        projects
          .filter((row) => row.related_type === 'webandsystem')
          .map((row) => row.related_id),
      );

      const [qcps, websites] = await Promise.all([
        fetchInChunks<QcpDbRow>(qcpIds, (chunk) =>
          supabase
            .from(QUOTATION_CLIENT_PROJECT_TABLE)
            .select(
              'id, display_name, pitching_code, client_name, status, project_types, signed_date, handover_date, estimated_income, estimated_expenses, webandsystem_list_id, main_pm:staffs!main_pm_id ( display_name )',
            )
            .in('id', chunk),
        ),
        fetchInChunks<WebsiteDbRow>(websiteIds, (chunk) =>
          supabase.from('webandsystem_list').select('id, website_name').in('id', chunk),
        ),
      ]);

      const qcpMap = new Map(qcps.map((row) => [String(row.id), row]));
      const websiteMap = new Map(websites.map((row) => [String(row.id), row]));
      const typeCatalog = projectTypes.map((row) => ({
        id: row.id,
        code: row.code,
        display: row.display,
        section: 'quotation' as const,
      }));

      const projectInfo = new Map<string, BvAllocationProjectInfo>();
      for (const project of projects) {
        const relatedType = isProjectHubRelatedType(project.related_type) ? project.related_type : undefined;
        const relatedId = optionalText(project.related_id);
        const qcp = relatedType === 'quotation_client' && relatedId ? qcpMap.get(relatedId) : undefined;
        const website = relatedType === 'webandsystem' && relatedId ? websiteMap.get(relatedId) : undefined;
        const estimatedIncome =
          qcp?.estimated_income == null ? undefined : toMoneyAmount(qcp.estimated_income);
        const estimatedExpense = qcp ? sumEstimatedExpenses(parseEstimatedExpenses(qcp.estimated_expenses)) : 0;
        const projectType = qcp ? projectTypeByIdOrCode(qcp.project_types, typeCatalog) : undefined;

        projectInfo.set(String(project.id), {
          projectId: String(project.id),
          projectName:
            optionalText(qcp?.display_name) ||
            optionalText(website?.website_name) ||
            optionalText(project.name) ||
            '未指定項目',
          pitchingCode: optionalText(qcp?.pitching_code),
          clientName: optionalText(qcp?.client_name),
          relatedType,
          relatedId,
          quotationClientProjectId: relatedType === 'quotation_client' ? relatedId : undefined,
          websiteId:
            relatedType === 'webandsystem' ? relatedId : optionalText(qcp?.webandsystem_list_id),
          projectStatus: optionalText(qcp?.status),
          projectTypeLabel: projectType?.display || (relatedType === 'webandsystem' ? '網站系統' : undefined),
          mainPmName: optionalText(firstJoin(qcp?.main_pm)?.display_name),
          signedDate: optionalIsoDate(qcp?.signed_date),
          handoverDate: optionalIsoDate(qcp?.handover_date),
          estimatedIncome,
          estimatedProfit:
            estimatedIncome == null && estimatedExpense === 0
              ? undefined
              : computeGp(estimatedIncome ?? 0, estimatedExpense),
        });
      }

      setGroups(groupBvAllocations(bvRows.map(mapStaffRow), projectInfo));
      setError(null);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      if (isAbortError(err)) return;
      setError(err instanceof Error ? err.message : '載入 BV 分配失敗');
      setGroups([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { groups, loading, error, lastSyncedAt, refresh };
}
