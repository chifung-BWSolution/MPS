import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Search, RefreshCw, Users, Phone, Mail, Building2, Briefcase, UserCheck, UserX, Tag, ChevronDown, Shield, Ban, CheckSquare, Square, MinusSquare, CloudDownload, CheckCircle2, AlertCircle, Loader2, ArrowUpDown, Database, Save, Chrome, Edit } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { invokeProvisionStaffAuth } from '@/lib/provisionStaffAuthApi';

const STAFF_SELECT =
  'id, display_name, full_name, chinese_name, position, user_role, status, work_email, private_email, work_phone, private_phone, profile_pic_url, base_location, team_name, company_list_id, brand_list_id, entry_date, termination_date';

/** Local staffs row — identity is staffs.id (uuid). Never key UI by otc_staff_sync_id. */
interface StaffRow {
  id: string;
  display_name: string | null;
  full_name: string | null;
  chinese_name: string | null;
  position: string | null;
  user_role: string | null;
  status: string | null;
  work_email: string | null;
  private_email: string | null;
  work_phone: string | null;
  private_phone: string | null;
  profile_pic_url: string | null;
  base_location: string | null;
  team_name: string | null;
  company_list_id: string | null;
  brand_list_id: string | null;
  entry_date: string | null;
  termination_date: string | null;
}

