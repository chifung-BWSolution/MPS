import { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MonthlyTarget {
  month: string;
  salesTarget: number;
  salesActual: number;
  gpTarget: number;
  gpActual: number;
  projects: number;
  newClients: number;
}

interface ActionItem {
  id: string;
  type: 'warning' | 'suggestion';
  message: string;
  metric: string;
}

const monthlyData: MonthlyTarget[] = [
  { month: '2025-01', salesTarget: 500000, salesActual: 380000, gpTarget: 200000, gpActual: 165000, projects: 5, newClients: 2 },
  { month: '2025-02', salesTarget: 450000, salesActual: 0, gpTarget: 180000, gpActual: 0, projects: 0, newClients: 0 },
  { month: '2025-03', salesTarget: 550000, salesActual: 0, gpTarget: 220000, gpActual: 0, projects: 0, newClients: 0 },
];

const actionItems: ActionItem[] = [
  { id: '1', type: 'warning', message: '本月銷售達成率僅 76%，建議加強客戶跟進', metric: '銷售' },
  { id: '2', type: 'suggestion', message: '建議增加社交媒體廣告預算 $20,000', metric: '營銷' },
  { id: '3', type: 'warning', message: 'GP 率低於目標 5%，需控制外包成本', metric: 'GP' },
  { id: '4', type: 'suggestion', message: '可考慮推出季節性促銷方案吸引新客戶', metric: '業務' },
];

export function SalesGpTargets() {
  const [selectedMonth, setSelectedMonth] = useState('2025-01');

  const current = monthlyData.find(d => d.month === selectedMonth) || monthlyData[0];
  const salesPercentage = current.salesTarget > 0 ? Math.round((current.salesActual / current.salesTarget) * 100) : 0;
  const gpPercentage = current.gpTarget > 0 ? Math.round((current.gpActual / current.gpTarget) * 100) : 0;

  const annualSalesTarget = monthlyData.reduce((s, m) => s + m.salesTarget, 0);
  const annualSalesActual = monthlyData.reduce((s, m) => s + m.salesActual, 0);
  const annualGpTarget = monthlyData.reduce((s, m) => s + m.gpTarget, 0);
  const annualGpActual = monthlyData.reduce((s, m) => s + m.gpActual, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">銷售 & GP 目標</h1>
          <p className="text-sm text-muted-foreground mt-1">追蹤每月銷售達成率與毛利率目標</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2025-01">2025年1月</SelectItem>
            <SelectItem value="2025-02">2025年2月</SelectItem>
            <SelectItem value="2025-03">2025年3月</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main KPI - Two Big Circles */}
      <div className="grid grid-cols-2 gap-6">
        {/* Sales Achievement */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="relative inline-flex items-center justify-center w-40 h-40 mb-4">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                <circle
                  cx="80" cy="80" r="70" fill="none"
                  stroke={salesPercentage >= 80 ? '#0D9488' : salesPercentage >= 60 ? '#F59E0B' : '#F43F5E'}
                  strokeWidth="12"
                  strokeDasharray={`${(salesPercentage / 100) * 440} 440`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[#0d1a2d]">{salesPercentage}%</span>
                <span className="text-xs text-muted-foreground">達成率</span>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-[#0d1a2d] mb-2">銷售目標</h3>
            <div className="flex items-center justify-center gap-4 text-xs">
              <span className="text-muted-foreground">目標: <span className="font-medium text-[#0d1a2d]">${(current.salesTarget / 10000).toFixed(1)}萬</span></span>
              <span className="text-muted-foreground">實際: <span className="font-medium text-teal-600">${(current.salesActual / 10000).toFixed(1)}萬</span></span>
            </div>
            {salesPercentage < 80 && salesPercentage > 0 && (
              <Badge variant="outline" className="mt-3 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                <AlertTriangle size={10} className="mr-1" /> 未達 80% 警戒線
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* GP Achievement */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 text-center">
            <div className="relative inline-flex items-center justify-center w-40 h-40 mb-4">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                <circle
                  cx="80" cy="80" r="70" fill="none"
                  stroke={gpPercentage >= 80 ? '#0D9488' : gpPercentage >= 60 ? '#F59E0B' : '#F43F5E'}
                  strokeWidth="12"
                  strokeDasharray={`${(gpPercentage / 100) * 440} 440`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-[#0d1a2d]">{gpPercentage}%</span>
                <span className="text-xs text-muted-foreground">達成率</span>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-[#0d1a2d] mb-2">GP 毛利目標</h3>
            <div className="flex items-center justify-center gap-4 text-xs">
              <span className="text-muted-foreground">目標: <span className="font-medium text-[#0d1a2d]">${(current.gpTarget / 10000).toFixed(1)}萬</span></span>
              <span className="text-muted-foreground">實際: <span className="font-medium text-teal-600">${(current.gpActual / 10000).toFixed(1)}萬</span></span>
            </div>
            {gpPercentage < 80 && gpPercentage > 0 && (
              <Badge variant="outline" className="mt-3 bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                <AlertTriangle size={10} className="mr-1" /> GP 率偏低
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Progress Bar */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">各月銷售進度</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {monthlyData.map(m => {
            const pct = m.salesTarget > 0 && m.salesActual > 0 ? Math.round((m.salesActual / m.salesTarget) * 100) : 0;
            return (
              <div key={m.month} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#0d1a2d]">{m.month}</span>
                  <span className="text-muted-foreground">${(m.salesActual / 10000).toFixed(0)}萬 / ${(m.salesTarget / 10000).toFixed(0)}萬</span>
                </div>
                <Progress value={pct} className="h-2.5" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Action Items */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> 建議行動
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {actionItems.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-md border ${
                item.type === 'warning' ? 'border-rose-200 bg-rose-50' : 'border-blue-200 bg-blue-50'
              }`}
            >
              {item.type === 'warning' ? (
                <TrendingDown size={16} className="text-rose-500 shrink-0 mt-0.5" />
              ) : (
                <TrendingUp size={16} className="text-blue-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-xs text-[#0d1a2d]">{item.message}</p>
                <Badge variant="outline" className="mt-1 text-[9px]">{item.metric}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
