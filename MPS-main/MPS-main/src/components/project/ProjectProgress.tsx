import { useState } from 'react';
import { KanbanSquare, GanttChart as GanttIcon, Plus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectTask, ProjectPriority } from '@/types/app';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const priorityConfig: Record<ProjectPriority, { label: string; color: string }> = {
  low: { label: '低', color: 'bg-green-100 text-green-700' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  high: { label: '高', color: 'bg-amber-100 text-amber-700' },
  urgent: { label: '緊急', color: 'bg-rose-100 text-rose-700' },
};

const columnConfig = {
  todo: { label: '規劃中', color: 'border-slate-300', bgHeader: 'bg-slate-50' },
  in_progress: { label: '進行中', color: 'border-blue-400', bgHeader: 'bg-blue-50' },
  review: { label: '審核中', color: 'border-amber-400', bgHeader: 'bg-amber-50' },
  done: { label: '已完成', color: 'border-teal-400', bgHeader: 'bg-teal-50' },
};

type ColumnId = keyof typeof columnConfig;

export function ProjectProgress({ projectId, tasks: initialTasks }: { projectId?: string; tasks?: ProjectTask[] }) {
  const [view, setView] = useState<'kanban' | 'gantt'>('kanban');
  const [tasks, setTasks] = useState<ProjectTask[]>(initialTasks || defaultTasks);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', assignee: '', priority: 'medium' as ProjectPriority, startDate: '', endDate: '', estimatedHours: '' });

  const columns: Record<ColumnId, ProjectTask[]> = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done'),
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId as ProjectTask['status'];
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t));
  };

  const handleAddTask = () => {
    if (!newTask.title) return;
    const task: ProjectTask = {
      id: `t${Date.now()}`,
      projectId: projectId || '1',
      title: newTask.title,
      assignee: newTask.assignee,
      status: 'todo',
      priority: newTask.priority,
      startDate: newTask.startDate,
      endDate: newTask.endDate,
      estimatedHours: newTask.estimatedHours ? Number(newTask.estimatedHours) : undefined,
    };
    setTasks(prev => [...prev, task]);
    setNewTask({ title: '', assignee: '', priority: 'medium', startDate: '', endDate: '', estimatedHours: '' });
    setIsAddOpen(false);
  };

  // Detect overdue tasks
  const today = new Date().toISOString().split('T')[0];
  const overdueTasks = tasks.filter(t => t.endDate && t.endDate < today && t.status !== 'done');

  return (
    <div className="space-y-4">
      {/* Delayed Alert */}
      {overdueTasks.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-rose-600" />
            <span className="text-[13px] font-bold text-rose-700">延遲警示 — {overdueTasks.length} 個任務已超過預計結束日期</span>
          </div>
          <div className="space-y-1.5">
            {overdueTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between text-[12px] bg-white rounded px-3 py-2 border border-rose-100">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{task.title}</span>
                  <span className={cn('text-[9px] font-medium px-1 py-0.5 rounded', priorityConfig[task.priority].color)}>
                    {priorityConfig[task.priority].label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-rose-600">
                  <span className="text-[11px]">截止: {task.endDate}</span>
                  <span className="text-[11px] font-medium">({task.assignee})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Toggle + Add Task */}
      <div className="flex items-center justify-between">
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setView('kanban')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors', view === 'kanban' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted')}
          >
            <KanbanSquare size={14} />
            看板
          </button>
          <button
            onClick={() => setView('gantt')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors', view === 'gantt' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted')}
          >
            <GanttIcon size={14} />
            甘特圖
          </button>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5">
              <Plus size={14} />
              新增任務
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>新增任務</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-[13px]">任務名稱 *</Label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="輸入任務名稱"
                  className="text-[13px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">負責人</Label>
                  <Select value={newTask.assignee} onValueChange={(val) => setNewTask({ ...newTask, assignee: val })}>
                    <SelectTrigger className="text-[13px]">
                      <SelectValue placeholder="選擇" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="陳小華">陳小華</SelectItem>
                      <SelectItem value="戴維斯">戴維斯</SelectItem>
                      <SelectItem value="朴賢俊">朴賢俊</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">優先級</Label>
                  <Select value={newTask.priority} onValueChange={(val) => setNewTask({ ...newTask, priority: val as ProjectPriority })}>
                    <SelectTrigger className="text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(priorityConfig).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">開始日期</Label>
                  <Input type="date" value={newTask.startDate} onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })} className="text-[13px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">結束日期</Label>
                  <Input type="date" value={newTask.endDate} onChange={(e) => setNewTask({ ...newTask, endDate: e.target.value })} className="text-[13px]" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[13px]">預估工時 (h)</Label>
                <Input type="number" value={newTask.estimatedHours} onChange={(e) => setNewTask({ ...newTask, estimatedHours: e.target.value })} placeholder="8" className="text-[13px]" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>取消</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleAddTask} disabled={!newTask.title}>新增</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban View */}
      {view === 'kanban' && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(Object.entries(columnConfig) as [ColumnId, typeof columnConfig[ColumnId]][]).map(([colId, col]) => (
              <Droppable key={colId} droppableId={colId}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'rounded-md p-3 border-t-2 min-h-[300px] transition-colors',
                      col.color,
                      snapshot.isDraggingOver ? 'bg-muted/40' : 'bg-muted/20'
                    )}
                  >
                    <div className={cn('flex items-center justify-between mb-3 px-2 py-1.5 rounded', col.bgHeader)}>
                      <span className="text-[13px] font-bold">{col.label}</span>
                      <span className="text-[11px] bg-white px-1.5 py-0.5 rounded shadow-sm font-medium">
                        {columns[colId].length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {columns[colId].map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                'bg-white rounded border border-border/50 p-3 transition-shadow',
                                snapshot.isDragging ? 'shadow-lg ring-2 ring-teal-200' : 'hover:shadow-md cursor-grab'
                              )}
                            >
                              <span className="text-[13px] font-medium block mb-2">{task.title}</span>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-muted-foreground">{task.assignee}</span>
                                <span className={cn('text-[9px] font-medium px-1 py-0.5 rounded', priorityConfig[task.priority].color)}>
                                  {priorityConfig[task.priority].label}
                                </span>
                              </div>
                              {task.endDate && (
                                <span className="text-[10px] text-muted-foreground mt-1.5 block">
                                  截止: {task.endDate}
                                </span>
                              )}
                              {task.estimatedHours && (
                                <div className="flex items-center gap-1 mt-1.5">
                                  <span className="text-[10px] text-muted-foreground">
                                    {task.actualHours || 0}h / {task.estimatedHours}h
                                  </span>
                                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-teal-500 rounded-full"
                                      style={{ width: `${Math.min(((task.actualHours || 0) / task.estimatedHours) * 100, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}

      {/* Gantt View */}
      {view === 'gantt' && <GanttView tasks={tasks} />}
    </div>
  );
}

function GanttView({ tasks }: { tasks: ProjectTask[] }) {
  // Calculate date range
  const allDates = tasks.flatMap(t => [t.startDate, t.endDate].filter(Boolean) as string[]);
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => new Date(d).getTime()))) : new Date();
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => new Date(d).getTime()))) : new Date();

  // Add padding
  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 14);

  const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  // Generate month headers
  const months: { label: string; startOffset: number; width: number }[] = [];
  const tempDate = new Date(minDate);
  tempDate.setDate(1);
  while (tempDate <= maxDate) {
    const monthStart = Math.max(0, Math.ceil((tempDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
    const nextMonth = new Date(tempDate.getFullYear(), tempDate.getMonth() + 1, 1);
    const monthEnd = Math.min(totalDays, Math.ceil((nextMonth.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
    months.push({
      label: `${tempDate.getFullYear()}/${tempDate.getMonth() + 1}`,
      startOffset: (monthStart / totalDays) * 100,
      width: ((monthEnd - monthStart) / totalDays) * 100,
    });
    tempDate.setMonth(tempDate.getMonth() + 1);
  }

  const getTaskPosition = (task: ProjectTask) => {
    if (!task.startDate || !task.endDate) return { left: 0, width: 10 };
    const start = Math.ceil((new Date(task.startDate).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    const end = Math.ceil((new Date(task.endDate).getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      left: (start / totalDays) * 100,
      width: Math.max(((end - start) / totalDays) * 100, 2),
    };
  };

  const statusColors: Record<string, string> = {
    todo: 'bg-slate-400',
    in_progress: 'bg-blue-500',
    review: 'bg-amber-500',
    done: 'bg-teal-600',
  };

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 overflow-x-auto">
      <p className="text-[12px] text-muted-foreground mb-4">甘特圖時間軸 — 可視化項目任務排期。</p>

      {/* Month Headers */}
      <div className="relative h-6 mb-2 ml-[180px] border-b border-border/50">
        {months.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 h-full flex items-center text-[10px] font-medium text-muted-foreground border-l border-border/30 pl-1"
            style={{ left: `${m.startOffset}%`, width: `${m.width}%` }}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* Task Bars */}
      <div className="space-y-2">
        {tasks.map(task => {
          const pos = getTaskPosition(task);
          return (
            <div key={task.id} className="flex items-center h-8 group">
              <div className="w-[180px] flex-shrink-0 pr-3 flex items-center gap-2">
                <span className="text-[12px] font-medium truncate flex-1">{task.title}</span>
                <span className={cn('text-[8px] font-medium px-1 py-0.5 rounded', priorityConfig[task.priority].color)}>
                  {priorityConfig[task.priority].label}
                </span>
              </div>
              <div className="flex-1 h-full relative bg-muted/20 rounded">
                {/* Grid lines */}
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-border/10"
                    style={{ left: `${m.startOffset}%` }}
                  />
                ))}
                {/* Task bar */}
                <div
                  className={cn(
                    'absolute top-1 h-6 rounded cursor-grab opacity-90 hover:opacity-100 transition-opacity flex items-center px-2',
                    statusColors[task.status]
                  )}
                  style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                  title={`${task.title}: ${task.startDate} → ${task.endDate}`}
                >
                  <span className="text-[9px] text-white font-medium truncate">
                    {task.assignee}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">圖例:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-slate-400" />
          <span className="text-[10px] text-muted-foreground">規劃中</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-[10px] text-muted-foreground">進行中</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-500" />
          <span className="text-[10px] text-muted-foreground">審核中</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-teal-600" />
          <span className="text-[10px] text-muted-foreground">已完成</span>
        </div>
      </div>
    </div>
  );
}

// Default tasks if none provided
const defaultTasks: ProjectTask[] = [
  { id: 't1', projectId: '1', title: '首頁 Banner 設計', assignee: '陳小華', status: 'done', priority: 'high', startDate: '2024-10-01', endDate: '2024-10-15', estimatedHours: 12, actualHours: 10 },
  { id: 't2', projectId: '1', title: '產品頁面開發', assignee: '戴維斯', status: 'in_progress', priority: 'high', startDate: '2024-11-01', endDate: '2024-12-15', estimatedHours: 40, actualHours: 28 },
  { id: 't3', projectId: '1', title: '購物車流程優化', assignee: '陳小華', status: 'in_progress', priority: 'medium', startDate: '2024-11-15', endDate: '2025-01-05', estimatedHours: 30, actualHours: 12 },
  { id: 't4', projectId: '1', title: 'SEO Meta 優化', assignee: '朴賢俊', status: 'todo', priority: 'medium', startDate: '2024-12-15', endDate: '2025-01-10', estimatedHours: 8 },
  { id: 't5', projectId: '1', title: '後台管理系統升級', assignee: '戴維斯', status: 'todo', priority: 'high', startDate: '2025-01-01', endDate: '2025-01-15', estimatedHours: 24 },
  { id: 't6', projectId: '1', title: 'Logo 設計定稿', assignee: '陳小華', status: 'done', priority: 'high', startDate: '2024-10-01', endDate: '2024-10-20', estimatedHours: 16, actualHours: 14 },
  { id: 't7', projectId: '1', title: '內容撰寫', assignee: '朴賢俊', status: 'review', priority: 'medium', startDate: '2024-11-01', endDate: '2024-12-20', estimatedHours: 20, actualHours: 18 },
  { id: 't8', projectId: '1', title: '圖片拍攝', assignee: '戴維斯', status: 'done', priority: 'low', startDate: '2024-10-15', endDate: '2024-11-01', estimatedHours: 8, actualHours: 6 },
];
