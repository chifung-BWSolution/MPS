import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Check, X, AlertTriangle, ChevronLeft, ChevronRight, Link, Sparkles, Clock, Users, BarChart3, Calendar, FileText, Zap, Bot, Trash2, RefreshCw, Eye, MapPin, CalendarDays, Loader2, Shield, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  dailyReportsV2,
  staffMembersV2,
  categoryConfig,
  outcomeTypeConfigV2,
  getTopProjectsByHoursV2,
  getAutoPullData,
  WorkCategory,
  OutcomeType,
  AITool,
} from '@/data/dayReportDataV2';
import { WorkCategoriesManager, defaultCategoryRelationMap } from '@/components/day-report/WorkCategoriesManager';
import { HolidaySettings } from '@/components/day-report/HolidaySettings';
import { TeamDashboard } from '@/components/day-report/TeamDashboard';
import { SearchableProjectSelect } from '@/components/day-report/SearchableProjectSelect';
import { useDataStore } from '@/context/DataStore';
import { useDayReportTypes } from '@/hooks/useDayReportTypes';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';

// ============================
// Office Location & Holiday Config
// ============================
type OfficeLocation = 'hk' | 'sz';

// HK Public Holidays 2025 (key dates)
const hkPublicHolidays2025 = [
  '2025-01-01', // New Year
  '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', // CNY
  '2025-04-04', // Ching Ming
  '2025-04-18', '2025-04-19', // Good Friday + Saturday
  '2025-04-21', // Easter Monday
  '2025-05-01', // Labour Day
  '2025-05-05', // Buddha's Birthday
  '2025-05-31', // Tuen Ng
  '2025-07-01', // HKSAR Day
  '2025-10-01', // National Day
  '2025-10-07', // Chung Yeung
  '2025-12-25', '2025-12-26', // Christmas
];

// Shenzhen/China Public Holidays 2025 (key dates)
const szPublicHolidays2025 = [
  '2025-01-01', // New Year
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04', // CNY extended
  '2025-04-04', '2025-04-05', '2025-04-06', // Qingming
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05', // Labour Day extended
  '2025-05-31', '2025-06-01', '2025-06-02', // Dragon Boat
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', // National Day
];

function getPublicHolidays(office: OfficeLocation): string[] {
  return office === 'hk' ? hkPublicHolidays2025 : szPublicHolidays2025;
}

function isPublicHoliday(dateStr: string, office: OfficeLocation): boolean {
  return getPublicHolidays(office).includes(dateStr);
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}

