import { useState } from 'react';
import { Plus, ArrowLeft, Eye, Link2, X, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { websiteProfiles } from '@/data/websiteData';

const importanceConfig: Record<string, { label: string; color: string; bg: string }> = {
  A1: { label: 'A1 最重要', color: 'text-red-700', bg: 'bg-red-100' },
  A2: { label: 'A2 重要', color: 'text-amber-700', bg: 'bg-amber-100' },
  A3: { label: 'A3 一般', color: 'text-blue-700', bg: 'bg-blue-100' },
  A4: { label: 'A4 次要', color: 'text-slate-700', bg: 'bg-slate-100' },
  A5: { label: 'A5 存檔', color: 'text-gray-600', bg: 'bg-gray-100' },
};

const mockChannels = [
  { id: 'ch1', channelNumber: 'CH-001', internalName: 'BW 品牌主頻道', publicName: 'BW Wine Official', importance: 'A1', deviceType: 'both', status: 'active', videoCount: 24, company: '志豐企業', brand: 'BW Wine' },
  { id: 'ch2', channelNumber: 'CH-002', internalName: 'ACI 活動花絮', publicName: 'ACI Events', importance: 'A2', deviceType: 'mobile', status: 'active', videoCount: 15, company: '志豐企業', brand: 'ACI' },
  { id: 'ch3', channelNumber: 'CH-003', internalName: '品酒教學系列', publicName: 'Wine Education', importance: 'A2', deviceType: 'desktop', status: 'active', videoCount: 8, company: '志豐企業', brand: 'BW Wine' },
  { id: 'ch4', channelNumber: 'CH-004', internalName: 'FCC 短視頻', publicName: 'FCC Shorts', importance: 'A3', deviceType: 'mobile', status: 'active', videoCount: 30, company: 'FCC', brand: 'FCC' },
  { id: 'ch5', channelNumber: 'CH-005', internalName: 'BWDesign 作品集', publicName: 'BWDesign Portfolio', importance: 'A3', deviceType: 'both', status: 'paused', videoCount: 5, company: '志豐企業', brand: 'BWDesign' },
];

function ChannelDetail({ channel, onBack }: { channel: any; onBack: () => void }) {
  const [linkedWebsites, setLinkedWebsites] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const iConfig = importanceConfig[channel.importance] || importanceConfig.A3;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
        <ArrowLeft size={14} /> 返回影片頻道列表
      </button>

      {/* Context Bar */}
      <div className="bg-slate-50 rounded-md border border-slate-200 p-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">所屬公司:</span> {channel.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {channel.brand}
        <span className="mx-1">•</span>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', iConfig.bg, iConfig.color)}>{iConfig.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[18px] font-bold">{channel.publicName}</h3>
                <p className="text-[13px] text-muted-foreground mt-1">內部名稱: {channel.internalName} • 編號: {channel.channelNumber}</p>
              </div>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', channel.status === 'active' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700')}>
                {channel.status === 'active' ? '活躍' : '已暫停'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-[13px]">
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className="text-[20px] font-bold">{channel.videoCount}</p>
                <span className="text-[11px] text-muted-foreground">影片數量</span>
              </div>
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className="text-[20px] font-bold">{channel.deviceType === 'both' ? '全平台' : channel.deviceType === 'mobile' ? '手機' : '桌面'}</p>
                <span className="text-[11px] text-muted-foreground">設備類型</span>
              </div>
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className={cn('text-[20px] font-bold', iConfig.color)}>{channel.importance}</p>
                <span className="text-[11px] text-muted-foreground">重要性</span>
              </div>
            </div>
          </div>

          {/* Quick add video */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">快速新增影片</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">影片標題 *</label>
                <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="輸入影片標題" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">關聯網站</label>
                <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                  <option>選擇網站...</option>
                  {websiteProfiles.map(wp => (
                    <option key={wp.id} value={wp.id}>{wp.websiteName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">拍攝日期</label>
                <input type="date" className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">製作狀態</label>
                <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                  <option>企劃中</option><option>拍攝中</option><option>後製中</option><option>已完成</option><option>已發佈</option>
                </select>
              </div>
            </div>
            <button className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">
              <Plus size={12} className="inline mr-1" /> 新增影片至此頻道
            </button>
          </div>

          {/* Channel videos placeholder */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">頻道影片</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-md border border-border overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <Play size={16} className="text-muted-foreground/50" />
                  </div>
                  <div className="p-2">
                    <p className="text-[12px] font-medium truncate">影片 {i}</p>
                    <p className="text-[10px] text-muted-foreground">2024-12-{10 + i}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold">關聯網站</h3>
              <button onClick={() => setShowLinkModal(true)} className="text-[11px] text-teal-600 hover:underline flex items-center gap-1">
                <Link2 size={10} /> 管理關聯
              </button>
            </div>
            <div className="space-y-2">
              {linkedWebsites.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">尚未關聯任何網站</p>
              ) : (
                linkedWebsites.map(ws => (
                  <div key={ws} className="flex items-center justify-between text-[12px] bg-muted/30 rounded px-3 py-2">
                    <span className="font-medium">{ws}</span>
                    <button onClick={() => setLinkedWebsites(prev => prev.filter(w => w !== ws))} className="text-muted-foreground hover:text-red-500"><X size={12} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">選擇關聯網站（可多選）</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              {websiteProfiles.map(wp => (
                <label key={wp.id} className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/30 cursor-pointer transition-colors duration-200">
                  <input
                    type="checkbox"
                    checked={linkedWebsites.includes(wp.websiteName)}
                    onChange={(e) => {
                      if (e.target.checked) setLinkedWebsites(prev => [...prev, wp.websiteName]);
                      else setLinkedWebsites(prev => prev.filter(w => w !== wp.websiteName));
                    }}
                    className="rounded border-border text-teal-600 focus:ring-teal-600"
                  />
                  <div>
                    <p className="text-[13px] font-medium">{wp.websiteName}</p>
                    <p className="text-[11px] text-muted-foreground">{wp.company} / {wp.brand}</p>
                  </div>
                </label>
              ))}
            </div>
            <button onClick={() => setShowLinkModal(false)} className="mt-4 w-full py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">確認</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function VideoChannelsModule() {
  const [selectedChannel, setSelectedChannel] = useState<any | null>(null);

  if (selectedChannel) {
    return <ChannelDetail channel={selectedChannel} onBack={() => setSelectedChannel(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">頻道總數</span>
          <p className="text-[18px] font-bold">{mockChannels.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">活躍頻道</span>
          <p className="text-[18px] font-bold text-teal-600">{mockChannels.filter(c => c.status === 'active').length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">影片總數</span>
          <p className="text-[18px] font-bold">{mockChannels.reduce((s, c) => s + c.videoCount, 0)}</p>
        </div>
        <button className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} /> 新增頻道
        </button>
      </div>

      {/* Channel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockChannels.map((channel) => {
          const iConfig = importanceConfig[channel.importance] || importanceConfig.A3;
          return (
            <div
              key={channel.id}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all duration-200 cursor-pointer"
              onClick={() => setSelectedChannel(channel)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-[14px] font-bold">{channel.publicName}</h4>
                  <p className="text-[12px] text-muted-foreground">{channel.internalName} • {channel.channelNumber}</p>
                </div>
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded', iConfig.bg, iConfig.color)}>
                  {channel.importance}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{channel.company}</span>
                <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{channel.brand}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">🎬 {channel.videoCount} 影片</span>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', channel.status === 'active' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700')}>
                  {channel.status === 'active' ? '活躍' : '已暫停'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
