import { useState } from 'react';
import { Plus, ExternalLink, Youtube, Globe, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ElementType } from 'react';

interface PlatformEntry {
  platform: string;
  uploadStatus: 'pending' | 'uploaded' | 'scheduled';
  uploadDate?: string;
  videoUrl?: string;
  likes?: number;
}

interface DistributionRecord {
  id: string;
  videoTitle: string;
  channel: string;
  company: string;
  brand: string;
  platforms: PlatformEntry[];
}

const platformConfig: Record<string, { label: string; color: string; bg: string; icon: ElementType }> = {
  youtube: { label: 'YouTube', color: 'text-red-600', bg: 'bg-red-50', icon: Youtube },
  facebook: { label: 'Facebook', color: 'text-blue-600', bg: 'bg-blue-50', icon: Globe },
  instagram: { label: 'Instagram', color: 'text-pink-600', bg: 'bg-pink-50', icon: Globe },
  tiktok: { label: 'TikTok', color: 'text-slate-700', bg: 'bg-slate-100', icon: Globe },
  xiaohongshu: { label: '小紅書', color: 'text-rose-600', bg: 'bg-rose-50', icon: Globe },
  website_embed: { label: '網站嵌入', color: 'text-teal-600', bg: 'bg-teal-50', icon: Globe },
  other: { label: '其他', color: 'text-gray-600', bg: 'bg-gray-100', icon: Globe },
};

const PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok', 'xiaohongshu', 'website_embed', 'other'];

const mockDistribution: DistributionRecord[] = [
  {
    id: '1',
    videoTitle: '品牌故事 Ep. 1',
    channel: 'BW 品牌主頻道',
    company: 'BWDesign',
    brand: 'BW Wine',
    platforms: [
      { platform: 'youtube', uploadStatus: 'uploaded', uploadDate: '2024-12-10', videoUrl: 'https://youtube.com', likes: 180 },
      { platform: 'facebook', uploadStatus: 'uploaded', uploadDate: '2024-12-11', videoUrl: 'https://facebook.com', likes: 95 },
    ],
  },
  {
    id: '2',
    videoTitle: '新品上架宣傳片',
    channel: '品酒教學系列',
    company: 'BWDesign',
    brand: 'BW Wine',
    platforms: [
      { platform: 'instagram', uploadStatus: 'scheduled', uploadDate: '2024-12-25' },
      { platform: 'youtube', uploadStatus: 'pending' },
    ],
  },
  {
    id: '3',
    videoTitle: '網頁設計教學',
    channel: 'BW 品牌主頻道',
    company: 'BWDesign',
    brand: 'BW Design',
    platforms: [
      { platform: 'youtube', uploadStatus: 'uploaded', uploadDate: '2024-12-08', videoUrl: 'https://youtube.com', likes: 320 },
      { platform: 'facebook', uploadStatus: 'uploaded', uploadDate: '2024-12-09', videoUrl: 'https://facebook.com', likes: 210 },
    ],
  },
  {
    id: '4',
    videoTitle: '活動精華片段',
    channel: 'ACI 活動花絮',
    company: '志豐企業',
    brand: 'ACI',
    platforms: [
      { platform: 'instagram', uploadStatus: 'uploaded', uploadDate: '2024-12-14', videoUrl: 'https://instagram.com', likes: 650 },
      { platform: 'xiaohongshu', uploadStatus: 'uploaded', uploadDate: '2024-12-15', videoUrl: 'https://xiaohongshu.com', likes: 380 },
    ],
  },
];

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待上載', color: 'text-slate-700', bg: 'bg-slate-100' },
  uploaded: { label: '已上載', color: 'text-teal-700', bg: 'bg-teal-100' },
  scheduled: { label: '已排程', color: 'text-amber-700', bg: 'bg-amber-100' },
};

const EMPTY_PLATFORM_ENTRY: PlatformEntry = { platform: 'youtube', uploadStatus: 'pending', uploadDate: '', videoUrl: '' };

