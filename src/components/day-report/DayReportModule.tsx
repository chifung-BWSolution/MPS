import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Link, Sparkles, Users, BarChart3, Calendar, FileText, Bot, Eye, Loader2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as DayPickerCalendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  addCalendarDays,
  parseLocalDateStr as parseWeekDateStr,
  toLocalDateStr,
} from '@/lib/sundayWeek';
import {
  dailyReportsV2,
  staffMembersV2,
  categoryConfig,
  outcomeTypeConfigV2,
  getTopProjectsByHoursV2,
} from '@/data/dayReportDataV2';
import { WorkCategoriesManager } from '@/components/day-report/WorkCategoriesManager';
import { SubmitReportPage } from '@/components/day-report/SubmitReportPage';
import { TeamDashboard } from '@/components/day-report/TeamDashboard';
import { ProjectAnalysis } from '@/components/day-report/ProjectAnalysis';
import { useCategoryLookup } from '@/hooks/useCategoryLookup';
import {
  isPlaceholderStaff,
  localDateString,
  resolveStaffUuid,
} from '@/services/reportLinkService';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';
import { fetchUserStaffIds, filterStaffInUsers } from '@/components/day-report/userStaffLookup';
import {
  fetchDistinctDepartments,
  fetchDepartmentMap,
  fetchDepartmentByStaffId,
  fetchStaffIdsByDepartment,
  isValidDepartment,
} from '@/components/day-report/departmentLookup';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
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
import { getDayReportCompletionStatus, sumEntryHours } from '@/lib/dayReportCompletion';

