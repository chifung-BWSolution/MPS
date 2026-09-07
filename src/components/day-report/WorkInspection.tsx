import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';
import { fetchUserStaffIds, filterStaffInUsers } from '@/components/day-report/userStaffLookup';
import { isValidDepartment } from '@/components/day-report/departmentLookup';
import { isPlaceholderStaff } from '@/services/reportLinkService';
import { StaffOrgFilterSelects } from '@/components/day-report/StaffOrgFilterSelects';
import {
  STAFF_ORG_ALL,
  distinctTeamNames,
  matchesBrandFilter,
  matchesCompanyFilter,
  matchesStaffOrgFilter,
  nextBrandAfterCompanyChange,
  nextTeamAfterScopeChange,
} from '@/components/day-report/staffOrgFilter';
import { getDayReportCompletionStatus } from '@/lib/dayReportCompletion';

// ============================
// Types
// ============================
type PeriodType = 'week' | 'month';
type DayStatus = 'filled' | 'incomplete' | 'leave' | 'rest' | 'missing' | 'future' | 'empty';

interface StaffMember {
  id: string;
  display_name: string;
  base_location: string | null;
  team_name: string | null;
  company_list_id: string | null;
  brand_list_id: string | null;
  department: string | null;
  position: string | null;
}

interface DayReportLite {
  id: string;
  staff_id: string;
  report_date: string;
  is_leave: boolean;
  leave_type: string | null;
  status: string | null;
  total_hours: number;
  target_hours: number;
}

const UNASSIGNED_LABEL = '未分組';
const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];

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

function getWeekRange(anchor: Date): { start: string; end: string; dates: string[] } {
  const start = startOfWeekMonday(anchor);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(toDateStr(addDays(start, i)));
  return { start: dates[0], end: dates[6], dates };
}

function getMonthRange(anchor: Date): { start: string; end: string } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function getMonthWeekRows(anchor: Date): (string | null)[][] {
  const { start: monthStart, end: monthEnd } = getMonthRange(anchor);
  const monthEndDate = parseDateStr(monthEnd);
  let cursor = startOfWeekMonday(parseDateStr(monthStart));
  const rows: (string | null)[][] = [];
  while (cursor <= monthEndDate) {
    const row: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const ds = toDateStr(addDays(cursor, i));
      row.push(ds >= monthStart && ds <= monthEnd ? ds : null);
    }
    rows.push(row);
    cursor = addDays(cursor, 7);
  }
  return rows;
}

function isWeekend(dateStr: string): boolean {
  const day = parseDateStr(dateStr).getDay();
  return day === 0 || day === 6;
}

function formatPeriodLabel(periodType: PeriodType, anchor: Date): string {
  if (periodType === 'week') {
    const { start, end } = getWeekRange(anchor);
    const s = parseDateStr(start);
    const e = parseDateStr(end);
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
  }
  return `${anchor.getFullYear()}/${anchor.getMonth() + 1}`;
}

function leaveShortLabel(leaveType: string | null | undefined): string {
  const t = (leaveType || '').trim();
  if (!t) return '假';
  if (/例|annual|年假/i.test(t)) return '例';
  if (/病|sick/i.test(t)) return '病';
  if (/事/i.test(t)) return '事';
  return t.slice(0, 1);
}

function resolveDayStatus(
  dateStr: string | null,
  report: DayReportLite | undefined,
  todayStr: string,
  entryHoursSum = 0,
): DayStatus {
  if (!dateStr) return 'empty';
  if (dateStr > todayStr) return 'future';
  if (report?.is_leave) return 'leave';
  if (report) {
    return getDayReportCompletionStatus(report, entryHoursSum) === 'complete'
      ? 'filled'
      : 'incomplete';
  }
  if (isWeekend(dateStr)) return 'rest';
  return 'missing';
}

