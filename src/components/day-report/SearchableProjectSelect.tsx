import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectItem {
  id: string;
  name: string;
}

interface SearchableProjectSelectProps {
  items: SelectItem[];
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
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure the dropdown is rendered
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter items by search term
  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get selected item name for display
  const selectedItem = items.find(item => item.id === value);

  const handleSelect = useCallback((item: SelectItem) => {
    onChange(item.id, item.name);
    setIsOpen(false);
    setSearchTerm('');
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', '');
    setSearchTerm('');
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
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
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

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg overflow-hidden">
          {/* Search Bar */}
          <div className="p-2 border-b border-border/60">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 border border-border/60 rounded text-[12px] bg-gray-50/50 focus:bg-white focus:border-teal-300 focus:ring-1 focus:ring-teal-200 outline-none transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Items List — max 9 items visible (each ~32px height → max-h = 9 * 32px = 288px) */}
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
                    item.id === value && 'bg-teal-50 text-teal-700 font-medium'
                  )}
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.id === value && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-600 shrink-0">已選</span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer with count */}
          {items.length > 0 && (
            <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground bg-gray-50/50">
              {searchTerm
                ? `${filteredItems.length} / ${items.length} 項目`
                : `共 ${items.length} 個項目`
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}
