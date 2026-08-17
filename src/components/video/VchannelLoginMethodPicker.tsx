import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useVideoLoginMethods } from '@/hooks/useVideoLoginMethods';
import {
  VIDEO_LOGIN_METHOD_OPTIONS,
  videoLoginMethodLabel,
  type VideoLoginMethodKind,
} from '@/types/videoLoginMethod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type QuickCreateForm = {
  loginMethod: VideoLoginMethodKind | '';
  displayName: string;
  accountName: string;
  email: string;
};

const emptyQuickCreate = (displayName = ''): QuickCreateForm => ({
  loginMethod: '',
  displayName,
  accountName: '',
  email: '',
});

export function VchannelLoginMethodPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { items, addItem } = useVideoLoginMethods();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [quickCreate, setQuickCreate] = useState<QuickCreateForm | null>(null);

  const selectedIds = value ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(
    () => selectedIds.map(id => items.find(item => item.id === id)).filter(Boolean),
    [items, selectedIds],
  );

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.displayName.localeCompare(b.displayName, 'zh-Hant')),
    [items],
  );

  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? selectedIds.filter(itemId => itemId !== id) : [...selectedIds, id]);
  };

  const openQuickCreate = (displayName = '') => {
    setQuickCreate(emptyQuickCreate(displayName));
    setOpen(false);
  };

  const handleQuickCreate = async () => {
    if (!quickCreate) return;
    if (!quickCreate.loginMethod) {
      toast.error('請選擇登入方式');
      return;
    }
    if (!quickCreate.displayName.trim()) {
      toast.error('請輸入顯示名稱');
      return;
    }

    setCreating(true);
    const result = await addItem({
      loginMethod: quickCreate.loginMethod,
      displayName: quickCreate.displayName,
      accountName: quickCreate.accountName,
      email: quickCreate.email,
      isActive: true,
    });
    setCreating(false);

    if (!result.ok) {
      toast.error('新增登入方式失敗', { description: result.error });
      return;
    }

    onChange(selectedSet.has(result.item.id) ? selectedIds : [...selectedIds, result.item.id]);
    setQuickCreate(null);
    setSearch('');
    toast.success('已新增並選取登入方式');
  };

  return (
    <div className="space-y-2">
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map(item => (
            <span
              key={item!.id}
              className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[12px] text-teal-800"
            >
              <span className="max-w-[180px] truncate">{item!.displayName}</span>
              <button
                type="button"
                onClick={() => toggle(item!.id)}
                className="text-teal-700/70 hover:text-teal-900"
                title="移除"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-[13px] font-normal px-3 bg-white"
          >
            <span className={cn('truncate text-left', selectedItems.length === 0 && 'text-muted-foreground')}>
              {selectedItems.length > 0 ? `已選 ${selectedItems.length} 項` : '搜尋並選擇登入方式'}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="z-[110] w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="搜尋顯示名稱、電郵或帳號…"
              className="h-9 text-[13px]"
            />
            <CommandList>
              <CommandEmpty className="text-[13px] py-3 px-2">
                <div className="text-center text-muted-foreground mb-2">找不到結果</div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-8 text-[12px]"
                  onClick={() => openQuickCreate(search.trim())}
                >
                  <Plus size={12} className="mr-1" />
                  快速新增{search.trim() ? `「${search.trim()}」` : '登入方式'}
                </Button>
              </CommandEmpty>
              <CommandGroup>
                {sortedItems.map(item => {
                  const checked = selectedSet.has(item.id);
                  return (
                    <CommandItem
                      key={item.id}
                      value={[item.displayName, videoLoginMethodLabel(item.loginMethod), item.accountName, item.email, item.phoneNumber, item.id].filter(Boolean).join(' ')}
                      className="text-[13px]"
                      onSelect={() => toggle(item.id)}
                    >
                      <Check className={cn('h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')} />
                      <div className="min-w-0 flex-1">
                        <div className={cn('truncate', !item.isActive && 'opacity-60')}>{item.displayName}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {videoLoginMethodLabel(item.loginMethod)}
                          {item.email ? ` · ${item.email}` : item.accountName ? ` · ${item.accountName}` : ''}
                          {!item.isActive ? ' · 停用' : ''}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full h-8 text-[12px]"
              onClick={() => openQuickCreate(search.trim())}
            >
              <Plus size={12} className="mr-1" />
              快速新增登入方式
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {quickCreate && (
        <div className="rounded-md border border-teal-200 bg-teal-50/40 p-3 space-y-3">
          <div className="text-[12px] font-medium text-teal-800">快速新增登入方式</div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">登入方式 *</label>
            <Select
              value={quickCreate.loginMethod || undefined}
              onValueChange={(next: VideoLoginMethodKind) =>
                setQuickCreate(prev => prev ? { ...prev, loginMethod: next } : prev)
              }
            >
              <SelectTrigger className="h-9 text-[13px] bg-white">
                <SelectValue placeholder="選擇登入方式" />
              </SelectTrigger>
              <SelectContent className="z-[120]">
                {VIDEO_LOGIN_METHOD_OPTIONS.map(option => (
                  <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">顯示名稱 *</label>
            <Input
              value={quickCreate.displayName}
              onChange={e => setQuickCreate(prev => prev ? { ...prev, displayName: e.target.value } : prev)}
              placeholder="在本系統顯示的名稱"
              className="h-9 text-[13px] bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">帳號名稱</label>
              <Input
                value={quickCreate.accountName}
                onChange={e => setQuickCreate(prev => prev ? { ...prev, accountName: e.target.value } : prev)}
                className="h-9 text-[13px] bg-white"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">電郵</label>
              <Input
                type="email"
                value={quickCreate.email}
                onChange={e => setQuickCreate(prev => prev ? { ...prev, email: e.target.value } : prev)}
                className="h-9 text-[13px] bg-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={creating} onClick={() => setQuickCreate(null)}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={creating}
              onClick={() => void handleQuickCreate()}
            >
              {creating ? '新增中…' : '新增並選取'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
