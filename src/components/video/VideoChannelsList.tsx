import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, KeyRound, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Vchannel, VchannelImportance, VchannelStatus } from '@/types/vchannel';
import { formatChannelCodes, parseChannelCodes } from '@/types/vchannel';
import { useVchannels } from '@/hooks/useVchannels';
import { useVchannelAccounts } from '@/hooks/useVchannelAccounts';
import { useBrands } from '@/hooks/useBrands';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PLATFORM_KEYS,
  PLATFORM_LABELS,
  STATUS_KIND_COLORS,
  STATUS_KIND_LABELS,
  accountPlatformLabel,
  normalizeAccountPlatform,
  type PlatformKey,
  type PlatformStatusKind,
  type PlatformStatusValue,
  parsePlatformStatus,
  platformStatusSummary,
} from '@/lib/vchannelPlatformStatus';
import { fetchWorkLogTotalsByVchannelIds } from '@/services/videoOutputWorkLogService';

function ChannelWorkHoursCell({ hours }: { hours?: number }) {
  if (hours == null || hours <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-medium text-teal-700 whitespace-nowrap">{hours.toFixed(1)}h</span>;
}

const importanceConfig = {
  A1: { label: 'A1', color: 'text-rose-700', bg: 'bg-rose-100', description: '最高重要' },
  A2: { label: 'A2', color: 'text-amber-700', bg: 'bg-amber-100', description: '高重要' },
  A3: { label: 'A3', color: 'text-blue-700', bg: 'bg-blue-100', description: '中等' },
  A4: { label: 'A4', color: 'text-slate-700', bg: 'bg-slate-100', description: '低重要' },
  A5: { label: 'A5', color: 'text-gray-600', bg: 'bg-gray-100', description: '最低' },
};

const emptyChannel = {
  channelCode: '',
  internalName: '',
  publicName: '',
  importance: 'A3' as VchannelImportance,
  brandListId: '' as string,
  status: 'active' as VchannelStatus,
  platformStatus: {} as Record<string, PlatformStatusValue>,
  notes: '',
};

const emptyAccount = {
  vchannelCodes: [] as string[],
  vchannelCodesRaw: '',
  accountLabel: '',
  channelIntro: '',
  platform: '',
  accountId: '',
  accountPassword: '',
  loginMethod: '',
  operatorCode: '',
  feedhiveManaged: false,
  notes: '',
  sortOrder: 0,
};

function PlatformStatusEditor({
  value,
  onChange,
}: {
  value: Record<string, PlatformStatusValue>;
  onChange: (next: Record<string, PlatformStatusValue>) => void;
}) {
  const update = (key: PlatformKey, patch: Partial<PlatformStatusValue>) => {
    const current = value[key] ?? { kind: 'pending' as PlatformStatusKind };
    onChange({ ...value, [key]: { ...current, ...patch } });
  };

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {PLATFORM_KEYS.map(key => {
        const ps = value[key] ?? { kind: 'pending' as PlatformStatusKind };
        return (
          <div key={key} className="grid grid-cols-[100px_120px_1fr] gap-2 items-start border border-border/50 rounded-md p-2">
            <span className="text-[12px] font-medium pt-2">{PLATFORM_LABELS[key]}</span>
            <Select
              value={ps.kind}
              onValueChange={(kind: PlatformStatusKind) => update(key, { kind, raw_text: ps.raw_text ?? '' })}
            >
              <SelectTrigger className="h-8 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_KIND_LABELS) as PlatformStatusKind[]).map(k => (
                  <SelectItem key={k} value={k}>{STATUS_KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={ps.kind === 'url' ? (ps.url ?? ps.raw_text ?? '') : (ps.raw_text ?? '')}
              onChange={e => {
                const text = e.target.value;
                if (ps.kind === 'url') update(key, parsePlatformStatus(text));
                else update(key, { ...ps, raw_text: text, ...(ps.kind === 'opened' ? parsePlatformStatus(text) : {}) });
              }}
              placeholder="URL 或狀態描述"
              className="h-8 text-[11px]"
            />
          </div>
        );
      })}
    </div>
  );
}

function ChannelForm({
  form,
  setForm,
  brandOptions,
}: {
  form: typeof emptyChannel;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyChannel>>;
  brandOptions: { id: string; brandCode: string; displayName: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道編號 *</label>
          <Input
            value={form.channelCode}
            onChange={e => setForm({ ...form, channelCode: e.target.value.toUpperCase() })}
            className="h-9 text-[13px]"
            placeholder="V01"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌分類 *</label>
          <Select
            value={form.brandListId || undefined}
            onValueChange={val => setForm({ ...form, brandListId: val })}
          >
            <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇品牌" /></SelectTrigger>
            <SelectContent>
              {brandOptions.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.brandCode}{b.displayName !== b.brandCode ? ` — ${b.displayName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">內部名稱 *</label>
        <Input value={form.internalName} onChange={e => setForm({ ...form, internalName: e.target.value })} className="h-9 text-[13px]" />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">公開頻道名稱 *</label>
        <Input value={form.publicName} onChange={e => setForm({ ...form, publicName: e.target.value })} className="h-9 text-[13px]" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">重要性</label>
          <Select value={form.importance} onValueChange={(val: VchannelImportance) => setForm({ ...form, importance: val })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(importanceConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{k} - {v.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
          <Select value={form.status} onValueChange={(val: VchannelStatus) => setForm({ ...form, status: val })}>
            <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">活躍</SelectItem>
              <SelectItem value="paused">暫停</SelectItem>
              <SelectItem value="archived">已歸檔</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-2">平台狀態矩陣</label>
        <PlatformStatusEditor value={form.platformStatus} onChange={platformStatus => setForm({ ...form, platformStatus })} />
      </div>
    </div>
  );
}

export function VideoChannelsList() {
  const { channels, loading, error, addChannel, updateChannel, deleteChannel } = useVchannels();
  const { brands } = useBrands();
  const {
    accounts,
    loading: accountsLoading,
    addAccount,
    updateAccount,
    deleteAccount,
    accountsForChannel,
  } = useVchannelAccounts();

  const activeBrandOptions = useMemo(
    () => brands.filter(b => b.isActive).map(b => ({ id: b.id, brandCode: b.brandCode, displayName: b.displayName })),
    [brands],
  );

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

  const [activeTab, setActiveTab] = useState<'channels' | 'accounts'>('channels');
  const [searchQuery, setSearchQuery] = useState('');
  const [importanceFilter, setImportanceFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState(emptyChannel);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState(emptyChannel);
  const [deleteTarget, setDeleteTarget] = useState<Vchannel | null>(null);
  const [deleteReasons, setDeleteReasons] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<{ id: string; label: string } | null>(null);
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

  const openedPlatformCount = (ch: Vchannel) =>
    PLATFORM_KEYS.filter(k => {
      const ps = ch.platformStatus[k];
      return ps && ps.kind !== 'pending' && ps.kind !== 'n/a';
    }).length;

  const handleAdd = async () => {
    if (!newChannel.channelCode.trim() || !newChannel.internalName.trim() || !newChannel.brandListId) return;
    setSaving(true);
    const err = await addChannel({
      ...newChannel,
      brandListId: newChannel.brandListId || null,
    });
    setSaving(false);
    if (err) {
      alert(typeof err === 'object' && 'message' in err ? err.message : String(err));
      return;
    }
    setNewChannel(emptyChannel);
    setShowAddModal(false);
  };

  const handleSaveEdit = async () => {
    if (!editingChannelId) return;
    setSaving(true);
    const err = await updateChannel(editingChannelId, {
      channelCode: editForm.channelCode,
      internalName: editForm.internalName,
      publicName: editForm.publicName,
      importance: editForm.importance,
      brandListId: editForm.brandListId || null,
      status: editForm.status,
      platformStatus: editForm.platformStatus,
      notes: editForm.notes,
    });
    setSaving(false);
    if (err) {
      alert(typeof err === 'object' && 'message' in err ? err.message : String(err));
      return;
    }
    setShowEditModal(false);
    setEditingChannelId(null);
  };

  const openEditChannel = (channel: Vchannel) => {
    setEditingChannelId(channel.id);
    setEditForm({
      channelCode: channel.channelCode,
      internalName: channel.internalName,
      publicName: channel.publicName,
      importance: channel.importance,
      brandListId: channel.brandListId ?? '',
      status: channel.status,
      platformStatus: channel.platformStatus,
      notes: channel.notes ?? '',
    });
    setShowEditModal(true);
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
    setAccountForm({ ...emptyAccount, vchannelCodesRaw: prefillCode ?? '', vchannelCodes: prefillCode ? [prefillCode] : [] });
    setShowAccountModal(true);
  };

  const openEditAccount = (account: typeof accounts[0]) => {
    setEditingAccountId(account.id);
    setAccountForm({
      vchannelCodes: account.vchannelCodes,
      vchannelCodesRaw: formatChannelCodes(account.vchannelCodes),
      accountLabel: account.accountLabel,
      channelIntro: account.channelIntro ?? '',
      platform: normalizeAccountPlatform(account.platform) ?? account.platform,
      accountId: account.accountId ?? '',
      accountPassword: account.accountPassword ?? '',
      loginMethod: account.loginMethod ?? '',
      operatorCode: account.operatorCode ?? '',
      feedhiveManaged: account.feedhiveManaged,
      notes: account.notes ?? '',
      sortOrder: account.sortOrder,
    });
    setShowAccountModal(true);
  };

  const saveAccount = async () => {
    const codes = parseChannelCodes(accountForm.vchannelCodesRaw || accountForm.vchannelCodes.join('/'));
    const platform = normalizeAccountPlatform(accountForm.platform);
    if (!codes.length || !platform) return;
    setSaving(true);
    const payload = {
      vchannelCodes: codes,
      accountLabel: accountForm.accountLabel,
      channelIntro: accountForm.channelIntro || undefined,
      platform,
      accountId: accountForm.accountId || undefined,
      accountPassword: accountForm.accountPassword || undefined,
      loginMethod: accountForm.loginMethod || undefined,
      operatorCode: accountForm.operatorCode || undefined,
      feedhiveManaged: accountForm.feedhiveManaged,
      notes: accountForm.notes || undefined,
      sortOrder: accountForm.sortOrder,
    };
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

  if (loading && channels.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="animate-spin" size={18} />
        <span className="text-[13px]">載入頻道資料...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          無法載入 Supabase 資料：{error}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border">
        {(['channels', 'accounts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab === 'channels' ? '頻道主檔' : '平台帳號 (Login)'}
          </button>
        ))}
      </div>

      {activeTab === 'channels' && (
        <>
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
                {Object.keys(importanceConfig).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
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
              onClick={() => setShowAddModal(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700"
            >
              <Plus size={12} /> 新增頻道
            </button>
          </div>

          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-x-auto">
            <table className="w-full text-[13px] min-w-[900px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">編號</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">內部名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">公開名稱</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">品牌</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">重要性</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">平台</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap min-w-[76px]">總工時</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">狀態</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredChannels.map(channel => {
                  const iConfig = importanceConfig[channel.importance];
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
                        <td className="px-3 py-3 font-medium max-w-[180px]">{channel.internalName}</td>
                        <td className="px-3 py-3 text-muted-foreground max-w-[180px]">{channel.publicName}</td>
                        <td className="px-3 py-3"><span className="text-[11px] bg-muted px-2 py-0.5 rounded">{channelBrandLabel(channel)}</span></td>
                        <td className="px-3 py-3">
                          <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded', iConfig.bg, iConfig.color)}>{iConfig.label}</span>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-muted-foreground">{openedPlatformCount(channel)}/8</td>
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
                            <button onClick={() => openAddAccount(channel.channelCode)} className="p-1 hover:bg-muted rounded" title="新增帳號"><KeyRound size={12} className="text-blue-600" /></button>
                            <button onClick={() => handleDeleteClick(channel)} className="p-1 hover:bg-muted rounded" title="刪除"><Trash2 size={12} className="text-rose-500" /></button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-border/50 bg-slate-50/70">
                          <td />
                          <td colSpan={9} className="px-3 py-3">
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
                                        <th className="text-left px-2 py-1.5">操作</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {linkedAccounts.map(acc => (
                                        <tr key={acc.id} className="border-t border-border/50">
                                          <td className="px-2 py-1.5">{accountPlatformLabel(acc.platform)}</td>
                                          <td className="px-2 py-1.5 font-mono">{acc.accountId || '—'}</td>
                                          <td className="px-2 py-1.5">{acc.loginMethod || '—'}</td>
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
        </>
      )}

      {activeTab === 'accounts' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">共 {accounts.length} 條平台帳號（支援 V12/V14 等多頻道共用）</p>
            <button onClick={() => openAddAccount()} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700">
              <Plus size={12} /> 新增帳號
            </button>
          </div>
          {accountsLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center"><Loader2 className="animate-spin" size={16} /> 載入中...</div>
          ) : (
            <div className="bg-white rounded-md border shadow-card overflow-x-auto">
              <table className="w-full text-[12px] min-w-[800px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-3 py-2">Vchannel</th>
                    <th className="text-left px-3 py-2">名稱</th>
                    <th className="text-left px-3 py-2">平台</th>
                    <th className="text-left px-3 py-2">賬號ID</th>
                    <th className="text-left px-3 py-2">密碼</th>
                    <th className="text-left px-3 py-2">登入方式</th>
                    <th className="text-left px-3 py-2">運營者</th>
                    <th className="text-left px-3 py-2">FeedHive</th>
                    <th className="text-left px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.id} className="border-t border-border/50 hover:bg-muted/10">
                      <td className="px-3 py-2 font-mono font-bold">{formatChannelCodes(acc.vchannelCodes)}</td>
                      <td className="px-3 py-2">{acc.accountLabel}</td>
                      <td className="px-3 py-2">{accountPlatformLabel(acc.platform)}</td>
                      <td className="px-3 py-2 font-mono text-[11px] max-w-[140px] truncate" title={acc.accountId}>{acc.accountId || '—'}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{acc.accountPassword ? '••••••••' : '—'}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate" title={acc.loginMethod}>{acc.loginMethod || '—'}</td>
                      <td className="px-3 py-2">{acc.operatorCode || '—'}</td>
                      <td className="px-3 py-2">{acc.feedhiveManaged ? '✓' : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => openEditAccount(acc)} className="text-teal-600 hover:underline">編輯</button>
                          <button onClick={() => setDeleteAccountTarget({ id: acc.id, label: `${formatChannelCodes(acc.vchannelCodes)} / ${accountPlatformLabel(acc.platform)}` })} className="text-rose-500 hover:underline">刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 Vchannel">
        <ChannelForm form={newChannel} setForm={setNewChannel} brandOptions={activeBrandOptions} />
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd} disabled={saving}>{saving ? '儲存中...' : '新增'}</Button>
        </div>
      </CrudModal>

      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={`編輯 ${editForm.channelCode}`}>
        <ChannelForm form={editForm} setForm={setEditForm} brandOptions={activeBrandOptions} />
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.internalName || ''}
        canDelete={deleteReasons.length === 0}
        reasons={deleteReasons}
      />

      <CrudModal isOpen={showAccountModal} onClose={() => setShowAccountModal(false)} title={editingAccountId ? '編輯平台帳號' : '新增平台帳號'}>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Vchannel *（可多選，如 V12/V14）</label>
            <Input value={accountForm.vchannelCodesRaw} onChange={e => setAccountForm({ ...accountForm, vchannelCodesRaw: e.target.value })} className="h-9 text-[13px]" placeholder="V11 或 V12/V14" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">名稱</label>
              <Input value={accountForm.accountLabel} onChange={e => setAccountForm({ ...accountForm, accountLabel: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台 *</label>
              <Select
                value={normalizeAccountPlatform(accountForm.platform) ?? ''}
                onValueChange={(value: PlatformKey) => setAccountForm({ ...accountForm, platform: value })}
              >
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇平台" /></SelectTrigger>
                <SelectContent>
                  {PLATFORM_KEYS.map(key => (
                    <SelectItem key={key} value={key}>{PLATFORM_LABELS[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">賬號 ID</label>
              <Input value={accountForm.accountId} onChange={e => setAccountForm({ ...accountForm, accountId: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">賬號密碼</label>
              <Input type="password" value={accountForm.accountPassword} onChange={e => setAccountForm({ ...accountForm, accountPassword: e.target.value })} className="h-9 text-[13px]" placeholder="加密存儲" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">登入方式</label>
              <Input value={accountForm.loginMethod} onChange={e => setAccountForm({ ...accountForm, loginMethod: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">運營者</label>
              <Input value={accountForm.operatorCode} onChange={e => setAccountForm({ ...accountForm, operatorCode: e.target.value })} className="h-9 text-[13px]" placeholder="M02" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
            <Input value={accountForm.notes} onChange={e => setAccountForm({ ...accountForm, notes: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={accountForm.feedhiveManaged} onChange={e => setAccountForm({ ...accountForm, feedhiveManaged: e.target.checked })} />
            FeedHive 統一管理
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setShowAccountModal(false)}>取消</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={saveAccount} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteAccountTarget}
        onClose={() => setDeleteAccountTarget(null)}
        onConfirm={confirmDeleteAccount}
        itemName={deleteAccountTarget?.label || ''}
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
