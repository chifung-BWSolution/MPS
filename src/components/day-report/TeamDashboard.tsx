import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw, User,
  Link as LinkIcon, Bot, Sparkles, FileText,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { categoryConfig } from '@/data/dayReportDataV2';
import { useDayReportTypes } from '@/hooks/useDayReportTypes';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';
import {
  fetchDepartmentByStaffId,
  fetchDepartmentMap,
  fetchDistinctDepartments,
  fetchStaffIdsByDepartment,
  isValidDepartment,
} from '@/components/day-report/departmentLookup';
import { CrudModal } from '@/components/ui/crud-modal';
import { Calendar as DayPickerCalendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  is_leave: boolean;
  leave_type: string | null;
  office_location: string;
  is_holiday: boolean;
  is_weekend: boolean;
}

interface DayReportEntry {
  id: string;
  day_report_id: string;
  staff_id: string;
  category: string;
  hours: number;
  title: string | null;
  related_name: string | null;
  outcome_url: string | null;
  growth_experience: string | null;
  is_ai_assisted: boolean | null;
}

type CategoryMeta = { id: string; label: string; icon: string; color: string; bg: string; sortOrder: number };
type Mode = 'team' | 'personal';
type PeriodType = 'week' | 'month';
type OfficeLocation = 'hk' | 'sz';

const UNASSIGNED_DEPT = '__UNASSIGNED__';
const UNASSIGNED_LABEL = '未分組';

// ============================
// Date / Holiday Helpers
// ============================
const hkPublicHolidays2025 = [
  '2025-01-01',
  '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01',
  '2025-04-04',
  '2025-04-18', '2025-04-19',
  '2025-04-21',
  '2025-05-01',
  '2025-05-05',
  '2025-05-31',
  '2025-07-01',
  '2025-10-01',
  '2025-10-07',
  '2025-12-25', '2025-12-26',
];

const szPublicHolidays2025 = [
  '2025-01-01',
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-31', '2025-06-01', '2025-06-02',
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07',
];

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

/** Full Mon–Sun rows for a month; null = day outside this month */
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

type PersonalDayData = {
  dateStr: string;
  label: string;
  isLeave: boolean;
  leaveType: string | null;
  isOff: boolean;
  hoursByCategory: Record<string, number>;
  totalHours: number;
};

function isWeekend(dateStr: string): boolean {
  const day = parseDateStr(dateStr).getDay();
  return day === 0 || day === 6;
}

function isPublicHoliday(dateStr: string, office: OfficeLocation): boolean {
  const list = office === 'sz' ? szPublicHolidays2025 : hkPublicHolidays2025;
  return list.includes(dateStr);
}

function resolveOffice(baseLocation: string | null | undefined, officeLocation?: string | null): OfficeLocation {
  const raw = `${officeLocation || ''} ${baseLocation || ''}`.toLowerCase();
  if (raw.includes('sz') || raw.includes('深圳') || raw.includes('shenzhen')) return 'sz';
  return 'hk';
}

