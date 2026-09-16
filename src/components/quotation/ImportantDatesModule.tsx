import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutList,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuotationSection } from '@/context/QuotationSectionContext';
import { useImportantDates } from '@/hooks/useImportantDates';
import { applyLocationHash, buildSameOriginHref, handleAppHrefClick } from '@/lib/appNavigation';
import { formatLocalIsoDate } from '@/lib/quotationIncomes';
import {
  IMPORTANT_DATE_BRANDS,
  IMPORTANT_DATE_KIND_LABELS,
  IMPORTANT_DATE_KINDS,
  WEEKDAY_LABELS,
  defaultBrandFilters,
  defaultKindFilters,
  eventsInRange,
  filterImportantDateEvents,
  formatImportantDateAmount,
  groupEventsByDate,
  importantDateProjectHash,
  isSameLocalDay,
  listDateTitle,
  monthGridDays,
  periodRange,
  periodTitle,
  shiftPeriod,
  summarizeImportantDates,
  weekDays,
  type ImportantDateBrand,
  type ImportantDateBrandFilter,
  type ImportantDateEvent,
  type ImportantDateKind,
  type ImportantDateKindFilter,
  type ImportantDateView,
} from '@/lib/importantDates';

const KIND_STYLES: Record<ImportantDateKind, { chip: string; dot: string; bar: string }> = {
  project: {
    chip: 'bg-rose-50 text-rose-800 border-rose-100',
    dot: 'bg-rose-400',
    bar: 'border-l-rose-400',
  },
  income: {
    chip: 'bg-amber-50 text-amber-800 border-amber-100',
    dot: 'bg-amber-400',
    bar: 'border-l-amber-400',
  },
  expense: {
    chip: 'bg-sky-50 text-sky-800 border-sky-100',
    dot: 'bg-sky-400',
    bar: 'border-l-sky-400',
  },
  schedule: {
    chip: 'bg-teal-50 text-teal-800 border-teal-100',
    dot: 'bg-teal-500',
    bar: 'border-l-teal-500',
  },
};

const VIEW_OPTIONS: Array<{ id: ImportantDateView; label: string; icon: typeof CalendarDays }> = [
  { id: 'week', label: '週', icon: CalendarRange },
  { id: 'month', label: '月', icon: CalendarDays },
  { id: 'list', label: '列表', icon: LayoutList },
];

function openEvent(event: ImportantDateEvent, nativeEvent?: { ctrlKey?: boolean; metaKey?: boolean; button?: number; preventDefault?: () => void }) {
  const hash = importantDateProjectHash(event);
  if (nativeEvent) {
    handleAppHrefClick(nativeEvent, buildSameOriginHref(hash), () => {
      applyLocationHash(hash);
    });
    return;
  }
  applyLocationHash(hash);
}

function EventChip({
  event,
  compact,
}: {
  event: ImportantDateEvent;
  compact?: boolean;
}) {
  const amount = formatImportantDateAmount(event.amount, event.currency);
  return (
    <a
      href={buildSameOriginHref(importantDateProjectHash(event))}
      onClick={(nativeEvent) => {
        nativeEvent.preventDefault();
        openEvent(event, nativeEvent);
      }}
      className={cn(
        'block rounded-md border px-1.5 py-1 text-left transition-colors hover:brightness-95',
        KIND_STYLES[event.kind].chip,
        compact && 'px-1 py-0.5',
      )}
      title={`${event.title} · ${event.projectName}`}
    >
      <div className={cn('truncate font-medium', compact ? 'text-[10px] leading-4' : 'text-[11px] leading-4')}>
        {event.kind === 'income' || event.kind === 'expense' ? `$ ${event.title}` : event.title}
      </div>
      <div className={cn('truncate text-current/70', compact ? 'text-[9px] leading-3' : 'text-[10px] leading-3')}>
        {event.projectCode || event.projectName}
        {amount ? ` · ${amount}` : ''}
        {event.overdue ? ' · 逾期' : ''}
      </div>
    </a>
  );
}