/** Use profile_pic_url as-is when it is already an absolute http(s) URL. */
function staffAvatarSrc(url?: string | null): string | undefined {
  const trimmed = (url || '').trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function isActiveStaff(staff: StaffRow): boolean {
  return (staff.status || '').toLowerCase() === 'active' && !staff.termination_date;
}

// Role labels (身份標籤) matching the PRD roles - determines page access
const ROLE_LABELS: Record<string, { label: string; color: string; modules: string }> = {
  super_admin: { label: 'Super Admin', color: 'bg-red-50 text-red-700 border-red-200', modules: '所有模組 + 系統設定' },
  system_dev: { label: '系統開發', color: 'bg-violet-50 text-violet-700 border-violet-200', modules: '所有模組 + 開發工具' },
  company_admin: { label: '公司行政', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', modules: '公司管理、財務、報告、設定' },
  management: { label: '管理層', color: 'bg-purple-50 text-purple-700 border-purple-200', modules: '所有模組' },
  project_manager: { label: '項目經理', color: 'bg-blue-50 text-blue-700 border-blue-200', modules: '首頁、工作匯報、專案策劃、網站管理、行銷管理、影片製作、供應商、客戶報價' },
  designer: { label: '設計師', color: 'bg-pink-50 text-pink-700 border-pink-200', modules: '首頁、工作匯報、影片製作、行銷管理、工具中心' },
  accountant: { label: '會計', color: 'bg-amber-50 text-amber-700 border-amber-200', modules: '首頁、財務管理、報告、供應商' },
  copywriter: { label: '文案同事', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', modules: '首頁、工作匯報、網站管理(文章)、行銷管理(社交媒體)' },
  video_editor: { label: '影片剪輯', color: 'bg-orange-50 text-orange-700 border-orange-200', modules: '首頁、工作匯報、影片製作、影片頻道' },
  marketing: { label: '市場推廣', color: 'bg-cyan-50 text-cyan-700 border-cyan-200', modules: '首頁、工作匯報、SEO、付費廣告、社交媒體、行銷管理' },
};

type StaffClassification = 'system_user' | 'other_staff' | 'disabled';

interface StaffUserConfig {
  staffId: string; // staffs.id
  classification: StaffClassification;
  roleTag?: string; // key of ROLE_LABELS
}

export function StaffDirectory() {
  // Primary data source: staffs (OTC2 staff_sync replica)
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFromSupabase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('staffs')
        .select(STAFF_SELECT)
        .order('display_name', { ascending: true });

      if (fetchErr) {
        console.warn('[StaffDirectory] Supabase fetch error:', fetchErr.message);
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      setStaffList((data || []) as StaffRow[]);
    } catch (err: any) {
      console.warn('[StaffDirectory] Supabase fetch error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFromSupabase();
  }, [fetchFromSupabase]);

  const refetch = useCallback(() => {
    fetchFromSupabase();
  }, [fetchFromSupabase]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterClassification, setFilterClassification] = useState<'all' | 'system_user' | 'other_staff' | 'disabled'>('all');

  // Staff user configs — persisted in Supabase user_info table
  const [userConfigs, setUserConfigs] = useState<StaffUserConfig[]>([]);
  const [userConfigsLoaded, setUserConfigsLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());

  // Login email map: staffs.id -> users.email (inline editable)
  const [googleEmailMap, setGoogleEmailMap] = useState<Record<string, string>>({});

  const [systemUsersCache, setSystemUsersCache] = useState<{ staff_id: string; email: string | null }[]>([]);

  const loadSystemUsersCache = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('users')
        .select('staff_id, email');
      if (data) {
        setSystemUsersCache(data);
      }
    } catch (err) {
      console.warn('[StaffDirectory] system_users cache load error:', err);
    }
  }, []);

  useEffect(() => {
    loadSystemUsersCache();
  }, [loadSystemUsersCache]);

  // Load user_info from Supabase on mount — users.staff_id is already staffs.id
  const loadUserInfo = useCallback(async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('users')
        .select('*');

      if (fetchErr) {
        console.warn('[StaffDirectory] user_info fetch error:', fetchErr.message);
        return;
      }

      if (data && data.length > 0) {
        const configs: StaffUserConfig[] = data.map((row: any) => ({
          staffId: row.staff_id,
          classification: 'system_user' as StaffClassification,
          roleTag: row.role_tag || undefined,
        }));
        setUserConfigs(configs);

        const emailMap: Record<string, string> = {};
        data.forEach((row: any) => {
          if (row.staff_id && row.email) {
            emailMap[row.staff_id] = row.email;
          }
        });
        setGoogleEmailMap(prev => ({ ...prev, ...emailMap }));
      }
      setUserConfigsLoaded(true);
    } catch (err: any) {
      console.warn('[StaffDirectory] user_info load error:', err.message);
      setUserConfigsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadUserInfo();
  }, [loadUserInfo]);

  // Save all user configs to Supabase users table — keyed by staffs.id
  const handleSaveUserConfigs = async () => {
    setSaving(true);
    setSaveResult(null);

    try {
      const records = userConfigs
        .filter(c => c.classification === 'system_user')
        .map(c => {
          const staffEntry = staffList.find(s => s.id === c.staffId);
          const workEmail = staffEntry?.work_email || null;
          const sysUser = systemUsersCache.find(su => su.staff_id === c.staffId);
          const loginEmail = googleEmailMap[c.staffId] || sysUser?.email || workEmail;

          return {
            staff_id: c.staffId,
            role_tag: c.roleTag || null,
            email: loginEmail,
            updated_at: new Date().toISOString(),
          };
        });

      const otherStaffUuids = userConfigs
        .filter(c => c.classification === 'other_staff' || c.classification === 'disabled')
        .map(c => c.staffId)
        .filter((id): id is string => !!id);

      // Delete records that are back to "other_staff"
      if (otherStaffUuids.length > 0) {
        for (const staffId of otherStaffUuids) {
          try {
            await invokeProvisionStaffAuth({ mode: 'disable', staffId });
          } catch (provisionErr) {
            console.warn('[StaffDirectory] disable Auth user failed:', provisionErr);
          }
        }
        const { error: deleteErr } = await supabase
          .from('users')
          .delete()
          .in('staff_id', otherStaffUuids);

        if (deleteErr) {
          console.warn('[StaffDirectory] Delete other_staff error:', deleteErr.message);
        }
      }

      // Upsert system_user and disabled records
      if (records.length > 0) {
        const { error: upsertErr } = await supabase
          .from('users')
          .upsert(records, { onConflict: 'staff_id' });

        if (upsertErr) {
          setSaveResult({ success: false, message: `儲存失敗: ${upsertErr.message}` });
          setSaving(false);
          return;
        }
        for (const rec of records) {
          try {
            await invokeProvisionStaffAuth({ mode: 'provision', staffId: rec.staff_id });
          } catch (provisionErr) {
            console.warn('[StaffDirectory] provision Auth user failed:', provisionErr);
          }
        }
      }

      setSaveResult({ success: true, message: '設定已成功儲存！' });
      setHasUnsavedChanges(false);
      console.log('[StaffDirectory] ✅ All user configs saved successfully');

      // Auto-hide success message after 4 seconds
      setTimeout(() => setSaveResult(null), 4000);
    } catch (err: any) {
      setSaveResult({ success: false, message: `儲存失敗: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  // Handle google email change for a staff member
  const handleGoogleEmailChange = (staffId: string, email: string) => {
    setGoogleEmailMap(prev => ({ ...prev, [staffId]: email }));
    setHasUnsavedChanges(true);
  };

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    environment?: string;
    api_url?: string;
    full_refresh?: boolean;
    stats?: { total: number; created: number; updated: number; active: number; inactive: number; teams: number };
    synced_at?: string;
  } | null>(null);

  const handleSyncFromOtc2 = async () => {
    setSyncing(true);
    setSyncResult(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setSyncResult({ success: false, message: 'Missing Supabase configuration' });
      setSyncing(false);
      return;
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/supabase-functions-sync-otc2-staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      if (!response.ok) {
        setSyncResult({ success: false, message: data.error || `Sync failed (${response.status})` });
      } else {
        setSyncResult(data);
        await fetchFromSupabase();
        await loadUserInfo();
      }
    } catch (err: any) {
      setSyncResult({ success: false, message: `Network error: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const teams = Array.from(
    new Set(staffList.map((s) => s.team_name).filter(Boolean))
  ) as string[];

  const isTerminated = (staff: StaffRow): boolean => !isActiveStaff(staff);

  // Helpers - inactive / terminated staff auto-assigned to 'disabled'
  const getStaffClassification = (staffId: string): StaffClassification => {
    const staff = staffList.find(s => s.id === staffId);
    if (staff && isTerminated(staff)) {
      return 'disabled';
    }
    const config = userConfigs.find(c => c.staffId === staffId);
    return config?.classification || 'other_staff';
  };

  const activeCount = useMemo(() => {
    return staffList.filter((s) => isActiveStaff(s)).length;
  }, [staffList]);

  const systemUserCount = useMemo(() => {
    return staffList.filter(s => getStaffClassification(s.id) === 'system_user').length;
  }, [userConfigs, staffList]);

  const disabledCount = useMemo(() => {
    return staffList.filter(s => isTerminated(s)).length;
  }, [staffList]);

  const getStaffRole = (staffId: string): string | undefined => {
    const config = userConfigs.find(c => c.staffId === staffId);
    return config?.roleTag;
  };

  const handleSetClassification = (staffId: string, classification: StaffClassification) => {
    setUserConfigs(prev => {
      const existing = prev.find(c => c.staffId === staffId);
      if (existing) {
        return prev.map(c => c.staffId === staffId ? { ...c, classification, roleTag: classification === 'other_staff' ? undefined : c.roleTag } : c);
      } else {
        return [...prev, { staffId, classification }];
      }
    });
    setHasUnsavedChanges(true);
  };

  const handleSetRole = (staffId: string, roleTag: string) => {
    setUserConfigs(prev => {
      const existing = prev.find(c => c.staffId === staffId);
      if (existing) {
        return prev.map(c => c.staffId === staffId ? { ...c, roleTag, classification: 'system_user' } : c);
      } else {
        return [...prev, { staffId, classification: 'system_user', roleTag }];
      }
    });
    setEditingStaffId(null);
    setHasUnsavedChanges(true);
  };

  const handleRemoveRole = (staffId: string) => {
    setUserConfigs(prev =>
      prev.map(c => c.staffId === staffId ? { ...c, roleTag: undefined } : c)
    );
    setEditingStaffId(null);
    setHasUnsavedChanges(true);
  };

  const handleBulkClassification = useCallback((classification: StaffClassification) => {
    setUserConfigs(prev => {
      let updated = [...prev];
      selectedStaffIds.forEach(staffId => {
        const existing = updated.find(c => c.staffId === staffId);
        if (existing) {
          updated = updated.map(c => c.staffId === staffId ? { ...c, classification, roleTag: classification === 'other_staff' ? undefined : c.roleTag } : c);
        } else {
          updated.push({ staffId, classification });
        }
      });
      return updated;
    });
    setSelectedStaffIds(new Set());
    setHasUnsavedChanges(true);
  }, [selectedStaffIds]);

  const handleToggleSelect = useCallback((staffId: string) => {
    setSelectedStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) {
        next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((staffIds: string[]) => {
    setSelectedStaffIds(prev => {
      const allSelected = staffIds.every(id => prev.has(id));
      if (allSelected) {
        // Deselect all in this group
        const next = new Set(prev);
        staffIds.forEach(id => next.delete(id));
        return next;
      } else {
        // Select all in this group
        const next = new Set(prev);
        staffIds.forEach(id => next.add(id));
        return next;
      }
    });
  }, []);

  // Filter logic
  const filteredStaff = staffList.filter((staff) => {
    const matchSearch =
      !searchTerm ||
      (staff.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (staff.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (staff.work_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (staff.position || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (staff.user_role || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && isActiveStaff(staff)) ||
      (filterStatus === 'inactive' && !isActiveStaff(staff));

    const matchTeam =
      filterTeam === 'all' || staff.team_name === filterTeam;

    const matchClassification =
      filterClassification === 'all' || getStaffClassification(staff.id) === filterClassification;

    return matchSearch && matchStatus && matchTeam && matchClassification;
  });

  const systemUsers = filteredStaff.filter(s => getStaffClassification(s.id) === 'system_user');
  const otherStaff = filteredStaff.filter(s => getStaffClassification(s.id) === 'other_staff');
  const disabledStaff = filteredStaff.filter(s => getStaffClassification(s.id) === 'disabled');

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('zh-HK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  type StatFilterKey = 'all' | 'active' | 'system_user' | 'disabled';

  const activeStatFilter = useMemo((): StatFilterKey | null => {
    if (filterTeam !== 'all') return null;
    if (filterClassification === 'system_user') return 'system_user';
    if (filterClassification === 'disabled') return 'disabled';
    if (filterClassification === 'other_staff') return null;
    if (filterStatus === 'all') return 'all';
    if (filterStatus === 'active') return 'active';
    return null;
  }, [filterStatus, filterClassification, filterTeam]);

  const handleStatFilterClick = useCallback((key: StatFilterKey) => {
    if (activeStatFilter === key) {
      setFilterStatus('active');
      setFilterClassification('all');
      setFilterTeam('all');
      return;
    }
    setFilterTeam('all');
    switch (key) {
      case 'all':
        setFilterStatus('all');
        setFilterClassification('all');
        break;
      case 'active':
        setFilterStatus('active');
        setFilterClassification('all');
        break;
      case 'system_user':
        setFilterStatus('all');
        setFilterClassification('system_user');
        break;
      case 'disabled':
        setFilterStatus('all');
        setFilterClassification('disabled');
        break;
    }
  }, [activeStatFilter]);

  const statCardClass = (key: StatFilterKey) =>
    cn(
      'bg-white border rounded-md p-4 flex items-center gap-3 text-left transition-colors',
      activeStatFilter === key
        ? 'border-teal-400 bg-teal-50/60 ring-1 ring-teal-400/40'
        : 'border-border/50 hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer',
    );

  return (
    <div className="space-y-5">
      {/* Header / Stats — click to filter */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => handleStatFilterClick('all')}
          className={statCardClass('all')}
          title="點擊篩選全部員工"
        >
          <div className="w-10 h-10 rounded-md bg-teal-50 flex items-center justify-center">
            <Users size={18} className="text-teal-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">總員工數</p>
            <p className="text-[20px] font-bold">{staffList.length}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleStatFilterClick('active')}
          className={statCardClass('active')}
          title="點擊篩選在職員工"
        >
          <div className="w-10 h-10 rounded-md bg-green-50 flex items-center justify-center">
            <Briefcase size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">在職員工</p>
            <p className="text-[20px] font-bold">{activeCount}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => handleStatFilterClick('system_user')}
          className={statCardClass('system_user')}
          title="點擊篩選系統使用者"
        >
          <div className="w-10 h-10 rounded-md bg-purple-50 flex items-center justify-center">
            <UserCheck size={18} className="text-purple-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">系統使用者</p>
            <p className="text-[20px] font-bold">{systemUserCount}</p>
          </div>
        </button>
        <div
          className={cn(
            'bg-white border rounded-md p-4 flex items-center gap-3',
            filterTeam !== 'all'
              ? 'border-blue-400 bg-blue-50/60 ring-1 ring-blue-400/40'
              : 'border-border/50',
          )}
          title={filterTeam !== 'all' ? `已篩選團隊：${filterTeam}（請用下方下拉選單切換）` : '團隊數量統計'}
        >
          <div className="w-10 h-10 rounded-md bg-blue-50 flex items-center justify-center">
            <Building2 size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">團隊數</p>
            <p className="text-[20px] font-bold">{teams.length}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleStatFilterClick('disabled')}
          className={statCardClass('disabled')}
          title="點擊篩選不能使用系統名單"
        >
          <div className="w-10 h-10 rounded-md bg-rose-50 flex items-center justify-center">
            <Ban size={18} className="text-rose-500" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">不能使用系統</p>
            <p className="text-[20px] font-bold">{disabledCount}</p>
          </div>
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start gap-3">
        <Shield size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-[12px] text-blue-800">
          <p className="font-medium mb-1">員工分類說明</p>
          <p className="text-blue-700">
            員工分為三類：「<span className="font-medium">系統使用者</span>」可登入系統並按身份標籤存取功能；
            「<span className="font-medium">其他職員</span>」為在職但未開通系統權限的員工；
            「<span className="font-medium text-rose-600">不能使用系統名單</span>」包含所有離職員工，系統會自動將離職員工放入此名單，無需手動操作。
          </p>
        </div>
      </div>

      {/* Unsaved Changes Warning */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-3">
          <AlertCircle size={14} className="text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-800 font-medium flex-1">
            您有未儲存的變更。請按「儲存修改」按鈕以保存設定。
          </p>
          <button
            onClick={handleSaveUserConfigs}
            disabled={saving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            儲存
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 w-full sm:max-w-[320px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋姓名、電郵、職位..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <select
          value={filterClassification}
          onChange={(e) => setFilterClassification(e.target.value as any)}
          className="px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
        >
          <option value="all">所有分類</option>
          <option value="system_user">系統使用者</option>
          <option value="other_staff">其他職員</option>
          <option value="disabled">不能使用系統名單</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
        >
          <option value="all">所有狀態</option>
          <option value="active">在職</option>
          <option value="inactive">離職</option>
        </select>
        {teams.length > 0 && (
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          >
            <option value="all">所有團隊</option>
            {teams.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-[13px] font-medium hover:bg-muted/50 transition-colors disabled:opacity-50 bg-white"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          刷新
        </button>
        <button
          onClick={handleSyncFromOtc2}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 shadow-sm"
        >
          {syncing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CloudDownload size={13} />
          )}
          {syncing ? '同步中...' : '從 OTC2 同步'}
        </button>
        <button
          onClick={handleSaveUserConfigs}
          disabled={saving || !hasUnsavedChanges}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors shadow-sm",
            hasUnsavedChanges
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
          )}
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          {saving ? '儲存中...' : '儲存修改'}
          {hasUnsavedChanges && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div className={cn(
          "border rounded-md p-4 flex items-start gap-3",
          syncResult.success 
            ? "bg-green-50 border-green-200" 
            : "bg-rose-50 border-rose-200"
        )}>
          {syncResult.success ? (
            <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <p className={cn(
              "text-[13px] font-medium",
              syncResult.success ? "text-green-800" : "text-rose-800"
            )}>
              {syncResult.success ? '✅ 同步成功' : '❌ 同步失敗'}
            </p>
            <p className={cn(
              "text-[12px] mt-0.5",
              syncResult.success ? "text-green-700" : "text-rose-600"
            )}>
              {syncResult.message}
            </p>
            {syncResult.success && syncResult.stats && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {syncResult.environment && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[11px] font-bold border border-emerald-300">
                    🟢 {syncResult.environment} MODE
                  </span>
                )}
                {syncResult.full_refresh && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 text-sky-700 text-[11px] font-medium">
                    🔄 完整刷新
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-[11px] font-medium">
                  總共 {syncResult.stats.total} 人
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-medium">
                  新增 {syncResult.stats.created} 人
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[11px] font-medium">
                  更新 {syncResult.stats.updated} 人
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 text-teal-700 text-[11px] font-medium">
                  在職 {syncResult.stats.active} 人
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[11px] font-medium">
                  離職 {syncResult.stats.inactive} 人
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-[11px] font-medium">
                  團隊 {syncResult.stats.teams} 個
                </span>
                {syncResult.synced_at && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    同步時間: {new Date(syncResult.synced_at).toLocaleString('zh-HK')}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setSyncResult(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-4 text-[13px] text-rose-700">
          <p className="font-medium">無法載入員工資料</p>
          <p className="text-[12px] mt-1 text-rose-600">{error}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 bg-rose-100 text-rose-700 rounded text-[12px] font-medium hover:bg-rose-200"
          >
            重試
          </button>
        </div>
      )}

      {/* Save Result Banner */}
      {saveResult && (
        <div className={cn(
          "border rounded-md p-3 flex items-center gap-3",
          saveResult.success
            ? "bg-blue-50 border-blue-200"
            : "bg-rose-50 border-rose-200"
        )}>
          {saveResult.success ? (
            <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <p className={cn(
            "text-[13px] font-medium flex-1",
            saveResult.success ? "text-blue-800" : "text-rose-800"
          )}>
            {saveResult.message}
          </p>
          <button
            onClick={() => setSaveResult(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="bg-white border border-border/50 rounded-md p-12 flex flex-col items-center justify-center gap-3">
          <RefreshCw size={24} className="text-teal-600 animate-spin" />
          <p className="text-[13px] text-muted-foreground">正在載入員工資料...</p>
        </div>
      )}

      {/* Staff Lists — split by classification */}
      {!loading && !error && (
        <div className="space-y-6">
          {/* Bulk Action Bar */}
          {selectedStaffIds.size > 0 && (
            <div className="sticky top-0 z-30 bg-teal-50 border border-teal-200 rounded-md p-3 flex items-center gap-3 shadow-sm">
              <CheckSquare size={16} className="text-teal-700" />
              <span className="text-[13px] font-medium text-teal-800">
                已選取 {selectedStaffIds.size} 位員工
              </span>
              <span className="text-[12px] text-teal-600">|</span>
              <span className="text-[12px] text-teal-700">批量設為：</span>
              <button
                onClick={() => handleBulkClassification('system_user')}
                className="px-2.5 py-1 rounded text-[11px] font-medium bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200 transition-colors"
              >
                🟣 系統使用者
              </button>
              <button
                onClick={() => handleBulkClassification('other_staff')}
                className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors"
              >
                ⚪ 其他職員
              </button>
              <button
                onClick={() => handleBulkClassification('disabled')}
                className="px-2.5 py-1 rounded text-[11px] font-medium bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200 transition-colors"
              >
                🔴 不能使用系統
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setSelectedStaffIds(new Set())}
                className="text-[11px] text-teal-600 hover:text-teal-800 font-medium"
              >
                取消選取
              </button>
            </div>
          )}

          {/* System Users Section */}
          {(filterClassification === 'all' || filterClassification === 'system_user') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UserCheck size={16} className="text-purple-600" />
                <h3 className="text-[15px] font-bold">系統使用者</h3>
                <span className="text-[11px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  {systemUsers.length} 人
                </span>
                <span className="text-[11px] text-muted-foreground ml-2">可登入系統，按身份標籤存取功能</span>
              </div>
              <StaffTable
                staff={systemUsers}
                getStaffClassification={getStaffClassification}
                getStaffRole={getStaffRole}
                onSetClassification={handleSetClassification}
                onSetRole={handleSetRole}
                onRemoveRole={handleRemoveRole}
                editingStaffId={editingStaffId}
                setEditingStaffId={setEditingStaffId}
                formatDate={formatDate}
                showRoleColumn={true}
                showActionColumn={true}
                showBulkSelect={true}
                selectedStaffIds={selectedStaffIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                googleEmailMap={googleEmailMap}
                onGoogleEmailChange={handleGoogleEmailChange}
                showGoogleEmailColumn={true}
                emptyMessage={
                  filterClassification === 'system_user' && (searchTerm || filterTeam !== 'all')
                    ? '沒有符合篩選條件的系統使用者'
                    : '尚未設定任何系統使用者，請從下方「其他職員」中選擇員工並設為使用者'
                }
              />
            </div>
          )}

          {/* Other Staff Section */}
          {(filterClassification === 'all' || filterClassification === 'other_staff') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UserX size={16} className="text-slate-500" />
                <h3 className="text-[15px] font-bold">其他職員</h3>
                <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {otherStaff.length} 人
                </span>
                <span className="text-[11px] text-muted-foreground ml-2">在職但未開通系統權限</span>
              </div>
              <StaffTable
                staff={otherStaff}
                getStaffClassification={getStaffClassification}
                getStaffRole={getStaffRole}
                onSetClassification={handleSetClassification}
                onSetRole={handleSetRole}
                onRemoveRole={handleRemoveRole}
                editingStaffId={editingStaffId}
                setEditingStaffId={setEditingStaffId}
                formatDate={formatDate}
                showRoleColumn={false}
                showActionColumn={true}
                showBulkSelect={true}
                selectedStaffIds={selectedStaffIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                emptyMessage={
                  searchTerm || filterStatus !== 'all' || filterTeam !== 'all'
                    ? '沒有符合篩選條件的其他職員'
                    : '目前沒有其他職員資料'
                }
              />
            </div>
          )}

          {/* Disabled / Cannot Use System Section */}
          {(filterClassification === 'all' || filterClassification === 'disabled') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Ban size={16} className="text-rose-500" />
                <h3 className="text-[15px] font-bold text-rose-700">不能使用系統名單</h3>
                <span className="text-[11px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-medium">
                  {disabledStaff.length} 人
                </span>
                <span className="text-[11px] text-muted-foreground ml-2">離職員工自動列入，無法登入系統</span>
              </div>
              <StaffTable
                staff={disabledStaff}
                getStaffClassification={getStaffClassification}
                getStaffRole={getStaffRole}
                onSetClassification={handleSetClassification}
                onSetRole={handleSetRole}
                onRemoveRole={handleRemoveRole}
                editingStaffId={editingStaffId}
                setEditingStaffId={setEditingStaffId}
                formatDate={formatDate}
                showRoleColumn={false}
                showActionColumn={true}
                emptyMessage={
                  searchTerm || filterTeam !== 'all'
                    ? '沒有符合篩選條件的離職員工'
                    : '目前沒有離職員工'
                }
              />
            </div>
          )}

          {/* Footer info */}
          <div className="px-4 py-2.5 bg-muted/30 rounded-md text-[11px] text-muted-foreground flex items-center justify-between">
            <span>顯示 {filteredStaff.length} / {staffList.length} 位員工 （{systemUserCount} 位系統使用者 · {disabledCount} 位不能使用系統）</span>
            <span className="flex items-center gap-1.5">
              <Database size={11} className="text-teal-600" />
              <span className="text-teal-700 font-medium">資料來源：OTC2 staff_sync → staffs</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// === Role Tag Cell with Portal Dropdown ===
interface RoleTagCellProps {
  staffId: string;
  roleInfo: { label: string; color: string; modules: string } | undefined;
  roleTag: string | undefined;
  isEditing: boolean;
  setEditingStaffId: (id: string | null) => void;
  onSetRole: (id: string, role: string) => void;
  onRemoveRole: (id: string) => void;
}

function RoleTagCell({ staffId, roleInfo, roleTag, isEditing, setEditingStaffId, onSetRole, onRemoveRole }: RoleTagCellProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Calculate position when editing opens
  useEffect(() => {
    if (isEditing && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownHeight = 400; // approximate max height
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < dropdownHeight ? rect.top - Math.min(dropdownHeight, rect.top - 10) : rect.bottom + 4;
      setDropdownPos({ top, left: rect.left });
    } else {
      setDropdownPos(null);
    }
  }, [isEditing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setEditingStaffId(null);
      }
    };
    const handleScroll = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownHeight = 400;
        const spaceBelow = window.innerHeight - rect.bottom;
        const top = spaceBelow < dropdownHeight ? rect.top - Math.min(dropdownHeight, rect.top - 10) : rect.bottom + 4;
        setDropdownPos({ top, left: rect.left });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isEditing, setEditingStaffId]);

  return (
    <div className="relative">
      {roleInfo ? (
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border', roleInfo.color)}>
            <Tag size={10} />
            {roleInfo.label}
          </span>
          <button
            ref={triggerRef}
            onClick={() => setEditingStaffId(isEditing ? null : staffId)}
            className="text-muted-foreground hover:text-teal-600 p-0.5"
            title="更改身份標籤"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => setEditingStaffId(isEditing ? null : staffId)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-amber-300 bg-amber-50/50 text-[11px] text-amber-700 font-medium hover:bg-amber-50 transition-colors"
        >
          <Tag size={10} />
          指定身份標籤
          <ChevronDown size={10} />
        </button>
      )}
      {/* Role Dropdown - rendered via Portal to escape overflow:hidden */}
      {isEditing && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white border border-border rounded-md shadow-xl py-1 min-w-[240px] max-h-[380px] overflow-y-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {Object.entries(ROLE_LABELS).map(([key, { label, color, modules }]) => (
            <button
              key={key}
              onClick={() => onSetRole(staffId, key)}
              className={cn(
                'w-full text-left px-3 py-2 text-[12px] hover:bg-muted/50 transition-colors',
                roleTag === key && 'bg-teal-50/50 border-l-2 border-l-teal-500'
              )}
            >
              <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border', color)}>
                {label}
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5 ml-0.5 leading-tight">{modules}</p>
            </button>
          ))}
          {roleTag && (
            <>
              <div className="border-t border-border/50 my-1" />
              <button
                onClick={() => onRemoveRole(staffId)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-rose-600 hover:bg-rose-50 transition-colors"
              >
                移除身份標籤
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// === Staff Table Sub-component ===
interface StaffTableProps {
  staff: StaffRow[];
  getStaffClassification: (id: string) => StaffClassification;
  getStaffRole: (id: string) => string | undefined;
  onSetClassification: (id: string, classification: StaffClassification) => void;
  onSetRole: (id: string, role: string) => void;
  onRemoveRole: (id: string) => void;
  editingStaffId: string | null;
  setEditingStaffId: (id: string | null) => void;
  formatDate: (date?: string) => string;
  emptyMessage: string;
  showRoleColumn?: boolean;
  showActionColumn?: boolean;
  showBulkSelect?: boolean;
  selectedStaffIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
  googleEmailMap?: Record<string, string>;
  onGoogleEmailChange?: (staffId: string, email: string) => void;
  showGoogleEmailColumn?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

function StaffTable({
  staff,
  getStaffClassification,
  getStaffRole,
  onSetClassification,
  onSetRole,
  onRemoveRole,
  editingStaffId,
  setEditingStaffId,
  formatDate,
  emptyMessage,
  showRoleColumn = true,
  showActionColumn = true,
  showBulkSelect = false,
  selectedStaffIds,
  onToggleSelect,
  onSelectAll,
  googleEmailMap = {},
  onGoogleEmailChange,
  showGoogleEmailColumn = false,
}: StaffTableProps) {
  const [joiningDateSort, setJoiningDateSort] = useState<SortDirection>(null);

  const toggleJoiningDateSort = () => {
    setJoiningDateSort(prev => {
      if (prev === null) return 'asc';
      if (prev === 'asc') return 'desc';
      return null;
    });
  };

  const sortedStaff = useMemo(() => {
    if (!joiningDateSort) return staff;
    return [...staff].sort((a, b) => {
      const dateA = a.entry_date || '';
      const dateB = b.entry_date || '';
      if (!dateA && !dateB) return 0;
      if (!dateA) return joiningDateSort === 'asc' ? 1 : -1;
      if (!dateB) return joiningDateSort === 'asc' ? -1 : 1;
      const comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
      return joiningDateSort === 'asc' ? comparison : -comparison;
    });
  }, [staff, joiningDateSort]);

  const colSpan = (showBulkSelect ? 1 : 0) + 5 + (showGoogleEmailColumn ? 1 : 0) + (showRoleColumn ? 1 : 0) + (showActionColumn ? 1 : 0) + 1;
  const allIds = staff.map(s => s.id);
  const allSelected = staff.length > 0 && allIds.every(id => selectedStaffIds?.has(id));
  const someSelected = staff.length > 0 && allIds.some(id => selectedStaffIds?.has(id)) && !allSelected;

  return (
    <div className="bg-white border border-border/50 rounded-md">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50">
            <tr>
              {showBulkSelect && (
                <th className="w-10 px-3 py-2.5">
                  <button
                    onClick={() => onSelectAll?.(allIds)}
                    className="text-muted-foreground hover:text-teal-600 transition-colors"
                    title={allSelected ? '取消全選' : '全選'}
                  >
                    {allSelected ? (
                      <CheckSquare size={15} className="text-teal-600" />
                    ) : someSelected ? (
                      <MinusSquare size={15} className="text-teal-500" />
                    ) : (
                      <Square size={15} />
                    )}
                  </button>
                </th>
              )}
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">員工</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">職位</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電郵</th>
              {showGoogleEmailColumn && (
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Chrome size={12} className="text-blue-500" />
                    Google 登入電郵
                  </span>
                </th>
              )}
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                <button
                  onClick={toggleJoiningDateSort}
                  className="flex items-center gap-1 hover:text-teal-600 transition-colors"
                  title="按入職日期排序"
                >
                  入職日期
                  <ArrowUpDown size={12} className={cn(
                    joiningDateSort && 'text-teal-600',
                    !joiningDateSort && 'opacity-50'
                  )} />
                  {joiningDateSort === 'asc' && <span className="text-[9px] text-teal-600">↑</span>}
                  {joiningDateSort === 'desc' && <span className="text-[9px] text-teal-600">↓</span>}
                </button>
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">電話</th>
              {showRoleColumn && (
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">身份標籤</th>
              )}
              {showActionColumn && (
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">分類操作</th>
              )}
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedStaff.map((staffMember) => {
                const classification = getStaffClassification(staffMember.id);
                const roleTag = getStaffRole(staffMember.id);
                const roleInfo = roleTag ? ROLE_LABELS[roleTag] : null;
                const isEditing = editingStaffId === staffMember.id;
                const avatarSrc = staffAvatarSrc(staffMember.profile_pic_url);
                const active = isActiveStaff(staffMember);

                return (
                  <tr key={staffMember.id} className={cn(
                    "border-t border-border/50 hover:bg-muted/20",
                    classification === 'disabled' && 'opacity-60',
                    selectedStaffIds?.has(staffMember.id) && 'bg-teal-50/50'
                  )}>
                    {showBulkSelect && (
                      <td className="w-10 px-3 py-3">
                        <button
                          onClick={() => onToggleSelect?.(staffMember.id)}
                          className="text-muted-foreground hover:text-teal-600 transition-colors"
                        >
                          {selectedStaffIds?.has(staffMember.id) ? (
                            <CheckSquare size={15} className="text-teal-600" />
                          ) : (
                            <Square size={15} />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 overflow-hidden",
                          classification === 'disabled' ? 'bg-gray-100 text-gray-400' : 'bg-teal-100 text-teal-700'
                        )}>
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt={staffMember.display_name || ''}
                              className={cn("w-full h-full object-cover", classification === 'disabled' && 'grayscale')}
                            />
                          ) : (
                            (staffMember.display_name || '').charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-[13px]">{staffMember.display_name}</p>
                          {staffMember.full_name ? (
                            <p className="text-[11px] text-muted-foreground">{staffMember.full_name}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[13px]">{staffMember.position || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {staffMember.work_email ? (
                        <span className="flex items-center gap-1">
                          <Mail size={11} />
                          <span className="truncate max-w-[160px]">{staffMember.work_email}</span>
                        </span>
                      ) : '—'}
                    </td>
                    {showGoogleEmailColumn && (
                      <td className="px-4 py-3">
                        <InlineGoogleEmailEditor
                          staffId={staffMember.id}
                          currentValue={googleEmailMap[staffMember.id] || ''}
                          onSave={(newEmail) => onGoogleEmailChange?.(staffMember.id, newEmail)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground text-[13px]">
                      {staffMember.entry_date
                        ? new Date(staffMember.entry_date).toLocaleDateString('zh-HK', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {staffMember.work_phone ? (
                        <a href={`tel:${staffMember.work_phone}`} className="hover:text-teal-600 flex items-center gap-1">
                          <Phone size={11} />
                          {staffMember.work_phone}
                        </a>
                      ) : '—'}
                    </td>
                    {showRoleColumn && (
                      <td className="px-4 py-3">
                        {classification === 'system_user' ? (
                          <RoleTagCell
                            staffId={staffMember.id}
                            roleInfo={roleInfo}
                            roleTag={roleTag}
                            isEditing={isEditing}
                            setEditingStaffId={setEditingStaffId}
                            onSetRole={onSetRole}
                            onRemoveRole={onRemoveRole}
                          />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {showActionColumn && (
                      <td className="px-4 py-3">
                        {classification === 'disabled' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-rose-50 text-rose-500 border border-rose-200">
                            <Ban size={11} />
                            已離職（自動）
                          </span>
                        ) : (
                          <select
                            value={classification}
                            onChange={(e) => onSetClassification(staffMember.id, e.target.value as StaffClassification)}
                            className={cn(
                              "px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500",
                              classification === 'system_user'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            )}
                          >
                            <option value="system_user">🟣 系統使用者</option>
                            <option value="other_staff">⚪ 其他職員</option>
                            <option value="disabled">🔴 不能使用系統</option>
                          </select>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium',
                          active
                            ? 'bg-teal-50 text-teal-700'
                            : 'bg-rose-50 text-rose-600'
                        )}
                      >
                        {active ? '在職' : '已離職'}
                      </span>
                      {staffMember.termination_date && (
                        <p className="text-[10px] text-rose-500 mt-0.5">
                          離職: {formatDate(staffMember.termination_date)}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// === Inline Google Email Editor (for StaffDirectory) ===
function InlineGoogleEmailEditor({
  staffId,
  currentValue,
  onSave,
}: {
  staffId: string;
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
          placeholder="輸入登入電郵"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer group hover:bg-blue-50 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={() => setEditing(true)}
      title="點擊編輯登入電郵"
    >
      <Chrome size={12} className="text-blue-500" />
      <span className="text-[12px] text-muted-foreground group-hover:text-blue-700">
        {currentValue || <span className="italic text-gray-400">點擊設定</span>}
      </span>
      <Edit size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
