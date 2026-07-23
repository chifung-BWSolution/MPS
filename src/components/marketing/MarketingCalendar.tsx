import { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, Calendar, Briefcase, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getCalendarEventsForMonth, CalendarEvent, parseVideoCalendarTheme } from '@/data/marketingData';
import { projects as allProjects, statusConfig } from '@/data/mockData';
import {
  useUpcomingEvents,
  UPCOMING_EVENT_STATUS_LABELS,
  type UpcomingEventStatus,
} from '@/hooks/useUpcomingEvents';
import { useVideoOutput } from '@/hooks/useVideoOutput';
import { useVchannels } from '@/hooks/useVchannels';
import {
  deriveVideoOutputStatus,
  VIDEO_OUTPUT_STATUS_COLORS,
  VIDEO_OUTPUT_STATUS_LABELS,
} from '@/lib/videoOutputUtils';

const calendarDays = ['一', '二', '三', '四', '五', '六', '日'];

const typeConfig: Record<string, { bg: string; text: string; label: string; dot: string; border: string }> = {
  social:   { bg: 'bg-blue-100',    text: 'text-blue-700',    label: '社交媒體', dot: 'bg-blue-500',    border: 'border-blue-200' },
  edm:      { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'EDM',      dot: 'bg-amber-500',   border: 'border-amber-200' },
  article:  { bg: 'bg-teal-100',    text: 'text-teal-700',    label: '文章',     dot: 'bg-teal-500',    border: 'border-teal-200' },
  ads:      { bg: 'bg-rose-100',    text: 'text-rose-700',    label: '廣告',     dot: 'bg-rose-500',    border: 'border-rose-200' },
  video:    { bg: 'bg-purple-100',  text: 'text-purple-700',  label: '影片',     dot: 'bg-purple-500',  border: 'border-purple-200' },
  seo:      { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'SEO',      dot: 'bg-emerald-500', border: 'border-emerald-200' },
  project:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  label: '項目',     dot: 'bg-indigo-500',  border: 'border-indigo-200' },
};

const accountKindStyle = {
  main: { label: '主號', className: 'text-blue-600' },
  secondary: { label: '小號', className: 'text-rose-500' },
} as const;

const EVENT_STATUS_COLORS: Record<UpcomingEventStatus, string> = {
  pending_publish: 'bg-purple-100 text-purple-800',
  published: 'bg-teal-100 text-teal-800',
};

type CustomEvent = Omit<CalendarEvent, 'type'> & {
  type: CalendarEvent['type'] | 'project';
  isProject?: boolean;
  projectCategory?: string;
  projectStatus?: string;
  _fullDate?: string;
  /** Manual upcoming_event rows — editable/deletable (not video / mock / project) */
  canManage?: boolean;
  notes?: string;
  /** Display text e.g. 影片：待審核 */
  statusText?: string;
  statusClassName?: string;
};

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function VideoCalendarChip({ event }: { event: CustomEvent }) {
  const kind = event.accountKind === 'secondary' ? 'secondary' : 'main';
  const kindCfg = accountKindStyle[kind];
  const theme = event.themeTitle || event.title;

  return (
    <div
      className={cn(
        'rounded border bg-white/90 leading-tight px-1.5 py-1 text-[10px]',
        kind === 'main' ? 'border-blue-100' : 'border-rose-100',
      )}
    >
      <div className={cn('font-semibold', kindCfg.className)}>{kindCfg.label}</div>
      {event.videoCode ? (
        <div className="font-medium text-foreground mt-0.5 break-words whitespace-normal">
          {event.videoCode}
        </div>
      ) : null}
      {theme ? (
        <div className="text-muted-foreground mt-0.5 break-words whitespace-normal">{theme}</div>
      ) : null}
    </div>
  );
}

