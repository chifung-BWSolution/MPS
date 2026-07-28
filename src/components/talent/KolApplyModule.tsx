import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// =====================================================================
// Types
// =====================================================================

export type KolAuditStatus =
  | 'pending_review'
  | 'auto_passed'
  | 'approved'
  | 'added_to_db'
  | 'rejected';

export interface KolApply {
  id: string;
  name: string | null;
  salutation: string | null;
  email: string | null;
  phone: string | null;
  age_group: string | null;
  birth_month: string | null;
  residence_area: string | null;
  work_area: string | null;
  blog_themes: string[] | null;
  specialty: string | null;
  instagram_account: string | null;
  instagram_followers: number | null;
  facebook_url: string | null;
  facebook_likes: number | null;
  xiaohongshu_url: string | null;
  xiaohongshu_followers: number | null;
  youtube_url: string | null;
  youtube_subscribers: number | null;
  openrice_url: string | null;
  openrice_level: string | null;
  blog_url: string | null;
  blog_subscribers: number | null;
  other_channels: string | null;
  other_followers: number | null;
  publish_platforms: string | null;
  tasting_frequency: string | null;
  tasting_experience: string | null;
  model_experience: string | null;
  on_camera_experience: string | null;
  wine_club: string | null;
  cooperation_intent: string | null;
  available_times: string | null;
  photo_url: string | null;
  work_photo_url: string | null;
  raw_payload: Record<string, unknown> | null;
  applied_at: string;
  audit_status: KolAuditStatus;
  source: string | null;
  login_code: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  kol_profile_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export type KolApplyRow = KolApply;

const STATUS_META: Record<
  KolAuditStatus,
  { label: string; className: string }
> = {
  pending_review: {
    label: '待審核',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  auto_passed: {
    label: '自動通過',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  approved: {
    label: '已批准',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  added_to_db: {
    label: '已加入資料庫',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  rejected: {
    label: '已拒絕',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const STATUS_TABS: { id: 'all' | KolAuditStatus; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'pending_review', label: '待審核' },
  { id: 'auto_passed', label: '自動通過' },
  { id: 'approved', label: '已批准' },
  { id: 'added_to_db', label: '已加入資料庫' },
  { id: 'rejected', label: '已拒絕' },
];

type FormState = {
  name: string;
  salutation: string;
  email: string;
  phone: string;
  age_group: string;
  birth_month: string;
  residence_area: string;
  work_area: string;
  specialty: string;
  blog_themes: string;
  instagram_account: string;
  instagram_followers: string;
  facebook_url: string;
  facebook_likes: string;
  openrice_level: string;
  publish_platforms: string;
  tasting_frequency: string;
  tasting_experience: string;
  model_experience: string;
  wine_club: string;
  cooperation_intent: string;
  photo_url: string;
  source: string;
  login_code: string;
  audit_status: KolAuditStatus;
};

const emptyForm = (): FormState => ({
  name: '',
  salutation: '',
  email: '',
  phone: '',
  age_group: '',
  birth_month: '',
  residence_area: '',
  work_area: '',
  specialty: '',
  blog_themes: '',
  instagram_account: '',
  instagram_followers: '',
  facebook_url: '',
  facebook_likes: '',
  openrice_level: '',
  publish_platforms: '',
  tasting_frequency: '',
  tasting_experience: '',
  model_experience: '',
  wine_club: '',
  cooperation_intent: '',
  photo_url: '',
  source: '手動新增',
  login_code: '',
  audit_status: 'pending_review',
});

// =====================================================================
// Helpers
// =====================================================================

function formatIg(account: string | null | undefined): string {
  if (!account?.trim()) return '—';
  const h = account.trim().replace(/^@/, '');
  return h ? `@${h}` : '—';
}

function formatFollowers(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 10000) {
    const wan = n / 10000;
    return `${wan >= 10 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, '')}萬`;
  }
  return n.toLocaleString('en-US');
}

function formatAppliedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function formatAppliedFull(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function themeLabel(row: Pick<KolApplyRow, 'blog_themes' | 'specialty'>): string {
  const themes = row.blog_themes || [];
  if (themes.length) {
    const first = themes[0];
    if (/美食|food/i.test(first)) return '美食';
    return first.split(/\s+/)[0].slice(0, 8);
  }
  return row.specialty?.split(/[,，]/)[0]?.trim() || '—';
}

function randomLoginCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function rowToForm(row: KolApplyRow): FormState {
  return {
    name: row.name || '',
    salutation: row.salutation || '',
    email: row.email || '',
    phone: row.phone || '',
    age_group: row.age_group || '',
    birth_month: row.birth_month || '',
    residence_area: row.residence_area || '',
    work_area: row.work_area || '',
    specialty: row.specialty || '',
    blog_themes: (row.blog_themes || []).join(', '),
    instagram_account: row.instagram_account || '',
    instagram_followers: row.instagram_followers != null ? String(row.instagram_followers) : '',
    facebook_url: row.facebook_url || '',
    facebook_likes: row.facebook_likes != null ? String(row.facebook_likes) : '',
    openrice_level: row.openrice_level || '',
    publish_platforms: row.publish_platforms || '',
    tasting_frequency: row.tasting_frequency || '',
    tasting_experience: row.tasting_experience || '',
    model_experience: row.model_experience || '',
    wine_club: row.wine_club || '',
    cooperation_intent: row.cooperation_intent || '',
    photo_url: row.photo_url || '',
    source: row.source || '',
    login_code: row.login_code || '',
    audit_status: row.audit_status,
  };
}

function formToPayload(form: FormState) {
  const themes = form.blog_themes
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const igFollowers = form.instagram_followers.trim()
    ? parseInt(form.instagram_followers.replace(/,/g, ''), 10)
    : null;
  const fbLikes = form.facebook_likes.trim()
    ? parseInt(form.facebook_likes.replace(/,/g, ''), 10)
    : null;
  return {
    name: form.name.trim() || null,
    salutation: form.salutation.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    age_group: form.age_group.trim() || null,
    birth_month: form.birth_month.trim() || null,
    residence_area: form.residence_area.trim() || null,
    work_area: form.work_area.trim() || null,
    specialty: form.specialty.trim() || null,
    blog_themes: themes,
    instagram_account: form.instagram_account.trim().replace(/^@/, '') || null,
    instagram_followers: Number.isFinite(igFollowers as number) ? igFollowers : null,
    facebook_url: form.facebook_url.trim() || null,
    facebook_likes: Number.isFinite(fbLikes as number) ? fbLikes : null,
    openrice_level: form.openrice_level.trim() || null,
    publish_platforms: form.publish_platforms.trim() || null,
    tasting_frequency: form.tasting_frequency.trim() || null,
    tasting_experience: form.tasting_experience.trim() || null,
    model_experience: form.model_experience.trim() || null,
    wine_club: form.wine_club.trim() || null,
    cooperation_intent: form.cooperation_intent.trim() || null,
    photo_url: form.photo_url.trim() || null,
    source: form.source.trim() || null,
    login_code: form.login_code.trim() || null,
    audit_status: form.audit_status,
    updated_at: new Date().toISOString(),
  };
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: KolAuditStatus }) {
  const meta = STATUS_META[status] || STATUS_META.pending_review;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium',
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}

// =====================================================================
// Main
// =====================================================================

export function KolApplyModule() {
  const [rows, setRows] = useState<KolApplyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | KolAuditStatus>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<KolApplyRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kol_apply')
      .select('*')
      .order('applied_at', { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data as KolApplyRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.source?.trim()) set.add(r.source.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<KolAuditStatus | 'all' | 'pending', number> = {
      all: rows.length,
      pending: 0,
      pending_review: 0,
      auto_passed: 0,
      approved: 0,
      added_to_db: 0,
      rejected: 0,
    };
    for (const r of rows) {
      c[r.audit_status] = (c[r.audit_status] || 0) + 1;
      if (r.audit_status === 'pending_review' || r.audit_status === 'auto_passed') {
        c.pending += 1;
      }
    }
    return c;
  }, [rows]);

  const conversionRate = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.round((counts.added_to_db / rows.length) * 100);
  }, [rows.length, counts.added_to_db]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusTab !== 'all' && r.audit_status !== statusTab) return false;
      if (sourceFilter !== 'all' && (r.source || '') !== sourceFilter) return false;
      if (q) {
        const hay = [r.name, r.instagram_account, r.phone, r.email]
          .map((x) => (x || '').toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusTab, sourceFilter]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(filtered.map((r) => r.id)));
    else setSelected(new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), login_code: randomLoginCode() });
    setEditorOpen(true);
  };

