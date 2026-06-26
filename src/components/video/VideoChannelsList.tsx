import { Fragment, useState } from 'react';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VideoChannel } from '@/types/app';
import { useDataStore } from '@/context/DataStore';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const importanceConfig = {
  A1: { label: 'A1', color: 'text-rose-700', bg: 'bg-rose-100', description: '最高重要' },
  A2: { label: 'A2', color: 'text-amber-700', bg: 'bg-amber-100', description: '高重要' },
  A3: { label: 'A3', color: 'text-blue-700', bg: 'bg-blue-100', description: '中等' },
  A4: { label: 'A4', color: 'text-slate-700', bg: 'bg-slate-100', description: '低重要' },
  A5: { label: 'A5', color: 'text-gray-600', bg: 'bg-gray-100', description: '最低' },
};

type ChannelPlatform = {
  platform: string;
  accountId: string;
  passwordLabel: string;
  loginMethod: string;
  notes: string;
};

const mockChannelPlatforms: Record<string, ChannelPlatform[]> = {
  vc1: [
    { platform: 'YouTube', accountId: '@bwwineofficial', passwordLabel: '••••••••', loginMethod: 'Google OAuth', notes: '主頻道，需二步驗證' },
    { platform: 'Instagram', accountId: '@bw.wine', passwordLabel: '••••••••', loginMethod: 'Meta Business', notes: '同步短片內容' },
  ],
  vc2: [
    { platform: 'Facebook', accountId: 'ACI Events', passwordLabel: '••••••••', loginMethod: 'Meta Business', notes: '活動回顧及直播使用' },
    { platform: 'YouTube', accountId: '@acievents', passwordLabel: '••••••••', loginMethod: 'Google OAuth', notes: '長片歸檔' },
  ],
  vc3: [
    { platform: 'YouTube', accountId: '@wineacademy', passwordLabel: '••••••••', loginMethod: 'Google OAuth', notes: '教學系列首發平台' },
  ],
  vc4: [
    { platform: 'Instagram', accountId: '@fcc.clips', passwordLabel: '••••••••', loginMethod: 'Meta Business', notes: 'Reels 優先' },
    { platform: 'TikTok', accountId: '@fccclips', passwordLabel: '••••••••', loginMethod: '手機驗證', notes: '短視頻測試號' },
    { platform: '小紅書', accountId: 'FCC短視頻', passwordLabel: '••••••••', loginMethod: '手機驗證', notes: '生活方式內容' },
  ],
  vc5: [
    { platform: 'YouTube', accountId: '@bscportfolio', passwordLabel: '••••••••', loginMethod: 'Google OAuth', notes: '暫停更新，保留歷史案例' },
  ],
  vc6: [
    { platform: '內部系統', accountId: 'training-videos', passwordLabel: '••••••••', loginMethod: 'SSO', notes: '只供內部培訓使用' },
  ],
};

const emptyChannel: Omit<VideoChannel, 'id'> = {
  channelNumber: '',
  internalName: '',
  publicName: '',
  importance: 'A3',
  deviceType: 'both',
  brand: '',
  status: 'active',
  videoCount: 0,
};

