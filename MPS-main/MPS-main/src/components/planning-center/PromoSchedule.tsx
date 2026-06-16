import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface PromoEvent {
  id: string;
  title: string;
  date: string;
  type: 'trending' | 'festival' | 'hk_promo' | 'client_event';
  platform?: string;
  status: 'planned' | 'in_progress' | 'completed';
}

const typeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  trending: { label: '時事話題', color: 'border-l-blue-500', bgColor: 'bg-blue-50' },
  festival: { label: '傳統節日', color: 'border-l-amber-500', bgColor: 'bg-amber-50' },
  hk_promo: { label: '香港優惠', color: 'border-l-green-500', bgColor: 'bg-green-50' },
  client_event: { label: '客人活動', color: 'border-l-purple-500', bgColor: 'bg-purple-50' },
};

const mockEvents: PromoEvent[] = [
  { id: '1', title: '農曆新年推廣系列', date: '2025-01-29', type: 'festival', status: 'in_progress' },
  { id: '2', title: 'AI 趨勢文章推送', date: '2025-01-20', type: 'trending', status: 'completed' },
  { id: '3', title: '情人節優惠活動', date: '2025-02-14', type: 'hk_promo', status: 'planned' },
  { id: '4', title: '客戶年度晚宴宣傳', date: '2025-02-08', type: 'client_event', status: 'planned' },
  { id: '5', title: '元宵節社交貼文', date: '2025-02-12', type: 'festival', status: 'planned' },
  { id: '6', title: '春季清倉促銷', date: '2025-03-01', type: 'hk_promo', status: 'planned' },
  { id: '7', title: 'ChatGPT 5 發佈熱點', date: '2025-01-22', type: 'trending', status: 'in_progress' },
  { id: '8', title: '客戶產品發佈會', date: '2025-01-25', type: 'client_event', status: 'in_progress' },
  { id: '9', title: '紅酒品鑑會推廣', date: '2025-02-20', type: 'client_event', status: 'planned' },
  { id: '10', title: '婦女節主題內容', date: '2025-03-08', type: 'festival', status: 'planned' },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function PromoSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 0, 1));
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'quarter'>('month');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [newEvent, setNewEvent] = useState({ title: '', date: '', type: 'trending' as string });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return mockEvents.filter(e => e.date === dateStr);
  };

  const thisMonthEvents = mockEvents.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const completedThisMonth = thisMonthEvents.filter(e => e.status === 'completed').length;
  const totalThisMonth = thisMonthEvents.length;

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setNewEvent({ ...newEvent, date: dateStr });
    setShowAddModal(true);
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleAddEvent = () => {
    setShowAddModal(false);
    setNewEvent({ title: '', date: '', type: 'trending' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0d1a2d]">推廣時間表</h1>
          <p className="text-sm text-muted-foreground mt-1">規劃各類推廣活動、節日行銷與客戶事件</p>
        </div>
        <Button onClick={() => { setNewEvent({ title: '', date: new Date().toISOString().split('T')[0], type: 'trending' }); setShowAddModal(true); }} className="bg-teal-600 hover:bg-teal-700">
          <Plus size={16} className="mr-1.5" /> 新增活動
        </Button>
      </div>

      {/* Quick Tabs + Progress */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white rounded-lg p-1 border border-border">
          {[
            { key: 'week', label: '本週' },
            { key: 'month', label: '本月' },
            { key: 'quarter', label: '本季' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                viewMode === tab.key ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">本月進度</span>
            <Progress value={totalThisMonth > 0 ? (completedThisMonth / totalThisMonth) * 100 : 0} className="w-24 h-2" />
            <span className="text-xs font-medium">{completedThisMonth}/{totalThisMonth}</span>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft size={14} /></Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="text-xs">今天</Button>
          <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight size={14} /></Button>
        </div>
        <h2 className="text-lg font-bold text-[#0d1a2d]">{year}年 {monthNames[month]}</h2>
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(typeConfig).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded-sm ${val.bgColor} border ${val.color}`} />
              {val.label}
            </span>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg border border-border overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
            <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground bg-[#f5f8fc]">{day}</div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} className="h-[100px] border-b border-r border-border bg-[#f5f8fc]/50" />
          ))}
          {/* Actual days */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const events = getEventsForDay(day);
            const today = new Date();
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

            return (
              <div
                key={day}
                onClick={() => handleDayClick(day)}
                className="h-[100px] border-b border-r border-border p-1 cursor-pointer hover:bg-teal-50/30 transition-colors group relative"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-600 text-white' : 'text-[#0d1a2d]'}`}>
                    {day}
                  </span>
                  <Plus size={12} className="text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {events.slice(0, 2).map(event => {
                    const config = typeConfig[event.type];
                    return (
                      <div key={event.id} className={`text-[10px] px-1 py-0.5 rounded border-l-2 ${config.color} ${config.bgColor} truncate`}>
                        {event.title}
                      </div>
                    );
                  })}
                  {events.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{events.length - 2} 更多</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Event Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增推廣活動</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>活動名稱</Label>
              <Input value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="輸入活動名稱" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>日期</Label>
                <Input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>類型</Label>
                <Select value={newEvent.type} onValueChange={v => setNewEvent({ ...newEvent, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trending">時事話題</SelectItem>
                    <SelectItem value="festival">傳統節日</SelectItem>
                    <SelectItem value="hk_promo">香港優惠</SelectItem>
                    <SelectItem value="client_event">客人活動</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAddEvent} className="bg-teal-600 hover:bg-teal-700">確認新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