function formatDayLabel(dateStr: string): string {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）`;
}

function formatRangeLabel(start: string, end: string): string {
  const s = parseDateStr(start);
  const e = parseDateStr(end);
  if (start === end) {
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()}（${WEEKDAY_LABELS[s.getDay()]}）`;
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
  }
  return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getFullYear()}/${e.getMonth() + 1}/${e.getDate()}`;
}

function formatPeriodLabel(periodType: PeriodType, anchor: Date, rangeStart: string, rangeEnd: string): string {
  if (periodType === 'week') return formatRangeLabel(rangeStart, rangeEnd);
  return `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = parseDateStr(start);
  const endDate = parseDateStr(end);
  while (cursor <= endDate) {
    dates.push(toDateStr(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function daySpan(start: string, end: string): number {
  const ms = parseDateStr(end).getTime() - parseDateStr(start).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
}

function roundHours(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(hours: number, total: number): number {
  return total > 0 ? (hours / total) * 100 : 0;
}

function isAdminRole(role: string | null | undefined): boolean {
  const normalized = (role || '').toLowerCase().replace(/[\s-]/g, '_');
  return normalized === 'super_admin'
    || normalized === 'management'
    || normalized === 'administrator'
    || normalized === 'admin';
}

// ============================
// Category hours bar list
// ============================
function CategoryHoursList({
  categories,
  hoursByCategory,
  totalHours,
  layout = 'row',
}: {
  categories: CategoryMeta[];
  hoursByCategory: Record<string, number>;
  totalHours: number;
  /** stack: label above bar — better for narrow 7-day columns */
  layout?: 'row' | 'stack';
}) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const ids = new Set([
    ...categories.map((c) => c.id),
    ...Object.keys(hoursByCategory),
  ]);

  const rows = Array.from(ids)
    .map((id) => {
      const hours = hoursByCategory[id] || 0;
      const cat = byId.get(id) || {
        id,
        label: id,
        icon: '📋',
        color: 'text-gray-600',
        bg: 'bg-gray-100',
        sortOrder: 999,
      };
      return { cat, hours, percentage: pct(hours, totalHours) };
    })
    .filter((row) => row.hours > 0)
    .sort((a, b) => b.hours - a.hours || b.percentage - a.percentage);

  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground text-center py-1">暫無工時</p>
    );
  }

  if (layout === 'stack') {
    return (
      <div className="space-y-2">
        {rows.map(({ cat, hours, percentage }) => (
          <div key={cat.id} className="space-y-1 min-w-0">
            <span className={cn(
              'inline-block text-[10px] px-1.5 py-0.5 rounded font-medium break-words',
              cat.bg, cat.color,
            )}>
              {cat.icon} {cat.label}
            </span>
            <div className="flex items-center gap-1 min-w-0">
              <div className="flex-1 min-w-0 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold tabular-nums shrink-0">{hours}h</span>
              <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                {percentage.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map(({ cat, hours, percentage }) => (
        <div key={cat.id} className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium whitespace-nowrap',
            cat.bg, cat.color,
          )}>
            {cat.icon} {cat.label}
          </span>
          <div className="flex-1 min-w-[48px] h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold w-[36px] text-right tabular-nums shrink-0">{hours}h</span>
          <span className="text-[10px] text-muted-foreground w-[32px] text-right tabular-nums shrink-0">
            {percentage.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================
// Main Component
// ============================
export function TeamDashboard() {
  const { systemUser } = useAuth();
  const { types: dynamicTypes } = useDayReportTypes();

  const isAdmin = useMemo(() => isAdminRole(systemUser?.role), [systemUser?.role]);

  const categories = useMemo((): CategoryMeta[] => {
    if (dynamicTypes.length > 0) {
      return dynamicTypes
        .filter((t) => t.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon || '📋',
          color: t.color || 'text-gray-600',
          bg: t.bg || 'bg-gray-100',
          sortOrder: t.sortOrder,
        }));
    }
    return Object.entries(categoryConfig).map(([id, cfg], index) => ({
      id,
      label: cfg.label,
      icon: cfg.icon,
      color: cfg.color,
      bg: cfg.bg,
      sortOrder: index,
    }));
  }, [dynamicTypes]);

  const [mode, setMode] = useState<Mode>('team');
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const initialWeek = useMemo(() => getWeekRange(new Date()), []);
  const [rangeStart, setRangeStart] = useState(initialWeek.start);
  const [rangeEnd, setRangeEnd] = useState(initialWeek.end);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [ownDepartment, setOwnDepartment] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [detailStaffId, setDetailStaffId] = useState<string | null>(null);
  const [detailDateFilter, setDetailDateFilter] = useState<string | null>(null);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pickerStaff, setPickerStaff] = useState<StaffMember[]>([]);
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<DayReport[]>([]);
  const [entries, setEntries] = useState<DayReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateRange = useMemo(() => {
    if (periodType === 'week') return { start: rangeStart, end: rangeEnd };
    return getMonthRange(anchorDate);
  }, [periodType, rangeStart, rangeEnd, anchorDate]);

  const weekDates = useMemo(
    () => (periodType === 'week' ? enumerateDates(rangeStart, rangeEnd) : []),
    [periodType, rangeStart, rangeEnd],
  );

  const monthWeekRows = useMemo(
    () => (periodType === 'month' ? getMonthWeekRows(anchorDate) : []),
    [periodType, anchorDate],
  );

  const rangePickerValue = useMemo((): DateRange | undefined => ({
    from: parseDateStr(rangeStart),
    to: parseDateStr(rangeEnd),
  }), [rangeStart, rangeEnd]);

  const handlePeriodTypeChange = (next: PeriodType) => {
    if (next === periodType) return;
    setPeriodType(next);
    if (next === 'week') {
      const base = periodType === 'month' ? anchorDate : new Date();
      const week = getWeekRange(base);
      setRangeStart(week.start);
      setRangeEnd(week.end);
    } else {
      setAnchorDate(parseDateStr(rangeStart));
    }
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) return;
    const start = toDateStr(range.from);
    const end = toDateStr(range.to || range.from);
    // Cap at 62 days to keep queries manageable
    if (daySpan(start, end) > 62) {
      const cappedEnd = toDateStr(addDays(parseDateStr(start), 61));
      setRangeStart(start);
      setRangeEnd(cappedEnd);
      setRangePickerOpen(false);
      return;
    }
    setRangeStart(start);
    setRangeEnd(end);
    if (range.to) setRangePickerOpen(false);
  };

  // Resolve own department
  useEffect(() => {
    const detect = async () => {
      if (!systemUser) return;
      let dept = systemUser.department || null;
      if (!dept) {
        try {
          dept = await fetchDepartmentByStaffId(systemUser.bubble_staff_id);
        } catch {
          dept = null;
        }
      }
      const valid = isValidDepartment(dept) ? dept!.trim() : null;
      setOwnDepartment(valid);
      if (isAdmin) {
        setSelectedDepartment((prev) => prev ?? '__ALL__');
      } else {
        setSelectedDepartment(valid);
      }
      setSelectedStaffId((prev) => prev ?? systemUser.bubble_staff_id);
    };
    detect();
  }, [systemUser, isAdmin]);

  // Load department options for admin
  useEffect(() => {
    if (!isAdmin) return;
    fetchDistinctDepartments().then(setDepartmentOptions);
  }, [isAdmin]);

  const cleanStaffRows = useCallback(async (rawStaffData: Omit<StaffMember, 'department'>[]): Promise<StaffMember[]> => {
    const deptMap = await fetchDepartmentMap(
      rawStaffData.map((s) => s.bubble_staff_id).filter(Boolean),
    );
    const EXCLUDED_POSITIONS = ['director', 'director / management'];
    const EXCLUDED_DEPARTMENTS = ['management'];
    const cleaned = rawStaffData.map((s) => ({
      ...s,
      department: deptMap[s.bubble_staff_id] || null,
    })).filter((s) => {
      const pos = (s.position || '').toLowerCase().trim();
      const dept = (s.department || '').toLowerCase().trim();
      return !EXCLUDED_POSITIONS.includes(pos) && !EXCLUDED_DEPARTMENTS.includes(dept);
    });

    const seen = new Set<string>();
    return cleaned.filter((s) => {
      if (!s.bubble_staff_id || seen.has(s.bubble_staff_id)) return false;
      seen.add(s.bubble_staff_id);
      return true;
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!systemUser || selectedDepartment === null || !selectedStaffId) return;

    try {
      // --- Picker staff (personal mode dropdown) ---
      let pickerIds: string[] | null = null;
      if (!isAdmin) {
        if (!ownDepartment) {
          pickerIds = [systemUser.bubble_staff_id];
        } else {
          pickerIds = await fetchStaffIdsByDepartment(ownDepartment);
          if (!pickerIds.includes(systemUser.bubble_staff_id)) {
            pickerIds = [...pickerIds, systemUser.bubble_staff_id];
          }
        }
      }

      let pickerQuery = supabase
        .from('staff_directory')
        .select('id, bubble_staff_id, display_name, position, user_role, status, base_location, team_id, business_unit, profile_pic_url')
        .eq('status', 'active')
        .neq('position', 'Director');
      if (pickerIds !== null) pickerQuery = pickerQuery.in('bubble_staff_id', pickerIds);
      const { data: rawPicker } = await pickerQuery;
      const cleanedPicker = await cleanStaffRows(rawPicker || []);
      setPickerStaff(cleanedPicker);

      // Ensure selected staff is visible under permission
      const allowedPickerIds = new Set(cleanedPicker.map((s) => s.bubble_staff_id));
      let effectiveStaffId = selectedStaffId;
      if (!allowedPickerIds.has(effectiveStaffId)) {
        effectiveStaffId = systemUser.bubble_staff_id;
        setSelectedStaffId(effectiveStaffId);
      }

      // --- Scope staff for data fetch ---
      // null = no staff_id filter (fetch all, then optionally post-filter)
      let allowedStaffIds: string[] | null = null;
      let filterUnassignedOnly = false;

      if (mode === 'personal') {
        allowedStaffIds = [effectiveStaffId];
      } else if (!isAdmin) {
        allowedStaffIds = ownDepartment
          ? await fetchStaffIdsByDepartment(ownDepartment)
          : [systemUser.bubble_staff_id];
      } else if (selectedDepartment === UNASSIGNED_DEPT) {
        filterUnassignedOnly = true;
        allowedStaffIds = null;
      } else if (selectedDepartment !== '__ALL__') {
        allowedStaffIds = await fetchStaffIdsByDepartment(selectedDepartment);
      }

      if (allowedStaffIds !== null && allowedStaffIds.length === 0) {
        setStaff([]);
        setStaffNameById({});
        setReports([]);
        setEntries([]);
        return;
      }

      let staffQuery = supabase
        .from('staff_directory')
        .select('id, bubble_staff_id, display_name, position, user_role, status, base_location, team_id, business_unit, profile_pic_url')
        .eq('status', 'active')
        .neq('position', 'Director');
      if (allowedStaffIds !== null) staffQuery = staffQuery.in('bubble_staff_id', allowedStaffIds);
      const { data: rawStaff } = await staffQuery;
      let staffData = await cleanStaffRows(rawStaff || []);

      if (filterUnassignedOnly) {
        staffData = staffData.filter((s) => !s.department);
        allowedStaffIds = staffData.map((s) => s.bubble_staff_id);
        if (allowedStaffIds.length === 0) {
          setStaff([]);
          setStaffNameById({});
          setReports([]);
          setEntries([]);
          return;
        }
      }

      let reportQuery = supabase
        .from('day_reports')
        .select('id, staff_id, report_date, total_hours, is_leave, leave_type, office_location, is_holiday, is_weekend')
        .gte('report_date', dateRange.start)
        .lte('report_date', dateRange.end);
      if (allowedStaffIds !== null) reportQuery = reportQuery.in('staff_id', allowedStaffIds);
      const { data: reportData } = await reportQuery;

      let entryData: DayReportEntry[] = [];
      if (reportData && reportData.length > 0) {
        const reportIds = reportData.map((r) => r.id);
        // Chunk in case of many IDs
        const chunkSize = 200;
        for (let i = 0; i < reportIds.length; i += chunkSize) {
          const chunk = reportIds.slice(i, i + chunkSize);
          const { data } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, staff_id, category, hours, title, related_name, outcome_url, growth_experience, is_ai_assisted')
            .in('day_report_id', chunk);
          if (data) entryData = entryData.concat(data);
        }
      }

      const nameIds = [
        ...new Set([
          ...staffData.map((s) => s.bubble_staff_id),
          ...cleanedPicker.map((s) => s.bubble_staff_id),
          ...(reportData || []).map((r) => r.staff_id),
        ].filter(Boolean)),
      ];
      const nameMap = await fetchStaffNameMap(nameIds);

      const normalizedReports = ((reportData || []) as DayReport[]).map((r) => ({
        ...r,
        report_date: r.report_date ? String(r.report_date).substring(0, 10) : r.report_date,
        total_hours: Number(r.total_hours) || 0,
      }));

      setStaff(staffData);
      setStaffNameById(nameMap);
      setReports(normalizedReports);
      setEntries(entryData.map((e) => ({
        ...e,
        hours: Number(e.hours) || 0,
        title: e.title ?? null,
        related_name: e.related_name ?? null,
        outcome_url: e.outcome_url ?? null,
        growth_experience: e.growth_experience ?? null,
        is_ai_assisted: !!e.is_ai_assisted,
      })));
    } catch (err) {
      console.error('[TeamDashboard] Failed to fetch analysis data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    systemUser,
    selectedDepartment,
    selectedStaffId,
    isAdmin,
    ownDepartment,
    mode,
    dateRange.start,
    dateRange.end,
    cleanStaffRows,
  ]);

  useEffect(() => {
    if (selectedDepartment !== null && selectedStaffId) {
      setLoading(true);
      fetchData();
    }
  }, [fetchData, selectedDepartment, selectedStaffId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const shiftPeriod = (dir: -1 | 1) => {
    if (periodType === 'week') {
      const span = daySpan(rangeStart, rangeEnd);
      setRangeStart(toDateStr(addDays(parseDateStr(rangeStart), dir * span)));
      setRangeEnd(toDateStr(addDays(parseDateStr(rangeEnd), dir * span)));
      return;
    }
    setAnchorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + dir, 1));
  };

  const openStaffDetail = (staffId: string, dateFilter: string | null = null) => {
    setDetailStaffId(staffId);
    setDetailDateFilter(dateFilter);
  };

  const closeStaffDetail = () => {
    setDetailStaffId(null);
    setDetailDateFilter(null);
  };

  const detailEntriesByDate = useMemo(() => {
    if (!detailStaffId) return [] as { dateStr: string; label: string; report: DayReport | undefined; items: DayReportEntry[] }[];

    const staffReports = reports
      .filter((r) => r.staff_id === detailStaffId)
      .filter((r) => !detailDateFilter || r.report_date === detailDateFilter)
      .slice()
      .sort((a, b) => a.report_date.localeCompare(b.report_date));

    // If filtering a specific day with no report, still show empty day shell
    if (detailDateFilter && staffReports.length === 0) {
      return [{
        dateStr: detailDateFilter,
        label: formatDayLabel(detailDateFilter),
        report: undefined,
        items: [],
      }];
    }

    return staffReports.map((report) => ({
      dateStr: report.report_date,
      label: formatDayLabel(report.report_date),
      report,
      items: entries
        .filter((e) => e.day_report_id === report.id)
        .slice()
        .sort((a, b) => (Number(b.hours) || 0) - (Number(a.hours) || 0)),
    }));
  }, [detailStaffId, detailDateFilter, reports, entries]);

  const detailTotalHours = useMemo(
    () => roundHours(detailEntriesByDate.flatMap((d) => d.items).reduce((s, e) => s + (Number(e.hours) || 0), 0)),
    [detailEntriesByDate],
  );

  const getStaffName = useCallback((staffId: string): string => {
    return staffNameById[staffId]
      || staff.find((s) => s.bubble_staff_id === staffId)?.display_name
      || pickerStaff.find((s) => s.bubble_staff_id === staffId)?.display_name
      || staffId;
  }, [staffNameById, staff, pickerStaff]);

  // Hours by staff → category
  const staffCategoryHours = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    const ensure = (staffId: string) => {
      if (!map.has(staffId)) {
        const empty: Record<string, number> = {};
        categories.forEach((c) => { empty[c.id] = 0; });
        map.set(staffId, empty);
      }
      return map.get(staffId)!;
    };
    staff.forEach((s) => ensure(s.bubble_staff_id));
    entries.forEach((e) => {
      const row = ensure(e.staff_id);
      row[e.category] = (row[e.category] || 0) + (Number(e.hours) || 0);
    });
    return map;
  }, [staff, entries, categories]);

  const teamGroups = useMemo(() => {
    const groups = new Map<string, StaffMember[]>();
    const sorted = [...staff].sort((a, b) => getStaffName(a.bubble_staff_id).localeCompare(getStaffName(b.bubble_staff_id), 'zh-Hant'));
    const hideUnassignedInAll = selectedDepartment === '__ALL__';

    sorted.forEach((s) => {
      const dept = s.department || UNASSIGNED_LABEL;
      // 「全部門」預設不顯示未分組
      if (hideUnassignedInAll && dept === UNASSIGNED_LABEL) return;
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(s);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === UNASSIGNED_LABEL) return 1;
      if (b === UNASSIGNED_LABEL) return -1;
      return a.localeCompare(b, 'zh-Hant');
    });
  }, [staff, getStaffName, selectedDepartment]);

  // Personal: daily breakdown (week = 7 days; month = all days in month)
  const personalDayByDate = useMemo(() => {
    const map = new Map<string, PersonalDayData>();
    if (mode !== 'personal' || !selectedStaffId) return map;

    const person = pickerStaff.find((s) => s.bubble_staff_id === selectedStaffId)
      || staff.find((s) => s.bubble_staff_id === selectedStaffId);
    const office = resolveOffice(person?.base_location);

    const dates = periodType === 'week'
      ? weekDates
      : monthWeekRows.flatMap((row) => row.filter((d): d is string => !!d));

    dates.forEach((dateStr) => {
      const report = reports.find((r) => r.staff_id === selectedStaffId && r.report_date === dateStr);
      const dayOffice = resolveOffice(person?.base_location, report?.office_location);
      const hoursByCategory: Record<string, number> = {};
      categories.forEach((c) => { hoursByCategory[c.id] = 0; });

      if (report && !report.is_leave) {
        entries
          .filter((e) => e.day_report_id === report.id)
          .forEach((e) => {
            hoursByCategory[e.category] = (hoursByCategory[e.category] || 0) + (Number(e.hours) || 0);
          });
      }

      const totalHours = Object.values(hoursByCategory).reduce((s, h) => s + h, 0);
      const isLeave = !!report?.is_leave;
      const offDay = isWeekend(dateStr) || isPublicHoliday(dateStr, dayOffice) || isPublicHoliday(dateStr, office);
      const isOff = !isLeave && offDay && totalHours === 0;

      map.set(dateStr, {
        dateStr,
        label: formatDayLabel(dateStr),
        isLeave,
        leaveType: report?.leave_type || null,
        isOff,
        hoursByCategory,
        totalHours,
      });
    });

    return map;
  }, [mode, periodType, selectedStaffId, weekDates, monthWeekRows, reports, entries, categories, pickerStaff, staff]);

  const personalDaily = useMemo(
    () => weekDates.map((d) => personalDayByDate.get(d)!).filter(Boolean),
    [weekDates, personalDayByDate],
  );

  const renderPersonalDayCard = (day: PersonalDayData) => (
    <button
      type="button"
      key={day.dateStr}
      onClick={() => openStaffDetail(selectedStaffId || '', day.dateStr)}
      className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-2.5 space-y-2 min-w-0 text-left w-full hover:border-teal-300 hover:shadow transition-colors cursor-pointer"
    >
      <div className="space-y-1">
        <p className="text-[12px] font-semibold leading-tight">{day.label}</p>
        <div className="flex flex-wrap items-center gap-1">
          {day.isLeave && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
              請假{day.leaveType ? ` · ${day.leaveType}` : ''}
            </span>
          )}
          {day.isOff && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              放假
            </span>
          )}
          {!day.isLeave && !day.isOff && (
            <span className="text-[11px] font-bold text-teal-700 tabular-nums">{day.totalHours}h</span>
          )}
        </div>
      </div>
      <CategoryHoursList
        categories={categories}
        hoursByCategory={(day.isLeave || day.isOff) ? {} : day.hoursByCategory}
        totalHours={(day.isLeave || day.isOff) ? 0 : day.totalHours}
        layout="stack"
      />
    </button>
  );

  const showInitialLoading = loading && staff.length === 0 && reports.length === 0;

  const activeDeptLabel = !isAdmin
    ? (ownDepartment || '本部門')
    : selectedDepartment === '__ALL__'
      ? '全部門'
      : selectedDepartment === UNASSIGNED_DEPT
        ? UNASSIGNED_LABEL
        : selectedDepartment;

  return (
    <div>
      {/* Sticky: title + 團隊|個人 + period filters */}
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">團隊&個人分析</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            按週／月統計工作類別工時與占比 — 週統計可自選日期範圍 · 點擊卡片查看工作內容。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-0.5">
            {([
              { id: 'team' as const, label: '團隊', icon: Users },
              { id: 'personal' as const, label: '個人', icon: User },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                  mode === id
                    ? 'bg-teal-50 text-teal-700 border border-teal-100'
                    : 'text-muted-foreground hover:text-[#0d1a2d]',
                )}
              >
                <Icon size={14} />
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

        <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-[rgba(13,26,45,0.08)] px-3 py-2.5 shadow-sm">
          <div className="inline-flex rounded-md border border-[rgba(13,26,45,0.08)] p-0.5">
            {([
              { id: 'week' as const, label: '本週' },
              { id: 'month' as const, label: '本月' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => handlePeriodTypeChange(id)}
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
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="上一週期"
            >
              <ChevronLeft size={16} />
            </button>

            {periodType === 'week' ? (
              <Popover open={rangePickerOpen} onOpenChange={setRangePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium min-w-[160px] justify-center px-2 py-1 rounded-md hover:bg-teal-50 hover:text-teal-800 transition-colors"
                    title="選擇日期範圍"
                  >
                    <Calendar size={14} className="text-teal-600" />
                    {formatPeriodLabel(periodType, anchorDate, rangeStart, rangeEnd)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="px-3 pt-3 pb-1">
                    <p className="text-[12px] font-medium text-[#0d1a2d]">選擇統計日期範圍</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">最長 62 天 · 點擊起訖日期</p>
                  </div>
                  <DayPickerCalendar
                    mode="range"
                    numberOfMonths={2}
                    selected={rangePickerValue}
                    onSelect={handleRangeSelect}
                    defaultMonth={parseDateStr(rangeStart)}
                  />
                  <div className="flex items-center justify-between gap-2 px-3 pb-3">
                    <button
                      type="button"
                      className="text-[12px] text-teal-700 hover:underline"
                      onClick={() => {
                        const week = getWeekRange(new Date());
                        setRangeStart(week.start);
                        setRangeEnd(week.end);
                        setRangePickerOpen(false);
                      }}
                    >
                      重設為本週
                    </button>
                    <button
                      type="button"
                      className="text-[12px] text-muted-foreground hover:text-[#0d1a2d]"
                      onClick={() => setRangePickerOpen(false)}
                    >
                      關閉
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium min-w-[140px] justify-center">
                <Calendar size={14} className="text-teal-600" />
                {formatPeriodLabel(periodType, anchorDate, rangeStart, rangeEnd)}
              </span>
            )}

            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="下一週期"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {mode === 'team' && (
            isAdmin ? (
              <select
                value={selectedDepartment || '__ALL__'}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="ml-auto px-2.5 py-1.5 border border-border rounded-md text-[12px] bg-white"
              >
                <option value="__ALL__">全部門</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value={UNASSIGNED_DEPT}>{UNASSIGNED_LABEL}</option>
              </select>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                <Users size={10} />
                {activeDeptLabel}
              </span>
            )
          )}

          {mode === 'personal' && (
            pickerStaff.length > 1 ? (
              <select
                value={selectedStaffId || ''}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="ml-auto px-2.5 py-1.5 border border-border rounded-md text-[12px] bg-white max-w-[220px]"
              >
                {pickerStaff
                  .slice()
                  .sort((a, b) => getStaffName(a.bubble_staff_id).localeCompare(getStaffName(b.bubble_staff_id), 'zh-Hant'))
                  .map((s) => (
                    <option key={s.bubble_staff_id} value={s.bubble_staff_id}>
                      {getStaffName(s.bubble_staff_id)}
                      {s.department ? ` · ${s.department}` : ''}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="ml-auto text-[12px] text-muted-foreground">
                {getStaffName(selectedStaffId || systemUser?.bubble_staff_id || '')}
              </span>
            )
          )}
        </div>
      </div>

      {/* Content */}
      {showInitialLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-teal-600" size={24} />
          <span className="ml-3 text-[14px] text-muted-foreground">載入分析數據中...</span>
        </div>
      ) : mode === 'team' ? (
        <div className="space-y-6">
          {teamGroups.length === 0 ? (
            <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] p-10 text-center text-[13px] text-muted-foreground">
              此週期暫無團隊成員資料
            </div>
          ) : (
            teamGroups.map(([dept, members]) => (
              <section key={dept} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-[14px] font-bold text-[#0d1a2d]">{dept}</h4>
                  <span className="text-[11px] text-muted-foreground">{members.length} 人</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {members.map((member) => {
                    const hoursByCategory = staffCategoryHours.get(member.bubble_staff_id) || {};
                    const totalHours = Object.values(hoursByCategory).reduce((s, h) => s + h, 0);
                    return (
                      <button
                        type="button"
                        key={member.bubble_staff_id}
                        onClick={() => openStaffDetail(member.bubble_staff_id)}
                        className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-4 space-y-3 text-left w-full hover:border-teal-300 hover:shadow transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                                <span className="text-[11px] font-bold text-teal-700">
                                  {getStaffName(member.bubble_staff_id).charAt(0)}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold truncate">
                                  {getStaffName(member.bubble_staff_id)}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {member.department || UNASSIGNED_LABEL}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[15px] font-bold text-teal-700 tabular-nums">{totalHours}h</p>
                            <p className="text-[10px] text-muted-foreground">總工時</p>
                          </div>
                        </div>
                        <CategoryHoursList
                          categories={categories}
                          hoursByCategory={hoursByCategory}
                          totalHours={totalHours}
                        />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[13px] text-muted-foreground">
            {getStaffName(selectedStaffId || '')} · 每日工作類別工時 · 點擊日期卡片查看詳情
          </div>

          {periodType === 'week' ? (
            <div className={cn(
              'grid gap-2',
              weekDates.length <= 7 ? 'grid-cols-7' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7',
            )}>
              {personalDaily.map((day) => renderPersonalDayCard(day))}
            </div>
          ) : (
            <div className="space-y-2">
              {monthWeekRows.map((row, rowIndex) => (
                <div key={`month-row-${rowIndex}`} className="grid grid-cols-7 gap-2">
                  {row.map((dateStr, colIndex) => {
                    if (!dateStr) {
                      return (
                        <div
                          key={`empty-${rowIndex}-${colIndex}`}
                          className="rounded-lg border border-transparent bg-transparent min-h-[1px]"
                        />
                      );
                    }
                    const day = personalDayByDate.get(dateStr);
                    return day ? renderPersonalDayCard(day) : (
                      <div
                        key={dateStr}
                        className="rounded-lg border border-dashed border-[rgba(13,26,45,0.08)] bg-white/50 min-h-[80px]"
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CrudModal
        isOpen={!!detailStaffId}
        onClose={closeStaffDetail}
        title={`${getStaffName(detailStaffId || '')} · 工作內容`}
        size="lg"
        headerActions={
          <span className="text-[12px] text-muted-foreground mr-2">
            {detailDateFilter
              ? formatDayLabel(detailDateFilter)
              : formatPeriodLabel(periodType, anchorDate, dateRange.start, dateRange.end)}
            {' · '}
            <span className="font-semibold text-teal-700">{detailTotalHours}h</span>
          </span>
        }
      >
        {detailEntriesByDate.length === 0 || detailEntriesByDate.every((d) => d.items.length === 0 && !d.report) ? (
          <div className="py-10 text-center text-muted-foreground">
            <FileText size={22} className="mx-auto mb-2 opacity-40" />
            <p className="text-[13px]">此期間暫無工作內容</p>
          </div>
        ) : (
          <div className="space-y-4">
            {detailEntriesByDate.map((day) => (
              <div key={day.dateStr} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[13px] font-bold">{day.label}</h4>
                  <div className="flex items-center gap-2 text-[11px]">
                    {day.report?.is_leave && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        請假{day.report.leave_type ? ` · ${day.report.leave_type}` : ''}
                      </span>
                    )}
                    <span className="font-semibold text-teal-700 tabular-nums">
                      {roundHours(day.items.reduce((s, e) => s + (Number(e.hours) || 0), 0))}h
                    </span>
                  </div>
                </div>

                {day.report?.is_leave && day.items.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground px-1">當日請假，無工作項目</p>
                ) : day.items.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground px-1">當日無工作項目</p>
                ) : (
                  <div className="space-y-2">
                    {day.items.map((entry) => {
                      const config = categories.find((c) => c.id === entry.category) || {
                        id: entry.category,
                        label: entry.category,
                        icon: '📋',
                        color: 'text-gray-600',
                        bg: 'bg-gray-100',
                        sortOrder: 999,
                      };
                      return (
                        <div
                          key={entry.id}
                          className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-muted/10 px-3 py-2.5 space-y-1.5"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className={cn(
                              'text-[11px] px-1.5 py-0.5 rounded shrink-0 font-medium',
                              config.bg, config.color,
                            )}>
                              {config.icon} {config.label}
                            </span>
                            {entry.related_name && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-100 shrink-0 truncate max-w-[140px]">
                                {entry.related_name}
                              </span>
                            )}
                            <span className="text-[12px] text-muted-foreground flex-1 min-w-0 break-words">
                              {entry.title || '—'}
                            </span>
                            <span className="text-[12px] font-semibold tabular-nums shrink-0">{entry.hours}h</span>
                            {entry.is_ai_assisted && <Bot size={12} className="text-purple-500 shrink-0 mt-0.5" />}
                          </div>
                          {(entry.outcome_url || entry.growth_experience) && (
                            <div className="space-y-1 pl-0.5">
                              {entry.outcome_url && (
                                <a
                                  href={entry.outcome_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-[11px] text-teal-700 hover:underline break-all"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <LinkIcon size={10} className="shrink-0" />
                                  {entry.outcome_url}
                                </a>
                              )}
                              {entry.growth_experience && (
                                <p className="flex items-start gap-1 text-[11px] text-emerald-700">
                                  <Sparkles size={10} className="shrink-0 mt-0.5" />
                                  <span>{entry.growth_experience}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CrudModal>
    </div>
  );
}
