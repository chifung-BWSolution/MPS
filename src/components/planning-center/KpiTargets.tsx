import { useState } from 'react';
import { Plus, Target, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KpiTarget {
  id: string;
  name: string;
  category: string;
  target: number;
  current: number;
  unit: string;
  owner: string;
  period: string;
  deadline: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved';
}

const mockKpis: KpiTarget[] = [
  { id: '1', name: '月度營收目標', category: '銷售', target: 500000, current: 380000, unit: 'HKD', owner: '張偉明', period: 'monthly', deadline: '2025-01-31', status: 'on_track' },
  { id: '2', name: '新客戶數量', category: '業務發展', target: 5, current: 3, unit: '個', owner: '戴維斯', period: 'monthly', deadline: '2025-01-31', status: 'on_track' },
  { id: '3', name: '文章產出量', category: '內容', target: 24, current: 18, unit: '篇', owner: '李美玲', period: 'monthly', deadline: '2025-01-31', status: 'on_track' },
  { id: '4', name: '影片完成數', category: '影片', target: 12, current: 6, unit: '條', owner: '戴維斯', period: 'monthly', deadline: '2025-01-31', status: 'at_risk' },
  { id: '5', name: 'SEO 關鍵字排名前10', category: 'SEO', target: 30, current: 22, unit: '個', owner: '朴賢俊', period: 'quarterly', deadline: '2025-03-31', status: 'on_track' },
  { id: '6', name: '客戶滿意度評分', category: '服務品質', target: 4.5, current: 4.2, unit: '分', owner: '陳小華', period: 'quarterly', deadline: '2025-03-31', status: 'at_risk' },
  { id: '7', name: '社交媒體粉絲增長', category: '社交媒體', target: 5000, current: 3200, unit: '人', owner: '李美玲', period: 'quarterly', deadline: '2025-03-31', status: 'on_track' },
  { id: '8', name: '年度總營收', category: '銷售', target: 6000000, current: 850000, unit: 'HKD', owner: '張偉明', period: 'annual', deadline: '2025-12-31', status: 'on_track' },
  { id: '9', name: '團隊 AI 使用率', category: 'AI 效率', target: 80, current: 45, unit: '%', owner: '張偉明', period: 'biweekly', deadline: '2025-01-31', status: 'behind' },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  on_track: { label: '進度正常', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  at_risk: { label: '有風險', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  behind: { label: '落後', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  achieved: { label: '已達標', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const periodLabels: Record<string, string> = {
  biweekly: '每兩週',
  monthly: '每月',
  quarterly: '季度',
  half_year: '半年',
  annual: '年度',
};

export function KpiTargets() {
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKpi, setNewKpi] = useState({ name: '', category: '', target: '', unit: '', owner: '', deadline: '' });

  const filteredKpis = selectedPeriod === 'all'
    ? mockKpis
    : mockKpis.filter(k => k.period === selectedPeriod);

  const handleAddKpi = () => {
    setShowAddModal(false);
    setNewKpi({ name: '', category: '', target: '', unit: '', owner: '', deadline: '' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">KPI 目標設定</h1>
          <p className="text-sm text-muted-foreground mt-1">設定與追蹤各層級 KPI 指標</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus size={16} className="mr-1.5" /> 新增目標
        </Button>
      </div>

      {/* Period Selector */}
      <div className="flex gap-1 bg-white rounded-lg p-1 border border-border w-fit">
        {[
          { key: 'biweekly', label: '每兩週' },
          { key: 'monthly', label: '每月' },
          { key: 'quarterly', label: '季度' },
          { key: 'half_year', label: '半年' },
          { key: 'annual', label: '年度' },
          { key: 'all', label: '全部' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedPeriod(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              selectedPeriod === tab.key ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredKpis.map(kpi => {
          const percentage = Math.round((kpi.current / kpi.target) * 100);
          const statusInfo = statusConfig[kpi.status];

          return (
            <Card key={kpi.id} className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{kpi.category}</Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusInfo.color}`}>{statusInfo.label}</Badge>
                    </div>
                    <h3 className="text-sm font-semibold text-[#0d1a2d]">{kpi.name}</h3>
                  </div>
                  <Target size={18} className="text-teal-600 shrink-0" />
                </div>

                {/* Progress */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold text-[#0d1a2d]">
                      {kpi.current.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">{kpi.unit}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">目標: {kpi.target.toLocaleString()} {kpi.unit}</span>
                  </div>
                  <Progress value={Math.min(percentage, 100)} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp size={12} />
                      {percentage}% 達成率
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {kpi.deadline}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
                  <span className="text-muted-foreground">負責人: {kpi.owner}</span>
                  <span className="text-muted-foreground">{periodLabels[kpi.period] || kpi.period}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add KPI Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增 KPI 目標</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>目標名稱</Label>
              <Input value={newKpi.name} onChange={e => setNewKpi({ ...newKpi, name: e.target.value })} placeholder="輸入 KPI 名稱" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>分類</Label>
                <Input value={newKpi.category} onChange={e => setNewKpi({ ...newKpi, category: e.target.value })} placeholder="例: 銷售、內容" />
              </div>
              <div className="space-y-2">
                <Label>負責人</Label>
                <Select value={newKpi.owner} onValueChange={v => setNewKpi({ ...newKpi, owner: v })}>
                  <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="張偉明">張偉明</SelectItem>
                    <SelectItem value="陳小華">陳小華</SelectItem>
                    <SelectItem value="朴賢俊">朴賢俊</SelectItem>
                    <SelectItem value="戴維斯">戴維斯</SelectItem>
                    <SelectItem value="李美玲">李美玲</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>目標數值</Label>
                <Input type="number" value={newKpi.target} onChange={e => setNewKpi({ ...newKpi, target: e.target.value })} placeholder="數值" />
              </div>
              <div className="space-y-2">
                <Label>單位</Label>
                <Input value={newKpi.unit} onChange={e => setNewKpi({ ...newKpi, unit: e.target.value })} placeholder="例: 個、篇" />
              </div>
              <div className="space-y-2">
                <Label>截止日期</Label>
                <Input type="date" value={newKpi.deadline} onChange={e => setNewKpi({ ...newKpi, deadline: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAddKpi} className="bg-teal-600 hover:bg-teal-700">確認新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
