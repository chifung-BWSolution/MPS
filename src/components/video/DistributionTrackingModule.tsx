import { useState, useMemo } from 'react';
import { Plus, Search, ExternalLink, X, Edit, Trash2, Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllVideos } from '@/data/marketingData';
import { Button } from '@/components/ui/button';

const platformLabels: Record<string, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  xiaohongshu: '小紅書',
  website_embed: '網站嵌入',
  other: '其他',
};

const platformColors: Record<string, { color: string; bg: string }> = {
  youtube: { color: 'text-red-600', bg: 'bg-red-50' },
  facebook: { color: 'text-blue-600', bg: 'bg-blue-50' },
  instagram: { color: 'text-pink-600', bg: 'bg-pink-50' },
  tiktok: { color: 'text-slate-700', bg: 'bg-slate-100' },
  xiaohongshu: { color: 'text-rose-600', bg: 'bg-rose-50' },
  website_embed: { color: 'text-teal-600', bg: 'bg-teal-50' },
  other: { color: 'text-gray-600', bg: 'bg-gray-100' },
};

const uploadStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待上傳', color: 'text-amber-700', bg: 'bg-amber-100' },
  uploaded: { label: '已上傳', color: 'text-teal-700', bg: 'bg-teal-100' },
  scheduled: { label: '已排程', color: 'text-blue-700', bg: 'bg-blue-100' },
};

const ALL_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok', 'xiaohongshu', 'website_embed', 'other'];

type PlatformRow = {
  platform: string;
  url: string;
  publishDate: string;
  status: string;
  notes: string;
};

type VideoGroup = {
  id: string;
  videoId: string;
  videoTitle: string;
  websiteName: string;
  company: string;
  brand: string;
  platforms: PlatformRow[];
};

const emptyPlatformRow = (): PlatformRow => ({
  platform: 'youtube',
  url: '',
  publishDate: '',
  status: 'pending',
  notes: '',
});

const emptyGroup = (): Omit<VideoGroup, 'id' | 'videoId'> => ({
  videoTitle: '',
  websiteName: '',
  company: '',
  brand: '',
  platforms: [emptyPlatformRow()],
});