function isSaturday(dateStr: string): boolean {
  return new Date(dateStr).getDay() === 6;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ============================
// Submit Report Page (Redesigned)
// ============================
function SubmitReportPage() {
  const { projects } = useDataStore();
  const { profiles: websites } = useWebsiteProfiles();
  const { types: dynamicTypes } = useDayReportTypes();
  const [office, setOffice] = useState<OfficeLocation>('hk');
  
  // Date selection (single date, up to 14 days back) — always based on NOW (local date)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    // Use local date (not UTC) to match user's calendar expectation
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  // AI Tools category structure
  interface AiToolsSelection {
    copywriting: string[]; // selected tools from category 1
    copywritingOther: string; // custom text for 其他
    image: string[]; // selected tools from category 2
    imageOther: string; // custom text for 其他
    video: string[]; // selected tools from category 3
    videoOther: string; // custom text for 其他
  }
  const emptyAiTools: AiToolsSelection = { copywriting: [], copywritingOther: '', image: [], imageOther: '', video: [], videoOther: '' };

  // Authenticated user — needed early so the saved-templates storage key can
  // be scoped per-user (see SavedTemplate state below).
  const { systemUser } = useAuth();

  // Work entries
  const [entries, setEntries] = useState<Array<{
    category: WorkCategory | '';
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
  }>>([{ category: '', relatedId: '', relatedName: '', title: '', hours: 0, outcomeType: '', outcomeUrl: '', outcomeImages: [], growthExperience: '', isAiAssisted: false, aiTools: [], aiToolsV2: { ...emptyAiTools } }]);

  // User-saved 常用匯報項目 templates — backed by Supabase
  // public.user_report_templates so they follow the user across devices.
  // Each row stores a full work-entry snapshot and is keyed by the user's
  // lowercased email; we filter reads/writes by that on the client (RLS is
  // permissive for authenticated users, mirroring confirmed_artist).
  type SavedTemplate = {
    id: string;
    label: string;       // shown in the chip; falls back to title or category
    entry: typeof entries[number];
    createdAt: string;
  };
  const ownerEmail = useMemo(
    () => (systemUser?.email || '').toLowerCase().trim(),
    [systemUser?.email],
  );
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);

  // Load templates whenever the authenticated identity changes.
  useEffect(() => {
    let cancelled = false;
    if (!ownerEmail) {
      setSavedTemplates([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('user_report_templates')
        .select('id, label, entry, created_at')
        .eq('owner_email', ownerEmail)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        console.warn('[SubmitReport] load saved templates failed:', error.message);
        setSavedTemplates([]);
        return;
      }
      setSavedTemplates(
        (data || []).map(r => ({
          id: r.id as string,
          label: r.label as string,
          entry: r.entry as SavedTemplate['entry'],
          createdAt: r.created_at as string,
        })),
      );
    })();
    return () => { cancelled = true; };
  }, [ownerEmail]);

  const [targetHours, setTargetHours] = useState<number>(8);
  const [underHoursReason, setUnderHoursReason] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingReportId, setExistingReportId] = useState<string | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const isUpdateMode = !!existingReportId;

  // Reactive helper: get related items for a work category from DataStore (live data)
  const getRelatedItemsLive = useCallback((category: WorkCategory): { id: string; name: string }[] => {
    switch (category) {
      case 'website_design':
      case 'website_dev':
      case 'article_writing':
      case 'video_shooting':
      case 'video_editing':
      case 'social_media':
      case 'edm':
      case 'paid_ads':
      case 'seo':
      case 'graphic_design':
        return websites.map(ws => ({ id: ws.id, name: ws.websiteName }));
      case 'client_meeting':
        return projects.map(p => ({ id: p.id, name: p.name }));
      case 'internal_meeting':
      case 'training':
      default:
        return projects.map(p => ({ id: p.id, name: p.name }));
    }
  }, [websites, projects]);

  // Current staff — derived from the authenticated user resolved above
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);
  const [currentStaffName, setCurrentStaffName] = useState<string>('');

  // Database reports for the 14-day window (to show reported status)
  const [dbReports, setDbReports] = useState<Array<{ report_date: string; total_hours: number; status: string }>>([]);
  const [isLoadingDbReports, setIsLoadingDbReports] = useState(true);

  // Set current staff from authenticated user. If bubble_staff_id is a placeholder
  // (e.g. 'manual_super_admin_*' fallback), resolve the real ID from staff_directory by email.
  useEffect(() => {
    let aborted = false;
    async function resolveStaffId() {
      if (!systemUser) return;
      setCurrentStaffName(systemUser.display_name);
      const id = systemUser.bubble_staff_id || '';
      const looksPlaceholder = !id || id.startsWith('manual_') || id.startsWith('ui_');
      if (!looksPlaceholder) {
        setCurrentStaffId(id);
        return;
      }
      // Try email-based lookup in staff_directory
      const email = (systemUser.email || '').toLowerCase().trim();
      if (!email) {
        setCurrentStaffId(id || null);
        return;
      }
      const { data } = await supabase
        .from('staff_directory')
        .select('bubble_staff_id')
        .ilike('work_email', email)
        .limit(1)
        .maybeSingle();
      if (aborted) return;
      const realId = data?.bubble_staff_id || id || null;
      console.log('[SubmitReport] resolved staff_id:', realId, '(was placeholder:', id, ')');
      setCurrentStaffId(realId);
    }
    resolveStaffId();
    return () => { aborted = true; };
  }, [systemUser]);

  // Fetch user's office from staff_directory to auto-set office location & target hours
  useEffect(() => {
    async function initOfficeFromProfile() {
      if (!systemUser?.bubble_staff_id) return;
      try {
        const { data: staffRow, error } = await supabase
          .from('staff_directory')
          .select('office')
          .eq('bubble_staff_id', systemUser.bubble_staff_id)
          .maybeSingle();

        if (error) {
          console.error('[SubmitReport] Error fetching staff office:', error);
          // Fallback to HK defaults
          setOffice('hk');
          setTargetHours(8);
          return;
        }

        const officeValue = staffRow?.office?.trim() || '';
        console.log('[SubmitReport] Staff office from DB:', officeValue);

        if (officeValue === '深圳') {
          setOffice('sz');
          setTargetHours(7.5);
        } else {
          // "香港" or any unexpected/empty value → default to HK
          setOffice('hk');
          setTargetHours(8);
        }
      } catch (err) {
        console.error('[SubmitReport] Exception fetching staff office:', err);
        // Graceful fallback
        setOffice('hk');
        setTargetHours(8);
      }
    }

    initOfficeFromProfile();
  }, [systemUser?.bubble_staff_id]);

  // Load existing day_reports for this staff in the 14-day window
  const loadDbReports = useCallback(async () => {
    if (!currentStaffId) {
      setIsLoadingDbReports(false);
      return;
    }
    setIsLoadingDbReports(true);
    try {
      const today = new Date();
      const fourteenDaysAgo = new Date(today);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
      // Use local dates to match user's calendar
      const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const startStr = toLocalDateStr(fourteenDaysAgo);
      const endStr = toLocalDateStr(today);

      console.log('[SubmitReport] Loading dbReports for staff:', currentStaffId, 'range:', startStr, '->', endStr);

      const { data, error } = await supabase
        .from('day_reports')
        .select('report_date, total_hours, status')
        .eq('staff_id', currentStaffId)
        .gte('report_date', startStr)
        .lte('report_date', endStr);

      if (error) {
        console.error('[SubmitReport] Error loading dbReports:', error);
      }

      if (data) {
        // Normalize report_date to YYYY-MM-DD format and total_hours to number
        const normalized = data.map(r => ({
          ...r,
          report_date: r.report_date ? r.report_date.substring(0, 10) : r.report_date,
          total_hours: Number(r.total_hours) || 0,
        }));
        console.log('[SubmitReport] Loaded dbReports:', normalized.length, 'records', normalized);
        setDbReports(normalized);
      } else {
        setDbReports([]);
      }
    } catch (err) {
      console.error('[SubmitReport] Exception loading dbReports:', err);
    } finally {
      setIsLoadingDbReports(false);
    }
  }, [currentStaffId]);

  useEffect(() => {
    loadDbReports();
  }, [loadDbReports]);

  // Load existing report & entries when selectedDate changes (for edit/update mode)
  useEffect(() => {
    let cancelled = false;

    async function loadExistingReport() {
      if (!currentStaffId) {
        setExistingReportId(null);
        return;
      }
      setIsLoadingExisting(true);
      try {
        console.log('[SubmitReport] Loading existing report for date:', selectedDate, 'staff:', currentStaffId);

        // Check if a report exists for this date
        const { data: reportData, error: reportError } = await supabase
          .from('day_reports')
          .select('id, total_hours, target_hours, office_location, under_hours_reason')
          .eq('staff_id', currentStaffId)
          .eq('report_date', selectedDate)
          .maybeSingle();

        if (cancelled) return;

        if (reportError) {
          console.error('[SubmitReport] Error querying existing report:', reportError);
        }

        if (reportData) {
          console.log('[SubmitReport] Found existing report:', reportData.id, 'hours:', reportData.total_hours);
          setExistingReportId(reportData.id);
          if (reportData.target_hours) setTargetHours(Number(reportData.target_hours));
          if (reportData.office_location) setOffice(reportData.office_location as OfficeLocation);
          if (reportData.under_hours_reason) {
            setUnderHoursReason(reportData.under_hours_reason);
          } else {
            setUnderHoursReason('');
          }

          // Load the entries for this report
          const { data: entriesData, error: entriesError } = await supabase
            .from('day_report_entries')
            .select('*')
            .eq('day_report_id', reportData.id)
            .order('sort_order', { ascending: true });

          if (cancelled) return;

          if (entriesError) {
            console.error('[SubmitReport] Error loading entries:', entriesError);
          }

          if (entriesData && entriesData.length > 0) {
            console.log('[SubmitReport] Loaded', entriesData.length, 'entries for report');
            const loadedEntries = entriesData.map((e: any) => ({
              category: (e.category || '') as WorkCategory | '',
              relatedId: e.related_id || '',
              relatedName: e.related_name || '',
              title: e.title || '',
              hours: Number(e.hours) || 0,
              outcomeType: (e.outcome_type || '') as OutcomeType | '',
              outcomeUrl: e.outcome_url || '',
              outcomeImages: e.outcome_images || [],
              growthExperience: e.growth_experience || '',
              isAiAssisted: e.is_ai_assisted || false,
              aiTools: (e.ai_tools || []) as AITool[],
              aiToolsV2: (e.ai_tools_v2 || { ...emptyAiTools }) as AiToolsSelection,
            }));
            setEntries(loadedEntries);
          } else {
            setEntries([{ category: '', relatedId: '', relatedName: '', title: '', hours: 0, outcomeType: '', outcomeUrl: '', outcomeImages: [], growthExperience: '', isAiAssisted: false, aiTools: [], aiToolsV2: { ...emptyAiTools } }]);
          }
        } else {
          // No existing report — reset to blank
          console.log('[SubmitReport] No existing report for date:', selectedDate);
          setExistingReportId(null);
          setEntries([{ category: '', relatedId: '', relatedName: '', title: '', hours: 0, outcomeType: '', outcomeUrl: '', outcomeImages: [], growthExperience: '', isAiAssisted: false, aiTools: [], aiToolsV2: { ...emptyAiTools } }]);
          setUnderHoursReason('');
          setTargetHours(8);
        }
      } catch (err) {
        console.error('[SubmitReport] Error loading existing report:', err);
        if (!cancelled) {
          setExistingReportId(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingExisting(false);
        }
      }
    }
    loadExistingReport();

    return () => { cancelled = true; };
  }, [selectedDate, currentStaffId]);

  // Generate list of available dates (past 14 days) — always relative to real current date
  const availableDates = useMemo(() => {
    const dates: { date: string; label: string; isToday: boolean; isHoliday: boolean; isSat: boolean; isSun: boolean; reported: boolean; reportedHours: number; reportStatus: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      // Use local date string to match report_date format
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Check DB reports — normalize comparison by trimming to YYYY-MM-DD
      const dbReport = dbReports.find(r => {
        const rDate = r.report_date ? r.report_date.substring(0, 10) : '';
        return rDate === dateStr;
      });
      dates.push({
        date: dateStr,
        label: formatDateShort(dateStr),
        isToday: i === 0,
        isHoliday: isPublicHoliday(dateStr, office),
        isSat: isSaturday(dateStr),
        isSun: d.getDay() === 0,
        reported: !!dbReport,
        reportedHours: dbReport ? Number(dbReport.total_hours) || 0 : 0,
        reportStatus: dbReport?.status || '',
      });
    }
    return dates;
  }, [office, dbReports]);

  // Recent frequent items from the user's past reports (for quick selection)
  const recentFrequentItems = useMemo(() => {
    const currentUserId = 'u1'; // mock current user
    const userReports = dailyReportsV2.filter(r => r.userId === currentUserId && !r.isLeave);
    const allEntries = userReports.flatMap(r => r.entries);
    
    // Count frequency of each relatedName + category combo
    const itemMap: Record<string, { relatedId: string; relatedName: string; category: WorkCategory; count: number; lastUsed: string; totalHours: number }> = {};
    allEntries.forEach(entry => {
      if (!entry.relatedName) return;
      const key = `${entry.relatedName}__${entry.category}`;
      if (!itemMap[key]) {
        itemMap[key] = { relatedId: entry.relatedId || '', relatedName: entry.relatedName, category: entry.category, count: 0, lastUsed: entry.createdAt, totalHours: 0 };
      }
      itemMap[key].count += 1;
      itemMap[key].totalHours += entry.hours;
      if (entry.createdAt > itemMap[key].lastUsed) itemMap[key].lastUsed = entry.createdAt;
    });
    
    return Object.values(itemMap).sort((a, b) => b.count - a.count).slice(0, 8);
  }, []);

  const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
  const otHours = Math.max(0, totalHours - 8);
  const isOT = totalHours > 8;
  const selectedDateIsHoliday = isPublicHoliday(selectedDate, office);
  const selectedDateIsSat = isSaturday(selectedDate);
  const selectedDateIsSun = new Date(selectedDate).getDay() === 0;
  
  // On holidays/weekends, minimum hours = 0 (any hours count as OT)
  const isUnderHours = !selectedDateIsHoliday && !selectedDateIsSun && !selectedDateIsSat && totalHours < targetHours && totalHours > 0;
  
  // Cross-field validation: sum of task hours must equal declared target
  const hoursMatch = totalHours === targetHours;
  const canSubmitWork = (
    hoursMatch || 
    (isUnderHours && underHoursReason.length > 0)
  ) && totalHours > 0;
  
  const canSubmit = canSubmitWork;
  
  const aiUsedInEntries = entries.some(e => e.isAiAssisted || e.aiToolsV2.copywriting.length > 0 || e.aiToolsV2.image.length > 0 || e.aiToolsV2.video.length > 0 || !!e.aiToolsV2.copywritingOther || !!e.aiToolsV2.imageOther || !!e.aiToolsV2.videoOther);

  const addEntry = () => {
    setEntries([...entries, { category: '', relatedId: '', relatedName: '', title: '', hours: 0, outcomeType: '', outcomeUrl: '', outcomeImages: [], growthExperience: '', isAiAssisted: false, aiTools: [], aiToolsV2: { ...emptyAiTools } }]);
  };
  const removeEntry = (idx: number) => {
    if (entries.length > 1) setEntries(entries.filter((_, i) => i !== idx));
  };
  const updateEntry = (idx: number, field: string, value: any) => {
    const newEntries = [...entries];
    (newEntries[idx] as any)[field] = value;
    setEntries(newEntries);
  };

  // Snapshot the current row into 常用匯報項目. Skip if the row is essentially
  // empty so users can't accidentally save a blank template. The row is
  // persisted to Supabase, then prepended to local state on success so the
  // UI updates immediately.
  const saveEntryAsTemplate = async (idx: number) => {
    const e = entries[idx];
    if (!e.category && !e.title && !e.relatedName && (!e.hours || e.hours === 0)) {
      alert('請先填寫工作項目內容再儲存。');
      return;
    }
    if (!ownerEmail) {
      alert('未能識別登入帳戶，請重新登入後再試。');
      return;
    }
    const label = (e.title.trim().split('\n')[0] || e.relatedName || categoryConfig[e.category as WorkCategory]?.label || '自訂項目').slice(0, 40);
    const entrySnapshot = { ...e, aiToolsV2: { ...e.aiToolsV2 } };
    const { data, error } = await supabase
      .from('user_report_templates')
      .insert({ owner_email: ownerEmail, label, entry: entrySnapshot })
      .select('id, label, entry, created_at')
      .single();
    if (error || !data) {
      console.error('[SubmitReport] save template failed:', error?.message);
      alert('儲存常用項目失敗，請稍後再試。');
      return;
    }
    setSavedTemplates(prev => [{
      id: data.id as string,
      label: data.label as string,
      entry: data.entry as SavedTemplate['entry'],
      createdAt: data.created_at as string,
    }, ...prev]);
  };

  const removeSavedTemplate = async (id: string) => {
    // Optimistic remove — restore on failure so the user sees the actual state.
    const prev = savedTemplates;
    setSavedTemplates(s => s.filter(t => t.id !== id));
    const { error } = await supabase
      .from('user_report_templates')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[SubmitReport] delete template failed:', error.message);
      alert('移除失敗，請稍後再試。');
      setSavedTemplates(prev);
    }
  };

  // Click a saved chip → drop a fresh row pre-filled with its snapshot. If
  // the first row is still empty we replace it instead of appending so the
  // form stays tidy.
  const applySavedTemplate = (tpl: SavedTemplate) => {
    const newEntry = {
      ...tpl.entry,
      aiToolsV2: { ...tpl.entry.aiToolsV2 },
      outcomeImages: [...(tpl.entry.outcomeImages || [])],
      aiTools: [...(tpl.entry.aiTools || [])],
    };
    const firstEmpty = entries.findIndex(e => !e.category && !e.title && e.hours === 0);
    if (firstEmpty >= 0) {
      const next = [...entries];
      next[firstEmpty] = newEntry;
      setEntries(next);
    } else {
      setEntries([...entries, newEntry]);
    }
  };

  const handleAutoPull = () => {
    setIsPulling(true);
    setTimeout(() => {
      const pullData = getAutoPullData();
      const newEntries = pullData.map(d => ({
        category: d.category || '' as WorkCategory | '',
        relatedId: d.relatedId || '',
        relatedName: d.relatedName || '',
        title: d.title || '',
        hours: d.hours || 0,
        outcomeType: d.outcomeType || '' as OutcomeType | '',
        outcomeUrl: d.outcomeUrl || '',
        outcomeImages: [] as string[],
        growthExperience: '',
        isAiAssisted: false,
        aiTools: [] as AITool[],
        aiToolsV2: { ...emptyAiTools },
      }));
      setEntries([...entries.filter(e => e.category || e.title), ...newEntries]);
      setIsPulling(false);
    }, 800);
  };

  const handleSubmit = async () => {
    if (!currentStaffId) {
      setSubmitError('無法識別當前用戶，請確認員工資料已同步。');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let reportId: string;

      if (existingReportId) {
        // UPDATE existing report
        const { error: updateError } = await supabase
          .from('day_reports')
          .update({
            total_hours: totalHours,
            target_hours: targetHours,
            ot_hours: otHours,
            is_leave: false,
            is_half_day: false,
            office_location: office,
            is_holiday: selectedDateIsHoliday,
            is_weekend: selectedDateIsSat || selectedDateIsSun,
            under_hours_reason: isUnderHours ? underHoursReason : null,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', existingReportId);

        if (updateError) {
          throw new Error(updateError.message);
        }
        reportId = existingReportId;

        // Delete old entries before re-inserting updated ones
        const { error: deleteError } = await supabase
          .from('day_report_entries')
          .delete()
          .eq('day_report_id', existingReportId);

        if (deleteError) {
          throw new Error(deleteError.message);
        }
      } else {
        // INSERT new report
        const { data: reportData, error: reportError } = await supabase
          .from('day_reports')
          .insert({
            staff_id: currentStaffId,
            report_date: selectedDate,
            total_hours: totalHours,
            target_hours: targetHours,
            ot_hours: otHours,
            is_leave: false,
            is_half_day: false,
            office_location: office,
            is_holiday: selectedDateIsHoliday,
            is_weekend: selectedDateIsSat || selectedDateIsSun,
            under_hours_reason: isUnderHours ? underHoursReason : null,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (reportError) {
          throw new Error(reportError.message);
        }
        reportId = reportData.id;
      }

      // Insert all entry records (fresh for both create and update)
      const entryRecords = entries
        .filter(e => e.category && e.hours > 0)
        .map((e, idx) => ({
          day_report_id: reportId,
          staff_id: currentStaffId,
          category: e.category,
          related_id: e.relatedId || null,
          related_name: e.relatedName || null,
          title: e.title || '',
          hours: e.hours,
          outcome_type: e.outcomeType || null,
          outcome_url: e.outcomeUrl || null,
          outcome_images: e.outcomeImages.length > 0 ? e.outcomeImages : null,
          growth_experience: e.growthExperience || null,
          is_ai_assisted: e.aiToolsV2.copywriting.length > 0 || e.aiToolsV2.image.length > 0 || e.aiToolsV2.video.length > 0 || !!e.aiToolsV2.copywritingOther || !!e.aiToolsV2.imageOther || !!e.aiToolsV2.videoOther,
          ai_tools: e.aiTools.length > 0 ? e.aiTools : null,
          ai_tools_v2: (e.aiToolsV2.copywriting.length > 0 || e.aiToolsV2.image.length > 0 || e.aiToolsV2.video.length > 0 || !!e.aiToolsV2.copywritingOther || !!e.aiToolsV2.imageOther || !!e.aiToolsV2.videoOther) ? e.aiToolsV2 : null,
          sort_order: idx,
        }));

      if (entryRecords.length > 0) {
        const { error: entriesError } = await supabase
          .from('day_report_entries')
          .insert(entryRecords);

        if (entriesError) {
          throw new Error(entriesError.message);
        }
      }

      // Success
      setSubmitted(true);
      setExistingReportId(reportId);
      // Refresh the 14-day view
      loadDbReports();
      setTimeout(() => setSubmitted(false), 4000);
    } catch (err: any) {
      setSubmitError(err.message || '提交失敗，請重試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickTemplates = [
    { category: 'website_design' as WorkCategory, title: '網站設計及更新', hours: 2, relatedName: '' },
    { category: 'social_media' as WorkCategory, title: '社媒內容製作', hours: 1.5, relatedName: '' },
    { category: 'video_editing' as WorkCategory, title: '影片剪輯', hours: 3, relatedName: '' },
    { category: 'article_writing' as WorkCategory, title: '文章撰寫', hours: 2, relatedName: '' },
    { category: 'client_meeting' as WorkCategory, title: '客戶會議', hours: 1, relatedName: '' },
    { category: 'paid_ads' as WorkCategory, title: '廣告投放', hours: 1.5, relatedName: '' },
  ];

  // Handle quick template click — auto-fill into an empty entry or add new
  const applyQuickTemplate = (tpl: typeof quickTemplates[0]) => {
    // Check if the first entry is empty (no category set), fill it; otherwise add new
    const firstEmpty = entries.findIndex(e => !e.category && !e.title && e.hours === 0);
    if (firstEmpty >= 0) {
      const newEntries = [...entries];
      newEntries[firstEmpty] = {
        category: tpl.category,
        relatedId: '',
        relatedName: tpl.relatedName,
        title: tpl.title,
        hours: tpl.hours,
        outcomeType: '',
        outcomeUrl: '',
        outcomeImages: [],
        growthExperience: '',
        isAiAssisted: false,
        aiTools: [],
        aiToolsV2: { ...emptyAiTools },
      };
      setEntries(newEntries);
    } else {
      setEntries([...entries, {
        category: tpl.category,
        relatedId: '',
        relatedName: tpl.relatedName,
        title: tpl.title,
        hours: tpl.hours,
        outcomeType: '',
        outcomeUrl: '',
        outcomeImages: [],
        growthExperience: '',
        isAiAssisted: false,
        aiTools: [],
        aiToolsV2: { ...emptyAiTools },
      }]);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
          <Check size={32} className="text-teal-600" />
        </div>
        <h3 className="text-[22px] font-bold text-teal-700">
          匯報已{isUpdateMode ? '更新' : '提交'}！
        </h3>
        <p className="text-[16px] text-muted-foreground">
          {`${formatDateFull(selectedDate)} 的工作匯報已成功${isUpdateMode ? '更新' : '提交'}。`}
        </p>
        {currentStaffName && (
          <p className="text-[14px] text-teal-600">
            提交者：{currentStaffName}
          </p>
        )}
        <button onClick={() => {
          setSubmitted(false);
          setEntries([{ category: '', relatedId: '', relatedName: '', title: '', hours: 0, outcomeType: '', outcomeUrl: '', outcomeImages: [], growthExperience: '', isAiAssisted: false, aiTools: [], aiToolsV2: { ...emptyAiTools } }]);
          setUnderHoursReason('');
          setSubmitError(null);
        }} className="px-4 py-2 rounded-md border border-teal-200 text-teal-700 text-[15px] font-medium hover:bg-teal-50 transition-colors">
          繼續提交新匯報
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: Office Selection & Header */}
      <div className="bg-gradient-to-r from-teal-50/80 to-white rounded-lg border border-teal-100 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            {/* Office Location Toggle */}
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-teal-600" />
              <span className="text-[14px] font-semibold text-teal-700">辦公室：</span>
              <div className="flex items-center gap-0.5 p-0.5 bg-teal-100/60 rounded-md">
                <button 
                  onClick={() => { setOffice('hk'); setTargetHours(8); }} 
                  className={cn('px-3 py-1.5 rounded text-[14px] font-medium transition-all', office === 'hk' ? 'bg-white shadow-sm text-teal-800' : 'text-teal-600 hover:text-teal-800')}
                >
                  🇭🇰 香港
                </button>
                <button 
                  onClick={() => { setOffice('sz'); setTargetHours(7.5); }} 
                  className={cn('px-3 py-1.5 rounded text-[14px] font-medium transition-all', office === 'sz' ? 'bg-white shadow-sm text-teal-800' : 'text-teal-600 hover:text-teal-800')}
                >
                  🇨🇳 深圳
                </button>
              </div>
            </div>
            
            {/* Mode Label */}
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-teal-600" />
              <span className="text-[14px] font-semibold text-teal-700">📝 工作匯報</span>
            </div>
          </div>
          
          <button onClick={handleAutoPull} disabled={isPulling} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-teal-200 bg-white text-teal-700 text-[14px] font-medium hover:bg-teal-50 transition-all disabled:opacity-50">
            <RefreshCw size={12} className={isPulling ? 'animate-spin' : ''} />
            {isPulling ? '拉取中...' : '一鍵拉取工作記錄'}
          </button>
        </div>
        
        <p className="text-[13px] text-teal-600/70 mt-2">
          {office === 'hk' ? '🇭🇰 香港辦公室 · 依據香港公眾假期' : '🇨🇳 深圳辦公室 · 依據中國法定假日'} · 
          可補交過去14天未匯報的工作日（含週六加班）
        </p>
      </div>

      {/* Step 2: Date Selection — 14-Day View */}
        <div className="space-y-3">
          <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={14} className="text-teal-600" />
              <span className="text-[14px] font-bold text-foreground">選擇匯報日期</span>
              <span className="text-[13px] text-muted-foreground">（過去14天匯報情況一覽）</span>
              <div className="ml-auto flex items-center gap-3 text-[13px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> 已報 ≥ 8h</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 已報 &lt; 8h</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> 未匯報</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> 假日/週末</span>
              </div>
            </div>
            
            {/* 14-day grid — 7 per row */}
            <div className={cn("grid grid-cols-7 gap-1.5 mb-2", isLoadingDbReports && "opacity-50 pointer-events-none")}>
              {isLoadingDbReports && (
                <div className="col-span-7 flex items-center justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-teal-600 mr-2" />
                  <span className="text-[14px] text-muted-foreground">載入匯報狀態...</span>
                </div>
              )}
              {availableDates.map((d) => {
                const isWorkday = !d.isHoliday && !d.isSun;
                const needsReport = isWorkday && !d.isSat;
                const isMissing = needsReport && !d.reported && !isLoadingDbReports;
                return (
                  <button
                    key={d.date}
                    onClick={() => setSelectedDate(d.date)}
                    className={cn(
                      'px-1.5 py-2 rounded-lg border text-[13px] font-medium transition-all relative flex flex-col items-center gap-1',
                      selectedDate === d.date 
                        ? 'bg-teal-50 border-teal-400 text-teal-800 shadow-sm ring-2 ring-teal-200' 
                        : d.reported
                          ? 'bg-teal-50/50 border-teal-200 text-teal-700'
                          : d.isHoliday
                            ? 'bg-red-50/40 border-red-200 text-red-600 hover:bg-red-50'
                            : d.isSun
                              ? 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                              : d.isSat
                                ? 'bg-amber-50/30 border-amber-200 text-amber-600 hover:bg-amber-50'
                                : isMissing
                                  ? 'bg-rose-50/40 border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300'
                                  : 'bg-white border-border hover:border-teal-300 hover:bg-teal-50/30'
                    )}
                  >
                    <span className={cn('text-[13px]', d.isToday && 'font-bold')}>{d.label}</span>
                    
                    {/* Status row */}
                    <div className="flex items-center gap-0.5 flex-wrap justify-center min-h-[18px]">
                      {d.isToday && <span className="text-[12px] px-1 py-0 rounded bg-teal-100 text-teal-700 font-semibold">今天</span>}
                      {d.isHoliday && <span className="text-[12px] px-1 py-0 rounded bg-red-100 text-red-600">假日</span>}
                      {d.isSat && !d.isHoliday && <span className="text-[12px] px-1 py-0 rounded bg-amber-100 text-amber-600">六</span>}
                      {d.isSun && !d.isHoliday && <span className="text-[12px] px-1 py-0 rounded bg-gray-100 text-gray-500">日</span>}
                    </div>
                    
                    {/* Hours / Status indicator */}
                    {d.reported ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[15px] font-bold text-teal-600">
                          {d.reportedHours}h
                        </span>
                        <span className="text-[12px] px-1.5 py-0 rounded-full font-medium bg-teal-100 text-teal-700">
                          ✓ 已匯報
                        </span>
                      </div>
                    ) : (d.isHoliday || d.isSun) ? (
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
              })}
            </div>
            
            {/* 14-day summary stats */}
            {(() => {
              const reportedDays = availableDates.filter(d => d.reported);
              const workdays = availableDates.filter(d => !d.isHoliday && !d.isSun && !d.isSat);
              const missingDays = workdays.filter(d => !d.reported);
              const totalReportedHours = reportedDays.reduce((s, d) => s + d.reportedHours, 0);
              return (
                <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/30 text-[13px]">
                  <span className="text-muted-foreground">
                    14天匯報率：<strong className="text-teal-700">{reportedDays.length}/{workdays.length}</strong> 工作日
                  </span>
                  <span className="text-muted-foreground">
                    累計：<strong className="text-teal-700">{totalReportedHours}h</strong>
                  </span>
                  <span className="text-muted-foreground">
                    已匯報：<strong className="text-teal-700">{reportedDays.length}</strong>
                  </span>
                  {missingDays.length > 0 && (
                    <span className="text-rose-500 font-medium">
                      ⚠️ {missingDays.length} 天未匯報
                    </span>
                  )}
                </div>
              );
            })()}
          
            {/* Status info for selected date */}
            {(selectedDateIsHoliday || selectedDateIsSat || selectedDateIsSun) && (
              <div className={cn('mt-2.5 px-3 py-2 rounded-md text-[14px] font-medium flex items-center gap-2',
                selectedDateIsHoliday ? 'bg-red-50 text-red-700 border border-red-200' :
                selectedDateIsSun ? 'bg-gray-50 text-gray-600 border border-gray-200' :
                'bg-amber-50 text-amber-700 border border-amber-200'
              )}>
                <AlertTriangle size={12} />
                {selectedDateIsHoliday && `${formatDateShort(selectedDate)} 為${office === 'hk' ? '香港' : '深圳'}公眾假期，此日工作全部計為加班（OT）`}
                {selectedDateIsSat && !selectedDateIsHoliday && `${formatDateShort(selectedDate)} 為星期六，此日工作可如常匯報（無最低工時要求）`}
                {selectedDateIsSun && !selectedDateIsHoliday && `${formatDateShort(selectedDate)} 為星期日，此日工作全部計為加班（OT）`}
              </div>
            )}
          </div>

          {/* Recent Frequent Items — Quick Add from past reports */}
          {(recentFrequentItems.length > 0 || savedTemplates.length > 0) && (
            <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles size={14} className="text-amber-500" />
                <span className="text-[14px] font-bold text-foreground">常用匯報項目</span>
                <span className="text-[13px] text-muted-foreground">（自訂 + 根據你的歷史匯報自動推薦，點擊快速填入）</span>
              </div>

              {/* User-saved templates first — these capture full entry payloads
                  so a single click restores category, hours, title, AI tools etc. */}
              {savedTemplates.length > 0 && (
                <div className="mb-3">
                  <div className="text-[12px] text-muted-foreground mb-1.5">我的常用項目</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {savedTemplates.map(tpl => {
                      const cat = tpl.entry.category as WorkCategory | '';
                      const config = cat ? categoryConfig[cat] : null;
                      return (
                        <div
                          key={tpl.id}
                          className="group relative flex items-start gap-2 px-3 py-2.5 rounded-lg border bg-amber-50/40 border-amber-200/70 hover:border-amber-400 hover:shadow-sm transition-all"
                        >
                          <button
                            type="button"
                            onClick={() => applySavedTemplate(tpl)}
                            className="flex-1 flex items-start gap-2 text-left"
                          >
                            {config ? (
                              <span className={cn('text-[12px] px-1.5 py-0.5 rounded shrink-0 mt-0.5', config.bg, config.color)}>
                                {config.icon}
                              </span>
                            ) : (
                              <span className="text-[12px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 bg-amber-100 text-amber-700">★</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-medium text-foreground truncate">{tpl.label}</div>
                              <div className="text-[12px] text-muted-foreground truncate">
                                {[
                                  config?.label,
                                  tpl.entry.relatedName,
                                  tpl.entry.hours ? `${tpl.entry.hours}h` : null,
                                ].filter(Boolean).join(' · ') || '自訂項目'}
                              </div>
                            </div>
                            <Plus size={12} className="text-amber-600 shrink-0 mt-1" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedTemplate(tpl.id)}
                            title="移除這個常用項目"
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-600 p-0.5 rounded transition-opacity"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {recentFrequentItems.length > 0 && savedTemplates.length > 0 && (
                <div className="text-[12px] text-muted-foreground mb-1.5">歷史推薦</div>
              )}
              {recentFrequentItems.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {recentFrequentItems.map((item, idx) => {
                  const config = categoryConfig[item.category];
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        // Auto-fill: use applyQuickTemplate style — fill empty or add new
                        const firstEmpty = entries.findIndex(e => !e.category && !e.title && e.hours === 0);
                        const newEntry = {
                          category: item.category,
                          relatedId: item.relatedId,
                          relatedName: item.relatedName,
                          title: item.relatedName, // pre-fill title with the project name
                          hours: Math.round((item.totalHours / item.count) * 2) / 2, // average hours rounded to 0.5
                          outcomeType: '' as OutcomeType | '',
                          outcomeUrl: '',
                          outcomeImages: [] as string[],
                          growthExperience: '',
                          isAiAssisted: false,
                          aiTools: [] as AITool[],
                          aiToolsV2: { ...emptyAiTools },
                        };
                        if (firstEmpty >= 0) {
                          const newEntries = [...entries];
                          newEntries[firstEmpty] = newEntry;
                          setEntries(newEntries);
                        } else {
                          setEntries([...entries, newEntry]);
                        }
                      }}
                      className={cn(
                        'flex items-start gap-2 px-3 py-2.5 rounded-lg border text-left transition-all hover:shadow-sm hover:scale-[1.01]',
                        'bg-white border-border/60 hover:border-teal-300 hover:bg-teal-50/20'
                      )}
                    >
                      <span className={cn('text-[12px] px-1.5 py-0.5 rounded shrink-0 mt-0.5', config.bg, config.color)}>
                        {config.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-foreground truncate">{item.relatedName}</div>
                        <div className="text-[12px] text-muted-foreground truncate">{config.label} · {item.count}次 · {item.totalHours}h</div>
                      </div>
                      <Plus size={12} className="text-teal-500 shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>

      {/* Hours Status & Entries */}
          {isLoadingExisting ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 size={24} className="animate-spin text-teal-600" />
              <p className="text-[15px] text-muted-foreground">載入匯報資料中...</p>
            </div>
          ) : (
          <>
          {/* Update mode indicator */}
          {isUpdateMode && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-[14px] font-medium">
              <RefreshCw size={13} />
              此日期已有匯報記錄，修改後點擊「更新匯報」即可覆蓋保存。
            </div>
          )}
          {/* Hours Status Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-border/60">
              <span className="text-[14px] font-medium text-muted-foreground">{formatDateShort(selectedDate)}</span>
              {(selectedDateIsHoliday || selectedDateIsSun) && <span className="text-[12px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">OT 日</span>}
              {selectedDateIsSat && !selectedDateIsHoliday && <span className="text-[12px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">星期六</span>}
            </div>
            
            {/* Right-aligned group: Target Hours + Total Filled */}
            <div className="ml-auto flex items-center gap-4">
              {/* Editable Target Hours */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border-2 border-rose-300">
                <span className="text-[13px] font-semibold text-rose-700">目標工時：</span>
                <input 
                  type="number" 
                  step="0.5" 
                  min="0.5" 
                  max="16" 
                  value={targetHours} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.5 && val <= 16) {
                      // Round to nearest 0.5
                      setTargetHours(Math.round(val * 2) / 2);
                    }
                  }}
                  className="w-14 px-2 py-1 border border-rose-300 rounded-md text-[16px] font-bold text-rose-700 text-center bg-white focus:ring-2 focus:ring-rose-200 focus:border-rose-400"
                />
                <span className="text-[16px] font-bold text-rose-700">h</span>
              </div>

              {/* Total Filled Progress */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-border/60">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-[14px] text-muted-foreground">已填：</span>
              <span className={cn('text-[20px] font-bold', 
                hoursMatch ? 'text-teal-600' :
                (selectedDateIsHoliday || selectedDateIsSun) ? 'text-amber-600' :
                isOT ? 'text-amber-600' : 
                totalHours > 0 ? 'text-rose-500' : 'text-gray-400'
              )}>
                {totalHours}h
                {hoursMatch && <span className="text-[13px] font-normal ml-1 text-teal-600">✓</span>}
                {(isOT || ((selectedDateIsHoliday || selectedDateIsSun) && totalHours > 0)) && 
                  <span className="text-[13px] font-normal ml-1">
                    OT {selectedDateIsHoliday || selectedDateIsSun ? `+${totalHours}h` : `+${otHours}h`}
                  </span>
                }
              </span>
              <div className="w-24 h-2.5 bg-muted rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', 
                  hoursMatch ? 'bg-teal-500' :
                  (selectedDateIsHoliday || selectedDateIsSun) ? 'bg-amber-500' :
                  isOT ? 'bg-amber-500' : 
                  totalHours >= targetHours ? 'bg-teal-500' : 'bg-rose-400'
                )} style={{ width: `${Math.min((totalHours / Math.max(targetHours, 1)) * 100, 100)}%` }} />
              </div>
              {!hoursMatch && totalHours > 0 && (
                <span className="text-[13px] text-rose-500 font-medium">
                  {totalHours < targetHours ? `差 ${(targetHours - totalHours).toFixed(1)}h` : `超出 ${(totalHours - targetHours).toFixed(1)}h`}
                </span>
              )}
              {aiUsedInEntries && (<span className="flex items-center gap-1 text-[13px] px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-medium"><Bot size={11} /> AI 輔助</span>)}
              </div>
            </div>
          </div>

          {/* Quick Templates */}
          <div className="bg-white rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1 text-[14px] font-medium text-muted-foreground shrink-0"><Zap size={11} className="text-amber-500" />快速填入：</span>
              {quickTemplates.map((tpl, idx) => {
                const config = categoryConfig[tpl.category];
                return (
                  <button key={idx} onClick={() => applyQuickTemplate(tpl)} className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[14px] hover:shadow-sm transition-all', config.bg, config.color, 'border-current/20 hover:scale-[1.02]')}>
                    <span>{config.icon}</span>
                    <span className="font-medium">{tpl.title}</span>
                    <span className="opacity-60">+</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Work Entries */}
          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div key={idx} className="p-4 rounded-lg border border-border/60 bg-white hover:border-teal-200 transition-colors shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-bold text-teal-600 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center text-[14px]">{idx + 1}</span>
                    工作項目
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saveEntryAsTemplate(idx)}
                      title="加入到常用匯報項目"
                      className="flex items-center gap-1 text-[12px] text-amber-600 hover:text-amber-700 px-2 py-1 rounded border border-amber-200 hover:bg-amber-50"
                    >
                      <Star size={12} />
                      <span>加入到常用匯報項目</span>
                    </button>
                    {entries.length > 1 && (
                      <button onClick={() => removeEntry(idx)} className="text-rose-500 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-3">
                  <div className="lg:col-span-2">
                    <label className="text-[13px] font-semibold text-muted-foreground block mb-1">工作類別 *</label>
                    <select value={entry.category} onChange={(e) => updateEntry(idx, 'category', e.target.value)} className="w-full px-2.5 py-2 border border-border rounded-md text-[15px] bg-white focus:ring-2 focus:ring-teal-200 focus:border-teal-400 transition-all">
                      <option value="">選擇類別...</option>
                      {(dynamicTypes.length > 0
                        ? dynamicTypes.filter(t => t.isActive)
                        : Object.entries(categoryConfig).map(([k, v]) => ({ id: k, icon: v.icon, label: v.label }))
                      ).map(t => (<option key={t.id} value={t.id}>{t.icon} {t.label}</option>))}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    {(() => {
                      const dynType = entry.category ? dynamicTypes.find(t => t.id === entry.category) : null;
                      const relationType = dynType?.relationType
                        ?? (entry.category ? defaultCategoryRelationMap[entry.category as WorkCategory] : undefined);
                      return (
                        <>
                          <label className="text-[13px] font-semibold text-muted-foreground block mb-1">
                            {relationType === 'internal_project' ? '關聯內部項目'
                              : relationType === 'none' ? '關聯項目（選填）'
                              : '關聯項目/網站'}
                          </label>
                          {relationType === 'none' ? (
                            <SearchableProjectSelect items={[]} value="" onChange={() => {}} disabled={true} />
                          ) : relationType === 'internal_project' ? (
                            <SearchableProjectSelect
                              items={projects.filter(p => p.projectCategory === 'internal').map(p => ({ id: p.id, name: p.name }))}
                              value={entry.relatedId}
                              onChange={(id, name) => { updateEntry(idx, 'relatedId', id); updateEntry(idx, 'relatedName', name); }}
                              placeholder="搜尋內部項目..."
                              className="border-teal-200 bg-teal-50/30"
                            />
                          ) : (
                            <SearchableProjectSelect
                              items={entry.category ? getRelatedItemsLive(entry.category as WorkCategory) : []}
                              value={entry.relatedId}
                              onChange={(id, name) => { updateEntry(idx, 'relatedId', id); updateEntry(idx, 'relatedName', name); }}
                              disabled={!entry.category}
                              placeholder="搜尋項目/網站..."
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-[13px] font-semibold text-muted-foreground block mb-1">工時(h) *</label>
                    <input type="number" step="0.5" min="0.5" max="12" value={entry.hours || ''} onChange={(e) => { const val = parseFloat(e.target.value); updateEntry(idx, 'hours', isNaN(val) ? 0 : Math.round(val * 2) / 2); }} className="w-full px-2.5 py-2 border border-border rounded-md text-[15px]" placeholder="0" />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-[13px] font-semibold text-muted-foreground block mb-1">工作內容 *</label>
                    <textarea
                      value={entry.title}
                      onChange={(e) => updateEntry(idx, 'title', e.target.value)}
                      rows={3}
                      className="w-full px-2.5 py-2 border border-border rounded-md text-[15px] resize-y leading-relaxed"
                      placeholder="簡述工作內容...（可換行）"
                    />
                  </div>
                </div>
                {/* AI Tools - Permanent Three-Category Layout */}
                <div className="mb-3 p-3 rounded-md bg-purple-50/50 border border-purple-100">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Bot size={13} className="text-purple-600" />
                    <span className="text-[14px] font-bold text-purple-700">AI 工具</span>
                  </div>
                  {/* Category 1: 文案工具 */}
                  <div className="mb-2">
                    <span className="text-[13px] font-semibold text-purple-600 block mb-1.5">1. 文案工具：</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {['Perplexity', 'Grok', 'Gemini', 'Deepseek', '豆包', 'Claude', 'GPT', 'Skywork'].map((tool) => (
                        <label key={tool} className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={entry.aiToolsV2.copywriting.includes(tool)} onChange={(e) => { const tools = e.target.checked ? [...entry.aiToolsV2.copywriting, tool] : entry.aiToolsV2.copywriting.filter(t => t !== tool); updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, copywriting: tools }); }} className="rounded w-3 h-3 accent-purple-500" />
                          <span className="text-[13px] text-purple-700">{tool}</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={entry.aiToolsV2.copywriting.includes('其他')} onChange={(e) => { const tools = e.target.checked ? [...entry.aiToolsV2.copywriting, '其他'] : entry.aiToolsV2.copywriting.filter(t => t !== '其他'); updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, copywriting: tools, copywritingOther: e.target.checked ? entry.aiToolsV2.copywritingOther : '' }); }} className="rounded w-3 h-3 accent-purple-500" />
                        <span className="text-[13px] text-purple-700">其他:</span>
                      </label>
                      {entry.aiToolsV2.copywriting.includes('其他') && (
                        <input value={entry.aiToolsV2.copywritingOther} onChange={(e) => { if (e.target.value.length <= 30) updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, copywritingOther: e.target.value }); }} className="px-2 py-0.5 border border-purple-200 rounded text-[13px] w-28 bg-white" placeholder="自定義工具..." maxLength={30} />
                      )}
                    </div>
                  </div>
                  {/* Category 2: 圖片工具 */}
                  <div className="mb-2">
                    <span className="text-[13px] font-semibold text-purple-600 block mb-1.5">2. 圖片工具：</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {['Magnific(Freepik)', 'Genspark (Image2)', 'Gemini (Nano banana)', 'Skywork'].map((tool) => (
                        <label key={tool} className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={entry.aiToolsV2.image.includes(tool)} onChange={(e) => { const tools = e.target.checked ? [...entry.aiToolsV2.image, tool] : entry.aiToolsV2.image.filter(t => t !== tool); updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, image: tools }); }} className="rounded w-3 h-3 accent-purple-500" />
                          <span className="text-[13px] text-purple-700">{tool}</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={entry.aiToolsV2.image.includes('其他')} onChange={(e) => { const tools = e.target.checked ? [...entry.aiToolsV2.image, '其他'] : entry.aiToolsV2.image.filter(t => t !== '其他'); updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, image: tools, imageOther: e.target.checked ? entry.aiToolsV2.imageOther : '' }); }} className="rounded w-3 h-3 accent-purple-500" />
                        <span className="text-[13px] text-purple-700">其他:</span>
                      </label>
                      {entry.aiToolsV2.image.includes('其他') && (
                        <input value={entry.aiToolsV2.imageOther} onChange={(e) => { if (e.target.value.length <= 30) updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, imageOther: e.target.value }); }} className="px-2 py-0.5 border border-purple-200 rounded text-[13px] w-28 bg-white" placeholder="自定義工具..." maxLength={30} />
                      )}
                    </div>
                  </div>
                  {/* Category 3: 影片工具 */}
                  <div>
                    <span className="text-[13px] font-semibold text-purple-600 block mb-1.5">3. 影片工具：</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {['Capcut', 'Seedance', 'Kling', 'Magnific AI'].map((tool) => (
                        <label key={tool} className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={entry.aiToolsV2.video.includes(tool)} onChange={(e) => { const tools = e.target.checked ? [...entry.aiToolsV2.video, tool] : entry.aiToolsV2.video.filter(t => t !== tool); updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, video: tools }); }} className="rounded w-3 h-3 accent-purple-500" />
                          <span className="text-[13px] text-purple-700">{tool}</span>
                        </label>
                      ))}
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={entry.aiToolsV2.video.includes('其他')} onChange={(e) => { const tools = e.target.checked ? [...entry.aiToolsV2.video, '其他'] : entry.aiToolsV2.video.filter(t => t !== '其他'); updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, video: tools, videoOther: e.target.checked ? entry.aiToolsV2.videoOther : '' }); }} className="rounded w-3 h-3 accent-purple-500" />
                        <span className="text-[13px] text-purple-700">其他:</span>
                      </label>
                      {entry.aiToolsV2.video.includes('其他') && (
                        <input value={entry.aiToolsV2.videoOther} onChange={(e) => { if (e.target.value.length <= 30) updateEntry(idx, 'aiToolsV2', { ...entry.aiToolsV2, videoOther: e.target.value }); }} className="px-2 py-0.5 border border-purple-200 rounded text-[13px] w-28 bg-white" placeholder="自定義工具..." maxLength={30} />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                  <span className="text-[14px] font-bold text-teal-700 shrink-0">📌 成果：</span>
                  <select value={entry.outcomeType} onChange={(e) => updateEntry(idx, 'outcomeType', e.target.value)} className="px-2.5 py-1.5 border border-border rounded-md text-[15px] bg-white w-32">
                    <option value="">類型...</option>
                    {Object.entries(outcomeTypeConfigV2).map(([k, v]) => (<option key={k} value={k}>{v.icon} {v.label}</option>))}
                  </select>
                  {entry.outcomeType === 'url' && (<input value={entry.outcomeUrl} onChange={(e) => updateEntry(idx, 'outcomeUrl', e.target.value)} className="flex-1 px-2.5 py-1.5 border border-border rounded-md text-[15px]" placeholder="輸入成果URL連結..." />)}
                  {entry.outcomeType === 'image' && (<input value={entry.outcomeImages.join(', ')} onChange={(e) => updateEntry(idx, 'outcomeImages', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} className="flex-1 px-2.5 py-1.5 border border-border rounded-md text-[15px]" placeholder="輸入圖片URL（多張以逗號分隔）..." />)}
                  {entry.outcomeType === 'growth_experience' && (<input value={entry.growthExperience} onChange={(e) => updateEntry(idx, 'growthExperience', e.target.value)} className="flex-1 px-2.5 py-1.5 border border-border rounded-md text-[15px]" placeholder="描述成長經驗與技能提升..." />)}
                </div>
              </div>
            ))}
          </div>

          {/* Under Hours Warning */}
          {isUnderHours && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-rose-600" />
                <span className="text-[15px] font-bold text-rose-700">⚠️ 工時未達標（需 = {targetHours}h，目前 {totalHours}h）</span>
              </div>
              <input value={underHoursReason} onChange={(e) => setUnderHoursReason(e.target.value)} className="w-full px-3 py-2 border border-rose-200 rounded-md text-[15px] bg-white" placeholder="請填寫未達標原因（必填方可提交）..." />
            </div>
          )}

      {/* Action Bar */}
      <div className="flex flex-col gap-2 pt-4 border-t border-border/40 bg-white rounded-lg px-5 py-4 border border-border/60 shadow-sm sticky bottom-0">
        {submitError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[14px] font-medium">
            <AlertTriangle size={12} />
            {submitError}
          </div>
        )}
        {currentStaffId && (
          <div className="text-[13px] text-muted-foreground">
            提交者：<span className="font-medium text-teal-700">{currentStaffName || currentStaffId}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
        <button onClick={addEntry} className="text-[15px] text-teal-600 font-medium hover:text-teal-700 flex items-center gap-1 px-3 py-2 rounded-md hover:bg-teal-50 transition-colors border border-teal-200">
          <Plus size={13} /> 新增工作項目
        </button>
        <div className="flex items-center gap-3">
          {!canSubmit && totalHours > 0 && !hoursMatch && (
            <span className="text-[14px] text-rose-500 font-medium bg-rose-50 px-3 py-1.5 rounded-md border border-rose-200">
              ⚠️ 所有工作項目的工時總和必須等於目標工時（{targetHours}h），目前為 {totalHours}h
            </span>
          )}
          {!canSubmit && totalHours === 0 && (
            <span className="text-[14px] text-gray-500 font-medium">
              請填寫至少一個工作項目
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={cn('px-6 py-2.5 rounded-md text-[16px] font-medium text-white active:scale-[0.97] transition-all shadow-sm flex items-center gap-2', canSubmit && !isSubmitting ? 'bg-teal-600 hover:bg-teal-700' : 'bg-gray-300 cursor-not-allowed')}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? '提交中...' : isUpdateMode ? '更新匯報' : '提交匯報'}
          </button>
        </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// ============================
// Today Team Reports (Read-Only)
// ============================
function TodayTeamReports() {
  const { systemUser } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0]; // Live today's date
  
  // Determine user's department and role
  const rawDepartment = systemUser?.department || 'System';
  const userDepartment = rawDepartment === 'Management' ? 'System' : rawDepartment;
  const userRole = systemUser?.role || '';
  const canSwitchDepartment = userRole === 'super_admin' || userRole === 'management';
  
  const [selectedDepartment, setSelectedDepartment] = useState<string>(userDepartment);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // === LIVE DATABASE STATE ===
  const [dbStaff, setDbStaff] = useState<Array<{ id: string; bubble_staff_id: string; display_name: string; department: string; position: string; status: string }>>([]);
  const [dbReports, setDbReports] = useState<Array<{ id: string; staff_id: string; report_date: string; total_hours: number; ot_hours: number; is_leave: boolean; leave_type: string | null; status: string }>>([]);
  const [dbEntries, setDbEntries] = useState<Array<{ id: string; day_report_id: string; staff_id: string; category: string; title: string; hours: number; outcome_url: string | null; growth_experience: string | null; is_ai_assisted: boolean; ai_tools: any }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ value: string; label: string }>>([]);

  // Fetch live staff directory and reports from Supabase
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // 1. Fetch all staff with a valid, non-empty department
        // Exclude legacy orphan rows: "Director" position and "Management" department
        const { data: staffData, error: staffErr } = await supabase
          .from('staff_directory')
          .select('id, bubble_staff_id, display_name, department, position, status')
          .eq('status', 'active')
          .not('department', 'is', null)
          .neq('department', '')
          .neq('department', 'Management')
          .neq('position', 'Director');

        if (staffErr) {
          console.error('[TodayTeamReports] Staff query error:', staffErr);
        }

        // Post-fetch safety: exclude any legacy "Director / Management" rows that slip through
        const EXCLUDED_POSITIONS = ['director', 'director / management'];
        const EXCLUDED_DEPARTMENTS = ['management'];
        const staff = (staffData || []).filter(s => {
          const pos = (s.position || '').toLowerCase().trim();
          const dept = (s.department || '').toLowerCase().trim();
          return !EXCLUDED_POSITIONS.includes(pos) && !EXCLUDED_DEPARTMENTS.includes(dept);
        });
        setDbStaff(staff);

        // 2. Build dynamic department options from actual data
        const deptSet = new Set(staff.map(s => s.department).filter(Boolean));
        const dynamicDepts: Array<{ value: string; label: string }> = [
          { value: '__ALL__', label: '全部門' },
          ...Array.from(deptSet).sort().map(d => ({ value: d, label: d })),
        ];
        setDepartmentOptions(dynamicDepts);

        // 3. Fetch today's day_reports
        const { data: reportData, error: reportErr } = await supabase
          .from('day_reports')
          .select('id, staff_id, report_date, total_hours, ot_hours, is_leave, leave_type, status')
          .eq('report_date', todayStr);

        if (reportErr) {
          console.error('[TodayTeamReports] Reports query error:', reportErr);
        }

        const reports = reportData || [];
        setDbReports(reports);

        // 4. Fetch entries for today's reports
        if (reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          const { data: entryData, error: entryErr } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, staff_id, category, title, hours, outcome_url, growth_experience, is_ai_assisted, ai_tools')
            .in('day_report_id', reportIds);

          if (entryErr) {
            console.error('[TodayTeamReports] Entries query error:', entryErr);
          }
          setDbEntries(entryData || []);
        } else {
          setDbEntries([]);
        }
      } catch (err) {
        console.error('[TodayTeamReports] Unexpected error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [todayStr]);

  // === DERIVED STATE (from live DB data) ===
  const activeDept = canSwitchDepartment ? selectedDepartment : userDepartment;
  
  // Filter staff by selected department (all staff already have valid department from query)
  const filteredStaff = useMemo(() => {
    if (activeDept === '__ALL__') return dbStaff;
    return dbStaff.filter(s => s.department === activeDept);
  }, [dbStaff, activeDept]);

  const filteredStaffIds = useMemo(() => new Set(filteredStaff.map(s => s.bubble_staff_id)), [filteredStaff]);

  // Filter reports to only those belonging to staff in the selected department
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

  // Build staff name lookup (bubble_staff_id -> display_name)
  const staffNameMap = useMemo(() => {
    const map = new Map<string, string>();
    dbStaff.forEach(s => map.set(s.bubble_staff_id, s.display_name));
    return map;
  }, [dbStaff]);

  const submittedCount = todayReports.length;
  const totalStaff = filteredStaff.length;
  const totalHoursToday = todayReports.reduce((s, r) => s + Number(r.total_hours || 0), 0);
  const otCount = todayReports.filter(r => Number(r.ot_hours) > 0).length;
  const aiUsedCount = useMemo(() => {
    // Count reports that have at least one AI-assisted entry
    return todayReports.filter(r => {
      const entries = entriesByReport.get(r.id) || [];
      return entries.some(e => e.is_ai_assisted);
    }).length;
  }, [todayReports, entriesByReport]);
  
  // Staff who haven't submitted today
  const notSubmittedStaff = useMemo(() => {
    const submittedStaffIds = new Set(todayReports.map(r => r.staff_id));
    return filteredStaff.filter(s => !submittedStaffIds.has(s.bubble_staff_id));
  }, [filteredStaff, todayReports]);

  return (
    <div className="space-y-4">

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '已提交', value: `${submittedCount}/${totalStaff}`, icon: <Users size={14} />, color: submittedCount === totalStaff && totalStaff > 0 ? 'text-teal-600' : 'text-amber-600', bgColor: submittedCount === totalStaff && totalStaff > 0 ? 'bg-teal-50' : 'bg-amber-50' },
          { label: '今日總工時', value: `${totalHoursToday}h`, icon: <BarChart3 size={14} />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
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
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <h4 className="text-[16px] font-bold flex items-center gap-2">
              <Eye size={16} className="text-teal-600" />
              今日團隊匯報
            </h4>
            <p className="text-[12px] text-muted-foreground mt-0.5">{todayStr} · {submittedCount} 人已提交</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Department Selector (only visible to super_admin / management) */}
            {canSwitchDepartment && (
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="border border-border/60 rounded-md px-2.5 py-1.5 text-[12px] font-medium bg-muted/30 hover:bg-muted/50 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-colors"
              >
                {departmentOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">提交率</span>
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${totalStaff > 0 ? (submittedCount / totalStaff) * 100 : 0}%` }} /></div>
              <span className="text-[12px] font-bold text-teal-600">{totalStaff > 0 ? Math.round((submittedCount / totalStaff) * 100) : 0}%</span>
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
            <p className="text-[14px] font-medium text-muted-foreground">此部門暫無員工</p>
            <p className="text-[12px] text-muted-foreground/70 mt-1">
              「{activeDept}」部門目前沒有已分配的活躍員工
            </p>
          </div>
        )}

        {/* Report List */}
        {!isLoading && filteredStaff.length > 0 && (
          <div className="divide-y divide-border/30">
            {todayReports.map(report => {
              const entries = entriesByReport.get(report.id) || [];
              const staffName = staffNameMap.get(report.staff_id) || report.staff_id;
              const hasAi = entries.some(e => e.is_ai_assisted);
              return (
                <div key={report.id} className="px-5 py-3.5 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-100 to-teal-200 flex items-center justify-center text-[13px] font-bold text-teal-700">{staffName.slice(0, 1)}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold">{staffName}</span>
                        {report.is_leave && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{report.leave_type || '請假'}</span>}
                        {hasAi && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 flex items-center gap-0.5"><Bot size={9} />AI</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] text-muted-foreground">{entries.length} 項工作</span>
                      <span className={cn('text-[15px] font-bold', Number(report.ot_hours) > 0 ? 'text-amber-600' : 'text-foreground')}>{report.total_hours}h {Number(report.ot_hours) > 0 && <span className="text-[11px] font-normal">OT</span>}</span>
                    </div>
                  </div>
                  {/* Entry summary */}
                  <div className="ml-12 space-y-1">
                    {entries.slice(0, expandedId === report.id ? undefined : 3).map(entry => {
                      const config = categoryConfig[entry.category as WorkCategory] || { bg: 'bg-gray-50', color: 'text-gray-600', icon: '📋', label: entry.category };
                      return (
                        <div key={entry.id} className="flex items-center gap-2">
                          <span className={cn('text-[11px] px-1.5 py-0.5 rounded shrink-0', config.bg, config.color)}>{config.icon} {config.label}</span>
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
                <p className="text-[13px]">今日尚無提交匯報</p>
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
interface WCStaff { bubble_staff_id: string; display_name: string; department: string | null; }
interface WCReport { id: string; staff_id: string; report_date: string; total_hours: number; ot_hours: number; is_leave: boolean; status: string; }
interface WCEntry { id: string; day_report_id: string; category: string; title: string | null; hours: number; outcome_url: string | null; growth_experience: string | null; is_ai_assisted: boolean | null; }

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
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<WCStaff[]>([]);
  const [reports, setReports] = useState<WCReport[]>([]);
  const [entries, setEntries] = useState<WCEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [ownDepartment, setOwnDepartment] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

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
      if (!systemUser?.bubble_staff_id) return;
      let dept: string | null = systemUser.department || null;
      if (!dept) {
        const { data: ui } = await supabase
          .from('user_info').select('department')
          .eq('staff_id', systemUser.bubble_staff_id).maybeSingle();
        dept = ui?.department || null;
      }
      if (!dept) {
        const { data: sd } = await supabase
          .from('staff_directory').select('department')
          .eq('bubble_staff_id', systemUser.bubble_staff_id).maybeSingle();
        dept = sd?.department || null;
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
  }, [systemUser?.bubble_staff_id, systemUser?.department, isSuperAdmin]);

  // Build available departments list for super_admin dropdown from DB (distinct)
  useEffect(() => {
    if (!isSuperAdmin) return;
    let aborted = false;
    (async () => {
      const { data } = await supabase
        .from('staff_directory')
        .select('department')
        .eq('status', 'active')
        .not('department', 'is', null)
        .neq('department', '')
        .neq('department', 'Management');
      const set = new Set<string>();
      (data || []).forEach((r: any) => { if (r.department) set.add(r.department); });
      if (!aborted) setAvailableDepartments(Array.from(set).sort());
    })();
    return () => { aborted = true; };
  }, [isSuperAdmin]);

  // Fetch reports/entries for the active department & month
  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!systemUser?.bubble_staff_id) return;
      // For super-admins, default to __ALL__ when no selection yet so the calendar isn't blank.
      // For non-super-admins, wait until ownDepartment resolves.
      if (!isSuperAdmin && !ownDepartment) return;
      setLoading(true);
      console.log('[WorkCalendar] systemUser.role:', systemUser.role, 'isSuperAdmin:', isSuperAdmin, 'selectedDept:', selectedDepartment, 'ownDept:', ownDepartment);
      try {
        const activeDept = isSuperAdmin
          ? (selectedDepartment === '__ALL__' ? null : selectedDepartment)
          : ownDepartment; // non-super-admin locked to own department

        // 1) Fetch active staff (filtered by department if applicable)
        let staffQuery = supabase
          .from('staff_directory')
          .select('bubble_staff_id, display_name, department')
          .eq('status', 'active')
          .not('department', 'is', null)
          .neq('department', '')
          .neq('department', 'Management');
        if (activeDept) staffQuery = staffQuery.eq('department', activeDept);
        const { data: staffData } = await staffQuery;
        const seen = new Set<string>();
        const dedupStaff = (staffData || []).filter((s: any) => {
          if (!s.bubble_staff_id || seen.has(s.bubble_staff_id)) return false;
          seen.add(s.bubble_staff_id);
          return true;
        }) as WCStaff[];
        if (aborted) return;
        setStaffList(dedupStaff);

        const allowed = dedupStaff.map(s => s.bubble_staff_id);
        if (activeDept && allowed.length === 0) {
          setReports([]);
          setEntries([]);
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
          .select('id, staff_id, report_date, total_hours, ot_hours, is_leave, status')
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
          ot_hours: Number(r.ot_hours) || 0,
          is_leave: !!r.is_leave,
        }));
        if (aborted) return;
        setReports(normalizedReports);

        // 3) Entries
        if (normalizedReports.length > 0) {
          const ids = normalizedReports.map(r => r.id);
          const { data: eData, error: eErr } = await supabase
            .from('day_report_entries')
            .select('id, day_report_id, category, title, hours, outcome_url, growth_experience, is_ai_assisted')
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
  }, [systemUser?.bubble_staff_id, ownDepartment, selectedDepartment, isSuperAdmin, monthStr, year, month, daysInMonth]);

  const staffNameById = useMemo(() => {
    const m: Record<string, string> = {};
    staffList.forEach(s => { m[s.bubble_staff_id] = s.display_name; });
    return m;
  }, [staffList]);

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
  const monthTotalHours = reports.reduce((s, r) => s + r.total_hours, 0);
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
                const totalHours = dayReports.reduce((s, r) => s + r.total_hours, 0);
                const hasOT = dayReports.some(r => r.ot_hours > 0);
                const hasLeave = dayReports.some(r => r.is_leave);
                const dayReportIds = new Set(dayReports.map(r => r.id));
                const hasAI = entries.some(e => dayReportIds.has(e.day_report_id) && !!e.is_ai_assisted);
                const isSelected = selectedDate === dateStr;
                const isWeekend = (firstDayOfWeek + i) % 7 === 0 || (firstDayOfWeek + i) % 7 === 6;
                return (
                  <div key={day} onClick={() => setSelectedDate(dateStr)} className={cn('p-1.5 border-b border-r border-border/30 min-h-[76px] cursor-pointer transition-all', isSelected && 'ring-2 ring-teal-500 bg-teal-50/40 z-10', !isSelected && 'hover:bg-muted/30', hasLeave && !isSelected && 'bg-amber-50/30', isWeekend && !isSelected && !hasLeave && 'bg-gray-50/50')}>
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[12px] font-medium', isWeekend && 'text-muted-foreground')}>{day}</span>
                      {totalHours > 0 && <span className={cn('text-[11px] font-bold', totalHours >= 8 ? 'text-teal-600' : 'text-rose-500')}>{totalHours}h</span>}
                    </div>
                    {dayReports.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayReports.slice(0, 2).map(r => {
                          const mainCat = (entriesByReport[r.id] || [])[0]?.category as WorkCategory | undefined;
                          const config = mainCat ? categoryConfig[mainCat] : null;
                          const name = staffNameById[r.staff_id] || '';
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
                      {usedAI && <Bot size={13} className="text-purple-500" />}
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      共 {reportEntries.length} 項 · <span className="text-teal-600 font-semibold">{report.total_hours}h</span>
                      {report.ot_hours > 0 && <span className="text-rose-500 ml-1.5">+{report.ot_hours}h OT</span>}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pl-1">
                  {reportEntries.map(entry => {
                    const config = categoryConfig[entry.category as WorkCategory];
                    return (
                      <div key={entry.id} className="p-2.5 rounded-md bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-1.5 mb-1">
                          {config && <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-medium', config.bg, config.color)}>{config.label}</span>}
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
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
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
// Work Analysis
// ============================
function WorkAnalysis() {
  const [selectedMonth, setSelectedMonth] = useState(1);
  const monthStr = `2025-${String(selectedMonth).padStart(2, '0')}`;
  const monthReports = dailyReportsV2.filter(r => r.reportDate.startsWith(monthStr) && !r.isLeave);
  const allEntries = monthReports.flatMap(r => r.entries);

  const catHours: Record<string, number> = {};
  Object.keys(categoryConfig).forEach(k => { catHours[k] = 0; });
  allEntries.forEach(e => { catHours[e.category] += e.hours; });
  const totalModuleHours = Object.values(catHours).reduce((s, h) => s + h, 0);

  const staffComparison = staffMembersV2.map(staff => {
    const staffReports = monthReports.filter(r => r.userId === staff.id);
    const staffTotalHours = staffReports.reduce((s, r) => s + r.totalHours, 0);
    const workDays = staffReports.length;
    const avgHours = workDays > 0 ? staffTotalHours / workDays : 0;
    const outcomeCount = staffReports.flatMap(r => r.entries).filter(e => e.outcomeUrl || (e.outcomeImages && e.outcomeImages.length > 0) || e.growthExperience).length;
    const aiRate = staffReports.length > 0 ? (staffReports.filter(r => r.aiUsed).length / staffReports.length) * 100 : 0;
    const aiHours = staffReports.flatMap(r => r.entries).filter(e => e.isAiAssisted).reduce((s, e) => s + e.hours, 0);
    return { ...staff, totalHours: staffTotalHours, workDays, avgHours, outcomeCount, aiRate, aiHours };
  }).sort((a, b) => b.totalHours - a.totalHours);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
        </select>
        <span className="text-[13px] text-muted-foreground">總工時: {totalModuleHours}h · {allEntries.length} 筆</span>
      </div>

      <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-sm p-5">
        <h4 className="text-[16px] font-bold mb-4">工作類型分佈（13 類）</h4>
        <div className="space-y-3">
          {(Object.entries(catHours) as [string, number][]).filter(([_, h]) => h > 0).sort((a, b) => b[1] - a[1]).map(([cat, hours]) => {
            const config = categoryConfig[cat as WorkCategory];
            if (!config) return null;
            const pct = totalModuleHours > 0 ? (hours / totalModuleHours) * 100 : 0;
            return (
              <div key={cat} className="flex items-center gap-2.5">
                <span className={cn('text-[11px] px-2 py-0.5 rounded w-[80px] text-center shrink-0 font-medium', config.bg, config.color)}>{config.icon} {config.label}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
                <span className="text-[12px] font-bold w-[50px] text-right">{hours}h</span>
                <span className="text-[11px] text-muted-foreground w-[40px] text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
          {totalModuleHours === 0 && <p className="text-[13px] text-muted-foreground text-center py-4">本月暫無數據</p>}
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
      case 'submit': return { title: '提交匯報', subtitle: '支援香港/深圳雙辦公室 · 14天匯報總覽 · 常用項目快速填入 · 週六加班匯報 · 多日假期申報 · AI 追蹤 · 8h驗證。' };
      case 'today-team': return { title: '今日團隊', subtitle: '查看今日團隊提交狀況及工作匯報詳情。' };
      case 'calendar': return { title: '工作日曆', subtitle: '以日曆視圖查看歷史工作記錄，13種工作類型顏色標記。' };
      case 'team-view': return { title: '團隊總覽', subtitle: '管理儀表板 — 過去14天缺交名單 · 團隊工時分析 · 匯報狀態總覽。' };
      case 'monthly': return { title: '月度報告', subtitle: '本月工時排名、AI 使用統計及類別分佈分析。' };
      case 'analytics': return { title: '工時分析', subtitle: '工作類型分佈、效率對比及 AI 效率深度分析。' };
      case 'work-categories': return { title: '工作類型管理', subtitle: '管理匯報工作類別的關聯規則 — 設定哪些類別關聯項目/網站、內部項目或無需關聯。' };
      case 'holiday-settings': return { title: '假期設定', subtitle: '自動載入香港及深圳公眾假期 · Admin 可設定星期六上班人員、公司活動日、免匯報日。' };
      default: return { title: '提交匯報', subtitle: '支援香港/深圳雙辦公室 · 14天匯報總覽 · 常用項目快速填入 · 週六加班匯報 · 多日假期申報 · AI 追蹤 · 8h驗證。' };
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
      case 'analytics': return <WorkAnalysis />;
      case 'work-categories': return <WorkCategoriesManager />;
      case 'holiday-settings': return <HolidaySettings />;
      default: return <SubmitReportPage />;
    }
  };

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