  const openEdit = (row: KolApplyRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const setFormField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const payload = formToPayload(form);
    if (!payload.name && !payload.phone) {
      toast.error('請至少填寫姓名或電話');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error: err } = await supabase
          .from('kol_apply')
          .update(payload)
          .eq('id', editing.id);
        if (err) throw err;
        toast.success('已儲存');
      } else {
        const { error: err } = await supabase.from('kol_apply').insert({
          ...payload,
          applied_at: new Date().toISOString(),
          login_code: payload.login_code || randomLoginCode(),
        });
        if (err) throw err;
        toast.success('已新增報名');
      }
      closeEditor();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (row: KolApplyRow, status: KolAuditStatus) => {
    setBusyId(row.id);
    try {
      const { error: err } = await supabase
        .from('kol_apply')
        .update({
          audit_status: status,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (err) throw err;
      toast.success(`已更新為「${STATUS_META[status].label}」`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setBusyId(null);
    }
  };

  const approveAndAddToDb = async (row: KolApplyRow) => {
    setBusyId(row.id);
    try {
      // 1) upsert-like insert into kol_profile
      const profilePayload = {
        name: row.name,
        salutation: row.salutation,
        email: row.email,
        phone: row.phone,
        age_group: row.age_group,
        birth_month: row.birth_month,
        residence_area: row.residence_area,
        work_area: row.work_area,
        blog_themes: row.blog_themes || [],
        specialty: row.specialty,
        instagram_account: row.instagram_account,
        instagram_followers: row.instagram_followers,
        facebook_url: row.facebook_url,
        facebook_likes: row.facebook_likes,
        xiaohongshu_url: row.xiaohongshu_url,
        xiaohongshu_followers: row.xiaohongshu_followers,
        youtube_url: row.youtube_url,
        youtube_subscribers: row.youtube_subscribers,
        openrice_url: row.openrice_url,
        openrice_level: row.openrice_level,
        blog_url: row.blog_url,
        blog_subscribers: row.blog_subscribers,
        other_channels: row.other_channels,
        other_followers: row.other_followers,
        publish_platforms: row.publish_platforms,
        tasting_frequency: row.tasting_frequency,
        tasting_experience: row.tasting_experience,
        model_experience: row.model_experience,
        on_camera_experience: row.on_camera_experience,
        wine_club: row.wine_club,
        cooperation_intent: row.cooperation_intent,
        available_times: row.available_times,
        photo_url: row.photo_url,
        work_photo_url: row.work_photo_url,
        raw_payload: {
          ...(row.raw_payload || {}),
          fromKolApplyId: row.id,
          source: row.source,
        },
        source_created_at: row.applied_at,
        source_status: 'from_apply',
      };

      let profileId = row.kol_profile_id;
      if (!profileId) {
        const { data, error: insErr } = await supabase
          .from('kol_profile')
          .insert(profilePayload)
          .select('id')
          .single();
        if (insErr) throw insErr;
        profileId = data.id as string;
      }

      const { error: updErr } = await supabase
        .from('kol_apply')
        .update({
          audit_status: 'added_to_db',
          kol_profile_id: profileId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (updErr) throw updErr;

      toast.success('已批准並加入 KOL 資料庫');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '批核失敗');
    } finally {
      setBusyId(null);
    }
  };

  const deleteRow = async (row: KolApplyRow) => {
    if (!confirm(`確定刪除「${row.name || '此申請'}」？`)) return;
    setBusyId(row.id);
    try {
      const { error: err } = await supabase.from('kol_apply').delete().eq('id', row.id);
      if (err) throw err;
      toast.success('已刪除');
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">KOL申請管理</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              管理 KOL 報名申請、審核狀態，並可批准加入 KOL 列表。
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" className="h-10" disabled>
              <Upload size={16} />
              匯入
            </Button>
            <Button
              type="button"
              className="h-10 bg-emerald-600 hover:bg-emerald-700"
              onClick={openCreate}
            >
              <Plus size={16} />
              新增報名
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="總報名人數" value={counts.all} />
          <StatCard label="待處理" value={counts.pending} tone="amber" />
          <StatCard label="已加入資料庫" value={counts.added_to_db} tone="teal" />
          <StatCard label="轉化率" value={`${conversionRate}%`} tone="violet" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名、IG、電話、電郵..."
              className="pl-9 h-9 bg-white"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-[160px] bg-white text-[13px]">
              <SelectValue placeholder="全部來源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部來源</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => {
            const count = tab.id === 'all' ? counts.all : counts[tab.id];
            const active = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[12px] border transition-colors',
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                {tab.label}
                <span className={cn('ml-1', active ? 'text-slate-300' : 'text-slate-400')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
          <Loader2 className="animate-spin" size={18} />
          載入中…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[13px] p-4">
          載入失敗：{error}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(v === true)}
                  />
                </th>
                <th className="text-left font-medium px-3 py-2">姓名</th>
                <th className="text-left font-medium px-3 py-2">IG 帳號</th>
                <th className="text-left font-medium px-3 py-2">粉絲數</th>
                <th className="text-left font-medium px-3 py-2">範疇</th>
                <th className="text-left font-medium px-3 py-2">來源</th>
                <th className="text-left font-medium px-3 py-2">登入碼</th>
                <th className="text-left font-medium px-3 py-2">狀態</th>
                <th className="text-left font-medium px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-slate-400">
                    沒有符合條件的申請
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const busy = busyId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-3 py-2.5">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={(v) => toggleOne(row.id, v === true)}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => openEdit(row)}
                        >
                          <div className="font-medium text-slate-900">{row.name || '—'}</div>
                          <div className="text-[11px] text-slate-400" title={formatAppliedFull(row.applied_at)}>
                            {formatAppliedAt(row.applied_at)}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-teal-700">{formatIg(row.instagram_account)}</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        ig粉絲：{formatFollowers(row.instagram_followers)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{themeLabel(row)}</td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-[140px] truncate">
                        {row.source || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">
                        {row.login_code || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={row.audit_status} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {row.audit_status !== 'added_to_db' &&
                            row.audit_status !== 'rejected' && (
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 bg-emerald-600 hover:bg-emerald-700 gap-1"
                                disabled={busy}
                                onClick={() => void approveAndAddToDb(row)}
                              >
                                {busy ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Check size={13} />
                                )}
                                批核
                              </Button>
                            )}
                          {row.audit_status === 'pending_review' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={busy}
                              onClick={() => void setStatus(row, 'rejected')}
                            >
                              拒絕
                            </Button>
                          )}
                          <button
                            type="button"
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void deleteRow(row)}
                            title="刪除"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="關閉"
            onClick={closeEditor}
          />
          <aside className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-[16px] font-semibold">
                {editing ? `編輯申請 · ${editing.name || ''}` : '新增報名'}
              </h2>
              <button type="button" onClick={closeEditor} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="姓名">
                  <Input value={form.name} onChange={(e) => setFormField('name', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="稱謂">
                  <Input value={form.salutation} onChange={(e) => setFormField('salutation', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="電郵">
                  <Input value={form.email} onChange={(e) => setFormField('email', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="電話">
                  <Input value={form.phone} onChange={(e) => setFormField('phone', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="年齡層">
                  <Input value={form.age_group} onChange={(e) => setFormField('age_group', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="出生月份">
                  <Input value={form.birth_month} onChange={(e) => setFormField('birth_month', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="居住地區">
                  <Input value={form.residence_area} onChange={(e) => setFormField('residence_area', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="工作地區">
                  <Input value={form.work_area} onChange={(e) => setFormField('work_area', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Instagram">
                  <Input value={form.instagram_account} onChange={(e) => setFormField('instagram_account', e.target.value)} className="h-9" placeholder="@handle" />
                </FormField>
                <FormField label="ig粉絲">
                  <Input value={form.instagram_followers} onChange={(e) => setFormField('instagram_followers', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Facebook">
                  <Input value={form.facebook_url} onChange={(e) => setFormField('facebook_url', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="FB粉絲">
                  <Input value={form.facebook_likes} onChange={(e) => setFormField('facebook_likes', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Openrice 評級">
                  <Input value={form.openrice_level} onChange={(e) => setFormField('openrice_level', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="試食經驗">
                  <Input value={form.tasting_experience} onChange={(e) => setFormField('tasting_experience', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="試食頻率">
                  <Input value={form.tasting_frequency} onChange={(e) => setFormField('tasting_frequency', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Model 經驗">
                  <Input value={form.model_experience} onChange={(e) => setFormField('model_experience', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="來源">
                  <Input value={form.source} onChange={(e) => setFormField('source', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="登入碼">
                  <Input value={form.login_code} onChange={(e) => setFormField('login_code', e.target.value)} className="h-9" />
                </FormField>
              </div>
              <FormField label="Blog 主題（逗號分隔）">
                <Input value={form.blog_themes} onChange={(e) => setFormField('blog_themes', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="專長 / 範疇">
                <Input value={form.specialty} onChange={(e) => setFormField('specialty', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="發佈平台">
                <Input value={form.publish_platforms} onChange={(e) => setFormField('publish_platforms', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="相片 URL">
                <Input value={form.photo_url} onChange={(e) => setFormField('photo_url', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="合作意向">
                <Textarea
                  value={form.cooperation_intent}
                  onChange={(e) => setFormField('cooperation_intent', e.target.value)}
                  rows={2}
                />
              </FormField>
              <FormField label="審核狀態">
                <Select
                  value={form.audit_status}
                  onValueChange={(v) => setFormField('audit_status', v as KolAuditStatus)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_META) as KolAuditStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {editing && (
                <p className="text-[12px] text-slate-500">
                  申請時間：{formatAppliedFull(editing.applied_at)}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>
                取消
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                儲存
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  tone?: 'slate' | 'amber' | 'teal' | 'violet';
}) {
  const tones = {
    slate: 'text-slate-900',
    amber: 'text-amber-700',
    teal: 'text-teal-700',
    violet: 'text-violet-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className={cn('text-[28px] font-bold tracking-tight mt-0.5', tones[tone])}>{value}</p>
    </div>
  );
}
