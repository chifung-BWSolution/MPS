import { useState } from 'react';
import { Zap, TrendingUp, ArrowUp, Users, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RoleEfficiency {
  role: string;
  aiUsageRate: number;
  efficiencyMultiplier: number;
  hoursWithAi: number;
  hoursWithoutAi: number;
  topTools: string[];
}

interface AiTool {
  name: string;
  category: string;
  usageCount: number;
  avgTimeSaved: number;
}

const roleData: RoleEfficiency[] = [
  { role: '文案 / Copywriter', aiUsageRate: 85, efficiencyMultiplier: 2.1, hoursWithAi: 120, hoursWithoutAi: 252, topTools: ['ChatGPT', 'Claude', 'Grammarly'] },
  { role: '設計師 / Designer', aiUsageRate: 72, efficiencyMultiplier: 1.8, hoursWithAi: 160, hoursWithoutAi: 288, topTools: ['Midjourney', 'Figma AI', 'Remove.bg'] },
  { role: '影片剪輯 / Video Editor', aiUsageRate: 55, efficiencyMultiplier: 1.5, hoursWithAi: 200, hoursWithoutAi: 300, topTools: ['CapCut AI', 'Runway', 'Descript'] },
  { role: 'SEO 專員 / SEO Specialist', aiUsageRate: 90, efficiencyMultiplier: 2.5, hoursWithAi: 60, hoursWithoutAi: 150, topTools: ['ChatGPT', 'Semrush AI', 'SurferSEO'] },
  { role: '專案經理 / PM', aiUsageRate: 60, efficiencyMultiplier: 1.6, hoursWithAi: 80, hoursWithoutAi: 128, topTools: ['ChatGPT', 'Notion AI', 'Otter.ai'] },
  { role: '市場推廣 / Marketing', aiUsageRate: 78, efficiencyMultiplier: 1.9, hoursWithAi: 100, hoursWithoutAi: 190, topTools: ['ChatGPT', 'Canva AI', 'Hootsuite'] },
];

const toolRankings: AiTool[] = [
  { name: 'ChatGPT / GPT-4', category: '通用 AI', usageCount: 856, avgTimeSaved: 2.3 },
  { name: 'Claude 3.5', category: '通用 AI', usageCount: 423, avgTimeSaved: 2.1 },
  { name: 'Midjourney v6', category: '圖片生成', usageCount: 312, avgTimeSaved: 3.5 },
  { name: 'Canva AI', category: '設計', usageCount: 289, avgTimeSaved: 1.8 },
  { name: 'CapCut AI', category: '影片', usageCount: 156, avgTimeSaved: 2.8 },
  { name: 'Semrush AI', category: 'SEO', usageCount: 134, avgTimeSaved: 3.2 },
  { name: 'Figma AI', category: '設計', usageCount: 98, avgTimeSaved: 1.5 },
  { name: 'Notion AI', category: '生產力', usageCount: 87, avgTimeSaved: 1.4 },
];

export function AiEfficiency() {
  const [filterDept, setFilterDept] = useState('all');

  const overallUsage = Math.round(roleData.reduce((s, r) => s + r.aiUsageRate, 0) / roleData.length);
  const overallMultiplier = (roleData.reduce((s, r) => s + r.efficiencyMultiplier, 0) / roleData.length).toFixed(1);
  const totalHoursSaved = roleData.reduce((s, r) => s + (r.hoursWithoutAi - r.hoursWithAi), 0);

  const filteredRoles = filterDept === 'all' ? roleData : roleData.filter(r => r.role.includes(filterDept));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">AI 效率對比</h1>
          <p className="text-sm text-muted-foreground mt-1">分析各部門 AI 工具使用率與效率提升數據</p>
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="篩選部門" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部部門</SelectItem>
            <SelectItem value="文案">文案</SelectItem>
            <SelectItem value="設計">設計</SelectItem>
            <SelectItem value="影片">影片剪輯</SelectItem>
            <SelectItem value="SEO">SEO</SelectItem>
            <SelectItem value="專案">專案管理</SelectItem>
            <SelectItem value="市場">市場推廣</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-teal-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Zap size={22} className="text-amber-500" />
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                <ArrowUp size={10} className="mr-0.5" /> +12%
              </Badge>
            </div>
            <div className="text-3xl font-bold text-[#0d1a2d]">{overallUsage}%</div>
            <div className="text-xs text-muted-foreground mt-1">整體 AI 使用率</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp size={22} className="text-teal-600" />
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                <ArrowUp size={10} className="mr-0.5" /> +0.3x
              </Badge>
            </div>
            <div className="text-3xl font-bold text-[#0d1a2d]">{overallMultiplier}x</div>
            <div className="text-xs text-muted-foreground mt-1">平均效率提升倍數</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Users size={22} className="text-blue-600" />
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                本月
              </Badge>
            </div>
            <div className="text-3xl font-bold text-[#0d1a2d]">{totalHoursSaved}h</div>
            <div className="text-xs text-muted-foreground mt-1">AI 節省總工時</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Role Efficiency Chart (left 3 cols) */}
        <Card className="col-span-3 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">各職位 AI 效率提升倍數</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredRoles.map(role => (
              <div key={role.role} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#0d1a2d]">{role.role}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">使用率 {role.aiUsageRate}%</span>
                    <Badge className="bg-amber-100 text-amber-800 border-0 font-bold">
                      {role.efficiencyMultiplier}x
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(role.hoursWithAi / role.hoursWithoutAi) * 100}%` }}
                    >
                      <span className="text-[10px] text-white font-medium">{role.hoursWithAi}h</span>
                    </div>
                    <div className="absolute top-0 right-2 h-full flex items-center">
                      <span className="text-[10px] text-slate-500">{role.hoursWithoutAi}h (無AI)</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {role.topTools.map(tool => (
                    <Badge key={tool} variant="outline" className="text-[9px] px-1.5 py-0">{tool}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Tool Rankings (right 2 cols) */}
        <Card className="col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 size={16} className="text-teal-600" /> 最常用 AI 工具排行
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {toolRankings.map((tool, idx) => (
              <div key={tool.name} className="flex items-center gap-3 p-2 rounded-md hover:bg-[#f5f8fc] transition-colors">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  idx < 3 ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#0d1a2d] truncate">{tool.name}</div>
                  <div className="text-[10px] text-muted-foreground">{tool.category}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium">{tool.usageCount} 次</div>
                  <div className="text-[10px] text-amber-600">節省 {tool.avgTimeSaved}h/次</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
