import { useMemo, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VchannelAccount } from '@/types/vchannel';
import { formatChannelCodes } from '@/types/vchannel';
import {
  accountMatchesPickerQuery,
  accountPickerLabel,
} from '@/lib/vchannelAccountLink';

export function ChannelAccountPicker({
  accounts,
  selectedIds,
  onChange,
  onAddAccount,
  disabled = false,
  disabledReason,
}: {
  accounts: VchannelAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onAddAccount: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedAccounts = useMemo(
    () => accounts.filter(account => selectedSet.has(account.id)),
    [accounts, selectedSet],
  );

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter(account => accountMatchesPickerQuery(account, query))
      .sort((left, right) => {
        const leftSelected = selectedSet.has(left.id) ? 0 : 1;
        const rightSelected = selectedSet.has(right.id) ? 0 : 1;
        if (leftSelected !== rightSelected) return leftSelected - rightSelected;
        return accountPickerLabel(left).localeCompare(accountPickerLabel(right), 'zh-Hant');
      });
  }, [accounts, query, selectedSet]);

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(selectedSet.has(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id]);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <label className="text-[12px] font-medium text-muted-foreground">平台帳戶</label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {selectedIds.length > 0 ? `已選 ${selectedIds.length} 個` : '可多選'}
          </span>
          <button
            type="button"
            onClick={onAddAccount}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-600 hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            <Plus size={11} /> 新增帳戶
          </button>
        </div>
      </div>

      {disabled && disabledReason ? (
        <p className="text-[11px] text-muted-foreground mb-2">{disabledReason}</p>
      ) : null}

      {selectedAccounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedAccounts.map(account => (
            <span
              key={account.id}
              className="inline-flex items-center gap-1 max-w-full rounded-full bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 text-[11px]"
            >
              <span className="truncate">{accountPickerLabel(account)}</span>
              <button
                type="button"
                onClick={() => toggle(account.id)}
                disabled={disabled}
                className="text-teal-700 hover:text-rose-600 disabled:opacity-40"
                aria-label={`移除 ${accountPickerLabel(account)}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm mb-2 bg-white">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={disabled}
          className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-muted-foreground disabled:cursor-not-allowed"
          placeholder="搜尋名稱、平台、賬號 ID 或頻道編號..."
        />
      </div>

      <div className="space-y-0 max-h-[220px] overflow-y-auto border border-border rounded-md bg-white">
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-6 text-[12px] text-muted-foreground">
            {accounts.length === 0 ? '尚無平台帳戶，請先新增' : '沒有符合的平台帳戶'}
          </div>
        ) : (
          filteredAccounts.map(account => {
            const isSelected = selectedSet.has(account.id);
            const codes = formatChannelCodes(account.vchannelCodes);
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => toggle(account.id)}
                disabled={disabled}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-left border-b border-border/50 last:border-0 disabled:cursor-not-allowed disabled:opacity-60',
                  isSelected ? 'bg-teal-50' : 'hover:bg-muted/30',
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                    isSelected ? 'border-teal-600 bg-teal-600' : 'border-muted-foreground/30',
                  )}
                >
                  {isSelected && <Check size={10} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium block truncate">{accountPickerLabel(account)}</span>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {codes || '尚未關聯頻道'}
                    {account.accountId ? ` · ${account.accountId}` : ''}
                    {account.isActive === false ? ' · 停用' : ''}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
