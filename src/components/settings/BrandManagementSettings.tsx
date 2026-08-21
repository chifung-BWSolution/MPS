import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { projects, yearPlans } from '@/data/mockData';
import { Brand, Company } from '@/types/app';
import { useBrands } from '@/hooks/useBrands';
import { useCompanies } from '@/hooks/useCompanies';
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  Tags,
  Edit,
  Trash2,
  X,
  FolderKanban,
  TrendingUp,
  Building2,
  Filter,
} from 'lucide-react';

function companyKey(c: Company) {
  return c.uuid || c.id;
}

export function BrandManagementSettings() {
  const { brands: brandsData, loading: brandsLoading, addBrand, updateBrand, deleteBrand } = useBrands();
  const { companies, loading: companiesLoading } = useCompanies();
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

  const filteredBrands = brandsData.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      b.brandCode.toLowerCase().includes(q) ||
      b.displayName.toLowerCase().includes(q);
    const matchesCompany = filterCompanyId === 'all' || b.companyId === filterCompanyId;
    return matchesSearch && matchesCompany;
  });

  const getCompany = (companyId: string) =>
    companies.find((c) => companyKey(c) === companyId || c.id === companyId);

  const getCompanyName = (companyId: string) => {
    const c = getCompany(companyId);
    if (!c) return '';
    return c.companyNameEn || c.companyNameZh || '';
  };

  const getCompanyCode = (companyId: string) => getCompany(companyId)?.companyCode || '';

  const getActiveProjectCount = (brandId: string) =>
    projects.filter((p) => p.brandId === brandId && p.status === 'active').length;

  const getYearPlanProgress = (brandId: string) => {
    const plan = yearPlans.find((yp) => yp.brandId === brandId && yp.year === 2025);
    if (!plan) return null;
    const brandProjects = projects.filter((p) => p.brandId === brandId);
    const completedProjects = brandProjects.filter((p) => p.status === 'completed').length;
    const progress = Math.round((completedProjects / (plan.targetProjects || 1)) * 100);
    return { progress: Math.min(progress, 100), target: plan.targetProjects };
  };

  const handleAdd = () => { setEditingBrand(null); setIsModalOpen(true); };
  const handleEdit = (brand: Brand) => { setEditingBrand(brand); setIsModalOpen(true); };
  const handleDeleteClick = (brand: Brand) => setDeleteTarget(brand);

  const handleSave = async (formData: Partial<Brand>) => {
    if (editingBrand) {
      const err = await updateBrand(editingBrand.id, formData);
      if (err) {
        toast.error('儲存失敗', { description: err.message });
        return;
      }
      toast.success('品牌已更新');
    } else {
      const newBrand: Brand = {
        id: crypto.randomUUID(),
        companyId: formData.companyId || '',
        brandCode: formData.brandCode || '',
        displayName: formData.displayName || formData.brandCode || '',
        isActive: true,
        projectCount: 0,
      };
      const err = await addBrand(newBrand);
      if (err) {
        toast.error('新增失敗', { description: err.message });
        return;
      }
      toast.success('品牌已新增');
    }
    setIsModalOpen(false);
    setEditingBrand(null);
  };

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      const err = await deleteBrand(deleteTarget.id);
      if (err) {
        toast.error('刪除失敗', { description: err.message });
        return;
      }
      toast.success('品牌已刪除');
    }
    setDeleteTarget(null);
  };

  const loading = brandsLoading || companiesLoading;

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
          <h2 className="text-[22px] font-bold text-[#0d1a2d]">品牌管理</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            管理各公司旗下的品牌代碼與顯示名稱。網站請在「網站列表」掛在品牌之下。
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-[320px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜尋品牌代碼、顯示名稱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all bg-white"
            />
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <select
              value={filterCompanyId}
              onChange={(e) => setFilterCompanyId(e.target.value)}
              className="pl-8 pr-8 py-2 border border-border rounded-lg text-[13px] appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
            >
              <option value="all">全部公司</option>
              {companies.filter(c => c.isActive).map((c) => (
                <option key={companyKey(c)} value={companyKey(c)}>{c.companyCode} - {c.companyNameEn || c.companyNameZh}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={cn('p-2 transition-colors', viewMode === 'table' ? 'bg-teal-50 text-teal-700' : 'text-muted-foreground hover:bg-muted')}
              title="表格檢視"
            >
              <List size={15} />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={cn('p-2 transition-colors', viewMode === 'card' ? 'bg-teal-50 text-teal-700' : 'text-muted-foreground hover:bg-muted')}
              title="卡片檢視"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
          >
            <Plus size={14} />
            新增品牌
          </button>
        </div>
      </div>

      {viewMode === 'card' ? (
        <BrandCardView
          brands={filteredBrands}
          getCompanyName={getCompanyName}
          getCompanyCode={getCompanyCode}
          getActiveProjectCount={getActiveProjectCount}
          getYearPlanProgress={getYearPlanProgress}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      ) : (
        <BrandTableView
          brands={filteredBrands}
          getCompanyName={getCompanyName}
          getCompanyCode={getCompanyCode}
          getActiveProjectCount={getActiveProjectCount}
          getYearPlanProgress={getYearPlanProgress}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      )}

      {filteredBrands.length === 0 && (
        <div className="text-center py-16">
          <Tags size={40} className="mx-auto text-muted-foreground/40" />
          <p className="text-[14px] text-muted-foreground mt-3">
            {searchQuery || filterCompanyId !== 'all' ? '找不到符合條件的品牌' : '尚未新增任何品牌'}
          </p>
          {!searchQuery && filterCompanyId === 'all' && (
            <button onClick={handleAdd} className="mt-3 text-[13px] text-teal-600 font-medium hover:underline">
              + 新增第一個品牌
            </button>
          )}
        </div>
      )}

      {isModalOpen && (
        <BrandModal
          brand={editingBrand}
          companies={companies.filter(c => c.isActive)}
          onSave={handleSave}
          onClose={() => { setIsModalOpen(false); setEditingBrand(null); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.displayName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

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
            確定要刪除 <span className="font-bold">「{name}」</span> 嗎？
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

function BrandCardView({
  brands,
  getCompanyName,
  getCompanyCode,
  getActiveProjectCount,
  getYearPlanProgress,
  onEdit,
  onDelete,
}: {
  brands: Brand[];
  getCompanyName: (id: string) => string;
  getCompanyCode: (id: string) => string;
  getActiveProjectCount: (id: string) => number;
  getYearPlanProgress: (id: string) => { progress: number; target: number } | null;
  onEdit: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {brands.map((brand) => {
        const projectCount = getActiveProjectCount(brand.id);
        const yearPlan = getYearPlanProgress(brand.id);

        return (
          <div
            key={brand.id}
            className={cn(
              'bg-white rounded-lg border p-5 transition-all duration-200 hover:shadow-md hover:border-teal-200',
              brand.isActive ? 'border-[rgba(13,26,45,0.08)]' : 'border-amber-200 bg-amber-50/20 opacity-75'
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center border bg-teal-50 border-teal-100">
                  <Tags size={18} className="text-teal-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                      {brand.brandCode}
                    </span>
                    {!brand.isActive && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">已停用</span>
                    )}
                  </div>
                  <h3 className="text-[14px] font-bold text-[#0d1a2d] mt-1 leading-tight">{brand.displayName}</h3>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 mb-4">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Building2 size={11} />所屬公司
                </span>
                <span className="font-medium">
                  <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded mr-1.5">{getCompanyCode(brand.companyId)}</span>
                  {getCompanyName(brand.companyId)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <FolderKanban size={12} className="text-teal-500" />
                <span className="text-[12px] font-medium">{projectCount}</span>
                <span className="text-[11px] text-muted-foreground">活躍項目</span>
              </div>
            </div>

            {yearPlan ? (
              <div className="mb-4">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-muted-foreground flex items-center gap-1"><TrendingUp size={11} />今年目標達成率</span>
                  <span className="font-bold text-[#0d1a2d]">{yearPlan.progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', yearPlan.progress >= 70 ? 'bg-teal-500' : yearPlan.progress >= 40 ? 'bg-amber-500' : 'bg-rose-400')}
                    style={{ width: `${yearPlan.progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-3 border-t border-border/50">
              <button
                onClick={() => onEdit(brand)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors"
              >
                <Edit size={12} />
                編輯
              </button>
              <button
                onClick={() => onDelete(brand)}
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

function BrandTableView({
  brands,
  getCompanyName,
  getCompanyCode,
  getActiveProjectCount,
  getYearPlanProgress,
  onEdit,
  onDelete,
}: {
  brands: Brand[];
  getCompanyName: (id: string) => string;
  getCompanyCode: (id: string) => string;
  getActiveProjectCount: (id: string) => number;
  getYearPlanProgress: (id: string) => { progress: number; target: number } | null;
  onEdit: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50 border-b border-border/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">品牌編碼</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">顯示名稱</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">所屬公司</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">項目數</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">達成率</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">狀態</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => {
              const yearPlan = getYearPlanProgress(brand.id);
              return (
                <tr key={brand.id} className="border-t border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded text-[11px]">{brand.brandCode}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#0d1a2d]">{brand.displayName}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{getCompanyCode(brand.companyId)}</span>
                      <span className="text-[12px]">{getCompanyName(brand.companyId)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-50 text-teal-700 text-[11px] font-bold">
                      {getActiveProjectCount(brand.id)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {yearPlan ? (
                      <span className="text-[11px] font-medium">{yearPlan.progress}%</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">未設定</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium', brand.isActive ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-700')}>
                      {brand.isActive ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onEdit(brand)}
                        className="text-teal-600 hover:text-teal-700 text-[12px] font-medium hover:underline"
                      >
                        編輯
                      </button>
                      <span className="text-border">|</span>
                      <button
                        onClick={() => onDelete(brand)}
                        className="text-rose-600 hover:text-rose-700 text-[12px] font-medium hover:underline"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrandModal({
  brand,
  companies,
  onSave,
  onClose,
}: {
  brand: Brand | null;
  companies: Company[];
  onSave: (data: Partial<Brand>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Brand>>({
    companyId: brand?.companyId || '',
    brandCode: brand?.brandCode || '',
    displayName: brand?.displayName || '',
    isActive: brand?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.companyId?.trim()) errs.companyId = '請選擇所屬公司';
    if (!form.brandCode?.trim()) errs.brandCode = '請輸入品牌代碼';
    if (!form.displayName?.trim()) errs.displayName = '請輸入顯示名稱';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const code = form.brandCode?.trim() || '';
    onSave({
      ...form,
      brandCode: code,
      displayName: form.displayName?.trim() || code,
    });
  };

  const updateField = (field: keyof Brand, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'brandCode' && typeof value === 'string') {
        const code = value.trim();
        if (!prev.displayName || prev.displayName === prev.brandCode) {
          next.displayName = code;
        }
      }
      return next;
    });
    if (errors[field as string]) setErrors((prev) => { const next = { ...prev }; delete next[field as string]; return next; });
  };

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h3 className="text-[18px] font-bold text-[#0d1a2d]">{brand ? '編輯品牌' : '新增品牌'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">所屬公司 *</label>
            <select
              value={form.companyId || ''}
              onChange={(e) => updateField('companyId', e.target.value)}
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all appearance-none bg-white',
                errors.companyId ? 'border-rose-400 bg-rose-50/30' : 'border-border'
              )}
            >
              <option value="">— 請選擇公司 —</option>
              {companies.map((c) => (
                <option key={companyKey(c)} value={companyKey(c)}>{c.companyCode} - {c.companyNameEn || c.companyNameZh}</option>
              ))}
            </select>
            {errors.companyId && <p className="text-[11px] text-rose-500 mt-1">{errors.companyId}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">品牌代碼 *</label>
              <input
                type="text"
                value={form.brandCode || ''}
                onChange={(e) => updateField('brandCode', e.target.value)}
                placeholder="如 BWA, FCC"
                className={cn(
                  'w-full px-3 py-2 border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all',
                  errors.brandCode ? 'border-rose-400 bg-rose-50/30' : 'border-border'
                )}
              />
              {errors.brandCode && <p className="text-[11px] text-rose-500 mt-1">{errors.brandCode}</p>}
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">顯示名稱 *</label>
              <input
                type="text"
                value={form.displayName || ''}
                onChange={(e) => updateField('displayName', e.target.value)}
                placeholder="預設與品牌代碼相同"
                className={cn(
                  'w-full px-3 py-2 border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all',
                  errors.displayName ? 'border-rose-400 bg-rose-50/30' : 'border-border'
                )}
              />
              {errors.displayName && <p className="text-[11px] text-rose-500 mt-1">{errors.displayName}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/50 bg-muted/20">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-[#0d1a2d] hover:bg-muted transition-colors">
            取消
          </button>
          <button onClick={handleSubmit} className="px-5 py-2 bg-teal-600 text-white rounded-lg text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]">
            {brand ? '儲存變更' : '新增品牌'}
          </button>
        </div>
      </div>
    </div>
  );
}
