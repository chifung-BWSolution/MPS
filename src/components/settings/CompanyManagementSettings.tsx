import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { brands as mockBrands, projects } from '@/data/mockData';
import { Company } from '@/types/app';
import { useCompanies } from '@/hooks/useCompanies';
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  Building2,
  Edit,
  Trash2,
  X,
  FolderKanban,
  Tags,
  TrendingUp,
} from 'lucide-react';

export function CompanyManagementSettings() {
  const { companies: companiesData, loading, addCompany, updateCompany, deleteCompany } = useCompanies();
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const filteredCompanies = companiesData.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.companyCode.toLowerCase().includes(q) ||
      c.companyNameZh.includes(q) ||
      c.companyNameEn.toLowerCase().includes(q) ||
      c.brNo.toLowerCase().includes(q) ||
      c.contactPerson.includes(q)
    );
  });

  const getBrandCount = (companyId: string) =>
    mockBrands.filter((b) => b.companyId === companyId && b.isActive).length;

  const getActiveProjectCount = (companyId: string) =>
    projects.filter((p) => p.companyId === companyId && p.status === 'active').length;

  const getYearProgress = (companyId: string) => {
    const companyProjects = projects.filter((p) => p.companyId === companyId);
    const completedCount = companyProjects.filter((p) => p.status === 'completed').length;
    return Math.round((completedCount / (companyProjects.length || 1)) * 100);
  };

  const maskBankAccount = (account: string) => {
    if (account.length <= 4) return account;
    return '•••• ' + account.slice(-4);
  };

  const handleAdd = () => { setEditingCompany(null); setIsModalOpen(true); };
  const handleEdit = (company: Company) => { setEditingCompany(company); setIsModalOpen(true); };
  const handleDeleteClick = (company: Company) => setDeleteTarget(company);

  const handleSave = async (formData: Partial<Company>) => {
    if (editingCompany) {
      const err = await updateCompany(editingCompany.id, formData);
      if (err) { toast.error('儲存失敗', { description: err.message }); return; }
      toast.success('公司已更新');
    } else {
      const newCompany: Company = {
        id: `c${Date.now()}`,
        uuid: crypto.randomUUID(),
        companyCode: formData.companyCode || '',
        companyNameZh: formData.companyNameZh || '',
        companyNameEn: formData.companyNameEn || '',
        brNo: formData.brNo || '',
        bankName: formData.bankName || '',
        bankAccount: formData.bankAccount || '',
        address: formData.address || '',
        contactPerson: formData.contactPerson || '',
        contactPhone: formData.contactPhone || '',
        contactEmail: formData.contactEmail || '',
        logoUrl: formData.logoUrl || '',
        isActive: true,
        brandCount: 0,
        activeProjectCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const err = await addCompany(newCompany);
      if (err) { toast.error('新增失敗', { description: err.message }); return; }
      toast.success('公司已新增');
    }
    setIsModalOpen(false);
    setEditingCompany(null);
  };

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      await deleteCompany(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        從資料庫載入中…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[#0d1a2d]">公司管理</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            管理系統中的所有公司資料、銀行帳號及業務登記資訊。
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-[360px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜尋公司名稱、BR No.、聯絡人..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('card')}
              className={cn('p-2 transition-colors', viewMode === 'card' ? 'bg-teal-50 text-teal-700' : 'text-muted-foreground hover:bg-muted')}
              title="卡片檢視"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn('p-2 transition-colors', viewMode === 'table' ? 'bg-teal-50 text-teal-700' : 'text-muted-foreground hover:bg-muted')}
              title="表格檢視"
            >
              <List size={15} />
            </button>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
          >
            <Plus size={14} />
            新增公司
          </button>
        </div>
      </div>

      {viewMode === 'card' ? (
        <CardView
          companies={filteredCompanies}
          getBrandCount={getBrandCount}
          getActiveProjectCount={getActiveProjectCount}
          getYearProgress={getYearProgress}
          maskBankAccount={maskBankAccount}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      ) : (
        <TableView
          companies={filteredCompanies}
          getBrandCount={getBrandCount}
          getActiveProjectCount={getActiveProjectCount}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      )}

      {filteredCompanies.length === 0 && (
        <div className="text-center py-16">
          <Building2 size={40} className="mx-auto text-muted-foreground/40" />
          <p className="text-[14px] text-muted-foreground mt-3">
            {searchQuery ? '找不到符合條件的公司' : '尚未新增任何公司'}
          </p>
          {!searchQuery && (
            <button onClick={handleAdd} className="mt-3 text-[13px] text-teal-600 font-medium hover:underline">
              + 新增第一間公司
            </button>
          )}
        </div>
      )}

      {isModalOpen && (
        <CompanyModal
          company={editingCompany}
          existingCodes={companiesData.map((c) => c.companyCode)}
          onSave={handleSave}
          onClose={() => { setIsModalOpen(false); setEditingCompany(null); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.companyNameZh}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// === Delete Confirm Modal ===
function DeleteConfirmModal({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[400px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h3 className="text-[16px] font-bold text-[#0d1a2d]">確認刪除</h3>
          <button onClick={onCancel} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-[14px] text-[#0d1a2d]">
            確定要刪除 <span className="font-bold">「{name}」</span> 的項目嗎？
          </p>
          <p className="text-[12px] text-muted-foreground mt-1.5">此操作無法復原。</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50 bg-muted/20">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-[#0d1a2d] hover:bg-muted transition-colors"
          >
            否
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-rose-600 text-white rounded-lg text-[13px] font-medium hover:bg-rose-700 transition-colors duration-200 active:scale-[0.97]"
          >
            是，確認刪除
          </button>
        </div>
      </div>
    </div>
  );
}

// === Card View ===
function CardView({
  companies,
  getBrandCount,
  getActiveProjectCount,
  getYearProgress,
  maskBankAccount,
  onEdit,
  onDelete,
}: {
  companies: Company[];
  getBrandCount: (id: string) => number;
  getActiveProjectCount: (id: string) => number;
  getYearProgress: (id: string) => number;
  maskBankAccount: (account: string) => string;
  onEdit: (company: Company) => void;
  onDelete: (company: Company) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {companies.map((company) => {
        const brandCount = getBrandCount(company.id);
        const projectCount = getActiveProjectCount(company.id);
        const yearProgress = getYearProgress(company.id);

        return (
          <div
            key={company.id}
            className={cn(
              'bg-white rounded-lg border p-5 transition-all duration-200 hover:shadow-md hover:border-teal-200',
              company.isActive ? 'border-[rgba(13,26,45,0.08)]' : 'border-amber-200 bg-amber-50/20 opacity-75'
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt={company.companyCode} className="w-10 h-10 rounded-lg object-cover border" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
                    <Building2 size={18} className="text-teal-600" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                      {company.companyCode}
                    </span>
                    {!company.isActive && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">已停用</span>
                    )}
                  </div>
                  <h3 className="text-[14px] font-bold text-[#0d1a2d] mt-1 leading-tight">{company.companyNameEn}</h3>
                  <p className="text-[11px] text-muted-foreground">{company.companyNameZh}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 mb-4">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">BR No.</span>
                <span className="font-mono font-medium">{company.brNo}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">銀行</span>
                <span className="font-medium">{company.bankName}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">帳號</span>
                <span className="font-mono text-[11px]">{maskBankAccount(company.bankAccount)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <Tags size={12} className="text-blue-500" />
                <span className="text-[12px] font-medium">{brandCount}</span>
                <span className="text-[11px] text-muted-foreground">品牌</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FolderKanban size={12} className="text-teal-500" />
                <span className="text-[12px] font-medium">{projectCount}</span>
                <span className="text-[11px] text-muted-foreground">活躍項目</span>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp size={11} />今年目標達成率
                </span>
                <span className="font-bold text-[#0d1a2d]">{yearProgress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', yearProgress >= 70 ? 'bg-teal-500' : yearProgress >= 40 ? 'bg-amber-500' : 'bg-rose-400')}
                  style={{ width: `${yearProgress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-border/50">
              <button
                onClick={() => onEdit(company)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors"
              >
                <Edit size={12} />
                編輯
              </button>
              <button
                onClick={() => onDelete(company)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
              >
                <Trash2 size={12} />
                刪除
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// === Table View ===
function TableView({
  companies,
  getBrandCount,
  getActiveProjectCount,
  onEdit,
  onDelete,
}: {
  companies: Company[];
  getBrandCount: (id: string) => number;
  getActiveProjectCount: (id: string) => number;
  onEdit: (company: Company) => void;
  onDelete: (company: Company) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50 border-b border-border/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">公司編碼</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">公司名稱</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">BR No.</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">聯絡人</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">電話</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">電郵</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">品牌數</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">項目數</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">狀態</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded text-[11px]">
                    {company.companyCode}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <span className="font-bold text-[#0d1a2d]">{company.companyNameEn}</span>
                    <p className="text-[11px] text-muted-foreground">{company.companyNameZh}</p>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">{company.brNo}</td>
                <td className="px-4 py-3">{company.contactPerson}</td>
                <td className="px-4 py-3 text-muted-foreground text-[12px]">{company.contactPhone}</td>
                <td className="px-4 py-3 text-muted-foreground text-[12px]">{company.contactEmail}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
                    {getBrandCount(company.id)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-[11px] font-bold">
                    {getActiveProjectCount(company.id)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium', company.isActive ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700')}>
                    {company.isActive ? '啟用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => onEdit(company)}
                      className="text-teal-600 hover:text-teal-700 text-[12px] font-medium hover:underline"
                    >
                      編輯
                    </button>
                    <span className="text-border">|</span>
                    <button
                      onClick={() => onDelete(company)}
                      className="text-rose-600 hover:text-rose-700 text-[12px] font-medium hover:underline"
                    >
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// === Company Modal ===
function CompanyModal({
  company,
  existingCodes,
  onSave,
  onClose,
}: {
  company: Company | null;
  existingCodes: string[];
  onSave: (data: Partial<Company>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Company>>({
    companyCode: company?.companyCode || '',
    companyNameZh: company?.companyNameZh || '',
    companyNameEn: company?.companyNameEn || '',
    brNo: company?.brNo || '',
    bankName: company?.bankName || '',
    bankAccount: company?.bankAccount || '',
    address: company?.address || '',
    contactPerson: company?.contactPerson || '',
    contactPhone: company?.contactPhone || '',
    contactEmail: company?.contactEmail || '',
    logoUrl: company?.logoUrl || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.companyCode?.trim()) errs.companyCode = '必填';
    else if (!company && existingCodes.includes(form.companyCode.trim().toUpperCase())) {
      errs.companyCode = '公司編碼已存在';
    }
    if (!form.companyNameEn?.trim()) errs.companyNameEn = '必填';
    if (!form.brNo?.trim()) errs.brNo = '必填';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSave({ ...form, companyCode: form.companyCode?.trim().toUpperCase() });
  };

  const updateField = (field: keyof Company, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  };

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h3 className="text-[18px] font-bold text-[#0d1a2d]">{company ? '編輯公司' : '新增公司'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-3 uppercase tracking-wider">必填資料</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldInput label="公司編碼" value={form.companyCode || ''} onChange={(v) => updateField('companyCode', v)} error={errors.companyCode} placeholder="如 BWD, ZF" disabled={!!company} />
              <FieldInput label="BR No. (商業登記號碼)" value={form.brNo || ''} onChange={(v) => updateField('brNo', v)} error={errors.brNo} placeholder="12345678-000-01-25-0" />
              <FieldInput label="中文名稱" value={form.companyNameZh || ''} onChange={(v) => updateField('companyNameZh', v)} error={errors.companyNameZh} placeholder="志豐企業有限公司" />
              <FieldInput label="英文名稱" value={form.companyNameEn || ''} onChange={(v) => updateField('companyNameEn', v)} error={errors.companyNameEn} placeholder="BWDesign Centre Limited" />
            </div>
          </div>

          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-3 uppercase tracking-wider">銀行資料（選填）</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldInput label="銀行名稱" value={form.bankName || ''} onChange={(v) => updateField('bankName', v)} placeholder="恒生銀行" />
              <FieldInput label="銀行帳號" value={form.bankAccount || ''} onChange={(v) => updateField('bankAccount', v)} placeholder="024-123-456789-001" />
            </div>
          </div>

          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-3 uppercase tracking-wider">聯絡資料（選填）</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldInput label="聯絡人" value={form.contactPerson || ''} onChange={(v) => updateField('contactPerson', v)} placeholder="張偉明" />
              <FieldInput label="聯絡電話" value={form.contactPhone || ''} onChange={(v) => updateField('contactPhone', v)} placeholder="+852 2345 6789" />
              <FieldInput label="聯絡電郵" value={form.contactEmail || ''} onChange={(v) => updateField('contactEmail', v)} placeholder="info@company.hk" className="md:col-span-2" />
            </div>
          </div>

          <div>
            <p className="text-[12px] font-medium text-muted-foreground mb-3 uppercase tracking-wider">其他（選填）</p>
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">公司地址</label>
                <textarea
                  value={form.address || ''}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="香港九龍觀塘開源道62號..."
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all resize-none"
                />
              </div>
              <FieldInput label="公司 Logo URL" value={form.logoUrl || ''} onChange={(v) => updateField('logoUrl', v)} placeholder="https://..." />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50 bg-muted/20">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-[#0d1a2d] hover:bg-muted transition-colors">
            取消
          </button>
          <button onClick={handleSubmit} className="px-5 py-2 bg-teal-600 text-white rounded-lg text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]">
            {company ? '儲存變更' : '新增公司'}
          </button>
        </div>
      </div>
    </div>
  );
}

// === Field Input Helper ===
function FieldInput({
  label, value, onChange, error, placeholder, disabled, className,
}: {
  label: string; value: string; onChange: (value: string) => void;
  error?: string; placeholder?: string; disabled?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all',
          error ? 'border-rose-400 bg-rose-50/30' : 'border-border',
          disabled && 'bg-muted cursor-not-allowed'
        )}
      />
      {error && <p className="text-[11px] text-rose-500 mt-1">{error}</p>}
    </div>
  );
}
