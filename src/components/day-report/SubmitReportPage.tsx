import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Check, X, AlertTriangle, ChevronLeft, ChevronRight, Sparkles, Calendar,
  FileText, Zap, Bot, Trash2, RefreshCw, MapPin, CalendarDays, Loader2, Upload, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as DayPickerCalendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  addCalendarDays,
  clampLaterWeekSunday,
  formatCompactWeekLabel,
  formatWeekRangeLabel,
  getTwoWeekWindow,
  parseLocalDateStr as parseWeekDateStr,
  startOfWeekSunday,
  toLocalDateStr,
} from '@/lib/sundayWeek';
import {
  categoryConfig,
  outcomeTypeConfigV2,
  WorkCategory,
  OutcomeType,
  AITool,
} from '@/data/dayReportDataV2';
import { defaultCategoryRelationMap, isRelationRequired, type CategoryRelationType } from '@/components/day-report/WorkCategoriesManager';
import { SearchableProjectSelect } from '@/components/day-report/SearchableProjectSelect';
import { useDayReportTypes } from '@/hooks/useDayReportTypes';
import { useCategoryLookup } from '@/hooks/useCategoryLookup';
import { useProjects, type ProjectRelatedType } from '@/hooks/useProjects';
import type { ProjectSelectItem } from '@/lib/searchableProjectSelect';
import { usePendingReportItems } from '@/hooks/usePendingReportItems';
import {
  getDayReportCompletionStatus,
  getRequiredDayHours,
  hoursEqual,
  sumEntryHours,
  type DayReportCompletionStatus,
} from '@/lib/dayReportCompletion';
import {
  consumePendingItems,
  pullPendingItems,
  resolveStaffUuid,
  staffUuidFromSession,
  type ReportFormEntry,
} from '@/services/reportLinkService';

type OfficeLocation = 'hk' | 'sz';
type HoursPreset = 'full' | 'half' | 'custom' | 'off';

type AiToolsSelection = {
  copywriting: string[];
  copywritingOther: string;
  image: string[];
  imageOther: string;
  video: string[];
  videoOther: string;
};

const EMPTY_AI_TOOLS: AiToolsSelection = {
  copywriting: [],
  copywritingOther: '',
  image: [],
  imageOther: '',
  video: [],
  videoOther: '',
};

type SavedEntry = {
  id: string;
  category: string;
  relatedId: string;
  relatedName: string;
  title: string;
  hours: number;
  outcomeType: OutcomeType | '';
  outcomeUrl: string;
  outcomeImages: string[];
  growthExperience: string;
  isAiAssisted: boolean;
  aiTools: AITool[];
  aiToolsV2: AiToolsSelection;
  sortOrder: number;
};

type DayReportHeader = {
  id: string;
  total_hours: number;
  target_hours: number;
  office_location: string | null;
  status: string | null;
  is_leave: boolean;
  is_half_day: boolean;
};

function officeFromBaseLocation(baseLocation: string | null | undefined): OfficeLocation {
  const raw = (baseLocation || '').toLowerCase();
  if (raw.includes('sz') || raw.includes('深圳') || raw.includes('shenzhen')) return 'sz';
  return 'hk';
}

function getFullDayHours(office: OfficeLocation): number {
  return office === 'sz' ? 7.5 : 8;
}

function inferHoursPreset(hours: number, office: OfficeLocation): HoursPreset {
  const full = getFullDayHours(office);
  if (hours === 0) return 'off';
  if (hours === 4) return 'half';
  if (hours === full) return 'full';
  return 'custom';
}

function parseLocalDateStr(dateStr: string): Date {
  return parseWeekDateStr(dateStr);
}

function isSaturday(dateStr: string): boolean {
  return parseLocalDateStr(dateStr).getDay() === 6;
}

