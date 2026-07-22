import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Loader2, RefreshCw, Globe, Monitor,
  Users, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';

// ============================
// Types
// ============================
type Mode = 'team' | 'personal';
type PeriodType = 'day' | 'week' | 'month';
type ProfileTypeFilter = 'all' | 'system' | 'website';

interface WebsiteProfileLite {
  id: string;
  website_name: string;
  profile_type: string;
  domain_url: string | null;
}

interface EntryRow {
  id: string;
  day_report_id: string;
  staff_id: string;
  related_id: string | null;
  related_name: string | null;
  hours: number;
}

interface StaffHourRow {
  staffId: string;
  name: string;
  hours: number;
  percentage: number;
}

interface ProjectHourRow {
  projectId: string;
  name: string;
  profileType: 'system' | 'website' | 'unknown';
  hours: number;
  percentage: number;
}

interface ProjectStat {
  projectId: string;
  name: string;
  profileType: 'system' | 'website' | 'unknown';
  domainUrl: string | null;
  totalHours: number;
  staffRows: StaffHourRow[];
  entryCount: number;
}

interface PersonalStat {
  staffId: string;
  name: string;
  totalHours: number;
  projectRows: ProjectHourRow[];
  entryCount: number;
}

// ============================
// Date helpers
// ============================
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

function shiftAnchor(periodType: PeriodType, anchor: Date, delta: number): Date {
  if (periodType === 'day') return addDays(anchor, delta);
  if (periodType === 'week') return addDays(anchor, delta * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}

function roundHours(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeProfileType(raw: string | null | undefined): 'system' | 'website' | 'unknown' {
  const t = (raw || '').toLowerCase();
  if (t === 'system') return 'system';
  if (t === 'website') return 'website';
  return 'unknown';
}

function ProfileTypeBadge({ profileType }: { profileType: 'system' | 'website' | 'unknown' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
      profileType === 'system'
        ? 'bg-indigo-50 text-indigo-700'
        : profileType === 'website'
          ? 'bg-sky-50 text-sky-700'
          : 'bg-slate-100 text-slate-600',
    )}>
      {profileType === 'system' ? <Monitor size={10} /> : <Globe size={10} />}
      {profileType === 'system' ? '系統' : profileType === 'website' ? '網站' : '其他'}
    </span>
  );
}

function HoursBarRow({
  label,
  hours,
  percentage,
  badge,
}: {
  label: string;
  hours: number;
  percentage: number;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {badge}
      <span className="text-[13px] font-medium min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <div className="w-[72px] sm:w-[96px] h-2 bg-muted rounded-full overflow-hidden shrink-0">
        <div
          className="h-full bg-teal-500 rounded-full transition-all"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <span className="text-[12px] font-semibold w-[44px] text-right tabular-nums shrink-0">
        {hours}h
      </span>
      <span className="text-[11px] text-muted-foreground w-[36px] text-right tabular-nums shrink-0">
        {percentage.toFixed(0)}%
      </span>
    </div>
  );
}

