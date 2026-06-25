import React, { createContext, useContext, useState, useMemo, ReactNode, useCallback, useEffect } from 'react';
import { User, UserRole } from '@/types/app';
import { useAuth } from '@/context/AuthContext';

export interface SubMenuItem {
  id: string;
  label: string;
}

export interface MainMenuItem {
  id: string;
  label: string;
  subMenus: SubMenuItem[];
}

export const mainMenuItems: MainMenuItem[] = [
  {
    id: 'dashboard',
    label: '首頁',
    subMenus: [
      { id: 'overview', label: '儀表板' },
      { id: 'my-projects', label: '我的項目' },
      { id: 'messages', label: '項目消息' },
      { id: 'updates', label: '成果更新' },
    ],
  },
  {
    id: 'day-report',
    label: '工作匯報',
    subMenus: [
      { id: 'submit', label: '提交匯報' },
      { id: 'today-team', label: '今日團隊' },
      { id: 'calendar', label: '工作日曆' },
      { id: 'team-view', label: '團隊總覽' },
      { id: 'monthly', label: '月度報告' },
      { id: 'analytics', label: '工時分析' },
      { id: 'work-categories', label: '工作類型' },
      { id: 'holiday-settings', label: '假期設定' },
    ],
  },
  {
    id: 'quotation',
    label: '客戶報價',
    subMenus: [
      { id: 'pitching', label: 'Pitching 紀錄' },
      { id: 'list', label: '報價單列表' },
      { id: 'new', label: '新建報價單' },
      { id: 'items', label: '報價項目' },
      { id: 'approval', label: '報價批核' },
      { id: 'clients', label: '客戶列表' },
      { id: 'client-projects', label: '客戶項目' },
    ],
  },
  {
    id: 'project',
    label: '專案策劃',
    subMenus: [
      { id: 'focus', label: '近期焦點' },
      { id: 'internal', label: '內部焦點項目' },
      { id: 'client', label: '客戶項目列表' },
      { id: 'progress', label: '項目進度' },
    ],
  },
  {
    id: 'planning-center',
    label: '規劃中心',
    subMenus: [
      { id: 'internal-plans', label: '內部發展計劃' },
      { id: 'promo-schedule', label: '推廣時間表' },
      { id: 'update-frequency', label: '更新頻率設定' },
      { id: 'kpi-targets', label: 'KPI 目標設定' },
      { id: 'manhour-templates', label: 'Man-Hour 標準模板' },
      { id: 'ai-efficiency', label: 'AI 效率對比' },
      { id: 'sales-gp', label: '銷售 & GP 目標' },
      { id: 'team-reports', label: '團隊匯報' },
    ],
  },
  {
    id: 'website',
    label: '網站+系統',
    subMenus: [
      { id: 'list', label: '網站列表' },
      { id: 'pending', label: '待跟進項目' },
      { id: 'articles-list', label: '文章列表' },
    ],
  },
  {
    id: 'marketing',
    label: '行銷管理',
    subMenus: [
      { id: 'calendar', label: '行銷日曆' },
      { id: 'social', label: '社交媒體' },
      { id: 'edm', label: 'EDM 管理' },
      { id: 'paid-ads', label: '付費廣告' },
      { id: 'seo', label: 'SEO 關鍵字' },
      { id: 'seo-upgrade', label: 'SEO 升級' },
      { id: 'graphic-design', label: '平面設計' },
    ],
  },
  {
    id: 'video',
    label: '影片製作',
    subMenus: [
      { id: 'list', label: '影片列表' },
      { id: 'channels', label: '影片頻道' },
      { id: 'schedule', label: '拍攝排期' },
      { id: 'library', label: '片庫' },
      { id: 'distribution', label: '發佈追蹤' },
    ],
  },
  {
    id: 'talent',
    label: '藝人管理',
    subMenus: [
      { id: 'list', label: '藝人列表' },
      { id: 'invite', label: '新增藝人1' },
      { id: 'categories', label: '藝人分類' },
      { id: 'interviews', label: '面試安排' },
      { id: 'collaborated', label: '已合作藝人' },
    ],
  },
  {
    id: 'supplier',
    label: '供應商',
    subMenus: [
      { id: 'list', label: '供應商列表' },
      { id: 'reviews', label: '供應商評價' },
    ],
  },
  {
    id: 'tools-center',
    label: '工具中心',
    subMenus: [
      { id: 'ai-keyword', label: 'AI 關鍵字生成器' },
      { id: 'ai-title', label: 'AI SEO標題生成器' },
      { id: 'ai-caption', label: 'AI 圖片說明生成' },
      { id: 'prompt-library', label: 'Prompt 資料庫' },
      { id: 'templates', label: '模板庫' },
      { id: 'training-modules', label: '培訓模組' },
      { id: 'training-progress', label: '培訓進度追蹤' },
    ],
  },
  {
    id: 'finance',
    label: '財務管理',
    subMenus: [
      { id: 'invoices', label: '發票列表' },
      { id: 'payments', label: '付款追蹤' },
      { id: 'credit-cards', label: '信用卡管理' },
      { id: 'by-company', label: '按公司查看' },
    ],
  },
  {
    id: 'settings',
    label: '系統設定',
    subMenus: [
      { id: 'profile', label: '個人設定' },
      { id: 'users', label: '用戶管理' },
      { id: 'companies', label: '公司管理' },
      { id: 'brands', label: '品牌管理' },
      { id: 'talent-form', label: '藝人表格' },
      { id: 'roles', label: '角色權限' },
      { id: 'notifications', label: '通知設定' },
      { id: 'options', label: '選項設定' },
      { id: 'credit-cards', label: '信用卡管理' },
      { id: 'quotation-settings', label: '客戶報價設定' },
      { id: 'terms-conditions', label: '條款及細則管理' },
      { id: 'staff-directory', label: '員工列表' },
      { id: 'login-logs', label: '登入紀錄' },
      { id: 'data-integrity', label: '資料完整性檢查' },
      { id: 'sample-data', label: '模擬數據管理' },
    ],
  },
];

