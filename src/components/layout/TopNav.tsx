import { useApp, mainMenuItems } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { canAccessSettings } from '@/lib/permissions';
import { Search, Bell, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  DollarSign,
  FolderKanban,
  Globe,
  Megaphone,
  Video,
  Truck,
  BarChart3,
  Wrench,
  CreditCard,
  Settings,
  BookOpen,
  Users,
  Palette,
} from 'lucide-react';

const moduleIcons: Record<string, React.ElementType> = {
  'dashboard': LayoutDashboard,
  'day-report': FileText,
  'quotation': DollarSign,
  'project': FolderKanban,
  'website': Globe,
  'articles': BookOpen,
  'marketing': Megaphone,
  'video': Video,
  'graphic-design': Palette,
  'talent': Users,
  'supplier': Truck,
  'report': BarChart3,
  'tools-center': Wrench,
  'finance': CreditCard,
  'settings': Settings,
};

export function TopNav() {
  const { currentModule, navigateTo } = useApp();
  const { systemUser, userInfo, signOut } = useAuth();
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const visibleMenuItems = mainMenuItems.filter(
    m => m.id !== 'settings' || canAccessSettings(systemUser?.role)
  );

  return (
    <header className="fixed top-0 left-0 right-0 h-[48px] bg-[#0d1a2d] text-white z-40 flex items-center">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-full border-r border-white/10 shrink-0">
        <div className="w-7 h-7 rounded-md bg-teal-600 flex items-center justify-center">
          <span className="text-white font-bold text-xs">M</span>
        </div>
        <span className="font-bold text-[14px] tracking-tight whitespace-nowrap hidden md:inline">
          行銷專案系統
        </span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex items-center h-full px-1 overflow-x-auto scrollbar-hide">
        {visibleMenuItems.map((menuItem) => {
          const Icon = moduleIcons[menuItem.id] || LayoutDashboard;
          const isActive = currentModule === menuItem.id;

          return (
            <button
              key={menuItem.id}
              onClick={() => navigateTo(menuItem.id)}
              className={cn(
                'h-full px-3 text-[14px] font-medium whitespace-nowrap transition-all duration-200 relative flex items-center gap-1.5 shrink-0',
                isActive
                  ? 'text-white'
                  : 'text-white/55 hover:text-white/90'
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span>{menuItem.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-teal-500 rounded-t-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-2 px-4 h-full border-l border-white/10 shrink-0">
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border px-2.5 py-1 transition-all duration-200',
            searchFocused
              ? 'border-teal-500 bg-white/10 w-[180px]'
              : 'border-white/20 bg-white/5 w-[120px]'
          )}
        >
          <Search size={13} className="text-white/50 shrink-0" />
          <input
            type="text"
            placeholder="⌘K 搜尋"
            className="bg-transparent border-none outline-none text-[12px] w-full placeholder:text-white/40 text-white"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>

        <button className="relative p-1.5 rounded-md hover:bg-white/10 transition-colors duration-200">
          <Bell size={16} className="text-white/70" />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-teal-500 rounded-full" />
        </button>

        {/* User Avatar & Menu */}
        {systemUser && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/10 transition-colors duration-200"
            >
              {systemUser.profile_pic_url ? (
                <img
                  src={systemUser.profile_pic_url}
                  alt={systemUser.display_name}
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-teal-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {systemUser.display_name.charAt(0)}
                </div>
              )}
              <span className="text-[11px] text-white/80 max-w-[80px] truncate hidden lg:inline">
                {systemUser.display_name}
              </span>
              {(userInfo?.role_tag || systemUser.role) && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-600/30 text-teal-300 font-medium hidden lg:inline">
                  {userInfo?.role_tag || systemUser.role}
                </span>
              )}
            </button>
            {userMenuOpen && (
              <div className="absolute top-[40px] right-0 bg-white rounded-md shadow-lg border border-border min-w-[180px] z-[100] py-1">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-[12px] font-medium text-[#0d1a2d]">{systemUser.display_name}</p>
                  <p className="text-[10px] text-muted-foreground">{systemUser.email}</p>
                  {(userInfo?.role_tag || systemUser.role) && (
                    <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-medium">
                      {userInfo?.role_tag || systemUser.role}
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
                    setUserMenuOpen(false);
                    await signOut();
                  }}
                  className="w-full text-left px-3 py-2 text-[12px] text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2"
                >
                  <LogOut size={12} />
                  登出
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
