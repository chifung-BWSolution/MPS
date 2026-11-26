import {
  CalendarDays,
  ClipboardCheck,
  Columns3,
  Images,
  LayoutDashboard,
  Radar,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentPage } from '@/lib/contentTypes.ts';

export interface SocialSubNavProps {
  page: ContentPage;
  hasStudioPost: boolean;
  onNavigate: (page: ContentPage) => void;
}

const ITEMS: { page: ContentPage; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'overview', label: '今日工作', icon: LayoutDashboard },
  { page: 'radar', label: '內容熱點', icon: Radar },
  { page: 'queue', label: '進度看板', icon: Columns3 },
  { page: 'studio', label: '審核工作室', icon: ClipboardCheck },
  { page: 'calendar', label: '發佈日曆', icon: CalendarDays },
  { page: 'library', label: '素材庫', icon: Images },
  { page: 'accounts', label: '品牌與帳號', icon: Users },
];

/** 社媒線的二級導航（PRD §5.1 social 頁群） */
export function SocialSubNav({ page, hasStudioPost, onNavigate }: SocialSubNavProps) {
  return (
    <nav
      aria-label="社媒營運頁面"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-card"
    >
      {ITEMS.map((item) => {
        const active = item.page === page;
        const Icon = item.icon;
        const needsPost = item.page === 'studio' && !hasStudioPost;
        return (
          <button
            key={item.page}
            type="button"
            onClick={() => onNavigate(item.page)}
            aria-current={active ? 'page' : undefined}
            title={needsPost ? '先從進度看板選一批，或直接開啟工作室再挑' : item.label}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors',
              active
                ? 'bg-[#0d1a2d] text-white'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#0d1a2d]',
            )}
          >
            <Icon size={13} strokeWidth={2} className={active ? 'text-teal-300' : 'text-slate-400'} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