interface AppContextType {
  user: User;
  currentModule: string;
  setCurrentModule: (module: string) => void;
  currentSubModule: string;
  setCurrentSubModule: (subModule: string) => void;
  navigateTo: (module: string, subModule?: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  selectedBrandId: string | null;
  setSelectedBrandId: (id: string | null) => void;
}

const fallbackUser: User = {
  id: '0',
  name: 'User',
  email: '',
  role: 'management',
  accessibleCompanies: ['c1', 'c2', 'c3'],
};

// Use globalThis to persist context across HMR reloads
const APP_CONTEXT_KEY = '__AppContext__';
if (!(globalThis as any)[APP_CONTEXT_KEY]) {
  (globalThis as any)[APP_CONTEXT_KEY] = createContext<AppContextType | undefined>(undefined);
}
const AppContext = (globalThis as any)[APP_CONTEXT_KEY] as React.Context<AppContextType | undefined>;

export function AppProvider({ children }: { children: ReactNode }) {
  const { systemUser, session } = useAuth();
  // Parse module/submodule from hash: #module/submodule
  const parseHash = () => {
    const hash = window.location.hash.replace('#', '');
    const [mod, sub] = hash.split('/');
    return { mod: mod || 'dashboard', sub: sub || '' };
  };

  const [currentModule, setCurrentModule] = useState(() => parseHash().mod);
  const [currentSubModule, setCurrentSubModule] = useState(() => {
    const { mod, sub } = parseHash();
    if (sub) return sub;
    const menuItem = mainMenuItems.find(m => m.id === mod);
    return menuItem?.subMenus[0]?.id || 'overview';
  });

  // Keep hash in sync when state changes externally (e.g. browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const { mod, sub } = parseHash();
      setCurrentModule(mod);
      const resolvedSub = sub || mainMenuItems.find(m => m.id === mod)?.subMenus[0]?.id || 'overview';
      setCurrentSubModule(resolvedSub);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  // Derive the user dynamically from the authenticated systemUser profile
  const user: User = useMemo(() => {
    if (!systemUser) return fallbackUser;
    
    // Ensure role is a valid UserRole, default to 'management' if not mappable
    const validRoles: UserRole[] = ['management', 'project_manager', 'designer', 'accountant', 'copywriter', 'video_editor', 'marketing', 'staff'];
    const mappedRole: UserRole = validRoles.includes(systemUser.role as UserRole)
      ? (systemUser.role as UserRole)
      : 'management';

    return {
      id: systemUser.id || '0',
      name: systemUser.display_name || session?.user?.user_metadata?.full_name || session?.user?.email || 'User',
      email: systemUser.email || systemUser.google_email || session?.user?.email || '',
      role: mappedRole,
      department: systemUser.department || undefined,
      accessibleCompanies: ['c1', 'c2', 'c3'],
    };
  }, [systemUser, session]);

  const navigateTo = useCallback((module: string, subModule?: string) => {
    const resolvedSub = subModule || mainMenuItems.find(m => m.id === module)?.subMenus[0]?.id || 'overview';
    setCurrentModule(module);
    setCurrentSubModule(resolvedSub);
    // Update the URL hash so refresh restores the same page
    window.location.hash = `${module}/${resolvedSub}`;
  }, []);

  // Hash-aware wrappers so any direct setCurrentModule/setCurrentSubModule call also updates the URL
  const setModuleWithHash = useCallback((module: string) => {
    setCurrentModule(module);
    const sub = mainMenuItems.find(m => m.id === module)?.subMenus[0]?.id || 'overview';
    setCurrentSubModule(sub);
    window.location.hash = `${module}/${sub}`;
  }, []);

  const setSubModuleWithHash = useCallback((subModule: string) => {
    setCurrentSubModule(subModule);
    window.location.hash = `${currentModule}/${subModule}`;
  }, [currentModule]);

  return (
    <AppContext.Provider
      value={{
        user: user,
        currentModule,
        setCurrentModule: setModuleWithHash,
        currentSubModule,
        setCurrentSubModule: setSubModuleWithHash,
        navigateTo,
        sidebarCollapsed,
        setSidebarCollapsed,
        selectedCompanyId,
        setSelectedCompanyId,
        selectedBrandId,
        setSelectedBrandId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
