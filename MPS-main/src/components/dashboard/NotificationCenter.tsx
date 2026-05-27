import { AlertCircle, CheckCircle, Clock, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'approval' | 'overdue' | 'alert' | 'completed';
  time: string;
  module?: string;
  subModule?: string;
}

const typeConfig = {
  approval: { icon: FileCheck, color: 'text-teal-600', bgColor: 'bg-teal-50' },
  overdue: { icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  alert: { icon: AlertCircle, color: 'text-rose-500', bgColor: 'bg-rose-50' },
  completed: { icon: CheckCircle, color: 'text-slate-500', bgColor: 'bg-slate-50' },
};

const notifications: NotificationItem[] = [
  { id: '1', title: '報價審核', message: 'QT-2024-031 等待您的審核', type: 'approval', time: '5 分鐘前', module: 'quotation', subModule: 'approval' },
  { id: '2', title: '逾期任務', message: '品牌指南交付已逾期 2 天', type: 'overdue', time: '1 小時前', module: 'project', subModule: 'focus' },
  { id: '3', title: '預算警示', message: '酒莊活動預算已使用 85%', type: 'alert', time: '2 小時前', module: 'project', subModule: 'focus' },
  { id: '4', title: '報告已核准', message: '您 12/12 的日報已通過審核', type: 'completed', time: '3 小時前', module: 'day-report', subModule: 'submit' },
  { id: '5', title: '新任務指派', message: '您已被指派至行動 APP 開發專案', type: 'approval', time: '5 小時前', module: 'project', subModule: 'focus' },
];

export function NotificationCenter() {
  const { navigateTo } = useApp();

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-bold">通知與待辦事項</h3>
        <button
          onClick={() => navigateTo('settings', 'notifications')}
          className="text-[13px] text-teal-600 font-medium hover:underline"
        >
          查看全部
        </button>
      </div>
      <div className="space-y-3">
        {notifications.map((item) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          return (
            <div
              key={item.id}
              onClick={() => item.module && navigateTo(item.module, item.subModule)}
              className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors duration-200 cursor-pointer"
            >
              <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', config.bgColor)}>
                <Icon size={14} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium block">{item.title}</span>
                <span className="text-[12px] text-muted-foreground block truncate">{item.message}</span>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{item.time}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