export function DistributionTrackingModule() {
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<VideoGroup | null>(null);
  const [form, setForm] = useState(emptyGroup());
  const [extraGroups, setExtraGroups] = useState<VideoGroup[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const allVideos = useMemo(() => getAllVideos(), []);

  const seedGroups = useMemo<VideoGroup[]>(() => {
    return allVideos
      .filter(v => v.platforms && Array.isArray(v.platforms) && v.platforms.length > 0)
      .map(video => ({
        id: `seed-${video.id}`,
        videoId: video.id,
        videoTitle: video.title,
        websiteName: (video as any).websiteName || '',
        company: (video as any).company || '',
        brand: (video as any).brand || '',
        platforms: (video.platforms as any[]).map((p: any) => ({
          platform: p.platform || 'other',
          url: p.videoUrl || p.url || '',
          publishDate: p.uploadDate || p.publishDate || '',
          status: p.uploadStatus || p.status || 'pending',
          notes: p.notes || '',
        })),
      }));
  }, [allVideos]);

  const allGroups = useMemo(() => {
    return [...seedGroups, ...extraGroups].filter(g => !deletedIds.has(g.id));
  }, [seedGroups, extraGroups, deletedIds]);

  const filteredGroups = allGroups.filter(g => {
    const matchSearch = !searchQuery || g.videoTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchPlatform = filterPlatform === 'all' || g.platforms.some(p => p.platform === filterPlatform);
    return matchSearch && matchPlatform;
  });

  const allPlatformRows = allGroups.flatMap(g => g.platforms);
  const uploadedCount = allPlatformRows.filter(p => p.status === 'uploaded').length;
  const pendingCount = allPlatformRows.filter(p => p.status === 'pending').length;

  function openAdd() {
    setEditingGroup(null);
    setForm(emptyGroup());
    setShowModal(true);
  }

  function openEdit(group: VideoGroup) {
    setEditingGroup(group);
    setForm({
      videoTitle: group.videoTitle,
      websiteName: group.websiteName,
      company: group.company,
      brand: group.brand,
      platforms: group.platforms.map(p => ({ ...p })),
    });
    setShowModal(true);
  }

  function deleteGroup(id: string) {
    setDeletedIds(prev => new Set([...prev, id]));
    setExtraGroups(prev => prev.filter(g => g.id !== id));
  }

  function addPlatformRow() {
    setForm(f => ({ ...f, platforms: [...f.platforms, emptyPlatformRow()] }));
  }

  function removePlatformRow(idx: number) {
    setForm(f => ({ ...f, platforms: f.platforms.filter((_, i) => i !== idx) }));
  }

  function updatePlatformRow(idx: number, field: keyof PlatformRow, value: string) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.map((row, i) => i === idx ? { ...row, [field]: value } : row),
    }));
  }

  function saveGroup() {
    const validPlatforms = form.platforms.filter(p => p.platform);
    if (!form.videoTitle || validPlatforms.length === 0) return;
    if (editingGroup) {
      const inExtra = extraGroups.find(g => g.id === editingGroup.id);
      const updated: VideoGroup = { id: editingGroup.id, videoId: editingGroup.videoId, ...form, platforms: validPlatforms };
      if (inExtra) {
        setExtraGroups(prev => prev.map(g => g.id === editingGroup.id ? updated : g));
      } else {
        setDeletedIds(prev => new Set([...prev, editingGroup.id]));
        setExtraGroups(prev => [...prev, { ...updated, id: String(Date.now()) }]);
      }
    } else {
      setExtraGroups(prev => [...prev, { id: String(Date.now()), videoId: String(Date.now()), ...form, platforms: validPlatforms }]);
    }
    setShowModal(false);
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">影片數</span>
          <p className="text-[18px] font-bold">{allGroups.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">發佈記錄</span>
          <p className="text-[18px] font-bold">{allPlatformRows.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已上傳</span>
          <p className="text-[18px] font-bold text-teal-600">{uploadedCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">待上傳</span>
          <p className="text-[18px] font-bold text-amber-600">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜尋影片..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <select
          value={filterPlatform}
          onChange={e => setFilterPlatform(e.target.value)}
          className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">全部平台</option>
          {ALL_PLATFORMS.map(p => <option key={p} value={p}>{platformLabels[p] || p}</option>)}
        </select>
        <button
          onClick={openAdd}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增發佈記錄
        </button>
      </div>

      {/* Video Groups */}
      <div className="space-y-3">
        {filteredGroups.map(group => {
          const visiblePlatforms = group.platforms.filter(
            p => filterPlatform === 'all' || p.platform === filterPlatform
          );
          return (
            <div key={group.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
              {/* Video Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-muted/10">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate">{group.videoTitle}</p>
                  {group.websiteName && <p className="text-[11px] text-muted-foreground">{group.websiteName}</p>}
                </div>
                {(group.company || group.brand) && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
                    {group.company && <span className="font-medium text-foreground">{group.company}</span>}
                    {group.company && group.brand && <span>/</span>}
                    {group.brand && <span>{group.brand}</span>}
                  </div>
                )}
                <div className="flex gap-1 flex-wrap shrink-0">
                  {group.platforms.map((p, i) => {
                    const pc = platformColors[p.platform] || platformColors.other;
                    return (
                      <span key={i} className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', pc.bg, pc.color)}>
                        {platformLabels[p.platform] || p.platform}
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(group)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Edit size={13} />
                  </button>
                  <button onClick={() => deleteGroup(group.id)} className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Platform Rows */}
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-muted/5">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[150px]">平台</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[110px]">狀態</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[120px]">發佈日期</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">備註</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[60px]">連結</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlatforms.map((p, i) => {
                    const sc = uploadStatusConfig[p.status] || uploadStatusConfig.pending;
                    const pc = platformColors[p.platform] || platformColors.other;
                    return (
                      <tr key={i} className="border-t border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded', pc.bg, pc.color)}>
                            <Globe size={10} />
                            {platformLabels[p.platform] || p.platform}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sc.bg, sc.color)}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{p.publishDate || '—'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[200px]">{p.notes || '—'}</td>
                        <td className="px-4 py-2.5">
                          {p.url ? (
                            <a href={p.url} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-700">
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
          );
        })}
      </div>

      {filteredGroups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          <Globe size={28} className="mx-auto mb-2 opacity-30" />
          沒有符合條件的發佈記錄
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[640px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-bold">{editingGroup ? '編輯發佈記錄' : '新增發佈記錄'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium mb-1">影片名稱 <span className="text-rose-500">*</span></label>
                <input
                  value={form.videoTitle}
                  onChange={e => setForm(f => ({ ...f, videoTitle: e.target.value }))}
                  placeholder="輸入影片名稱..."
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-medium mb-1">網站</label>
                  <input value={form.websiteName} onChange={e => setForm(f => ({ ...f, websiteName: e.target.value }))}
                    placeholder="網站名稱" className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">公司</label>
                  <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="公司名稱" className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">品牌</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="品牌名稱" className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
                </div>
              </div>

              {/* Platform Rows */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
                    發佈平台 <span className="text-rose-500">*</span>
                  </span>
                  <button onClick={addPlatformRow} className="flex items-center gap-1 text-[12px] text-teal-600 hover:text-teal-700 font-medium">
                    <Plus size={12} /> 新增平台
                  </button>
                </div>

                <div className="grid grid-cols-[140px_110px_120px_1fr_28px] gap-2 px-1 mb-1">
                  <span className="text-[11px] text-muted-foreground">平台</span>
                  <span className="text-[11px] text-muted-foreground">狀態</span>
                  <span className="text-[11px] text-muted-foreground">發佈日期</span>
                  <span className="text-[11px] text-muted-foreground">連結</span>
                  <span></span>
                </div>

                <div className="space-y-2">
                  {form.platforms.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[140px_110px_120px_1fr_28px] gap-2 items-center bg-muted/20 rounded px-2 py-2">
                      <select
                        value={row.platform}
                        onChange={e => updatePlatformRow(idx, 'platform', e.target.value)}
                        className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        {ALL_PLATFORMS.map(p => <option key={p} value={p}>{platformLabels[p] || p}</option>)}
                      </select>
                      <select
                        value={row.status}
                        onChange={e => updatePlatformRow(idx, 'status', e.target.value)}
                        className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        <option value="pending">待上傳</option>
                        <option value="scheduled">已排程</option>
                        <option value="uploaded">已上傳</option>
                      </select>
                      <input
                        type="date"
                        value={row.publishDate}
                        onChange={e => updatePlatformRow(idx, 'publishDate', e.target.value)}
                        className="w-full px-2 py-1.5 border border-border rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <input
                        type="url"
                        value={row.url}
                        onChange={e => updatePlatformRow(idx, 'url', e.target.value)}
                        placeholder="https://..."
                        className="w-full px-2 py-1.5 border border-border rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <button
                        onClick={() => removePlatformRow(idx)}
                        disabled={form.platforms.length === 1}
                        className="flex items-center justify-center text-muted-foreground hover:text-rose-500 transition-colors disabled:opacity-30"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Notes per platform */}
                <div className="mt-2 space-y-2">
                  {form.platforms.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-1">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', platformColors[row.platform]?.bg || 'bg-gray-100', platformColors[row.platform]?.color || 'text-gray-600')}>
                        {platformLabels[row.platform] || row.platform}
                      </span>
                      <input
                        value={row.notes}
                        onChange={e => updatePlatformRow(idx, 'notes', e.target.value)}
                        placeholder="備註（選填）"
                        className="flex-1 px-2 py-1 border border-border rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>取消</Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5"
                onClick={saveGroup}
                disabled={!form.videoTitle || form.platforms.length === 0}
              >
                <Check size={13} />
                {editingGroup ? '儲存更改' : '新增記錄'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