export function VideoChannelsList() {
  const { videoChannels, addVideoChannel, updateVideoChannel, deleteVideoChannel } = useDataStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedChannelIds, setExpandedChannelIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<VideoChannel | null>(null);
  const [newChannel, setNewChannel] = useState<Omit<VideoChannel, 'id'>>(emptyChannel);
  const [deleteTarget, setDeleteTarget] = useState<VideoChannel | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; reasons: string[] }>({ canDelete: true, reasons: [] });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const filteredChannels = videoChannels.filter((ch) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return ch.internalName.toLowerCase().includes(q) || ch.publicName.toLowerCase().includes(q) || ch.channelNumber.toLowerCase().includes(q) || ch.brand.toLowerCase().includes(q);
    }
    return true;
  });

  const platformCount = videoChannels.reduce((total, channel) => total + (mockChannelPlatforms[channel.id]?.length || 0), 0);

  const toggleExpanded = (channelId: string) => {
    setExpandedChannelIds(prev =>
      prev.includes(channelId) ? prev.filter(id => id !== channelId) : [...prev, channelId]
    );
  };

  const handleAdd = () => {
    if (!newChannel.internalName.trim()) return;
    addVideoChannel(newChannel);
    setNewChannel(emptyChannel);
    setShowAddModal(false);
  };

  const handleEdit = (channel: VideoChannel) => {
    setEditingChannel({ ...channel });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (editingChannel) {
      updateVideoChannel(editingChannel.id, editingChannel);
      setShowEditModal(false);
      setEditingChannel(null);
    }
  };

  const handleDeleteClick = (channel: VideoChannel) => {
    setDeleteTarget(channel);
    setDeleteCheck({ canDelete: true, reasons: [] });
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      const result = deleteVideoChannel(deleteTarget.id);
      if (!result.canDelete) {
        setDeleteCheck(result);
        return;
      }
    }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">頻道總數</span>
          <p className="text-[18px] font-bold">{videoChannels.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">活躍頻道</span>
          <p className="text-[18px] font-bold text-teal-600">{videoChannels.filter(c => c.status === 'active').length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">平台賬號</span>
          <p className="text-[18px] font-bold">{platformCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-[300px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋頻道名稱、編號或品牌..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} />
          新增頻道
        </button>
      </div>

      {/* Channels Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="w-10 px-4 py-2.5 font-medium text-muted-foreground"></th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">頻道ID</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">頻道所屬</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">重要性</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">比例（D/M）</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">品牌分類</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredChannels.map((channel) => {
              const iConfig = importanceConfig[channel.importance];
              const platforms = mockChannelPlatforms[channel.id] || [];
              const isExpanded = expandedChannelIds.includes(channel.id);
              return (
                <Fragment key={channel.id}>
                  <tr className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpanded(channel.id)}
                        className="w-5 h-5 rounded border border-border bg-white text-[13px] leading-none font-bold text-teal-700 hover:bg-teal-50 hover:border-teal-300 transition-colors"
                        title={isExpanded ? '收起平台信息' : '展開平台信息'}
                      >
                        {isExpanded ? '−' : '+'}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">{channel.channelNumber}</td>
                    <td className="px-4 py-3 font-medium">{channel.internalName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{channel.publicName}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded', iConfig.bg, iConfig.color)}>
                        {iConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] bg-muted px-2 py-0.5 rounded capitalize">
                        {channel.deviceType === 'both' ? 'D+M' : channel.deviceType === 'desktop' ? 'D' : 'M'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{channel.brand}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', channel.status === 'active' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600')}>
                        {channel.status === 'active' ? '活躍' : channel.status === 'paused' ? '暫停' : '已歸檔'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEdit(channel)} className="p-1 hover:bg-muted rounded transition-colors" title="編輯">
                          <Edit size={12} className="text-teal-600" />
                        </button>
                        <button onClick={() => handleDeleteClick(channel)} className="p-1 hover:bg-muted rounded transition-colors" title="刪除">
                          <Trash2 size={12} className="text-rose-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-border/50 bg-slate-50/70">
                      <td></td>
                      <td colSpan={8} className="px-4 py-3">
                        <div className="rounded-md border border-border bg-white overflow-hidden">
                          <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
                            <span className="text-[12px] font-bold">平台信息</span>
                            <span className="text-[11px] text-muted-foreground">{platforms.length} 個平台賬號</span>
                          </div>
                          <table className="w-full text-[12px]">
                            <thead className="bg-white">
                              <tr className="border-t border-border/50">
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">平台</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">賬號ID</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">賬號密碼</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">登入方式</th>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">備註</th>
                              </tr>
                            </thead>
                            <tbody>
                              {platforms.map((platform) => (
                                <tr key={`${channel.id}-${platform.platform}`} className="border-t border-border/50">
                                  <td className="px-3 py-2 font-medium">{platform.platform}</td>
                                  <td className="px-3 py-2 font-mono text-[11px]">{platform.accountId}</td>
                                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{platform.passwordLabel}</td>
                                  <td className="px-3 py-2">{platform.loginMethod}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{platform.notes}</td>
                                </tr>
                              ))}
                              {platforms.length === 0 && (
                                <tr className="border-t border-border/50">
                                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">暫無平台信息</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
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

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增影片頻道">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道ID</label>
              <Input value={newChannel.channelNumber} onChange={(e) => setNewChannel({ ...newChannel, channelNumber: e.target.value })} className="h-9 text-[13px]" placeholder="CH-007" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌分類</label>
              <Input value={newChannel.brand} onChange={(e) => setNewChannel({ ...newChannel, brand: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">名稱 *</label>
            <Input value={newChannel.internalName} onChange={(e) => setNewChannel({ ...newChannel, internalName: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道所屬</label>
            <Input value={newChannel.publicName} onChange={(e) => setNewChannel({ ...newChannel, publicName: e.target.value })} className="h-9 text-[13px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">重要性</label>
              <Select value={newChannel.importance} onValueChange={(val: any) => setNewChannel({ ...newChannel, importance: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(importanceConfig).map(([k, v]) => <SelectItem key={k} value={k}>{k} - {v.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">比例（D/M）</label>
              <Select value={newChannel.deviceType} onValueChange={(val: any) => setNewChannel({ ...newChannel, deviceType: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Desktop + Mobile</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd}>新增</Button>
          </div>
        </div>
      </CrudModal>

      {/* Edit Modal */}
      <CrudModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="編輯影片頻道">
        {editingChannel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道ID</label>
                <Input value={editingChannel.channelNumber} onChange={(e) => setEditingChannel({ ...editingChannel, channelNumber: e.target.value })} className="h-9 text-[13px]" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌分類</label>
                <Input value={editingChannel.brand} onChange={(e) => setEditingChannel({ ...editingChannel, brand: e.target.value })} className="h-9 text-[13px]" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">名稱</label>
              <Input value={editingChannel.internalName} onChange={(e) => setEditingChannel({ ...editingChannel, internalName: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道所屬</label>
              <Input value={editingChannel.publicName} onChange={(e) => setEditingChannel({ ...editingChannel, publicName: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">重要性</label>
                <Select value={editingChannel.importance} onValueChange={(val: any) => setEditingChannel({ ...editingChannel, importance: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(importanceConfig).map(([k, v]) => <SelectItem key={k} value={k}>{k} - {v.description}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">比例（D/M）</label>
                <Select value={editingChannel.deviceType} onValueChange={(val: any) => setEditingChannel({ ...editingChannel, deviceType: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Desktop + Mobile</SelectItem>
                    <SelectItem value="desktop">Desktop</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
                <Select value={editingChannel.status} onValueChange={(val: any) => setEditingChannel({ ...editingChannel, status: val })}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">活躍</SelectItem>
                    <SelectItem value="paused">暫停</SelectItem>
                    <SelectItem value="archived">已歸檔</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setShowEditModal(false)}>取消</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSaveEdit}>儲存變更</Button>
            </div>
          </div>
        )}
      </CrudModal>

      {/* Delete Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.internalName || ''}
        canDelete={deleteCheck.canDelete}
        reasons={deleteCheck.reasons}
      />
    </div>
  );
}
