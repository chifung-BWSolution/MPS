import { cn } from '@/lib/utils';

export const WORKFLOW_STATUS_PILL_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition-all duration-200 cursor-pointer select-none';

export const WORKFLOW_STATUS_PILL_INACTIVE =
  'border-border/70 bg-white text-muted-foreground shadow-sm hover:bg-muted/50 hover:border-border hover:text-foreground hover:shadow';

export type WorkflowStatusSummaryItem = {
  id: string;
  label: string;
  activeClassName: string;
};

type Props = {
  filteredCount: number;
  contextCount: number;
  activeFilter: 'all' | string;
  items: WorkflowStatusSummaryItem[];
  counts: Record<string, number>;
  onSelectAll: () => void;
  onSelectItem: (id: string) => void;
  ariaLabel: string;
};

export function WorkflowStatusSummaryBar({
  filteredCount,
  contextCount,
  activeFilter,
  items,
  counts,
  onSelectAll,
  onSelectItem,
  ariaLabel,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={onSelectAll}
        className={cn(
          WORKFLOW_STATUS_PILL_BASE,
          activeFilter === 'all'
            ? 'border-teal-600 bg-teal-600 text-white shadow-sm hover:bg-teal-700 hover:border-teal-700'
            : WORKFLOW_STATUS_PILL_INACTIVE,
        )}
      >
        <span>顯示</span>
        <span className="tabular-nums font-semibold">{filteredCount}</span>
        <span>/</span>
        <span className="tabular-nums">{contextCount}</span>
        <span>部</span>
      </button>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem(item.id)}
          className={cn(
            WORKFLOW_STATUS_PILL_BASE,
            activeFilter === item.id
              ? cn(item.activeClassName, 'border-transparent ring-2 ring-teal-600/25 shadow-sm')
              : WORKFLOW_STATUS_PILL_INACTIVE,
          )}
        >
          <span>{item.label}</span>
          <span className={cn('tabular-nums font-semibold', activeFilter !== item.id && 'text-foreground/80')}>
            {counts[item.id] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}