function ListEventRow({ event }: { event: ImportantDateEvent }) {
  const amount = formatImportantDateAmount(event.amount, event.currency);
  return (
    <a
      href={buildSameOriginHref(importantDateProjectHash(event))}
      onClick={(nativeEvent) => {
        nativeEvent.preventDefault();
        openEvent(event, nativeEvent);
      }}
      className={cn(
        'flex items-start gap-3 rounded-xl border border-border bg-white px-4 py-3 hover:bg-muted/30',
        'border-l-4',
        KIND_STYLES[event.kind].bar,
      )}
    >
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_STYLES[event.kind].dot)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">{event.title}</span>
          {event.brand && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {event.brand}
            </span>
          )}
          {event.overdue && (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">逾期</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{event.subtitle}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {event.projectCode && <span>{event.projectCode}</span>}
          {event.pmName && <span>{event.pmName}</span>}
          <span>{IMPORTANT_DATE_KIND_LABELS[event.kind]}</span>
          {amount && <span>{amount}</span>}
        </div>
      </div>
    </a>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof CalendarDays;
  value: number;
  label: string;
  tone?: 'rose';
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            tone === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon size={16} />
        </span>
        <div>
          <div className="text-[22px] font-semibold leading-none tracking-tight">{value.toLocaleString()}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

export function ImportantDatesModule() {
  const { moduleId } = useQuotationSection();
  const { events, loading, error } = useImportantDates();
  const [view, setView] = useState<ImportantDateView>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [brands, setBrands] = useState<ImportantDateBrandFilter>(() => defaultBrandFilters(moduleId));
  const [kinds, setKinds] = useState<ImportantDateKindFilter>(() => defaultKindFilters());

  useEffect(() => {
    setBrands(defaultBrandFilters(moduleId));
  }, [moduleId]);

  const filtered = useMemo(
    () => filterImportantDateEvents(events, brands, kinds),
    [events, brands, kinds],
  );
  const { start, end } = useMemo(() => periodRange(cursor, view), [cursor, view]);
  const visible = useMemo(() => eventsInRange(filtered, start, end), [filtered, start, end]);
  const grouped = useMemo(() => groupEventsByDate(visible), [visible]);
  const today = useMemo(() => new Date(), []);
  const todayIso = formatLocalIsoDate(today);
  const stats = useMemo(
    () => summarizeImportantDates(filtered, start, end, todayIso),
    [filtered, start, end, todayIso],
  );
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ImportantDateEvent[]>();
    for (const event of visible) {
      const list = map.get(event.date);
      if (list) list.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [visible]);

  const allKindsOn = IMPORTANT_DATE_KINDS.every((kind) => kinds[kind]);
  const periodCountLabel = view === 'week' ? '本週事項' : '今月事項';

  const toggleBrand = (brand: ImportantDateBrand) => {
    setBrands((prev) => ({ ...prev, [brand]: !prev[brand] }));
  };

  const toggleKind = (kind: ImportantDateKind | 'all') => {
    if (kind === 'all') {
      setKinds(defaultKindFilters());
      return;
    }
    setKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const subtitle =
    moduleId === 'system-dev'
      ? 'BWT 客戶項目日期、收支到期與自訂排程'
      : 'BWL 客戶項目日期、收支到期與自訂排程';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <CalendarDays size={20} />
          </span>
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">重要日子</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>數據來源</span>
            {IMPORTANT_DATE_BRANDS.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => toggleBrand(brand)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                  brands[brand]
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-border bg-white text-muted-foreground hover:bg-muted',
                )}
              >
                {brand}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-border bg-white">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = view === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors',
                    active ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted',
                  )}
                  aria-pressed={active}
                >
                  <Icon size={14} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={CalendarDays} value={stats.total} label="事項總數" />
        <StatCard icon={CalendarRange} value={stats.periodCount} label={periodCountLabel} />
        <StatCard icon={FolderKanban} value={stats.projectCount} label="涉及項目" />
        <StatCard icon={DollarSign} value={stats.incomeCount} label="收款到期" />
        <StatCard icon={AlertCircle} value={stats.overdueIncomeCount} label="逾期收款" tone="rose" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(new Date())}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium hover:bg-muted"
          >
            今日
          </button>
          <button
            type="button"
            onClick={() => setCursor((prev) => shiftPeriod(prev, view, -1))}
            className="rounded-md p-1.5 hover:bg-muted"
            aria-label="上一期"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setCursor((prev) => shiftPeriod(prev, view, 1))}
            className="rounded-md p-1.5 hover:bg-muted"
            aria-label="下一期"
          >
            <ChevronRight size={16} />
          </button>
          <span className="px-2 text-[16px] font-semibold">{periodTitle(cursor, view)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleKind('all')}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] font-medium',
              allKindsOn ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            全部
          </button>
          {IMPORTANT_DATE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium',
                kinds[kind] && !allKindsOn
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {IMPORTANT_DATE_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
          載入重要日子失敗：{error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-white py-16 text-center text-[13px] text-muted-foreground">
          載入重要日子中…
        </div>
      ) : view === 'list' ? (
        <ListView groups={grouped} />
      ) : view === 'week' ? (
        <WeekView cursor={cursor} today={today} eventsByDate={eventsByDate} />
      ) : (
        <MonthView cursor={cursor} today={today} eventsByDate={eventsByDate} />
      )}
    </div>
  );
}

