import { useState } from 'react';
import { Search, Plus, Phone, Mail, Building2, Pencil, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ClientFormModal } from '@/components/crm/ClientFormModal';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import { useBrands } from '@/hooks/useBrands';
import { buildQuotationProjectHref } from '@/lib/quotationProjectNavigation';
import {
  quotationClientStatusConfig,
  type QuotationClient,
  type QuotationClientInput,
} from '@/data/quotationClientList';

function BrandBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-sm bg-teal-50 text-teal-700 whitespace-nowrap">
      {label}
    </span>
  );
}

export function CRMModule({ subModule }: { subModule?: string }) {
  const { records: clients, loading, addClient, updateClient, deleteClient } = useQuotationClientList();
  const { brands } = useBrands();
  const brandLabel = (id: string) => {
    const brand = brands.find((b) => b.id === id);
    return brand?.displayName || brand?.brandCode || id;
  };
  const brandLabels = (ids: string[]) => ids.map(brandLabel).filter(Boolean);
  const brandItems = (ids: string[]) =>
    ids.map((id) => ({ id, label: brandLabel(id) })).filter((item) => item.label);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<QuotationClient | null>(null);
  const [saving, setSaving] = useState(false);

  const getTitle = () => {
    switch (subModule) {
      case 'list':
        return { title: '客戶列表', subtitle: '管理客戶資料及聯絡方式。' };
      case 'projects':
        return { title: '客戶項目', subtitle: '查看客戶關聯的項目及合作記錄。' };
      default:
        return { title: '客戶列表', subtitle: '管理客戶資料及聯絡方式。' };
    }
  };

  const { title, subtitle } = getTitle();

  const filtered = clients.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.displayName.toLowerCase().includes(q) ||
        c.companyNameZh.includes(searchQuery) ||
        c.companyNameEn.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        (c.latestProject?.displayName || '').toLowerCase().includes(q) ||
        brandLabels(c.brandIds).some((name) => name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const activeCount = clients.filter((c) => c.status === 'active').length;
  const prospectCount = clients.filter((c) => c.status === 'prospect').length;
  const inactiveCount = clients.filter((c) => c.status === 'inactive').length;

  const openAddModal = () => {
    setEditingClient(null);
    setShowModal(true);
  };

  const openEditModal = (client: QuotationClient) => {
    setEditingClient(client);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此客戶嗎？')) return;
    const ok = await deleteClient(id);
    if (ok) toast.success('客戶已刪除');
    else toast.error('刪除失敗');
  };

  const handleSave = async (input: QuotationClientInput) => {
    setSaving(true);
    const result = editingClient
      ? await updateClient(editingClient.id, input)
      : await addClient(input);
    setSaving(false);
    if (!result) {
      toast.error('儲存失敗');
      return null;
    }
    setEditingClient(null);
    return result;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
        >
          <Plus size={14} />
          新增客戶
        </button>
      </div>

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

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[280px] bg-white">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            placeholder="搜尋客戶名稱..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">所有狀態</option>
          <option value="active">合作中</option>
          <option value="prospect">潛在客戶</option>
          <option value="inactive">已停止</option>
        </select>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        {loading && (
          <div className="px-4 py-3 text-[13px] text-muted-foreground flex items-center gap-2 border-b border-border">
            <Loader2 size={14} className="animate-spin" /> 載入客戶資料…
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">顯示名稱</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司名稱</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">聯絡人</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">電話</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">最近項目</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3 whitespace-nowrap min-w-[7.5rem]">狀態</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
            {filtered.map((client) => {
              const config = quotationClientStatusConfig[client.status];
              const brandsForClient = brandItems(client.brandIds);
              const latestProject = client.latestProject;
              return (
                <tr key={client.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors duration-200">
                  <td className="px-4 py-3 text-[14px] font-medium">
                    {client.displayName || client.companyNameZh || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {brandsForClient.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {brandsForClient.map((brand) => (
                          <BrandBadge key={brand.id} label={brand.label} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className="text-[14px] font-medium block">{client.companyNameZh}</span>
                      {client.companyNameEn && (
                        <span className="text-[11px] text-muted-foreground">{client.companyNameEn}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium">{client.contactPerson}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">{client.phone || '—'}</td>
                  <td className="px-4 py-3 text-[13px]">
                    {latestProject ? (
                      <a
                        href={buildQuotationProjectHref(latestProject.id, latestProject.status)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 font-medium hover:underline text-left"
                      >
                        {latestProject.displayName || '—'}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap min-w-[7.5rem]">
                    <span className={cn('inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-sm whitespace-nowrap', config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {client.phone && (
                        <a href={`tel:${client.phone}`} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="致電">
                          <Phone size={13} />
                        </a>
                      )}
                      {client.email && (
                        <a href={`mailto:${client.email}`} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors" title="電郵">
                          <Mail size={13} />
                        </a>
                      )}
                      <button type="button" onClick={() => openEditModal(client)} className="p-1.5 text-muted-foreground hover:text-teal-600 hover:bg-teal-50 rounded transition-colors" title="編輯">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => void handleDelete(client.id)} className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" title="刪除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="text-center py-12">
            <Building2 size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-[14px] text-muted-foreground">沒有符合條件的客戶</p>
          </div>
        )}
      </div>

      <ClientFormModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingClient(null);
        }}
        editingClient={editingClient}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
