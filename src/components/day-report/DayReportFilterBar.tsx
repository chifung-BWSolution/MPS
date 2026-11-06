import { Calendar, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  StaffDirectoryFilterSelects,
  type StaffDirectoryFilterController,
} from '@/components/day-report/StaffDirectoryFilterSelects';

export type DayReportPeriodOption<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  periods: DayReportPeriodOption<T>[];
  period: T;
  onPeriodChange: (period: T) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  staffFilter: StaffDirectoryFilterController;
};

export function DayReportFilterBar<const T extends string>({
  periods,
  period,
  onPeriodChange,
  label,
  onPrev,
  onNext,
  onToday,
  search,
  onSearchChange,
  staffFilter,
}: Props<T>) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-[rgba(13,26,45,0.08)] px-3 py-2.5 shadow-sm">
      <div className="inline-flex rounded-md border border-[rgba(13,26,45,0.08)] p-0.5">
        {periods.map(({ id, label: periodLabel }) => (
          <button
            key={id}
            type="button"
            onClick={() => onPeriodChange(id)}
            className={cn(
              'px-3 py-1 rounded text-[12px] font-medium transition-colors',
              period === id
                ? 'bg-teal-600 text-white'
                : 'text-muted-foreground hover:text-[#0d1a2d]',
            )}
          >
            {periodLabel}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="上一週期"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium min-w-[148px] justify-center">
          <Calendar size={14} className="text-teal-600" />
          {label}
        </span>
        <button
          type="button"
          onClick={onNext}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="下一週期"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <button
        type="button"
        onClick={onToday}
        className="text-[12px] text-teal-700 hover:underline"
      >
        今天
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <StaffDirectoryFilterSelects filter={staffFilter} />
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜尋人名..."
            aria-label="搜尋人名"
            className="h-8 pl-8 pr-3 border border-[rgba(13,26,45,0.12)] rounded-md text-[13px] bg-white w-[160px] focus:border-teal-300 focus:ring-1 focus:ring-teal-200 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
