import { useApp, mainMenuItems } from '@/context/AppContext';
import {
  LayoutDashboard,
  FileText,
  DollarSign,
  FolderKanban,
  Megaphone,
  Video,
  Truck,
  BarChart3,
  Wrench,
  CreditCard,
  Settings,
  Globe,
  ChevronLeft,
  ChevronRight,
  Home,
  BookOpen,
  Target,
  Users,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const moduleIcons: Record<string, React.ElementType> = {
  'dashboard': LayoutDashboard,
  'day-report': FileText,
  'quotation': DollarSign,
  'project': FolderKanban,
  'planning-center': Target,
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

function getRoleLabel(role: string) {
  switch (role) {
    case 'management': return '管理層';
    case 'project_manager': return '專案經理';
    case 'designer': return '設計師';
    case 'accountant': return '會計';
    case 'copywriter': return '文案';
    case 'video_editor': return '影片剪輯';
    case 'marketing': return '市場推廣';
    case 'staff': return '員工';
    default: return role;
  }
}

export function Sidebar() {
  const { user, currentModule, currentSubModule, navigateTo, sidebarCollapsed, setSidebarCollapsed } = useApp();

  // Get the current module's menu item
  const currentMenuData = mainMenuItems.find(m => m.id === currentModule);
  const ModuleIcon = moduleIcons[currentModule] || LayoutDashboard;
  const hasSubMenus = currentMenuData && currentMenuData.subMenus.length > 0;

  return (
    <aside
      className={cn(
        'fixed left-0 top-[48px] bottom-0 bg-white border-r border-[rgba(13,26,45,0.08)] flex flex-col z-40 transition-all duration-200',
        sidebarCollapsed ? 'w-[60px]' : 'w-[220px]'
      )}
    >
      {/* Current Module Header */}
      <div className="flex items-center gap-2.5 px-4 h-[50px] border-b border-[rgba(13,26,45,0.06)] shrink-0">
        {!sidebarCollapsed ? (
          <>
            <ModuleIcon size={18} className="text-teal-600 shrink-0" />
            <span className="font-semibold text-[14px] text-[#0d1a2d] truncate">
              {currentMenuData?.label || '主頁'}
            </span>
          </>
        ) : (
          <ModuleIcon size={18} className="text-teal-600 mx-auto" />
        )}
      </div>

      {/* Back to Dashboard shortcut */}
      {currentModule !== 'dashboard' && (
        <div className="px-2 pt-2">
          <button
            onClick={() => navigateTo('dashboard')}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-[12px] text-muted-foreground hover:text-teal-600 hover:bg-teal-50 transition-all duration-200',
              sidebarCollapsed && 'justify-center px-0'
            )}
            title={sidebarCollapsed ? '返回首頁' : undefined}
          >
            <Home size={14} className="shrink-0" />
            {!sidebarCollapsed && <span>返回首頁</span>}
          </button>
        </div>
      )}

      {/* Sub-menu Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {hasSubMenus ? (
          <ul className="space-y-0.5">
            {currentMenuData.subMenus.map((subItem, index) => {
              const isSubActive = currentSubModule === subItem.id;
              const prevSection = index > 0 ? currentMenuData.subMenus[index - 1]?.section : undefined;
              const showSection =
                !sidebarCollapsed &&
                !!subItem.section &&
                subItem.section !== prevSection;

              return (
                <li key={subItem.id}>
                  {showSection && (
                    <div
                      className={cn(
                        'px-3 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground',
                        index === 0 && 'pt-1',
                      )}
                    >
                      {subItem.section}
                    </div>
                  )}
                  <button
                    onClick={() => navigateTo(currentModule, subItem.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-200',
                      isSubActive
                        ? 'bg-teal-50 text-teal-700 border border-teal-100'
                        : 'text-[#0d1a2d]/70 hover:bg-[#f5f8fc] hover:text-[#0d1a2d]',
                      sidebarCollapsed && 'justify-center px-0'
                    )}
                    title={sidebarCollapsed ? subItem.label : undefined}
                  >
                    {!sidebarCollapsed ? (
                      <>
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          isSubActive ? 'bg-teal-500' : 'bg-[#0d1a2d]/20'
                        )} />
                        <span>{subItem.label}</span>
                      </>
                    ) : (
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        isSubActive ? 'bg-teal-500' : 'bg-[#0d1a2d]/20'
                      )} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          !sidebarCollapsed && (
            <div className="px-3 py-4 text-[12px] text-muted-foreground text-center">
              此模組無子選單
            </div>
          )
        )}
      </nav>

      {/* User Profile Section */}
      <div className="p-3 border-t border-[rgba(13,26,45,0.06)]">
        {!sidebarCollapsed ? (
          <div
            onClick={() => navigateTo('settings', 'profile')}
            className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-[#f5f8fc] transition-colors cursor-pointer"
            title="查看 / 編輯個人設定"
          >
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <span className="text-teal-700 text-xs font-bold">
                {user.name.charAt(0)}
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-medium leading-tight text-[#0d1a2d] truncate">
                {user.name}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {getRoleLabel(user.role)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div
              onClick={() => navigateTo('settings', 'profile')}
              className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center cursor-pointer"
              title={`${user.name} - 查看個人設定`}
            >
              <span className="text-teal-700 text-xs font-bold">
                {user.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="px-2 pb-2">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-muted-foreground hover:text-[#0d1a2d] hover:bg-[#f5f8fc] transition-all duration-200"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!sidebarCollapsed && <span className="text-[12px]">收起選單</span>}
        </button>
      </div>
    </aside>
  );
}
