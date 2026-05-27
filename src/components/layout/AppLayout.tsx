import { ReactNode } from 'react';
import { useApp } from '@/context/AppContext';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { sidebarCollapsed } = useApp();

  return (
    <div className="min-h-screen bg-[#f5f8fc]">
      <TopNav />
      <Sidebar />
      <main
        className={`pt-[48px] min-h-screen transition-all duration-200 ${sidebarCollapsed ? 'pl-[60px]' : 'pl-[220px]'}`}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