/** Compact card for 月列表 — dense info, fixed height for even grid */
function MonthListEventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: CustomEvent;
  onEdit: (event: CustomEvent) => void;
  onDelete: (event: CustomEvent) => void;
}) {
  const cfg = typeConfig[event.type] || typeConfig.social;
  const isVideo = event.type === 'video';
  const kind = event.accountKind === 'secondary' ? 'secondary' : 'main';
  const kindCfg = accountKindStyle[kind];
  const theme = event.themeTitle || event.title;
  const metaBits = [event.company, event.brand, event.platform].filter(Boolean) as string[];
  const titleText = isVideo ? theme : event.title;

  return (
    <div
      className={cn(
        'relative flex flex-col h-[112px] rounded-md border border-border/70 bg-white overflow-hidden',
        'shadow-[0_1px_2px_rgba(0,20,40,0.04)] hover:border-teal-300/70 hover:shadow-sm transition-all',
      )}
    >
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px]', cfg.dot)} />
      <div className="flex flex-col h-full pl-3 pr-2 py-2 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', cfg.bg, cfg.text)}>
              {cfg.label}
            </span>
            {isVideo && (
              <span className={cn('text-[10px] font-semibold shrink-0', kindCfg.className)}>
                {kindCfg.label}
              </span>
            )}
            {event.hours != null && !isVideo && (
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{event.hours}h</span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {event.statusText ? (
              <span
                className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded max-w-[110px] truncate',
                  event.statusClassName || 'bg-muted text-muted-foreground',
                )}
                title={event.statusText}
              >
                {event.statusText}
              </span>
            ) : null}
            {event.canManage && !isVideo ? (
              <>
                <button
                  type="button"
                  title="編輯"
                  onClick={() => onEdit(event)}
                  className="p-1 rounded text-muted-foreground hover:text-teal-700 hover:bg-teal-50 transition-colors"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  title="刪除"
                  onClick={() => onDelete(event)}
                  className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {isVideo && event.videoCode ? (
          <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate" title={event.videoCode}>
            {event.videoCode}
          </p>
        ) : null}

        <p
          className={cn(
            'text-[12px] font-semibold text-foreground leading-snug line-clamp-2',
            isVideo && event.videoCode ? 'mt-0.5' : 'mt-1',
          )}
          title={titleText}
        >
          {titleText}
        </p>

        <div className="mt-auto pt-1 space-y-0.5 min-w-0">
          {isVideo && event.channelName ? (
            <p className="text-[10px] text-muted-foreground truncate" title={event.channelName}>
              {event.channelName}
            </p>
          ) : null}
          {metaBits.length > 0 ? (
            <p className="text-[10px] text-muted-foreground truncate" title={metaBits.join(' · ')}>
              {metaBits.join(' · ')}
            </p>
          ) : null}
          {!isVideo && event.notes ? (
            <p className="text-[10px] text-muted-foreground/75 truncate" title={event.notes}>
              {event.notes}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type NewEventForm = {
  title: string;
  type: string;
  date: string;
  company: string;
  brand: string;
  platform: string;
  hours: string;
  notes: string;
  status: UpcomingEventStatus;
};

const emptyForm = (): NewEventForm => ({
  title: '',
  type: 'social',
  date: new Date().toISOString().split('T')[0],
  company: '',
  brand: '',
  platform: '',
  hours: '',
  notes: '',
  status: 'pending_publish',
});

type CalendarViewMode = 'list' | 'weekly' | 'monthly';

export function MarketingCalendar() {
  // Default to today's month for weekly view accuracy
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('list');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<NewEventForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  /** Dates collapsed in list view (YYYY-MM-DD) */
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(() => new Set());
  const {
    events: upcomingEvents,
    addEvent: addUpcomingEvent,
    updateEvent: updateUpcomingEvent,
    deleteEvent: deleteUpcomingEvent,
  } = useUpcomingEvents();
  const { videos } = useVideoOutput();
  const { channels } = useVchannels();

  const customEvents = useMemo<CustomEvent[]>(() =>
    upcomingEvents.map(ev => {
      const d = new Date(ev.date + 'T00:00:00');
      const typeLabel = typeConfig[ev.type]?.label || '活動';
      const statusLabel = UPCOMING_EVENT_STATUS_LABELS[ev.status];
      return {
        id: ev.id,
        day: d.getDate(),
        title: ev.title,
        type: ev.type as CalendarEvent['type'],
        platform: ev.platform,
        company: ev.company,
        brand: ev.brand,
        websiteName: '',
        hours: ev.hours,
        notes: ev.notes,
        canManage: true,
        _fullDate: ev.date,
        statusText: `${typeLabel}：${statusLabel}`,
        statusClassName: EVENT_STATUS_COLORS[ev.status],
      };
    }),
  [upcomingEvents]);

  /** Live 影片製作 → calendar by 計劃發佈日期 */
  const videoEvents = useMemo<CustomEvent[]>(() => {
    const channelById = new Map(channels.map(c => [c.id, c]));
    return videos
      .filter(v => !!v.plannedPublishDate?.trim())
      .map(v => {
        const dateStr = v.plannedPublishDate!.trim();
        const d = new Date(dateStr + 'T00:00:00');
        const ch = channelById.get(v.vchannelId);
        const { theme, isSecondary } = parseVideoCalendarTheme({
          videoCode: v.videoCode,
          title: v.title,
        });
        const videoStatus = deriveVideoOutputStatus(v);
        return {
          id: `vo-${v.id}`,
          day: d.getDate(),
          title: theme,
          type: 'video' as const,
          company: ch?.brandCode || v.channelCode || '',
          brand: ch?.brandCode || '',
          websiteName: ch?.publicName || v.channelPublicName || '',
          videoCode: v.videoCode,
          themeTitle: theme,
          accountKind: isSecondary ? 'secondary' : 'main',
          channelName: ch?.publicName || v.channelPublicName,
          sourceId: v.id,
          canManage: false,
          _fullDate: dateStr,
          statusText: `影片：${VIDEO_OUTPUT_STATUS_LABELS[videoStatus]}`,
          statusClassName: VIDEO_OUTPUT_STATUS_COLORS[videoStatus],
        };
      });
  }, [videos, channels]);

  const today = new Date();

  // --- Weekly navigation ---
  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
  [weekStart]);

  const weekLabel = useMemo(() => {
    const end = weekDays[6];
    return `${weekStart.getFullYear()}年 ${weekStart.getMonth() + 1}月${weekStart.getDate()}日 — ${end.getMonth() + 1}月${end.getDate()}日`;
  }, [weekStart, weekDays]);

  const prevWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); };
  const nextWeek = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); };
  const goToToday = () => setCurrentDate(new Date());

  // --- Monthly navigation ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (new Date(year, month, 1).getDay() + 6) % 7;
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // --- Events ---
  const marketingEvents = useMemo(() => getCalendarEventsForMonth(year, month), [year, month]);

  // Build project events (show on start date)
  const projectEvents = useMemo<CustomEvent[]>(() => {
    return allProjects
      .filter(p => p.startDate)
      .map(p => {
        const date = new Date(p.startDate! + 'T00:00:00');
        const statusLabel = statusConfig[p.status]?.label;
        return {
          id: `proj-${p.id}`,
          day: date.getDate(),
          title: `📋 ${p.name}`,
          type: 'project' as const,
          company: p.company || '',
          brand: p.brand || '',
          websiteName: '',
          isProject: true,
          projectCategory: p.projectCategory,
          projectStatus: p.status,
          _fullDate: p.startDate,
          statusText: statusLabel ? `項目：${statusLabel}` : undefined,
          statusClassName: statusConfig[p.status]
            ? `${statusConfig[p.status].bgColor} ${statusConfig[p.status].textColor}`
            : undefined,
        };
      });
  }, []);

  // All events combined — live video_output replaces mock video rows
  const allBaseEvents = useMemo<CustomEvent[]>(() => {
    const mEvents = marketingEvents
      .filter(e => e.type !== 'video')
      .map(e => ({
        ...e,
        _fullDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`,
      }));
    return [...mEvents, ...projectEvents, ...customEvents, ...videoEvents];
  }, [marketingEvents, projectEvents, customEvents, videoEvents, year, month]);

  const companies = useMemo(() => {
    const set = new Set(allBaseEvents.map(e => e.company).filter(Boolean));
    return Array.from(set);
  }, [allBaseEvents]);

  const applyFilters = (events: typeof allBaseEvents) =>
    events.filter(e => {
      if (filterType !== 'all' && e.type !== filterType) return false;
      if (filterCompany !== 'all' && e.company !== filterCompany) return false;
      return true;
    });

  // Events for a given full date string YYYY-MM-DD
  const eventsForDate = (dateStr: string) => {
    const d = new Date(dateStr);
    // For marketing events, match by year+month+day
    return applyFilters(allBaseEvents).filter(e => {
      if (e._fullDate) return e._fullDate === dateStr;
      return e.day === d.getDate() && year === d.getFullYear() && month === d.getMonth();
    });
  };

  // Monthly: events by day number only (within current month)
  const eventsForDayNum = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return eventsForDate(dateStr);
  };

  const selectedDayEvents = selectedDay ? eventsForDate(toLocalDateStr(selectedDay)) : [];

  // Weekly summary stats
  const weekEvents = useMemo(() => {
    return weekDays.flatMap(d => eventsForDate(toLocalDateStr(d)));
  }, [weekDays, allBaseEvents, filterType, filterCompany]);

  /** Month list: group filtered events by date for current month */
  const monthListGroups = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const map = new Map<string, CustomEvent[]>();
    for (const event of applyFilters(allBaseEvents)) {
      const dateStr = event._fullDate;
      if (!dateStr || !dateStr.startsWith(prefix)) continue;
      const list = map.get(dateStr) ?? [];
      list.push(event);
      map.set(dateStr, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, events]) => ({ dateStr, events }));
  }, [allBaseEvents, year, month, filterType, filterCompany]);

  // Reset collapse state when month changes
  useEffect(() => {
    setCollapsedDates(new Set());
  }, [year, month]);

  const toggleDateCollapsed = (dateStr: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const expandAllDates = () => setCollapsedDates(new Set());
  const collapseAllDates = () =>
    setCollapsedDates(new Set(monthListGroups.map(g => g.dateStr)));

  // --- Add / edit / delete (manual upcoming_event only; videos are read-only here) ---
  function closeEventModal() {
    setShowAddModal(false);
    setEditingEventId(null);
    setAddForm(emptyForm());
  }

  function openAddModal(dateStr?: string) {
    setEditingEventId(null);
    setAddForm({ ...emptyForm(), date: dateStr || toLocalDateStr(new Date()) });
    setShowAddModal(true);
  }

  function openEditModal(event: CustomEvent) {
    if (!event.canManage || event.type === 'video') return;
    const source = upcomingEvents.find(e => e.id === event.id);
    setEditingEventId(event.id);
    setAddForm({
      title: event.title,
      type: event.type === 'project' ? 'social' : event.type,
      date: event._fullDate || toLocalDateStr(new Date()),
      company: event.company || '',
      brand: event.brand || '',
      platform: event.platform || '',
      hours: event.hours != null ? String(event.hours) : '',
      notes: event.notes || '',
      status: source?.status ?? 'pending_publish',
    });
    setShowAddModal(true);
  }

  async function saveEvent() {
    if (!addForm.title || !addForm.date || saving) return;
    if (addForm.type === 'video') {
      toast.error('影片請至「影片製作」維護，不可在此新增');
      return;
    }
    setSaving(true);
    const payload = {
      title: addForm.title,
      type: addForm.type,
      date: addForm.date,
      company: addForm.company,
      brand: addForm.brand,
      platform: addForm.platform || undefined,
      hours: addForm.hours ? Number(addForm.hours) : undefined,
      notes: addForm.notes || undefined,
      status: addForm.status,
    };
    const err = editingEventId
      ? await updateUpcomingEvent(editingEventId, payload)
      : await addUpcomingEvent({ id: `evt_${Date.now()}`, ...payload });
    setSaving(false);
    if (err) {
      toast.error(editingEventId ? '更新失敗' : '新增失敗', { description: err.message });
      return;
    }
    toast.success(editingEventId ? '活動已更新' : '活動已新增');
    closeEventModal();
  }

  async function handleDeleteEvent(event: CustomEvent) {
    if (!event.canManage || event.type === 'video') return;
    if (!confirm(`確定刪除活動「${event.title}」？`)) return;
    const err = await deleteUpcomingEvent(event.id);
    if (err) {
      toast.error('刪除失敗', { description: err.message });
      return;
    }
    toast.success('活動已刪除');
  }

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* View toggle — Listview first (default) */}
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg">
            {([
              { id: 'list' as const, label: '月列表' },
              { id: 'weekly' as const, label: '週視圖' },
              { id: 'monthly' as const, label: '月視圖' },
            ]).map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={cn(
                  'px-3 py-1 rounded text-[12px] font-medium transition-colors duration-200',
                  viewMode === v.id
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Navigation */}
          {viewMode === 'weekly' ? (
            <div className="flex items-center gap-1">
              <button onClick={prevWeek} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronLeft size={15} /></button>
              <span className="text-[13px] font-semibold min-w-[220px] text-center">{weekLabel}</span>
              <button onClick={nextWeek} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronRight size={15} /></button>
              <button onClick={goToToday} className="ml-1 px-2.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors">今天</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronLeft size={15} /></button>
              <span className="text-[14px] font-semibold min-w-[130px] text-center">{monthName}</span>
              <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronRight size={15} /></button>
              <button onClick={goToToday} className="ml-1 px-2.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors">今天</button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterCompany}
            onChange={e => setFilterCompany(e.target.value)}
            className="px-2.5 py-1.5 border border-border rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="all">全部公司</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setFilterType('all')} className={cn('px-2.5 py-1 rounded text-[11px] font-medium transition-colors', filterType === 'all' ? 'bg-[#0d1a2d] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>全部</button>
          {Object.entries(typeConfig).map(([key, cfg]) => (
            <button key={key} onClick={() => setFilterType(key)} className={cn('px-2.5 py-1 rounded text-[11px] font-medium transition-colors', filterType === key ? `${cfg.bg} ${cfg.text}` : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{cfg.label}</button>
          ))}
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors"
          >
            <Plus size={12} /> 新增活動
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(typeConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
            <span className="text-[11px] text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* === LIST VIEW (月列表) === */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[12px] text-muted-foreground">
              本月共{' '}
              <span className="font-semibold text-foreground">
                {monthListGroups.reduce((n, g) => n + g.events.length, 0)}
              </span>{' '}
              項活動 · {monthListGroups.length} 個日期
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={expandAllDates}
                className="px-2.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors"
              >
                全部展開
              </button>
              <button
                type="button"
                onClick={collapseAllDates}
                className="px-2.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-muted transition-colors"
              >
                全部摺疊
              </button>
            </div>
          </div>

          {monthListGroups.length === 0 ? (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card py-16 text-center">
              <Calendar size={28} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-[13px] text-muted-foreground">本月暫無活動</p>
              <button
                type="button"
                onClick={() => openAddModal(`${year}-${String(month + 1).padStart(2, '0')}-01`)}
                className="mt-3 text-[12px] text-teal-600 hover:underline inline-flex items-center gap-1"
              >
                <Plus size={12} /> 新增活動
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden divide-y divide-border/60">
              {monthListGroups.map(({ dateStr, events }) => {
                const d = new Date(dateStr + 'T00:00:00');
                const weekday = calendarDays[(d.getDay() + 6) % 7];
                const isToday = dateStr === toLocalDateStr(today);
                const collapsed = collapsedDates.has(dateStr);
                return (
                  <div key={dateStr}>
                    <button
                      type="button"
                      onClick={() => toggleDateCollapsed(dateStr)}
                      className={cn(
                        'w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors',
                        isToday && 'bg-teal-50/50',
                      )}
                    >
                      {collapsed ? (
                        <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                      )}
                      <span
                        className={cn(
                          'text-[13px] font-semibold tabular-nums',
                          isToday ? 'text-teal-700' : 'text-foreground',
                        )}
                      >
                        {month + 1}月{d.getDate()}日
                      </span>
                      <span className="text-[11px] text-muted-foreground">週{weekday}</span>
                      {isToday && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-600 text-white">
                          今天
                        </span>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {events.length} 項
                      </span>
                    </button>

                    {!collapsed && (
                      <div className="px-4 pb-4 pt-2 bg-muted/10">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                          {events.map(event => (
                            <MonthListEventCard
                              key={event.id}
                              event={event}
                              onEdit={openEditModal}
                              onDelete={ev => void handleDeleteEvent(ev)}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => openAddModal(dateStr)}
                          className="mt-2.5 text-[11px] text-muted-foreground hover:text-teal-600 inline-flex items-center gap-1 transition-colors"
                        >
                          <Plus size={11} /> 此日新增
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === WEEKLY VIEW === */}
      {viewMode === 'weekly' && (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            {/* Weekly Summary Bar */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: '本週活動', value: weekEvents.length, color: 'text-foreground' },
                { label: '社交媒體', value: weekEvents.filter(e => e.type === 'social').length, color: 'text-blue-600' },
                { label: '廣告投放', value: weekEvents.filter(e => e.type === 'ads').length, color: 'text-rose-600' },
                { label: '項目事件', value: weekEvents.filter(e => e.type === 'project').length, color: 'text-indigo-600' },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
                  <p className="text-[11px] text-muted-foreground mb-0.5">{stat.label}</p>
                  <p className={cn('text-[22px] font-bold', stat.color)}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Weekly Grid */}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-border/40">
                {weekDays.map((d, i) => {
                  const isToday = d.toDateString() === today.toDateString();
                  const isSelected = selectedDay?.toDateString() === d.toDateString();
                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDay(isSelected ? null : d)}
                      className={cn(
                        'p-3 text-center cursor-pointer transition-colors border-r border-border/30 last:border-r-0',
                        isToday ? 'bg-teal-50' : isSelected ? 'bg-teal-50/60' : 'bg-muted/10 hover:bg-muted/20'
                      )}
                    >
                      <div className="text-[11px] text-muted-foreground mb-1">{calendarDays[i]}</div>
                      <div className={cn(
                        'w-8 h-8 flex items-center justify-center rounded-full text-[14px] font-bold mx-auto',
                        isToday ? 'bg-teal-600 text-white' : isSelected ? 'bg-teal-100 text-teal-700' : 'text-foreground'
                      )}>
                        {d.getDate()}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{d.getMonth() + 1}月</div>
                    </div>
                  );
                })}
              </div>

              {/* Events per day */}
              <div className="grid grid-cols-7">
                {weekDays.map((d, i) => {
                  const dateStr = toLocalDateStr(d);
                  const dayEvents = eventsForDate(dateStr);
                  const isToday = d.toDateString() === today.toDateString();
                  return (
                    <div
                      key={i}
                      className={cn(
                        'min-h-[220px] border-r border-border/30 last:border-r-0 p-1.5',
                        isToday ? 'bg-teal-50/30' : ''
                      )}
                    >
                      <div className="space-y-1">
                        {dayEvents.map(event => {
                          const cfg = typeConfig[event.type] || typeConfig.social;
                          if (event.type === 'video' && event.videoCode) {
                            return (
                              <div
                                key={event.id}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setSelectedDay(d)}
                              >
                                <VideoCalendarChip event={event} />
                              </div>
                            );
                          }
                          return (
                            <div
                              key={event.id}
                              className={cn(
                                'text-[10px] px-1.5 py-1.5 rounded font-medium border cursor-pointer hover:opacity-80 transition-opacity',
                                cfg.bg, cfg.text, cfg.border
                              )}
                              onClick={() => { setSelectedDay(d); }}
                            >
                              <div className="truncate font-semibold leading-tight">{event.title}</div>
                              {event.platform && <div className="opacity-60 mt-0.5 truncate">{event.platform}</div>}
                              {event.projectCategory && (
                                <div className="opacity-60 mt-0.5">{event.projectCategory === 'internal' ? '內部' : '客戶'}</div>
                              )}
                              {event.hours && <div className="opacity-60">{event.hours}h</div>}
                            </div>
                          );
                        })}
                        {dayEvents.length === 0 && (
                          <button
                            onClick={() => openAddModal(dateStr)}
                            className="w-full h-8 flex items-center justify-center text-muted-foreground/30 hover:text-teal-400 hover:bg-teal-50 rounded transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                      </div>
                      {dayEvents.length > 0 && (
                        <button
                          onClick={() => openAddModal(dateStr)}
                          className="mt-1 w-full flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground/50 hover:text-teal-500 hover:bg-teal-50 rounded py-0.5 transition-colors"
                        >
                          <Plus size={9} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project List for the week */}
            {weekEvents.filter(e => e.type === 'project').length > 0 && (
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase size={14} className="text-indigo-600" />
                  <span className="text-[13px] font-semibold">本週項目</span>
                </div>
                <div className="space-y-2">
                  {weekEvents.filter(e => e.type === 'project').map(e => {
                    const proj = allProjects.find(p => `proj-${p.id}` === e.id);
                    const sc = proj ? (statusConfig[proj.status] || statusConfig.active) : null;
                    return (
                      <div key={e.id} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', sc ? sc.color : 'bg-indigo-400')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate">{proj?.name || e.title}</p>
                          <p className="text-[10px] text-muted-foreground">{proj?.company} / {proj?.brand}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {proj?.projectCategory && (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', proj.projectCategory === 'internal' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600')}>
                              {proj.projectCategory === 'internal' ? '內部' : '客戶'}
                            </span>
                          )}
                          {sc && (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', sc.bgColor, sc.textColor)}>
                              {sc.label}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Selected Day Detail Panel */}
          {selectedDay && (
            <div className="w-[260px] shrink-0">
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 sticky top-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-teal-600" />
                    <span className="text-[14px] font-bold">
                      {selectedDay.getMonth() + 1}月 {selectedDay.getDate()}日
                    </span>
                  </div>
                  <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X size={14} />
                  </button>
                </div>
                {selectedDayEvents.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[12px] text-muted-foreground mb-2">當日無行銷活動</p>
                    <button
                      onClick={() => openAddModal(toLocalDateStr(selectedDay))}
                      className="text-[11px] text-teal-600 hover:underline flex items-center gap-1 mx-auto"
                    >
                      <Plus size={10} /> 新增活動
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">{selectedDayEvents.length} 個活動</p>
                    {selectedDayEvents.map(event => {
                      const cfg = typeConfig[event.type] || typeConfig.social;
                      const proj = event.type === 'project' ? allProjects.find(p => `proj-${p.id}` === event.id) : null;
                      if (event.type === 'video' && event.videoCode) {
                        return (
                          <div key={event.id} className="border border-border/50 rounded-md p-2.5 hover:border-teal-200 transition-colors space-y-1.5">
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cfg.bg, cfg.text)}>{cfg.label}</span>
                            <VideoCalendarChip event={event} />
                            {event.channelName && (
                              <p className="text-[10px] text-muted-foreground">{event.channelName}</p>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div key={event.id} className="border border-border/50 rounded-md p-2.5 hover:border-teal-200 transition-colors">
                          <div className="flex items-start justify-between mb-1.5">
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cfg.bg, cfg.text)}>{cfg.label}</span>
                            {event.hours && <span className="text-[10px] text-muted-foreground">{event.hours}h</span>}
                          </div>
                          <p className="text-[12px] font-medium leading-snug">{proj?.name || event.title}</p>
                          {event.platform && <p className="text-[11px] text-muted-foreground mt-0.5">{event.platform}</p>}
                          {event.websiteName && <p className="text-[10px] text-teal-600 mt-0.5">🌐 {event.websiteName}</p>}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {event.company && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{event.company}</span>}
                            {event.brand && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{event.brand}</span>}
                            {proj?.projectCategory && (
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded', proj.projectCategory === 'internal' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600')}>
                                {proj.projectCategory === 'internal' ? '內部' : '客戶'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => openAddModal(toLocalDateStr(selectedDay))}
                      className="w-full mt-1 py-1.5 border border-dashed border-border rounded text-[11px] text-muted-foreground hover:text-teal-600 hover:border-teal-300 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus size={10} /> 新增活動
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === MONTHLY VIEW === */}
      {viewMode === 'monthly' && (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
              <div className="grid grid-cols-7 bg-muted/30">
                {calendarDays.map(d => (
                  <div key={d} className="text-center text-[12px] font-medium text-muted-foreground py-2.5">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfMonth }, (_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] border-t border-r border-border/30 bg-muted/5" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dayEvents = eventsForDayNum(day);
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dateObj = new Date(dateStr + 'T00:00:00');
                  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  const isSelected = selectedDay?.toDateString() === dateObj.toDateString();
                  const previewLimit = 4;
                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : dateObj)}
                      className={cn('min-h-[120px] border-t border-r border-border/30 p-1.5 cursor-pointer transition-colors', isSelected ? 'bg-teal-50 ring-1 ring-inset ring-teal-300' : 'hover:bg-muted/10')}
                    >
                      <div className={cn('w-6 h-6 flex items-center justify-center rounded-full text-[12px] font-medium mb-1', isToday ? 'bg-teal-600 text-white' : 'text-foreground')}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, previewLimit).map(event => {
                          if (event.type === 'video' && event.videoCode) {
                            return <VideoCalendarChip key={event.id} event={event} />;
                          }
                          const cfg = typeConfig[event.type] || typeConfig.social;
                          return (
                            <div key={event.id} className={cn('text-[10px] px-1.5 py-0.5 rounded truncate font-medium', cfg.bg, cfg.text)}>
                              {event.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > previewLimit && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - previewLimit} 更多</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Day Panel */}
          {selectedDay && (
            <div className="w-[260px] shrink-0">
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 sticky top-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-teal-600" />
                    <span className="text-[14px] font-bold">{selectedDay.getMonth() + 1}月 {selectedDay.getDate()}日</span>
                  </div>
                  <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
                </div>
                {selectedDayEvents.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[12px] text-muted-foreground mb-2">當日無活動</p>
                    <button onClick={() => openAddModal(toLocalDateStr(selectedDay))} className="text-[11px] text-teal-600 hover:underline flex items-center gap-1 mx-auto"><Plus size={10} /> 新增活動</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">{selectedDayEvents.length} 個活動</p>
                    {selectedDayEvents.map(event => {
                      const cfg = typeConfig[event.type] || typeConfig.social;
                      const proj = event.type === 'project' ? allProjects.find(p => `proj-${p.id}` === event.id) : null;
                      if (event.type === 'video' && event.videoCode) {
                        return (
                          <div key={event.id} className="border border-border/50 rounded-md p-2.5 hover:border-teal-200 transition-colors space-y-1.5">
                            <div className="flex items-start justify-between gap-1">
                              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cfg.bg, cfg.text)}>{cfg.label}</span>
                              {event.statusText ? (
                                <span
                                  className={cn(
                                    'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                                    event.statusClassName || 'bg-muted text-muted-foreground',
                                  )}
                                >
                                  {event.statusText}
                                </span>
                              ) : null}
                            </div>
                            <VideoCalendarChip event={event} />
                            {event.channelName && (
                              <p className="text-[10px] text-muted-foreground">{event.channelName}</p>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div key={event.id} className="border border-border/50 rounded-md p-2.5 hover:border-teal-200 transition-colors">
                          <div className="flex items-start justify-between mb-1 gap-1">
                            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cfg.bg, cfg.text)}>{cfg.label}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {event.statusText ? (
                                <span
                                  className={cn(
                                    'text-[10px] font-medium px-1.5 py-0.5 rounded',
                                    event.statusClassName || 'bg-muted text-muted-foreground',
                                  )}
                                >
                                  {event.statusText}
                                </span>
                              ) : null}
                              {event.hours ? <span className="text-[10px] text-muted-foreground">{event.hours}h</span> : null}
                            </div>
                          </div>
                          <p className="text-[12px] font-medium">{proj?.name || event.title}</p>
                          {event.platform && <p className="text-[10px] text-muted-foreground mt-0.5">{event.platform}</p>}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {event.company && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{event.company}</span>}
                            {proj?.projectCategory && (
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded', proj.projectCategory === 'internal' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-600')}>
                                {proj.projectCategory === 'internal' ? '內部' : '客戶'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => openAddModal(toLocalDateStr(selectedDay))} className="w-full mt-1 py-1.5 border border-dashed border-border rounded text-[11px] text-muted-foreground hover:text-teal-600 hover:border-teal-300 transition-colors flex items-center justify-center gap-1">
                      <Plus size={10} /> 新增活動
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === ADD / EDIT EVENT MODAL === */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeEventModal}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-teal-600" />
                <h3 className="text-[16px] font-bold">
                  {editingEventId ? '編輯行銷活動' : '新增行銷活動'}
                </h3>
              </div>
              <button type="button" onClick={closeEventModal} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium mb-1">活動名稱 <span className="text-rose-500">*</span></label>
                <input
                  value={addForm.title}
                  onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="輸入活動名稱..."
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium mb-1">類型 <span className="text-rose-500">*</span></label>
                  <select
                    value={addForm.type}
                    onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  >
                    {Object.entries(typeConfig)
                      .filter(([key]) => key !== 'video' && key !== 'project')
                      .map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">日期 <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1">狀態</label>
                <select
                  value={addForm.status}
                  onChange={e => setAddForm(f => ({ ...f, status: e.target.value as UpcomingEventStatus }))}
                  className="w-full px-3 py-2 border border-border rounded text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                >
                  {(Object.entries(UPCOMING_EVENT_STATUS_LABELS) as [UpcomingEventStatus, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ),
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium mb-1">公司</label>
                  <input
                    value={addForm.company}
                    onChange={e => setAddForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="公司名稱"
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">品牌</label>
                  <input
                    value={addForm.brand}
                    onChange={e => setAddForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="品牌名稱"
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium mb-1">平台</label>
                  <input
                    value={addForm.platform}
                    onChange={e => setAddForm(f => ({ ...f, platform: e.target.value }))}
                    placeholder="e.g. Facebook, YouTube"
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">工時 (h)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={addForm.hours}
                    onChange={e => setAddForm(f => ({ ...f, hours: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1">備註</label>
                <textarea
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="選填備註..."
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={closeEventModal} className="px-4 py-2 border border-border rounded text-[12px] font-medium text-muted-foreground hover:bg-muted transition-colors">取消</button>
              <button
                type="button"
                onClick={() => void saveEvent()}
                disabled={!addForm.title || !addForm.date || saving}
                className="px-4 py-2 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {editingEventId ? <Pencil size={13} /> : <Plus size={13} />}
                {saving ? '儲存中...' : editingEventId ? '儲存變更' : '新增活動'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
