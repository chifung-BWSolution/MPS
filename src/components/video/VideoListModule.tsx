import { useState, useMemo } from 'react';
import { Play, Plus, Search, ExternalLink, X, ArrowLeft, Link2, Edit, Trash2, Globe, Film, Youtube, Instagram, Facebook, Send, CheckCircle2, Clock3, CalendarDays, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllVideos } from '@/data/marketingData';
import { websiteProfiles } from '@/data/websiteData';
import { projects as allProjectsData } from '@/data/mockData';
import { ProjectCategoryBadge, getProjectCategory } from '@/components/ui/project-category-badge';
import { Button } from '@/components/ui/button';
import { Video } from '@/types/app';

const statusConfig: Record<string, { label: string; color: string; bgColor: string; step: number }> = {
  planning: { label: '企劃中', color: 'text-slate-700', bgColor: 'bg-slate-50', step: 1 },
  shooting: { label: '拍攝中', color: 'text-blue-700', bgColor: 'bg-blue-50', step: 2 },
  post_production: { label: '後製中', color: 'text-amber-700', bgColor: 'bg-amber-50', step: 3 },
  completed: { label: '已完成', color: 'text-emerald-700', bgColor: 'bg-emerald-50', step: 4 },
  published: { label: '已發佈', color: 'text-teal-700', bgColor: 'bg-teal-50', step: 5 },
};

const videoTypeLabels: Record<string, string> = {
  promo: '宣傳片',
  tutorial: '教學',
  testimonial: '客戶見證',
  event: '活動',
  social_clip: '社交短片',
};

function getVideoProjectCategory(websiteName: string) {
  const ws = websiteProfiles.find(w => w.websiteName === websiteName);
  return getProjectCategory(ws?.projectId, allProjectsData);
}

