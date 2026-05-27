import { useState } from 'react';
import { Users, AlertTriangle, Zap, Clock, ChevronRight, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  monthlyHours: number;
  targetHours: number;
  kpiAchievement: number;
  aiUsageRate: number;
  reportsSubmitted: number;
  reportsExpected: number;
  status: 'on_track' | 'insufficient_reports' | 'low_ai' | 'at_risk';
  alerts: string[];
}

const teamData: TeamMember[] = [
  { id: '1', name: '陳小華', role: '專案經理', monthlyHours: 172, targetHours: 176, kpiAchievement: 88, aiUsageRate: 62, reportsSubmitted: 20, reportsExpected: 22, status: 'on_track', alerts: [] },
  { id: '2', name: '朴賢俊', role: 'SEO 專員', monthlyHours: 168, targetHours: 176, kpiAchievement: 92, aiUsageRate: 91, reportsSubmitted: 22, reportsExpected: 22, status: 'on_track', alerts: [] },
  { id: '3', name: '戴維斯', role: '設計師', monthlyHours: 145, targetHours: 176, kpiAchievement: 72, aiUsageRate: 45, reportsSubmitted: 16, reportsExpected: 22, status: 'insufficient_reports', alerts: ['匯報不足', 'AI 使用率低'] },
  { id: '4', name: '李美玲', role: '文案專員', monthlyHours: 180, targetHours: 176, kpiAchievement: 95, aiUsageRate: 88, reportsSubmitted: 22, reportsExpected: 22, status: 'on_track', alerts: [] },
  { id: '5', name: '王志強', role: '影片剪輯', monthlyHours: 160, targetHours: 176, kpiAchievement: 65, aiUsageRate: 38, reportsSubmitted: 18, reportsExpected: 22, status: 'low_ai', alerts: ['AI 使用率低', '即將延誤'] },
  { id: '6', name: '黃嘉怡', role: '市場推廣', monthlyHours: 155, targetHours: 176, kpiAchievement: 80, aiUsageRate: 75, reportsSubmitted: 19, reportsExpected: 22, status: 'at_risk', alerts: ['即將延誤'] },
  { id: '7', name: '林德明', role: '設計師', monthlyHours: 170, targetHours: 176, kpiAchievement: 85, aiUsageRate: 70, reportsSubmitted: 21, reportsExpected: 22, status: 'on_track', alerts: [] },
  { id: '8', name: '鄭曉彤', role: '文案專員', monthlyHours: 176, targetHours: 176, kpiAchievement: 90, aiUsageRate: 82, reportsSubmitted: 22, reportsExpected: 22, status: 'on_track', alerts: [] },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  on_track: { label: '正常', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  insufficient_reports: { label: '匯報不足', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  low_ai: { label: 'AI使用率低', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  at_risk: { label: '有風險', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export function TeamReports() {
  const [quickFilter, setQuickFilter] = useState('all');

  const filteredData = quickFilter === 'all'
    ? teamData
    : quickFilter === 'insufficient'
      ? teamData.filter(m => m.alerts.includes('匯報不足'))
      : quickFilter === 'low_ai'
        ? teamData.filter(m => m.alerts.includes('AI 使用率低'))
        : teamData.filter(m => m.alerts.includes('即將延誤'));

  const avgKpi = Math.round(teamData.reduce((s, m) => s + m.kpiAchievement, 0) / teamData.length);
  const avgAi = Math.round(teamData.reduce((s, m) => s + m.aiUsageRate, 0) / teamData.length);
  const alertCount = teamData.filter(m => m.alerts.length > 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">團隊匯報</h1>
          <p className="text-sm text-muted-foreground mt-1">全團隊績效總覽與異常快速篩選</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-teal-600" />
              <div>
                <div className="text-2xl font-bold text-[#0d1a2d]">{teamData.length}</div>
                <div className="text-xs text-muted-foreground">團隊成員</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-[#0d1a2d]">{avgKpi}%</div>
                <div className="text-xs text-muted-foreground">平均 KPI 達成</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-amber-500" />
              <div>
                <div className="text-2xl font-bold text-[#0d1a2d]">{avgAi}%</div>
                <div className="text-xs text-muted-foreground">平均 AI 使用率</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-500" />
              <div>
                <div className="text-2xl font-bold text-rose-600">{alertCount}</div>
                <div className="text-xs text-muted-foreground">需注意人員</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Filters */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-2">快速篩選:</span>
        {[
          { key: 'all', label: '全部' },
          { key: 'insufficient', label: '匯報不足' },
          { key: 'low_ai', label: 'AI使用率低' },
          { key: 'at_risk', label: '即將延誤' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-200 ${
              quickFilter === f.key
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-muted-foreground border-border hover:border-teal-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Team Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[#f5f8fc]">
                  <th className="text-left p-3 font-medium text-muted-foreground">成員</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">職位</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">月工時</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">KPI 達成</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">AI 使用率</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">匯報率</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">狀態</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(member => {
                  const statusInfo = statusConfig[member.status];
                  const reportRate = Math.round((member.reportsSubmitted / member.reportsExpected) * 100);

                  return (
                    <tr key={member.id} className="border-b border-border hover:bg-[#f5f8fc]/50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-700">
                            {member.name.charAt(0)}
                          </div>
                          <span className="font-medium text-[#0d1a2d]">{member.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{member.role}</td>
                      <td className="p-3 text-center">
                        <span className={`font-medium ${member.monthlyHours < member.targetHours * 0.9 ? 'text-rose-600' : 'text-[#0d1a2d]'}`}>
                          {member.monthlyHours}h
                        </span>
                        <span className="text-muted-foreground text-xs">/{member.targetHours}h</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          <Progress value={member.kpiAchievement} className="w-16 h-2" />
                          <span className="text-xs font-medium">{member.kpiAchievement}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className={`text-[10px] ${
                          member.aiUsageRate >= 70 ? 'bg-teal-50 text-teal-700 border-teal-200' :
                          member.aiUsageRate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          <Zap size={10} className="mr-0.5" /> {member.aiUsageRate}%
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-medium ${reportRate < 80 ? 'text-rose-600' : 'text-[#0d1a2d]'}`}>
                          {member.reportsSubmitted}/{member.reportsExpected}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Button variant="ghost" size="sm" className="text-xs text-teal-600 hover:text-teal-700 p-1 h-auto">
                          查看詳情 <ChevronRight size={12} className="ml-0.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
