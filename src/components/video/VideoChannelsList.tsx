import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, KeyRound, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyDash, MutedFieldBadge } from '@/components/ui/nullable-badge';
import { formatLinkedLoginMethods, type Vchannel } from '@/types/vchannel';
import { useVchannels } from '@/hooks/useVchannels';
import { useVchannelAccounts } from '@/hooks/useVchannelAccounts';
import { useBrands } from '@/hooks/useBrands';
import { DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CHANNEL_LIST_ACCOUNT_COLUMNS,
  PLATFORM_KEYS,
  PLATFORM_LABELS,
  STATUS_KIND_COLORS,
  STATUS_KIND_LABELS,
  accountLabelForPlatform,
  accountPlatformLabel,
  platformStatusSummary,
} from '@/lib/vchannelPlatformStatus';
import { fetchWorkLogTotalsByVchannelIds } from '@/services/videoOutputWorkLogService';
import {
  VchannelAccountFormModal,
  accountToForm,
  emptyAccountForm,
  formToAccountPayload,
} from './VchannelAccountFormModal';
import { VchannelFormModal, VCHANNEL_IMPORTANCE_CONFIG } from './VchannelFormModal';
import { VchannelAccountLoginMethodsDialog } from './VchannelAccountLoginMethodsDialog';

function ChannelWorkHoursCell({ hours }: { hours?: number }) {
  if (hours == null || hours <= 0) {
    return <EmptyDash />;
  }
  return <span className="font-medium text-teal-700 whitespace-nowrap">{hours.toFixed(1)}h</span>;
}

function ChannelAccountLabelCell({ label }: { label: string }) {
  if (!label) {
    return <EmptyDash />;
  }
  return (
    <span className="text-[11px] font-medium truncate max-w-[140px] inline-block align-bottom" title={label}>
      {label}
    </span>
  );
}

function ChannelNameCell({ internalName, publicName }: { internalName: string; publicName: string }) {
  const subtitle = publicName.trim();
  return (
    <div className="min-w-[160px] max-w-[240px]">
      <div className="font-medium leading-tight truncate" title={internalName}>{internalName}</div>
      {subtitle ? (
        <div className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5" title={subtitle}>{subtitle}</div>
      ) : null}
    </div>
  );
}