function VideoDetail({ video, onBack }: { video: any; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'info' | 'websites' | 'projects' | 'distribution'>('info');
  const [linkedWebsites, setLinkedWebsites] = useState<string[]>(
    video.websiteName ? [video.websiteName] : []
  );
  const [linkedProjects, setLinkedProjects] = useState<string[]>([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const config = statusConfig[video.status || 'planning'];

  // Distribution records state
  type DistRecord = { id: string; platform: string; url: string; publishDate: string; status: string; views: string; notes: string };
  const initialDist: DistRecord[] = (video.platforms || []).map((p: any, i: number) => ({
    id: String(i + 1),
    platform: p.platform || '',
    url: p.videoUrl || p.url || '',
    publishDate: p.uploadDate || p.publishDate || '',
    status: p.uploadStatus || p.status || 'pending',
    views: String(p.views || ''),
    notes: p.notes || '',
  }));
  const [distRecords, setDistRecords] = useState<DistRecord[]>(initialDist);
  const [showDistModal, setShowDistModal] = useState(false);
  const [editingDist, setEditingDist] = useState<DistRecord | null>(null);
  const emptyDist: DistRecord = { id: '', platform: 'youtube', url: '', publishDate: '', status: 'pending', views: '', notes: '' };
  const [distForm, setDistForm] = useState<DistRecord>(emptyDist);

  function openAddDist() {
    setEditingDist(null);
    setDistForm({ ...emptyDist, id: String(Date.now()) });
    setShowDistModal(true);
  }
  function openEditDist(rec: DistRecord) {
    setEditingDist(rec);
    setDistForm({ ...rec });
    setShowDistModal(true);
  }
  function saveDist() {
    if (!distForm.platform || !distForm.publishDate) return;
    if (editingDist) {
      setDistRecords(prev => prev.map(r => r.id === editingDist.id ? distForm : r));
    } else {
      setDistRecords(prev => [...prev, distForm]);
    }
    setShowDistModal(false);
  }
  function deleteDist(id: string) {
    setDistRecords(prev => prev.filter(r => r.id !== id));
  }

  // Editor name lookup
  const editorNames: Record<string, string> = { u1: '陳小華', u2: '王志明', u4: '李芳', u5: '朴賢俊' };
  const editorName = video.editorId ? editorNames[video.editorId] || video.editorId : '—';

  const tabs = [
    { id: 'info', label: '基本資訊' },
    { id: 'websites', label: '關聯網站' },
    { id: 'projects', label: '關聯項目' },
    { id: 'distribution', label: '發佈記錄' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft size={14} /> 返回影片列表
        </button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px]">
            <Edit size={12} /> 編輯
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px] text-rose-500 border-rose-200 hover:bg-rose-50" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={12} /> 刪除
          </Button>
        </div>
      </div>

      {/* Context Bar */}
      <div className="bg-slate-50 rounded-md border border-slate-200 p-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <ProjectCategoryBadge category={getVideoProjectCategory(video.websiteName).category} clientName={getVideoProjectCategory(video.websiteName).clientName} />
        <span className="font-medium text-foreground">所屬公司:</span> {video.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {video.brand}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">類型:</span> {videoTypeLabels[video.videoType] || '—'}
        <span className="mx-1">•</span>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', config.bgColor, config.color)}>{config.label}</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-[1px]',
              activeTab === tab.id
                ? 'text-teal-600 border-teal-600'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Basic Info */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* Video Preview */}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
              <div className="relative aspect-video bg-muted">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <Play size={40} className="text-muted-foreground/50" />
                </div>
                {video.durationSeconds && (
                  <span className="absolute bottom-3 right-3 text-[12px] bg-black/70 text-white px-2 py-1 rounded">
                    {Math.floor(video.durationSeconds / 60)}:{(video.durationSeconds % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
              <div className="p-5">
                <h3 className="text-[18px] font-bold mb-3">{video.title}</h3>
                {/* 5-step progress */}
                <div className="flex items-center gap-1 mb-4">
                  {Object.entries(statusConfig).map(([key, sc]) => (
                    <div key={key} className="flex-1 flex flex-col items-center gap-1">
                      <div className={cn('h-2 w-full rounded-full', sc.step <= config.step ? 'bg-teal-600' : 'bg-muted')} />
                      <span className={cn('text-[9px]', sc.step <= config.step ? 'text-teal-600 font-medium' : 'text-muted-foreground')}>{sc.label}</span>
                    </div>
                  ))}
                </div>
                {video.description && (
                  <p className="text-[13px] text-muted-foreground">{video.description}</p>
                )}
              </div>
            </div>

            {/* Production Details */}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[16px] font-bold mb-4">製作資料</h3>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-[13px]">
                <div><span className="text-muted-foreground">拍攝日期:</span> <span className="font-medium">{video.shootDate || '—'}</span></div>
                <div><span className="text-muted-foreground">發佈日期:</span> <span className="font-medium">{video.publishDate || '—'}</span></div>
                <div><span className="text-muted-foreground">剪輯工時:</span> <span className="font-medium">{video.editingHours ? `${video.editingHours}h` : '—'}</span></div>
                <div><span className="text-muted-foreground">時長:</span> <span className="font-medium">{video.durationSeconds ? `${Math.floor(video.durationSeconds / 60)}分${video.durationSeconds % 60}秒` : '—'}</span></div>
                <div><span className="text-muted-foreground">剪輯師:</span> <span className="font-medium">{editorName}</span></div>
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {video.crew && video.crew.length > 0 && (
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
                <h3 className="text-[14px] font-bold mb-3">拍攝團隊</h3>
                <div className="space-y-2">
                  {video.crew.map((member: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                      <span>{member.role || '成員'}</span>
                      <span className="font-medium">{member.name || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[14px] font-bold mb-3">快速統計</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-muted/20 rounded-md">
                  <p className="text-[18px] font-bold text-teal-600">{video.editingHours || 0}h</p>
                  <span className="text-[10px] text-muted-foreground">剪輯工時</span>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-md">
                  <p className="text-[18px] font-bold">{video.platforms?.length || 0}</p>
                  <span className="text-[10px] text-muted-foreground">發佈平台</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Linked Websites */}
      {activeTab === 'websites' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-bold">關聯網站（{linkedWebsites.length}）</h3>
            <button onClick={() => setShowLinkModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
              <Link2 size={12} /> 管理關聯
            </button>
          </div>
          {linkedWebsites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-[13px]">尚未關聯任何網站</div>
          ) : (
            <div className="space-y-2">
              {linkedWebsites.map(ws => (
                <div key={ws} className="flex items-center justify-between text-[13px] bg-muted/30 rounded px-4 py-3 border border-border/50">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-teal-600" />
                    <span className="font-medium">{ws}</span>
                  </div>
                  <button onClick={() => setLinkedWebsites(prev => prev.filter(w => w !== ws))} className="text-muted-foreground hover:text-red-500 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Linked Projects */}
      {activeTab === 'projects' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-bold">關聯項目（{linkedProjects.length}）</h3>
            <button onClick={() => setShowProjectModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
              <Link2 size={12} /> 關聯項目
            </button>
          </div>
          {linkedProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-[13px]">尚未關聯任何項目</div>
          ) : (
            <div className="space-y-2">
              {linkedProjects.map(pj => (
                <div key={pj} className="flex items-center justify-between text-[13px] bg-muted/30 rounded px-4 py-3 border border-border/50">
                  <span className="font-medium">{pj}</span>
                  <button onClick={() => setLinkedProjects(prev => prev.filter(p => p !== pj))} className="text-muted-foreground hover:text-red-500 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Distribution / Publish Records */}
      {activeTab === 'distribution' && (
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">多平台發佈記錄</h3>
              <button
                onClick={openAddDist}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
              >
                <Plus size={12} /> 新增發佈記錄
              </button>
            </div>
            {distRecords.length > 0 ? (
              <div className="space-y-2">
                {distRecords.map((rec) => {
                  const platformLabel: Record<string, string> = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', xiaohongshu: '小紅書', website_embed: '網站嵌入', other: '其他' };
                  const statusCfg: Record<string, { label: string; cls: string }> = {
                    pending: { label: '待上傳', cls: 'bg-amber-100 text-amber-700' },
                    uploaded: { label: '已上傳', cls: 'bg-teal-100 text-teal-700' },
                    scheduled: { label: '已排程', cls: 'bg-blue-100 text-blue-700' },
                  };
                  const sc = statusCfg[rec.status] || statusCfg.pending;
                  return (
                    <div key={rec.id} className="group flex items-center justify-between p-3 border border-border rounded-md hover:bg-muted/10 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <Globe size={13} className="text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold">{platformLabel[rec.platform] || rec.platform}</span>
                            <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', sc.cls)}>{sc.label}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            {rec.publishDate && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CalendarDays size={10} />{rec.publishDate}</span>}
                            {rec.views && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Eye size={10} />{Number(rec.views).toLocaleString()} 觀看</span>}
                            {rec.url && (
                              <a href={rec.url} target="_blank" rel="noreferrer" className="text-[11px] text-teal-600 hover:underline flex items-center gap-1">
                                <ExternalLink size={10} /> 查看連結
                              </a>
                            )}
                          </div>
                          {rec.notes && <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[360px]">{rec.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => openEditDist(rec)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Edit size={13} /></button>
                        <button onClick={() => deleteDist(rec.id)} className="p-1.5 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground text-[13px]">
                <Globe size={28} className="mx-auto mb-2 opacity-30" />
                尚未有發佈記錄，點擊「新增發佈記錄」開始追蹤
              </div>
            )}
          </div>
        </div>
      )}

      {/* Distribution Modal */}
      {showDistModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDistModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-bold">{editingDist ? '編輯發佈記錄' : '新增發佈記錄'}</h3>
              <button onClick={() => setShowDistModal(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium mb-1">發佈平台 <span className="text-rose-500">*</span></label>
                <select value={distForm.platform} onChange={e => setDistForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="xiaohongshu">小紅書</option>
                  <option value="website_embed">網站嵌入</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">發佈日期 <span className="text-rose-500">*</span></label>
                <input type="date" value={distForm.publishDate} onChange={e => setDistForm(f => ({ ...f, publishDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">發佈連結 (URL)</label>
                <input type="url" value={distForm.url} onChange={e => setDistForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..." className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">狀態</label>
                <select value={distForm.status} onChange={e => setDistForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                  <option value="pending">待上傳</option>
                  <option value="scheduled">已排程</option>
                  <option value="uploaded">已上傳</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">觀看次數</label>
                <input type="number" min="0" value={distForm.views} onChange={e => setDistForm(f => ({ ...f, views: e.target.value }))}
                  placeholder="0" className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">備註</label>
                <textarea value={distForm.notes} onChange={e => setDistForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="選填備註..." className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setShowDistModal(false)}>取消</Button>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={saveDist}
                disabled={!distForm.platform || !distForm.publishDate}>
                {editingDist ? '儲存更改' : '新增記錄'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Link Website Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowLinkModal(false)}>
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

      {/* Link Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">選擇關聯項目（可多選）</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              <p className="text-[12px] text-muted-foreground">可從項目列表中選擇關聯的項目。</p>
            </div>
            <button onClick={() => setShowProjectModal(false)} className="mt-4 w-full py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">確認</button>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <h3 className="text-[16px] font-bold mb-2">確認刪除</h3>
            <p className="text-[13px] text-muted-foreground mb-4">確認要刪除此影片嗎？此操作無法撤銷。</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
              <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white" onClick={() => { setShowDeleteConfirm(false); onBack(); }}>刪除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Video Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '',
  videoType: 'promo' as Video['videoType'],
  status: 'planning' as Video['status'],
  websiteProfileId: '',
  shootDate: '',
  publishDate: '',
  durationSeconds: '',
  editingHours: '',
  editorId: '',
  description: '',
  notes: '',
  reportDate: '',
  asanaLink: '',
  outputLink: '',
};

function AddVideoModal({ onClose, onSave }: { onClose: () => void; onSave: (video: any) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<typeof EMPTY_FORM>>({});

  const set = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const validate = () => {
    const e: Partial<typeof EMPTY_FORM> = {};
    if (!form.title.trim()) e.title = '請輸入影片標題';
    if (!form.videoType) e.videoType = '請選擇影片類型';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    const profile = websiteProfiles.find(w => w.id === form.websiteProfileId);
    const newVideo: any = {
      id: `v_${Date.now()}`,
      title: form.title.trim(),
      videoType: form.videoType,
      status: form.status,
      websiteProfileId: form.websiteProfileId || undefined,
      shootDate: form.shootDate || undefined,
      publishDate: form.publishDate || undefined,
      durationSeconds: form.durationSeconds ? Number(form.durationSeconds) : undefined,
      editingHours: form.editingHours ? Number(form.editingHours) : undefined,
      editorId: form.editorId || undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
      platforms: [],
      // Enriched fields from profile
      websiteName: profile?.websiteName || '',
      company: profile?.company || '',
      brand: profile?.brand || '',
    };
    onSave(newVideo);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[560px] max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Film size={16} className="text-teal-600" />
            <h2 className="text-[15px] font-bold">新增影片</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[12px] font-medium mb-1">影片標題 <span className="text-rose-500">*</span></label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="請輸入影片標題"
              className={cn(
                'w-full px-3 py-2 border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600',
                errors.title ? 'border-rose-400' : 'border-border'
              )}
            />
            {errors.title && <p className="text-[11px] text-rose-500 mt-1">{errors.title}</p>}
          </div>

          {/* Type + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1">影片類型 <span className="text-rose-500">*</span></label>
              <select
                value={form.videoType}
                onChange={e => set('videoType', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="promo">宣傳片</option>
                <option value="tutorial">教學</option>
                <option value="testimonial">客戶見證</option>
                <option value="event">活動</option>
                <option value="social_clip">社交短片</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1">製作狀態</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="planning">企劃中</option>
                <option value="shooting">拍攝中</option>
                <option value="post_production">後製中</option>
                <option value="completed">已完成</option>
                <option value="published">已發佈</option>
              </select>
            </div>
          </div>

          {/* Website Profile */}
          <div>
            <label className="block text-[12px] font-medium mb-1">關聯網站</label>
            <select
              value={form.websiteProfileId}
              onChange={e => set('websiteProfileId', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="">— 不關聯網站 —</option>
              {websiteProfiles.map(wp => (
                <option key={wp.id} value={wp.id}>
                  {wp.websiteName} ({wp.company} / {wp.brand})
                </option>
              ))}
            </select>
          </div>

          {/* Shoot + Publish date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1">拍攝日期</label>
              <input
                type="date"
                value={form.shootDate}
                onChange={e => set('shootDate', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1">預定發佈日期</label>
              <input
                type="date"
                value={form.publishDate}
                onChange={e => set('publishDate', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* Duration + Editing hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1">影片時長（秒）</label>
              <input
                type="number"
                min="0"
                value={form.durationSeconds}
                onChange={e => set('durationSeconds', e.target.value)}
                placeholder="例如：180"
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1">剪輯工時（h）</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.editingHours}
                onChange={e => set('editingHours', e.target.value)}
                placeholder="例如：8"
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-medium mb-1">影片描述</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="簡短描述影片內容..."
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none"
            />
          </div>

          {/* Report Date + Asana + Output */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1">日報日期</label>
              <input
                type="date"
                value={form.reportDate}
                onChange={e => set('reportDate', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1">Asana 連結</label>
              <input
                type="url"
                value={form.asanaLink}
                onChange={e => set('asanaLink', e.target.value)}
                placeholder="https://app.asana.com/..."
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium mb-1">成果連結 (Output Link)</label>
            <input
              type="url"
              value={form.outputLink}
              onChange={e => set('outputLink', e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-slate-50/60">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSubmit}
          >
            <Plus size={12} className="mr-1" /> 建立影片
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Module ─────────────────────────────────────────────────────────────

export function VideoListModule() {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [extraVideos, setExtraVideos] = useState<any[]>([]);

  const baseVideos = useMemo(() => getAllVideos(), []);
  const allVideos = useMemo(() => [...baseVideos, ...extraVideos], [baseVideos, extraVideos]);

  const handleAddVideo = (video: any) => {
    setExtraVideos(prev => [video, ...prev]);
  };

  const companies = useMemo(() => {
    const set = new Set(allVideos.map(v => v.company).filter(Boolean));
    return Array.from(set);
  }, [allVideos]);

  const filteredVideos = useMemo(() => {
    return allVideos.filter(v => {
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;
      if (filterCompany !== 'all' && v.company !== filterCompany) return false;
      if (categoryFilter !== 'all') {
        const { category } = getVideoProjectCategory(v.websiteName || '');
        if (category !== categoryFilter) return false;
      }
      if (searchQuery && !v.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [allVideos, filterStatus, filterCompany, categoryFilter, searchQuery]);

  const totalHours = allVideos.reduce((s, v) => s + (v.editingHours || 0), 0);
  const publishedCount = allVideos.filter(v => v.status === 'published').length;

  if (selectedVideo) {
    return <VideoDetail video={selectedVideo} onBack={() => setSelectedVideo(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">影片總數</span>
          <p className="text-[18px] font-bold">{allVideos.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">剪輯總工時</span>
          <p className="text-[18px] font-bold">{totalHours}h</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已發佈</span>
          <p className="text-[18px] font-bold text-teal-600">{publishedCount}</p>
        </div>
      </div>

      {/* Category Quick Switch */}
      <div className="flex items-center gap-1.5">
        {(['all', 'internal', 'client'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋影片..." className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部公司</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setFilterStatus('all')} className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterStatus === 'all' ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>全部</button>
          {Object.entries(statusConfig).map(([key, config]) => (
            <button key={key} onClick={() => setFilterStatus(key)} className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterStatus === key ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>{config.label}</button>
          ))}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增影片
        </button>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVideos.map((video) => {
          const config = statusConfig[video.status || 'planning'];
          const duration = video.durationSeconds
            ? `${Math.floor(video.durationSeconds / 60)}:${(video.durationSeconds % 60).toString().padStart(2, '0')}`
            : '—';
          return (
            <div
              key={video.id}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden hover:shadow-card-hover transition-all duration-200 cursor-pointer"
              onClick={() => setSelectedVideo(video)}
            >
              <div className="relative aspect-video bg-muted">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <Play size={24} className="text-muted-foreground/50" />
                </div>
                {duration !== '—' && (
                  <span className="absolute bottom-2 right-2 text-[11px] bg-black/70 text-white px-1.5 py-0.5 rounded">{duration}</span>
                )}
                <span className={cn('absolute top-2 left-2 text-[9px] font-medium px-1.5 py-0.5 rounded', config.bgColor, config.color)}>
                  {config.label}
                </span>
              </div>
              <div className="p-3">
                <h4 className="text-[14px] font-medium mb-2">{video.title}</h4>
                <div className="flex items-center gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <div key={step} className={cn('h-1 flex-1 rounded-full', step <= config.step ? 'bg-teal-600' : 'bg-muted')} />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="text-teal-600 font-medium">{video.websiteName}</span>
                  <span>{video.editingHours ? `${video.editingHours}h` : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                  <span>{video.company} / {video.brand}</span>
                  {video.videoType && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{videoTypeLabels[video.videoType] || video.videoType}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredVideos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的影片</div>
      )}

      {/* Add Video Modal */}
      {showAddModal && (
        <AddVideoModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddVideo}
        />
      )}
    </div>
  );
}
