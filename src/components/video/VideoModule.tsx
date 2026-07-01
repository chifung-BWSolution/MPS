import { useState, useMemo } from 'react';
import { Plus, Calendar, Search, Tag, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllVideos } from '@/data/marketingData';
import { VideoListModule } from './VideoListModule';
import { VideoManagementModule } from './VideoManagementModule';
import { VideoChannelsList } from './VideoChannelsList';
import { DistributionTrackingModule } from './DistributionTrackingModule';

const videoTypeLabels: Record<string, string> = {
  promo: '宣傳片',
  tutorial: '教學',
  testimonial: '見證',
  event: '活動',
  social_clip: '社交短片',
};

// Shooting Schedule using unified data
function ShootingSchedule() {
  const allVideos = useMemo(() => getAllVideos(), []);
  
  // Derive schedule from videos that have shoot dates and are in planning/shooting
  const scheduleItems = useMemo(() => {
    return allVideos
      .filter(v => v.shootDate && (v.status === 'planning' || v.status === 'shooting' || v.status === 'post_production'))
      .sort((a, b) => (a.shootDate || '').localeCompare(b.shootDate || ''))
      .map(v => ({
        id: v.id || '',
        title: v.title || '',
        date: v.shootDate || '',
        websiteName: v.websiteName,
        company: v.company,
        brand: v.brand,
        status: v.status === 'shooting' ? 'confirmed' : v.status === 'post_production' ? 'confirmed' : 'planning',
        videoType: v.videoType,
      }));
  }, [allVideos]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-bold">拍攝排期</h3>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} />
          新增排期
        </button>
      </div>

      {scheduleItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">目前沒有待拍攝的影片</div>
      ) : (
        <div className="space-y-3">
          {scheduleItems.map((item) => (
            <div key={item.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all duration-200">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-[14px] font-bold">{item.title}</h4>
                  <div className="flex items-center gap-3 mt-1.5 text-[12px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {item.date}
                    </span>
                    <span className="text-teal-600">{item.websiteName}</span>
                    {item.videoType && (
                      <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded">
                        {videoTypeLabels[item.videoType] || item.videoType}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{item.company}</span>
                    <span className="text-[11px] bg-muted px-2 py-0.5 rounded">{item.brand}</span>
                  </div>
                </div>
                <span className={cn(
                  'text-[11px] font-medium px-2 py-0.5 rounded',
                  item.status === 'confirmed' ? 'bg-teal-100 text-teal-700' :
                  item.status === 'tentative' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-700'
                )}>
                  {item.status === 'confirmed' ? '已確認' : item.status === 'tentative' ? '待確認' : '規劃中'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Video Library placeholder
function VideoLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const allVideos = useMemo(() => getAllVideos(), []);
  const completedVideos = useMemo(() => 
    allVideos.filter(v => v.status === 'completed' || v.status === 'published'), 
    [allVideos]
  );
  const filteredLib = completedVideos.filter(v => 
    !searchQuery || v.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-bold">片庫</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋影片..."
              className="pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 w-[200px]"
            />
          </div>
          <button className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] border border-border rounded hover:bg-muted transition-colors duration-200">
            <Tag size={10} />
            篩選
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredLib.map((video) => (
          <div key={video.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden hover:shadow-card-hover transition-all duration-200 cursor-pointer">
            <div className="relative aspect-video bg-muted">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                <Play size={20} className="text-muted-foreground/50" />
              </div>
              {video.durationSeconds && (
                <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                  {Math.floor(video.durationSeconds / 60)}:{(video.durationSeconds % 60).toString().padStart(2, '0')}
                </span>
              )}
            </div>
            <div className="p-2.5">
              <h4 className="text-[12px] font-medium truncate">{video.title}</h4>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-teal-600">{video.websiteName}</span>
                <span className="text-[10px] text-muted-foreground">{video.brand}</span>
              </div>
              {video.platforms && video.platforms.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {video.platforms.map((p: any, i: number) => (
                    <span key={i} className="text-[9px] bg-muted px-1 py-0.5 rounded">{p.platform}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {filteredLib.length === 0 && (
        <div className="text-center py-8 text-[13px] text-muted-foreground">沒有符合條件的影片</div>
      )}
    </div>
  );
}

export function VideoModule({ subModule }: { subModule?: string }) {
  const activeTab = subModule || 'channels';

  const getTitle = () => {
    switch (activeTab) {
      case 'management': return { title: '影片管理', subtitle: '管理 Excel 影片產出時間軸，含 Vchannel、製作節點與平台發佈。' };
      case 'list': return { title: '影片列表', subtitle: '管理所有影片及其製作進度。' };
      case 'channels': return { title: '頻道管理', subtitle: '管理頻道基本信息及相應平臺信息' };
      case 'schedule': return { title: '拍攝排期', subtitle: '查看拍攝日程及里程碑安排。' };
      case 'library': return { title: '片庫', subtitle: '瀏覽已完成的影片素材庫。' };
      case 'distribution': return { title: '發佈追蹤', subtitle: '追蹤影片在各平台的發佈狀態。' };
      default: return { title: '頻道管理', subtitle: '管理頻道基本信息及相應平臺信息' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'management' && <VideoManagementModule />}
      {activeTab === 'list' && <VideoListModule />}
      {activeTab === 'channels' && <VideoChannelsList />}
      {activeTab === 'schedule' && <ShootingSchedule />}
      {activeTab === 'library' && <VideoLibrary />}
      {activeTab === 'distribution' && <DistributionTrackingModule />}
    </div>
  );
}
