import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Clock, AlertTriangle, BarChart3, Calendar,
  Eye, ChevronDown, ChevronUp, Shield, Loader2,
  UserCheck, RefreshCw, Bot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { categoryConfig } from '@/data/dayReportDataV2';
import { useDayReportTypes } from '@/hooks/useDayReportTypes';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';
import {
  fetchDepartmentByStaffId,
  fetchDepartmentMap,
  fetchStaffIdsByDepartment,
  isValidDepartment,
} from '@/components/day-report/departmentLookup';

// ============================
// Types
// ============================
interface StaffMember {
  id: string;
  bubble_staff_id: string;
  display_name: string;
  position: string | null;
  user_role: string | null;
  status: string;
  base_location: string | null;
  team_id: string | null;
  business_unit: string | null;
  profile_pic_url: string | null;
  department: string | null;
}

interface DayReport {
  id: string;
  staff_id: string;
  report_date: string;
  total_hours: number;
  target_hours: number;
  ot_hours: number;
  is_leave: boolean;
  is_half_day: boolean;
  leave_type: string | null;
  office_location: string;
  is_holiday: boolean;
  is_weekend: boolean;
  under_hours_reason: string | null;
  status: string;
  reviewer_id: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

interface DayReportEntry {
  id: string;
  day_report_id: string;
  staff_id: string;
  category: string;
  related_id: string | null;
  related_name: string | null;
  title: string;
  hours: number;
  outcome_type: string | null;
  outcome_url: string | null;
  growth_experience: string | null;
  is_ai_assisted: boolean;
}



// ============================
// Helpers
// ============================
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function getLast14Days(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}


// ============================
// Team Dashboard Component
// ============================
export function TeamDashboard() {
  const { systemUser } = useAuth();
  const { types: dynamicTypes } = useDayReportTypes();
  // Build a lookup that includes both built-in categories and any
  // custom 工作類型 the user has added in 工作類型管理. Custom rows fall
  // back to a neutral icon/colour so they no longer render as the raw id.
  const categoryLookup = useMemo(() => {
    const map: Record<string, { label: string; icon: string; color: string; bg: string }> = {};
    for (const [k, v] of Object.entries(categoryConfig)) {
      map[k] = { label: v.label, icon: v.icon, color: v.color, bg: v.bg };
    }
    for (const t of dynamicTypes) {
      map[t.id] = {
        label: t.label,
        icon: t.icon || '📋',
        color: t.color || 'text-gray-600',
        bg: t.bg || 'bg-gray-100',
      };
    }
    return map;
  }, [dynamicTypes]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [reports, setReports] = useState<DayReport[]>([]);
  const [entries, setEntries] = useState<DayReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  const toggleExpandedReport = (id: string) => {
    setExpandedReports(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [viewTab, setViewTab] = useState<'missing' | 'all'>('all');

  const [currentDepartment, setCurrentDepartment] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null); // null = not yet initialized

  const last14Days = useMemo(() => getLast14Days(), []);
  const workingDays = useMemo(() => last14Days.filter(d => !isWeekend(d)), [last14Days]);

  // Available department options for the admin dropdown
  const DEPARTMENT_OPTIONS = [
    { value: 'System', label: 'System' },
    { value: '__ALL__', label: '全部門 (All)' },
    { value: 'FC', label: 'FC' },
    { value: 'Wine', label: 'Wine' },
    { value: 'Accounting & Admin', label: 'Accounting & Admin' },
    { value: 'Marketing & Video', label: 'Marketing & Video' },
  ];

  // ============================
  // Initialize: Detect user's own department on mount
  // IMPORTANT: Even super_admin defaults to their own department (no bypass)
  // ============================
  useEffect(() => {
    const detectOwnDepartment = async () => {
      if (!systemUser) return;
      let dept: string | null = null;

      // First try from systemUser context (from system_users table)
      if (systemUser.department) {
        dept = systemUser.department;
        console.log('[TeamDashboard] 🏢 Got department from systemUser context:', dept);
      }

      // Fallback: query user_info by staff_id for department
      if (!dept) {
        try {
          dept = await fetchDepartmentByStaffId(systemUser.bubble_staff_id);
          console.log('[TeamDashboard] 🏢 Got department from user_info:', dept);
        } catch (err) {
          console.warn('[TeamDashboard] ⚠️ user_info query failed:', err);
        }
      }

      // Validate the detected department exists in our options list
      const validDepts = DEPARTMENT_OPTIONS.map(o => o.value).filter(v => v !== '__ALL__');
      if (dept && !validDepts.includes(dept)) {
        console.warn(`[TeamDashboard] ⚠️ Detected department "${dept}" is not in DEPARTMENT_OPTIONS. Defaulting to 'System'.`);
        dept = 'System'; // Hard fallback for safety
      }

      // Default selection = user's own department (even for super_admin — NO BYPASS)
      const finalDept = dept || 'System';
      setSelectedDepartment(finalDept);
      setCurrentDepartment(finalDept);
      console.log('[TeamDashboard] ✅ Final department selection:', finalDept);
    };
    detectOwnDepartment();
  }, [systemUser]);

  // ============================
  // Data Fetching (reactive to selectedDepartment)
  // ============================
  const fetchData = useCallback(async () => {
    if (selectedDepartment === null) return; // Not yet initialized

    try {
      const activeDept = selectedDepartment === '__ALL__' ? null : selectedDepartment;
      setCurrentDepartment(activeDept);

      // Step 1: Determine which staff IDs are visible based on active department
      let allowedStaffIds: string[] | null = null; // null = no filter (show all)

      if (activeDept) {
        allowedStaffIds = await fetchStaffIdsByDepartment(activeDept);
        console.log(`[TeamDashboard] 🏢 Department filter: "${activeDept}" — ${allowedStaffIds.length} staff IDs`, allowedStaffIds);

        // If no staff found for this department, set empty and return early
        if (allowedStaffIds.length === 0) {
          console.warn(`[TeamDashboard] ⚠️ No staff found for department "${activeDept}". Showing empty state.`);
          setStaff([]);
          setStaffNameById({});
          setActiveStaffCount(0);
          setReports([]);
          setEntries([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } else {
        console.log('[TeamDashboard] 🌐 Showing ALL departments (no filter)');
      }

      // Step 2: Fetch active staff in scope (department filter via user_info → allowedStaffIds)
      let staffQuery = supabase
        .from('staff_directory')
        .select('id, bubble_staff_id, display_name, position, user_role, status, base_location, team_id, business_unit, profile_pic_url')
        .eq('status', 'active')
        .neq('position', 'Director');

      if (allowedStaffIds !== null) {
        staffQuery = staffQuery.in('bubble_staff_id', allowedStaffIds);
      }

      const { data: rawStaffData } = await staffQuery;

      const deptMap = await fetchDepartmentMap(
        (rawStaffData || []).map(s => s.bubble_staff_id).filter(Boolean),
      );

      // Post-fetch exclusion: Remove legacy Director rows and Management department (from user_info)
      const EXCLUDED_POSITIONS = ['director', 'director / management'];
      const EXCLUDED_DEPARTMENTS = ['management'];
      const cleanedStaffData = (rawStaffData || []).map(s => ({
        ...s,
        department: deptMap[s.bubble_staff_id] || null,
      })).filter(s => {
        const pos = (s.position || '').toLowerCase().trim();
        const dept = (s.department || '').toLowerCase().trim();
        if (EXCLUDED_POSITIONS.includes(pos) || EXCLUDED_DEPARTMENTS.includes(dept)) {
          console.log(`[TeamDashboard] 🚫 Excluding legacy row: "${s.display_name}" (position: "${s.position}", dept: "${s.department}")`);
          return false;
        }
        return true;
      });

      // Deduplicate by bubble_staff_id — keep only the first occurrence per unique employee
      // This prevents duplicate rows (e.g., same person with different positions) from appearing
      const seenStaffIds = new Set<string>();
      const staffData = cleanedStaffData.filter(s => {
        if (!s.bubble_staff_id || seenStaffIds.has(s.bubble_staff_id)) {
          return false;
        }
        seenStaffIds.add(s.bubble_staff_id);
        return true;
      });

      console.log(`[TeamDashboard] ✅ Staff fetched: ${rawStaffData?.length || 0} raw → ${cleanedStaffData.length} after exclusion → ${staffData.length} after dedup`);

      // Step 3: Fetch reports for last 14 days (filtered by allowed staff)
      const startDate = last14Days[last14Days.length - 1];
      const endDate = last14Days[0];
      let reportQuery = supabase
        .from('day_reports')
        .select('*')
        .gte('report_date', startDate)
        .lte('report_date', endDate);

      if (allowedStaffIds !== null) {
        reportQuery = reportQuery.in('staff_id', allowedStaffIds);
      }

      const { data: reportData } = await reportQuery;

      // Fetch entries for those reports
      if (reportData && reportData.length > 0) {
        const reportIds = reportData.map(r => r.id);
        const { data: entryData } = await supabase
          .from('day_report_entries')
          .select('*')
          .in('day_report_id', reportIds);
        setEntries(entryData || []);
      } else {
        setEntries([]);
      }

      // Build display-name map for everyone in scope (A: staff_directory + user_info fallback)
      const scopeStaffIds = allowedStaffIds !== null
        ? allowedStaffIds
        : [...new Set((staffData || []).map(s => s.bubble_staff_id).filter(Boolean))];
      const reportStaffIds = [...new Set((reportData || []).map(r => r.staff_id).filter(Boolean))];
      const nameLookupIds = [...new Set([...scopeStaffIds, ...reportStaffIds])];
      const nameMap = await fetchStaffNameMap(nameLookupIds);

      setStaff(staffData || []);
      setStaffNameById(nameMap);
      // KPI: active staff in department scope (department from user_info)
      setActiveStaffCount(
        allowedStaffIds !== null
          ? staffData.length
          : staffData.filter(s => isValidDepartment(s.department)).length,
      );
      setReports(reportData || []);
    } catch (err) {
      console.error('Failed to fetch team dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [last14Days, selectedDepartment]);

  useEffect(() => {
    if (selectedDepartment !== null) {
      fetchData();
    }
  }, [fetchData, selectedDepartment]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ============================
  // Computed Data
  // ============================
  const missingReports = useMemo(() => {
    const missing: { staff: StaffMember; missingDates: string[] }[] = [];
    staff.forEach(s => {
      const staffReports = reports.filter(r => r.staff_id === s.bubble_staff_id);
      const reportedDates = staffReports.map(r => r.report_date);
      const missingDates = workingDays.filter(d => !reportedDates.includes(d));
      if (missingDates.length > 0) {
        missing.push({ staff: s, missingDates });
      }
    });
    return missing.sort((a, b) => b.missingDates.length - a.missingDates.length);
  }, [staff, reports, workingDays]);

  const teamHoursData = useMemo(() => {
    const grouped: Record<string, { totalHours: number; otHours: number; reportCount: number; aiCount: number }> = {};
    const businessUnits = [...new Set(staff.map(s => s.business_unit || '未分組'))];

    businessUnits.forEach(bu => {
      const teamStaff = staff.filter(s => (s.business_unit || '未分組') === bu);
      let totalHours = 0;
      let otHours = 0;
      let reportCount = 0;
      let aiCount = 0;

      teamStaff.forEach(s => {
        const staffReports = reports.filter(r => r.staff_id === s.bubble_staff_id && !r.is_leave);
        staffReports.forEach(r => {
          totalHours += Number(r.total_hours) || 0;
          otHours += Number(r.ot_hours) || 0;
          reportCount++;
        });
        // Check AI usage in entries
        const staffEntries = entries.filter(e => e.staff_id === s.bubble_staff_id && e.is_ai_assisted);
        aiCount += staffEntries.length;
      });

      grouped[bu] = { totalHours, otHours, reportCount, aiCount };
    });
    return grouped;
  }, [staff, reports, entries]);

  const allReportsSorted = useMemo(() => {
    return [...reports].sort((a, b) => {
      if (a.report_date !== b.report_date) return b.report_date.localeCompare(a.report_date);
      return (b.submitted_at || '').localeCompare(a.submitted_at || '');
    });
  }, [reports]);

  // Overall stats
  const totalReportsCount = reports.length;
  const totalHoursAll = reports.reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0);
  const avgHoursPerReport = totalReportsCount > 0 ? (totalHoursAll / totalReportsCount).toFixed(1) : '0';
  const missingStaffCount = missingReports.length;

  // ============================
  // Get staff info by bubble_staff_id
  // ============================
  const getStaffName = (staffId: string): string => {
    const fromMap = staffNameById[staffId];
    if (fromMap) return fromMap;
    const s = staff.find(st => st.bubble_staff_id === staffId);
    return s?.display_name || staffId;
  };

  const getStaffAvatar = (staffId: string): string => {
    const name = getStaffName(staffId);
    return name !== staffId ? name.slice(0, 1) : '?';
  };

  // ============================
  // Render
  // ============================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-teal-600" size={24} />
        <span className="ml-3 text-[14px] text-muted-foreground">載入團隊數據中...</span>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    submitted: 'bg-teal-100 text-teal-700',
    approved: 'bg-teal-100 text-teal-700',
    rejected: 'bg-teal-100 text-teal-700',
    draft: 'bg-teal-100 text-teal-700',
  };
  const statusLabels: Record<string, string> = {
    submitted: '已通過',
    approved: '已通過',
    rejected: '已通過',
    draft: '已通過',
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[18px] font-bold flex items-center gap-2">
            <Shield size={18} className="text-teal-600" />
            團隊總覽 · 管理儀表板
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[12px] text-muted-foreground">過去 14 天匯報狀況 · 審核管理 · 工時分析</p>
            {currentDepartment ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                <Users size={10} />
                {currentDepartment}
              </span>
            ) : selectedDepartment === '__ALL__' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                <Shield size={10} />
                全部門
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                未設定部門
              </span>
            )}
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          重新整理
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '活躍員工', value: activeStaffCount, icon: <Users size={14} />, color: 'text-teal-600', bgColor: 'bg-teal-50' },
          { label: '14天總工時', value: `${totalHoursAll.toFixed(0)}h`, icon: <BarChart3 size={14} />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
          { label: '平均工時/份', value: `${avgHoursPerReport}h`, icon: <Clock size={14} />, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
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

      {/* Tab Navigation with Department Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Department Dropdown — open to all authenticated users */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">部門:</label>
          <select
            value={selectedDepartment || 'System'}
            onChange={(e) => {
              console.log('[TeamDashboard] 🔄 Department changed to:', e.target.value);
              setSelectedDepartment(e.target.value);
              setLoading(true);
            }}
            className="h-[34px] px-3 py-1 rounded-md border border-teal-300 bg-white text-[12px] font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 cursor-pointer min-w-[140px]"
          >
            {DEPARTMENT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md w-fit">
          {[
            { id: 'all' as const, label: '全部匯報', badge: totalReportsCount },
            { id: 'missing' as const, label: '缺交名單', badge: missingStaffCount },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors flex items-center gap-1.5',
                viewTab === tab.id ? 'bg-white shadow-sm text-teal-700' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.badge !== null && tab.badge > 0 && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                  viewTab === tab.id ? 'bg-teal-100 text-teal-700' : 'bg-muted-foreground/20 text-muted-foreground'
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {viewTab === 'missing' && (
        <MissingReportsPanel missingReports={missingReports} />
      )}



      {viewTab === 'all' && (
        <AllReportsPanel
          reports={allReportsSorted}
          entries={entries}
          staff={staff}
          getStaffName={getStaffName}
          getStaffAvatar={getStaffAvatar}
          expandedReports={expandedReports}
          toggleExpandedReport={toggleExpandedReport}
          statusColors={statusColors}
          statusLabels={statusLabels}
          categoryLookup={categoryLookup}
        />
      )}

    </div>
  );
}

// ============================
// Missing Reports Panel
// ============================
function MissingReportsPanel({ missingReports }: { missingReports: { staff: StaffMember; missingDates: string[] }[] }) {
  if (missingReports.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-8 text-center">
        <UserCheck size={32} className="text-teal-500 mx-auto mb-3" />
        <p className="text-[15px] font-bold text-teal-700">所有同事已完成匯報 🎉</p>
        <p className="text-[12px] text-muted-foreground mt-1">過去14天工作日全部已提交</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-500" />
          <h4 className="text-[15px] font-bold">缺交匯報名單</h4>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">{missingReports.length} 人</span>
        </div>
        <span className="text-[12px] text-muted-foreground">過去 14 天工作日</span>
      </div>
      <div className="divide-y divide-border/30">
        {missingReports.map(({ staff, missingDates }) => (
          <div key={staff.id} className="px-5 py-4 hover:bg-muted/10 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-100 to-rose-200 flex items-center justify-center text-[13px] font-bold text-rose-700 shrink-0">
                  {staff.display_name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold">{staff.display_name}</span>
                    {staff.position && <span className="text-[11px] text-muted-foreground">{staff.position}</span>}
                  </div>
                  {staff.business_unit && (
                    <span className="text-[11px] text-muted-foreground">{staff.business_unit}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-rose-600">{missingDates.length} 天缺交</span>
              </div>
            </div>
            <div className="mt-2 ml-12 flex flex-wrap gap-1.5">
              {missingDates.slice(0, 10).map(d => (
                <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100">
                  {formatDate(d)}
                </span>
              ))}
              {missingDates.length > 10 && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  +{missingDates.length - 10} 天
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================
// All Reports Panel
// ============================
interface ReportsPanelProps {
  reports: DayReport[];
  entries: DayReportEntry[];
  staff?: StaffMember[];
  getStaffName: (id: string) => string;
  getStaffAvatar: (id: string) => string;
  expandedReports: Set<string>;
  toggleExpandedReport: (id: string) => void;
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  categoryLookup: Record<string, { label: string; icon: string; color: string; bg: string }>;
}

function AllReportsPanel(props: ReportsPanelProps) {
  const { reports, staff = [], getStaffName } = props;
  const [selectedStaffId, setSelectedStaffId] = useState<string>('__ALL__');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Filter reports by selected employee
  const filteredReports = useMemo(() => {
    if (selectedStaffId === '__ALL__') return reports;
    return reports.filter(r => r.staff_id === selectedStaffId);
  }, [reports, selectedStaffId]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / ITEMS_PER_PAGE));
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredReports.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReports, currentPage]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStaffId]);

  // Get unique staff who have reports (sorted alphabetically by name)
  const staffWithReports = useMemo(() => {
    const staffIds = [...new Set(reports.map(r => r.staff_id))];
    const fromStaff = staff.filter(s => staffIds.includes(s.bubble_staff_id));
    const knownIds = new Set(fromStaff.map(s => s.bubble_staff_id));
    const extras = staffIds
      .filter(id => !knownIds.has(id))
      .map(id => ({
        bubble_staff_id: id,
        display_name: getStaffName(id),
        position: null as string | null,
      }));
    return [...fromStaff, ...extras].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [reports, staff, getStaffName]);

  if (reports.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-8 text-center">
        <Calendar size={32} className="text-muted-foreground mx-auto mb-3" />
        <p className="text-[15px] font-bold text-muted-foreground">暫無匯報記錄</p>
        <p className="text-[12px] text-muted-foreground mt-1">過去14天無任何匯報提交</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Employee Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">員工:</label>
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="h-[34px] px-3 py-1 rounded-md border border-teal-300 bg-white text-[12px] font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 cursor-pointer min-w-[160px]"
          >
            <option value="__ALL__">全部同事 (All)</option>
            {staffWithReports.map(s => (
              <option key={s.bubble_staff_id} value={s.bubble_staff_id}>
                {s.display_name}{s.position ? ` — ${s.position}` : ''}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[11px] text-muted-foreground">
          共 {filteredReports.length} 份匯報
          {totalPages > 1 && ` · 第 ${currentPage}/${totalPages} 頁`}
        </span>
      </div>

      {/* Reports List */}
      <ReportsList {...props} reports={paginatedReports} title="全部匯報" />

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一頁
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (currentPage <= 4) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = currentPage - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-md text-[12px] font-medium transition-colors',
                    currentPage === pageNum
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'hover:bg-muted/50 text-muted-foreground'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}

function ReportsList({ reports, entries, getStaffName, getStaffAvatar, expandedReports, toggleExpandedReport, statusColors, statusLabels, categoryLookup, title }: ReportsPanelProps & { title: string }) {
  return (
    <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye size={16} className="text-teal-600" />
          <h4 className="text-[15px] font-bold">{title}</h4>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-bold">{reports.length}</span>
        </div>
      </div>
      <div className="divide-y divide-border/30">
        {reports.map(report => {
          const reportEntries = entries.filter(e => e.day_report_id === report.id);
          const isExpanded = expandedReports.has(report.id);

          return (
            <div key={report.id} className="px-5 py-3.5 hover:bg-muted/10 transition-colors">
              {/* Report Header */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpandedReport(report.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-[13px] font-bold text-teal-700 shrink-0">
                    {getStaffAvatar(report.staff_id)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold">{getStaffName(report.staff_id)}</span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(report.report_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {report.is_leave && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{report.leave_type || '請假'}</span>}
                      {report.ot_hours > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">OT {report.ot_hours}h</span>}
                      <span className="text-[10px] text-muted-foreground">{reportEntries.length} 項工作</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-[15px] font-bold', report.ot_hours > 0 ? 'text-amber-600' : 'text-foreground')}>
                    {report.total_hours}h
                  </span>
                  <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', statusColors[report.status] || 'bg-slate-100 text-slate-600')}>
                    {statusLabels[report.status] || report.status}
                  </span>
                  {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-3 ml-12 space-y-3">
                  {/* Entries */}
                  {reportEntries.length > 0 ? (
                    <div className="space-y-2">
                      {reportEntries.map(entry => {
                        const config = categoryLookup[entry.category];
                        return (
                          <div key={entry.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/20">
                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5 flex-wrap">
                              <span className={cn('text-[11px] px-1.5 py-0.5 rounded', config?.bg || 'bg-gray-100', config?.color || 'text-gray-600')}>
                                {config?.icon || '📋'} {config?.label || entry.category}
                              </span>
                              {entry.related_name && <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-100">{entry.related_name}</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium">{entry.title || '(無標題)'}</p>
                              {entry.outcome_url && (
                                <a href={entry.outcome_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline mt-0.5 block truncate">
                                  {entry.outcome_url}
                                </a>
                              )}
                              {entry.growth_experience && <p className="text-[11px] text-emerald-600 mt-0.5 italic">🌱 {entry.growth_experience}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {entry.is_ai_assisted && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700"><Bot size={9} className="inline mr-0.5" />AI</span>}
                              <span className="text-[12px] font-bold text-teal-600">{entry.hours}h</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground italic py-2">尚無工作條目</p>
                  )}

                  {/* Under hours reason */}
                  {report.under_hours_reason && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                      <p className="text-[11px] font-medium text-amber-700">低於目標工時原因:</p>
                      <p className="text-[12px] text-amber-800 mt-0.5">{report.under_hours_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================
// Team Hours Panel
// ============================
function TeamHoursPanel({
  teamHoursData,
  staff,
  reports,
  entries,
}: {
  teamHoursData: Record<string, { totalHours: number; otHours: number; reportCount: number; aiCount: number }>;
  staff: StaffMember[];
  reports: DayReport[];
  entries: DayReportEntry[];
}) {
  // Individual staff hours sorted descending
  const staffHours = useMemo(() => {
    return staff.map(s => {
      const staffReports = reports.filter(r => r.staff_id === s.bubble_staff_id && !r.is_leave);
      const totalHours = staffReports.reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0);
      const otHours = staffReports.reduce((sum, r) => sum + (Number(r.ot_hours) || 0), 0);
      const reportCount = staffReports.length;
      const staffEntries = entries.filter(e => e.staff_id === s.bubble_staff_id);
      const aiEntries = staffEntries.filter(e => e.is_ai_assisted).length;
      return { ...s, totalHours, otHours, reportCount, aiEntries };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [staff, reports, entries]);

  const maxHours = Math.max(...staffHours.map(s => s.totalHours), 1);

  return (
    <div className="space-y-4">
      {/* Team Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(teamHoursData).map(([teamName, data]) => (
          <div key={teamName} className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-bold">{teamName}</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {staff.filter(s => (s.business_unit || '未分組') === teamName).length} 人
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[11px] text-muted-foreground">總工時</span>
                <span className="text-[18px] font-bold text-teal-600 block">{data.totalHours.toFixed(0)}h</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">加班</span>
                <span className={cn('text-[18px] font-bold block', data.otHours > 0 ? 'text-amber-600' : 'text-gray-400')}>{data.otHours.toFixed(0)}h</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">匯報數</span>
                <span className="text-[18px] font-bold block">{data.reportCount}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">AI 條目</span>
                <span className="text-[18px] font-bold text-purple-600 block">{data.aiCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Individual Staff Hours Ranking */}
      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50">
          <h4 className="text-[15px] font-bold flex items-center gap-2">
            <BarChart3 size={16} className="text-teal-600" />
            個人工時排名（14天）
          </h4>
        </div>
        <div className="divide-y divide-border/30">
          {staffHours.map((s, idx) => (
            <div key={s.id} className="px-5 py-3 hover:bg-muted/10 transition-colors">
              <div className="flex items-center gap-3">
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                  idx < 3 ? 'bg-teal-100 text-teal-700' : 'bg-muted text-muted-foreground'
                )}>
                  {idx + 1}
                </span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-[12px] font-bold text-teal-700 shrink-0">
                  {s.display_name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{s.display_name}</span>
                    {s.position && <span className="text-[11px] text-muted-foreground truncate">{s.position}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full transition-all duration-500"
                        style={{ width: `${(s.totalHours / maxHours) * 100}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-bold text-teal-600 w-14 text-right">{s.totalHours.toFixed(0)}h</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {s.otHours > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">OT {s.otHours.toFixed(0)}h</span>}
                  {s.aiEntries > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700"><Bot size={9} className="inline mr-0.5" />{s.aiEntries}</span>}
                  <span className="text-[11px] text-muted-foreground">{s.reportCount} 份</span>
                </div>
              </div>
            </div>
          ))}
          {staffHours.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">暫無工時數據</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TeamDashboard;
