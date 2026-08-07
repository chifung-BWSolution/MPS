import { useState, useMemo } from 'react';
import { Plus, Calendar, ChevronLeft, ChevronRight, Edit2, Trash2, MapPin, Tag, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllVideos } from '@/data/marketingData';
import { websiteProfiles } from '@/data/websiteData';

const videoTypeLabels: Record<string, string> = {
  promo: '宣傳片',
  tutorial: '教學',
  testimonial: '客戶見證',
  event: '活動',
  social_clip: '社交短片',
};

const statusLabels: Record<string, string> = {
  planning: '規劃中',
  shooting: '拍攝中',
  post_production: '後製中',
  completed: '已完成',
  published: '已發佈',
};

const statusColors: Record<string, string> = {
  planning: 'bg-slate-100 text-slate-700',
  shooting: 'bg-blue-100 text-blue-700',
  post_production: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  published: 'bg-teal-100 text-teal-700',
};

const statusDotColors: Record<string, string> = {
  planning: 'bg-slate-400',
  shooting: 'bg-blue-400',
  post_production: 'bg-amber-400',
  completed: 'bg-emerald-400',
  published: 'bg-teal-500',
};

interface ScheduleItem {
  id: string;
  title: string;
  shootDate: string;
  publishDate?: string;
  websiteProfileId?: string;
  websiteName?: string;
  company?: string;
  brand?: string;
  status: string;
  videoType: string;
  location?: string;
  notes?: string;
  durationSeconds?: number;
  editingHours?: number;
}

interface TaskFormData {
  title: string;
  shootDate: string;
  publishDate: string;
  websiteProfileId: string;
  videoType: string;
  status: string;
  location: string;
  notes: string;
  durationSeconds: string;
  editingHours: string;
}

const defaultForm: TaskFormData = {
  title: '',
  shootDate: '',
  publishDate: '',
  websiteProfileId: '',
  videoType: 'promo',
  status: 'planning',
  location: '',
  notes: '',
  durationSeconds: '',
  editingHours: '',
};

interface TaskModalProps {
  item?: ScheduleItem | null;
  onClose: () => void;
  onSave: (data: TaskFormData, id?: string) => void;
}