export function VideoChannelsList() {
  const { channels, loading, error, fetchChannels, deleteChannel } = useVchannels();
  const { brands } = useBrands();
  const {
    accounts,
    error: accountsError,
    addAccount,
    updateAccount,
    fetchAccounts,
    accountsForChannel,
  } = useVchannelAccounts();

  const brandCodeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of brands) map.set(b.id, b.brandCode);
    return map;
  }, [brands]);

  const channelBrandLabel = useCallback((ch: Vchannel) => {
    if (ch.brandCode) return ch.brandCode;
    if (ch.brandListId) return brandCodeById.get(ch.brandListId) ?? '—';
    return '—';
  }, [brandCodeById]);

  const [searchQuery, setSearchQuery] = useState('');
  const [importanceFilter, setImportanceFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  const [channelDialog, setChannelDialog] = useState<{ mode: 'add' } | { mode: 'edit'; channel: Vchannel } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vchannel | null>(null);
  const [deleteReasons, setDeleteReasons] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [loginMethodsChannel, setLoginMethodsChannel] = useState<Vchannel | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [savingAccount, setSavingAccount] = useState(false);
  const [channelWorkHours, setChannelWorkHours] = useState<Map<string, number>>(new Map());

  const refreshChannelWorkHours = useCallback(async (channelIds: string[]) => {
    if (channelIds.length === 0) {
      setChannelWorkHours(new Map());
      return;
    }
    try {
      const totals = await fetchWorkLogTotalsByVchannelIds(channelIds);
      setChannelWorkHours(totals);
    } catch {
      // keep existing totals on refresh failure
    }
  }, []);

  useEffect(() => {
    if (channels.length === 0) {
      setChannelWorkHours(new Map());
      return;
    }
    void refreshChannelWorkHours(channels.map(ch => ch.id));
  }, [channels, refreshChannelWorkHours]);

  const brandFilterOptions = useMemo(
    () => [...new Set(channels.map(c => channelBrandLabel(c)).filter(code => code && code !== '—'))].sort(),
    [channels, channelBrandLabel],
  );

  const filteredChannels = useMemo(() => {
    return channels.filter(ch => {
      if (importanceFilter !== 'all' && ch.importance !== importanceFilter) return false;
      const brandLabel = channelBrandLabel(ch);
      if (brandFilter !== 'all' && brandLabel !== brandFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        ch.channelCode.toLowerCase().includes(q) ||
        ch.internalName.toLowerCase().includes(q) ||
        ch.publicName.toLowerCase().includes(q) ||
        brandLabel.toLowerCase().includes(q)
      );
    });
  }, [channels, searchQuery, importanceFilter, brandFilter, channelBrandLabel]);

  const openEditChannel = (channel: Vchannel) => {
    setChannelDialog({ mode: 'edit', channel });
  };

  const handleDeleteClick = (channel: Vchannel) => {
    const linked = accountsForChannel(channel.channelCode);
    setDeleteTarget(channel);
    setDeleteReasons(linked.length > 0 ? [`此頻道有 ${linked.length} 條平台帳號記錄，請先刪除帳號。`] : []);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteReasons.length > 0) return;
    const err = await deleteChannel(deleteTarget.id);
    if (err) {
      setDeleteReasons([err.message]);
      return;
    }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const openAddAccount = (prefillCode?: string) => {
    setEditingAccountId(null);
    setAccountForm({
      ...emptyAccountForm,
      vchannelCodesRaw: prefillCode ?? '',
      vchannelCodes: prefillCode ? [prefillCode] : [],
    });
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
    setSavingAccount(true);
    const err = editingAccountId
      ? await updateAccount(editingAccountId, payload)
      : await addAccount(payload);
    setSavingAccount(false);
    if (err) {
      alert(typeof err === 'object' && 'message' in err ? err.message : String(err));
      return;
    }
    setShowAccountModal(false);
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">頻道設定</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            管理 Vchannel 基本信息及相應平台信息。
          </p>
        </div>
        {(error || accountsError) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            無法載入 Supabase 資料：{error || accountsError}
          </div>
        )}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">頻道總數</span>
            <p className="text-[18px] font-bold">{channels.length}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">活躍頻道</span>
            <p className="text-[18px] font-bold text-teal-600">{channels.filter(c => c.status === 'active').length}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">平台帳號</span>
            <p className="text-[18px] font-bold">{accounts.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋編號、名稱或品牌..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            />
          </div>
          <Select value={importanceFilter} onValueChange={setImportanceFilter}>
            <SelectTrigger className="w-[120px] h-9 text-[12px]"><SelectValue placeholder="重要性" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部重要性</SelectItem>
              {Object.keys(VCHANNEL_IMPORTANCE_CONFIG).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[140px] h-9 text-[12px]"><SelectValue placeholder="品牌" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品牌</SelectItem>
              {brandFilterOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            onClick={() => setChannelDialog({ mode: 'add' })}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700"
          >
            <Plus size={12} /> 新增頻道
          </button>
        </div>
      </div>

      {loading && channels.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-[13px]">載入頻道資料...</span>
        </div>
      ) : (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-x-auto">
            <table className="w-full text-[13px] min-w-[1180px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">編號</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">頻道名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">品牌</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">重要性</th>
                  {CHANNEL_LIST_ACCOUNT_COLUMNS.map(col => (
                    <th key={col.key} className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{col.label}</th>
                  ))}
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap min-w-[76px]">總工時</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">狀態</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredChannels.map(channel => {
                  const iConfig = VCHANNEL_IMPORTANCE_CONFIG[channel.importance];
                  const isExpanded = expandedChannelId === channel.id;
                  const linkedAccounts = accountsForChannel(channel.channelCode);
                  return (
                    <Fragment key={channel.id}>
                      <tr className="border-t border-border/50 hover:bg-muted/10">
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setExpandedChannelId(isExpanded ? null : channel.id)}
                            className="w-5 h-5 rounded border border-border bg-white text-[13px] font-bold text-teal-700 hover:bg-teal-50"
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] font-bold">{channel.channelCode}</td>
                        <td className="px-3 py-3">
                          <ChannelNameCell internalName={channel.internalName} publicName={channel.publicName} />
                        </td>
                        <td className="px-3 py-3"><MutedFieldBadge value={channelBrandLabel(channel)} className="px-2 py-0.5" /></td>
                        <td className="px-3 py-3">
                          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded', iConfig.bg, iConfig.color)}>{iConfig.label}</span>
                        </td>
                        {CHANNEL_LIST_ACCOUNT_COLUMNS.map(col => (
                          <td key={col.key} className="px-3 py-3">
                            <ChannelAccountLabelCell label={accountLabelForPlatform(linkedAccounts, col.key)} />
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right">
                          <ChannelWorkHoursCell hours={channelWorkHours.get(channel.id)} />
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', channel.status === 'active' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600')}>
                            {channel.status === 'active' ? '活躍' : channel.status === 'paused' ? '暫停' : '已歸檔'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditChannel(channel)} className="p-1 hover:bg-muted rounded" title="編輯"><Edit size={12} className="text-teal-600" /></button>
                            <button onClick={() => setLoginMethodsChannel(channel)} className="p-1 hover:bg-muted rounded" title="帳戶登入方式"><KeyRound size={12} className="text-blue-600" /></button>
                            <button onClick={() => handleDeleteClick(channel)} className="p-1 hover:bg-muted rounded" title="刪除"><Trash2 size={12} className="text-rose-500" /></button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-border/50 bg-slate-50/70">
                          <td />
                          <td colSpan={13} className="px-3 py-3">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="rounded-md border border-border bg-white p-3">
                                <h4 className="text-[12px] font-bold mb-2">平台狀態（summary）</h4>
                                <div className="grid grid-cols-2 gap-2">
                                  {PLATFORM_KEYS.map(key => {
                                    const ps = channel.platformStatus[key];
                                    return (
                                      <div key={key} className="flex items-start gap-2 text-[11px]">
                                        <span className={cn('shrink-0 px-1.5 py-0.5 rounded font-medium', STATUS_KIND_COLORS[ps?.kind ?? 'pending'])}>
                                          {STATUS_KIND_LABELS[ps?.kind ?? 'pending']}
                                        </span>
                                        <div>
                                          <div className="font-medium">{PLATFORM_LABELS[key]}</div>
                                          <div className="text-muted-foreground truncate max-w-[220px]" title={platformStatusSummary(ps)}>
                                            {platformStatusSummary(ps)}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="rounded-md border border-border bg-white overflow-hidden">
                                <div className="px-3 py-2 bg-muted/30 flex justify-between items-center">
                                  <span className="text-[12px] font-bold">平台帳號 (Login)</span>
                                  <button onClick={() => openAddAccount(channel.channelCode)} className="text-[11px] text-teal-600 hover:underline">+ 新增</button>
                                </div>
                                {linkedAccounts.length === 0 ? (
                                  <p className="px-3 py-4 text-[12px] text-muted-foreground">暫無帳號記錄</p>
                                ) : (
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="border-t border-border/50">
                                        <th className="text-left px-2 py-1.5">平台</th>
                                        <th className="text-left px-2 py-1.5">賬號ID</th>
                                        <th className="text-left px-2 py-1.5">登入方式</th>
                                        <th className="text-left px-2 py-1.5">狀態</th>
                                        <th className="text-left px-2 py-1.5">操作</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {linkedAccounts.map(acc => (
                                        <tr key={acc.id} className="border-t border-border/50">
                                          <td className="px-2 py-1.5">{accountPlatformLabel(acc.platform)}</td>
                                          <td className="px-2 py-1.5 font-mono">{acc.accountId || '—'}</td>
                                          <td className="px-2 py-1.5">{formatLinkedLoginMethods(acc) || '—'}</td>
                                          <td className="px-2 py-1.5">
                                            <span className={acc.isActive ? 'text-teal-700' : 'text-amber-700'}>
                                              {acc.isActive ? '啟用' : '停用'}
                                            </span>
                                          </td>
                                          <td className="px-2 py-1.5">
                                            <button onClick={() => openEditAccount(acc)} className="text-teal-600 hover:underline">編輯</button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filteredChannels.length === 0 && (
              <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的頻道</div>
            )}
          </div>
      )}

      <VchannelFormModal
        isOpen={!!channelDialog}
        mode={channelDialog?.mode === 'edit' ? 'edit' : 'add'}
        channel={channelDialog?.mode === 'edit' ? channelDialog.channel : null}
        onClose={() => setChannelDialog(null)}
        onSaved={async () => {
          await fetchChannels();
          await fetchAccounts();
        }}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.internalName || ''}
        canDelete={deleteReasons.length === 0}
        reasons={deleteReasons}
      />

      <VchannelAccountFormModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        editing={!!editingAccountId}
        form={accountForm}
        setForm={setAccountForm}
        saving={savingAccount}
        onSave={saveAccount}
      />

      <VchannelAccountLoginMethodsDialog
        isOpen={!!loginMethodsChannel}
        onClose={() => setLoginMethodsChannel(null)}
        channel={loginMethodsChannel}
        accounts={loginMethodsChannel ? accountsForChannel(loginMethodsChannel.channelCode) : []}
        allAccounts={accounts}
        updateAccount={updateAccount}
      />
    </div>
  );
}
