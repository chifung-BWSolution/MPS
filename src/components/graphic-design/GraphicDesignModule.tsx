import { useState, useMemo } from 'react';
import { Plus, Search, Image, Copy, Trash2, CheckSquare, Edit, Clock, X, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { websiteProfiles } from '@/data/websiteData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '草稿', color: 'text-slate-700', bg: 'bg-slate-100' },
  in_progress: { label: '製作中', color: 'text-amber-700', bg: 'bg-amber-100' },
  review: { label: '審核中', color: 'text-blue-700', bg: 'bg-blue-100' },
  approved: { label: '已批准', color: 'text-teal-700', bg: 'bg-teal-100' },
  published: { label: '已發佈', color: 'text-green-700', bg: 'bg-green-100' },
};

const designTypeLabels: Record<string, string> = {
  banner: '橫幅廣告',
  social_graphic: '社交媒體圖片',
  poster: '海報',
  brochure: '宣傳冊',
  logo: 'Logo 設計',
  infographic: '資訊圖表',
  other: '其他',
};

type Design = {
  id: string;
  title: string;
  websiteName: string;
  company: string;
  brand: string;
  designType: string;
  status: string;
  designer: string;
  createdDate: string;
  dimensions: string;
  platform: string;
  manHours: number;
  projectType: string;
  projectName: string;
  notes: string;
  reportDate: string;
  asanaLink: string;
  outputLink: string;
};

const mockDesigns: Design[] = [
  { id: '1', title: 'BW Wine 春季促銷橫幅', websiteName: 'BW Wine', company: '志豐企業', brand: 'BW Wine', designType: 'banner', status: 'published', designer: '李美玲', createdDate: '2024-11-01', dimensions: '1200x628', platform: 'Facebook', manHours: 3.5, projectType: 'client', projectName: 'BW Wine Q1 Campaign', notes: '', reportDate: '2024-11-01', asanaLink: '', outputLink: '' },
  { id: '2', title: 'ACI Events 年度活動海報', websiteName: 'ACI Events', company: '志豐企業', brand: 'ACI', designType: 'poster', status: 'approved', designer: '王小明', createdDate: '2024-11-05', dimensions: 'A3', platform: '印刷', manHours: 6, projectType: 'client', projectName: 'ACI Annual Event 2024', notes: '需要繁體中文版本', reportDate: '2024-11-05', asanaLink: '', outputLink: '' },
  { id: '3', title: 'BWDesign 服務介紹圖', websiteName: 'BWDesign', company: '志豐企業', brand: 'BWDesign', designType: 'infographic', status: 'in_progress', designer: '陳志強', createdDate: '2024-11-10', dimensions: '1080x1920', platform: 'Instagram', manHours: 4, projectType: 'internal', projectName: '品牌形象更新', notes: '', reportDate: '2024-11-10', asanaLink: '', outputLink: '' },
  { id: '4', title: 'FCC 公司 Logo 重新設計', websiteName: 'FCC Corp', company: 'FCC', brand: 'FCC', designType: 'logo', status: 'review', designer: '李美玲', createdDate: '2024-11-12', dimensions: 'SVG', platform: '多平台', manHours: 12, projectType: 'client', projectName: 'FCC Rebranding', notes: '第三版修改中', reportDate: '2024-11-12', asanaLink: '', outputLink: '' },
  { id: '5', title: 'BW Wine IG Story 範本', websiteName: 'BW Wine', company: '志豐企業', brand: 'BW Wine', designType: 'social_graphic', status: 'draft', designer: '王小明', createdDate: '2024-11-15', dimensions: '1080x1920', platform: 'Instagram', manHours: 2, projectType: 'none', projectName: '', notes: '', reportDate: '2024-11-15', asanaLink: '', outputLink: '' },
];

const emptyForm = () => ({
  title: '',
  websiteName: '',
  company: '',
  brand: '',
  designType: 'banner',
  status: 'draft',
  designer: '',
  dimensions: '',
  platform: '',
  manHours: 0,
  projectType: 'none',
  projectName: '',
  notes: '',
  reportDate: '',
  asanaLink: '',
  outputLink: '',
});