function ListView({ groups }: { groups: Array<{ date: string; events: ImportantDateEvent[] }> }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white py-16 text-center text-[13px] text-muted-foreground">
        此期間沒有符合篩選的日子
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.date} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[14px] font-semibold">{listDateTitle(group.date)}</h2>
            <span className="text-[12px] text-muted-foreground">{group.events.length} 個事項</span>
          </div>
          <div className="space-y-2">
            {group.events.map((event) => (
              <ListEventRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function WeekView({
  cursor,
  today,
  eventsByDate,
}: {
  cursor: Date;
  today: Date;
  eventsByDate: Map<string, ImportantDateEvent[]>;
}) {
  const days = weekDays(cursor);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {days.map((day, index) => {
          const isToday = isSameLocalDay(day, today);
          return (
            <div key={formatLocalIsoDate(day)} className="px-3 py-3 text-center">
              <div className="text-[11px] text-muted-foreground">星期{WEEKDAY_LABELS[index]}</div>
              <div className={cn('mt-1 text-[18px] font-semibold', isToday && 'text-teal-700')}>
                {day.getDate()}
              </div>
              <div className="text-[11px] text-muted-foreground">{day.getMonth() + 1}月</div>
            </div>
          );
        })}
      </div>
      <div className="grid min-h-[420px] grid-cols-7">
        {days.map((day) => {
          const iso = formatLocalIsoDate(day);
          const dayEvents = eventsByDate.get(iso) ?? [];
          return (
            <div key={iso} className="space-y-1.5 border-r border-border/70 p-2 last:border-r-0">
              {dayEvents.map((event) => (
                <EventChip key={event.id} event={event} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  cursor,
  today,
  eventsByDate,
}: {
  cursor: Date;
  today: Date;
  eventsByDate: Map<string, ImportantDateEvent[]>;
}) {
  const days = monthGridDays(cursor);
  const month = cursor.getMonth();
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2 text-center text-[12px] font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const iso = formatLocalIsoDate(day);
          const inMonth = day.getMonth() === month;
          const isToday = isSameLocalDay(day, today);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const extra = Math.max(0, dayEvents.length - 3);
          return (
            <div
              key={iso}
              className={cn(
                'min-h-[128px] border-b border-r border-border/70 p-1.5 last:border-r-0',
                !inMonth && 'bg-muted/20',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-medium',
                    isToday && 'bg-teal-600 text-white',
                    !isToday && !inMonth && 'text-muted-foreground/60',
                  )}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{dayEvents.length}</span>
                )}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventChip key={event.id} event={event} compact />
                ))}
                {extra > 0 && (
                  <div className="px-1 text-[10px] text-muted-foreground">+{extra} 更多</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
