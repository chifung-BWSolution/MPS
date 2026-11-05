import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';
import { useCategoryLookup } from '@/hooks/useCategoryLookup';
import {
  formatHourSharePercent,
  groupStaffLabour,
  LABOUR_RATE_LABEL,
  labourCost,
  relatedIdsForClientProject,
  type LabourProjectHub,
} from '@/lib/clientProjectLabour';
import { formatQuotationListMoney } from '@/lib/quotationListMoney';
import { resolveRelatedDayReportIds } from '@/lib/resolveProjectHub';
import { resolveCategoryLabel } from '@/lib/workCategoryLabel';

type TaskRow = {
  id: string;
  title: string;
  category: string;
  hours: number;
  reportDate: string;
  labourCost: number;
};

type StaffGroup = {
  staffId: string;
  staffName: string;
  totalHours: number;
  labourCost: number;
  ratio: number | null;
  tasks: TaskRow[];
};

type EntryRow = {
  id: string;
  staff_id: string;
  category: string | null;
  title: string | null;
  hours: number | null;
  created_at: string | null;
  day_reports: { report_date: string } | { report_date: string }[] | null;
};

function reportDateOf(row: EntryRow): string {
  const reports = row.day_reports;
  if (!reports) return '';
  const date = Array.isArray(reports) ? reports[0]?.report_date : reports.report_date;
  return date?.slice(0, 10) || '';
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatReportDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

async function resolveRelatedIds(quotationClientProjectId: string, websiteListId: string): Promise<string[]> {
  if (websiteListId) {
    const related = await resolveRelatedDayReportIds('webandsystem', websiteListId);
    return related.data;
  }
  const [{ data: clientHub }, { data: clientProject }] = await Promise.all([
    supabase
      .from('projects')
      .select('id')
      .eq('related_type', 'quotation_client')
      .eq('related_id', quotationClientProjectId)
      .maybeSingle(),
    supabase
      .from('quotation_client_project')
      .select('webandsystem_list_id')
      .eq('id', quotationClientProjectId)
      .maybeSingle(),
  ]);

  const websiteId = String(clientProject?.webandsystem_list_id || '').trim();
  let websiteHubId = '';
  if (websiteId) {
    const { data: websiteHub } = await supabase
      .from('projects')
      .select('id')
      .eq('related_type', 'webandsystem')
      .eq('related_id', websiteId)
      .maybeSingle();
    websiteHubId = websiteHub?.id ? String(websiteHub.id) : '';
  }

  const hubs: LabourProjectHub[] = [
    clientHub?.id
      ? { id: String(clientHub.id), relatedType: 'quotation_client', relatedId: quotationClientProjectId }
      : null,
    websiteHubId
      ? { id: websiteHubId, relatedType: 'webandsystem', relatedId: websiteId }
      : null,
  ].filter((hub): hub is LabourProjectHub => hub != null);

  return relatedIdsForClientProject(
    { id: quotationClientProjectId, webandsystemListId: websiteId },
    hubs,
  );
}

export function PitchingWorkHoursTab({
  projectId = '',
  websiteId = '',
}: {
  /** Quotation client project id (系統／專案 detail). */
  projectId?: string;
  /** webandsystem_list id (網站 detail). */
  websiteId?: string;
}) {
  const categoryLookup = useCategoryLookup();
  const showLabour = Boolean(projectId) && !websiteId;
  const [groups, setGroups] = useState<StaffGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId && !websiteId) {
      setGroups([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const relatedIds = await resolveRelatedIds(projectId, websiteId);
      if (cancelled) return;

      const { data, error: queryError } = await supabase
        .from('day_report_entries')
        .select('id, staff_id, category, title, hours, created_at, day_reports!inner(report_date)')
        .in('related_id', relatedIds)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
        setGroups([]);
        setLoading(false);
        return;
      }

      const rows = (data || []) as EntryRow[];
      const staffIds = [...new Set(rows.map((row) => row.staff_id).filter(Boolean))];
      const nameMap = await fetchStaffNameMap(staffIds);
      if (cancelled) return;

      const labourGroups = groupStaffLabour(
        rows.flatMap((row) => {
          if (!row.staff_id) return [];
          return [{
            staffId: row.staff_id,
            hours: Number(row.hours) || 0,
            id: row.id,
            title: (row.title || '').trim(),
            category: row.category || '',
            reportDate: reportDateOf(row),
          }];
        }),
      );

      const nextGroups = labourGroups
        .map((group) => ({
          ...group,
          staffName: nameMap[group.staffId] || group.staffId,
          tasks: [...group.tasks].sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || '')),
        }))
        .sort((a, b) => b.totalHours - a.totalHours || a.staffName.localeCompare(b.staffName, 'zh-Hant'));

      setGroups(nextGroups);
      setExpandedIds(new Set(nextGroups.map((group) => group.staffId)));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, websiteId]);

  const totalHours = useMemo(
    () => groups.reduce((sum, group) => sum + group.totalHours, 0),
    [groups],
  );
  const totalTasks = useMemo(
    () => groups.reduce((sum, group) => sum + group.tasks.length, 0),
    [groups],
  );
  const totalLabourCost = useMemo(() => labourCost(totalHours), [totalHours]);

  const toggleStaff = (staffId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-10 text-center text-[13px] text-muted-foreground">
        <Loader2 size={20} className="mx-auto mb-2 animate-spin text-teal-600" />
        正在載入工作時數…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
        <Clock size={24} className="mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-[13px] text-amber-800">無法載入工作時數：{error}</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
        <Clock size={24} className="mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-[13px] text-muted-foreground">尚未有同事匯報此項目的工作時數</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 ${showLabour ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground block">總工時</span>
          <span className="text-[20px] font-bold text-teal-600 tabular-nums">{formatHours(totalHours)}h</span>
        </div>
        {showLabour && (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground block">人工成本</span>
            <span className="text-[20px] font-bold tabular-nums">{formatQuotationListMoney(totalLabourCost)}</span>
            <span className="text-[11px] text-muted-foreground">{LABOUR_RATE_LABEL}</span>
          </div>
        )}
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground block">匯報同事</span>
          <span className="text-[20px] font-bold tabular-nums">{groups.length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground block">匯報筆數</span>
          <span className="text-[20px] font-bold tabular-nums">{totalTasks}</span>
        </div>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden divide-y divide-border/60">
        {groups.map((group) => {
          const expanded = expandedIds.has(group.staffId);
          return (
            <div key={group.staffId}>
              <button
                type="button"
                onClick={() => toggleStaff(group.staffId)}
                aria-expanded={expanded}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                {expanded ? (
                  <ChevronDown size={16} className="text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                )}
                <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 text-[12px] font-semibold flex items-center justify-center shrink-0">
                  {group.staffName.trim().slice(0, 1) || <Users size={12} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold truncate">{group.staffName}</p>
                  <p className="text-[12px] text-muted-foreground">{group.tasks.length} 筆匯報</p>
                </div>
                {showLabour ? (
                  <div className="shrink-0 flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground">工時</p>
                      <p className="text-[14px] font-bold text-teal-600 tabular-nums">{formatHours(group.totalHours)}h</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">占比</p>
                      <p className="text-[14px] font-semibold tabular-nums">{formatHourSharePercent(group.ratio)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">人工成本</p>
                      <p className="text-[14px] font-bold tabular-nums">{formatQuotationListMoney(group.labourCost)}</p>
                    </div>
                  </div>
                ) : (
                  <span className="text-[16px] font-bold text-teal-600 tabular-nums shrink-0">
                    {formatHours(group.totalHours)}h
                  </span>
                )}
              </button>

              {expanded && (
                <div className="bg-[#f5f8fc]/70 border-t border-border/50">
                  <table className="w-full text-left">
                    <thead className="text-[11px] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium pl-16">日期</th>
                        <th className="px-4 py-2 font-medium">類別</th>
                        <th className="px-4 py-2 font-medium">工作內容</th>
                        <th className="px-4 py-2 font-medium text-right">工時</th>
                        {showLabour && <th className="px-4 py-2 font-medium text-right">人工成本</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {group.tasks.map((task) => (
                        <tr key={task.id} className="border-t border-border/40">
                          <td className="px-4 py-2 pl-16 text-[12px] whitespace-nowrap text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} />
                              {formatReportDate(task.reportDate)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-[12px] text-muted-foreground whitespace-nowrap">
                            {resolveCategoryLabel(task.category, categoryLookup)}
                          </td>
                          <td className="px-4 py-2 text-[13px]">{task.title || '—'}</td>
                          <td className="px-4 py-2 text-[13px] font-semibold text-right tabular-nums">
                            {formatHours(task.hours)}h
                          </td>
                          {showLabour && (
                            <td className="px-4 py-2 text-[13px] text-right tabular-nums">
                              {formatQuotationListMoney(task.labourCost)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
