import { useState } from 'react';
import { Search, Plus, Phone, Mail, MessageCircle, MapPin, Building2, ChevronDown, ChevronUp, X, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Client {
  id: string;
  companyNameZh: string;
  companyNameEn: string;
  brand: string;
  brandName: string;
  industry: string;
  contactPerson: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  inquiryDate: string;
  status: 'active' | 'inactive' | 'prospect';
  notes?: string;
  projects: { name: string; status: string; budget: number }[];
}

const statusConfig = {
  active: { label: '合作中', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  inactive: { label: '已停止', color: 'text-slate-700', bgColor: 'bg-slate-50' },
  prospect: { label: '潛在客戶', color: 'text-amber-700', bgColor: 'bg-amber-50' },
};

const initialClients: Client[] = [
  { id: '1', companyNameZh: '新創科技有限公司', companyNameEn: 'TechStart Inc', brand: 'BW', brandName: 'BW Design', industry: '科技', contactPerson: 'David Chen', phone: '+852 9123 4567', whatsapp: '85291234567', email: 'david@techstart.com', address: '香港灣仔駱克道123號', inquiryDate: '2024-06-15', status: 'active', projects: [{ name: '企業官網改版', status: 'active', budget: 85000 }, { name: 'APP 開發', status: 'completed', budget: 120000 }] },
  { id: '2', companyNameZh: '美酒莊園', companyNameEn: 'Bella Wines', brand: 'ACI', brandName: 'ACI Global', industry: '餐飲酒業', contactPerson: 'Maria Santos', phone: '+852 8234 5678', whatsapp: '85282345678', email: 'maria@bellawines.com', address: '香港中環荷李活道45號', inquiryDate: '2024-03-20', status: 'active', projects: [{ name: '酒莊品牌網站', status: 'active', budget: 65000 }, { name: '年度行銷活動', status: 'active', budget: 120000 }] },
  { id: '3', companyNameZh: '綠色生活集團', companyNameEn: 'Green Living', brand: 'FCC', brandName: 'FCC Media', industry: '環保', contactPerson: 'James Wilson', phone: '+852 9345 6789', whatsapp: '85293456789', email: 'james@greenliving.sg', address: '香港尖沙咀廣東道88號', inquiryDate: '2024-08-10', status: 'active', projects: [{ name: '品牌重塑', status: 'active', budget: 32000 }] },
  { id: '4', companyNameZh: '運動達人', companyNameEn: 'SportMax', brand: 'BSC', brandName: 'BSC Tech', industry: '體育', contactPerson: 'Lisa Park', phone: '+852 8456 7890', whatsapp: '85284567890', email: 'lisa@sportmax.com', address: '香港旺角彌敦道200號', inquiryDate: '2024-11-01', status: 'prospect', projects: [] },
  { id: '5', companyNameZh: '食工坊', companyNameEn: 'FoodCraft', brand: 'BW', brandName: 'BW Design', industry: '餐飲', contactPerson: 'Robert Tan', phone: '+852 9567 8901', whatsapp: '85295678901', email: 'robert@foodcraft.sg', address: '香港銅鑼灣謝斐道55號', inquiryDate: '2024-01-15', status: 'active', projects: [{ name: '電商平台', status: 'completed', budget: 95000 }] },
  { id: '6', companyNameZh: '設計中心', companyNameEn: 'DesignHub', brand: 'ACI', brandName: 'ACI Global', industry: '設計', contactPerson: 'Anna Li', phone: '+852 8678 9012', whatsapp: '85286789012', email: 'anna@designhub.co', address: '香港觀塘鴻圖道22號', inquiryDate: '2024-09-05', status: 'inactive', projects: [{ name: '形象影片', status: 'completed', budget: 55000 }] },
];

const industryOptions = ['科技', '餐飲酒業', '環保', '體育', '餐飲', '設計', '教育', '金融', '醫療', '零售', '物流', '製造', '其他'];
const brandOptions = [
  { id: 'BW', name: 'BW Design' },
  { id: 'ACI', name: 'ACI Global' },
  { id: 'FCC', name: 'FCC Media' },
  { id: 'BSC', name: 'BSC Tech' },
];

const emptyClient: Omit<Client, 'id' | 'projects'> = {
  companyNameZh: '', companyNameEn: '', brand: 'BW', brandName: 'BW Design',
  industry: '科技', contactPerson: '', phone: '', whatsapp: '', email: '',
  address: '', inquiryDate: new Date().toISOString().slice(0, 10), status: 'prospect',
};

function ClientCard({ client, onEdit, onDelete }: { client: Client; onEdit: (c: Client) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[client.status];

  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 hover:shadow-card-hover transition-all duration-200">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-[15px] font-bold">{client.companyNameZh}</h4>
          <span className="text-[12px] text-muted-foreground">{client.companyNameEn}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onEdit(client)} className="p-1 text-muted-foreground hover:text-teal-600 transition-colors"><Pencil size={12} /></button>
          <button onClick={() => onDelete(client.id)} className="p-1 text-muted-foreground hover:text-rose-600 transition-colors"><Trash2 size={12} /></button>
          <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-sm', config.bgColor, config.color)}>{config.label}</span>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2">
          <Building2 size={12} className="text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground">{client.industry} • {client.brandName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium">{client.contactPerson}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/50">
        <a href={`tel:${client.phone}`} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-[11px] font-medium hover:bg-blue-100 transition-colors">
          <Phone size={10} />{client.phone}
        </a>
        <a href={`https://wa.me/${client.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded text-[11px] font-medium hover:bg-green-100 transition-colors">
          <MessageCircle size={10} />WhatsApp
        </a>
        <a href={`mailto:${client.email}`} className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-600 rounded text-[11px] font-medium hover:bg-purple-100 transition-colors">
          <Mail size={10} />Email
        </a>
      </div>

      {/* Address */}
      <div className="flex items-start gap-2 mb-3">
        <MapPin size={12} className="text-muted-foreground mt-0.5 shrink-0" />
        <span className="text-[11px] text-muted-foreground">{client.address}</span>
      </div>

      {/* Projects expandable */}
      {client.projects.length > 0 && (
        <div>
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:underline">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {client.projects.length} 個項目
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {client.projects.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded text-[12px]">
                  <span className="font-medium">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">${p.budget.toLocaleString()}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', p.status === 'active' ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-600')}>
                      {p.status === 'active' ? '進行中' : '已完成'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CRMModule({ subModule }: { subModule?: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<Omit<Client, 'id' | 'projects'>>(emptyClient);

  const getTitle = () => {
    switch (subModule) {
      case 'list': return { title: '客戶列表', subtitle: '管理客戶資料及聯絡方式。' };
      case 'projects': return { title: '客戶項目', subtitle: '查看客戶關聯的項目及合作記錄。' };
      default: return { title: '客戶列表', subtitle: '管理客戶資料及聯絡方式。' };
    }
  };

  const { title, subtitle } = getTitle();

  const filtered = clients.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.companyNameZh.includes(q) || c.companyNameEn.toLowerCase().includes(q) || c.contactPerson.toLowerCase().includes(q);
    }
    return true;
  });

  const activeCount = clients.filter(c => c.status === 'active').length;
  const prospectCount = clients.filter(c => c.status === 'prospect').length;
  const inactiveCount = clients.filter(c => c.status === 'inactive').length;

  const openAddModal = () => {
    setEditingClient(null);
    setFormData(emptyClient);
    setShowModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setFormData({
      companyNameZh: client.companyNameZh,
      companyNameEn: client.companyNameEn,
      brand: client.brand,
      brandName: client.brandName,
      industry: client.industry,
      contactPerson: client.contactPerson,
      phone: client.phone,
      whatsapp: client.whatsapp,
      email: client.email,
      address: client.address,
      inquiryDate: client.inquiryDate,
      status: client.status,
      notes: client.notes,
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('確定要刪除此客戶嗎？')) {
      setClients(prev => prev.filter(c => c.id !== id));
    }
  };

  const handleSave = () => {
    if (!formData.companyNameZh || !formData.contactPerson) {
      alert('請填寫必填欄位（公司名稱、聯絡人）');
      return;
    }
    if (editingClient) {
      setClients(prev => prev.map(c => c.id === editingClient.id ? { ...c, ...formData } : c));
    } else {
      const newClient: Client = {
        ...formData,
        id: `client-${Date.now()}`,
        projects: [],
      };
      setClients(prev => [newClient, ...prev]);
    }
    setShowModal(false);
    setEditingClient(null);
    setFormData(emptyClient);
  };

  const updateForm = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
        >
          <Plus size={14} />新增客戶
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">合作中</span>
          <span className="text-[24px] font-bold block mt-1 text-teal-600">{activeCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">潛在客戶</span>
          <span className="text-[24px] font-bold block mt-1 text-amber-600">{prospectCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已停止</span>
          <span className="text-[24px] font-bold block mt-1 text-slate-500">{inactiveCount}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[280px]">
          <Search size={14} className="text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋客戶名稱..." />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px]">
          <option value="all">所有狀態</option>
          <option value="active">合作中</option>
          <option value="prospect">潛在客戶</option>
          <option value="inactive">已停止</option>
        </select>
      </div>

      {/* Client Table View */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司名稱</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">行業</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">聯絡人</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">電話</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(client => {
              const config = statusConfig[client.status];
              return (
                <tr key={client.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-[14px] font-medium block">{client.companyNameZh}</span>
                      <span className="text-[11px] text-muted-foreground">{client.companyNameEn}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]">{client.brandName}</td>
                  <td className="px-4 py-3 text-[13px]">{client.industry}</td>
                  <td className="px-4 py-3 text-[13px] font-medium">{client.contactPerson}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{client.phone}</td>
                  <td className="px-4 py-3 text-[13px]">
                    <span className="text-teal-600 font-medium">{client.projects.length}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <a href={`tel:${client.phone}`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="致電">
                        <Phone size={13} />
                      </a>
                      <a href={`https://wa.me/${client.whatsapp}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors" title="WhatsApp">
                        <MessageCircle size={13} />
                      </a>
                      <a href={`mailto:${client.email}`} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors" title="電郵">
                        <Mail size={13} />
                      </a>
                      <button onClick={() => openEditModal(client)} className="p-1.5 text-muted-foreground hover:text-teal-600 hover:bg-teal-50 rounded transition-colors" title="編輯">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(client.id)} className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="刪除">
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
          <div className="text-center py-12">
            <Building2 size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-[14px] text-muted-foreground">沒有符合條件的客戶</p>
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-6 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold">{editingClient ? '編輯客戶' : '新增客戶'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded transition-colors"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              {/* Company Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司名稱（中文）*</label>
                  <Input value={formData.companyNameZh} onChange={(e) => updateForm('companyNameZh', e.target.value)} placeholder="例：新創科技有限公司" className="h-9 text-[13px]" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">公司名稱（英文）</label>
                  <Input value={formData.companyNameEn} onChange={(e) => updateForm('companyNameEn', e.target.value)} placeholder="e.g. TechStart Inc" className="h-9 text-[13px]" />
                </div>
              </div>

              {/* Brand & Industry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬品牌</label>
                  <select
                    value={formData.brand}
                    onChange={(e) => {
                      const selected = brandOptions.find(b => b.id === e.target.value);
                      updateForm('brand', e.target.value);
                      updateForm('brandName', selected?.name || '');
                    }}
                    className="w-full h-9 px-3 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  >
                    {brandOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">行業</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => updateForm('industry', e.target.value)}
                    className="w-full h-9 px-3 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  >
                    {industryOptions.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              {/* Contact Person */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">聯絡人 *</label>
                <Input value={formData.contactPerson} onChange={(e) => updateForm('contactPerson', e.target.value)} placeholder="聯絡人姓名" className="h-9 text-[13px]" />
              </div>

              {/* Phone & WhatsApp */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">電話</label>
                  <Input value={formData.phone} onChange={(e) => updateForm('phone', e.target.value)} placeholder="+852 9123 4567" className="h-9 text-[13px]" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">WhatsApp</label>
                  <Input value={formData.whatsapp} onChange={(e) => updateForm('whatsapp', e.target.value)} placeholder="85291234567" className="h-9 text-[13px]" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">電郵</label>
                <Input value={formData.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="email@example.com" className="h-9 text-[13px]" />
              </div>

              {/* Address */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">地址</label>
                <Input value={formData.address} onChange={(e) => updateForm('address', e.target.value)} placeholder="客戶地址" className="h-9 text-[13px]" />
              </div>

              {/* Date & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">查詢日期</label>
                  <Input type="date" value={formData.inquiryDate} onChange={(e) => updateForm('inquiryDate', e.target.value)} className="h-9 text-[13px]" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶狀態</label>
                  <select
                    value={formData.status}
                    onChange={(e) => updateForm('status', e.target.value)}
                    className="w-full h-9 px-3 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                  >
                    <option value="prospect">潛在客戶</option>
                    <option value="active">合作中</option>
                    <option value="inactive">已停止</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">備註</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 resize-none"
                  rows={3}
                  placeholder="任何備註..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-border">
              <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSave}>
                {editingClient ? '儲存變更' : '確認新增'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
