import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { INCOMES_TABLE } from '@/lib/quotationIncomes';
import { EXPENSES_TABLE, EXPENSE_RELATED_TYPE_PROJECT } from '@/lib/quotationExpenses';
import {
  attributeHoursToClientProjects,
  collectClientProjectRelatedIds,
  labourCost,
  type ClientProjectLabourSource,
  type LabourProjectHub,
} from '@/lib/clientProjectLabour';
import { QUOTATION_CLIENT_PROJECT_TABLE } from '@/lib/resolveProjectHub';
import {
  buildProjectActuals,
  type LabourHourAmountRow,
  type QuotationProjectActuals,
} from '@/lib/quotationListMoney';
import { isAbortError } from '@/lib/queryCache';

const PROJECTS_TABLE = 'projects';
const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

type ClientProjectLinkRow = {
  id: string;
  webandsystem_list_id: string | null;
};

type HubRow = {
  id: string;
  related_id: string | null;
};

type EntryHourRow = {
  related_id: string | null;
  hours: number | string | null;
};

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

async function fetchHourRows(relatedIds: string[]): Promise<EntryHourRow[]> {
  const ids = [...new Set(relatedIds.map((id) => id.trim()).filter(Boolean))];
  const rows: EntryHourRow[] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    const page = await fetchAllRows<EntryHourRow>((from, to) =>
      supabase
        .from('day_report_entries')
        .select('related_id, hours')
        .in('related_id', chunk)
        .order('id', { ascending: true })
        .range(from, to),
    );
    rows.push(...page);
  }
  return rows;
}

function labourRowsFor(
  projects: ClientProjectLabourSource[],
  hubs: LabourProjectHub[],
  hourRows: EntryHourRow[],
): LabourHourAmountRow[] {
  const attributed = attributeHoursToClientProjects(
    hourRows.map((row) => ({ relatedId: row.related_id, hours: row.hours })),
    projects,
    hubs,
  );
  return [...attributed.entries()].map(([quotation_client_project_id, hours]) => ({
    quotation_client_project_id,
    hours,
  }));
}

async function fetchLabourHours(
  projects: ClientProjectLabourSource[],
  hubs: LabourProjectHub[],
): Promise<LabourHourAmountRow[]> {
  const relatedIds = collectClientProjectRelatedIds(projects, hubs);
  if (!relatedIds.length) return [];
  const hourRows = await fetchHourRows(relatedIds);
  return labourRowsFor(projects, hubs, hourRows);
}