function formatDateShort(dateStr: string): string {
  const d = parseLocalDateStr(dateStr);
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function formatDateFull(dateStr: string): string {
  return parseLocalDateStr(dateStr).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

function createBlankForm(): ReportFormEntry {
  return {
    category: '',
    relatedId: '',
    relatedName: '',
    title: '',
    hours: 0,
    outcomeType: '',
    outcomeUrl: '',
    outcomeImages: [],
    outcomeImageFiles: [],
    growthExperience: '',
    isAiAssisted: false,
    aiTools: [],
    aiToolsV2: { ...EMPTY_AI_TOOLS },
  };
}

function mapDbEntry(row: Record<string, unknown>, relationType: CategoryRelationType): SavedEntry {
  const dropRelation = relationType === 'none';
  const images = row.outcome_images;
  return {
    id: String(row.id),
    category: String(row.category || ''),
    relatedId: dropRelation ? '' : String(row.related_id || ''),
    relatedName: dropRelation ? '' : String(row.related_name || ''),
    title: String(row.title || ''),
    hours: Number(row.hours) || 0,
    outcomeType: (row.outcome_type || '') as OutcomeType | '',
    outcomeUrl: String(row.outcome_url || ''),
    outcomeImages: Array.isArray(images) ? images.filter((u): u is string => typeof u === 'string') : [],
    growthExperience: String(row.growth_experience || ''),
    isAiAssisted: Boolean(row.is_ai_assisted),
    aiTools: (row.ai_tools || []) as AITool[],
    aiToolsV2: (row.ai_tools_v2 || { ...EMPTY_AI_TOOLS }) as AiToolsSelection,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function savedToForm(entry: SavedEntry): ReportFormEntry {
  return {
    category: entry.category as WorkCategory | '',
    relatedId: entry.relatedId,
    relatedName: entry.relatedName,
    title: entry.title,
    hours: entry.hours,
    outcomeType: entry.outcomeType,
    outcomeUrl: entry.outcomeUrl,
    outcomeImages: [...entry.outcomeImages],
    outcomeImageFiles: [],
    growthExperience: entry.growthExperience,
    isAiAssisted: entry.isAiAssisted,
    aiTools: [...entry.aiTools],
    aiToolsV2: { ...entry.aiToolsV2 },
  };
}

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif'];
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGES_PER_ENTRY = 5;

const QUICK_TEMPLATES = [
  { category: 'website_design' as WorkCategory, title: '網站設計及更新', hours: 2, relatedName: '' },
  { category: 'social_media' as WorkCategory, title: '社媒內容製作', hours: 1.5, relatedName: '' },
  { category: 'video_editing' as WorkCategory, title: '影片剪輯', hours: 3, relatedName: '' },
  { category: 'article_writing' as WorkCategory, title: '文章撰寫', hours: 2, relatedName: '' },
  { category: 'client_meeting' as WorkCategory, title: '客戶會議', hours: 1, relatedName: '' },
  { category: 'paid_ads' as WorkCategory, title: '廣告投放', hours: 1.5, relatedName: '' },
];

export function SubmitReportPage() {
  const { projects: masterProjects } = useProjects({ activeOnly: true });
  const { types: dynamicTypes } = useDayReportTypes();
  const categoryLookup = useCategoryLookup();
  const { systemUser } = useAuth();

  const [office, setOffice] = useState<OfficeLocation>('hk');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateStr(new Date()));
  const [laterWeekSunday, setLaterWeekSunday] = useState<string>(() =>
    toLocalDateStr(startOfWeekSunday(new Date())),
  );
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);

  const [form, setForm] = useState<ReportFormEntry>(createBlankForm);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [targetHours, setTargetHours] = useState<number>(8);
  const [hoursPreset, setHoursPreset] = useState<HoursPreset>('full');
  const [savedTargetHours, setSavedTargetHours] = useState<number>(8);
  const [savedHoursPreset, setSavedHoursPreset] = useState<HoursPreset>('full');
  const fullDayHours = getFullDayHours(office);

  const [isPulling, setIsPulling] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isUpdatingHours, setIsUpdatingHours] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingEntryId, setIsDeletingEntryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [existingReportId, setExistingReportId] = useState<string | null>(null);
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);

  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [currentStaffName, setCurrentStaffName] = useState<string>('');
  const [staffIdResolved, setStaffIdResolved] = useState(false);
  const { count: pendingCount, refresh: refreshPendingCount } = usePendingReportItems(currentStaffId, selectedDate);

  type DbWeekReport = {
    id: string;
    report_date: string;
    total_hours: number;
    target_hours: number;
    status: string;
    is_leave: boolean;
    entryHours: number;
    fillStatus: DayReportCompletionStatus;
  };
  const [dbReports, setDbReports] = useState<DbWeekReport[]>([]);
  const [isLoadingDbReports, setIsLoadingDbReports] = useState(true);

  const skipEnsureKeyRef = useRef<string | null>(null);
  const officeRef = useRef(office);
  officeRef.current = office;

  const todayStr = toLocalDateStr(new Date());
  const currentWeekSunday = toLocalDateStr(startOfWeekSunday(new Date()));
  const weekWindow = useMemo(
    () => getTwoWeekWindow(parseLocalDateStr(laterWeekSunday)),
    [laterWeekSunday],
  );
  const isCurrentWeekWindow = laterWeekSunday === currentWeekSunday;
  const selectedDateIsSat = isSaturday(selectedDate);
  const selectedDateIsSun = parseLocalDateStr(selectedDate).getDay() === 0;
  const isDayOff = hoursPreset === 'off' || targetHours === 0;
  const targetHoursDirty = targetHours !== savedTargetHours || hoursPreset !== savedHoursPreset;
  const isTodaySelected = selectedDate === todayStr;

  const resolveRelationType = useCallback((category: string): CategoryRelationType => {
    const dyn = dynamicTypes.find(t => t.id === category);
    if (dyn?.relationType) return dyn.relationType;
    return defaultCategoryRelationMap[category as WorkCategory] ?? 'none';
  }, [dynamicTypes]);

  const getRelatedItemsForRelation = useCallback((relationType: CategoryRelationType | undefined): ProjectSelectItem[] => {
    if (!relationType || relationType === 'none') return [];
    if (relationType === 'optional') {
      return masterProjects.map(p => ({
        id: p.id,
        name: p.name,
        relatedType: p.relatedType,
      }));
    }
    if (relationType === 'webandsystem' || relationType === 'quotation_client' || relationType === 'vchannel') {
      return masterProjects
        .filter(p => p.relatedType === (relationType as ProjectRelatedType))
        .map(p => ({ id: p.id, name: p.name, relatedType: p.relatedType }));
    }
    return [];
  }, [masterProjects]);

  const applyHoursPreset = useCallback((preset: HoursPreset, officeLoc: OfficeLocation = office) => {
    setHoursPreset(preset);
    if (preset === 'full') setTargetHours(getFullDayHours(officeLoc));
    else if (preset === 'half') setTargetHours(4);
    else if (preset === 'off') setTargetHours(0);
    else if (preset === 'custom') {
      setTargetHours((prev) => {
        if (prev === 0 || prev === 4 || prev === getFullDayHours(officeLoc)) {
          return getFullDayHours(officeLoc);
        }
        return prev;
      });
    }
  }, [office]);

  const resetForm = useCallback(() => {
    setForm(createBlankForm());
    setEditingEntryId(null);
    setFormError(null);
  }, []);

  const applyHeader = useCallback((report: DayReportHeader) => {
    const loadedOffice = (report.office_location as OfficeLocation) || officeRef.current;
    if (report.office_location === 'hk' || report.office_location === 'sz') {
      setOffice(loadedOffice);
    }
    const hours = Number(report.target_hours);
    const preset = report.is_leave ? 'off' : inferHoursPreset(hours, loadedOffice);
    setTargetHours(hours);
    setHoursPreset(preset);
    setSavedTargetHours(hours);
    setSavedHoursPreset(preset);
    setExistingReportId(report.id);
  }, []);

  const loadEntries = useCallback(async (reportId: string): Promise<SavedEntry[]> => {
    const { data, error } = await supabase
      .from('day_report_entries')
      .select('*')
      .eq('day_report_id', reportId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((row) => {
      const category = String(row.category || '');
      return mapDbEntry(row as Record<string, unknown>, resolveRelationType(category));
    });
  }, [resolveRelationType]);

  const loadDbReports = useCallback(async () => {
    if (!currentStaffId) {
      setIsLoadingDbReports(false);
      return;
    }
    setIsLoadingDbReports(true);
    try {
      const { data, error } = await supabase
        .from('day_reports')
        .select('id, report_date, total_hours, target_hours, status, is_leave, day_report_entries(hours)')
        .eq('staff_id', currentStaffId)
        .gte('report_date', weekWindow.windowStart)
        .lte('report_date', weekWindow.windowEnd);

      if (error) {
        console.error('[SubmitReport] Error loading dbReports:', error);
      }
      setDbReports((data || []).map((r) => {
        const entries = (r as { day_report_entries?: Array<{ hours?: number | null }> }).day_report_entries || [];
        const entryHours = sumEntryHours(entries);
        const header = {
          total_hours: Number(r.total_hours) || 0,
          target_hours: Number(r.target_hours) || 0,
          is_leave: !!r.is_leave,
        };
        return {
          id: r.id,
          report_date: r.report_date ? String(r.report_date).substring(0, 10) : r.report_date,
          total_hours: header.total_hours,
          target_hours: header.target_hours,
          status: r.status,
          is_leave: header.is_leave,
          entryHours,
          fillStatus: getDayReportCompletionStatus(header, entryHours),
        };
      }));
    } catch (err) {
      console.error('[SubmitReport] Exception loading dbReports:', err);
    } finally {
      setIsLoadingDbReports(false);
    }
  }, [currentStaffId, weekWindow.windowStart, weekWindow.windowEnd]);

  const retotalReport = useCallback(async (reportId: string, entries: SavedEntry[]) => {
    const sum = entries.reduce((s, e) => s + (e.hours || 0), 0);
    const ot = isDayOff ? 0 : Math.max(0, sum - fullDayHours);
    const { error } = await supabase
      .from('day_reports')
      .update({
        total_hours: sum,
        ot_hours: ot,
        status: 'submitted',
      })
      .eq('id', reportId);
    if (error) throw new Error(error.message);
    await loadDbReports();
  }, [fullDayHours, isDayOff, loadDbReports]);

  const selectReportWithEntries = useCallback(async (
    staffId: string,
    date: string,
  ): Promise<{ header: DayReportHeader; entries: SavedEntry[] } | null> => {
    const mapEntries = (rows: Record<string, unknown>[] | null | undefined) =>
      (rows || [])
        .map((entry) => mapDbEntry(entry, resolveRelationType(String(entry.category || ''))))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const { data, error } = await supabase
      .from('day_reports')
      .select('id, total_hours, target_hours, office_location, status, is_leave, is_half_day, day_report_entries(*)')
      .eq('staff_id', staffId)
      .eq('report_date', date)
      .maybeSingle();

    if (error) {
      const { data: header, error: headerError } = await supabase
        .from('day_reports')
        .select('id, total_hours, target_hours, office_location, status, is_leave, is_half_day')
        .eq('staff_id', staffId)
        .eq('report_date', date)
        .maybeSingle();
      if (headerError) throw new Error(headerError.message);
      if (!header) return null;
      return { header: header as DayReportHeader, entries: await loadEntries(header.id) };
    }

    if (!data) return null;
    const row = data as DayReportHeader & { day_report_entries?: Record<string, unknown>[] };
    return { header: row, entries: mapEntries(row.day_report_entries) };
  }, [loadEntries, resolveRelationType]);

  const insertReport = useCallback(async (staffId: string, date: string): Promise<DayReportHeader> => {
    const currentOffice = officeRef.current;
    const payload = {
      staff_id: staffId,
      report_date: date,
      total_hours: 0,
      target_hours: getFullDayHours(currentOffice),
      ot_hours: 0,
      is_leave: false,
      is_half_day: false,
      office_location: currentOffice,
      is_weekend: isSaturday(date) || parseLocalDateStr(date).getDay() === 0,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('day_reports')
      .insert(payload)
      .select('id, total_hours, target_hours, office_location, status, is_leave, is_half_day')
      .single();
    if (error) {
      if (error.code === '23505') {
        const existing = await selectReportWithEntries(staffId, date);
        if (existing) return existing.header;
      }
      throw new Error(error.message);
    }
    return data as DayReportHeader;
  }, [selectReportWithEntries]);

  const openDate = useCallback(async (staffId: string, date: string) => {
    const key = `${staffId}:${date}`;
    if (skipEnsureKeyRef.current === key) {
      setExistingReportId(null);
      setSavedEntries([]);
      setIsLoadingExisting(false);
      return;
    }
    setIsLoadingExisting(true);
    setFormError(null);
    resetForm();
    try {
      const existing = await selectReportWithEntries(staffId, date);
      if (existing) {
        applyHeader(existing.header);
        setSavedEntries(existing.entries);
      } else {
        const report = await insertReport(staffId, date);
        applyHeader(report);
        setSavedEntries([]);
      }
      void refreshPendingCount();
    } catch (err) {
      console.error('[SubmitReport] ensure day report failed:', err);
      setFormError(err instanceof Error ? err.message : '無法載入或建立當日匯報');
      setExistingReportId(null);
      setSavedEntries([]);
    } finally {
      setIsLoadingExisting(false);
    }
  }, [applyHeader, insertReport, refreshPendingCount, resetForm, selectReportWithEntries]);

  useEffect(() => {
    if (!systemUser) {
      setStaffIdResolved(false);
      return;
    }
    setCurrentStaffName(systemUser.display_name);
    const sessionId = staffUuidFromSession(systemUser);
    if (sessionId) {
      setCurrentStaffId(sessionId);
      setStaffIdResolved(true);
      return;
    }
    let aborted = false;
    void resolveStaffUuid(systemUser, { refreshFromLogin: true }).then((realId) => {
      if (aborted) return;
      setCurrentStaffId(realId);
      setStaffIdResolved(true);
    });
    return () => { aborted = true; };
  }, [systemUser]);

  const officeInitializedRef = useRef(false);
  useEffect(() => {
    if (!systemUser || officeInitializedRef.current) return;
    officeInitializedRef.current = true;
    const derived = officeFromBaseLocation(systemUser.office);
    setOffice(derived);
    applyHoursPreset('full', derived);
  }, [systemUser, applyHoursPreset]);

  useEffect(() => {
    loadDbReports();
  }, [loadDbReports]);

  const openDateRef = useRef(openDate);
  openDateRef.current = openDate;

  useEffect(() => {
    if (!currentStaffId) {
      if (staffIdResolved) setIsLoadingExisting(false);
      return;
    }
    const key = `${currentStaffId}:${selectedDate}`;
    if (skipEnsureKeyRef.current && skipEnsureKeyRef.current !== key) {
      skipEnsureKeyRef.current = null;
    }
    void openDateRef.current(currentStaffId, selectedDate);
  }, [currentStaffId, selectedDate, staffIdResolved]);

  const selectDate = (date: string) => {
    if (date > todayStr) return;
    if (date === selectedDate) {
      if (!existingReportId && currentStaffId) {
        skipEnsureKeyRef.current = null;
        void openDate(currentStaffId, date);
      }
      return;
    }
    setSelectedDate(date);
  };

  type FrequentItem = {
    relatedId: string;
    relatedName: string;
    category: WorkCategory;
    count: number;
    lastUsed: string;
    totalHours: number;
  };
  const [recentFrequentItems, setRecentFrequentItems] = useState<FrequentItem[]>([]);

  const loadRecentFrequentItems = useCallback(async () => {
    if (!currentStaffId) {
      setRecentFrequentItems([]);
      return;
    }
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      const toStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const { data: reports, error: reportErr } = await supabase
        .from('day_reports')
        .select('id')
        .eq('staff_id', currentStaffId)
        .eq('is_leave', false)
        .gte('report_date', toStr(start))
        .lte('report_date', toStr(today));

      type EntryRow = {
        related_id: string | null;
        category: string;
        hours: number | null;
        created_at: string | null;
      };
      let entryRows: EntryRow[] = [];

      if (reports && reports.length > 0) {
        const reportIds = reports.map(r => r.id);
        for (let i = 0; i < reportIds.length; i += 200) {
          const chunk = reportIds.slice(i, i + 200);
          const { data, error } = await supabase
            .from('day_report_entries')
            .select('related_id, category, hours, created_at')
            .in('day_report_id', chunk);
          if (!error && data) entryRows = entryRows.concat(data as EntryRow[]);
        }
      } else if (reportErr) {
        const { data } = await supabase
          .from('day_report_entries')
          .select('related_id, category, hours, created_at')
          .eq('staff_id', currentStaffId)
          .order('created_at', { ascending: false })
          .limit(300);
        entryRows = (data || []) as EntryRow[];
      }

      const relatedIds = Array.from(new Set(
        entryRows
          .filter(e => !!e.category && resolveRelationType(e.category) !== 'none')
          .map(e => (e.related_id || '').trim())
          .filter(Boolean),
      ));
      const projectNameById = new Map<string, string>();
      for (let i = 0; i < relatedIds.length; i += 200) {
        const chunk = relatedIds.slice(i, i + 200);
        const { data: projectRows } = await supabase.from('projects').select('id, name').in('id', chunk);
        (projectRows || []).forEach(row => {
          const name = ((row.name as string) || '').trim();
          if (row.id && name) projectNameById.set(row.id as string, name);
        });
      }

      const itemMap: Record<string, FrequentItem> = {};
      entryRows.forEach(entry => {
        const category = (entry.category || '') as WorkCategory;
        if (!category) return;
        const relationType = resolveRelationType(category);
        const hours = Number(entry.hours) || 0;
        const createdAt = entry.created_at || '';
        if (relationType === 'none') {
          const key = `__none__${category}`;
          if (!itemMap[key]) {
            itemMap[key] = { relatedId: '', relatedName: 'N/A', category, count: 0, lastUsed: createdAt, totalHours: 0 };
          }
          itemMap[key].count += 1;
          itemMap[key].totalHours += hours;
          if (createdAt && createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = createdAt;
          return;
        }
        const relatedId = (entry.related_id || '').trim();
        if (!relatedId) {
          if (relationType !== 'optional') return;
          const key = `__optional_empty__${category}`;
          if (!itemMap[key]) {
            itemMap[key] = { relatedId: '', relatedName: '（未選項目）', category, count: 0, lastUsed: createdAt, totalHours: 0 };
          }
          itemMap[key].count += 1;
          itemMap[key].totalHours += hours;
          if (createdAt && createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = createdAt;
          return;
        }
        const relatedName = projectNameById.get(relatedId) || '';
        if (!relatedName) return;
        const key = `${relatedId}__${category}`;
        if (!itemMap[key]) {
          itemMap[key] = { relatedId, relatedName, category, count: 0, lastUsed: createdAt, totalHours: 0 };
        }
        itemMap[key].count += 1;
        itemMap[key].totalHours += hours;
        itemMap[key].relatedName = relatedName;
        if (createdAt && createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = createdAt;
      });

      setRecentFrequentItems(
        Object.values(itemMap)
          .map(item => ({ ...item, totalHours: Math.round(item.totalHours * 10) / 10 }))
          .sort((a, b) => b.count !== a.count ? b.count - a.count : (b.lastUsed || '').localeCompare(a.lastUsed || ''))
          .slice(0, 8),
      );
    } catch (err) {
      console.error('[SubmitReport] Exception loading frequent items:', err);
      setRecentFrequentItems([]);
    }
  }, [currentStaffId, resolveRelationType]);

  useEffect(() => {
    if (!currentStaffId) {
      setRecentFrequentItems([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadRecentFrequentItems();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [currentStaffId, loadRecentFrequentItems]);

  const totalHours = savedEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
  const otHours = Math.max(0, totalHours - fullDayHours);
  const isOT = totalHours > fullDayHours;
  const hoursMatch = hoursEqual(totalHours, targetHours);
  const isReportComplete = hoursMatch || isDayOff;
  const aiUsedInEntries = savedEntries.some(e =>
    e.isAiAssisted
    || e.aiToolsV2.copywriting.length > 0
    || e.aiToolsV2.image.length > 0
    || e.aiToolsV2.video.length > 0
    || !!e.aiToolsV2.copywritingOther
    || !!e.aiToolsV2.imageOther
    || !!e.aiToolsV2.videoOther,
  );

  const formRelationType = form.category ? resolveRelationType(form.category) : 'none';
  const formMissingRelated = isRelationRequired(formRelationType) && !form.relatedId;
  const formHasAsana = form.outcomeType === 'url' && /app\.asana\.com/i.test(form.outcomeUrl);
  const canSaveTask = !!form.category && form.hours > 0 && !formMissingRelated && !formHasAsana && !!existingReportId && !isSavingTask && !isLoadingExisting && (!isReportComplete || !!editingEntryId);

  const updateForm = <K extends keyof ReportFormEntry>(field: K, value: ReportFormEntry[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const fillForm = (next: ReportFormEntry) => {
    setEditingEntryId(null);
    setForm(next);
    setFormError(null);
  };

  const buildEntryPayload = (entry: ReportFormEntry, allImages: string[], sortOrder: number) => {
    const relationType = resolveRelationType(entry.category);
    const hasRelation = relationType !== 'none';
    const aiUsed = entry.aiToolsV2.copywriting.length > 0
      || entry.aiToolsV2.image.length > 0
      || entry.aiToolsV2.video.length > 0
      || !!entry.aiToolsV2.copywritingOther
      || !!entry.aiToolsV2.imageOther
      || !!entry.aiToolsV2.videoOther;
    return {
      category: entry.category,
      related_id: hasRelation ? (entry.relatedId || null) : null,
      related_name: hasRelation ? (entry.relatedName || null) : null,
      title: entry.title || '',
      hours: entry.hours,
      outcome_type: entry.outcomeType || null,
      outcome_url: entry.outcomeUrl || null,
      outcome_images: allImages.length > 0 ? allImages : null,
      growth_experience: entry.growthExperience || null,
      is_ai_assisted: aiUsed,
      ai_tools: entry.aiTools.length > 0 ? entry.aiTools : null,
      ai_tools_v2: aiUsed ? entry.aiToolsV2 : null,
      sort_order: sortOrder,
    };
  };

  const uploadFormImages = async (reportId: string): Promise<string[]> => {
    const files = form.outcomeImageFiles || [];
    if (files.length === 0) return [];
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${reportId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('day-report-images').upload(path, file, { upsert: false });
      if (error) {
        console.error('[ImageUpload] failed:', error.message);
        continue;
      }
      const { data: urlData } = supabase.storage.from('day-report-images').getPublicUrl(path);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }
    return urls;
  };

  const refreshSavedEntries = async (reportId: string) => {
    const next = await loadEntries(reportId);
    setSavedEntries(next);
    await retotalReport(reportId, next);
    void loadRecentFrequentItems();
  };

  const handleSaveTask = async () => {
    if (!currentStaffId || !existingReportId) {
      setFormError('無法識別當前用戶或當日匯報，請重新選擇日期。');
      return;
    }
    if (isReportComplete && !editingEntryId) {
      setFormError('工作匯報已完成，無法再新增任務。');
      return;
    }
    if (!form.category || !(form.hours > 0)) {
      setFormError('請選擇工作類別並填寫工時。');
      return;
    }
    if (formMissingRelated) {
      setFormError('請為必填關聯類型選擇項目。');
      return;
    }
    if (formHasAsana) {
      setFormError('成果連結不允許使用 Asana 連結，請移除後再提交。');
      return;
    }

    setIsSavingTask(true);
    setFormError(null);
    try {
      const uploaded = await uploadFormImages(existingReportId);
      const allImages = [...form.outcomeImages, ...uploaded];
      if (editingEntryId) {
        const current = savedEntries.find(e => e.id === editingEntryId);
        const { error } = await supabase
          .from('day_report_entries')
          .update(buildEntryPayload(form, allImages, current?.sortOrder ?? 0))
          .eq('id', editingEntryId)
          .eq('day_report_id', existingReportId);
        if (error) throw new Error(error.message);
      } else {
        const nextOrder = savedEntries.reduce((max, e) => Math.max(max, e.sortOrder), -1) + 1;
        const { error } = await supabase
          .from('day_report_entries')
          .insert({
            day_report_id: existingReportId,
            staff_id: currentStaffId,
            ...buildEntryPayload(form, allImages, nextOrder),
          });
        if (error) throw new Error(error.message);
      }
      await refreshSavedEntries(existingReportId);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存任務失敗，請重試。');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleEditEntry = (entry: SavedEntry) => {
    setEditingEntryId(entry.id);
    setForm(savedToForm(entry));
    setFormError(null);
  };

  const handleDeleteEntry = async (entry: SavedEntry) => {
    if (!existingReportId) return;
    if (!confirm(`確定刪除「${entry.title || '未命名任務'}」？`)) return;
    setIsDeletingEntryId(entry.id);
    setFormError(null);
    try {
      const { error } = await supabase
        .from('day_report_entries')
        .delete()
        .eq('id', entry.id)
        .eq('day_report_id', existingReportId);
      if (error) throw new Error(error.message);
      if (editingEntryId === entry.id) resetForm();
      await refreshSavedEntries(existingReportId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '刪除任務失敗，請重試。');
    } finally {
      setIsDeletingEntryId(null);
    }
  };

  const handleUpdateTargetHours = async () => {
    if (!existingReportId) return;
    setIsUpdatingHours(true);
    setFormError(null);
    try {
      const { error } = await supabase
        .from('day_reports')
        .update({
          target_hours: targetHours,
          is_leave: isDayOff,
          is_half_day: hoursPreset === 'half',
          ot_hours: isDayOff ? 0 : Math.max(0, totalHours - fullDayHours),
          status: 'submitted',
        })
        .eq('id', existingReportId);
      if (error) throw new Error(error.message);
      setSavedTargetHours(targetHours);
      setSavedHoursPreset(hoursPreset);
      await loadDbReports();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '更新目標工時失敗，請重試。');
    } finally {
      setIsUpdatingHours(false);
    }
  };

  const switchOffice = async (next: OfficeLocation) => {
    setOffice(next);
    if (hoursPreset === 'full') setTargetHours(getFullDayHours(next));
    if (!existingReportId) return;
    const { error } = await supabase
      .from('day_reports')
      .update({
        office_location: next,
      })
      .eq('id', existingReportId);
    if (error) {
      setFormError(error.message);
    }
  };

  const handleRefreshPending = async () => {
    if (!currentStaffId || !existingReportId) {
      alert('無法識別當前用戶或當日匯報，請確認員工資料已同步。');
      return;
    }
    setIsPulling(true);
    setFormError(null);
    try {
      const pending = await pullPendingItems(currentStaffId, selectedDate);
      if (pending.length === 0) {
        alert('目前沒有新的待匯報工作。');
        return;
      }
      let sortOrder = savedEntries.reduce((max, e) => Math.max(max, e.sortOrder), -1) + 1;
      for (const item of pending) {
        const { error } = await supabase.from('day_report_entries').insert({
          day_report_id: existingReportId,
          staff_id: currentStaffId,
          category: item.category,
          related_id: item.related_id,
          related_name: item.related_name,
          title: item.title || '',
          hours: Number(item.suggested_hours) || 0,
          outcome_type: item.outcome_type,
          outcome_url: item.outcome_url,
          outcome_images: null,
          growth_experience: null,
          is_ai_assisted: false,
          ai_tools: null,
          ai_tools_v2: null,
          sort_order: sortOrder,
        });
        if (error) throw new Error(error.message);
        sortOrder += 1;
      }
      await consumePendingItems(pending.map(p => p.id));
      await refreshSavedEntries(existingReportId);
      await refreshPendingCount();
    } catch (err) {
      console.error('[SubmitReport] refresh pending failed:', err);
      alert(`刷新失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPulling(false);
    }
  };

  const handleDeleteReport = async () => {
    if (!existingReportId || !currentStaffId || isTodaySelected) return;
    const dateLabel = formatDateFull(selectedDate);
    if (!confirm(`確定要刪除 ${dateLabel} 的整份匯報嗎？\n此日期內的所有任務記錄將一併刪除，而且無法復原。`)) {
      return;
    }
    setIsDeleting(true);
    setFormError(null);
    try {
      const { error } = await supabase
        .from('day_reports')
        .delete()
        .eq('id', existingReportId)
        .eq('staff_id', currentStaffId);
      if (error) throw new Error(error.message);
      skipEnsureKeyRef.current = `${currentStaffId}:${selectedDate}`;
      setExistingReportId(null);
      setSavedEntries([]);
      resetForm();
      applyHoursPreset('full', office);
      setSavedTargetHours(getFullDayHours(office));
      setSavedHoursPreset('full');
      await loadDbReports();
      void loadRecentFrequentItems();
      await refreshPendingCount();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '刪除匯報失敗，請重試。');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImageFileSelect = (files: FileList | null) => {
    if (!files) return;
    const existing = form.outcomeImageFiles || [];
    const errors: string[] = [];
    const valid: File[] = [];
    for (const f of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) { errors.push(`${f.name} 格式不支援`); continue; }
      if (f.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) { errors.push(`${f.name} 超過 ${MAX_IMAGE_SIZE_MB}MB`); continue; }
      valid.push(f);
    }
    updateForm('outcomeImageFiles', [...existing, ...valid].slice(0, MAX_IMAGES_PER_ENTRY));
    if (errors.length) alert(errors.join('\n'));
  };

  type WeekDateCard = {
    date: string;
    label: string;
    isToday: boolean;
    isFuture: boolean;
    isSat: boolean;
    isSun: boolean;
    fillStatus: DayReportCompletionStatus;
    reportedHours: number;
    requiredHours: number;
  };

  const buildWeekDateCard = useCallback((dateStr: string): WeekDateCard => {
    const d = parseLocalDateStr(dateStr);
    const dbReport = dbReports.find(r => (r.report_date ? r.report_date.substring(0, 10) : '') === dateStr);
    return {
      date: dateStr,
      label: formatDateShort(dateStr),
      isToday: dateStr === todayStr,
      isFuture: dateStr > todayStr,
      isSat: isSaturday(dateStr),
      isSun: d.getDay() === 0,
      fillStatus: dbReport?.fillStatus ?? 'missing',
      reportedHours: dbReport ? dbReport.entryHours : 0,
      requiredHours: dbReport ? getRequiredDayHours(dbReport) : 0,
    };
  }, [dbReports, todayStr]);

  const laterWeekDates = useMemo(() => weekWindow.later.dates.map(buildWeekDateCard), [weekWindow.later.dates, buildWeekDateCard]);
  const earlierWeekDates = useMemo(() => weekWindow.earlier.dates.map(buildWeekDateCard), [weekWindow.earlier.dates, buildWeekDateCard]);
  const availableDates = useMemo(() => [...earlierWeekDates, ...laterWeekDates], [laterWeekDates, earlierWeekDates]);
  const weekPickerRange = useMemo(() => ({
    from: parseLocalDateStr(weekWindow.windowStart),
    to: parseLocalDateStr(weekWindow.windowEnd),
  }), [weekWindow.windowStart, weekWindow.windowEnd]);

  const shiftWeekWindow = useCallback((dir: -1 | 1) => {
    const nextSunday = addCalendarDays(parseLocalDateStr(laterWeekSunday), dir * 7);
    setLaterWeekSunday(toLocalDateStr(clampLaterWeekSunday(nextSunday)));
  }, [laterWeekSunday]);

  const resetToCurrentWeeks = useCallback(() => {
    setLaterWeekSunday(currentWeekSunday);
    setWeekPickerOpen(false);
  }, [currentWeekSunday]);

  const applyWeekFromDate = useCallback((date: Date) => {
    setLaterWeekSunday(toLocalDateStr(clampLaterWeekSunday(startOfWeekSunday(date))));
    setWeekPickerOpen(false);
  }, []);

  const renderDateCard = (d: WeekDateCard) => {
    const isWorkday = !d.isSun;
    const needsReport = isWorkday && !d.isSat && !d.isFuture;
    const isComplete = d.fillStatus === 'complete';
    const isIncomplete = d.fillStatus === 'incomplete';
    const isMissing = needsReport && d.fillStatus === 'missing' && !isLoadingDbReports;
    return (
      <button
        key={d.date}
        type="button"
        disabled={d.isFuture}
        onClick={() => selectDate(d.date)}
        className={cn(
          'px-1.5 py-2 rounded-lg border text-[13px] font-medium transition-all relative flex flex-col items-center gap-1',
          d.isFuture && 'opacity-50 cursor-not-allowed',
          selectedDate === d.date
            ? isIncomplete
              ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-sm ring-2 ring-amber-200'
              : 'bg-teal-50 border-teal-400 text-teal-800 shadow-sm ring-2 ring-teal-200'
            : isComplete
              ? 'bg-teal-50/50 border-teal-200 text-teal-700'
              : isIncomplete
                ? 'bg-amber-50/50 border-amber-200 text-amber-700'
                : d.isSun
                  ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  : d.isSat
                    ? 'bg-amber-50/30 border-amber-200 text-amber-600 hover:bg-amber-50'
                    : isMissing
                      ? 'bg-rose-50/40 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300'
                      : 'bg-white border-border hover:border-teal-300 hover:bg-teal-50/30',
        )}
      >
        <span className={cn('text-[13px]', d.isToday && 'font-bold')}>{d.label}</span>
        <div className="flex items-center gap-0.5 flex-wrap justify-center min-h-[18px]">
          {d.isToday && <span className="text-[12px] px-1 py-0 rounded bg-teal-100 text-teal-700 font-semibold">今天</span>}
          {d.isSat && <span className="text-[12px] px-1 py-0 rounded bg-amber-100 text-amber-600">六</span>}
          {d.isSun && <span className="text-[12px] px-1 py-0 rounded bg-gray-100 text-gray-500">日</span>}
        </div>
        {isComplete ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[15px] font-bold text-teal-600">{d.reportedHours}h</span>
            <span className="text-[12px] px-1.5 py-0 rounded-full font-medium bg-teal-100 text-teal-700">✓ 已完成</span>
          </div>
        ) : isIncomplete ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[15px] font-bold text-amber-600">
              {d.reportedHours}h{d.requiredHours > 0 ? `/${d.requiredHours}h` : ''}
            </span>
            <span className="text-[12px] px-1.5 py-0 rounded-full font-medium bg-amber-100 text-amber-700">未完成</span>
          </div>
        ) : (d.isSun || d.isFuture) ? (
          <span className="text-[12px] text-gray-400">—</span>
        ) : d.isSat ? (
          <span className="text-[12px] text-amber-500/70">可匯報</span>
        ) : isLoadingDbReports ? (
          <span className="text-[12px] text-muted-foreground">...</span>
        ) : (
          <span className="text-[12px] text-rose-500 font-medium">未匯報</span>
        )}
      </button>
    );
  };

  const completedDays = availableDates.filter(d => d.fillStatus === 'complete');
  const incompleteDays = availableDates.filter(d => d.fillStatus === 'incomplete');
  const workdays = availableDates.filter(d => !d.isSun && !d.isSat && !d.isFuture);
  const missingDays = workdays.filter(d => d.fillStatus === 'missing');
  const totalReportedHours = [...completedDays, ...incompleteDays].reduce((s, d) => s + d.reportedHours, 0);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-teal-50/80 to-white rounded-lg border border-teal-100 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-teal-600" />
              <span className="text-[14px] font-semibold text-teal-700">辦公室：</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-teal-100/60 rounded-md">
                <button
                  type="button"
                  onClick={() => void switchOffice('hk')}
                  className={cn('px-3 py-1.5 rounded text-[14px] font-medium transition-all', office === 'hk' ? 'bg-white shadow-sm text-teal-800' : 'text-teal-600 hover:text-teal-800')}
                >
                  🇭🇰 香港
                </button>
                <button
                  type="button"
                  onClick={() => void switchOffice('sz')}
                  className={cn('px-3 py-1.5 rounded text-[14px] font-medium transition-all', office === 'sz' ? 'bg-white shadow-sm text-teal-800' : 'text-teal-600 hover:text-teal-800')}
                >
                  🇨🇳 深圳
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-teal-600" />
              <span className="text-[14px] font-semibold text-teal-700">📝 工作匯報</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshPending()}
            disabled={isPulling || isLoadingExisting || !existingReportId}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-teal-200 bg-white text-teal-700 text-[14px] font-medium hover:bg-teal-50 transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={isPulling ? 'animate-spin' : ''} />
            {isPulling ? '刷新中...' : '刷新待匯報'}
          </button>
        </div>
        {pendingCount > 0 && (
          <p className="text-[13px] text-teal-700 bg-teal-50 border border-teal-100 rounded-md px-3 py-2 mt-2">
            此日期有 <strong>{pendingCount}</strong> 項待匯報工作，點「刷新待匯報」寫入當日任務。
          </p>
        )}
        <p className="text-[13px] text-teal-600/70 mt-2">
          {office === 'hk' ? '🇭🇰 香港辦公室' : '🇨🇳 深圳辦公室'} ·
          可按週瀏覽並補交未匯報的工作日（含週六加班）
        </p>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CalendarDays size={14} className="text-teal-600" />
            <span className="text-[14px] font-bold text-foreground">選擇匯報日期</span>
            <span className="text-[13px] text-muted-foreground">（本週與上週 · 週日至週六）</span>
            <div className="ml-auto flex items-center gap-3 text-[13px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> 已完成</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 未完成</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> 未匯報</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> 假日/週末</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button type="button" onClick={() => shiftWeekWindow(-1)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" aria-label="上一週">
              <ChevronLeft size={16} />
            </button>
            <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium min-w-[200px] justify-center px-2.5 py-1.5 rounded-md border border-teal-200 bg-teal-50/40 text-teal-800 hover:bg-teal-50 transition-colors"
                >
                  <Calendar size={14} className="text-teal-600" />
                  {formatWeekRangeLabel(weekWindow.windowStart, weekWindow.windowEnd)}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
                <div className="px-3 pt-3 pb-1">
                  <p className="text-[12px] font-medium text-[#0d1a2d]">選擇週範圍</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">週日–週六 · 點選任一日期即可跳至該週及上一週</p>
                </div>
                <DayPickerCalendar
                  mode="single"
                  required
                  weekStartsOn={0}
                  numberOfMonths={2}
                  selected={parseLocalDateStr(weekWindow.later.end)}
                  onDayClick={(date, modifiers) => {
                    if (modifiers.disabled) return;
                    applyWeekFromDate(date);
                  }}
                  defaultMonth={parseLocalDateStr(weekWindow.windowStart)}
                  disabled={{ after: addCalendarDays(parseLocalDateStr(currentWeekSunday), 6) }}
                  modifiers={{ weekRange: weekPickerRange }}
                  modifiersClassNames={{ weekRange: 'bg-teal-100 text-teal-900' }}
                />
                <div className="flex items-center justify-between gap-2 px-3 pb-3">
                  <button type="button" className="text-[12px] text-teal-700 hover:underline" onClick={resetToCurrentWeeks}>重設為本週及上週</button>
                  <button type="button" className="text-[12px] text-muted-foreground hover:text-[#0d1a2d]" onClick={() => setWeekPickerOpen(false)}>關閉</button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => shiftWeekWindow(1)}
              disabled={isCurrentWeekWindow}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="下一週"
            >
              <ChevronRight size={16} />
            </button>
            {!isCurrentWeekWindow && (
              <button type="button" onClick={resetToCurrentWeeks} className="text-[12px] text-teal-700 hover:underline">回到本週</button>
            )}
          </div>

          <div className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-2 mb-2 items-start">
            <span />
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
              {['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="pt-1 leading-tight">
              <div className="text-[12px] font-semibold text-muted-foreground">{isCurrentWeekWindow ? '上週' : '前週'}</div>
              <div className="text-[10px] text-muted-foreground">{formatCompactWeekLabel(weekWindow.earlier.start, weekWindow.earlier.end)}</div>
            </div>
            <div className={cn('grid grid-cols-7 gap-1.5', isLoadingDbReports && 'opacity-50 pointer-events-none')}>
              {earlierWeekDates.map(renderDateCard)}
            </div>
            <div className="pt-1 leading-tight">
              <div className="text-[12px] font-semibold text-teal-700">{isCurrentWeekWindow ? '本週' : '該週'}</div>
              <div className="text-[10px] text-muted-foreground">{formatCompactWeekLabel(weekWindow.later.start, weekWindow.later.end)}</div>
            </div>
            <div className={cn('grid grid-cols-7 gap-1.5', isLoadingDbReports && 'opacity-50 pointer-events-none')}>
              {laterWeekDates.map(renderDateCard)}
            </div>
          </div>

          {isLoadingDbReports && (
            <div className="flex items-center justify-center py-2">
              <Loader2 size={16} className="animate-spin text-teal-600 mr-2" />
              <span className="text-[14px] text-muted-foreground">載入匯報狀態...</span>
            </div>
          )}

          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/30 text-[13px]">
            <span className="text-muted-foreground">
              兩週完成率：<strong className="text-teal-700">{completedDays.filter(d => workdays.some(w => w.date === d.date)).length}/{workdays.length}</strong> 工作日
            </span>
            <span className="text-muted-foreground">
              累計：<strong className="text-teal-700">{totalReportedHours}h</strong>
            </span>
            <span className="text-muted-foreground">
              已完成：<strong className="text-teal-700">{completedDays.length}</strong>
            </span>
            {incompleteDays.length > 0 && (
              <span className="text-amber-600 font-medium">{incompleteDays.length} 天未完成</span>
            )}
            {missingDays.length > 0 && (
              <span className="text-rose-500 font-medium">⚠️ {missingDays.length} 天未匯報</span>
            )}
          </div>

          {(selectedDateIsSat || selectedDateIsSun) && (
            <div className={cn(
              'mt-2.5 px-3 py-2 rounded-md text-[14px] font-medium flex items-center gap-2',
              selectedDateIsSun ? 'bg-gray-50 text-gray-600 border border-gray-200' :
                'bg-amber-50 text-amber-700 border border-amber-200',
            )}>
              <AlertTriangle size={12} />
              {selectedDateIsSat && `${formatDateShort(selectedDate)} 為星期六，此日工作可如常匯報（無最低工時要求）`}
              {selectedDateIsSun && `${formatDateShort(selectedDate)} 為星期日，此日工作全部計為加班（OT）`}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-teal-600" />
              <span className="text-[14px] font-bold text-foreground">當日任務</span>
              <span className="text-[13px] text-muted-foreground">{formatDateShort(selectedDate)}</span>
            </div>
            {savedEntries.length > 0 && (
              <span className="text-[13px] text-teal-700 font-medium">{savedEntries.length} 項 · {totalHours}h</span>
            )}
          </div>
          {isLoadingExisting ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-teal-600 mr-2" />
              <span className="text-[14px] text-muted-foreground">載入當日任務...</span>
            </div>
          ) : !existingReportId ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">此日沒有匯報記錄。再點一次日期即可重新建立。</p>
          ) : savedEntries.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">此日尚未新增任務</p>
          ) : (
            <div className="space-y-2">
              {savedEntries.map((entry) => {
                const config = categoryLookup[entry.category] || {
                  bg: 'bg-gray-50',
                  color: 'text-gray-600',
                  icon: '📋',
                  label: entry.category,
                };
                const editing = editingEntryId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5 rounded-lg border',
                      editing ? 'border-teal-300 bg-teal-50/40' : 'border-border/60 bg-white',
                    )}
                  >
                    <span className={cn('text-[12px] px-1.5 py-0.5 rounded shrink-0 mt-0.5', config.bg, config.color)}>
                      {config.icon} {config.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-foreground truncate">
                        {entry.relatedName || '—'} · {entry.hours}h
                      </p>
                      <p className="text-[12px] text-muted-foreground truncate">{entry.title || '未命名任務'}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditEntry(entry)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[13px] text-teal-700 hover:bg-teal-50"
                      >
                        <Pencil size={12} /> 編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteEntry(entry)}
                        disabled={isDeletingEntryId === entry.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[13px] text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {isDeletingEntryId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        刪除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {recentFrequentItems.length > 0 && (
          <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles size={14} className="text-amber-500" />
              <span className="text-[14px] font-bold text-foreground">常用匯報項目</span>
              <span className="text-[13px] text-muted-foreground">（根據你的歷史匯報自動推薦，點擊填入下方表單）</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {recentFrequentItems.map((item) => {
                const config = categoryLookup[item.category] || {
                  bg: 'bg-gray-50',
                  color: 'text-gray-600',
                  icon: '📋',
                  label: item.category,
                };
                const systemLabel = item.relatedName?.trim() ? item.relatedName : 'N/A';
                const isNoRelation = resolveRelationType(item.category) === 'none' || systemLabel === 'N/A';
                return (
                  <button
                    key={`${item.relatedId || 'none'}__${item.category}`}
                    type="button"
                    onClick={() => {
                      const relatedId = isNoRelation ? '' : item.relatedId;
                      const relatedName = isNoRelation ? '' : item.relatedName;
                      fillForm({
                        ...createBlankForm(),
                        category: item.category,
                        relatedId,
                        relatedName,
                        title: relatedName,
                        hours: Math.round((item.totalHours / item.count) * 2) / 2,
                      });
                    }}
                    className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-left transition-all hover:shadow-sm hover:scale-[1.01] bg-white border-border/60 hover:border-teal-300 hover:bg-teal-50/20"
                  >
                    <span className={cn('text-[12px] px-1.5 py-0.5 rounded shrink-0 mt-0.5', config.bg, config.color)}>{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-foreground truncate">{config.label}</div>
                      <div className="text-[12px] text-muted-foreground truncate">{systemLabel} · {item.count}次 · {item.totalHours}h</div>
                    </div>
                    <Plus size={12} className="text-teal-500 shrink-0 mt-1" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-border/60 shrink-0">
              <span className="text-[14px] font-medium text-muted-foreground">{formatDateShort(selectedDate)}</span>
              {selectedDateIsSun && <span className="text-[12px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">OT 日</span>}
              {selectedDateIsSat && <span className="text-[12px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">星期六</span>}
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border-2 border-rose-300 flex-wrap min-w-0">
              <span className="text-[13px] font-semibold text-rose-700 shrink-0">目標工時：</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { id: 'full' as const, label: `全日 (${fullDayHours === 7.5 ? '7.5' : '8'}h)` },
                  { id: 'half' as const, label: '半日 (4h)' },
                  { id: 'custom' as const, label: '自訂工作時數' },
                  { id: 'off' as const, label: '放假 (0h)' },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => applyHoursPreset(opt.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[13px] font-medium border transition-all',
                      hoursPreset === opt.id
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
                {hoursPreset === 'custom' && (
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="16"
                    value={targetHours || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setHoursPreset('custom');
                      setTargetHours(isNaN(val) ? 0 : Math.round(val * 2) / 2);
                    }}
                    className="w-16 px-2 py-1 border border-rose-200 rounded-md text-[13px] bg-white"
                  />
                )}
                {targetHoursDirty && existingReportId && (
                  <button
                    type="button"
                    onClick={() => void handleUpdateTargetHours()}
                    disabled={isUpdatingHours}
                    className="px-2.5 py-1 rounded-md text-[13px] font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {isUpdatingHours ? '更新中...' : '更新'}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-border/60">
              <span className="text-[13px] text-muted-foreground">已填</span>
              <span className={cn(
                'text-[16px] font-bold',
                hoursMatch || isDayOff ? 'text-teal-600' :
                  totalHours > 0 ? 'text-rose-500' : 'text-gray-400',
              )}>
                {totalHours}h
                {!isDayOff && (isOT || (selectedDateIsSun && totalHours > 0)) && (
                  <span className="text-[13px] font-normal ml-1">
                    OT {selectedDateIsSun ? `+${totalHours}h` : `+${otHours}h`}
                  </span>
                )}
              </span>
              {!isDayOff && (
                <div className="w-24 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      hoursMatch ? 'bg-teal-500' :
                        selectedDateIsSun ? 'bg-amber-500' :
                          isOT ? 'bg-amber-500' :
                            totalHours >= targetHours ? 'bg-teal-500' : 'bg-rose-400',
                    )}
                    style={{ width: `${Math.min((totalHours / Math.max(targetHours, 1)) * 100, 100)}%` }}
                  />
                </div>
              )}
              {!isDayOff && !hoursMatch && totalHours > 0 && (
                <span className="text-[13px] text-rose-500 font-medium">
                  {totalHours < targetHours ? `差 ${(targetHours - totalHours).toFixed(1)}h` : `超出 ${(totalHours - targetHours).toFixed(1)}h`}
                </span>
              )}
              {isDayOff && <span className="text-[13px] text-slate-600 font-medium">放假日</span>}
              {aiUsedInEntries && (
                <span className="flex items-center gap-1 text-[13px] px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                  <Bot size={11} /> AI 輔助
                </span>
              )}
            </div>

            {existingReportId && !isTodaySelected && (
              <button
                type="button"
                onClick={() => void handleDeleteReport()}
                disabled={isDeleting}
                title="刪除整份匯報"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[14px] font-medium transition-all',
                  isDeleting
                    ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-rose-600 border-rose-300 hover:bg-rose-50 hover:border-rose-400',
                )}
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {isDeleting ? '刪除中...' : '刪除匯報'}
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 text-[14px] font-medium text-muted-foreground shrink-0">
                <Zap size={11} className="text-amber-500" />快速填入：
              </span>
              {QUICK_TEMPLATES.map((tpl, idx) => {
                const config = categoryLookup[tpl.category];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => fillForm({
                      ...createBlankForm(),
                      category: tpl.category,
                      relatedName: tpl.relatedName,
                      title: tpl.title,
                      hours: tpl.hours,
                    })}
                    className={cn(
                      'flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[14px] hover:shadow-sm transition-all',
                      config?.bg, config?.color, 'border-current/20 hover:scale-[1.02]',
                    )}
                  >
                    <span>{config?.icon}</span>
                    <span className="font-medium">{tpl.title}</span>
                    <span className="opacity-60">+</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border/60 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-bold text-teal-600 uppercase tracking-wide flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-[14px]">
                  {editingEntryId ? <Pencil size={12} /> : <Plus size={12} />}
                </span>
                {editingEntryId ? '編輯任務' : '新增任務'}
              </span>
              {editingEntryId && (
                <button type="button" onClick={resetForm} className="text-[13px] text-muted-foreground hover:text-foreground">
                  取消編輯
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
              <div className="lg:col-span-2">
                <label className="text-[13px] font-semibold text-muted-foreground block mb-1">工作類別 *</label>
                <select
                  value={form.category}
                  onChange={(e) => {
                    const newCategory = e.target.value;
                    const nextRelation = newCategory
                      ? (dynamicTypes.find(t => t.id === newCategory)?.relationType
                        ?? defaultCategoryRelationMap[newCategory as WorkCategory]
                        ?? 'none')
                      : 'none';
                    setForm(prev => ({
                      ...prev,
                      category: newCategory,
                      relatedId: !newCategory || nextRelation === 'none' ? '' : prev.relatedId,
                      relatedName: !newCategory || nextRelation === 'none' ? '' : prev.relatedName,
                    }));
                  }}
                  className="w-full px-2.5 py-2 border border-border rounded-md text-[15px] bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-400 transition-all"
                >
                  <option value="">選擇類別...</option>
                  {(dynamicTypes.length > 0
                    ? dynamicTypes.filter(t => t.isActive)
                    : Object.entries(categoryConfig).map(([k, v]) => ({ id: k, icon: v.icon, label: v.label }))
                  ).map(t => (<option key={t.id} value={t.id}>{t.icon} {t.label}</option>))}
                </select>
              </div>
              <div className="lg:col-span-2">
                {(() => {
                  const required = isRelationRequired(formRelationType);
                  const label =
                    formRelationType === 'none' ? '關聯項目'
                    : formRelationType === 'optional' ? '關聯項目（選填）'
                    : formRelationType === 'webandsystem' ? '關聯網站/系統 *'
                    : formRelationType === 'quotation_client' ? '關聯客戶項目 *'
                    : formRelationType === 'vchannel' ? '關聯影片頻道 *'
                    : '關聯項目 *';
                  const placeholder =
                    formRelationType === 'optional' ? '可選：搜尋任一類型項目...'
                    : formRelationType === 'webandsystem' ? '搜尋網站/系統...'
                    : formRelationType === 'quotation_client' ? '搜尋客戶項目...'
                    : formRelationType === 'vchannel' ? '搜尋影片頻道...'
                    : '搜尋項目...';
                  return (
                    <>
                      <label className="text-[13px] font-semibold text-muted-foreground block mb-1">{label}</label>
                      {formRelationType === 'none' ? (
                        <SearchableProjectSelect items={[]} value="" onChange={() => {}} disabled={true} />
                      ) : (
                        <SearchableProjectSelect
                          items={getRelatedItemsForRelation(formRelationType)}
                          value={form.relatedId}
                          onChange={(id, name) => {
                            setForm(prev => ({ ...prev, relatedId: id, relatedName: name }));
                          }}
                          disabled={!form.category}
                          placeholder={placeholder}
                          className={required && !form.relatedId ? 'border-amber-200 bg-amber-50/20' : undefined}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="lg:col-span-1">
                <label className="text-[13px] font-semibold text-muted-foreground block mb-1">工時(h) *</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={form.hours || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateForm('hours', isNaN(val) ? 0 : Math.round(val * 2) / 2);
                  }}
                  className="w-full px-2.5 py-2 border border-border rounded-md text-[15px]"
                  placeholder="0"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="text-[13px] font-semibold text-muted-foreground block mb-1">工作內容 *</label>
                <textarea
                  value={form.title}
                  onChange={(e) => updateForm('title', e.target.value)}
                  rows={3}
                  className="w-full px-2.5 py-2 border border-border rounded-md text-[15px] resize-y leading-relaxed"
                  placeholder="簡述工作內容...（可換行）"
                />
              </div>
            </div>

            <div className="mb-3 p-3 rounded-md bg-purple-50/50 border border-purple-100">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Bot size={13} className="text-purple-600" />
                <span className="text-[14px] font-bold text-purple-700">AI 工具</span>
              </div>
              <div className="mb-2">
                <span className="text-[13px] font-semibold text-purple-600 block mb-1.5">1. 文案工具：</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {['Perplexity', 'Grok', 'Gemini', 'Deepseek', '豆包', 'Claude', 'GPT', 'Skywork'].map((tool) => (
                    <label key={tool} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.aiToolsV2.copywriting.includes(tool)}
                        onChange={(e) => {
                          const tools = e.target.checked
                            ? [...form.aiToolsV2.copywriting, tool]
                            : form.aiToolsV2.copywriting.filter(t => t !== tool);
                          updateForm('aiToolsV2', { ...form.aiToolsV2, copywriting: tools });
                        }}
                        className="rounded w-3 h-3 accent-purple-500"
                      />
                      <span className="text-[13px] text-purple-700">{tool}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.aiToolsV2.copywriting.includes('其他')}
                      onChange={(e) => {
                        const tools = e.target.checked
                          ? [...form.aiToolsV2.copywriting, '其他']
                          : form.aiToolsV2.copywriting.filter(t => t !== '其他');
                        updateForm('aiToolsV2', {
                          ...form.aiToolsV2,
                          copywriting: tools,
                          copywritingOther: e.target.checked ? form.aiToolsV2.copywritingOther : '',
                        });
                      }}
                      className="rounded w-3 h-3 accent-purple-500"
                    />
                    <span className="text-[13px] text-purple-700">其他:</span>
                  </label>
                  {form.aiToolsV2.copywriting.includes('其他') && (
                    <input
                      value={form.aiToolsV2.copywritingOther}
                      onChange={(e) => {
                        if (e.target.value.length <= 30) {
                          updateForm('aiToolsV2', { ...form.aiToolsV2, copywritingOther: e.target.value });
                        }
                      }}
                      className="px-2 py-0.5 border border-purple-200 rounded text-[13px] w-28 bg-white"
                      placeholder="自定義工具..."
                      maxLength={30}
                    />
                  )}
                </div>
              </div>
              <div className="mb-2">
                <span className="text-[13px] font-semibold text-purple-600 block mb-1.5">2. 圖片工具：</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {['Magnific(Freepik)', 'Genspark (Image2)', 'Gemini (Nano banana)', 'Skywork'].map((tool) => (
                    <label key={tool} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.aiToolsV2.image.includes(tool)}
                        onChange={(e) => {
                          const tools = e.target.checked
                            ? [...form.aiToolsV2.image, tool]
                            : form.aiToolsV2.image.filter(t => t !== tool);
                          updateForm('aiToolsV2', { ...form.aiToolsV2, image: tools });
                        }}
                        className="rounded w-3 h-3 accent-purple-500"
                      />
                      <span className="text-[13px] text-purple-700">{tool}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.aiToolsV2.image.includes('其他')}
                      onChange={(e) => {
                        const tools = e.target.checked
                          ? [...form.aiToolsV2.image, '其他']
                          : form.aiToolsV2.image.filter(t => t !== '其他');
                        updateForm('aiToolsV2', {
                          ...form.aiToolsV2,
                          image: tools,
                          imageOther: e.target.checked ? form.aiToolsV2.imageOther : '',
                        });
                      }}
                      className="rounded w-3 h-3 accent-purple-500"
                    />
                    <span className="text-[13px] text-purple-700">其他:</span>
                  </label>
                  {form.aiToolsV2.image.includes('其他') && (
                    <input
                      value={form.aiToolsV2.imageOther}
                      onChange={(e) => {
                        if (e.target.value.length <= 30) {
                          updateForm('aiToolsV2', { ...form.aiToolsV2, imageOther: e.target.value });
                        }
                      }}
                      className="px-2 py-0.5 border border-purple-200 rounded text-[13px] w-28 bg-white"
                      placeholder="自定義工具..."
                      maxLength={30}
                    />
                  )}
                </div>
              </div>
              <div>
                <span className="text-[13px] font-semibold text-purple-600 block mb-1.5">3. 影片工具：</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {['Capcut', 'Seedance', 'Kling', 'Magnific AI'].map((tool) => (
                    <label key={tool} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.aiToolsV2.video.includes(tool)}
                        onChange={(e) => {
                          const tools = e.target.checked
                            ? [...form.aiToolsV2.video, tool]
                            : form.aiToolsV2.video.filter(t => t !== tool);
                          updateForm('aiToolsV2', { ...form.aiToolsV2, video: tools });
                        }}
                        className="rounded w-3 h-3 accent-purple-500"
                      />
                      <span className="text-[13px] text-purple-700">{tool}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.aiToolsV2.video.includes('其他')}
                      onChange={(e) => {
                        const tools = e.target.checked
                          ? [...form.aiToolsV2.video, '其他']
                          : form.aiToolsV2.video.filter(t => t !== '其他');
                        updateForm('aiToolsV2', {
                          ...form.aiToolsV2,
                          video: tools,
                          videoOther: e.target.checked ? form.aiToolsV2.videoOther : '',
                        });
                      }}
                      className="rounded w-3 h-3 accent-purple-500"
                    />
                    <span className="text-[13px] text-purple-700">其他:</span>
                  </label>
                  {form.aiToolsV2.video.includes('其他') && (
                    <input
                      value={form.aiToolsV2.videoOther}
                      onChange={(e) => {
                        if (e.target.value.length <= 30) {
                          updateForm('aiToolsV2', { ...form.aiToolsV2, videoOther: e.target.value });
                        }
                      }}
                      className="px-2 py-0.5 border border-purple-200 rounded text-[13px] w-28 bg-white"
                      placeholder="自定義工具..."
                      maxLength={30}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-border/30">
              <span className="text-[14px] font-bold text-teal-700 shrink-0">📌 成果：</span>
              <select
                value={form.outcomeType}
                onChange={(e) => updateForm('outcomeType', e.target.value as OutcomeType | '')}
                className="px-2.5 py-1.5 border border-border rounded-md text-[15px] bg-white w-32"
              >
                <option value="">類型...</option>
                {Object.entries(outcomeTypeConfigV2).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
              {form.outcomeType === 'url' && (
                <div className="flex-1 flex flex-col gap-1">
                  <input
                    value={form.outcomeUrl}
                    onChange={(e) => updateForm('outcomeUrl', e.target.value)}
                    className={cn(
                      'flex-1 w-full px-2.5 py-1.5 border rounded-md text-[15px]',
                      formHasAsana ? 'border-rose-400 bg-rose-50' : 'border-border',
                    )}
                    placeholder="輸入成果URL連結，不要貼上ASANA 連結"
                  />
                  {formHasAsana && (
                    <span className="text-[12px] text-rose-600">不允許貼上 Asana 連結，請改用其他成果連結。</span>
                  )}
                </div>
              )}
              {form.outcomeType === 'image' && (
                <div className="flex-1">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif"
                    multiple
                    className="hidden"
                    onChange={e => handleImageFileSelect(e.target.files)}
                    onClick={e => { (e.target as HTMLInputElement).value = ''; }}
                  />
                  <div
                    className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/30 transition-colors select-none bg-white"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Upload size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-[13px] text-muted-foreground">
                      點擊上傳圖片（PNG / JPG / WEBP / AVIF，每張≤5MB，最多5張）
                    </span>
                    {((form.outcomeImageFiles?.length || 0) + form.outcomeImages.length) > 0 && (
                      <span className="ml-auto text-[12px] font-medium text-teal-600 shrink-0">
                        {(form.outcomeImageFiles?.length || 0) + form.outcomeImages.length} / {MAX_IMAGES_PER_ENTRY}
                      </span>
                    )}
                  </div>
                  {(form.outcomeImages.length > 0 || (form.outcomeImageFiles?.length || 0) > 0) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.outcomeImages.map((url, imgIdx) => (
                        <div key={`existing-${imgIdx}`} className="relative group w-16 h-16">
                          <img src={url} alt="" className="w-16 h-16 object-cover rounded border border-border" />
                          <button
                            type="button"
                            onClick={() => updateForm('outcomeImages', form.outcomeImages.filter((_, i) => i !== imgIdx))}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={9} />
                          </button>
                        </div>
                      ))}
                      {(form.outcomeImageFiles || []).map((file, fileIdx) => (
                        <div key={`new-${fileIdx}`} className="relative group w-16 h-16">
                          <img src={URL.createObjectURL(file)} alt="" className="w-16 h-16 object-cover rounded border border-teal-300" />
                          <div className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/40 text-white rounded-b truncate px-0.5">新</div>
                          <button
                            type="button"
                            onClick={() => updateForm('outcomeImageFiles', (form.outcomeImageFiles || []).filter((_, i) => i !== fileIdx))}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={9} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {form.outcomeType === 'growth_experience' && (
                <input
                  value={form.growthExperience}
                  onChange={(e) => updateForm('growthExperience', e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-border rounded-md text-[15px]"
                  placeholder="描述成長經驗與技能提升..."
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-border/40 bg-white rounded-lg px-5 py-4 border border-border/60 shadow-sm sticky bottom-0">
            {formError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[14px] font-medium">
                <AlertTriangle size={12} />
                {formError}
              </div>
            )}
            {currentStaffId && (
              <div className="text-[13px] text-muted-foreground">
                提交者：<span className="font-medium text-teal-700">{currentStaffName || currentStaffId}</span>
              </div>
            )}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => void handleSaveTask()}
                disabled={!canSaveTask || (isReportComplete && !editingEntryId)}
                className={cn(
                  'px-6 py-2.5 rounded-md text-[16px] font-medium text-white active:scale-[0.97] transition-all shadow-sm flex items-center gap-2',
                  isReportComplete && !editingEntryId
                    ? 'bg-green-600 text-white opacity-50 cursor-not-allowed shadow-none'
                    : canSaveTask
                      ? 'bg-teal-600 hover:bg-teal-700'
                      : 'bg-gray-300 cursor-not-allowed',
                )}
              >
                {isSavingTask && <Loader2 size={14} className="animate-spin" />}
                {isSavingTask
                  ? '儲存中...'
                  : editingEntryId
                    ? '更新任務'
                    : isReportComplete
                      ? '工作匯報已完成'
                      : '新增任務'}
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
