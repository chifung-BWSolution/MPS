import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

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
      if (!q) return true;
      const hay = [
        r.project_name,
        r.cooperation_content,
        r.evaluation,
        r.kol_profile?.name,
        r.kol_profile?.instagram_account,
        r.kol_profile?.phone,
        r.created_by,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, platformFilter]);

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
            placeholder="搜尋 KOL / 項目 / 內容"
            className="pl-8 h-9 text-[13px]"
          />
        </div>
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

      <CooperationRecordList rows={filtered} loading={loading} />

      {showForm && (
        <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <div>
                <h2 className="text-[16px] font-semibold">新增合作記錄</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  S1 選 KOL → S2 項目 → S3 內容 → S4 平台 → S5 日期
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4">
              <KolCooperationForm
                createdBy={createdBy}
                onSuccess={() => {
                  setShowForm(false);
                  void load();
                }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