async function fetchAllQuotationProjectActuals(): Promise<Record<string, QuotationProjectActuals>> {
  const [incomesRes, linksRes, expensesRes, clientProjects, websiteHubs] = await Promise.all([
    supabase.from(INCOMES_TABLE).select('quotation_client_project_id, billed_amount'),
    supabase.from(PROJECTS_TABLE).select('id, related_id').eq('related_type', 'quotation_client'),
    supabase
      .from(EXPENSES_TABLE)
      .select('related_id, billed_amount')
      .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT),
    fetchAllRows<ClientProjectLinkRow>((from, to) =>
      supabase
        .from(QUOTATION_CLIENT_PROJECT_TABLE)
        .select('id, webandsystem_list_id')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<HubRow>((from, to) =>
      supabase
        .from(PROJECTS_TABLE)
        .select('id, related_id')
        .eq('related_type', 'webandsystem')
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  if (incomesRes.error) throw new Error(incomesRes.error.message);
  if (linksRes.error) throw new Error(linksRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);

  const links = linksRes.data ?? [];
  const projects: ClientProjectLabourSource[] = clientProjects.map((row) => ({
    id: row.id,
    webandsystemListId: row.webandsystem_list_id,
  }));
  const hubs: LabourProjectHub[] = [
    ...links.map((link) => ({
      id: link.id,
      relatedType: 'quotation_client',
      relatedId: link.related_id,
    })),
    ...websiteHubs.map((hub) => ({
      id: hub.id,
      relatedType: 'webandsystem',
      relatedId: hub.related_id,
    })),
  ];
  const labourHours = await fetchLabourHours(projects, hubs);

  return buildProjectActuals(
    incomesRes.data ?? [],
    links,
    expensesRes.data ?? [],
    labourHours,
  );
}

async function loadOneProjectLabourContext(quotationClientProjectId: string): Promise<{
  links: HubRow[];
  project: ClientProjectLabourSource;
  hubs: LabourProjectHub[];
}> {
  const [linksRes, projectRes] = await Promise.all([
    supabase
      .from(PROJECTS_TABLE)
      .select('id, related_id')
      .eq('related_type', 'quotation_client')
      .eq('related_id', quotationClientProjectId),
    supabase
      .from(QUOTATION_CLIENT_PROJECT_TABLE)
      .select('id, webandsystem_list_id')
      .eq('id', quotationClientProjectId)
      .maybeSingle(),
  ]);

  if (linksRes.error) throw new Error(linksRes.error.message);
  if (projectRes.error) throw new Error(projectRes.error.message);

  const links = linksRes.data ?? [];
  const websiteId = String(projectRes.data?.webandsystem_list_id || '').trim();
  const websiteHubs = websiteId
    ? await fetchAllRows<HubRow>((from, to) =>
        supabase
          .from(PROJECTS_TABLE)
          .select('id, related_id')
          .eq('related_type', 'webandsystem')
          .eq('related_id', websiteId)
          .order('id', { ascending: true })
          .range(from, to),
      )
    : [];

  const project: ClientProjectLabourSource = {
    id: projectRes.data?.id || quotationClientProjectId,
    webandsystemListId: websiteId || null,
  };
  const hubs: LabourProjectHub[] = [
    ...links.map((link) => ({
      id: link.id,
      relatedType: 'quotation_client',
      relatedId: link.related_id,
    })),
    ...websiteHubs.map((hub) => ({
      id: hub.id,
      relatedType: 'webandsystem',
      relatedId: hub.related_id,
    })),
  ];
  return { links, project, hubs };
}

async function fetchOneQuotationProjectActuals(
  quotationClientProjectId: string,
): Promise<Record<string, QuotationProjectActuals>> {
  const [incomesRes, context] = await Promise.all([
    supabase
      .from(INCOMES_TABLE)
      .select('quotation_client_project_id, billed_amount')
      .eq('quotation_client_project_id', quotationClientProjectId),
    loadOneProjectLabourContext(quotationClientProjectId),
  ]);

  if (incomesRes.error) throw new Error(incomesRes.error.message);

  const linkIds = context.links.map((link) => link.id).filter(Boolean);
  const expensesPromise = linkIds.length
    ? supabase
        .from(EXPENSES_TABLE)
        .select('related_id, billed_amount')
        .eq('related_type', EXPENSE_RELATED_TYPE_PROJECT)
        .in('related_id', linkIds)
    : Promise.resolve({ data: [], error: null });

  const [expensesRes, labourHours] = await Promise.all([
    expensesPromise,
    fetchLabourHours([context.project], context.hubs),
  ]);

  if (expensesRes.error) throw new Error(expensesRes.error.message);

  return buildProjectActuals(
    incomesRes.data ?? [],
    context.links,
    expensesRes.data ?? [],
    labourHours,
  );
}

async function fetchOneAttributedLabourHours(quotationClientProjectId: string): Promise<number> {
  const context = await loadOneProjectLabourContext(quotationClientProjectId);
  const rows = await fetchLabourHours([context.project], context.hubs);
  const match = rows.find((row) => row.quotation_client_project_id === context.project.id);
  return match ? Number(match.hours) || 0 : 0;
}

async function fetchQuotationProjectActuals(
  quotationClientProjectId?: string,
): Promise<Record<string, QuotationProjectActuals>> {
  return quotationClientProjectId
    ? fetchOneQuotationProjectActuals(quotationClientProjectId)
    : fetchAllQuotationProjectActuals();
}

function useQuotationProjectActualsState(quotationClientProjectId?: string, enabled = true) {
  const [actuals, setActuals] = useState<Record<string, QuotationProjectActuals>>({});
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActuals({});
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchQuotationProjectActuals(quotationClientProjectId)
      .then((next) => {
        if (cancelled) return;
        setActuals(next);
        setError(null);
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : String(err));
        setActuals({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quotationClientProjectId, enabled]);

  return { actuals, loading, error };
}

export function useQuotationProjectActuals() {
  return useQuotationProjectActualsState(undefined, true);
}

/** Load actual income / expense / GP for one quotation client project. */
export function useQuotationProjectActualsFor(quotationClientProjectId: string | undefined) {
  return useQuotationProjectActualsState(quotationClientProjectId, Boolean(quotationClientProjectId));
}

/** Hours and $500 labour cost attributed to one client project. */
export function useClientProjectLabourHours(quotationClientProjectId: string | undefined) {
  const enabled = Boolean(quotationClientProjectId);
  const [hours, setHours] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quotationClientProjectId) {
      setHours(0);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchOneAttributedLabourHours(quotationClientProjectId)
      .then((next) => {
        if (cancelled) return;
        setHours(next);
        setError(null);
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) return;
        setError(err instanceof Error ? err.message : String(err));
        setHours(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quotationClientProjectId]);

  return { hours, cost: labourCost(hours), loading, error };
}
