import { useState, useMemo } from 'react';
import { Play, Search } from 'lucide-react';
import { getAllVideos } from '@/data/marketingData';
import { VideoWorkflowProvider } from '@/hooks/useVideoWorkflow';
import { VideoListModule } from './VideoListModule';
import { VideoManagementModule } from './VideoManagementModule';
import { VideoChannelsList } from './VideoChannelsList';
import { VideoAccountsList } from './VideoAccountsList';
import { VideoLoginMethodsModule } from './VideoLoginMethodsModule';
import { DistributionTrackingModule } from './DistributionTrackingModule';
import { VideoScheduleModule } from './workflow/VideoScheduleModule';
import { VideoProductionModule } from './workflow/VideoProductionModule';
import { VideoReviewModule } from './workflow/VideoReviewModule';
import { VideoPublishModule } from './workflow/VideoPublishModule';

function VideoLibrary() {
  const [searchQuery, setSearchQuery] = useState('');
  const allVideos = useMemo(() => getAllVideos(), []);
  const completedVideos = useMemo(
    () => allVideos.filter(v => v.status === 'completed' || v.status === 'published'),
    [allVideos],
  );
  const filteredLib = completedVideos.filter(
    v => !searchQuery || v.title?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-bold">片庫</h3>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜尋影片..."
            className="pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 w-[200px] bg-white"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredLib.map(video => (
          <div key={video.id} className="bg-white rounded-md border overflow-hidden">
            <div className="aspect-video bg-muted flex items-center justify-center">
              <Play size={20} className="text-muted-foreground/50" />
            </div>
            <div className="p-2.5">
              <h4 className="text-[12px] font-medium truncate">{video.title}</h4>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoModuleContent({ subModule }: { subModule?: string }) {
  const activeTab = subModule || 'schedule';

  const getTitle = () => {
    switch (activeTab) {
      case 'schedule':
        return { title: '拍攝排期', subtitle: '日曆與準備工作清單：文案、腳本、Model、場地、攝影師與到場人員。' };
      case 'production':
        return { title: '影片製作', subtitle: '素材與剪輯執行；Demo 完成後提交審核。' };
      case 'review':
        return { title: '影片審核', subtitle: '審核 Demo 成品，通過或拒絕並填寫理由。' };
      case 'publish':
        return { title: '影片發佈', subtitle: '多平台發佈與發佈日期管理。' };
      case 'coordination':
      case 'management':
        return { title: '影片統籌', subtitle: '全局影片產出時間軸，查看所有狀態的影片記錄。' };
      case 'channels':
        return { title: '頻道設定', subtitle: '管理 Vchannel 基本信息及相應平台信息。' };
      case 'accounts':
        return { title: '平台帳號', subtitle: '管理 Vchannel 對應的平台帳號（Login），支援多頻道共用。' };
      case 'login-methods':
        return { title: '登入方式', subtitle: '管理影片製作相關帳號的登入方式、聯絡資料與雙重驗證。' };
      case 'list':
        return { title: '影片列表', subtitle: '管理所有影片及其製作進度。' };
      case 'library':
        return { title: '片庫', subtitle: '瀏覽已完成的影片素材庫。' };
      case 'distribution':
        return { title: '發佈追蹤', subtitle: '追蹤影片在各平台的發佈狀態。' };
      default:
        return { title: '拍攝排期', subtitle: '日曆與準備工作清單。' };
    }
  };

  const { title, subtitle } = getTitle();
  const resolvedTab = activeTab === 'management' ? 'coordination' : activeTab;
  // coordination / schedule 自行管理標題與視窗高度佈局
  const ownsHeader =
    resolvedTab === 'coordination' ||
    resolvedTab === 'schedule' ||
    resolvedTab === 'channels' ||
    resolvedTab === 'accounts' ||
    resolvedTab === 'login-methods';

  return (
    <div className={ownsHeader ? '' : 'space-y-6'}>
      {!ownsHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
            <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
      )}

      {resolvedTab === 'schedule' && <VideoScheduleModule />}
      {resolvedTab === 'production' && <VideoProductionModule />}
      {resolvedTab === 'review' && <VideoReviewModule />}
      {resolvedTab === 'publish' && <VideoPublishModule />}
      {resolvedTab === 'coordination' && <VideoManagementModule />}
      {resolvedTab === 'channels' && <VideoChannelsList />}
      {resolvedTab === 'accounts' && <VideoAccountsList />}
      {resolvedTab === 'login-methods' && <VideoLoginMethodsModule />}
      {resolvedTab === 'list' && <VideoListModule />}
      {resolvedTab === 'library' && <VideoLibrary />}
      {resolvedTab === 'distribution' && <DistributionTrackingModule />}
    </div>
  );
}

export function VideoModule({ subModule }: { subModule?: string }) {
  return (
    <VideoWorkflowProvider>
      <VideoModuleContent subModule={subModule} />
    </VideoWorkflowProvider>
  );
}
