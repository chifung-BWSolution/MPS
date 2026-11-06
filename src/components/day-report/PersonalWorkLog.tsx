import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle, Briefcase, Globe, ListTodo, Loader2,
  Monitor, Pencil, RefreshCw, Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';
import { fetchDepartmentMap } from '@/components/day-report/departmentLookup';
import { useStaffDirectoryFilter } from '@/components/day-report/StaffDirectoryFilterSelects';
import { DayReportFilterBar } from '@/components/day-report/DayReportFilterBar';
import { useCategoryLookup } from '@/hooks/useCategoryLookup';
import { resolveCategoryLabel } from '@/lib/workCategoryLabel';
import {
  REPORT_PROJECT_KIND_LABELS,
  REPORT_PROJECT_KIND_OPTIONS,
  reportProjectKind,
  type ReportProjectKind,
  type ReportProjectKindFilter,
} from '@/lib/reportProjectKind';

const UNASSIGNED_LABEL = '未分組';

type PeriodType = 'day' | 'week' | 'month';
type ProfileTypeFilter = ReportProjectKindFilter;

interface ProjectProfileLite {
  id: string;
  name: string;
  profile_type: string;
  domain_url: string | null;
  related_type: string;
}

interface EntryRow {
  id: string;
  day_report_id: string;
  staff_id: string;
  related_id: string | null;
  related_name: string | null;
  hours: number;
  title: string | null;
  category: string | null;
}

interface LogEntry {
  id: string;
  staffId: string;
  projectId: string;
  projectName: string;
  kind: ReportProjectKind;
  reportDate: string;
  category: string;
  title: string;
  hours: number;
}

interface PersonLog {
  staffId: string;
  name: string;
  department: string;
  totalHours: number;
  entries: LogEntry[];
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getDayRange(anchor: Date): { start: string; end: string } {
  const s = toDateStr(anchor);
  return { start: s, end: s };
}

function getWeekRange(anchor: Date): { start: string; end: string } {
  const start = startOfWeekMonday(anchor);
  return { start: toDateStr(start), end: toDateStr(addDays(start, 6)) };
}

function getMonthRange(anchor: Date): { start: string; end: string } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function getDateRange(periodType: PeriodType, anchor: Date): { start: string; end: string } {
  if (periodType === 'day') return getDayRange(anchor);
  if (periodType === 'week') return getWeekRange(anchor);
  return getMonthRange(anchor);
}

function formatPeriodLabel(periodType: PeriodType, anchor: Date): string {
  if (periodType === 'day') {
    const d = anchor;
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）`;
  }
  if (periodType === 'week') {
    const { start, end } = getWeekRange(anchor);
    const s = parseDateStr(start);
    const e = parseDateStr(end);
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
  }
  return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
}

function formatEntryDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '—';
  const d = parseDateStr(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）`;
}

function shiftAnchor(periodType: PeriodType, anchor: Date, delta: number): Date {
  if (periodType === 'day') return addDays(anchor, delta);
  if (periodType === 'week') return addDays(anchor, delta * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}

function roundHours(n: number): number {
  return Math.round(n * 10) / 10;
}

const KIND_BADGE_CLASS: Record<ReportProjectKind, string> = {
  system: 'bg-indigo-50 text-indigo-700',
  website: 'bg-sky-50 text-sky-700',
  quotation_client: 'bg-amber-50 text-amber-700',
  vchannel: 'bg-purple-50 text-purple-700',
  asana_task: 'bg-orange-50 text-orange-700',
  manual: 'bg-slate-100 text-slate-600',
  orphan: 'bg-rose-50 text-rose-700',
};

function KindIcon({ kind }: { kind: ReportProjectKind }) {
  const props = { size: 10 };
  if (kind === 'system') return <Monitor {...props} />;
  if (kind === 'website') return <Globe {...props} />;
  if (kind === 'quotation_client') return <Briefcase {...props} />;
  if (kind === 'vchannel') return <Video {...props} />;
  if (kind === 'asana_task') return <ListTodo {...props} />;
  if (kind === 'manual') return <Pencil {...props} />;
  return <AlertTriangle {...props} />;
}

function ProfileTypeBadge({ kind }: { kind: ReportProjectKind }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 whitespace-nowrap',
      KIND_BADGE_CLASS[kind],
    )}>
      <KindIcon kind={kind} />
      {REPORT_PROJECT_KIND_LABELS[kind]}
    </span>
  );
}

