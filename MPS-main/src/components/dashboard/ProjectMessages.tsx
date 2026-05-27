import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageSquare, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ProjectMessage {
  id: string;
  projectName: string;
  sender: string;
  senderInitials: string;
  message: string;
  timestamp: string;
  type: 'update' | 'request' | 'alert' | 'approval';
  isRead: boolean;
}

const mockMessages: ProjectMessage[] = [
  {
    id: '1',
    projectName: 'BW 官方網站重設計',
    sender: '李芳芳',
    senderInitials: 'LF',
    message: '首頁設計稿已完成，請查看 Figma 連結並提供反饋。',
    timestamp: '10 分鐘前',
    type: 'update',
    isRead: false,
  },
  {
    id: '2',
    projectName: 'ACI 品牌推廣活動',
    sender: '張偉明',
    senderInitials: 'ZW',
    message: 'Facebook 廣告素材需要在今天下午前確認，請盡快審批。',
    timestamp: '30 分鐘前',
    type: 'request',
    isRead: false,
  },
  {
    id: '3',
    projectName: 'BSC 企業影片製作',
    sender: '陳嘉欣',
    senderInitials: 'CJ',
    message: '影片後製完成 80%，預計明天可以出初剪版本。',
    timestamp: '1 小時前',
    type: 'update',
    isRead: true,
  },
  {
    id: '4',
    projectName: 'FCC 電商平台開發',
    sender: '系統通知',
    senderInitials: 'SY',
    message: '項目預算使用已達 82%，請注意控制支出。',
    timestamp: '2 小時前',
    type: 'alert',
    isRead: true,
  },
  {
    id: '5',
    projectName: 'Wine Cellar SEO 升級',
    sender: '王大文',
    senderInitials: 'WD',
    message: 'SEO 報告已提交，關鍵字排名較上月提升 12 位。',
    timestamp: '3 小時前',
    type: 'approval',
    isRead: true,
  },
  {
    id: '6',
    projectName: 'BW 官方網站重設計',
    sender: '黃小明',
    senderInitials: 'HX',
    message: '後端 API 整合測試通過，已部署到 staging 環境。',
    timestamp: '4 小時前',
    type: 'update',
    isRead: true,
  },
  {
    id: '7',
    projectName: 'ACI 品牌推廣活動',
    sender: '林美玲',
    senderInitials: 'LM',
    message: '社交媒體內容排程已更新，本週共 8 篇帖文。',
    timestamp: '5 小時前',
    type: 'update',
    isRead: true,
  },
];

const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  update: {
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    color: 'bg-blue-100 text-blue-700',
  },
  request: {
    icon: <Clock className="w-3.5 h-3.5" />,
    color: 'bg-amber-100 text-amber-700',
  },
  alert: {
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    color: 'bg-red-100 text-red-700',
  },
  approval: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    color: 'bg-teal-100 text-teal-700',
  },
};

const typeLabels: Record<string, string> = {
  update: '進度更新',
  request: '待處理',
  alert: '警告',
  approval: '已完成',
};

export function ProjectMessages() {
  const unreadCount = mockMessages.filter((m) => !m.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">項目消息</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            各項目的最新動態、通知與待處理事項
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-[12px]">
            {unreadCount} 則未讀
          </Badge>
        )}
      </div>

      {/* Message List */}
      <div className="space-y-3">
        {mockMessages.map((msg) => (
          <Card
            key={msg.id}
            className={`hover:shadow-md transition-shadow duration-200 cursor-pointer ${
              !msg.isRead ? 'border-l-4 border-l-teal-500 bg-teal-50/30' : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarFallback className="text-[11px] bg-slate-100">
                    {msg.senderInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold">
                        {msg.sender}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${typeConfig[msg.type].color}`}
                      >
                        <span className="mr-1">{typeConfig[msg.type].icon}</span>
                        {typeLabels[msg.type]}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {msg.timestamp}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {msg.projectName}
                  </p>
                  <p className="text-[13px] mt-1.5 text-foreground leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