function TaskModal({ item, onClose, onSave }: TaskModalProps) {
  const [form, setForm] = useState<TaskFormData>(
    item
      ? {
          title: item.title,
          shootDate: item.shootDate,
          publishDate: item.publishDate || '',
          websiteProfileId: item.websiteProfileId || '',
          videoType: item.videoType,
          status: item.status,
          location: item.location || '',
          notes: item.notes || '',
          durationSeconds: item.durationSeconds ? String(item.durationSeconds) : '',
          editingHours: item.editingHours ? String(item.editingHours) : '',
        }
      : defaultForm
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (field: keyof TaskFormData, val: string) => {
    setForm(f => ({ ...f, [field]: val }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  };

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = '請輸入影片標題';
    if (!form.shootDate) errs.shootDate = '請選擇拍攝日期';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form, item?.id);
  };

  const isEdit = !!item;

  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold">{isEdit ? '編輯拍攝任務' : '新增拍攝任務'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">影片標題 *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className={cn('w-full px-3 py-2 border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600', errors.title ? 'border-red-400' : 'border-border')}
              placeholder="輸入影片標題"
            />
            {errors.title && <p className="text-[11px] text-red-500 mt-1">{errors.title}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">拍攝日期 *</label>
              <input
                type="date"
                value={form.shootDate}
                onChange={e => set('shootDate', e.target.value)}
                className={cn('w-full px-3 py-2 border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600', errors.shootDate ? 'border-red-400' : 'border-border')}
              />
              {errors.shootDate && <p className="text-[11px] text-red-500 mt-1">{errors.shootDate}</p>}
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">預定發佈日期</label>
              <input
                type="date"
                value={form.publishDate}
                onChange={e => set('publishDate', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">關聯網站</label>
              <select
                value={form.websiteProfileId}
                onChange={e => set('websiteProfileId', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                <option value="">選擇網站...</option>
                {websiteProfiles.map(wp => (
                  <option key={wp.id} value={wp.id}>{wp.websiteName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">拍攝地點</label>
              <input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="例：公司攝影棚 / 戶外"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">影片類型</label>
              <select
                value={form.videoType}
                onChange={e => set('videoType', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                {Object.entries(videoTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">製作狀態</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              >
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">時長（秒）</label>
              <input
                type="number"
                value={form.durationSeconds}
                onChange={e => set('durationSeconds', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="60"
                min={0}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">剪輯工時（h）</label>
              <input
                type="number"
                value={form.editingHours}
                onChange={e => set('editingHours', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="4"
                min={0}
                step={0.5}
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
              <input
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                placeholder="其他備註"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/20">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors">取消</button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200"
          >
            {isEdit ? '儲存更改' : '新增任務'}
          </button>
        </div>
      </div>
    </div>
  );
}

type ViewMode = 'calendar' | 'list';

export function ShootingScheduleModule() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ScheduleItem | null>(null);
  const [extraItems, setExtraItems] = useState<ScheduleItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const allVideos = useMemo(() => getAllVideos(), []);

  const baseItems = useMemo<ScheduleItem[]>(() => {
    return allVideos
      .filter(v => v.shootDate && !deletedIds.has(v.id))
      .map(v => ({
        id: v.id,
        title: v.title,
        shootDate: v.shootDate!,
        publishDate: v.publishDate,
        websiteProfileId: v.websiteProfileId,
        websiteName: v.websiteName,
        company: v.company,
        brand: v.brand,
        status: v.status,
        videoType: v.videoType,
        durationSeconds: v.durationSeconds,
        editingHours: v.editingHours,
      }));
  }, [allVideos, deletedIds]);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    const editedIds = new Set(extraItems.map(e => e.id));
    const base = baseItems.filter(b => !editedIds.has(b.id));
    return [...base, ...extraItems.filter(e => !deletedIds.has(e.id))]
      .sort((a, b) => a.shootDate.localeCompare(b.shootDate));
  }, [baseItems, extraItems, deletedIds]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthLabel = `${year}年${month + 1}月`;

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return scheduleItems.filter(item => item.shootDate === dateStr);
  };

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const handleSave = (data: TaskFormData, id?: string) => {
    const wp = websiteProfiles.find(p => p.id === data.websiteProfileId);
    const newItem: ScheduleItem = {
      id: id || `s_${Date.now()}`,
      title: data.title,
      shootDate: data.shootDate,
      publishDate: data.publishDate || undefined,
      websiteProfileId: data.websiteProfileId || undefined,
      websiteName: wp?.websiteName,
      company: (wp as any)?.company,
      brand: (wp as any)?.brand,
      status: data.status,
      videoType: data.videoType,
      location: data.location || undefined,
      notes: data.notes || undefined,
      durationSeconds: data.durationSeconds ? Number(data.durationSeconds) : undefined,
      editingHours: data.editingHours ? Number(data.editingHours) : undefined,
    };
    setExtraItems(prev => {
      const filtered = prev.filter(e => e.id !== newItem.id);
      return [...filtered, newItem];
    });
    setShowModal(false);
    setEditItem(null);
  };

  const handleDelete = (id: string) => {
    setDeletedIds(prev => new Set([...prev, id]));
    setExtraItems(prev => prev.filter(e => e.id !== id));
  };

  const handleEdit = (item: ScheduleItem) => {
    setEditItem(item);
    setShowModal(true);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const upcoming = scheduleItems.filter(item => item.shootDate >= todayStr);
  const pastItems = scheduleItems.filter(item => item.shootDate < todayStr);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {viewMode === 'calendar' && (
            <>
              <button onClick={prevMonth} className="p-1.5 border border-border rounded hover:bg-muted transition-colors">
                <ChevronLeft size={14} />
              </button>
              <h3 className="text-[18px] font-bold min-w-[110px] text-center">{monthLabel}</h3>
              <button onClick={nextMonth} className="p-1.5 border border-border rounded hover:bg-muted transition-colors">
                <ChevronRight size={14} />
              </button>
            </>
          )}
          {viewMode === 'list' && (
            <h3 className="text-[18px] font-bold">所有拍攝任務</h3>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded overflow-hidden text-[12px]">
            <button
              onClick={() => setViewMode('calendar')}
              className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors', viewMode === 'calendar' ? 'bg-teal-600 text-white' : 'bg-white hover:bg-muted')}
            >
              <Calendar size={12} /> 日曆
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors', viewMode === 'list' ? 'bg-teal-600 text-white' : 'bg-white hover:bg-muted')}
            >
              ≡ 列表
            </button>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
          >
            <Plus size={12} /> 新增拍攝任務
          </button>
        </div>
      </div>

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/30 border-b border-border/50">
              {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                <div key={d} className="text-center py-2.5 text-[12px] font-semibold text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border/30 bg-muted/5" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const events = getEventsForDay(day);
                const isToday =
                  new Date().getFullYear() === year &&
                  new Date().getMonth() === month &&
                  new Date().getDate() === day;
                return (
                  <div
                    key={day}
                    className={cn('min-h-[100px] border-b border-r border-border/30 p-1.5', isToday && 'bg-teal-50/60')}
                  >
                    <div className="flex items-center mb-1">
                      <span className={cn('text-[11px] font-medium inline-flex w-6 h-6 items-center justify-center rounded-full', isToday ? 'bg-teal-600 text-white' : 'text-foreground')}>
                        {day}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map(ev => (
                        <button
                          key={ev.id}
                          onClick={() => handleEdit(ev)}
                          className={cn(
                            'w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate text-white font-medium hover:opacity-80 transition-opacity',
                            statusDotColors[ev.status] || 'bg-slate-400'
                          )}
                          title={ev.title}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {events.length > 3 && (
                        <span className="text-[9px] text-muted-foreground pl-1">+{events.length - 3} 更多</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(statusLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('w-2.5 h-2.5 rounded-full', statusDotColors[key])} />
                {label}
              </div>
            ))}
          </div>

          {/* Upcoming Shoots */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold">即將拍攝</h3>
              <span className="text-[12px] text-muted-foreground">{upcoming.length} 項</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-center text-[13px] text-muted-foreground py-6">沒有待拍攝的影片</p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 6).map(item => (
                  <ScheduleListRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-5">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
              <h4 className="text-[14px] font-bold">即將拍攝</h4>
              <span className="text-[12px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">{upcoming.length}</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-center text-[13px] text-muted-foreground py-8">沒有即將拍攝的任務</p>
            ) : (
              <div className="divide-y divide-border/40">
                {upcoming.map(item => (
                  <ScheduleListRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} expanded />
                ))}
              </div>
            )}
          </div>
          {pastItems.length > 0 && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50">
                <h4 className="text-[14px] font-bold text-muted-foreground">已過期任務</h4>
                <span className="text-[12px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">{pastItems.length}</span>
              </div>
              <div className="divide-y divide-border/40">
                {pastItems.map(item => (
                  <ScheduleListRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} expanded muted />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TaskModal
          item={editItem}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

interface RowProps {
  item: ScheduleItem;
  onEdit: (item: ScheduleItem) => void;
  onDelete: (id: string) => void;
  expanded?: boolean;
  muted?: boolean;
}

function ScheduleListRow({ item, onEdit, onDelete, expanded, muted }: RowProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors group', muted && 'opacity-60')}>
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', statusDotColors[item.status] || 'bg-slate-400')} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold truncate">{item.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Calendar size={10} /> {item.shootDate}
            </span>
            {item.websiteName && (
              <span className="text-[11px] text-teal-600 font-medium">{item.websiteName}</span>
            )}
            {item.company && (
              <span className="text-[11px] text-muted-foreground">{item.company}</span>
            )}
            {expanded && item.location && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <MapPin size={10} /> {item.location}
              </span>
            )}
            {expanded && item.videoType && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Tag size={10} /> {videoTypeLabels[item.videoType] || item.videoType}
              </span>
            )}
            {expanded && item.durationSeconds && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock size={10} /> {item.durationSeconds}s
              </span>
            )}
          </div>
          {expanded && item.notes && (
            <p className="text-[11px] text-muted-foreground mt-1 italic">{item.notes}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap', statusColors[item.status] || 'bg-slate-100 text-slate-700')}>
          {statusLabels[item.status] || item.status}
        </span>
        <button
          onClick={() => onEdit(item)}
          className="p-1 rounded text-muted-foreground hover:text-teal-600 hover:bg-teal-50 transition-colors opacity-0 group-hover:opacity-100"
          title="編輯"
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
          title="刪除"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
