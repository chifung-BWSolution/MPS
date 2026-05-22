import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';

interface ActivityItem {
  id: string;
  action: string;
  user: string;
  module: string;
  time: string;
  navModule?: string;
  navSubModule?: string;
}

const activities: ActivityItem[] = [
  { id: '1', action: '提交了日報', user: '陳小華', module: '日報表', time: '10 分鐘前', navModule: 'day-report', navSubModule: 'team-view' },
  { id: '2', action: '核准了報價 QT-2024-029', user: '張偉明', module: '客戶報價', time: '25 分鐘前', navModule: 'quotation', navSubModule: 'list' },
  { id: '3', action: '上傳了影片素材', user: '朴賢俊', module: '影片製作', time: '1 小時前', navModule: 'video', navSubModule: 'library' },
  { id: '4', action: '將任務移至已完成', user: '戴維斯', module: '專案管理', time: '1.5 小時前', navModule: 'project', navSubModule: 'progress' },
  { id: '5', action: '評價了供應商 (4.5★)', user: '陳小華', module: '供應商', time: '2 小時前', navModule: 'supplier', navSubModule: 'list' },
  { id: '6', action: '建立了新專案', user: '張偉明', module: '專案管理', time: '3 小時前', navModule: 'project', navSubModule: 'focus' },
  { id: '7', action: '寄出報價給客戶', user: '戴維斯', module: '客戶報價', time: '4 小時前', navModule: 'quotation', navSubModule: 'list' },
  { id: '8', action: '紀錄了部分付款', user: '財務系統', module: '財務管理', time: '5 小時前', navModule: 'finance', navSubModule: 'invoices' },
];

export function RecentActivity() {
  const { navigateTo } = useApp();

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-bold">近期活動</h3>
        <button
          onClick={() => navigateTo('report', 'performance')}
          className="text-[13px] text-teal-600 font-medium hover:underline"
        >
          查看全部
        </button>
      </div>
      <div className="space-y-0">
        {activities.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => item.navModule && navigateTo(item.navModule, item.navSubModule)}
            className={cn(
              'flex items-center gap-3 py-2.5 cursor-pointer hover:bg-muted/30 rounded transition-colors px-1',
              idx < activities.length - 1 && 'border-b border-border/50'
            )}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[13px]">
                <span className="font-medium">{item.user}</span>
                <span className="text-muted-foreground"> {item.action}</span>
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
