import { useMemo, useState } from 'react';
import { Plus, Loader2, ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatChannelCodes, formatLinkedLoginMethods } from '@/types/vchannel';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ACCOUNT_SORT_COLUMNS,
  sortVchannelAccounts,
  type AccountSortDir,
  type AccountSortKey,
} from '@/lib/vchannelAccountSort';
import { useVchannelAccounts } from '@/hooks/useVchannelAccounts';
import { accountPlatformLabel } from '@/lib/vchannelPlatformStatus';
import {
  accountListMetrics,
  accountPlatformOptions,
  filterVchannelAccounts,
} from '@/lib/vchannelAccountList';
import {
  VchannelAccountDeleteModal,
  VchannelAccountFormModal,
  accountToForm,
  emptyAccountForm,
  formToAccountPayload,
} from './VchannelAccountFormModal';

function AccountSortableTh({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: AccountSortKey;
  activeKey: AccountSortKey;
  sortDir: AccountSortDir;
  onSort: (key: AccountSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className="text-left px-3 py-2 font-medium"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <span>{label}</span>
        <Icon size={12} className={cn(active ? 'text-teal-600' : 'opacity-40')} />
      </button>
    </th>
  );
}

export function VideoAccountsList() {
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    addAccount,
    updateAccount,
    deleteAccount,
  } = useVchannelAccounts();

  const [saving, setSaving] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<{ id: string; label: string } | null>(null);
  const [accountSortKey, setAccountSortKey] = useState<AccountSortKey>('vchannel');
  const [accountSortDir, setAccountSortDir] = useState<AccountSortDir>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const accountMetrics = useMemo(() => accountListMetrics(accounts), [accounts]);
  const platformOptions = useMemo(() => accountPlatformOptions(accounts), [accounts]);
  const filteredAccounts = useMemo(
    () => filterVchannelAccounts(accounts, { searchQuery, platformFilter, statusFilter }),
    [accounts, searchQuery, platformFilter, statusFilter],
  );

  const sortedAccounts = useMemo(
    () => sortVchannelAccounts(filteredAccounts, accountSortKey, accountSortDir),
    [filteredAccounts, accountSortKey, accountSortDir],
  );

  const onAccountSort = (key: AccountSortKey) => {
    if (accountSortKey === key) {
      setAccountSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setAccountSortKey(key);
    setAccountSortDir('asc');
  };

  const openAddAccount = () => {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm);
    setShowAccountModal(true);
  };

  const openEditAccount = (account: typeof accounts[0]) => {
    setEditingAccountId(account.id);
    setAccountForm(accountToForm(account));
    setShowAccountModal(true);
  };

  const saveAccount = async () => {
    const payload = formToAccountPayload(accountForm);
    if (!payload) return;
    setSaving(true);
    const err = editingAccountId
      ? await updateAccount(editingAccountId, payload)
      : await addAccount(payload);
    setSaving(false);
    if (err) {
      alert(typeof err === 'object' && 'message' in err ? err.message : String(err));
      return;
    }
    setShowAccountModal(false);
  };

  const confirmDeleteAccount = async () => {
    if (!deleteAccountTarget) return;
    await deleteAccount(deleteAccountTarget.id);
    setDeleteAccountTarget(null);
  };

  const toggleAccountActive = async (account: typeof accounts[0]) => {
    const err = await updateAccount(account.id, { isActive: !account.isActive });
    if (err) {
      alert(typeof err === 'object' && 'message' in err ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">平台帳號</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            管理 Vchannel 對應的平台帳號（Login），支援 V12/V14 等多頻道共用。
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">帳號總數</span>
            <p className="text-[18px] font-bold">{accountMetrics.total}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">啟用帳號</span>
            <p className="text-[18px] font-bold text-teal-600">{accountMetrics.active}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">關聯頻道</span>
            <p className="text-[18px] font-bold">{accountMetrics.channels}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋編號、名稱或平台..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[140px] h-9 text-[12px]"><SelectValue placeholder="平台" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              {platformOptions.map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 text-[12px]"><SelectValue placeholder="狀態" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="active">啟用</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={openAddAccount}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700"
          >
            <Plus size={12} /> 新增帳號
          </button>
        </div>
        {accountsError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            無法載入 Supabase 資料：{accountsError}
          </div>
        )}
      </div>

      {accountsLoading && accounts.length === 0 ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center">
          <Loader2 className="animate-spin" size={16} /> 載入中...
        </div>
      ) : (
        <div className="bg-white rounded-md border shadow-card overflow-x-auto">
          <table className="w-full text-[12px] min-w-[800px]">
            <thead className="bg-muted/30">
              <tr>
                {ACCOUNT_SORT_COLUMNS.map(col => (
                  <AccountSortableTh
                    key={col.key}
                    label={col.label}
                    sortKey={col.key}
                    activeKey={accountSortKey}
                    sortDir={accountSortDir}
                    onSort={onAccountSort}
                  />
                ))}
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map(acc => {
                const loginLabel = formatLinkedLoginMethods(acc);
                return (
                <tr key={acc.id} className={cn('border-t border-border/50 hover:bg-muted/10', !acc.isActive && 'opacity-60')}>
                  <td className="px-3 py-2 font-mono font-bold">{formatChannelCodes(acc.vchannelCodes)}</td>
                  <td className="px-3 py-2">{acc.accountLabel}</td>
                  <td className="px-3 py-2">{accountPlatformLabel(acc.platform)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] max-w-[140px] truncate" title={acc.accountId}>{acc.accountId || '—'}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    {acc.linkedLoginMethods.length > 0 ? (
                      <div className="flex flex-wrap gap-1" title={loginLabel}>
                        {acc.linkedLoginMethods.map(method => (
                          <span
                            key={method.id}
                            className={cn(
                              'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]',
                              method.isActive
                                ? 'border-teal-200 bg-teal-50 text-teal-800'
                                : 'border-slate-200 bg-slate-50 text-slate-600',
                            )}
                          >
                            {method.displayName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="truncate block text-muted-foreground" title={acc.loginMethod}>{acc.loginMethod || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{acc.feedhiveManaged ? '✓' : '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={acc.isActive}
                        onCheckedChange={() => void toggleAccountActive(acc)}
                      />
                      <span className={cn('text-[12px]', acc.isActive ? 'text-teal-700' : 'text-amber-700')}>
                        {acc.isActive ? '啟用' : '停用'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openEditAccount(acc)} className="text-teal-600 hover:underline">編輯</button>
                      <button
                        onClick={() => setDeleteAccountTarget({
                          id: acc.id,
                          label: `${formatChannelCodes(acc.vchannelCodes)} / ${accountPlatformLabel(acc.platform)}`,
                        })}
                        className="text-rose-500 hover:underline"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {sortedAccounts.length === 0 && (
            <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的平台帳號</div>
          )}
        </div>
      )}

      <VchannelAccountFormModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        editing={!!editingAccountId}
        form={accountForm}
        setForm={setAccountForm}
        saving={saving}
        onSave={saveAccount}
      />
      <VchannelAccountDeleteModal
        target={deleteAccountTarget}
        onClose={() => setDeleteAccountTarget(null)}
        onConfirm={confirmDeleteAccount}
      />
    </div>
  );
}
