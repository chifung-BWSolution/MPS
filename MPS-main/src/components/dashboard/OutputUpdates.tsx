import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Globe,
  FileText,
  Video,
  Share2,
  ExternalLink,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface OutputUpdate {
  id: string;
  type: 'website' | 'article' | 'video' | 'social_post';
  title: string;
  projectName: string;
  author: string;
  authorInitials: string;
  publishedAt: string;
  url?: string;
  description: string;
  brand: string;
}

const mockUpdates: OutputUpdate[] = [
  {
    id: '1',
    type: 'website',
    title: 'BW Design Centre 官網全新上線',
    projectName: 'BW 官方網站重設計',
    author: '黃小明',
    authorInitials: 'HX',
    publishedAt: '今天 14:30',
    url: 'https://www.bwdesign.com.hk',
    description:
      '全新設計的企業官網正式上線，採用全新視覺識別系統，包含 12 個頁面及響應式佈局。',
    brand: 'BW',
  },
  {
    id: '2',
    type: 'article',
    title: '2024 香港品牌設計趨勢分析',
    projectName: 'ACI 品牌推廣活動',
    author: '李芳芳',
    authorInitials: 'LF',
    publishedAt: '今天 11:00',
    url: 'https://www.aci.com.hk/blog/2024-design-trends',
    description:
      '一篇 2,500 字的 SEO 文章，涵蓋 5 個核心關鍵字，預計帶來月均 800 自然搜尋流量。',
    brand: 'ACI',
  },
  {
    id: '3',
    type: 'video',
    title: 'BSC 企業形象宣傳片',
    projectName: 'BSC 企業影片製作',
    author: '陳嘉欣',
    authorInitials: 'CJ',
    publishedAt: '昨天 17:45',
    url: 'https://youtube.com/watch?v=example',
    description:
      '3 分鐘企業宣傳影片已發佈至 YouTube 及公司網站，首日觀看次數達 1,200。',
    brand: 'BSC',
  },
  {
    id: '4',
    type: 'social_post',
    title: 'FCC 新品上架宣傳帖文',
    projectName: 'FCC 電商平台開發',
    author: '林美玲',
    authorInitials: 'LM',
    publishedAt: '昨天 10:00',
    description:
      'Instagram 及 Facebook 同步發佈，Carousel 格式，觸及人數 5,600，互動率 4.2%。',
    brand: 'FCC',
  },
  {
    id: '5',
    type: 'article',
    title: '紅酒保存完全指南',
    projectName: 'Wine Cellar SEO 升級',
    author: '王大文',
    authorInitials: 'WD',
    publishedAt: '2 天前',
    url: 'https://www.winecellar.hk/blog/wine-storage-guide',
    description:
      '3,000 字長尾關鍵字文章，目標關鍵字「紅酒保存方法」已進入 Google 第 1 頁。',
    brand: 'Wine Cellar',
  },
  {
    id: '6',
    type: 'website',
    title: 'ACI 產品頁面更新',
    projectName: 'ACI 品牌推廣活動',
    author: '張偉明',
    authorInitials: 'ZW',
    publishedAt: '2 天前',
    url: 'https://www.aci.com.hk/products',
    description: '產品列表頁面重新設計，新增篩選功能及產品比較工具，UX 大幅提升。',
    brand: 'ACI',
  },
];

const typeConfig: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  website: {
    icon: <Globe className="w-4 h-4" />,
    label: '網站上線',
    color: 'bg-teal-100 text-teal-700',
  },
  article: {
    icon: <FileText className="w-4 h-4" />,
    label: '文章發佈',
    color: 'bg-blue-100 text-blue-700',
  },
  video: {
    icon: <Video className="w-4 h-4" />,
    label: '影片發佈',
    color: 'bg-purple-100 text-purple-700',
  },
  social_post: {
    icon: <Share2 className="w-4 h-4" />,
    label: '社媒帖文',
    color: 'bg-pink-100 text-pink-700',
  },
};

export function OutputUpdates() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">成果更新</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            團隊最新完成及發佈的項目成果
          </p>
        </div>
        <Badge variant="secondary" className="text-[12px] gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          本週 6 項成果
        </Badge>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-teal-50 flex items-center justify-center">
              <Globe className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <div className="text-[20px] font-bold">2</div>
              <div className="text-[11px] text-muted-foreground">網站上線</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-[20px] font-bold">2</div>
              <div className="text-[11px] text-muted-foreground">文章發佈</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-purple-50 flex items-center justify-center">
              <Video className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="text-[20px] font-bold">1</div>
              <div className="text-[11px] text-muted-foreground">影片發佈</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-pink-50 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-pink-600" />
            </div>
            <div>
              <div className="text-[20px] font-bold">1</div>
              <div className="text-[11px] text-muted-foreground">社媒帖文</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Updates Feed */}
      <div className="space-y-4">
        {mockUpdates.map((update) => (
          <Card
            key={update.id}
            className="hover:shadow-md transition-shadow duration-200"
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${
                    typeConfig[update.type].color
                  }`}
                >
                  {typeConfig[update.type].icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold">
                          {update.title}
                        </h3>
                        {update.url && (
                          <a
                            href={update.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-600 hover:text-teal-700"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${typeConfig[update.type].color}`}
                        >
                          {typeConfig[update.type].label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {update.projectName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          •
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {update.brand}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                      <Calendar className="w-3 h-3" />
                      {update.publishedAt}
                    </div>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                    {update.description}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Avatar className="w-5 h-5">
                      <AvatarFallback className="text-[9px] bg-slate-100">
                        {update.authorInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] text-muted-foreground">
                      {update.author}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