export function VideoDistribution() {
  const [records, setRecords] = useState<DistributionRecord[]>(mockDistribution);
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNewForm, setShowNewForm] = useState(false);

  // New form state
  const [newVideo, setNewVideo] = useState('品牌故事 Ep. 1');
  const [newChannel, setNewChannel] = useState('BW 品牌主頻道');
  const [newCompany, setNewCompany] = useState('BWDesign');
  const [newBrand, setNewBrand] = useState('BW Wine');
  const [newPlatformEntries, setNewPlatformEntries] = useState<PlatformEntry[]>([{ ...EMPTY_PLATFORM_ENTRY }]);

  const allPlatformEntries = records.flatMap(r => r.platforms);
  const uploadedCount = allPlatformEntries.filter(p => p.uploadStatus === 'uploaded').length;
  const pendingCount = allPlatformEntries.filter(p => p.uploadStatus === 'pending').length;

  const filtered = records.filter(r => {
    const matchPlatform = filterPlatform === 'all' || r.platforms.some(p => p.platform === filterPlatform);
    const matchStatus = filterStatus === 'all' || r.platforms.some(p => p.uploadStatus === filterStatus);
    return matchPlatform && matchStatus;
  });

  const addPlatformRow = () => setNewPlatformEntries(prev => [...prev, { ...EMPTY_PLATFORM_ENTRY }]);

  const removePlatformRow = (idx: number) => {
    setNewPlatformEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const updatePlatformRow = (idx: number, field: keyof PlatformEntry, value: string) => {
    setNewPlatformEntries(prev => prev.map((entry, i) => i === idx ? { ...entry, [field]: value } : entry));
  };

  const handleSave = () => {
    const validEntries = newPlatformEntries.filter(e => e.platform);
    if (!newVideo || validEntries.length === 0) return;
    const newRecord: DistributionRecord = {
      id: String(Date.now()),
      videoTitle: newVideo,
      channel: newChannel,
      company: newCompany,
      brand: newBrand,
      platforms: validEntries,
    };
    setRecords(prev => [newRecord, ...prev]);
    setShowNewForm(false);
    setNewPlatformEntries([{ ...EMPTY_PLATFORM_ENTRY }]);
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[11px] text-muted-foreground">已上載</span>
          <p className="text-[22px] font-bold text-teal-600">{uploadedCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[11px] text-muted-foreground">待上載</span>
          <p className="text-[22px] font-bold text-amber-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[11px] text-muted-foreground">影片數</span>
          <p className="text-[22px] font-bold">{records.length}</p>
        </div>
      </div>

      {/* Filters + Action */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {['all', 'youtube', 'facebook', 'instagram', 'xiaohongshu', 'tiktok'].map((p) => {
            const pc = platformConfig[p];
            return (
              <button
                key={p}
                onClick={() => setFilterPlatform(p)}
                className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterPlatform === p ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
              >
                {p === 'all' ? '全部平台' : pc?.label || p}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'pending', 'uploaded', 'scheduled'] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterStatus === s ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
              {s === 'all' ? '全部狀態' : statusLabels[s].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} />
          新增發佈記錄
        </button>
      </div>

      {/* New Form */}
      {showNewForm && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h3 className="text-[14px] font-bold mb-4">新增發佈記錄</h3>

          {/* Video Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">影片名稱</label>
              <select
                value={newVideo}
                onChange={e => setNewVideo(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option>品牌故事 Ep. 1</option>
                <option>新品上架宣傳片</option>
                <option>網頁設計教學</option>
                <option>活動精華片段</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">頻道</label>
              <input
                value={newChannel}
                onChange={e => setNewChannel(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="頻道名稱"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司</label>
              <input
                value={newCompany}
                onChange={e => setNewCompany(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="公司"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌</label>
              <input
                value={newBrand}
                onChange={e => setNewBrand(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                placeholder="品牌"
              />
            </div>
          </div>

          {/* Platform Rows */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">發佈平台</span>
              <button
                onClick={addPlatformRow}
                className="flex items-center gap-1 text-[12px] text-teal-600 hover:text-teal-700 font-medium"
              >
                <Plus size={12} /> 新增平台
              </button>
            </div>

            <div className="grid grid-cols-[160px_120px_130px_1fr_32px] gap-2 px-2 mb-1">
              <span className="text-[11px] text-muted-foreground">平台</span>
              <span className="text-[11px] text-muted-foreground">上載狀態</span>
              <span className="text-[11px] text-muted-foreground">上載日期</span>
              <span className="text-[11px] text-muted-foreground">影片連結</span>
              <span></span>
            </div>

            <div className="space-y-2">
              {newPlatformEntries.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-[160px_120px_130px_1fr_32px] gap-2 items-center bg-muted/20 rounded-md px-2 py-2">
                  <select
                    value={entry.platform}
                    onChange={e => updatePlatformRow(idx, 'platform', e.target.value)}
                    className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  >
                    {PLATFORMS.map(p => (
                      <option key={p} value={p}>{platformConfig[p]?.label || p}</option>
                    ))}
                  </select>
                  <select
                    value={entry.uploadStatus}
                    onChange={e => updatePlatformRow(idx, 'uploadStatus', e.target.value)}
                    className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  >
                    <option value="pending">待上載</option>
                    <option value="scheduled">已排程</option>
                    <option value="uploaded">已上載</option>
                  </select>
                  <input
                    type="date"
                    value={entry.uploadDate || ''}
                    onChange={e => updatePlatformRow(idx, 'uploadDate', e.target.value)}
                    className="w-full px-2 py-1.5 border border-border rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                  <input
                    value={entry.videoUrl || ''}
                    onChange={e => updatePlatformRow(idx, 'videoUrl', e.target.value)}
                    className="w-full px-2 py-1.5 border border-border rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder="https://..."
                  />
                  <button
                    onClick={() => removePlatformRow(idx)}
                    disabled={newPlatformEntries.length === 1}
                    className="flex items-center justify-center text-muted-foreground hover:text-rose-500 transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">
              <Check size={13} /> 儲存
            </button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">取消</button>
          </div>
        </div>
      )}

      {/* Records */}
      <div className="space-y-3">
        {filtered.map((record) => (
          <div key={record.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            {/* Video Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-muted/10">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate">{record.videoTitle}</p>
                <p className="text-[11px] text-muted-foreground">{record.channel}</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                <span className="font-medium text-foreground">{record.company}</span>
                <span>/</span>
                <span>{record.brand}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                {record.platforms.map((p, i) => {
                  const pc = platformConfig[p.platform];
                  return (
                    <span key={i} className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', pc?.bg, pc?.color)}>
                      {pc?.label || p.platform}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Platform Rows */}
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-muted/5">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[160px]">平台</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[120px]">狀態</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[130px]">上載日期</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[80px]">讚好</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">連結</th>
                </tr>
              </thead>
              <tbody>
                {record.platforms
                  .filter(p => filterPlatform === 'all' || p.platform === filterPlatform)
                  .filter(p => filterStatus === 'all' || p.uploadStatus === filterStatus)
                  .map((p, i) => {
                    const pc = platformConfig[p.platform];
                    const PlatformIcon = pc?.icon || Globe;
                    const sc = statusLabels[p.uploadStatus];
                    return (
                      <tr key={i} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className={cn('flex items-center gap-1.5 w-fit px-2 py-0.5 rounded text-[11px] font-medium', pc?.bg, pc?.color)}>
                            <PlatformIcon size={11} />
                            {pc?.label || p.platform}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sc.bg, sc.color)}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.uploadDate || '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.likes ? p.likes.toLocaleString() : '—'}</td>
                        <td className="px-4 py-2.5">
                          {p.videoUrl ? (
                            <a href={p.videoUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-700">
                              <ExternalLink size={13} />
                            </a>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