// ============================
// Component
// ============================
export function ProjectAnalysis() {
  const [mode, setMode] = useState<Mode>('team');
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [typeFilter, setTypeFilter] = useState<ProfileTypeFilter>('all');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [profiles, setProfiles] = useState<WebsiteProfileLite[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [staffNameById, setStaffNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dateRange = useMemo(
    () => getDateRange(periodType, anchorDate),
    [periodType, anchorDate],
  );

  const fetchData = useCallback(async () => {
    try {
      const [{ data: profileData }, { data: reportData }] = await Promise.all([
        supabase
          .from('webandsystem_list')
          .select('id, website_name, profile_type, domain_url')
          .order('website_name', { ascending: true }),
        supabase
          .from('day_reports')
          .select('id')
          .gte('report_date', dateRange.start)
          .lte('report_date', dateRange.end),
      ]);

      setProfiles((profileData || []) as WebsiteProfileLite[]);

      let entryData: EntryRow[] = [];
      if (reportData && reportData.length > 0) {
        const reportIds = reportData.map((r) => r.id);
        const chunkSize = 200;
        for (let i = 0; i < reportIds.length; i += chunkSize) {
          const chunk = reportIds.slice(i, i + chunkSize);
          const { data } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, staff_id, related_id, related_name, hours')
            .in('day_report_id', chunk)
            .not('related_id', 'is', null);
          if (data) entryData = entryData.concat(data as EntryRow[]);
        }
      }

      const staffIds = [...new Set(entryData.map((e) => e.staff_id).filter(Boolean))];
      const nameMap = await fetchStaffNameMap(staffIds);

      setEntries(entryData);
      setStaffNameById(nameMap);
    } catch (err) {
      console.error('[ProjectAnalysis] Failed to fetch data:', err);
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
    const map = new Map<string, WebsiteProfileLite>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const resolveProjectMeta = useCallback((projectId: string, relatedName: string | null | undefined) => {
    const profile = profileById.get(projectId);
    const profileType = profile
      ? normalizeProfileType(profile.profile_type)
      : 'unknown';
    return {
      name: profile?.website_name || relatedName || projectId,
      profileType,
      domainUrl: profile?.domain_url ?? null,
    };
  }, [profileById]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const projectId = e.related_id;
      if (!projectId) return false;
      const hours = Number(e.hours) || 0;
      if (hours <= 0) return false;
      if (typeFilter === 'all') return true;
      const profile = profileById.get(projectId);
      const profileType = profile ? normalizeProfileType(profile.profile_type) : 'unknown';
      return profileType === typeFilter;
    });
  }, [entries, profileById, typeFilter]);

  const projectStats = useMemo((): ProjectStat[] => {
    const projectStaff = new Map<string, Map<string, number>>();
    const projectEntryCount = new Map<string, number>();
    const orphanNames = new Map<string, string>();

    filteredEntries.forEach((e) => {
      const projectId = e.related_id!;
      const hours = Number(e.hours) || 0;
      if (!projectStaff.has(projectId)) projectStaff.set(projectId, new Map());
      const staffMap = projectStaff.get(projectId)!;
      staffMap.set(e.staff_id, (staffMap.get(e.staff_id) || 0) + hours);
      projectEntryCount.set(projectId, (projectEntryCount.get(projectId) || 0) + 1);
      if (!profileById.has(projectId) && e.related_name) {
        orphanNames.set(projectId, e.related_name);
      }
    });

    const stats: ProjectStat[] = [];
    projectStaff.forEach((staffMap, projectId) => {
      const totalHours = roundHours(
        Array.from(staffMap.values()).reduce((s, h) => s + h, 0),
      );
      if (totalHours <= 0) return;

      const meta = resolveProjectMeta(projectId, orphanNames.get(projectId));
      const staffRows: StaffHourRow[] = Array.from(staffMap.entries())
        .map(([staffId, hours]) => {
          const rounded = roundHours(hours);
          return {
            staffId,
            name: staffNameById[staffId] || staffId,
            hours: rounded,
            percentage: totalHours > 0 ? (rounded / totalHours) * 100 : 0,
          };
        })
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'zh-Hant'));

      stats.push({
        projectId,
        name: meta.name,
        profileType: meta.profileType,
        domainUrl: meta.domainUrl,
        totalHours,
        staffRows,
        entryCount: projectEntryCount.get(projectId) || 0,
      });
    });

    return stats.sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [filteredEntries, profileById, resolveProjectMeta, staffNameById]);

  const personalStats = useMemo((): PersonalStat[] => {
    const staffProjects = new Map<string, Map<string, number>>();
    const staffEntryCount = new Map<string, number>();
    const orphanNames = new Map<string, string>();

    filteredEntries.forEach((e) => {
      const projectId = e.related_id!;
      const hours = Number(e.hours) || 0;
      if (!staffProjects.has(e.staff_id)) staffProjects.set(e.staff_id, new Map());
      const projectMap = staffProjects.get(e.staff_id)!;
      projectMap.set(projectId, (projectMap.get(projectId) || 0) + hours);
      staffEntryCount.set(e.staff_id, (staffEntryCount.get(e.staff_id) || 0) + 1);
      if (!profileById.has(projectId) && e.related_name) {
        orphanNames.set(projectId, e.related_name);
      }
    });

    const stats: PersonalStat[] = [];
    staffProjects.forEach((projectMap, staffId) => {
      const totalHours = roundHours(
        Array.from(projectMap.values()).reduce((s, h) => s + h, 0),
      );
      if (totalHours <= 0) return;

      const projectRows: ProjectHourRow[] = Array.from(projectMap.entries())
        .map(([projectId, hours]) => {
          const rounded = roundHours(hours);
          const meta = resolveProjectMeta(projectId, orphanNames.get(projectId));
          return {
            projectId,
            name: meta.name,
            profileType: meta.profileType,
            hours: rounded,
            percentage: totalHours > 0 ? (rounded / totalHours) * 100 : 0,
          };
        })
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'zh-Hant'));

      stats.push({
        staffId,
        name: staffNameById[staffId] || staffId,
        totalHours,
        projectRows,
        entryCount: staffEntryCount.get(staffId) || 0,
      });
    });

    return stats.sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [filteredEntries, profileById, resolveProjectMeta, staffNameById]);

  const summary = useMemo(() => {
    if (mode === 'team') {
      const totalHours = roundHours(projectStats.reduce((s, p) => s + p.totalHours, 0));
      const staffSet = new Set(projectStats.flatMap((p) => p.staffRows.map((r) => r.staffId)));
      return {
        primaryLabel: '有工時項目',
        primaryValue: projectStats.length,
        totalHours,
        tertiaryLabel: '投入人員',
        tertiaryValue: staffSet.size,
      };
    }
    const totalHours = roundHours(personalStats.reduce((s, p) => s + p.totalHours, 0));
    const projectSet = new Set(personalStats.flatMap((p) => p.projectRows.map((r) => r.projectId)));
    return {
      primaryLabel: '投入人員',
      primaryValue: personalStats.length,
      totalHours,
      tertiaryLabel: '參與項目',
      tertiaryValue: projectSet.size,
    };
  }, [mode, projectStats, personalStats]);

  const empty = mode === 'team' ? projectStats.length === 0 : personalStats.length === 0;

  return (
    <div>
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="text-center">
          <h1 className="text-[24px] font-bold tracking-tight">項目分析</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {mode === 'team'
              ? '按系統／網站項目統計人員投入工時與占比 — 支援按天／週／月篩選。'
              : '按個人統計參與的系統／網站項目工時與占比 — 支援按天／週／月篩選。'}
          </p>
        </div>

        <div className="flex justify-center">
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
                  'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors',
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-0.5">
            {([
              { id: 'all' as const, label: '全部' },
              { id: 'system' as const, label: '系統' },
              { id: 'website' as const, label: '網站' },
            ]).map(({ id, label }) => (
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

        <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-[rgba(13,26,45,0.08)] px-3 py-2.5 shadow-sm">
          <div className="inline-flex rounded-md border border-[rgba(13,26,45,0.08)] p-0.5">
            {([
              { id: 'day' as const, label: '按天' },
              { id: 'week' as const, label: '按週' },
              { id: 'month' as const, label: '按月' },
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
              onClick={() => setAnchorDate((d) => shiftAnchor(periodType, d, -1))}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="上一週期"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium min-w-[160px] justify-center">
              <Calendar size={14} className="text-teal-600" />
              {formatPeriodLabel(periodType, anchorDate)}
            </span>
            <button
              type="button"
              onClick={() => setAnchorDate((d) => shiftAnchor(periodType, d, 1))}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="下一週期"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAnchorDate(new Date())}
            className="text-[12px] text-teal-700 hover:underline ml-auto"
          >
            今天
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{summary.primaryLabel}</p>
          <p className="text-[20px] font-bold tabular-nums mt-0.5">{summary.primaryValue}</p>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">總工時</p>
          <p className="text-[20px] font-bold text-teal-700 tabular-nums mt-0.5">{summary.totalHours}h</p>
        </div>
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm px-4 py-3">
          <p className="text-[11px] text-muted-foreground">{summary.tertiaryLabel}</p>
          <p className="text-[20px] font-bold tabular-nums mt-0.5">{summary.tertiaryValue}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[13px]">載入項目工時…</span>
        </div>
      ) : empty ? (
        <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm py-16 text-center">
          <p className="text-[14px] text-muted-foreground">此期間暫無關聯系統／網站的工時記錄</p>
          <p className="text-[12px] text-muted-foreground mt-1">請確認匯報項目已選擇關聯對象</p>
        </div>
      ) : mode === 'team' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projectStats.map((project) => (
            <div
              key={project.projectId}
              className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden flex flex-col"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-[rgba(13,26,45,0.06)] bg-muted/20">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProfileTypeBadge profileType={project.profileType} />
                    <h3 className="text-[15px] font-bold truncate">{project.name}</h3>
                  </div>
                  {project.domainUrl && (
                    <p className="text-[11px] text-muted-foreground truncate">{project.domainUrl}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {project.staffRows.length} 人 · {project.entryCount} 筆工作
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[20px] font-bold text-teal-700 tabular-nums">{project.totalHours}h</p>
                  <p className="text-[10px] text-muted-foreground">項目總工時</p>
                </div>
              </div>

              <div className="px-4 py-3 space-y-2.5 flex-1">
                {project.staffRows.map((row) => (
                  <HoursBarRow
                    key={row.staffId}
                    label={row.name}
                    hours={row.hours}
                    percentage={row.percentage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {personalStats.map((person) => (
            <div
              key={person.staffId}
              className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm overflow-hidden flex flex-col"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-[rgba(13,26,45,0.06)] bg-muted/20">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-teal-700">
                        {person.name.charAt(0)}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-bold truncate">{person.name}</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {person.projectRows.length} 個項目 · {person.entryCount} 筆工作
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[20px] font-bold text-teal-700 tabular-nums">{person.totalHours}h</p>
                  <p className="text-[10px] text-muted-foreground">個人總工時</p>
                </div>
              </div>

              <div className="px-4 py-3 space-y-2.5 flex-1">
                {person.projectRows.map((row) => (
                  <HoursBarRow
                    key={row.projectId}
                    label={row.name}
                    hours={row.hours}
                    percentage={row.percentage}
                    badge={<ProfileTypeBadge profileType={row.profileType} />}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