// ============================
// Today Team Reports (Read-Only)
// ============================
function formatTeamDateLabel(dateStr: string): string {
  const d = parseWeekDateStr(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function TodayTeamReports() {
  const categoryLookup = useCategoryLookup();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const todayStr = localDateString();
  const [targetDate, setTargetDate] = useState(() => localDateString());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [selectedCompanyId, setSelectedCompanyId] = useState(STAFF_ORG_ALL);
  const [selectedBrandId, setSelectedBrandId] = useState(STAFF_ORG_ALL);
  const [selectedTeam, setSelectedTeam] = useState(STAFF_ORG_ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  type TodayStaff = {
    id: string;
    display_name: string;
    team_name: string | null;
    company_list_id: string | null;
    brand_list_id: string | null;
    department: string | null;
    position: string;
    status: string;
  };

  const [dbStaff, setDbStaff] = useState<TodayStaff[]>([]);
  const [dbReports, setDbReports] = useState<Array<{ id: string; staff_id: string; report_date: string; total_hours: number; target_hours: number; ot_hours: number; is_leave: boolean; leave_type: string | null; status: string }>>([]);
  const [dbEntries, setDbEntries] = useState<Array<{ id: string; day_report_id: string; staff_id: string; category: string; title: string; hours: number; outcome_url: string | null; growth_experience: string | null; is_ai_assisted: boolean; ai_tools: any; related_name: string | null }>>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const isLoading = staffLoading || reportsLoading;

  const applyTargetDate = (dateStr: string) => {
    setTargetDate(dateStr);
    setExpandedId(null);
    setDatePickerOpen(false);
  };

  const shiftTargetDate = (dir: -1 | 1) => {
    applyTargetDate(toLocalDateStr(addCalendarDays(parseWeekDateStr(targetDate), dir)));
  };

  useEffect(() => {
    let cancelled = false;
    async function fetchStaff() {
      setStaffLoading(true);
      try {
        const { data: staffData, error: staffErr } = await supabase
          .from('staffs')
          .select('id, display_name, position, status, team_name, company_list_id, brand_list_id')
          .eq('status', 'active')
          .neq('position', 'Director');

        if (staffErr) {
          console.error('[TodayTeamReports] Staff query error:', staffErr);
        }

        const EXCLUDED_POSITIONS = ['director', 'director / management'];
        const EXCLUDED_DEPARTMENTS = ['management'];
        const seen = new Set<string>();
        const staff = (staffData || [])
          .map((s) => {
            const teamName = (s.team_name || '').trim() || null;
            return {
              id: s.id,
              display_name: s.display_name,
              position: s.position,
              status: s.status,
              team_name: teamName,
              company_list_id: s.company_list_id,
              brand_list_id: s.brand_list_id,
              department: isValidDepartment(teamName) ? teamName : null,
            };
          })
          .filter((s) => {
            if (!s.id || seen.has(s.id)) return false;
            seen.add(s.id);
            const pos = (s.position || '').toLowerCase().trim();
            const dept = (s.department || '').toLowerCase().trim();
            return !EXCLUDED_POSITIONS.includes(pos)
              && !EXCLUDED_DEPARTMENTS.includes(dept)
              && !isPlaceholderStaff(s);
          });
        const allowlisted = filterStaffInUsers(staff, await fetchUserStaffIds());
        if (cancelled) return;
        setDbStaff(allowlisted);
        const nameMap = await fetchStaffNameMap(allowlisted.map((s) => s.id).filter(Boolean));
        if (!cancelled) setStaffNameById((prev) => ({ ...prev, ...nameMap }));
      } catch (err) {
        console.error('[TodayTeamReports] Unexpected staff error:', err);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    }
    fetchStaff();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      setReportsLoading(true);
      try {
        const { data: reportData, error: reportErr } = await supabase
          .from('day_reports')
          .select('id, staff_id, report_date, total_hours, target_hours, ot_hours, is_leave, leave_type, status')
          .eq('report_date', targetDate);

        if (reportErr) {
          console.error('[TodayTeamReports] Reports query error:', reportErr);
        }

        const reports = (reportData || []).map((r) => ({
          ...r,
          total_hours: Number(r.total_hours) || 0,
          target_hours: Number(r.target_hours) || 0,
          ot_hours: Number(r.ot_hours) || 0,
          is_leave: !!r.is_leave,
        }));
        if (cancelled) return;
        setDbReports(reports);

        if (reports.length > 0) {
          const reportIds = reports.map((r) => r.id);
          const { data: entryData, error: entryErr } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, staff_id, category, title, hours, outcome_url, growth_experience, is_ai_assisted, ai_tools, related_name')
            .in('day_report_id', reportIds);

          if (entryErr) {
            console.error('[TodayTeamReports] Entries query error:', entryErr);
          }
          if (!cancelled) setDbEntries(entryData || []);
        } else if (!cancelled) {
          setDbEntries([]);
        }

        const reportStaffIds = reports.map((r) => r.staff_id).filter(Boolean);
        const nameMap = await fetchStaffNameMap(reportStaffIds);
        if (!cancelled) setStaffNameById((prev) => ({ ...prev, ...nameMap }));
      } catch (err) {
        console.error('[TodayTeamReports] Unexpected reports error:', err);
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    }
    fetchReports();
    return () => { cancelled = true; };
  }, [targetDate]);

  const teamOptions = useMemo(() => {
    const scoped = dbStaff.filter((s) => (
      matchesCompanyFilter(s.company_list_id, selectedCompanyId)
      && matchesBrandFilter(s.brand_list_id, selectedBrandId)
    ));
    return distinctTeamNames(scoped);
  }, [dbStaff, selectedCompanyId, selectedBrandId]);

  const handleCompanyChange = (id: string) => {
    const nextBrand = nextBrandAfterCompanyChange(selectedBrandId, brands, id);
    setSelectedCompanyId(id);
    setSelectedBrandId(nextBrand);
    const scoped = dbStaff.filter((s) => (
      matchesCompanyFilter(s.company_list_id, id)
      && matchesBrandFilter(s.brand_list_id, nextBrand)
    ));
    setSelectedTeam((prev) => nextTeamAfterScopeChange(prev, distinctTeamNames(scoped)));
  };

  const handleBrandChange = (id: string) => {
    setSelectedBrandId(id);
    const scoped = dbStaff.filter((s) => (
      matchesCompanyFilter(s.company_list_id, selectedCompanyId)
      && matchesBrandFilter(s.brand_list_id, id)
    ));
    setSelectedTeam((prev) => nextTeamAfterScopeChange(prev, distinctTeamNames(scoped)));
  };

  const filteredStaff = useMemo(() => (
    dbStaff.filter((s) => matchesStaffOrgFilter(s, {
      companyId: selectedCompanyId,
      brandId: selectedBrandId,
      teamName: selectedTeam,
    }))
  ), [dbStaff, selectedCompanyId, selectedBrandId, selectedTeam]);

  const filteredStaffIds = useMemo(() => new Set(filteredStaff.map(s => s.id)), [filteredStaff]);

  const todayReports = useMemo(() => {
    return dbReports.filter(r => filteredStaffIds.has(r.staff_id));
  }, [dbReports, filteredStaffIds]);

  // Group entries by report ID
  const entriesByReport = useMemo(() => {
    const map = new Map<string, typeof dbEntries>();
    dbEntries.forEach(e => {
      const arr = map.get(e.day_report_id) || [];
      arr.push(e);
      map.set(e.day_report_id, arr);
    });
    return map;
  }, [dbEntries]);

  // Build staff name lookup (staffs.id uuid -> display_name)
  const resolveStaffName = useCallback((staffId: string) => {
    return staffNameById[staffId] || staffId;
  }, [staffNameById]);

  const reportFillStatus = useCallback((report: typeof dbReports[number]) => {
    const entries = entriesByReport.get(report.id) || [];
    return getDayReportCompletionStatus(
      { total_hours: report.total_hours, target_hours: report.target_hours, is_leave: report.is_leave },
      sumEntryHours(entries),
    );
  }, [entriesByReport]);

  const completedReports = useMemo(
    () => todayReports.filter(r => reportFillStatus(r) === 'complete'),
    [todayReports, reportFillStatus],
  );
  const incompleteReports = useMemo(
    () => todayReports.filter(r => reportFillStatus(r) === 'incomplete'),
    [todayReports, reportFillStatus],
  );
  const completedCount = completedReports.length;
  const incompleteCount = incompleteReports.length;
  const totalStaff = filteredStaff.length;
  const totalHoursToday = todayReports.reduce((s, r) => {
    const entries = entriesByReport.get(r.id) || [];
    return s + sumEntryHours(entries);
  }, 0);
  const otCount = todayReports.filter(r => Number(r.ot_hours) > 0).length;
  const aiUsedCount = useMemo(() => {
    return todayReports.filter(r => {
      const entries = entriesByReport.get(r.id) || [];
      return entries.some(e => e.is_ai_assisted);
    }).length;
  }, [todayReports, entriesByReport]);

  const notSubmittedStaff = useMemo(() => {
    const submittedStaffIds = new Set(todayReports.map(r => r.staff_id));
    return filteredStaff.filter(s => !submittedStaffIds.has(s.id));
  }, [filteredStaff, todayReports]);

  return (
    <div className="space-y-4">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '已完成', value: `${completedCount}/${totalStaff}`, icon: <Users size={14} />, color: completedCount === totalStaff && totalStaff > 0 ? 'text-teal-600' : 'text-amber-600', bgColor: completedCount === totalStaff && totalStaff > 0 ? 'bg-teal-50' : 'bg-amber-50' },
          { label: '當日總工時', value: `${totalHoursToday}h`, icon: <BarChart3 size={14} />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
          { label: 'OT 人數', value: `${otCount}`, icon: <AlertTriangle size={14} />, color: otCount > 0 ? 'text-amber-600' : 'text-teal-600', bgColor: otCount > 0 ? 'bg-amber-50' : 'bg-teal-50' },
          { label: 'AI 使用', value: `${aiUsedCount}人`, icon: <Bot size={14} />, color: 'text-purple-600', bgColor: 'bg-purple-50' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('p-1 rounded', stat.bgColor, stat.color)}>{stat.icon}</span>
              <span className="text-[12px] font-medium text-muted-foreground">{stat.label}</span>
            </div>
            <span className={cn('text-[22px] font-bold', stat.color)}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm">
        <div className="px-5 py-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-[16px] font-bold flex items-center gap-2">
              <Eye size={16} className="text-teal-600" />
              今日團隊匯報
            </h4>
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftTargetDate(-1)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="上一天"
              >
                <ChevronLeft size={14} />
              </button>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium px-2 py-1 rounded-md border border-teal-200 bg-teal-50/40 text-teal-800 hover:bg-teal-50 transition-colors"
                    title="選擇日期"
                  >
                    <Calendar size={14} className="text-teal-600" />
                    {formatTeamDateLabel(targetDate)}
                    {targetDate === todayStr && (
                      <span className="text-[10px] font-semibold text-teal-600">今天</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="px-3 pt-3 pb-1">
                    <p className="text-[12px] font-medium text-[#0d1a2d]">選擇查看日期</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">預設今天 · 可改選其他日期</p>
                  </div>
                  <DayPickerCalendar
                    mode="single"
                    selected={parseWeekDateStr(targetDate)}
                    onSelect={(date) => {
                      if (!date) return;
                      applyTargetDate(toLocalDateStr(date));
                    }}
                    defaultMonth={parseWeekDateStr(targetDate)}
                  />
                  <div className="flex items-center justify-between gap-2 px-3 pb-3">
                    <button
                      type="button"
                      className="text-[12px] text-teal-700 hover:underline"
                      onClick={() => applyTargetDate(todayStr)}
                    >
                      回到今天
                    </button>
                    <button
                      type="button"
                      className="text-[12px] text-muted-foreground hover:text-[#0d1a2d]"
                      onClick={() => setDatePickerOpen(false)}
                    >
                      關閉
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => shiftTargetDate(1)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="下一天"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {completedCount} 人已完成
              {incompleteCount > 0 && <span className="text-amber-600"> · {incompleteCount} 人未完成</span>}
              {notSubmittedStaff.length > 0 && <span className="text-rose-500"> · {notSubmittedStaff.length} 人未提交</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
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
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">完成率</span>
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${totalStaff > 0 ? (completedCount / totalStaff) * 100 : 0}%` }} /></div>
              <span className="text-[12px] font-bold text-teal-600">{totalStaff > 0 ? Math.round((completedCount / totalStaff) * 100) : 0}%</span>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="px-5 py-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[13px]">正在載入團隊數據...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredStaff.length === 0 && (
          <div className="px-5 py-8 text-center">
            <Users size={32} className="mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-[14px] font-medium text-muted-foreground">此篩選條件下暫無人員</p>
            <p className="text-[12px] text-muted-foreground/70 mt-1">
              可改選公司、品牌或團隊
            </p>
          </div>
        )}

        {/* Report List */}
        {!isLoading && filteredStaff.length > 0 && (
          <div className="divide-y divide-border/30">
            {todayReports.map(report => {
              const entries = entriesByReport.get(report.id) || [];
              const staffName = resolveStaffName(report.staff_id);
              const hasAi = entries.some(e => e.is_ai_assisted);
              const fillStatus = reportFillStatus(report);
              const loggedHours = sumEntryHours(entries);
              return (
                <div key={report.id} className="px-5 py-3.5 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-[13px] font-bold text-teal-700">{staffName.slice(0, 1)}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold">{staffName}</span>
                        {fillStatus === 'incomplete' && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">未完成</span>}
                        {report.is_leave && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{report.leave_type || '請假'}</span>}
                        {hasAi && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 flex items-center gap-0.5"><Bot size={9} />AI</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-muted-foreground">{entries.length} 項工作</span>
                      <span className={cn('text-[15px] font-bold', fillStatus === 'incomplete' ? 'text-amber-600' : Number(report.ot_hours) > 0 ? 'text-amber-600' : 'text-foreground')}>
                        {loggedHours}h
                        {fillStatus === 'incomplete' && Number(report.target_hours) > 0 && (
                          <span className="text-[11px] font-normal text-amber-600"> / {report.target_hours}h</span>
                        )}
                        {Number(report.ot_hours) > 0 && <span className="text-[11px] font-normal"> OT</span>}
                      </span>
                    </div>
                  </div>
                  {/* Entry summary */}
                  <div className="ml-12 space-y-1">
                    {entries.slice(0, expandedId === report.id ? undefined : 3).map(entry => {
                      const config = categoryLookup[entry.category] || { bg: 'bg-gray-50', color: 'text-gray-600', icon: '📋', label: entry.category };
                      return (
                        <div key={entry.id} className="flex items-center gap-2">
                          <span className={cn('text-[11px] px-1.5 py-0.5 rounded shrink-0', config.bg, config.color)}>{config.icon} {config.label}</span>
                          {entry.related_name && <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-100 shrink-0">{entry.related_name}</span>}
                          <span className="text-[12px] text-muted-foreground truncate flex-1">{entry.title}</span>
                          <span className="text-[12px] font-medium shrink-0">{entry.hours}h</span>
                          {entry.is_ai_assisted && <Bot size={10} className="text-purple-500 shrink-0" />}
                          {entry.outcome_url && <Link size={10} className="text-teal-500 shrink-0" />}
                        </div>
                      );
                    })}
                    {expandedId !== report.id && entries.length > 3 && <span className="text-[12px] text-muted-foreground">+{entries.length - 3} 項其他工作</span>}
                  </div>
                  {/* Expanded detail view */}
                  {expandedId === report.id && entries.some(e => e.outcome_url || e.growth_experience) && (
                    <div className="ml-12 mt-2 pt-2 border-t border-border/30">
                      <span className="text-[11px] font-semibold text-teal-600 block mb-1">📌 成果輸出</span>
                      {entries.filter(e => e.outcome_url || e.growth_experience).map(entry => (
                        <div key={entry.id + '-outcome'} className="text-[12px] text-muted-foreground flex items-center gap-1 mb-0.5">
                          {entry.outcome_url && <><Link size={10} className="text-teal-500" /><span className="truncate">{entry.outcome_url}</span></>}
                          {entry.growth_experience && <><Sparkles size={10} className="text-emerald-500" /><span>{entry.growth_experience}</span></>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* No reports but have staff */}
            {todayReports.length === 0 && filteredStaff.length > 0 && (
              <div className="px-5 py-6 text-center text-muted-foreground">
                <FileText size={20} className="mx-auto mb-2 opacity-40" />
                <p className="text-[13px]">此日期尚無提交匯報</p>
              </div>
            )}

            {/* Not submitted staff — always visible */}
            {notSubmittedStaff.length > 0 && (
              <>
                <div className="px-5 py-2.5 bg-rose-50/50">
                  <span className="text-[12px] font-semibold text-rose-600">缺交名單 ({notSubmittedStaff.length})</span>
                </div>
                {notSubmittedStaff.map(staff => (
                  <div key={staff.id} className="px-5 py-3.5 opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[13px] font-bold text-gray-400">{staff.display_name.slice(0, 1)}</div>
                      <span className="text-[14px] font-medium text-muted-foreground">{staff.display_name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-500 border border-rose-200">未提交</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================
// Work Calendar
// ============================
interface WCStaff { id: string; display_name: string; department: string | null; }
interface WCReport { id: string; staff_id: string; report_date: string; total_hours: number; target_hours: number; ot_hours: number; is_leave: boolean; status: string; }
interface WCEntry { id: string; day_report_id: string; category: string; title: string | null; hours: number; outcome_url: string | null; growth_experience: string | null; is_ai_assisted: boolean | null; related_name: string | null; }

const WC_DEPARTMENT_OPTIONS = [
  { value: '__ALL__', label: '全部部門' },
  { value: 'System', label: 'System' },
  { value: 'FC', label: 'FC' },
  { value: 'Wine', label: 'Wine' },
  { value: 'Accounting & Admin', label: 'Accounting & Admin' },
  { value: 'Marketing & Video', label: 'Marketing & Video' },
];

function WorkCalendar() {
  const { systemUser } = useAuth();
  const categoryLookup = useCategoryLookup();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<WCStaff[]>([]);
  const [reports, setReports] = useState<WCReport[]>([]);
  const [entries, setEntries] = useState<WCEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [ownDepartment, setOwnDepartment] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});

  const isSuperAdmin = useMemo(() => {
    const role = (systemUser?.role || '').toLowerCase().replace(/[\s-]/g, '_');
    return role === 'super_admin' || role === 'management' || role === 'administrator' || role === 'admin';
  }, [systemUser]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthName = currentMonth.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Resolve current user's own department (locked for non-super-admins)
  useEffect(() => {
    let aborted = false;
    async function resolveDept() {
      if (!systemUser) return;
      const staffUuid = await resolveStaffUuid(systemUser);
      if (!staffUuid || aborted) return;
      let dept: string | null = systemUser.department || null;
      if (!dept) {
        dept = await fetchDepartmentByStaffId(staffUuid);
      }
      if (aborted) return;
      setOwnDepartment(dept);
      // Super-admins (incl. Management role) default to viewing ALL departments,
      // since "Management" itself is excluded from the staff filter.
      // Non-super-admins lock to their own department.
      setSelectedDepartment(prev => {
        if (prev !== null) return prev;
        return isSuperAdmin ? '__ALL__' : dept;
      });
    }
    resolveDept();
    return () => { aborted = true; };
  }, [systemUser?.staff_id, systemUser?.department, isSuperAdmin]);

  // Build available departments list for super_admin dropdown from DB (distinct)
  useEffect(() => {
    if (!isSuperAdmin) return;
    let aborted = false;
    (async () => {
      const departments = await fetchDistinctDepartments();
      if (!aborted) setAvailableDepartments(departments);
    })();
    return () => { aborted = true; };
  }, [isSuperAdmin]);

  // Fetch reports/entries for the active department & month
  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!systemUser) return;
      const staffUuid = await resolveStaffUuid(systemUser);
      if (!staffUuid || aborted) return;
      // For super-admins, default to __ALL__ when no selection yet so the calendar isn't blank.
      // For non-super-admins, wait until ownDepartment resolves.
      if (!isSuperAdmin && !ownDepartment) return;
      setLoading(true);
      console.log('[WorkCalendar] systemUser.role:', systemUser.role, 'isSuperAdmin:', isSuperAdmin, 'selectedDept:', selectedDepartment, 'ownDept:', ownDepartment);
      try {
        const activeDept = isSuperAdmin
          ? (selectedDepartment === '__ALL__' ? null : selectedDepartment)
          : ownDepartment; // non-super-admin locked to own department

        // 1) Resolve staff scope via users department, then fetch staffs profiles
        let allowedStaffIds: string[] | null = null;
        if (activeDept) {
          allowedStaffIds = await fetchStaffIdsByDepartment(activeDept);
          if (allowedStaffIds.length === 0) {
            setStaffList([]);
            setReports([]);
            setEntries([]);
            setStaffNameById({});
            return;
          }
        }

        let staffQuery = supabase
          .from('staffs')
          .select('id, display_name')
          .eq('status', 'active')
          .neq('position', 'Director');
        if (allowedStaffIds) staffQuery = staffQuery.in('id', allowedStaffIds);

        const { data: staffData } = await staffQuery;
        const scopeIds = (staffData || []).map((s: any) => s.id).filter(Boolean);
        const deptMap = await fetchDepartmentMap(scopeIds);

        const seen = new Set<string>();
        const dedupStaff = (staffData || []).filter((s: any) => {
          if (!s.id || seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        }).map((s: any) => ({
          id: s.id,
          display_name: s.display_name,
          department: deptMap[s.id] || null,
        })) as WCStaff[];
        if (aborted) return;
        setStaffList(dedupStaff);

        const allowed = activeDept ? dedupStaff.map(s => s.id) : [];
        if (activeDept && allowed.length === 0) {
          setReports([]);
          setEntries([]);
          setStaffNameById({});
          return;
        }

        // 2) Reports for the month
        // Use first day of NEXT month as exclusive upper bound to avoid edge cases when
        // report_date is stored as timestamp (lte '2026-05-31' would cast to 00:00:00 and
        // miss same-day rows). Then increase the row limit beyond Supabase's 1000 default.
        const monthStart = `${monthStr}-01`;
        const nextYear = month === 11 ? year + 1 : year;
        const nextMonth = month === 11 ? 1 : month + 2;
        const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
        let rQuery = supabase
          .from('day_reports')
          .select('id, staff_id, report_date, total_hours, target_hours, ot_hours, is_leave, status')
          .gte('report_date', monthStart)
          .lt('report_date', monthEndExclusive)
          .limit(5000);
        if (allowed.length > 0 && activeDept) rQuery = rQuery.in('staff_id', allowed);
        const { data: rData, error: rErr } = await rQuery;
        if (rErr) console.error('[WorkCalendar] day_reports error:', rErr);
        console.log('[WorkCalendar] dept:', activeDept, 'range:', monthStart, '→', monthEndExclusive, 'reports:', rData?.length || 0);
        const normalizedReports: WCReport[] = (rData || []).map((r: any) => ({
          ...r,
          report_date: r.report_date ? String(r.report_date).substring(0, 10) : r.report_date,
          total_hours: Number(r.total_hours) || 0,
          target_hours: Number(r.target_hours) || 0,
          ot_hours: Number(r.ot_hours) || 0,
          is_leave: !!r.is_leave,
        }));
        if (aborted) return;
        setReports(normalizedReports);

        // Resolve display names for everyone in loaded reports (not only dept-filtered staff)
        const reportStaffIds = normalizedReports.map(r => r.staff_id).filter(Boolean);
        const scopeStaffIds = dedupStaff.map(s => s.id).filter(Boolean);
        const nameMap = await fetchStaffNameMap([...new Set([...reportStaffIds, ...scopeStaffIds])]);
        if (aborted) return;
        setStaffNameById(nameMap);

        // 3) Entries
        if (normalizedReports.length > 0) {
          const ids = normalizedReports.map(r => r.id);
          const { data: eData, error: eErr } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, category, title, hours, outcome_url, growth_experience, is_ai_assisted, related_name')
            .in('day_report_id', ids)
            .limit(20000);
          if (eErr) console.error('[WorkCalendar] day_report_entries error:', eErr);
          console.log('[WorkCalendar] entries:', eData?.length || 0);
          if (aborted) return;
          setEntries((eData || []) as WCEntry[]);
        } else {
          setEntries([]);
        }
      } catch (err) {
        console.error('[WorkCalendar] load error:', err);
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    load();
    return () => { aborted = true; };
  }, [systemUser?.staff_id, ownDepartment, selectedDepartment, isSuperAdmin, monthStr, year, month, daysInMonth]);

  const reportsByDate = useMemo(() => {
    const m: Record<string, WCReport[]> = {};
    reports.forEach(r => { (m[r.report_date] = m[r.report_date] || []).push(r); });
    return m;
  }, [reports]);

  const entriesByReport = useMemo(() => {
    const m: Record<string, WCEntry[]> = {};
    entries.forEach(e => { (m[e.day_report_id] = m[e.day_report_id] || []).push(e); });
    return m;
  }, [entries]);

  const selectedDayReports = selectedDate ? (reportsByDate[selectedDate] || []) : [];
  const monthTotalHours = reports.reduce((s, r) => s + sumEntryHours(entriesByReport[r.id] || []), 0);
  const monthWorkDays = new Set(reports.map(r => r.report_date)).size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentMonth(new Date(year, month - 1))} className="p-1.5 rounded-md hover:bg-muted"><ChevronLeft size={16} /></button>
          <h3 className="text-[17px] font-bold">{monthName}</h3>
          <button onClick={() => setCurrentMonth(new Date(year, month + 1))} className="p-1.5 rounded-md hover:bg-muted"><ChevronRight size={16} /></button>
          {isSuperAdmin && (
            <div className="flex items-center gap-1.5 ml-1">
              <Shield size={13} className="text-teal-600" />
              <select
                value={selectedDepartment ?? ''}
                onChange={e => setSelectedDepartment(e.target.value)}
                className="text-[12px] px-2 py-1 rounded-md border border-border bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="__ALL__">全部部門</option>
                {(availableDepartments.length > 0
                  ? availableDepartments
                  : WC_DEPARTMENT_OPTIONS.filter(o => o.value !== '__ALL__').map(o => o.value)
                ).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px]">
          {!isSuperAdmin && ownDepartment && (
            <span className="px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 font-medium">部門: {ownDepartment}</span>
          )}
          <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-medium">{monthWorkDays} 工作天</span>
          <span className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 font-medium">{monthTotalHours}h 總時</span>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (<div key={d} className="p-2.5 text-center text-[12px] font-semibold text-muted-foreground bg-muted/30">{d}</div>))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} className="p-1.5 border-b border-r border-border/30 min-h-[76px]" />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayReports = reportsByDate[dateStr] || [];
                const totalHours = dayReports.reduce((s, r) => {
                  const logged = sumEntryHours(entriesByReport[r.id] || []);
                  return s + logged;
                }, 0);
                const hasIncomplete = dayReports.some(r => (
                  getDayReportCompletionStatus(r, sumEntryHours(entriesByReport[r.id] || [])) === 'incomplete'
                ));
                const hasOT = dayReports.some(r => r.ot_hours > 0);
                const hasLeave = dayReports.some(r => r.is_leave);
                const dayReportIds = new Set(dayReports.map(r => r.id));
                const hasAI = entries.some(e => dayReportIds.has(e.day_report_id) && !!e.is_ai_assisted);
                const isSelected = selectedDate === dateStr;
                const isWeekend = (firstDayOfWeek + i) % 7 === 0 || (firstDayOfWeek + i) % 7 === 6;
                return (
                  <div key={day} onClick={() => setSelectedDate(dateStr)} className={cn('p-1.5 border-b border-r border-border/30 min-h-[76px] cursor-pointer transition-all', isSelected && 'ring-2 ring-teal-500 bg-teal-50/40 z-10', !isSelected && 'hover:bg-muted/30', hasIncomplete && !isSelected && 'bg-amber-50/30', hasLeave && !isSelected && !hasIncomplete && 'bg-amber-50/30', isWeekend && !isSelected && !hasLeave && !hasIncomplete && 'bg-gray-50/50')}>
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[12px] font-medium', isWeekend && 'text-muted-foreground')}>{day}</span>
                      {totalHours > 0 && <span className={cn('text-[11px] font-bold', hasIncomplete ? 'text-amber-600' : totalHours >= 8 ? 'text-teal-600' : 'text-rose-500')}>{totalHours}h</span>}
                      {hasIncomplete && totalHours === 0 && <span className="text-[10px] font-bold text-amber-600">未齊</span>}
                    </div>
                    {dayReports.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayReports.slice(0, 2).map(r => {
                          const mainCat = (entriesByReport[r.id] || [])[0]?.category as string | undefined;
                          const config = mainCat ? categoryLookup[mainCat] : null;
                          const name = staffNameById[r.staff_id] || r.staff_id;
                          return (<div key={r.id} className="flex items-center gap-0.5">{config && <span className={cn('text-[10px] px-1 py-0 rounded', config.bg, config.color)}>{name.slice(0, 2)}</span>}{!config && r.is_leave && <span className="text-[10px] px-1 py-0 rounded bg-amber-100 text-amber-700">假</span>}</div>);
                        })}
                        {dayReports.length > 2 && <span className="text-[10px] text-muted-foreground">+{dayReports.length - 2}</span>}
                        <div className="flex items-center gap-0.5">{hasOT && <span className="text-[10px] font-bold text-amber-600">OT</span>}{hasAI && <Bot size={9} className="text-purple-500" />}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {Object.entries(categoryConfig).map(([k, v]) => (<span key={k} className={cn('text-[11px] px-1.5 py-0.5 rounded', v.bg, v.color)}>{v.icon} {v.label}</span>))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-5 h-fit sticky top-4">
          <h4 className="text-[15px] font-bold mb-3 flex items-center gap-2"><Calendar size={15} className="text-teal-600" />{selectedDate ? selectedDate : '選擇日期查看'}</h4>
          {loading && <p className="text-[13px] text-muted-foreground flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />載入中…</p>}
          {!loading && !selectedDate && <p className="text-[13px] text-muted-foreground">點擊日曆中的日期查看當日工作匯報詳情</p>}
          {!loading && selectedDate && selectedDayReports.length === 0 && <p className="text-[13px] text-muted-foreground">此日無匯報記錄</p>}
          {!loading && selectedDayReports.map((report, idx) => {
            const reportEntries = entriesByReport[report.id] || [];
            const userName = staffNameById[report.staff_id] || report.staff_id;
            const initials = userName
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map(s => s[0]?.toUpperCase())
              .join('') || userName.slice(0, 2).toUpperCase();
            const usedAI = reportEntries.some(e => e.is_ai_assisted);
            const loggedHours = sumEntryHours(reportEntries);
            const fillStatus = getDayReportCompletionStatus(report, loggedHours);
            return (
              <div
                key={report.id}
                className={cn(
                  'pb-8 mb-8 last:pb-0 last:mb-0',
                  idx < selectedDayReports.length - 1 && 'border-b-2 border-slate-300'
                )}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-[12px] font-semibold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-bold text-[#0d1a2d] leading-tight">{userName}</span>
                      {fillStatus === 'incomplete' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">未完成</span>}
                      {usedAI && <Bot size={13} className="text-purple-500" />}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      共 {reportEntries.length} 項 · <span className={cn('font-semibold', fillStatus === 'incomplete' ? 'text-amber-600' : 'text-teal-600')}>{loggedHours}h</span>
                      {fillStatus === 'incomplete' && report.target_hours > 0 && <span className="text-amber-600"> / {report.target_hours}h</span>}
                      {report.ot_hours > 0 && <span className="text-rose-500 ml-1.5">+{report.ot_hours}h OT</span>}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pl-1">
                  {reportEntries.map(entry => {
                    const config = categoryLookup[entry.category];
                    return (
                      <div key={entry.id} className="p-2.5 rounded-md bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {config && <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-medium', config.bg, config.color)}>{config.label}</span>}
                          {entry.related_name && <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-100">{entry.related_name}</span>}
                          <span className="text-[12px] font-semibold text-muted-foreground">{entry.hours}h</span>
                          {entry.is_ai_assisted && <Bot size={11} className="text-purple-500" />}
                        </div>
                        {entry.title && <p className="text-[13px] font-medium text-[#0d1a2d] leading-snug whitespace-pre-wrap">{entry.title}</p>}
                        {entry.outcome_url && (
                          <a
                            href={entry.outcome_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={entry.outcome_url}
                            className="text-[12px] text-teal-600 hover:text-teal-700 hover:underline mt-1.5 flex items-center gap-1 max-w-full"
                          >
                            <Link size={11} className="shrink-0" />
                            <span className="truncate">
                              {(() => {
                                try {
                                  const u = new URL(entry.outcome_url);
                                  return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
                                } catch {
                                  return entry.outcome_url;
                                }
                              })()}
                            </span>
                          </a>
                        )}
                        {entry.growth_experience && (
                          <p className="text-[12px] text-emerald-700 mt-1.5 flex items-start gap-1 whitespace-pre-wrap leading-snug">
                            <Sparkles size={11} className="mt-0.5 shrink-0" />
                            <span>{entry.growth_experience}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================
// Team Overview
// ============================
function TeamOverview() {
  const [viewMode, setViewMode] = useState<'heatmap' | 'table'>('heatmap');
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const departments = [...new Set(staffMembersV2.map(s => s.department))];

  const staffStats = staffMembersV2.map(staff => {
    const monthlyData = months.map(m => {
      const ms = `2025-${String(m).padStart(2, '0')}`;
      const reports = dailyReportsV2.filter(r => r.userId === staff.id && r.reportDate.startsWith(ms));
      const totalHours = reports.reduce((s, r) => s + r.totalHours, 0);
      const reportDays = reports.length;
      const otDays = reports.filter(r => r.otHours > 0).length;
      const aiUsedDays = reports.filter(r => r.aiUsed).length;
      return { month: m, totalHours, reportDays, otDays, aiUsedDays };
    });
    const yearTotal = monthlyData.reduce((s, m) => s + m.totalHours, 0);
    const yearReportDays = monthlyData.reduce((s, m) => s + m.reportDays, 0);
    const yearAiDays = monthlyData.reduce((s, m) => s + m.aiUsedDays, 0);
    const aiRate = yearReportDays > 0 ? (yearAiDays / yearReportDays) * 100 : 0;
    return { ...staff, monthlyData, yearTotal, aiRate };
  });

  const totalYearHours = staffStats.reduce((s, st) => s + st.yearTotal, 0);
  const avgAiRate = staffStats.length > 0 ? staffStats.reduce((s, st) => s + st.aiRate, 0) / staffStats.length : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-4"><span className="text-[12px] text-muted-foreground">團隊人數</span><span className="text-[22px] font-bold block mt-1">{staffMembersV2.length}</span></div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-4"><span className="text-[12px] text-muted-foreground">年度總工時</span><span className="text-[22px] font-bold block mt-1 text-teal-600">{totalYearHours}h</span></div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-4"><span className="text-[12px] text-muted-foreground">部門數</span><span className="text-[22px] font-bold block mt-1">{departments.length}</span></div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-4"><span className="text-[12px] text-muted-foreground">平均AI使用率</span><span className="text-[22px] font-bold block mt-1 text-purple-600">{avgAiRate.toFixed(0)}%</span></div>
      </div>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md">
          <button onClick={() => setViewMode('heatmap')} className={cn('px-3 py-1.5 rounded text-[12px] font-medium transition-colors', viewMode === 'heatmap' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>熱力圖</button>
          <button onClick={() => setViewMode('table')} className={cn('px-3 py-1.5 rounded text-[12px] font-medium transition-colors', viewMode === 'table' ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>表格</button>
        </div>
      </div>

      {viewMode === 'heatmap' && (
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-5 overflow-x-auto">
          <h4 className="text-[15px] font-bold mb-4">年度工時熱力圖</h4>
          <div className="space-y-2 min-w-[750px]">
            <div className="flex items-center gap-2">
              <div className="w-[120px] shrink-0" />
              {months.map(m => (<div key={m} className="flex-1 text-center text-[11px] font-medium text-muted-foreground">{m}月</div>))}
              <div className="w-[55px] shrink-0 text-center text-[11px] font-medium text-muted-foreground">年度</div>
              <div className="w-[45px] shrink-0 text-center text-[11px] font-medium text-purple-600">AI%</div>
            </div>
            {staffStats.map(staff => (
              <div key={staff.id} className="flex items-center gap-2">
                <div className="w-[120px] shrink-0 flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-700">{staff.name.slice(0, 1)}</div>
                  <span className="text-[12px] font-medium truncate">{staff.name}</span>
                </div>
                {staff.monthlyData.map(md => {
                  const intensity = md.totalHours === 0 ? 0 : md.totalHours < 80 ? 1 : md.totalHours < 160 ? 2 : md.totalHours < 200 ? 3 : 4;
                  const colors = ['bg-gray-50 border border-border/30', 'bg-rose-100', 'bg-amber-100', 'bg-teal-100', 'bg-teal-300'];
                  return (<div key={md.month} className="flex-1 flex justify-center" title={`${md.totalHours}h`}><div className={cn('w-full h-7 rounded-sm flex items-center justify-center text-[10px] font-bold', colors[intensity], intensity >= 3 ? 'text-teal-800' : intensity >= 1 ? 'text-gray-700' : 'text-gray-300')}>{md.totalHours > 0 ? md.totalHours : '—'}</div></div>);
                })}
                <div className="w-[55px] shrink-0 text-center"><span className="text-[12px] font-bold">{staff.yearTotal}h</span></div>
                <div className="w-[45px] shrink-0 text-center"><span className={cn('text-[11px] font-bold', staff.aiRate >= 50 ? 'text-purple-600' : 'text-gray-400')}>{staff.aiRate.toFixed(0)}%</span></div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/30">
            <span className="text-[11px] text-muted-foreground">圖例：</span>
            <span className="flex items-center gap-1 text-[11px]"><span className="w-4 h-3 rounded-sm bg-gray-50 border" />無</span>
            <span className="flex items-center gap-1 text-[11px]"><span className="w-4 h-3 rounded-sm bg-rose-100" />&lt;80h</span>
            <span className="flex items-center gap-1 text-[11px]"><span className="w-4 h-3 rounded-sm bg-amber-100" />80-159h</span>
            <span className="flex items-center gap-1 text-[11px]"><span className="w-4 h-3 rounded-sm bg-teal-100" />160-199h</span>
            <span className="flex items-center gap-1 text-[11px]"><span className="w-4 h-3 rounded-sm bg-teal-300" />≥200h</span>
          </div>
        </div>
      )}

      {viewMode === 'table' && (
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-semibold text-muted-foreground px-3 py-2.5">同事</th>
                <th className="text-left text-[12px] font-semibold text-muted-foreground px-3 py-2.5">部門</th>
                {months.map(m => (<th key={m} className="text-center text-[12px] font-semibold text-muted-foreground px-2 py-2.5">{m}月</th>))}
                <th className="text-center text-[12px] font-semibold text-muted-foreground px-3 py-2.5">年度</th>
                <th className="text-center text-[12px] font-semibold text-purple-600 px-3 py-2.5">AI%</th>
              </tr>
            </thead>
            <tbody>
              {staffStats.map(staff => (
                <tr key={staff.id} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-[13px] font-medium">{staff.name}</td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{staff.department}</td>
                  {staff.monthlyData.map(md => (
                    <td key={md.month} className="px-2 py-2.5 text-center">
                      {md.totalHours > 0 ? <span className={cn('text-[12px] font-bold', md.totalHours < 160 ? 'text-rose-500' : 'text-teal-600')}>{md.totalHours}h</span> : <span className="text-[12px] text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center"><span className="text-[13px] font-bold">{staff.yearTotal}h</span></td>
                  <td className="px-3 py-2.5 text-center"><span className={cn('text-[12px] font-bold', staff.aiRate >= 50 ? 'text-purple-600' : 'text-gray-400')}>{staff.aiRate.toFixed(0)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================
// Monthly Report
// ============================
function MonthlyReport() {
  const [selectedMonth, setSelectedMonth] = useState(1);
  const topProjects = getTopProjectsByHoursV2(2025, selectedMonth);
  const monthStr = `2025-${String(selectedMonth).padStart(2, '0')}`;
  const monthReports = dailyReportsV2.filter(r => r.reportDate.startsWith(monthStr) && !r.isLeave);
  const totalHours = monthReports.reduce((s, r) => s + r.totalHours, 0);
  const allEntries = monthReports.flatMap(r => r.entries);
  const aiUsedReports = monthReports.filter(r => r.aiUsed);
  const aiRate = monthReports.length > 0 ? (aiUsedReports.length / monthReports.length) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white">
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
        </select>
        <div className="flex items-center gap-3 text-[12px]">
          <span className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 font-medium">{totalHours}h 總時</span>
          <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 font-medium flex items-center gap-1"><Bot size={11} />AI {aiRate.toFixed(0)}%</span>
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-50 to-white rounded-lg border border-purple-100 p-4">
        <div className="flex items-center gap-3 mb-3"><Bot size={18} className="text-purple-600" /><h4 className="text-[15px] font-bold text-purple-800">AI 使用統計</h4></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><span className="text-[11px] text-purple-600">使用率</span><span className="text-[20px] font-bold text-purple-700 block">{aiRate.toFixed(0)}%</span></div>
          <div><span className="text-[11px] text-purple-600">AI輔助天數</span><span className="text-[20px] font-bold text-purple-700 block">{aiUsedReports.length} 天</span></div>
          <div><span className="text-[11px] text-purple-600">最常用工具</span><span className="text-[20px] font-bold text-purple-700 block">ChatGPT</span></div>
          <div><span className="text-[11px] text-purple-600">AI輔助工時</span><span className="text-[20px] font-bold text-purple-700 block">{allEntries.filter(e => e.isAiAssisted).reduce((s, e) => s + e.hours, 0)}h</span></div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-5">
        <h4 className="text-[16px] font-bold mb-1">本月工時排名 Top 10</h4>
        <div className="space-y-3 mt-4">
          {topProjects.map((proj, idx) => (
            <div key={proj.name + idx} className="p-4 rounded-lg border border-border/50 bg-muted/5 hover:border-teal-200 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-[13px] font-bold text-teal-700">#{idx + 1}</span>
                  <div>
                    <span className="text-[14px] font-bold">{proj.name}</span>
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground mt-0.5">
                      <span>{proj.entryCount} 筆工作</span>
                      {proj.aiHours > 0 && <span className="flex items-center gap-0.5 text-purple-600"><Bot size={10} />{proj.aiHours}h AI</span>}
                    </div>
                  </div>
                </div>
                <span className="text-[18px] font-bold text-teal-600">{proj.hours}h</span>
              </div>
            </div>
          ))}
          {topProjects.length === 0 && <p className="text-[13px] text-muted-foreground text-center py-8">本月暫無工時記錄</p>}
        </div>
      </div>
    </div>
  );
}

// ============================
// Main Module Export
// ============================
export function DayReportModule({ subModule }: { subModule?: string }) {
  const getTitle = () => {
    switch (subModule) {
      case 'submit': return { title: '提交匯報', subtitle: '支援香港/深圳雙辦公室 · 本週與上週匯報總覽 · 常用項目快速填入 · 週六加班匯報 · 多日假期申報 · AI 追蹤 · 8h驗證。' };
      case 'today-team': return { title: '今日團隊', subtitle: '查看指定日期完成狀況 — 工時未齊為未完成，尚未開表為未提交。可依公司、品牌與團隊篩選。' };
      case 'calendar': return { title: '工作日曆', subtitle: '以日曆視圖查看歷史工作記錄，13種工作類型顏色標記。' };
      case 'team-view': return { title: '匯報統計', subtitle: '工作檢查查看填寫情況 · 工時分析統計類別工時與占比。' };
      case 'monthly': return { title: '月度報告', subtitle: '本月工時排名、AI 使用統計及類別分佈分析。' };
      case 'analytics': return { title: '項目分析', subtitle: '按系統／網站項目統計人員投入工時與占比 — 支援按天／週／月篩選。' };
      case 'work-report': return { title: '工作報表', subtitle: '按個人統計參與的系統／網站項目工時與占比 — 依部門分組顯示。' };
      case 'work-categories': return { title: '工作類型管理', subtitle: '管理匯報工作類別的關聯規則 — 網站/系統、客戶項目、影片頻道、可選關聯或無需關聯。' };
      default: return { title: '提交匯報', subtitle: '支援香港/深圳雙辦公室 · 本週與上週匯報總覽 · 常用項目快速填入 · 週六加班匯報 · 多日假期申報 · AI 追蹤 · 8h驗證。' };
    }
  };

  const { title, subtitle } = getTitle();

  const renderContent = () => {
    switch (subModule) {
      case 'submit': return <SubmitReportPage />;
      case 'today-team': return <TodayTeamReports />;
      case 'calendar': return <WorkCalendar />;
      case 'monthly': return <MonthlyReport />;
      case 'team-view': return <TeamDashboard />;
      case 'analytics': return <ProjectAnalysis mode="team" />;
      case 'work-report': return <ProjectAnalysis mode="personal" />;
      case 'work-categories': return <WorkCategoriesManager />;
      default: return <SubmitReportPage />;
    }
  };

  // team-view / analytics / work-report 自行渲染 sticky 標題列，避免重複
  if (subModule === 'team-view' || subModule === 'analytics' || subModule === 'work-report') {
    return renderContent();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">{title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
