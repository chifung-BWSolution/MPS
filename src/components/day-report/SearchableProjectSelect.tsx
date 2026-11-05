import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AsanaCaseClosedFilter, AsanaImportFilter } from '@/lib/asanaPendingFilters';
import {
  asanaPitchingProjectFilters,
  filterProjectSelectItems,
  kindsInItems,
  projectSelectKindLabel,
  PROJECT_SELECT_KIND_BADGE_CLASS,
  type ProjectSelectItem,
  type ProjectSelectKind,
  type ProjectSelectKindFilter,
} from '@/lib/searchableProjectSelect';

export type { ProjectSelectItem };

const ASANA_IMPORT_OPTIONS: { id: AsanaImportFilter; label: string }[] = [
  { id: 'pending', label: '待匯入' },
  { id: 'imported', label: '已匯入' },
  { id: 'all', label: '全部匯入狀態' },
];

const ASANA_CASE_CLOSED_OPTIONS: { id: AsanaCaseClosedFilter; label: string }[] = [
  { id: 'pending', label: '未取消' },
  { id: 'closed', label: '已取消跟進' },
  { id: 'all', label: '全部取消狀態' },
];

interface SearchableProjectSelectProps {
  items: ProjectSelectItem[];
  value: string;
  onChange: (id: string, name: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

export function SearchableProjectSelect({
  items,
  value,
  onChange,
  disabled = false,
  placeholder = '搜尋並選擇項目...',
  searchPlaceholder = '搜尋項目名稱...',
  emptyText = '找不到匹配的項目',
  className,
}: SearchableProjectSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<ProjectSelectKindFilter>('all');
  const [asanaProjectFilter, setAsanaProjectFilter] = useState('all');
  const [asanaImportFilter, setAsanaImportFilter] = useState<AsanaImportFilter>('pending');
  const [asanaCaseClosedFilter, setAsanaCaseClosedFilter] = useState<AsanaCaseClosedFilter>('pending');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const typeOptions = useMemo(() => kindsInItems(items), [items]);
  const showTypeFilters = typeOptions.length > 1;
  const asanaProjectOptions = useMemo(() => asanaPitchingProjectFilters(items), [items]);
  const showAsanaProjectFilters = kindFilter === 'asana_task' && asanaProjectOptions.length > 0;

  useEffect(() => {
    if (kindFilter !== 'all' && !typeOptions.includes(kindFilter)) {
      setKindFilter('all');
    }
  }, [kindFilter, typeOptions]);

  useEffect(() => {
    if (kindFilter !== 'asana_task') {
      setAsanaProjectFilter('all');
      return;
    }
    if (asanaProjectFilter !== 'all' && !asanaProjectOptions.some((option) => option.id === asanaProjectFilter)) {
      setAsanaProjectFilter('all');
    }
  }, [asanaProjectFilter, asanaProjectOptions, kindFilter]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearchTerm('');
    setKindFilter('all');
    setAsanaProjectFilter('all');
    setAsanaImportFilter('pending');
    setAsanaCaseClosedFilter('pending');
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const scopedItems = useMemo(
    () => filterProjectSelectItems(items, '', kindFilter, asanaProjectFilter, asanaImportFilter, asanaCaseClosedFilter),
    [items, kindFilter, asanaProjectFilter, asanaImportFilter, asanaCaseClosedFilter],
  );
  const filteredItems = useMemo(
    () => filterProjectSelectItems(items, searchTerm, kindFilter, asanaProjectFilter, asanaImportFilter, asanaCaseClosedFilter),
    [items, searchTerm, kindFilter, asanaProjectFilter, asanaImportFilter, asanaCaseClosedFilter],
  );

  const selectedItem = items.find(item => item.id === value || (!!item.relatedId && item.relatedId === value));

  const handleSelect = useCallback((item: ProjectSelectItem) => {
    onChange(item.id, item.name);
    closeDropdown();
  }, [onChange, closeDropdown]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
    setSearchTerm('');
    setKindFilter('all');
    setAsanaProjectFilter('all');
    setAsanaImportFilter('pending');
    setAsanaCaseClosedFilter('pending');
  }, [onChange]);

  if (disabled) {
    return (
      <div className={cn(
        'w-full px-2.5 py-2 border border-border rounded-md text-[13px] bg-gray-50 text-muted-foreground cursor-not-allowed',
        className
      )}>
        無需關聯
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => (isOpen ? closeDropdown() : setIsOpen(true))}
        className={cn(
          'w-full px-2.5 py-2 border rounded-md text-[13px] text-left flex items-center gap-1.5 transition-all',
          isOpen
            ? 'border-teal-400 ring-2 ring-teal-200 bg-white'
            : 'border-border bg-white hover:border-teal-300',
          className
        )}
      >
        <span className={cn('flex-1 truncate', !selectedItem && 'text-muted-foreground')}>
          {selectedItem ? selectedItem.name : placeholder}
        </span>
        {value && (
          <X
            size={12}
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={handleClear}
          />
        )}
        <ChevronDown size={12} className={cn('text-muted-foreground shrink-0 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 min-w-[280px] bg-white border border-border rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border/60">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 border border-border/60 rounded text-[12px] bg-white focus:bg-white focus:border-teal-300 focus:ring-1 focus:ring-teal-200 outline-none transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            {showTypeFilters && (
              <div
                className="mt-2 flex flex-wrap gap-1"
                onMouseDown={(event) => event.preventDefault()}
              >
                {(['all', ...typeOptions] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={kindFilter === type}
                    onClick={() => {
                      setKindFilter(type);
                      setAsanaProjectFilter('all');
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      kindFilter === type
                        ? 'bg-teal-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {projectSelectKindLabel(type)}
                  </button>
                ))}
              </div>
            )}
            {showAsanaProjectFilters && (
              <div
                className="mt-1.5 flex flex-wrap gap-1"
                onMouseDown={(event) => event.preventDefault()}
              >
                {[{ id: 'all', name: '全部' }, ...asanaProjectOptions].map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    aria-pressed={asanaProjectFilter === project.id}
                    onClick={() => setAsanaProjectFilter(project.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      asanaProjectFilter === project.id
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-50 text-orange-700 hover:bg-orange-100',
                    )}
                  >
                    {project.name}
                  </button>
                ))}
              </div>
            )}
            {kindFilter === 'asana_task' && (
              <div
                className="mt-1.5 flex flex-wrap gap-1"
                onMouseDown={(event) => event.preventDefault()}
              >
                {ASANA_IMPORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={asanaImportFilter === option.id}
                    onClick={() => setAsanaImportFilter(option.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      asanaImportFilter === option.id
                        ? 'bg-teal-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                <span className="mx-0.5 w-px self-stretch bg-border/80" />
                {ASANA_CASE_CLOSED_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={asanaCaseClosedFilter === option.id}
                    onClick={() => setAsanaCaseClosedFilter(option.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                      asanaCaseClosedFilter === option.id
                        ? 'bg-teal-600 text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[288px] overflow-y-auto overscroll-contain">
            {filteredItems.length === 0 ? (
              <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filteredItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-[12px] hover:bg-teal-50 transition-colors flex items-center gap-2',
                    (item.id === value || (!!item.relatedId && item.relatedId === value)) && 'bg-teal-50 text-teal-700 font-medium'
                  )}
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.kind && (
                    <KindBadge type={item.kind} />
                  )}
                  {(item.id === value || (!!item.relatedId && item.relatedId === value)) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-600 shrink-0">已選</span>
                  )}
                </button>
              ))
            )}
          </div>

          {items.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground bg-white">
              {searchTerm
                ? `${filteredItems.length} / ${scopedItems.length} 項目`
                : kindFilter !== 'all'
                  ? `共 ${scopedItems.length} 個項目`
                  : `共 ${items.length} 個項目`
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KindBadge({ type }: { type: ProjectSelectKind }) {
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-0.5 rounded border shrink-0',
      PROJECT_SELECT_KIND_BADGE_CLASS[type],
    )}>
      {projectSelectKindLabel(type)}
    </span>
  );
}
