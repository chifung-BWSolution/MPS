import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  CooperationRecordList,
  KolCooperationForm,
} from '@/components/talent/KolCooperationForm';
import {
  cooperationRowToForm,
  deleteCooperationRecord,
  formatSupabaseError,
  KOL_COOP_PRESET_PLATFORMS,
  type KolCooperationRow,
} from '@/components/talent/kolCooperation';

export function KolCooperatedModule() {
  const { systemUser, userInfo, user } = useAuth();
  const createdBy =
    systemUser?.display_name || userInfo?.display_name || user?.email || '同事';

  const [rows, setRows] = useState<KolCooperationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRow, setEditingRow] = useState<KolCooperationRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kol_cooperation')
        .select('*, kol_profile(name, instagram_account, phone)')
        .order('cooperated_at', { ascending: false });
      if (error) throw error;
      setRows((data as KolCooperationRow[]) || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (platformFilter && !(r.platforms || []).includes(platformFilter)) return false;

      const recordDate = r.cooperated_at.slice(0, 10);
      if (dateFrom && recordDate < dateFrom) return false;
      if (dateTo && recordDate > dateTo) return false;

      if (!q) return true;
      const name = (r.kol_profile?.name || '').toLowerCase();
      return name.includes(q);
    });
  }, [rows, search, platformFilter, dateFrom, dateTo]);

  const closeForm = () => {
    setShowForm(false);
    setEditingRow(null);
  };

  const handleDelete = async (row: KolCooperationRow) => {
    const label = row.project_name || row.kol_profile?.name || '此筆記錄';
    if (!confirm(`確定刪除「${label}」？`)) return;
    setDeletingId(row.id);
    try {
      await deleteCooperationRecord(row.id);
      toast.success('已刪除合作記錄');
      void load();
    } catch (e: unknown) {
      toast.error(formatSupabaseError(e, '刪除合作記錄失敗'));
    } finally {
      setDeletingId(null);
    }
  };

  const editingFixedKol = editingRow?.kol_profile
    ? {
        id: editingRow.kol_profile_id,
        name: editingRow.kol_profile.name,
        instagram_account: editingRow.kol_profile.instagram_account,
        phone: editingRow.kol_profile.phone,
      }
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">已合作 KOL</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            記錄與 KOL 的合作項目、內容、平台與日期 · 共 {filtered.length} 筆記錄
          </p>
        </div>
        <Button
          type="button"
          className="h-10 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setShowForm(true)}
        >
          <Plus size={16} />
          新增合作記錄
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋 KOL 名稱"
            className="pl-8 h-9 text-[13px]"
          />
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 w-[150px] text-[13px]"
          title="合作日期（起）"
          aria-label="合作日期（起）"
        />
        <span className="text-[12px] text-slate-400">至</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-9 w-[150px] text-[13px]"
          title="合作日期（迄）"
          aria-label="合作日期（迄）"
        />
        {(dateFrom || dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-[12px] text-slate-500"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            清除日期
          </Button>
        )}
        <Select
          value={platformFilter || '__all__'}
          onValueChange={(v) => setPlatformFilter(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-[160px] text-[13px]">
            <SelectValue placeholder="平台篩選" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部平台</SelectItem>
            {KOL_COOP_PRESET_PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CooperationRecordList
        rows={filtered}
        loading={loading}
        deletingId={deletingId}
        onEdit={setEditingRow}
        onDelete={(row) => void handleDelete(row)}
      />

      {(showForm || editingRow) && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0 bg-white">
              <div>
                <h2 className="text-[16px] font-semibold">
                  {editingRow ? '編輯合作記錄' : '新增合作記錄'}
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  S1 選 KOL → S2 項目 → S3 內容 → S4 平台 → S5 日期
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 flex-1 min-h-0 flex flex-col">
              <KolCooperationForm
                key={editingRow?.id || 'new'}
                createdBy={createdBy}
                fixedKol={editingFixedKol}
                recordId={editingRow?.id}
                initialValues={editingRow ? cooperationRowToForm(editingRow) : undefined}
                submitLabel={editingRow ? '儲存變更' : '儲存合作記錄'}
                onSuccess={() => {
                  closeForm();
                  void load();
                }}
                onCancel={closeForm}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
