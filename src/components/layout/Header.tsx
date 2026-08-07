import { useApp, mainMenuItems } from '@/context/AppContext';
import { Search, Bell, Plus, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function Header() {
  const { user, sidebarCollapsed, currentModule, currentSubModule, navigateTo } = useApp();
  const [searchFocused, setSearchFocused] = useState(false);

  const currentMenu = mainMenuItems.find(m => m.id === currentModule);
  const currentSub = currentMenu?.subMenus.find(s => s.id === currentSubModule);

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-[60px] bg-white border-b border-[rgba(13,26,45,0.08)] flex items-center justify-between px-6 z-40 transition-all duration-200',
        sidebarCollapsed ? 'left-[60px]' : 'left-[240px]'
      )}
    >
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigateTo('dashboard')}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-teal-600 transition-colors"
        >
          <Home size={13} />
          <span>首頁</span>
        </button>
        {currentModule !== 'dashboard' && (
          <>
            <span className="text-[13px] text-muted-foreground">/</span>
            <span className="text-[13px] font-medium text-[#0d1a2d]">
              {currentMenu?.label}
            </span>
            {currentSub && (
              <>
                <span className="text-[13px] text-muted-foreground">/</span>
                <span className="text-[13px] text-muted-foreground">
                  {currentSub.label}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-1.5 transition-all duration-200 bg-white',
            searchFocused ? 'border-teal-600 ring-1 ring-teal-600/20 w-[260px]' : 'border-[rgba(13,26,45,0.12)] w-[180px]'
          )}
        >
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="⌘K 搜尋..."
            className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-muted-foreground"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-md hover:bg-muted transition-colors duration-200">
          <Bell size={18} className="text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-teal-600 rounded-full" />
        </button>

        {/* Quick Action */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]">
          <Plus size={14} />
          <span>新增</span>
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-[rgba(13,26,45,0.08)]">
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
            <span className="text-teal-700 text-xs font-bold">
              {user.name.charAt(0)}
            </span>
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-[13px] font-medium leading-tight text-[#0d1a2d]">{user.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {user.role === 'management'
                ? '管理層'
                : user.role === 'project_manager'
                  ? '專案經理'
                  : user.role === 'designer'
                    ? '設計師'
                    : user.role === 'accountant'
                      ? '會計'
                      : user.role === 'copywriter'
                        ? '文案'
                        : user.role === 'video_editor'
                          ? '影片剪輯'
                          : user.role === 'marketing'
                            ? '市場推廣'
                            : user.role === 'staff'
                              ? '員工'
                              : user.role}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
