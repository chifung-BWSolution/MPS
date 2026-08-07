import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type BubbleStaff, toBubbleCdnUrl } from '@/types/bubble';
import {
  Search, Plus, Edit, Trash2, Shield, Users, UserPlus, UserCheck,
  Mail, X, Save, RefreshCw, Chrome, CheckCircle2, XCircle, Clock,
  AlertTriangle, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';

// Role labels matching PRD
const ROLE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'system_dev', label: '系統開發', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { value: 'company_admin', label: '公司行政', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'management', label: '管理層', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'project_manager', label: '項目經理', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'designer', label: '設計師', color: 'bg-pink-50 text-pink-700 border-pink-200' },
  { value: 'accountant', label: '會計', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'copywriter', label: '文案同事', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'video_editor', label: '影片剪輯', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'marketing', label: '市場推廣', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
];

const DEPT_OPTIONS = ['Management', 'PM Team', 'Design', 'Video', 'Content', 'Marketing', 'Finance'];

/** UI shape for whitelist users (backed by public.users). */
interface SystemUser {
  id: string;
  bubble_staff_id: string; // maps to users.staff_id
  display_name: string;
  email: string;
  role: string; // maps to users.role_tag
  department: string | null;
  position: string | null;
  profile_pic_url: string | null;
  is_active: boolean; // maps to users.system_status === 'active'
  google_email: string | null;
  last_login_at: string | null;
  invited_at: string;
  created_at: string;
}

function mapUsersRow(row: any): SystemUser {
  return {
    id: row.id,
    bubble_staff_id: row.staff_id,
    display_name: row.display_name || row.email || row.staff_id || '',
    email: row.email || '',
    role: row.role_tag || 'staff',
    department: row.department || null,
    position: null,
    profile_pic_url: null,
    is_active: (row.system_status || '').toLowerCase() === 'active',
    google_email: row.google_email || null,
    last_login_at: null,
    invited_at: row.created_at || '',
    created_at: row.created_at || '',
  };
}

export function UserManagement() {
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // Fetch whitelist users from public.users
  const fetchSystemUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSystemUsers((data || []).map(mapUsersRow));
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
      toast.error('無法載入系統使用者', { description: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemUsers();
  }, [fetchSystemUsers]);

  // Add staff as system user
  const handleAddStaff = async (staff: BubbleStaff, role: string, googleEmail?: string) => {
    try {
      const displayName = staff['Display Name'] || staff['Full Name'] || '';
      const workEmail = staff['Work Email'] || '';
      const resolvedGoogleEmail = googleEmail || workEmail || null;

      const { data, error } = await supabase
        .from('users')
        .upsert({
          staff_id: staff._id,
          display_name: displayName,
          email: workEmail,
          role_tag: role,
          department: staff['N_Team'] || null,
          google_email: resolvedGoogleEmail,
          classification: 'system_user',
          system_status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'staff_id' })
        .select()
        .single();

      if (error) throw error;
      const mapped = mapUsersRow(data);
      setSystemUsers(prev => {
        const without = prev.filter(u => u.bubble_staff_id !== mapped.bubble_staff_id);
        return [mapped, ...without];
      });
      toast.success(`已加入「${displayName}」為系統使用者`, {
        description: `角色: ${ROLE_OPTIONS.find(r => r.value === role)?.label || role}`,
      });
      setShowStaffPicker(false);
    } catch (err: any) {
      console.error('Failed to add user:', err);
      if (err.message?.includes('duplicate')) {
        toast.error('此員工已經是系統使用者');
      } else {
        toast.error('新增失敗', { description: err.message });
      }
    }
  };

  // Update whitelist user
  const handleUpdateUser = async (userId: string, updates: Partial<SystemUser>) => {
    try {
      const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.display_name !== undefined) dbUpdates.display_name = updates.display_name;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.google_email !== undefined) dbUpdates.google_email = updates.google_email;
      if (updates.role !== undefined) dbUpdates.role_tag = updates.role;
      if (updates.department !== undefined) dbUpdates.department = updates.department;
      if (updates.is_active !== undefined) {
        dbUpdates.system_status = updates.is_active ? 'active' : 'inactive';
      }

      const { data, error } = await supabase
        .from('users')
        .update(dbUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      setSystemUsers(prev => prev.map(u => u.id === userId ? mapUsersRow(data) : u));
      toast.success('已更新使用者資料');
      setShowEditModal(false);
      setEditingUser(null);
    } catch (err: any) {
      toast.error('更新失敗', { description: err.message });
    }
  };

  // Toggle user active status
  const handleToggleActive = async (user: SystemUser) => {
    const newStatus = !user.is_active;
    try {
      const { error } = await supabase
        .from('users')
        .update({
          system_status: newStatus ? 'active' : 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      setSystemUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u));
      toast.success(newStatus ? `已啟用「${user.display_name}」` : `已停用「${user.display_name}」`);
    } catch (err: any) {
      toast.error('操作失敗', { description: err.message });
    }
  };

  // Remove system user
  const handleRemoveUser = async (user: SystemUser) => {
    if (!confirm(`確定要移除「${user.display_name}」的系統存取權限嗎？\n此操作不會影響員工列表中的資料。`)) return;
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (error) throw error;
      setSystemUsers(prev => prev.filter(u => u.id !== user.id));
      toast.success(`已移除「${user.display_name}」的系統存取權限`);
    } catch (err: any) {
      toast.error('刪除失敗', { description: err.message });
    }
  };

  // Filter users
  const filteredUsers = systemUsers.filter(u => {
    const matchSearch = !searchTerm ||
      u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.google_email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && u.is_active) ||
      (filterStatus === 'inactive' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const activeCount = systemUsers.filter(u => u.is_active).length;
  const inactiveCount = systemUsers.filter(u => !u.is_active).length;

  return (
    <div className="space-y-5">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-border/50 rounded-md p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-teal-50 flex items-center justify-center">
            <Users size={18} className="text-teal-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">總使用者</p>
            <p className="text-[20px] font-bold">{systemUsers.length}</p>
          </div>
        </div>
        <div className="bg-white border border-border/50 rounded-md p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-green-50 flex items-center justify-center">
            <UserCheck size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">啟用中</p>
            <p className="text-[20px] font-bold">{activeCount}</p>
          </div>
        </div>
        <div className="bg-white border border-border/50 rounded-md p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-amber-50 flex items-center justify-center">
            <XCircle size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">已停用</p>
            <p className="text-[20px] font-bold">{inactiveCount}</p>
          </div>
        </div>
        <div className="bg-white border border-border/50 rounded-md p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-blue-50 flex items-center justify-center">
            <Chrome size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Google 登入</p>
            <p className="text-[20px] font-bold">{systemUsers.filter(u => u.google_email).length}</p>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start gap-3">
        <Shield size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-[12px] text-blue-800">
          <p className="font-medium mb-1">用戶管理說明</p>
          <p className="text-blue-700">
            從「<span className="font-medium">員工列表</span>」（OTC2 同步之在職員工）中選擇員工加入系統使用者名單。
            加入後，該員工可使用 <span className="font-medium">Google 電郵登入</span> 本系統。
            系統會根據所分配的「<span className="font-medium">身份標籤</span>」決定該使用者可存取的功能模組。
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 w-full sm:max-w-[300px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋姓名、電郵..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">所有角色</option>
          {ROLE_OPTIONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
        >
          <option value="all">所有狀態</option>
          <option value="active">啟用中</option>
          <option value="inactive">已停用</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchSystemUsers}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-[12px] font-medium hover:bg-muted/50 transition-colors"
          >
            <RefreshCw size={12} /> 重新整理
          </button>
          <button
            onClick={() => setShowStaffPicker(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-bold hover:bg-teal-700 transition-colors shadow-sm"
          >
            <UserPlus size={14} /> 從員工列表加入
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-border/50 rounded-md overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-muted-foreground" />
            <span className="ml-2 text-[13px] text-muted-foreground">載入中...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users size={32} className="mb-2 opacity-50" />
            <p className="text-[13px]">{systemUsers.length === 0 ? '尚未新增任何系統使用者' : '沒有符合篩選條件的使用者'}</p>
            {systemUsers.length === 0 && (
              <button
                onClick={() => setShowStaffPicker(true)}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[12px] font-medium hover:bg-teal-700 transition-colors"
              >
                <UserPlus size={13} /> 從員工列表加入使用者
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">使用者</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Google 登入電郵</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">角色</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">部門</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">最後登入</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const roleInfo = ROLE_OPTIONS.find(r => r.value === user.role);
                return (
                  <tr key={user.id} className="border-t border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {user.profile_pic_url ? (
                          <img src={user.profile_pic_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-700 text-[12px] font-medium">
                            {user.display_name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-[13px]">{user.display_name}</p>
                          <p className="text-[11px] text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <InlineGoogleEmailEditor
                        userId={user.id}
                        currentValue={user.google_email || ''}
                        onSave={(newEmail) => {
                          handleUpdateUser(user.id, { google_email: newEmail });
                        }}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {roleInfo && (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border', roleInfo.color)}>
                          {roleInfo.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{user.department || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span
                        onClick={() => handleToggleActive(user)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors',
                          user.is_active ? 'bg-teal-50 text-teal-700 hover:bg-teal-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        )}
                      >
                        {user.is_active ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                        {user.is_active ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                      {user.last_login_at ? (
                        <div className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(user.last_login_at).toLocaleString('zh-HK', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      ) : (
                        <span className="text-gray-400">從未登入</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditingUser(user); setShowEditModal(true); }}
                          className="text-teal-600 hover:text-teal-700"
                          title="編輯"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => handleRemoveUser(user)}
                          className="text-muted-foreground hover:text-rose-500"
                          title="移除"
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
        )}
      </div>

      {/* Google Login Info */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-md p-5">
        <div className="flex items-start gap-3">
          <Chrome size={20} className="text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-[14px] font-bold text-blue-900 mb-1">Google 電郵登入</h4>
            <p className="text-[12px] text-blue-800 mb-3">
              系統使用者可透過 Google OAuth 登入。只有在上方列表中已登記的 Google 電郵才能成功登入本系統。
              登入時系統會自動比對電郵地址，並根據分配的角色給予相應的存取權限。
            </p>
            <div className="flex items-center gap-4 text-[11px] text-blue-700">
              <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-600" /> 安全的 OAuth 2.0</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-600" /> 無需密碼</span>
              <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-green-600" /> 自動登入紀錄</span>
            </div>
          </div>
        </div>
      </div>

      {/* Staff Picker Modal */}
      {showStaffPicker && (
        <StaffPickerModal
          existingUsers={systemUsers}
          onAdd={handleAddStaff}
          onClose={() => setShowStaffPicker(false)}
        />
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <EditUserModal
          user={editingUser}
          onSave={(updates) => handleUpdateUser(editingUser.id, updates)}
          onClose={() => { setShowEditModal(false); setEditingUser(null); }}
        />
      )}
    </div>
  );
}

// ========================================
// Staff Picker Modal - Select from 員工列表
// ========================================

function StaffPickerModal({
  existingUsers,
  onAdd,
  onClose,
}: {
  existingUsers: SystemUser[];
  onAdd: (staff: BubbleStaff, role: string, googleEmail?: string) => void;
  onClose: () => void;
}) {
  const [staffList, setStaffList] = useState<BubbleStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<BubbleStaff | null>(null);
  const [selectedRole, setSelectedRole] = useState('designer');
  const [googleEmail, setGoogleEmail] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('staffs')
          .select('*')
          .eq('status', 'active')
          .order('display_name', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const converted: BubbleStaff[] = (data || []).map((row: any) => ({
          _id: row.bubble_staff_id,
          'Display Name': row.display_name || '',
          'Full Name': row.full_name || undefined,
          'Position': row.position || '',
          'O_User Role': row.user_role || '',
          'O_Status': 'Active',
          'O_Status_Text': 'Active',
          'Work Email': row.work_email || '',
          'Private Email': row.private_email || undefined,
          'Work Phone': row.work_phone ? Number(row.work_phone) || undefined : undefined,
          'Private Phone': row.private_phone ? Number(row.private_phone) || undefined : undefined,
          'O_Base Location': row.base_location || undefined,
          'N_BU': row.business_unit || undefined,
          'N_Team': row.team_id || undefined,
          'Profile Pic': row.profile_pic_url || undefined,
          'Created By': '',
          'Created Date': row.created_at || '',
          'Modified Date': row.updated_at || '',
        }));
        setStaffList(converted);
      } catch (err: any) {
        console.warn('[UserManagement] staff_directory load failed:', err?.message || err);
        if (!cancelled) setStaffList([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Filter out already-added staff
  const existingBubbleIds = new Set(existingUsers.map(u => u.bubble_staff_id));
  const availableStaff = staffList.filter(s => {
    if (existingBubbleIds.has(s._id)) return false;
    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (s['Display Name'] || '').toLowerCase().includes(term) ||
        (s['Full Name'] || '').toLowerCase().includes(term) ||
        (s['Work Email'] || '').toLowerCase().includes(term) ||
        (s['Position'] || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleConfirmAdd = () => {
    if (!selectedStaff) return;
    onAdd(selectedStaff, selectedRole, googleEmail || selectedStaff['Work Email']);
  };

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[700px] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h3 className="text-[18px] font-bold">從員工列表加入使用者</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">選擇要加入系統的員工，設定角色及 Google 登入電郵</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-5 gap-4">
          {!selectedStaff ? (
            <>
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜尋員工姓名、電郵、職位..."
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              {/* Staff List */}
              <div className="flex-1 overflow-y-auto border border-border/50 rounded-md divide-y divide-border/50">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw size={16} className="animate-spin text-muted-foreground" />
                    <span className="ml-2 text-[12px] text-muted-foreground">載入員工資料中...</span>
                  </div>
                ) : availableStaff.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Users size={24} className="mb-2 opacity-50" />
                    <p className="text-[12px]">{searchTerm ? '沒有符合的員工' : '所有在職員工已加入系統（請先在員工列表從 OTC2 同步）'}</p>
                  </div>
                ) : (
                  availableStaff.map(staff => (
                    <button
                      key={staff._id}
                      onClick={() => {
                        setSelectedStaff(staff);
                        setGoogleEmail(staff['Work Email'] || '');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      {staff['Profile Pic'] ? (
                        <img src={toBubbleCdnUrl(staff['Profile Pic'])} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-teal-700 text-[12px] font-medium">
                          {(staff['Display Name'] || '?').charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[13px] truncate">{staff['Display Name']}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {staff['Position']} {staff['N_Team'] ? `· ${staff['N_Team']}` : ''}
                        </p>
                      </div>
                      <div className="text-[11px] text-muted-foreground shrink-0">
                        {staff['Work Email'] || '無電郵'}
                      </div>
                      <UserPlus size={14} className="text-teal-600 shrink-0" />
                    </button>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                顯示 {availableStaff.length} 位可加入的在職員工（已排除已加入系統的 {existingUsers.length} 位員工）
              </p>
            </>
          ) : (
            /* Step 2: Configure role & email */
            <div className="space-y-5">
              {/* Selected Staff Info */}
              <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-md">
                {selectedStaff['Profile Pic'] ? (
                  <img src={toBubbleCdnUrl(selectedStaff['Profile Pic'])} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-[16px] font-bold">
                    {(selectedStaff['Display Name'] || '?').charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-bold text-[15px]">{selectedStaff['Display Name']}</p>
                  <p className="text-[12px] text-teal-700">{selectedStaff['Position']} · {selectedStaff['Work Email']}</p>
                </div>
                <button
                  onClick={() => setSelectedStaff(null)}
                  className="ml-auto text-[12px] text-teal-700 hover:text-teal-900 underline"
                >
                  更換員工
                </button>
              </div>

              {/* Role Selection */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-2">系統角色 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(role => (
                    <button
                      key={role.value}
                      onClick={() => setSelectedRole(role.value)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-md border text-[12px] font-medium transition-colors text-left',
                        selectedRole === role.value
                          ? 'border-teal-500 bg-teal-50 text-teal-800 ring-1 ring-teal-500'
                          : 'border-border hover:bg-muted/30'
                      )}
                    >
                      <Shield size={12} className={selectedRole === role.value ? 'text-teal-600' : 'text-muted-foreground'} />
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Google Email */}
              <div>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">
                  Google 登入電郵 *
                </label>
                <p className="text-[11px] text-muted-foreground mb-2">
                  此電郵將作為 Google OAuth 登入的認證電郵，必須是有效的 Google 帳號（Gmail 或 Google Workspace）
                </p>
                <div className="relative">
                  <Chrome size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                  <input
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    placeholder="user@gmail.com 或 user@company.com"
                    className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              {/* Warning if no email */}
              {!googleEmail && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-800">請輸入 Google 登入電郵，否則該使用者將無法登入系統。</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors"
          >
            取消
          </button>
          {selectedStaff && (
            <button
              onClick={handleConfirmAdd}
              disabled={!googleEmail}
              className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-bold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={13} /> 確認加入系統
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================
// Inline Google Email Editor
// ========================================

function InlineGoogleEmailEditor({
  userId,
  currentValue,
  onSave,
}: {
  userId: string;
  currentValue: string;
  onSave: (newEmail: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue);

  useEffect(() => {
    setValue(currentValue);
  }, [currentValue]);

  const handleSave = () => {
    if (value.trim() !== currentValue) {
      onSave(value.trim());
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(currentValue);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Chrome size={12} className="text-blue-500 shrink-0" />
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full min-w-[160px] px-1.5 py-0.5 border border-teal-400 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
          placeholder="輸入 Google 登入電郵"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer group hover:bg-blue-50 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={() => setEditing(true)}
      title="點擊編輯 Google 登入電郵"
    >
      <Chrome size={12} className="text-blue-500" />
      <span className="text-[12px] text-muted-foreground group-hover:text-blue-700">
        {currentValue || <span className="italic text-gray-400">點擊設定</span>}
      </span>
      <Edit size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}


function EditUserModal({
  user,
  onSave,
  onClose,
}: {
  user: SystemUser;
  onSave: (updates: Partial<SystemUser>) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    display_name: user.display_name,
    role: user.role,
    department: user.department || '',
    google_email: user.google_email || '',
    is_active: user.is_active,
  });

  return (
    <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[500px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-bold">編輯使用者</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name (readonly - from Bubble) */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">顯示名稱</label>
            <input
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] bg-muted/30"
              value={formData.display_name}
              readOnly
            />
            <p className="text-[10px] text-muted-foreground mt-1">名稱來自員工列表，不可在此修改</p>
          </div>

          {/* Role */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">系統角色 *</label>
            <select
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">部門</label>
            <select
              className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            >
              <option value="">選擇部門</option>
              {DEPT_OPTIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Google Email */}
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Google 登入電郵 *</label>
            <div className="relative">
              <Chrome size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
              <input
                type="email"
                className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600"
                value={formData.google_email}
                onChange={(e) => setFormData({ ...formData, google_email: e.target.value })}
                placeholder="Google 帳號電郵"
              />
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
            <div>
              <p className="text-[12px] font-medium">帳號狀態</p>
              <p className="text-[11px] text-muted-foreground">停用後該使用者將無法登入系統</p>
            </div>
            <button
              onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                formData.is_active ? 'bg-teal-600' : 'bg-gray-300'
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                formData.is_active ? 'translate-x-6' : 'translate-x-1'
              )} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border/50">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors">
            取消
          </button>
          <button
            onClick={() => onSave(formData)}
            disabled={!formData.google_email}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={13} /> 儲存
          </button>
        </div>
      </div>
    </div>
  );
}
