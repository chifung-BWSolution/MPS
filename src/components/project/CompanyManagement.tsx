import { useState } from 'react';
import { Plus, Edit2, Building2, LayoutGrid, List, Users, FolderKanban, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Company } from '@/types/app';
import { companies as initialCompanies, brands, projects, yearPlans } from '@/data/mockData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface CompanyFormData {
  companyCode: string;
  companyNameZh: string;
  companyNameEn: string;
  brNo: string;
  bankName: string;
  bankAccount: string;
  address: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  isActive: boolean;
}

const emptyForm: CompanyFormData = {
  companyCode: '',
  companyNameZh: '',
  companyNameEn: '',
  brNo: '',
  bankName: '',
  bankAccount: '',
  address: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
  isActive: true,
};

export function CompanyManagement() {
  const [companiesList, setCompaniesList] = useState<Company[]>(initialCompanies);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState<CompanyFormData>(emptyForm);

  const handleOpenNew = () => {
    setEditingCompany(null);
    setFormData(emptyForm);
    setIsDialogOpen(true);
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      companyCode: company.companyCode,
      companyNameZh: company.companyNameZh,
      companyNameEn: company.companyNameEn,
      brNo: company.brNo,
      bankName: company.bankName,
      bankAccount: company.bankAccount,
      address: company.address,
      contactPerson: company.contactPerson,
      contactPhone: company.contactPhone,
      contactEmail: company.contactEmail,
      isActive: company.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (editingCompany) {
      setCompaniesList(prev =>
        prev.map(c => c.id === editingCompany.id ? { ...c, ...formData } : c)
      );
    } else {
      const newCompany: Company = {
        id: `c${Date.now()}`,
        uuid: crypto.randomUUID(),
        ...formData,
        logoUrl: '',
        brandCount: 0,
        activeProjectCount: 0,
      };
      setCompaniesList(prev => [...prev, newCompany]);
    }
    setIsDialogOpen(false);
  };

  const getCompanyBrandCount = (companyId: string) => brands.filter(b => b.companyId === companyId).length;
  const getCompanyActiveProjects = (companyId: string) => projects.filter(p => p.companyId === companyId && p.status === 'active').length;
  const getCompanyYearPlanAchievement = (companyId: string) => {
    const plans = yearPlans.filter(yp => yp.companyId === companyId);
    if (plans.length === 0) return null;
    const totalTarget = plans.reduce((sum, p) => sum + p.targetProjects, 0);
    const actual = projects.filter(p => p.companyId === companyId && p.startDate.startsWith('2025')).length;
    return totalTarget > 0 ? Math.round((actual / totalTarget) * 100) : 0;
  };

  const activeCompanies = companiesList.filter(c => c.isActive);
  const totalProjects = projects.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight">公司管理</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            管理公司資料，每個品牌與項目必須歸屬於一間公司。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button onClick={() => setViewMode('card')} className={cn('p-1.5 transition-colors', viewMode === 'card' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted')}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setViewMode('table')} className={cn('p-1.5 transition-colors', viewMode === 'table' ? 'bg-teal-600 text-white' : 'text-muted-foreground hover:bg-muted')}>
              <List size={16} />
            </button>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenNew} className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5" size="sm">
                <Plus size={14} />
                新增公司
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCompany ? '編輯公司' : '新增公司'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px]">公司代碼 *</Label>
                    <Input value={formData.companyCode} onChange={(e) => setFormData({ ...formData, companyCode: e.target.value.toUpperCase() })} placeholder="BWD" className="text-[13px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">BR No. *</Label>
                    <Input value={formData.brNo} onChange={(e) => setFormData({ ...formData, brNo: e.target.value })} placeholder="12345678-000-01-25-0" className="text-[13px]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">公司中文名稱 *</Label>
                  <Input value={formData.companyNameZh} onChange={(e) => setFormData({ ...formData, companyNameZh: e.target.value })} placeholder="志豐企業有限公司" className="text-[13px]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">公司英文名稱 *</Label>
                  <Input value={formData.companyNameEn} onChange={(e) => setFormData({ ...formData, companyNameEn: e.target.value })} placeholder="BWDesign Centre Limited" className="text-[13px]" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px]">銀行名稱</Label>
                    <Input value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} placeholder="恒生銀行" className="text-[13px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">銀行帳號</Label>
                    <Input value={formData.bankAccount} onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })} placeholder="024-123-456789-001" className="text-[13px]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px]">公司地址</Label>
                  <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="香港..." rows={2} className="text-[13px]" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[13px]">聯絡人</Label>
                    <Input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} placeholder="張先生" className="text-[13px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">電話</Label>
                    <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="+852..." className="text-[13px]" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[13px]">電郵</Label>
                    <Input value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} placeholder="info@..." className="text-[13px]" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
                  <Label className="text-[13px]">啟用公司</Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>取消</Button>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={!formData.companyCode || !formData.companyNameZh || !formData.companyNameEn}>
                    {editingCompany ? '保存' : '新增'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">活躍公司</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{activeCompanies.length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總品牌數</span>
          <span className="text-[22px] font-bold block mt-1">{brands.length}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總項目數</span>
          <span className="text-[22px] font-bold block mt-1">{totalProjects}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-4">
          <span className="text-[12px] font-medium text-muted-foreground">總預算</span>
          <span className="text-[22px] font-bold block mt-1">${(projects.reduce((s, p) => s + p.budgetTotal, 0) / 1000).toFixed(0)}K</span>
        </div>
      </div>

      {/* Card View */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companiesList.map(company => {
            const brandCount = getCompanyBrandCount(company.id);
            const activeProjects = getCompanyActiveProjects(company.id);
            const achievement = getCompanyYearPlanAchievement(company.id);

            return (
              <div
                key={company.id}
                className={cn(
                  'bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 hover:shadow-[0_4px_12px_rgba(0,20,40,0.1)] transition-all duration-200',
                  !company.isActive && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-md bg-teal-600 flex items-center justify-center text-white font-bold text-[13px]">
                      {company.companyCode}
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold">{company.companyNameZh}</h4>
                      <span className="text-[11px] text-muted-foreground">{company.companyNameEn}</span>
                    </div>
                  </div>
                  <button onClick={() => handleEdit(company)} className="p-1.5 rounded hover:bg-muted transition-colors">
                    <Edit2 size={14} className="text-muted-foreground" />
                  </button>
                </div>

                <div className="text-[11px] text-muted-foreground mb-3 space-y-0.5">
                  <div>BR No.: {company.brNo}</div>
                  <div>{company.bankName} | {company.bankAccount}</div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-t border-border/50">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Users size={11} />
                      <span className="text-[10px]">品牌</span>
                    </div>
                    <span className="text-[16px] font-bold text-[#0d1a2d]">{brandCount}</span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <FolderKanban size={11} />
                      <span className="text-[10px]">進行中</span>
                    </div>
                    <span className="text-[16px] font-bold text-teal-600">{activeProjects}</span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                      <Target size={11} />
                      <span className="text-[10px]">達成率</span>
                    </div>
                    <span className="text-[16px] font-bold">{achievement !== null ? `${achievement}%` : '-'}</span>
                  </div>
                </div>

                {achievement !== null && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', achievement >= 50 ? 'bg-teal-600' : 'bg-amber-500')} style={{ width: `${Math.min(achievement, 100)}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <Badge variant={company.isActive ? 'default' : 'secondary'} className={cn('text-[10px] h-5', company.isActive ? 'bg-teal-50 text-teal-700 hover:bg-teal-50' : '')}>
                    {company.isActive ? '活躍' : '已停用'}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司代碼</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司名稱</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">BR No.</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌數</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">進行中項目</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">達成率</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {companiesList.map(company => {
                const brandCount = getCompanyBrandCount(company.id);
                const activeProjects = getCompanyActiveProjects(company.id);
                const achievement = getCompanyYearPlanAchievement(company.id);
                return (
                  <tr key={company.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-bold">{company.companyCode}</td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium">{company.companyNameZh}</div>
                      <div className="text-[11px] text-muted-foreground">{company.companyNameEn}</div>
                    </td>
                    <td className="px-4 py-3 text-[12px]">{company.brNo}</td>
                    <td className="px-4 py-3 text-[13px] font-medium">{brandCount}</td>
                    <td className="px-4 py-3 text-[13px] font-medium text-teal-600">{activeProjects}</td>
                    <td className="px-4 py-3 text-[13px]">{achievement !== null ? `${achievement}%` : '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={company.isActive ? 'default' : 'secondary'} className={cn('text-[10px] h-5', company.isActive ? 'bg-teal-50 text-teal-700 hover:bg-teal-50' : '')}>
                        {company.isActive ? '活躍' : '已停用'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleEdit(company)} className="p-1.5 rounded hover:bg-muted transition-colors">
                        <Edit2 size={14} className="text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
