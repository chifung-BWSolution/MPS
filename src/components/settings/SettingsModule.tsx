import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Edit, Trash2, Shield, X, Plus, Save, FileText, UserCircle } from 'lucide-react';
import { CompanyManagementSettings } from './CompanyManagementSettings';
import { BrandManagementSettings } from './BrandManagementSettings';
import { CreditCardsSettings } from './CreditCardsSettings';
import { TermsConditionsSettings } from './TermsConditionsSettings';
import { StaffDirectory } from './StaffDirectory';
import { UserManagement } from './UserManagement';
import { TalentApplicationForm } from './TalentApplicationForm';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { canAccessSettings } from '@/lib/permissions';
import { useSystemOptions } from '@/hooks/useSystemOptions';
import { toast } from 'sonner';

export function SettingsModule({ subModule }: { subModule?: string }) {
  const { systemUser } = useAuth();
  const activeTab = subModule || 'profile';

  // Only the "個人設定" (profile) tab is open to everyone; the rest of
  // 系統設定 is restricted to roles mapped to 管理層 or above.
  if (activeTab !== 'profile' && !canAccessSettings(systemUser?.role)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">系統設定</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            此頁面僅限管理層或以上身份存取。
          </p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 text-[13px] text-muted-foreground">
          您目前的身份標籤沒有權限查看此頁面。如需存取，請聯絡系統管理員。
        </div>
      </div>
    );
  }

  const getTitle = () => {
    switch (activeTab) {
      case 'profile': return { title: '個人設定', subtitle: '查看個人資料。資料由 OTC2 同步，無法在此修改。' };
      case 'users': return { title: '用戶管理', subtitle: '從員工列表選擇員工加入系統，支援 Google 電郵登入。' };
      case 'companies': return { title: '公司管理', subtitle: '管理多間公司資料及銀行帳戶。' };
      case 'brands': return { title: '品牌管理', subtitle: '管理品牌，每個品牌歸屬於一間公司。' };
      case 'talent-form': return { title: '藝人表格', subtitle: '面試登記表範本，可在「新增藝人」自助填表流程中使用。' };
      case 'roles': return { title: '角色權限', subtitle: '查看及設定各角色的存取權限。' };
      case 'options': return { title: '選項設定', subtitle: '管理網站／系統建立表單的開發平台選項。' };
      case 'credit-cards': return { title: '信用卡管理', subtitle: '管理公司付款信用卡。' };
      case 'quotation-settings': return { title: '客戶報價設定', subtitle: '管理報價類型、預設服務項目及付款安排。' };
      case 'terms-conditions': return { title: '條款及細則管理', subtitle: '管理各報價類型的條款範本，報價時可選擇或編輯。' };
      case 'staff-directory': return { title: '員工列表', subtitle: '查看所有員工資料，資料來源：OTC2 staff_sync（同步至 staffs）。' };
      case 'login-logs': return { title: '登入紀錄', subtitle: '查看用戶登入歷史記錄。' };
      default: return { title: '個人設定', subtitle: '查看個人資料。資料由 OTC2 同步，無法在此修改。' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* Content */}
      {activeTab === 'companies' ? (
        <CompanyManagementSettings />
      ) : activeTab === 'brands' ? (
        <BrandManagementSettings />
      ) : activeTab === 'talent-form' ? (
        <TalentApplicationForm />
      ) : activeTab === 'quotation-settings' ? (
        <QuotationSettingsSection />
      ) : activeTab === 'terms-conditions' ? (
        <TermsConditionsSettings />
      ) : activeTab === 'staff-directory' ? (
        <StaffDirectory />
      ) : activeTab === 'users' ? (
        <UserManagement />
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'roles' && <RolesSection />}
          {activeTab === 'login-logs' && <LoginLogsSection />}
          {activeTab === 'options' && <OptionsSection />}
          {activeTab === 'credit-cards' && <CreditCardsSettings />}
        </div>
      )}
    </div>
  );
}

