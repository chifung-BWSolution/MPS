import { useState } from 'react';
import { Plus, Calendar, User, Clock, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';

interface Plan {
  id: string;
  name: string;
  owner: string;
  estimatedHours: number;
  progress: number;
  status: 'planning' | 'in_progress' | 'completed' | 'delayed';
  period: 'annual' | 'quarterly' | 'monthly';
  quarter?: string;
  description: string;
  startDate: string;
  endDate: string;
}

const mockPlans: Plan[] = [
  { id: '1', name: '品牌官網全面改版', owner: '陳小華', estimatedHours: 320, progress: 65, status: 'in_progress', period: 'annual', description: '將 BW 官方網站進行全面重新設計與開發', startDate: '2025-01-01', endDate: '2025-06-30' },
  { id: '2', name: 'SEO 排名提升計劃', owner: '朴賢俊', estimatedHours: 180, progress: 40, status: 'in_progress', period: 'quarterly', quarter: 'Q1', description: '提升核心關鍵字排名至前10', startDate: '2025-01-01', endDate: '2025-03-31' },
  { id: '3', name: '影片內容產出倍增計劃', owner: '戴維斯', estimatedHours: 240, progress: 20, status: 'planning', period: 'quarterly', quarter: 'Q1', description: '每月產出影片從4部提升至8部', startDate: '2025-01-15', endDate: '2025-04-15' },
  { id: '4', name: 'AI 工具導入與培訓', owner: '張偉明', estimatedHours: 80, progress: 90, status: 'in_progress', period: 'monthly', description: '團隊全員完成 AI 工具培訓', startDate: '2025-01-01', endDate: '2025-01-31' },
  { id: '5', name: '社交媒體矩陣建設', owner: '李美玲', estimatedHours: 160, progress: 55, status: 'in_progress', period: 'quarterly', quarter: 'Q1', description: '建立5個平台的內容矩陣', startDate: '2025-01-01', endDate: '2025-03-31' },
  { id: '6', name: '新客戶開發計劃', owner: '戴維斯', estimatedHours: 200, progress: 0, status: 'delayed', period: 'annual', description: '年度新增客戶10個', startDate: '2025-01-01', endDate: '2025-12-31' },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  planning: { label: '規劃中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: '進行中', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  completed: { label: '已完成', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  delayed: { label: '延誤', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export function InternalPlans() {
  const [activeTab, setActiveTab] = useState<'annual' | 'quarterly' | 'monthly'>('annual');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', owner: '', estimatedHours: '', description: '', startDate: '', endDate: '' });

  const filteredPlans = activeTab === 'annual'
    ? mockPlans
    : mockPlans.filter(p => p.period === activeTab);

  const handleAddPlan = () => {
    setShowAddModal(false);
    setNewPlan({ name: '', owner: '', estimatedHours: '', description: '', startDate: '', endDate: '' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">內部發展計劃</h1>
          <p className="text-sm text-muted-foreground mt-1">管理公司內部長期發展計劃與目標追蹤</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus size={16} className="mr-1.5" /> 新增計劃
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 border border-border w-fit">
        {[
          { key: 'annual', label: '年度計劃' },
          { key: 'quarterly', label: '季度計劃' },
          { key: 'monthly', label: '每月計劃' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key ? 'bg-teal-600 text-white shadow-sm' : 'text-muted-foreground hover:text-[#0d1a2d] hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-[#0d1a2d]">{filteredPlans.length}</div>
            <div className="text-xs text-muted-foreground mt-1">總計劃數</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-teal-600">{filteredPlans.filter(p => p.status === 'in_progress').length}</div>
            <div className="text-xs text-muted-foreground mt-1">進行中</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{filteredPlans.filter(p => p.status === 'delayed').length}</div>
            <div className="text-xs text-muted-foreground mt-1">延誤中</div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-slate-600">
              {Math.round(filteredPlans.reduce((s, p) => s + p.progress, 0) / filteredPlans.length)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">平均進度</div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredPlans.map(plan => {
          const statusInfo = statusConfig[plan.status];
          return (
            <Card key={plan.id} className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#0d1a2d] group-hover:text-teal-700 transition-colors">{plan.name}</h3>
                  <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{plan.description}</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">進度</span>
                    <span className="font-medium text-[#0d1a2d]">{plan.progress}%</span>
                  </div>
                  <Progress value={plan.progress} className="h-2" />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><User size={12} /> {plan.owner}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {plan.estimatedHours}h</span>
                    <span className="flex items-center gap-1"><Calendar size={12} /> {plan.endDate}</span>
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <Button variant="ghost" size="sm" className="text-xs text-teal-600 hover:text-teal-700 p-0 h-auto">
                    查看詳情 <ChevronRight size={14} className="ml-0.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Plan Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增發展計劃</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>計劃名稱</Label>
              <Input value={newPlan.name} onChange={e => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="輸入計劃名稱" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>負責人</Label>
                <Select value={newPlan.owner} onValueChange={v => setNewPlan({ ...newPlan, owner: v })}>
                  <SelectTrigger><SelectValue placeholder="選擇負責人" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="陳小華">陳小華</SelectItem>
                    <SelectItem value="朴賢俊">朴賢俊</SelectItem>
                    <SelectItem value="戴維斯">戴維斯</SelectItem>
                    <SelectItem value="張偉明">張偉明</SelectItem>
                    <SelectItem value="李美玲">李美玲</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>預計工時</Label>
                <Input type="number" value={newPlan.estimatedHours} onChange={e => setNewPlan({ ...newPlan, estimatedHours: e.target.value })} placeholder="小時" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>開始日期</Label>
                <Input type="date" value={newPlan.startDate} onChange={e => setNewPlan({ ...newPlan, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>結束日期</Label>
                <Input type="date" value={newPlan.endDate} onChange={e => setNewPlan({ ...newPlan, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={newPlan.description} onChange={e => setNewPlan({ ...newPlan, description: e.target.value })} placeholder="計劃描述" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAddPlan} className="bg-teal-600 hover:bg-teal-700">確認新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