export function GraphicDesignModule() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [designs, setDesigns] = useState<Design[]>(mockDesigns);
  const [showModal, setShowModal] = useState(false);
  const [editingDesign, setEditingDesign] = useState<Design | null>(null);
  const [form, setForm] = useState(emptyForm());

  const totalHours = useMemo(() => designs.reduce((sum, d) => sum + (d.manHours || 0), 0), [designs]);

  const filtered = designs.filter(d => {
    const matchSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.websiteName.toLowerCase().includes(search.toLowerCase()) ||
      d.designer.toLowerCase().includes(search.toLowerCase()) ||
      (d.projectName || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === filtered.length && filtered.length > 0 ? [] : filtered.map(d => d.id));
  };

  const handleBatchDelete = () => {
    setDesigns(prev => prev.filter(d => !selectedIds.includes(d.id)));
    setSelectedIds([]);
  };

  function openAdd() {
    setEditingDesign(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(design: Design) {
    setEditingDesign(design);
    setForm({
      title: design.title,
      websiteName: design.websiteName,
      company: design.company,
      brand: design.brand,
      designType: design.designType,
      status: design.status,
      designer: design.designer,
      dimensions: design.dimensions,
      platform: design.platform,
      manHours: design.manHours,
      projectType: design.projectType,
      projectName: design.projectName,
      notes: design.notes,
      reportDate: design.reportDate || '',
      asanaLink: design.asanaLink || '',
      outputLink: design.outputLink || '',
    });
    setShowModal(true);
  }

  function saveDesign() {
    if (!form.title) return;
    if (editingDesign) {
      setDesigns(prev => prev.map(d => d.id === editingDesign.id ? { ...editingDesign, ...form } : d));
    } else {
      setDesigns(prev => [...prev, {
        id: `design_${Date.now()}`,
        createdDate: new Date().toISOString().split('T')[0],
        ...form,
      }]);
    }
    setShowModal(false);
  }

  function deleteDesign(id: string) {
    setDesigns(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">平面設計管理</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">管理所有平面設計項目，包括橫幅、海報、社交媒體圖片等</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBatchMode(!batchMode); setSelectedIds([]); }}
            className={cn(
              "px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200",
              batchMode ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            <CheckSquare size={13} className="inline mr-1" />
            {batchMode ? '取消批量' : '批量操作'}
          </button>
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
            <Plus size={13} /> 新增設計
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-7 gap-2">
        {Object.entries(statusConfig).map(([key, config]) => {
          const count = designs.filter(d => d.status === key).length;
          return (
            <div
              key={key}
              className={cn('bg-white border rounded-md p-3 text-center cursor-pointer transition-colors', filterStatus === key ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-300')}
              onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
            >
              <div className={cn('text-[18px] font-bold', config.color)}>{count}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{config.label}</div>
            </div>
          );
        })}
        <div className="bg-teal-50 border border-teal-200 rounded-md p-3 text-center col-span-2">
          <div className="flex items-center justify-center gap-1">
            <Clock size={13} className="text-teal-500" />
            <span className="text-[18px] font-bold text-teal-700">{totalHours}h</span>
          </div>
          <div className="text-[11px] text-teal-600 mt-0.5">總工時</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[300px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索設計標題、網站、設計師、項目..."
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
          />
        </div>
        {filterStatus !== 'all' && (
          <button onClick={() => setFilterStatus('all')} className="text-[11px] text-teal-600 hover:underline">清除篩選</button>
        )}
      </div>

      {/* Batch Actions */}
      {batchMode && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-2.5 bg-teal-50 border border-teal-200 rounded-md">
          <span className="text-[12px] font-medium text-teal-800">已選擇 {selectedIds.length} 項</span>
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-slate-200 rounded hover:bg-slate-50">
            <Copy size={11} /> 複製
          </button>
          <button onClick={handleBatchDelete} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white border border-red-200 rounded hover:bg-red-50 text-red-600">
            <Trash2 size={11} /> 刪除
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {batchMode && (
                <th className="px-3 py-2.5 text-left w-8">
                  <input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300" />
                </th>
              )}
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">標題</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">類型</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">關聯項目</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">設計師</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">工時</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">平台</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">狀態</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">日期</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(design => {
              const sConfig = statusConfig[design.status] || statusConfig.draft;
              return (
                <tr key={design.id} className="group border-b border-slate-100 hover:bg-slate-50/50 transition-colors duration-150">
                  {batchMode && (
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selectedIds.includes(design.id)} onChange={() => toggleSelect(design.id)} className="rounded border-slate-300" />
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    <div>{design.title}</div>
                    {design.websiteName && <div className="text-[11px] text-muted-foreground">{design.websiteName}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{designTypeLabels[design.designType] || design.designType}</td>
                  <td className="px-3 py-2.5">
                    {design.projectType !== 'none' ? (
                      <div>
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
                          design.projectType === 'client' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        )}>
                          {design.projectType === 'client' ? '客戶' : '內部'}
                        </span>
                        {design.projectName && <div className="text-[11px] text-muted-foreground mt-0.5">{design.projectName}</div>}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{design.designer || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Clock size={11} className="text-teal-500" />
                      <span className="font-medium text-teal-700">{design.manHours}h</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{design.platform || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', sConfig.bg, sConfig.color)}>
                      {sConfig.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{design.createdDate}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(design)}
                        className="p-1 rounded hover:bg-teal-50 text-muted-foreground hover:text-teal-600 transition-colors duration-150"
                        title="編輯"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        onClick={() => deleteDesign(design.id)}
                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors duration-150"
                        title="刪除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Image size={32} className="mb-2 opacity-40" />
            <p className="text-[13px]">沒有找到相關設計</p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-[560px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h3 className="text-[16px] font-bold">{editingDesign ? '編輯設計項目' : '新增平面設計'}</h3>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-6 py-4">
              {/* Title */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">標題 <span className="text-rose-500">*</span></label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-9 text-[13px]" placeholder="輸入設計標題" />
              </div>

              {/* Website */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬網站</label>
                <Select value={form.websiteName || '__none'} onValueChange={(val) => {
                  if (val === '__none') {
                    setForm(f => ({ ...f, websiteName: '', company: '', brand: '' }));
                  } else {
                    const ws = websiteProfiles.find(w => w.websiteName === val);
                    setForm(f => ({ ...f, websiteName: val, company: ws?.company || '', brand: ws?.brand || '' }));
                  }
                }}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站 (選填)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— 不關聯網站 —</SelectItem>
                    {websiteProfiles.map(w => <SelectItem key={w.id} value={w.websiteName}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Design Type + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">設計類型</label>
                  <Select value={form.designType} onValueChange={val => setForm(f => ({ ...f, designType: val }))}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(designTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
                  <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val }))}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Designer + Man Hours */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">設計師</label>
                  <Input value={form.designer} onChange={e => setForm(f => ({ ...f, designer: e.target.value }))} className="h-9 text-[13px]" placeholder="設計師姓名" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">
                    <Clock size={12} className="inline mr-1 text-teal-500" />工時 (小時)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.manHours}
                    onChange={e => setForm(f => ({ ...f, manHours: parseFloat(e.target.value) || 0 }))}
                    className="h-9 text-[13px]"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Dimensions + Platform */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">尺寸</label>
                  <Input value={form.dimensions} onChange={e => setForm(f => ({ ...f, dimensions: e.target.value }))} className="h-9 text-[13px]" placeholder="例: 1200x628" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">目標平台</label>
                  <Input value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="h-9 text-[13px]" placeholder="例: Facebook, Instagram" />
                </div>
              </div>

              {/* Project Association */}
              <div className="border border-border rounded-md p-3 space-y-3 bg-slate-50/60">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <FolderOpen size={13} className="text-teal-500" />
                  關聯項目
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目類型</label>
                  <Select value={form.projectType} onValueChange={val => setForm(f => ({ ...f, projectType: val, projectName: val === 'none' ? '' : f.projectName }))}>
                    <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">內部項目</SelectItem>
                      <SelectItem value="client">客戶項目</SelectItem>
                      <SelectItem value="none">無關聯項目</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.projectType !== 'none' && (
                  <div>
                    <label className="text-[12px] font-medium text-muted-foreground block mb-1">項目名稱</label>
                    <Input
                      value={form.projectName}
                      onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
                      className="h-9 text-[13px]"
                      placeholder={form.projectType === 'client' ? '輸入客戶項目名稱' : '輸入內部項目名稱'}
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="選填備註..."
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none bg-white"
                />
              </div>

              {/* Report Date */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">日報日期</label>
                <input
                  type="date"
                  value={form.reportDate}
                  onChange={e => setForm(f => ({ ...f, reportDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              {/* Asana + Output Links */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">Asana 連結</label>
                  <input
                    type="url"
                    value={form.asanaLink}
                    onChange={e => setForm(f => ({ ...f, asanaLink: e.target.value }))}
                    placeholder="https://app.asana.com/..."
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">成果連結 (Output Link)</label>
                  <input
                    type="url"
                    value={form.outputLink}
                    onChange={e => setForm(f => ({ ...f, outputLink: e.target.value }))}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-border rounded text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-3 border-t border-border shrink-0 bg-white">
              <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={saveDesign}
                disabled={!form.title}
              >
                {editingDesign ? '儲存更改' : '新增設計'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