function ProfileSection() {
  // Extended role options including new roles
  const ALL_ROLES: { value: string; label: string; color: string; description: string }[] = [
    { value: 'super_admin', label: 'Super Admin', color: 'bg-red-50 text-red-700 border-red-200', description: '最高權限，可管理所有系統設定' },
    { value: 'system_dev', label: '系統開發', color: 'bg-violet-50 text-violet-700 border-violet-200', description: '系統開發及技術維護' },
    { value: 'company_admin', label: '公司行政', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', description: '公司層面行政管理' },
    { value: 'management', label: '管理層', color: 'bg-purple-50 text-purple-700 border-purple-200', description: '全模組存取，審批及報告' },
    { value: 'project_manager', label: '項目經理', color: 'bg-blue-50 text-blue-700 border-blue-200', description: '專案管理、任務分派' },
    { value: 'designer', label: '設計師', color: 'bg-pink-50 text-pink-700 border-pink-200', description: '影片製作、行銷管理' },
    { value: 'accountant', label: '會計', color: 'bg-amber-50 text-amber-700 border-amber-200', description: '財務管理、報告匯出' },
    { value: 'copywriter', label: '文案同事', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', description: '文章管理、社交媒體' },
    { value: 'video_editor', label: '影片剪輯', color: 'bg-orange-50 text-orange-700 border-orange-200', description: '影片製作、頻道管理' },
    { value: 'marketing', label: '市場推廣', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', description: 'SEO、付費廣告、社交媒體' },
  ];

  const { systemUser, session } = useAuth();

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    department: '',
    position: '',
    phone: '',
  });

  // Dynamically populate profile from authenticated user + staffs
  useEffect(() => {
    const loadProfile = async () => {
      const authEmail = systemUser?.email || systemUser?.google_email || session?.user?.email || '';
      const authName = systemUser?.display_name || session?.user?.user_metadata?.full_name || '';
      const authPosition = systemUser?.position || '';
      const authDepartment = systemUser?.department || '';
      
      let phone = systemUser?.phone || '';
      let position = authPosition;
      let department = authDepartment;
      let displayName = authName;

      console.log('[Settings:loadProfile] Starting. authEmail:', authEmail, '| systemUser.phone:', systemUser?.phone, '| staff_id:', systemUser?.staff_id);

      const PROFILE_TIMEOUT = 5000;
      const STAFFS_PROFILE_SELECT = 'display_name, full_name, position, work_phone, private_phone, profile_pic_url';

      const applyStaffRow = (staffRow: any) => {
        if (!staffRow) return;
        displayName = staffRow.full_name || staffRow.display_name || displayName;
        position = staffRow.position || position;
        if (!phone) phone = staffRow.work_phone || staffRow.private_phone || '';
        // department stays on users.department — never copy staffs.business_unit
      };

      if (systemUser?.staff_id) {
        try {
          const result = await Promise.race([
            supabase
              .from('staffs')
              .select(STAFFS_PROFILE_SELECT)
              .eq('id', systemUser.staff_id)
              .maybeSingle(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('staffs id lookup timeout')), PROFILE_TIMEOUT))
          ]);

          const { data: staffRow } = result as any;
          console.log('[Settings:loadProfile] staffs by id:', staffRow ? { work_phone: staffRow.work_phone, private_phone: staffRow.private_phone } : 'not found');
          applyStaffRow(staffRow);
        } catch (err) {
          console.warn('[Settings] Failed to fetch staffs by id:', err);
        }
      } else if (authEmail) {
        try {
          const result = await Promise.race([
            supabase
              .from('staffs')
              .select(STAFFS_PROFILE_SELECT)
              .ilike('work_email', authEmail)
              .limit(1)
              .maybeSingle(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('staffs work_email lookup timeout')), PROFILE_TIMEOUT))
          ]);

          const { data: staffByWorkEmail } = result as any;
          console.log('[Settings:loadProfile] staffs by work_email:', staffByWorkEmail ? { work_phone: staffByWorkEmail.work_phone, private_phone: staffByWorkEmail.private_phone } : 'not found');
          applyStaffRow(staffByWorkEmail);

          if (!phone) {
            const result2 = await Promise.race([
              supabase
                .from('staffs')
                .select(STAFFS_PROFILE_SELECT)
                .ilike('private_email', authEmail)
                .limit(1)
                .maybeSingle(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('staffs private_email lookup timeout')), PROFILE_TIMEOUT))
            ]);

            const { data: staffByPrivateEmail } = result2 as any;
            if (staffByPrivateEmail) {
              applyStaffRow(staffByPrivateEmail);
              console.log('[Settings:loadProfile] Found staff by private_email:', { phone, displayName });
            }
          }
        } catch (err) {
          console.warn('[Settings] Failed to fetch staffs by email:', err);
        }
      }

      console.log('[Settings:loadProfile] Final resolved phone:', phone || '(empty)');

      setProfile({
        name: displayName || authEmail || 'User',
        email: authEmail,
        department: department || '',
        position: position || '',
        phone: phone || '',
      });
    };

    loadProfile();
  }, [systemUser, session]);

  // Additional safety: if systemUser.phone gets enriched AFTER initial load, sync it
  useEffect(() => {
    if (systemUser?.phone && !profile.phone) {
      console.log('[Settings] Late phone enrichment detected from systemUser:', systemUser.phone);
      setProfile(prev => ({ ...prev, phone: systemUser.phone || prev.phone }));
    }
  }, [systemUser?.phone]);

  const getRoleInfo = (roleValue: string) => {
    return ALL_ROLES.find(r => r.value === roleValue);
  };

  const currentRole = systemUser?.role || '';
  const roleInfo = getRoleInfo(currentRole);

  const readOnlyFieldClass =
    'w-full px-3 py-2 border border-border rounded-md text-[13px] bg-muted/40 text-foreground cursor-default';

  return (
    <div className="space-y-8">
      {/* Personal Info */}
      <div className="space-y-5">
        <h3 className="text-[18px] font-bold flex items-center gap-2">
          <UserCircle size={20} className="text-teal-600" />
          個人資料
        </h3>
        <p className="text-[12px] text-muted-foreground">
          姓名、職位及電話來自 OTC2 staff_sync；部門來自登入資料。此頁僅供查看。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">姓名</label>
            <input readOnly tabIndex={-1} className={readOnlyFieldClass} value={profile.name} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">電郵地址</label>
            <input readOnly tabIndex={-1} className={readOnlyFieldClass} value={profile.email} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">職位</label>
            <input readOnly tabIndex={-1} className={readOnlyFieldClass} value={profile.position} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">部門</label>
            <input readOnly tabIndex={-1} className={readOnlyFieldClass} value={profile.department} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">聯絡電話</label>
            <input readOnly tabIndex={-1} className={readOnlyFieldClass} value={profile.phone} />
          </div>
        </div>
      </div>

      <div className="border-t border-border/50" />

      <div className="space-y-5">
        <h3 className="text-[18px] font-bold flex items-center gap-2">
          <Shield size={20} className="text-purple-600" />
          系統角色
        </h3>
        <p className="text-[12px] text-muted-foreground">
          角色由系統管理員在用戶管理設定，無法在此修改。
        </p>
        {roleInfo ? (
          <div className="border border-border/50 rounded-md px-4 py-3">
            <span className={cn('inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium border', roleInfo.color)}>
              {roleInfo.label}
            </span>
            <p className="text-[12px] text-muted-foreground mt-2">{roleInfo.description}</p>
          </div>
        ) : (
          <div className="border border-dashed border-border rounded-md px-4 py-3 text-[13px] text-muted-foreground">
            {currentRole || '尚未分配角色'}
          </div>
        )}
      </div>
    </div>
  );
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: boolean;
}