export function PersonalWorkLog() {
  const categoryLookup = useCategoryLookup();
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [typeFilter, setTypeFilter] = useState<ProfileTypeFilter>('all');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [nameQuery, setNameQuery] = useState('');
  const [profiles, setProfiles] = useState<ProjectProfileLite[]>([]);
  const [asanaTaskGids, setAsanaTaskGids] = useState<Set<string>>(() => new Set());
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [reportDateById, setReportDateById] = useState<Record<string, string>>({});
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [departmentByStaffId, setDepartmentByStaffId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const staffFilter = useStaffDirectoryFilter();

  const dateRange = useMemo(
    () => getDateRange(periodType, anchorDate),
    [periodType, anchorDate],
  );

  const fetchData = useCallback(async () => {
    try {
      const [{ data: projectData }, { data: reportData }, { data: asanaData }] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, related_type, meta')
          .order('name', { ascending: true }),
        supabase
          .from('day_reports')
          .select('id, report_date')
          .gte('report_date', dateRange.start)
          .lte('report_date', dateRange.end),
        supabase
          .from('asana_synced_tasks')
          .select('asana_task_gid'),
      ]);

      const mappedProfiles: ProjectProfileLite[] = ((projectData || []) as any[]).map((p) => {
        const meta = (p.meta && typeof p.meta === 'object') ? p.meta : {};
        return {
          id: p.id,
          name: p.name,
          profile_type: typeof meta.profile_type === 'string' ? meta.profile_type : '',
          domain_url: meta.domain_url ? String(meta.domain_url) : null,
          related_type: p.related_type,
        };
      });
      setProfiles(mappedProfiles);
      setAsanaTaskGids(new Set(
        ((asanaData || []) as { asana_task_gid?: string | null }[])
          .map((row) => (row.asana_task_gid || '').trim())
          .filter((gid) => /^\d{6,}$/.test(gid)),
      ));

      const dateMap: Record<string, string> = {};
      (reportData || []).forEach((row) => {
        if (row.id) dateMap[row.id] = row.report_date || '';
      });
      setReportDateById(dateMap);

      let entryData: EntryRow[] = [];
      if (reportData && reportData.length > 0) {
        const reportIds = reportData.map((r) => r.id);
        const chunkSize = 200;
        for (let i = 0; i < reportIds.length; i += chunkSize) {
          const chunk = reportIds.slice(i, i + chunkSize);
          const { data } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, staff_id, related_id, related_name, hours, title, category')
            .in('day_report_id', chunk)
            .not('related_id', 'is', null);
          if (data) entryData = entryData.concat(data as EntryRow[]);
        }
      }

      const staffIds = [...new Set(entryData.map((e) => e.staff_id).filter(Boolean))];
      const [nameMap, deptMap] = await Promise.all([
        fetchStaffNameMap(staffIds),
        fetchDepartmentMap(staffIds),
      ]);

      setEntries(entryData);
      setStaffNameById(nameMap);
      setDepartmentByStaffId(deptMap);
    } catch (err) {
      console.error('[PersonalWorkLog] Failed to fetch data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const profileById = useMemo(() => {
    const map = new Map<string, ProjectProfileLite>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const kindSourceFor = useCallback((projectId: string) => {
    const profile = profileById.get(projectId);
    if (profile) {
      return { relatedType: profile.related_type, profileType: profile.profile_type };
    }
    if (asanaTaskGids.has(projectId)) return { relatedType: 'asana_task' };
    return null;
  }, [asanaTaskGids, profileById]);

  const resolveProjectMeta = useCallback((projectId: string, relatedName: string | null | undefined) => {
    const profile = profileById.get(projectId);
    const kind = reportProjectKind(kindSourceFor(projectId));
    return {
      name: profile?.name || relatedName || projectId,
      kind,
    };
  }, [kindSourceFor, profileById]);

  const personLogs = useMemo((): PersonLog[] => {
    const byStaff = new Map<string, LogEntry[]>();

    const q = nameQuery.trim().toLowerCase();
    entries.forEach((e) => {
      if (!staffFilter.includes(e.staff_id)) return;
      if (q) {
        const name = (staffNameById[e.staff_id] || '').toLowerCase();
        const dept = (departmentByStaffId[e.staff_id] || '').toLowerCase();
        if (!name.includes(q) && !dept.includes(q)) return;
      }
      const projectId = e.related_id;
      if (!projectId) return;
      const hours = Number(e.hours) || 0;
      if (hours <= 0) return;
      const meta = resolveProjectMeta(projectId, e.related_name);
      if (typeFilter !== 'all' && meta.kind !== typeFilter) return;

      const row: LogEntry = {
        id: e.id,
        staffId: e.staff_id,
        projectId,
        projectName: meta.name,
        kind: meta.kind,
        reportDate: reportDateById[e.day_report_id] || '',
        category: e.category || '',
        title: (e.title || '').trim(),
        hours,
      };
      if (!byStaff.has(e.staff_id)) byStaff.set(e.staff_id, []);
      byStaff.get(e.staff_id)!.push(row);
    });

    const logs: PersonLog[] = [];
    byStaff.forEach((rows, staffId) => {
      rows.sort((a, b) => {
        const dateCmp = a.reportDate.localeCompare(b.reportDate);
        if (dateCmp !== 0) return dateCmp;
        return b.hours - a.hours || a.projectName.localeCompare(b.projectName, 'zh-Hant');
      });
      const totalHours = roundHours(rows.reduce((s, row) => s + row.hours, 0));
      if (totalHours <= 0) return;
      logs.push({
        staffId,
        name: staffNameById[staffId] || staffId,
        department: departmentByStaffId[staffId] || UNASSIGNED_LABEL,
        totalHours,
        entries: rows,
      });
    });

    return logs.sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [departmentByStaffId, entries, nameQuery, reportDateById, resolveProjectMeta, staffFilter.includes, staffNameById, typeFilter]);

  const summary = useMemo(() => {
    const totalHours = roundHours(personLogs.reduce((s, p) => s + p.totalHours, 0));
    const projectSet = new Set(personLogs.flatMap((p) => p.entries.map((e) => e.projectId)));
    const entryCount = personLogs.reduce((s, p) => s + p.entries.length, 0);
    return {
      people: personLogs.length,
      totalHours,
      projects: projectSet.size,
      entryCount,
    };
  }, [personLogs]);

  return (
    <div>
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight">個人工作記錄</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            按人員列出每筆匯報的日期、項目、工作內容與工時，並顯示每人合計工時。可篩選在職狀態、BU、團隊、職位，以及系統、網站、客戶項目、影片頻道、Asana 項目、自訂或異常。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-0.5">
            {REPORT_PROJECT_KIND_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={cn(
                  'px-3 py-1 rounded text-[12px] font-medium transition-colors',
                  typeFilter === id
                    ? 'bg-teal-600 text-white'
                    : 'text-muted-foreground hover:text-[#0d1a2d]',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-teal-700 hover:bg-teal-50 transition-colors"
          >
            <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
            重新整理
          </button>
        </div>

        <DayReportFilterBar<PeriodType>
          periods={[
            { id: 'day', label: '按天' },
            { id: 'week', label: '按週' },
            { id: 'month', label: '按月' },
          ]}
          period={periodType}
          onPeriodChange={(next) => setPeriodType(next)}
          label={formatPeriodLabel(periodType, anchorDate)}
          onPrev={() => setAnchorDate((d) => shiftAnchor(periodType, d, -1))}
          onNext={() => setAnchorDate((d) => shiftAnchor(periodType, d, 1))}
          onToday={() => setAnchorDate(new Date())}
          search={nameQuery}
          onSearchChange={setNameQuery}
          staffFilter={staffFilter}
        />
      </div>

      {loading || !staffFilter.ready ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[13px]">載入工作記錄…</span>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">投入人員</p>
          <p className="text-[20px] font-bold tabular-nums mt-0.5">{summary.people}</p>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">總工時</p>
          <p className="text-[20px] font-bold text-teal-700 tabular-nums mt-0.5">{summary.totalHours}h</p>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">參與項目</p>
          <p className="text-[20px] font-bold tabular-nums mt-0.5">{summary.projects}</p>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">工作筆數</p>
          <p className="text-[20px] font-bold tabular-nums mt-0.5">{summary.entryCount}</p>
        </div>
      </div>

      {personLogs.length === 0 ? (
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm py-16 text-center">
          <p className="text-[14px] text-muted-foreground">此期間暫無符合篩選的工時記錄</p>
          <p className="text-[12px] text-muted-foreground mt-1">請確認匯報項目已選擇關聯對象</p>
        </div>
      ) : (
        <div className="space-y-5">
          {personLogs.map((person) => (
            <section
              key={person.staffId}
              className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(13,26,45,0.06)] bg-muted/20">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    <span className="text-[12px] font-bold text-teal-700">
                      {person.name.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-bold truncate" title={person.name}>{person.name}</h4>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {person.department} · {person.entries.length} 筆
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[20px] font-bold text-teal-700 tabular-nums">{person.totalHours}h</p>
                  <p className="text-[10px] text-muted-foreground">合計工時</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-[13px]">
                  <thead>
                    <tr className="border-b border-[rgba(13,26,45,0.06)] text-[11px] text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2.5 whitespace-nowrap w-[148px]">日期</th>
                      <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap w-[108px]">工作類型</th>
                      <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap w-[108px]">項目類型</th>
                      <th className="text-left font-medium px-3 py-2.5 min-w-[160px]">項目</th>
                      <th className="text-left font-medium px-3 py-2.5 min-w-[200px]">工作內容</th>
                      <th className="text-right font-medium px-4 py-2.5 whitespace-nowrap w-[72px]">工時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {person.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-[rgba(13,26,45,0.04)] last:border-b-0 hover:bg-teal-50/40"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">
                          {formatEntryDate(entry.reportDate)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-[12px]">
                          {resolveCategoryLabel(entry.category, categoryLookup)}
                        </td>
                        <td className="px-3 py-2.5">
                          <ProfileTypeBadge kind={entry.kind} />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="line-clamp-2" title={entry.projectName}>{entry.projectName}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {entry.title ? (
                            <span className="line-clamp-2" title={entry.title}>{entry.title}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                          {roundHours(entry.hours)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[rgba(13,26,45,0.08)] bg-muted/10">
                      <td colSpan={5} className="px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
                        合計
                      </td>
                      <td className="px-4 py-2.5 text-right text-[14px] font-bold tabular-nums text-teal-700 whitespace-nowrap">
                        {person.totalHours}h
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