function StatusCell({
  dateStr,
  status,
  leaveType,
}: {
  dateStr: string | null;
  status: DayStatus;
  leaveType?: string | null;
}) {
  if (!dateStr || status === 'empty') {
    return <div className="h-9 rounded bg-transparent" />;
  }

  const dayNum = parseDateStr(dateStr).getDate();

  return (
    <div className={cn(
      'h-9 rounded border flex flex-col items-center justify-center gap-0.5 min-w-0',
      status === 'missing' && 'border-rose-100 bg-rose-50/40',
      status === 'future' && 'border-transparent bg-slate-50/60',
      status === 'filled' && 'border-emerald-100 bg-emerald-50/50',
      status === 'incomplete' && 'border-amber-100 bg-amber-50/50',
      status === 'leave' && 'border-amber-100 bg-amber-50/50',
      status === 'rest' && 'border-violet-100 bg-violet-50/40',
    )}>
      <span className="text-[9px] text-muted-foreground leading-none tabular-nums">{dayNum}</span>
      {status === 'filled' && (
        <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
          <Check size={9} strokeWidth={3} />
        </span>
      )}
      {status === 'incomplete' && (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
          未
        </span>
      )}
      {status === 'leave' && (
        <span className="w-3.5 h-3.5 rounded-full bg-amber-600 text-white text-[8px] font-bold flex items-center justify-center leading-none">
          {leaveShortLabel(leaveType)}
        </span>
      )}
      {status === 'rest' && (
        <span className="w-3.5 h-3.5 rounded-full bg-violet-500 text-white text-[8px] font-bold flex items-center justify-center leading-none">
          休
        </span>
      )}
      {(status === 'missing' || status === 'future') && (
        <span className="w-3.5 h-3.5" />
      )}
    </div>
  );
}