function UsersSection() {
  const [users, setUsers] = useState<UserItem[]>([
    { id: '1', name: '張偉明', email: 'wm.zhang@company.com', role: '管理層', department: 'Management', status: true },
    { id: '2', name: '李美玲', email: 'ml.lee@company.com', role: '項目經理', department: 'PM Team', status: true },
    { id: '3', name: '陳志強', email: 'zq.chen@company.com', role: '影片剪輯', department: 'Video', status: true },
    { id: '4', name: '王小明', email: 'xm.wang@company.com', role: '設計師', department: 'Design', status: true },
    { id: '5', name: '黃曉華', email: 'xh.huang@company.com', role: '文案同事', department: 'Content', status: true },
    { id: '6', name: '林嘉欣', email: 'jx.lin@company.com', role: '市場推廣', department: 'Marketing', status: true },
    { id: '7', name: '劉大偉', email: 'dw.liu@company.com', role: '會計', department: 'Finance', status: true },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  const handleAdd = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEdit = (user: UserItem) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleToggleStatus = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: !u.status } : u))
    );
  };

  const handleSave = (formData: Partial<UserItem>) => {
    if (editingUser) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...formData } : u))
      );
    } else {
      const newUser: UserItem = {
        id: `u${Date.now()}`,
        name: formData.name || '',
        email: formData.email || '',
        role: formData.role || '設計師',
        department: formData.department || '',
        status: true,
      };
      setUsers((prev) => [...prev, newUser]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (userId: string) => {
    if (confirm('確定要刪除此使用者嗎？')) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-bold">系統使用者</h3>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
        >
          <Plus size={12} /> 新增使用者
        </button>
      </div>
      <div className="border border-border/50 rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">姓名</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電郵</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">角色</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">部門</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{user.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-2.5">{user.role}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.department}</td>
                <td className="px-4 py-2.5">
                  <span
                    onClick={() => handleToggleStatus(user.id)}
                    className={cn(
                      'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer',
                      user.status ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {user.status ? '啟用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(user)} className="text-teal-600 hover:text-teal-700">
                      <Edit size={13} />
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="text-muted-foreground hover:text-rose-500">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Modal */}
      {isModalOpen && (
        <UserModal
          user={editingUser}
          onSave={handleSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function UserModal({ user, onSave, onClose }: { user: UserItem | null; onSave: (data: Partial<UserItem>) => void; onClose: () => void }) {
  const [formData, setFormData] = useState<Partial<UserItem>>({
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || '設計師',
    department: user?.department || '',
  });

  const roleOptions = ['管理層', '項目經理', '設計師', '會計', '文案同事', '影片剪輯', '市場推廣'];
  const deptOptions = ['Management', 'PM Team', 'Design', 'Video', 'Content', 'Marketing', 'Finance'];

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-[18px] font-bold">{user ? '編輯使用者' : '新增使用者'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">姓名 *</label>
            <input
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="輸入姓名"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">電郵地址 *</label>
            <input
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@company.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">角色 *</label>
              <select
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">部門 *</label>
              <select
                className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              >
                <option value="">選擇部門</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-border/50 shrink-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors duration-200">
            取消
          </button>
          <button
            onClick={() => onSave(formData)}
            disabled={!formData.name || !formData.email}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={13} /> {user ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesSection() {
  const roles = [
    { role: '管理層 (Management)', modules: '所有模組', permissions: '全部操作、審批、報告檢視、系統設定、人力成本報告' },
    { role: '項目經理 (PM)', modules: 'Dashboard、Day Report、Project、Website、Marketing、Video、Supplier、Quotation', permissions: '項目管理、網站管理、任務分配、審批日報' },
    { role: '設計師 (Designer)', modules: 'Dashboard、Day Report、Video、Marketing、Tools', permissions: '提交匯報、上傳內容、管理自己的任務' },
    { role: '會計 (Accountant)', modules: 'Dashboard、Finance、Report、Supplier', permissions: '財務管理、付款記錄、報告匯出' },
    { role: '文案同事 (Copywriter)', modules: 'Dashboard、Day Report、Articles、Social Posts、Marketing', permissions: '文章管理、社交媒體Post、工作匯報' },
    { role: '影片剪輯 (Video Editor)', modules: 'Dashboard、Day Report、Video、Video Channels', permissions: '影片中心、工作匯報' },
    { role: '市場推廣 (Marketing)', modules: 'Dashboard、Day Report、SEO、Paid Ads、Social Posts、Marketing', permissions: 'SEO升級、付費廣告、社交媒體' },
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-bold">角色權限說明</h3>
      <p className="text-[13px] text-muted-foreground">以下是系統內各角色的職責及可存取模組。</p>
      <div className="space-y-3">
        {roles.map((r) => (
          <div key={r.role} className="border border-border/50 rounded-md p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-teal-600" />
              <h4 className="text-[14px] font-bold">{r.role}</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
              <div>
                <span className="text-muted-foreground font-medium">可見模組：</span>
                <span>{r.modules}</span>
              </div>
              <div>
                <span className="text-muted-foreground font-medium">操作權限：</span>
                <span>{r.permissions}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginLogsSection() {
  const logs = [
    { name: '張偉明', email: 'wm.zhang@company.com', time: '2024-12-20 09:15:22' },
    { name: '李美玲', email: 'ml.lee@company.com', time: '2024-12-20 09:02:45' },
    { name: '陳志強', email: 'zq.chen@company.com', time: '2024-12-20 08:55:10' },
    { name: '王小明', email: 'xm.wang@company.com', time: '2024-12-19 17:30:00' },
    { name: '黃曉華', email: 'xh.huang@company.com', time: '2024-12-19 09:10:30' },
  ];

  return (
    <div className="space-y-5">
      <h3 className="text-[18px] font-bold">登入紀錄</h3>
      <p className="text-[13px] text-muted-foreground">最近 50 筆用戶登入記錄。</p>
      <div className="border border-border/50 rounded-md overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">用戶</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電郵</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">登入時間</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={i} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{log.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{log.email}</td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono text-[12px]">{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionsSection() {
  const { byCategory, loading, addOption, updateOption, deleteOption } = useSystemOptions();
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const items = byCategory('platform');

  const handleAdd = async () => {
    if (!newValue.trim()) return;
    const err = await addOption('platform', newValue);
    if (err) {
      toast.error('新增失敗：' + (err as any).message);
    } else {
      toast.success('已新增');
      setNewValue('');
    }
  };

  const handleSaveEdit = async () => {
    if (!editing || !editing.value.trim()) {
      setEditing(null);
      return;
    }
    const err = await updateOption(editing.id, editing.value);
    if (err) {
      toast.error('更新失敗：' + (err as any).message);
    } else {
      toast.success('已更新');
    }
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    const err = await deleteOption(id);
    if (err) {
      toast.error('刪除失敗：' + (err as any).message);
    } else {
      toast.success('已刪除');
    }
  };

  if (loading) {
    return <div className="text-[13px] text-muted-foreground">載入中...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-[18px] font-bold">開發平台選項</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 border border-border/50 rounded-md px-3 py-2 group">
            {editing?.id === item.id ? (
              <input
                className="text-[13px] border-b border-teal-600 outline-none w-24"
                value={editing.value}
                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                autoFocus
              />
            ) : (
              <>
                <span className="text-[13px]">{item.value}</span>
                <button onClick={() => setEditing({ id: item.id, value: item.value })} className="text-muted-foreground hover:text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Edit size={11} />
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={11} />
                </button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-1 border border-dashed border-teal-300 rounded-md px-3 py-2">
          <input
            className="text-[13px] outline-none w-20 placeholder:text-muted-foreground"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="新增..."
          />
          <button onClick={handleAdd} className="text-teal-600 hover:text-teal-700">
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== QUOTATION SETTINGS =====
interface QuotationType {
  id: string;
  name: string;
  nameEn: string;
  servicesCount: number;
  isActive: boolean;
}

function QuotationSettingsSection() {
  const [quotationTypes, setQuotationTypes] = useState<QuotationType[]>([
    { id: 'qt1', name: '網站設計', nameEn: 'Web Design', servicesCount: 6, isActive: true },
    { id: 'qt2', name: '系統設計', nameEn: 'System Design', servicesCount: 7, isActive: true },
    { id: 'qt3', name: '平面設計', nameEn: 'Graphic Design', servicesCount: 5, isActive: true },
    { id: 'qt4', name: '品牌設計', nameEn: 'Branding', servicesCount: 5, isActive: true },
    { id: 'qt5', name: '影片製作', nameEn: 'Video Production', servicesCount: 5, isActive: true },
    { id: 'qt6', name: 'SEO升級', nameEn: 'SEO Upgrade', servicesCount: 5, isActive: true },
    { id: 'qt7', name: '行銷推廣', nameEn: 'Marketing Campaign', servicesCount: 5, isActive: true },
    { id: 'qt8', name: '活動策劃', nameEn: 'Event Planning', servicesCount: 5, isActive: true },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<QuotationType | null>(null);

  const handleAdd = () => {
    setEditingType(null);
    setIsModalOpen(true);
  };

  const handleEdit = (qt: QuotationType) => {
    setEditingType(qt);
    setIsModalOpen(true);
  };

  const handleSave = (formData: { name: string; nameEn: string }) => {
    if (editingType) {
      setQuotationTypes(prev => prev.map(qt =>
        qt.id === editingType.id ? { ...qt, name: formData.name, nameEn: formData.nameEn } : qt
      ));
    } else {
      const newType: QuotationType = {
        id: `qt${Date.now()}`,
        name: formData.name,
        nameEn: formData.nameEn,
        servicesCount: 0,
        isActive: true,
      };
      setQuotationTypes(prev => [...prev, newType]);
    }
    setIsModalOpen(false);
    setEditingType(null);
  };

  const handleToggleActive = (qtId: string) => {
    setQuotationTypes(prev => prev.map(qt =>
      qt.id === qtId ? { ...qt, isActive: !qt.isActive } : qt
    ));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-muted-foreground">管理報價類型及其預設服務項目、T&C、付款安排。</p>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
        >
          <Plus size={14} />新增報價類型
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quotationTypes.map(type => (
          <div key={type.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 rounded-md flex items-center justify-center">
                  <FileText size={18} className="text-teal-600" />
                </div>
                <div>
                  <h4 className="text-[14px] font-bold">{type.name}</h4>
                  <span className="text-[11px] text-muted-foreground">{type.nameEn}</span>
                </div>
              </div>
              <span
                onClick={() => handleToggleActive(type.id)}
                className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer', type.isActive ? 'bg-teal-50 text-teal-700 hover:bg-teal-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100')}
              >
                {type.isActive ? '啟用' : '停用'}
              </span>
            </div>
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">預設服務項目</span>
                <span className="font-medium">{type.servicesCount} 項</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(type)}
                className="flex-1 px-3 py-1.5 text-[12px] font-medium border border-border rounded hover:bg-muted transition-colors"
              >
                <Edit size={10} className="inline mr-1" />編輯
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Quotation Type Modal */}
      {isModalOpen && (
        <QuotationTypeModal
          editingType={editingType}
          onSave={handleSave}
          onClose={() => { setIsModalOpen(false); setEditingType(null); }}
        />
      )}
    </div>
  );
}

function QuotationTypeModal({ editingType, onSave, onClose }: {
  editingType: QuotationType | null;
  onSave: (data: { name: string; nameEn: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editingType?.name || '');
  const [nameEn, setNameEn] = useState(editingType?.nameEn || '');

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="text-[18px] font-bold">{editingType ? '編輯報價類型' : '新增報價類型'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">中文名稱 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder="如：網站設計"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">英文名稱 *</label>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              placeholder="如：Web Design"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-3 border-t border-border/50 shrink-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors">取消</button>
          <button
            onClick={() => { if (name.trim() && nameEn.trim()) onSave({ name: name.trim(), nameEn: nameEn.trim() }); }}
            disabled={!name.trim() || !nameEn.trim()}
            className="px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingType ? '儲存' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}
