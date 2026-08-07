import { useState } from 'react';
import { Plus, Edit2, Check, X, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Brand } from '@/types/app';
import { companies, projects, yearPlans } from '@/data/mockData';
import { useBrands } from '@/hooks/useBrands';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface BrandFormData {
  companyId: string;
  brandCode: string;
  displayName: string;
  isActive: boolean;
}

const emptyBrand: BrandFormData = {
  companyId: '',
  brandCode: '',
  displayName: '',
  isActive: true,
};

export function BrandManagement({ onSelectBrand }: { onSelectBrand?: (brandId: string) => void }) {
  const { brands, addBrand, updateBrand } = useBrands();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState<BrandFormData>(emptyBrand);
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  const companyOptions = companies.map((c) => ({
    ...c,
    key: c.uuid || c.id,
  }));

  const handleOpenNew = () => {
    setEditingBrand(null);
    setFormData(emptyBrand);
    setIsDialogOpen(true);
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setFormData({
      companyId: brand.companyId,
      brandCode: brand.brandCode,
      displayName: brand.displayName,
      isActive: brand.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
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
          ...formData,
          displayName: formData.displayName || formData.brandCode,
          projectCount: 0,
        };
        const err = await addBrand(newBrand);
        if (err) {
          toast.error('儲存失敗', { description: err.message });
          return;
        }
        toast.success('品牌已新增');
      }
      setIsDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (brand: Brand) => {
    const err = await updateBrand(brand.id, { isActive: !brand.isActive });
    if (err) toast.error('更新失敗', { description: err.message });
  };

  const filteredBrands = filterCompany === 'all' ? brands : brands.filter(b => b.companyId === filterCompany);
  const activeBrands = filteredBrands.filter(b => b.isActive);
  const inactiveBrands = filteredBrands.filter(b => !b.isActive);

  const groupedByCompany = companyOptions
    .filter(c => filterCompany === 'all' || c.key === filterCompany)
    .map(company => ({
      company,
      brands: filteredBrands.filter(b => b.companyId === company.key || b.companyId === company.id),
    }))
    .filter(g => g.brands.length > 0);

  const getBrandYearPlanAchievement = (brandId: string) => {
    const plan = yearPlans.find(yp => yp.brandId === brandId && yp.year === 2025);
    if (!plan) return null;
    const actual = projects.filter(p => p.brandId === brandId && p.startDate.startsWith('2025')).length;
    return plan.targetProjects > 0 ? Math.round((actual / plan.targetProjects) * 100) : 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight">品牌管理</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            管理各公司品牌，每個項目必須綁定一個品牌。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="h-8 text-[12px] w-[160px]">
              <SelectValue placeholder="篩選公司" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有公司</SelectItem>
              {companyOptions.filter(c => c.isActive).map(c => (
                <SelectItem key={c.key} value={c.key}>{c.companyCode} - {c.companyNameZh || c.companyNameEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenNew} className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5" size="sm">
                <Plus size={14} />
                新增品牌
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{editingBrand ? '編輯品牌' : '新增品牌'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">所屬公司 *</Label>
                  <Select value={formData.companyId} onValueChange={(val) => setFormData({ ...formData, companyId: val })}>
                    <SelectTrigger className="text-[13px]">
                      <SelectValue placeholder="選擇公司（必填）" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyOptions.filter(c => c.isActive).map(c => (
                        <SelectItem key={c.key} value={c.key}>{c.companyCode} - {c.companyNameZh || c.companyNameEn}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">品牌代碼 *</Label>
                  <Input
                    value={formData.brandCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setFormData({
                        ...formData,
                        brandCode: code,
                        displayName: !formData.displayName || formData.displayName === formData.brandCode ? code : formData.displayName,
                      });
                    }}
                    placeholder="BWA"
                    className="text-[13px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">顯示名稱 *</Label>
                  <Input
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="預設與品牌代碼相同"
                    className="text-[13px]"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
                  <Label className="text-[13px]">啟用品牌</Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>取消</Button>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving || !formData.companyId || !formData.brandCode || !formData.displayName}>
                    {saving ? '儲存中...' : editingBrand ? '保存' : '新增'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">活躍品牌</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{activeBrands.length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總項目數</span>
          <span className="text-[22px] font-bold block mt-1">{filteredBrands.reduce((sum, b) => sum + (b.projectCount || 0), 0)}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">已停用</span>
          <span className="text-[22px] font-bold block mt-1 text-slate-500">{inactiveBrands.length}</span>
        </div>
      </div>

      {groupedByCompany.map(({ company, brands: companyBrands }) => (
        <div key={company.key} className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-teal-600" />
            <h3 className="text-[14px] font-bold">{company.companyCode}</h3>
            <span className="text-[12px] text-muted-foreground">- {company.companyNameZh || company.companyNameEn}</span>
            <Badge variant="secondary" className="text-[10px] h-5">{companyBrands.length} 品牌</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companyBrands.map((brand) => {
              const achievement = getBrandYearPlanAchievement(brand.id);
              return (
                <div
                  key={brand.id}
                  className={cn(
                    'bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 hover:shadow-[0_4px_12px_rgba(0,20,40,0.1)] transition-all duration-200 cursor-pointer',
                    !brand.isActive && 'opacity-60'
                  )}
                  onClick={() => onSelectBrand?.(brand.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md flex items-center justify-center text-white font-bold text-[14px] bg-teal-600">
                        {brand.brandCode.slice(0, 3)}
                      </div>
                      <div>
                        <h4 className="text-[15px] font-bold">{brand.displayName}</h4>
                        <span className="text-[12px] text-muted-foreground">{brand.brandCode}</span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(brand); }} className="p-1.5 rounded hover:bg-muted transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                  </div>

                  {achievement !== null && (
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[11px] text-muted-foreground">2025 目標達成率</span>
                        <span className="text-[11px] font-medium">{achievement}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', achievement >= 50 ? 'bg-teal-600' : 'bg-amber-500')} style={{ width: `${Math.min(achievement, 100)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-muted-foreground" />
                      <span className="text-[12px] text-muted-foreground">
                        {brand.projectCount || 0} 個項目
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={brand.isActive ? 'default' : 'secondary'} className={cn('text-[10px] h-5', brand.isActive ? 'bg-teal-50 text-teal-700 hover:bg-teal-50' : '')}>
                        {brand.isActive ? '活躍' : '已停用'}
                      </Badge>
                      <button onClick={(e) => { e.stopPropagation(); handleToggleActive(brand); }} className={cn('p-1 rounded transition-colors', brand.isActive ? 'hover:bg-rose-50 text-rose-400' : 'hover:bg-teal-50 text-teal-500')}>
                        {brand.isActive ? <X size={12} /> : <Check size={12} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
