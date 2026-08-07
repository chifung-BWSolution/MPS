import { useState } from 'react';
import { FileText, FileSpreadsheet, Globe, FileEdit, Video, Share2, Clock, Filter, TrendingUp, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ReportModule({ subModule }: { subModule?: string }) {
  const getTitle = () => {
    switch (subModule) {
      case 'performance': return { title: '績效報告', subtitle: '數據驅動的績效指標及產出分析。' };
      case 'manhour': return { title: '工時報告', subtitle: '團隊工時趨勢及分佈統計。' };
      case 'budget': return { title: '預算報告', subtitle: '各項目預算使用率對比分析。' };
      case 'year-plan': return { title: '年度計劃', subtitle: '年度目標達成率及進度追蹤。' };
      default: return { title: '績效報告', subtitle: '數據驅動的績效指標及產出分析。' };
    }
  };

  const { title, subtitle } = getTitle();

  const renderContent = () => {
    switch (subModule) {
      case 'performance': return <PerformanceReport />;
      case 'manhour': return <ManhourReport />;
      case 'budget': return <BudgetReport />;
      case 'year-plan': return <YearPlanReport />;
      default: return <PerformanceReport />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-muted transition-colors duration-200">
            <FileText size={14} />PDF
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm hover:bg-muted transition-colors duration-200">
            <FileSpreadsheet size={14} />CSV
          </button>
        </div>
      </div>
      {renderContent()}
    </div>
  );
}

function PerformanceReport() {
  // KPI Data
  const kpis = [
    { label: '網站數', value: '12', sub: '活躍管理中', icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '頁面數', value: '68', sub: '平均 3.2h/頁面', icon: FileEdit, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: '文章數', value: '34', sub: '平均 2.5h/篇', icon: FileText, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '影片數', value: '18', sub: '平均 6.0h/條', icon: Video, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: '社媒發佈', value: '156', sub: '本月', icon: Share2, color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: '總投入工時', value: '1,248h', sub: '本季度', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  const websiteHours = [
    { name: 'BW Design Centre', pages: 120, articles: 45, videos: 30, social: 25 },
    { name: 'ACI Global', pages: 85, articles: 38, videos: 22, social: 40 },
    { name: 'FCC Media', pages: 60, articles: 28, videos: 48, social: 35 },
    { name: 'BSC Tech', pages: 45, articles: 20, videos: 15, social: 18 },
    { name: 'Wine Club', pages: 30, articles: 15, videos: 12, social: 28 },
    { name: 'SportMax', pages: 25, articles: 12, videos: 8, social: 15 },
  ];

  const staffPerformance = [
    { name: '陳小華', hours: 168, articles: 8, videos: 2, posts: 24 },
    { name: '朴賢俊', hours: 176, articles: 2, videos: 12, posts: 8 },
    { name: '王志明', hours: 160, articles: 12, videos: 0, posts: 32 },
    { name: '戴維斯', hours: 152, articles: 4, videos: 6, posts: 16 },
    { name: '李芳', hours: 144, articles: 6, videos: 0, posts: 28 },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
              <div className={cn('w-8 h-8 rounded-md flex items-center justify-center mb-2', k.bg)}>
                <Icon size={16} className={k.color} />
              </div>
              <span className="text-[22px] font-bold block">{k.value}</span>
              <span className="text-[11px] text-muted-foreground">{k.label}</span>
              <span className="text-[10px] text-muted-foreground block">{k.sub}</span>
            </div>
          );
        })}
      </div>

      {/* Website Hours Stacked Bar */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h4 className="text-[15px] font-bold mb-4">各網站投入工時分佈</h4>
        <div className="space-y-3">
          {websiteHours.map(site => {
            const total = site.pages + site.articles + site.videos + site.social;
            return (
              <div key={site.name} className="flex items-center gap-3">
                <span className="text-[12px] font-medium w-[120px] truncate">{site.name}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden flex">
                  <div className="h-full bg-blue-400" style={{ width: `${(site.pages / total) * 100}%` }} title={`頁面: ${site.pages}h`} />
                  <div className="h-full bg-green-400" style={{ width: `${(site.articles / total) * 100}%` }} title={`文章: ${site.articles}h`} />
                  <div className="h-full bg-purple-400" style={{ width: `${(site.videos / total) * 100}%` }} title={`影片: ${site.videos}h`} />
                  <div className="h-full bg-pink-400" style={{ width: `${(site.social / total) * 100}%` }} title={`社媒: ${site.social}h`} />
                </div>
                <span className="text-[11px] font-medium w-[40px] text-right">{total}h</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-400" /><span className="text-[11px]">頁面設計</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-400" /><span className="text-[11px]">文章</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-purple-400" /><span className="text-[11px]">影片</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-pink-400" /><span className="text-[11px]">社媒</span></div>
        </div>
      </div>

      {/* Staff Performance */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h4 className="text-[15px] font-bold mb-4">人力效能統計</h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">同事</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">月工時</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">文章數</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">影片數</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">帖文數</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground px-3 py-2">產出效率</th>
              </tr>
            </thead>
            <tbody>
              {staffPerformance.map(s => {
                const totalOutput = s.articles + s.videos + s.posts;
                const efficiency = (totalOutput / s.hours * 10).toFixed(1);
                return (
                  <tr key={s.name} className="border-b border-border/50">
                    <td className="px-3 py-2 text-[13px] font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-[13px]">{s.hours}h</td>
                    <td className="px-3 py-2 text-[13px]">{s.articles}</td>
                    <td className="px-3 py-2 text-[13px]">{s.videos}</td>
                    <td className="px-3 py-2 text-[13px]">{s.posts}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-teal-600 rounded-full" style={{ width: `${Math.min(parseFloat(efficiency) * 10, 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-medium">{efficiency}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Hours Ranking */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h4 className="text-[15px] font-bold mb-4">同事工時排行（進度條）</h4>
        <div className="space-y-3">
          {staffPerformance.sort((a, b) => b.hours - a.hours).map((s, idx) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-[12px] font-bold text-muted-foreground w-4">{idx + 1}</span>
              <span className="text-[13px] font-medium w-[60px]">{s.name}</span>
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${(s.hours / 200) * 100}%` }} />
              </div>
              <span className="text-[12px] font-bold w-[50px] text-right">{s.hours}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManhourReport() {
  const dailyData = [
    { date: '12/9', hours: 42 },
    { date: '12/10', hours: 38 },
    { date: '12/11', hours: 44 },
    { date: '12/12', hours: 40 },
    { date: '12/13', hours: 36 },
    { date: '12/14', hours: 18 },
    { date: '12/15', hours: 23 },
  ];

  const categoryDistribution = [
    { name: '網站建設', hours: 320, pct: 35 },
    { name: '文章撰寫', hours: 180, pct: 20 },
    { name: '影片製作', hours: 150, pct: 16 },
    { name: '社交媒體', hours: 120, pct: 13 },
    { name: 'SEO 優化', hours: 80, pct: 9 },
    { name: '會議', hours: 45, pct: 5 },
    { name: '其他', hours: 20, pct: 2 },
  ];

  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-cyan-500', 'bg-gray-400'];

  return (
    <div className="space-y-6">
      {/* Daily trend */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h4 className="text-[15px] font-bold mb-4">每日團隊工時趨勢</h4>
        <div className="flex items-end gap-2 h-[160px]">
          {dailyData.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end">
              <span className="text-[11px] font-medium mb-1">{d.hours}h</span>
              <div className="w-full bg-teal-600 rounded-t" style={{ height: `${(d.hours / 50) * 120}px` }} />
              <span className="text-[10px] text-muted-foreground mt-1">{d.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h4 className="text-[15px] font-bold mb-4">工時分佈（按類別）</h4>
          <div className="space-y-3">
            {categoryDistribution.map((cat, idx) => (
              <div key={cat.name} className="flex items-center gap-3">
                <div className={cn('w-3 h-3 rounded-sm shrink-0', colors[idx])} />
                <span className="text-[12px] w-[70px]">{cat.name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', colors[idx])} style={{ width: `${cat.pct}%` }} />
                </div>
                <span className="text-[11px] font-medium w-[50px] text-right">{cat.hours}h ({cat.pct}%)</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h4 className="text-[15px] font-bold mb-4">每位同事年度工時估算</h4>
          <p className="text-[12px] text-muted-foreground mb-4">假設每年 ≈1,900 實際工作小時</p>
          <div className="space-y-3">
            {[
              { name: '陳小華', ytdHours: 1680 },
              { name: '朴賢俊', ytdHours: 1760 },
              { name: '王志明', ytdHours: 1520 },
              { name: '戴維斯', ytdHours: 1440 },
              { name: '李芳', ytdHours: 1600 },
            ].map(({ name, ytdHours }) => {
              const pct = Math.round((ytdHours / 1900) * 100);
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-[12px] font-medium w-[60px]">{name}</span>
                  <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-teal-600' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-medium w-[80px] text-right">{ytdHours}/1,900h</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BudgetReport() {
  const projects = [
    { name: 'E-Commerce Redesign', budget: 45000, actual: 32400, status: 'on_track' },
    { name: 'Brand Launch Event', budget: 120000, actual: 96000, status: 'at_risk' },
    { name: 'Mobile App MVP', budget: 85000, actual: 74800, status: 'on_track' },
    { name: 'Wine Festival Campaign', budget: 95000, actual: 76000, status: 'at_risk' },
    { name: 'Corporate Video', budget: 55000, actual: 52000, status: 'completed' },
    { name: 'Green Living Rebrand', budget: 32000, actual: 19200, status: 'on_track' },
  ];

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalActual = projects.reduce((s, p) => s + p.actual, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總預算</span>
          <span className="text-[22px] font-bold block mt-1">${totalBudget.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">已花費</span>
          <span className="text-[22px] font-bold block mt-1">${totalActual.toLocaleString()}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">使用率</span>
          <span className={cn('text-[22px] font-bold block mt-1', (totalActual/totalBudget) > 0.8 ? 'text-amber-600' : 'text-teal-600')}>
            {Math.round((totalActual / totalBudget) * 100)}%
          </span>
        </div>
      </div>

      {/* Project budget bars */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
        <h4 className="text-[15px] font-bold mb-4">各項目預算對比</h4>
        <div className="space-y-4">
          {projects.map(p => {
            const pct = Math.round((p.actual / p.budget) * 100);
            const atRisk = pct >= 80;
            return (
              <div key={p.name} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium">{p.name}</span>
                  <span className={cn('text-[12px] font-medium', atRisk ? 'text-amber-600' : 'text-muted-foreground')}>
                    ${p.actual.toLocaleString()} / ${p.budget.toLocaleString()} ({pct}%)
                    {atRisk && ' ⚠️'}
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', atRisk ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Year Plan Report =====
function YearPlanReport() {
  const [filterCompany, setFilterCompany] = useState('all');

  const yearPlanData = [
    { company: 'BWDesign Centre', brand: 'BW', targetRevenue: 2000000, actualRevenue: 1450000, targetProjects: 20, actualProjects: 14, targetArticles: 120, actualArticles: 82, targetVideos: 48, actualVideos: 32, targetSocialPosts: 360, actualSocialPosts: 248 },
    { company: 'BWDesign Centre', brand: 'ChiFung', targetRevenue: 800000, actualRevenue: 620000, targetProjects: 8, actualProjects: 6, targetArticles: 60, actualArticles: 45, targetVideos: 24, actualVideos: 18, targetSocialPosts: 180, actualSocialPosts: 135 },
    { company: 'ACI Global', brand: 'ACI', targetRevenue: 1500000, actualRevenue: 980000, targetProjects: 15, actualProjects: 10, targetArticles: 80, actualArticles: 55, targetVideos: 36, actualVideos: 22, targetSocialPosts: 240, actualSocialPosts: 168 },
    { company: 'FCC Media', brand: 'FCC', targetRevenue: 1200000, actualRevenue: 950000, targetProjects: 12, actualProjects: 9, targetArticles: 72, actualArticles: 58, targetVideos: 30, actualVideos: 25, targetSocialPosts: 200, actualSocialPosts: 165 },
    { company: 'BSC Holdings', brand: 'BSC', targetRevenue: 600000, actualRevenue: 380000, targetProjects: 6, actualProjects: 4, targetArticles: 36, actualArticles: 20, targetVideos: 12, actualVideos: 8, targetSocialPosts: 120, actualSocialPosts: 75 },
  ];

  const companies = [...new Set(yearPlanData.map(d => d.company))];
  const filtered = filterCompany === 'all' ? yearPlanData : yearPlanData.filter(d => d.company === filterCompany);

  const totalTargetRevenue = filtered.reduce((s, d) => s + d.targetRevenue, 0);
  const totalActualRevenue = filtered.reduce((s, d) => s + d.actualRevenue, 0);
  const revenueProgress = Math.round((totalActualRevenue / totalTargetRevenue) * 100);

  const pctBar = (actual: number, target: number) => {
    const pct = Math.round((actual / target) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-teal-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-400')} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className="text-[11px] font-medium w-[40px] text-right">{pct}%</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter size={13} className="text-muted-foreground" />
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
          <option value="all">全部公司</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground flex items-center gap-1"><Target size={12} />目標營收</span>
          <span className="text-[22px] font-bold block mt-1">${(totalTargetRevenue / 10000).toFixed(0)}萬</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground flex items-center gap-1"><TrendingUp size={12} />實際營收</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">${(totalActualRevenue / 10000).toFixed(0)}萬</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <span className="text-[12px] font-medium text-muted-foreground">營收達成率</span>
          <span className={cn('text-[22px] font-bold block mt-1', revenueProgress >= 80 ? 'text-teal-600' : revenueProgress >= 50 ? 'text-amber-600' : 'text-rose-500')}>{revenueProgress}%</span>
          <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
            <div className={cn('h-full rounded-full', revenueProgress >= 80 ? 'bg-teal-600' : revenueProgress >= 50 ? 'bg-amber-500' : 'bg-rose-500')} style={{ width: `${Math.min(revenueProgress, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Per-Brand Details */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground px-4 py-3">公司 / 品牌</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground px-4 py-3">營收進度</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground px-4 py-3">項目</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground px-4 py-3">文章</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground px-4 py-3">影片</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground px-4 py-3">社媒帖文</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, idx) => (
              <tr key={idx} className="border-b border-border/50 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <span className="text-[13px] font-medium block">{d.brand}</span>
                  <span className="text-[11px] text-muted-foreground">{d.company}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-[12px] mb-1">${(d.actualRevenue / 10000).toFixed(0)}萬 / ${(d.targetRevenue / 10000).toFixed(0)}萬</div>
                  {pctBar(d.actualRevenue, d.targetRevenue)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-[12px] mb-1">{d.actualProjects}/{d.targetProjects}</div>
                  {pctBar(d.actualProjects, d.targetProjects)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-[12px] mb-1">{d.actualArticles}/{d.targetArticles}</div>
                  {pctBar(d.actualArticles, d.targetArticles)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-[12px] mb-1">{d.actualVideos}/{d.targetVideos}</div>
                  {pctBar(d.actualVideos, d.targetVideos)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-[12px] mb-1">{d.actualSocialPosts}/{d.targetSocialPosts}</div>
                  {pctBar(d.actualSocialPosts, d.targetSocialPosts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