// ============================
// Component
// ============================
export function WorkInspection() {
  const { systemUser } = useAuth();
  const { companies } = useCompanies();
  const { brands } = useBrands();

  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [nameQuery, setNameQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(STAFF_ORG_ALL);
  const [selectedBrandId, setSelectedBrandId] = useState(STAFF_ORG_ALL);
  const [selectedTeam, setSelectedTeam] = useState(STAFF_ORG_ALL);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [reports, setReports] = useState<DayReportLite[]>([]);
  const [entryHoursByReport, setEntryHoursByReport] = useState<Record<string, number>>({});
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const todayStr = useMemo(() => toDateStr(new Date()), []);

  const dateRange = useMemo(() => {
    if (periodType === 'week') {
      const { start, end } = getWeekRange(anchorDate);
      return { start, end };
    }
    return getMonthRange(anchorDate);
  }, [periodType, anchorDate]);

  const weekDates = useMemo(
    () => (periodType === 'week' ? getWeekRange(anchorDate).dates : []),
    [periodType, anchorDate],
  );

  const monthWeekRows = useMemo(
    () => (periodType === 'month' ? getMonthWeekRows(anchorDate) : []),
    [periodType, anchorDate],
  );

  const fetchData = useCallback(async () => {
    if (!systemUser) return;

    try {
      const { data: rawStaff } = await supabase
        .from('staffs')
        .select('id, display_name, base_location, team_name, position, status, company_list_id, brand_list_id')
        .eq('status', 'active')
        .neq('position', 'Director');

      let staffData: StaffMember[] = (rawStaff || []).map((s) => {
        const teamName = (s.team_name || '').trim() || null;
        return {
          id: s.id,
          display_name: s.display_name,
          base_location: s.base_location,
          team_name: teamName,
          company_list_id: s.company_list_id,
          brand_list_id: s.brand_list_id,
          position: s.position,
          department: isValidDepartment(teamName) ? teamName : null,
        };
      });

      // Dedupe + exclude management-like positions
      const EXCLUDED_POSITIONS = ['director', 'director / management'];
      const EXCLUDED_DEPARTMENTS = ['management'];
      const seen = new Set<string>();
      staffData = staffData.filter((s) => {
        if (!s.id || seen.has(s.id)) return false;
        seen.add(s.id);
        const pos = (s.position || '').toLowerCase().trim();
        const dept = (s.department || '').toLowerCase().trim();
        return !EXCLUDED_POSITIONS.includes(pos)
          && !EXCLUDED_DEPARTMENTS.includes(dept)
          && !isPlaceholderStaff(s);
      });

      staffData = filterStaffInUsers(staffData, await fetchUserStaffIds());

      const staffIds = staffData.map((s) => s.id);
      let reportData: DayReportLite[] = [];
      if (staffIds.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < staffIds.length; i += chunkSize) {
          const chunk = staffIds.slice(i, i + chunkSize);
          const { data } = await supabase
            .from('day_reports')
            .select('id, staff_id, report_date, is_leave, leave_type, status, total_hours, target_hours')
            .in('staff_id', chunk)
            .gte('report_date', dateRange.start)
            .lte('report_date', dateRange.end)
            .limit(5000);
          if (data) {
            reportData = reportData.concat(
              data.map((r) => ({
                ...r,
                report_date: r.report_date ? String(r.report_date).substring(0, 10) : r.report_date,
                is_leave: !!r.is_leave,
                status: r.status || 'submitted',
                total_hours: Number(r.total_hours) || 0,
                target_hours: Number(r.target_hours) || 0,
              })),
            );
          }
        }
      }

      const hoursByReport: Record<string, number> = {};
      if (reportData.length > 0) {
        const reportIds = reportData.map((r) => r.id);
        const chunkSize = 200;
        for (let i = 0; i < reportIds.length; i += chunkSize) {
          const idChunk = reportIds.slice(i, i + chunkSize);
          const { data: entryData } = await supabase
            .from('day_report_entries')
            .select('day_report_id, hours')
            .in('day_report_id', idChunk)
            .limit(20000);
          (entryData || []).forEach((e) => {
            hoursByReport[e.day_report_id] = (hoursByReport[e.day_report_id] || 0) + (Number(e.hours) || 0);
          });
        }
      }

      const nameMap = await fetchStaffNameMap(staffIds);
      setStaff(staffData);
      setReports(reportData);
      setEntryHoursByReport(hoursByReport);
      setStaffNameById(nameMap);
    } catch (err) {
      console.error('[WorkInspection] Failed to fetch:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    systemUser,
    dateRange.start,
    dateRange.end,
  ]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const shiftPeriod = (dir: -1 | 1) => {
    setAnchorDate((prev) => {
      if (periodType === 'week') return addDays(startOfWeekMonday(prev), dir * 7);
      return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
    });
  };

  const getStaffName = useCallback((staffId: string) => {
    return staffNameById[staffId]
      || staff.find((s) => s.id === staffId)?.display_name
      || staffId;
  }, [staffNameById, staff]);

  const staffWithCompleteReports = useMemo(() => {
    const ids = new Set<string>();
    reports.forEach((r) => {
      if (getDayReportCompletionStatus(r, entryHoursByReport[r.id] || 0) === 'complete') {
        ids.add(r.staff_id);
      }
    });
    return ids;
  }, [reports, entryHoursByReport]);

  const countReportedMembers = useCallback((members: StaffMember[]) => (
    members.reduce((n, m) => n + (staffWithCompleteReports.has(m.id) ? 1 : 0), 0)
  ), [staffWithCompleteReports]);

  const teamOptions = useMemo(() => {
    const scoped = staff.filter((s) => (
      matchesCompanyFilter(s.company_list_id, selectedCompanyId)
      && matchesBrandFilter(s.brand_list_id, selectedBrandId)
    ));
    const groups = new Map<string, StaffMember[]>();
    scoped.forEach((s) => {
      const t = (s.team_name || '').trim();
      if (!t) return;
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t)!.push(s);
    });
    const ranked = Array.from(groups.entries())
      .sort(([a, aMembers], [b, bMembers]) => {
        const diff = countReportedMembers(bMembers) - countReportedMembers(aMembers);
        if (diff !== 0) return diff;
        return a.localeCompare(b, 'zh-Hant');
      })
      .map(([name]) => name);
    return ranked.length > 0 ? ranked : distinctTeamNames(scoped);
  }, [staff, selectedCompanyId, selectedBrandId, countReportedMembers]);

  const reportByStaffDate = useMemo(() => {
    const map = new Map<string, DayReportLite>();
    reports.forEach((r) => {
      map.set(`${r.staff_id}__${r.report_date}`, r);
    });
    return map;
  }, [reports]);

  const filteredStaff = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return staff
      .filter((s) => matchesStaffOrgFilter(s, {
        companyId: selectedCompanyId,
        brandId: selectedBrandId,
        teamName: selectedTeam,
      }))
      .filter((s) => {
        if (!q) return true;
        const name = getStaffName(s.id).toLowerCase();
        const dept = (s.department || '').toLowerCase();
        const team = (s.team_name || '').toLowerCase();
        return name.includes(q) || dept.includes(q) || team.includes(q);
      })
      .sort((a, b) => getStaffName(a.id).localeCompare(getStaffName(b.id), 'zh-Hant'));
  }, [staff, selectedCompanyId, selectedBrandId, selectedTeam, nameQuery, getStaffName]);

  const handleCompanyChange = (id: string) => {
    setSelectedCompanyId(id);
    setSelectedBrandId((prev) => nextBrandAfterCompanyChange(prev, brands, id));
    setSelectedTeam((prev) => {
      const scoped = staff.filter((s) => (
        matchesCompanyFilter(s.company_list_id, id)
        && matchesBrandFilter(s.brand_list_id, nextBrandAfterCompanyChange(selectedBrandId, brands, id))
      ));
      return nextTeamAfterScopeChange(prev, distinctTeamNames(scoped));
    });
  };

  const handleBrandChange = (id: string) => {
    setSelectedBrandId(id);
    setSelectedTeam((prev) => {
      const scoped = staff.filter((s) => (
        matchesCompanyFilter(s.company_list_id, selectedCompanyId)
        && matchesBrandFilter(s.brand_list_id, id)
      ));
      return nextTeamAfterScopeChange(prev, distinctTeamNames(scoped));
    });
  };

  const staffDayCounts = useCallback((member: StaffMember) => {
    const dates = periodType === 'week'
      ? weekDates
      : monthWeekRows.flatMap((row) => row.filter((d): d is string => !!d));

    let missing = 0;
    let incomplete = 0;
    dates.forEach((dateStr) => {
      if (dateStr > todayStr) return;
      const report = reportByStaffDate.get(`${member.id}__${dateStr}`);
      const status = resolveDayStatus(
        dateStr,
        report,
        todayStr,
        report ? (entryHoursByReport[report.id] || 0) : 0,
      );
      if (status === 'missing') missing += 1;
      if (status === 'incomplete') incomplete += 1;
    });
    return { missing, incomplete };
  }, [periodType, weekDates, monthWeekRows, reportByStaffDate, entryHoursByReport, todayStr]);

  const teamGroups = useMemo(() => {
    const groups = new Map<string, StaffMember[]>();
    filteredStaff.forEach((s) => {
      const key = (s.team_name || '').trim() || UNASSIGNED_LABEL;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    });
    return Array.from(groups.entries()).sort(([a, aMembers], [b, bMembers]) => {
      if (a === UNASSIGNED_LABEL) return 1;
      if (b === UNASSIGNED_LABEL) return -1;
      const diff = countReportedMembers(bMembers) - countReportedMembers(aMembers);
      if (diff !== 0) return diff;
      return a.localeCompare(b, 'zh-Hant');
    });
  }, [filteredStaff, countReportedMembers]);

  const renderPersonCard = (member: StaffMember) => {
    const { missing, incomplete } = staffDayCounts(member);
    const name = getStaffName(member.id);
    const rows: (string | null)[][] = periodType === 'week' ? [weekDates] : monthWeekRows;

    return (
      <div
        key={member.id}
        className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden"
      >
        <div className="flex items-start justify-between gap-2 px-3.5 py-3 border-b border-[rgba(13,26,45,0.06)]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <span className="text-[12px] font-bold text-teal-700">{name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate">{name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {Array.from(new Set([member.department, member.team_name].filter(Boolean))).join(' · ') || UNASSIGNED_LABEL}
              </p>
            </div>
          </div>
          {missing > 0 || incomplete > 0 ? (
            <div className="flex items-center gap-1 shrink-0">
              {missing > 0 && (
                <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                  缺 {missing}
                </span>
              )}
              {incomplete > 0 && (
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                  未齊 {incomplete}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded shrink-0">
              齊全
            </span>
          )}
        </div>

        <div className="px-3 py-2.5 space-y-1.5">
          <div className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] gap-1 mb-1">
            <div />
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d} className="text-[10px] text-muted-foreground text-center font-medium">{d}</div>
            ))}
          </div>

          {rows.map((row, rowIndex) => (
            <div key={`row-${member.id}-${rowIndex}`} className="grid grid-cols-[36px_repeat(7,minmax(0,1fr))] gap-1">
              <div className="text-[10px] text-muted-foreground flex items-center">
                {periodType === 'month' ? `第${rowIndex + 1}週` : '本週'}
              </div>
              {row.map((dateStr, colIndex) => {
                const key = dateStr || `empty-${rowIndex}-${colIndex}`;
                const report = dateStr
                  ? reportByStaffDate.get(`${member.id}__${dateStr}`)
                  : undefined;
                const status = resolveDayStatus(
                  dateStr,
                  report,
                  todayStr,
                  report ? (entryHoursByReport[report.id] || 0) : 0,
                );
                return (
                  <StatusCell
                    key={key}
                    dateStr={dateStr}
                    status={status}
                    leaveType={report?.leave_type}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-[rgba(13,26,45,0.08)] px-3 py-2.5 shadow-sm">
        <div className="inline-flex rounded-md border border-[rgba(13,26,45,0.08)] p-0.5">
          {([
            { id: 'week' as const, label: '周報' },
            { id: 'month' as const, label: '月報' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriodType(id)}
              className={cn(
                'px-3 py-1 rounded text-[12px] font-medium transition-colors',
                periodType === id
                  ? 'bg-teal-600 text-white'
                  : 'text-muted-foreground hover:text-[#0d1a2d]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftPeriod(-1)}
            className="px-2 py-1 rounded-md text-[12px] text-muted-foreground hover:bg-muted"
          >
            <span className="inline-flex items-center gap-0.5">
              <ChevronLeft size={14} />
              {periodType === 'week' ? '上一週' : '上一月'}
            </span>
          </button>
          <span className="text-[13px] font-medium min-w-[100px] text-center tabular-nums">
            {formatPeriodLabel(periodType, anchorDate)}
          </span>
          <button
            type="button"
            onClick={() => shiftPeriod(1)}
            className="px-2 py-1 rounded-md text-[12px] text-muted-foreground hover:bg-muted"
          >
            <span className="inline-flex items-center gap-0.5">
              {periodType === 'week' ? '下一週' : '下一月'}
              <ChevronRight size={14} />
            </span>
          </button>
        </div>

        <div className="relative ml-auto sm:ml-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="搜尋人名..."
            className="pl-8 pr-3 py-1.5 border border-border rounded-md text-[12px] bg-white w-[160px] focus:border-teal-300 focus:ring-1 focus:ring-teal-200 outline-none"
          />
        </div>

        <StaffOrgFilterSelects
          companies={companies}
          brands={brands}
          teamOptions={teamOptions}
          companyId={selectedCompanyId}
          brandId={selectedBrandId}
          teamName={selectedTeam}
          onCompanyChange={handleCompanyChange}
          onBrandChange={handleBrandChange}
          onTeamChange={setSelectedTeam}
        />

        <span className="text-[12px] text-muted-foreground tabular-nums">
          {filteredStaff.length}人
        </span>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-teal-700 hover:bg-teal-50 transition-colors"
        >
          <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          刷新
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
            <Check size={9} strokeWidth={3} />
          </span>
          已填
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center">未</span>
          未完成
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-amber-600 text-white text-[8px] font-bold flex items-center justify-center">假</span>
          請假
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-violet-500 text-white text-[8px] font-bold flex items-center justify-center">休</span>
          休
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded border border-rose-100 bg-rose-50/40" />
          未填報
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="animate-spin text-teal-600" size={22} />
          <span className="ml-3 text-[14px]">載入填寫情況…</span>
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-10 text-center text-[13px] text-muted-foreground">
          此篩選條件下暫無人員
        </div>
      ) : (
        <div className="space-y-6">
          {teamGroups.map(([teamName, members]) => (
            <section key={teamName} className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-[14px] font-bold text-[#0d1a2d]">{teamName}</h4>
                <span className="text-[11px] text-muted-foreground">{members.length} 人</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {members.map((member) => renderPersonCard(member))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
