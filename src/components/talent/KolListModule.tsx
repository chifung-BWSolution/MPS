import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Camera,
  Instagram,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

export interface KolProfile {
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
  entry_number: string | null;
  source_status: string | null;
  source_created_at: string | null;
  referrer_url: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

type ViewMode = 'gallery' | 'list';

interface AdvancedFilters {
  ageGroup: string;
  birthMonth: string;
  area: string;
  theme: string;
  specialty: string;
  igMin: string;
  igMax: string;
  openriceLevel: string;
  publishPlatforms: string;
  tastingFrequency: string;
  tastingExperience: string;
  modelExperience: string;
  wineClub: string;
  cooperationIntent: string;
}

const emptyFilters = (): AdvancedFilters => ({
  ageGroup: '',
  birthMonth: '',
  area: '',
  theme: '',
  specialty: '',
  igMin: '',
  igMax: '',
  openriceLevel: '',
  publishPlatforms: '',
  tastingFrequency: '',
  tastingExperience: '',
  modelExperience: '',
  wineClub: '',
  cooperationIntent: '',
});

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
  openrice_level: string;
  publish_platforms: string;
  tasting_frequency: string;
  tasting_experience: string;
  model_experience: string;
  wine_club: string;
  cooperation_intent: string;
  photo_url: string;
  facebook_url: string;
  xiaohongshu_url: string;
  youtube_url: string;
  openrice_url: string;
  blog_url: string;
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
  openrice_level: '',
  publish_platforms: '',
  tasting_frequency: '',
  tasting_experience: '',
  model_experience: '',
  wine_club: '',
  cooperation_intent: '',
  photo_url: '',
  facebook_url: '',
  xiaohongshu_url: '',
  youtube_url: '',
  openrice_url: '',
  blog_url: '',
});

// =====================================================================
// Helpers
// =====================================================================

function themeLabel(row: KolProfile): string {
  const fromPayload = row.raw_payload?.themeLabel;
  if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
  const themes = row.blog_themes || [];
  if (!themes.length) return '未分類';
  const first = themes[0];
  if (/美食|food/i.test(first)) return '美食';
  if (/旅行|travel/i.test(first)) return '旅行';
  if (/生活|life/i.test(first)) return '生活';
  return first.split(/\s+/)[0].slice(0, 8) || '未分類';
}

function formatIg(account: string | null | undefined): string | null {
  if (!account?.trim()) return null;
  const handle = account.trim().replace(/^@/, '');
  return handle ? `@${handle}` : null;
}

function igUrl(account: string): string {
  return `https://instagram.com/${encodeURIComponent(account.replace(/^@/, '').trim())}`;
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v || '').trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

function countActiveFilters(f: AdvancedFilters): number {
  return Object.values(f).filter((v) => String(v).trim() !== '').length;
}

function rowToForm(row: KolProfile): FormState {
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
    openrice_level: row.openrice_level || '',
    publish_platforms: row.publish_platforms || '',
    tasting_frequency: row.tasting_frequency || '',
    tasting_experience: row.tasting_experience || '',
    model_experience: row.model_experience || '',
    wine_club: row.wine_club || '',
    cooperation_intent: row.cooperation_intent || '',
    photo_url: row.photo_url || '',
    facebook_url: row.facebook_url || '',
    xiaohongshu_url: row.xiaohongshu_url || '',
    youtube_url: row.youtube_url || '',
    openrice_url: row.openrice_url || '',
    blog_url: row.blog_url || '',
  };
}

function formToPayload(form: FormState): Partial<KolProfile> {
  const themes = form.blog_themes
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const followers = form.instagram_followers.trim()
    ? parseInt(form.instagram_followers.replace(/,/g, ''), 10)
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
    instagram_followers: Number.isFinite(followers as number) ? followers : null,
    openrice_level: form.openrice_level.trim() || null,
    publish_platforms: form.publish_platforms.trim() || null,
    tasting_frequency: form.tasting_frequency.trim() || null,
    tasting_experience: form.tasting_experience.trim() || null,
    model_experience: form.model_experience.trim() || null,
    wine_club: form.wine_club.trim() || null,
    cooperation_intent: form.cooperation_intent.trim() || null,
    photo_url: form.photo_url.trim() || null,
    facebook_url: form.facebook_url.trim() || null,
    xiaohongshu_url: form.xiaohongshu_url.trim() || null,
    youtube_url: form.youtube_url.trim() || null,
    openrice_url: form.openrice_url.trim() || null,
    blog_url: form.blog_url.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

// =====================================================================
// Subcomponents
// =====================================================================

function KolCard({
  row,
  onClick,
}: {
  row: KolProfile;
  onClick: () => void;
}) {
  const ig = formatIg(row.instagram_account);
  const tag = themeLabel(row);
  const [imgError, setImgError] = useState(false);
  const showPhoto = Boolean(row.photo_url) && !imgError;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-xl border border-[rgba(13,26,45,0.08)] bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-[3/4] bg-slate-100">
        {showPhoto ? (
          <img
            src={row.photo_url!}
            alt={row.name || 'KOL'}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Camera size={28} strokeWidth={1.5} />
            <span className="text-[12px]">未有相片</span>
          </div>
        )}
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#f4a261] text-white text-[11px] font-medium shadow-sm">
          {tag}
        </span>
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[14px] font-semibold text-slate-900 truncate">
            {row.name || '（未填姓名）'}
          </span>
          {row.age_group && (
            <span className="text-[12px] text-slate-500 shrink-0">{row.age_group}</span>
          )}
        </div>
        {ig ? (
          <a
            href={igUrl(row.instagram_account!)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[12px] text-teal-600 hover:underline"
          >
            <Instagram size={12} />
            {ig}
          </a>
        ) : (
          <span className="text-[12px] text-slate-400">無 IG</span>
        )}
      </div>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = '全部',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-slate-600">{label}</Label>
      <Select value={value || '__all__'} onValueChange={(v) => onChange(v === '__all__' ? '' : v)}>
        <SelectTrigger className="h-9 text-[13px] bg-white">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{allLabel}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

// =====================================================================
// Main module
// =====================================================================

export function KolListModule() {
  const [rows, setRows] = useState<KolProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<AdvancedFilters>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<ViewMode>('gallery');
  const [editing, setEditing] = useState<KolProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showImportHint, setShowImportHint] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('kol_profile')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data as KolProfile[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filterOptions = useMemo(() => {
    const themes = new Set<string>();
    for (const r of rows) {
      for (const t of r.blog_themes || []) {
        if (t.trim()) themes.add(t.trim());
      }
      themes.add(themeLabel(r));
    }
    return {
      ageGroup: uniqueSorted(rows.map((r) => r.age_group)),
      birthMonth: uniqueSorted(rows.map((r) => r.birth_month)),
      theme: [...themes].sort((a, b) => a.localeCompare(b, 'zh-Hant')),
      openriceLevel: uniqueSorted(rows.map((r) => r.openrice_level)),
      tastingFrequency: uniqueSorted(rows.map((r) => r.tasting_frequency)),
      tastingExperience: uniqueSorted(rows.map((r) => r.tasting_experience)),
      modelExperience: uniqueSorted(rows.map((r) => r.model_experience)),
      wineClub: uniqueSorted(rows.map((r) => r.wine_club)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const igMin = filters.igMin.trim() ? parseInt(filters.igMin, 10) : null;
    const igMax = filters.igMax.trim() ? parseInt(filters.igMax, 10) : null;

    return rows.filter((r) => {
      if (q) {
        const hay = [r.name, r.instagram_account, r.phone, r.email]
          .map((x) => (x || '').toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      if (filters.ageGroup && r.age_group !== filters.ageGroup) return false;
      if (filters.birthMonth && r.birth_month !== filters.birthMonth) return false;
      if (filters.area) {
        const areaQ = filters.area.trim();
        const hit =
          (r.residence_area || '').includes(areaQ) ||
          (r.work_area || '').includes(areaQ);
        if (!hit) return false;
      }
      if (filters.theme) {
        const label = themeLabel(r);
        const themes = r.blog_themes || [];
        const hit =
          label === filters.theme ||
          themes.some((t) => t.includes(filters.theme) || filters.theme.includes(t));
        if (!hit) return false;
      }
      if (filters.specialty) {
        const s = (r.specialty || '').toLowerCase();
        if (!s.includes(filters.specialty.trim().toLowerCase())) return false;
      }
      if (igMin != null && !Number.isNaN(igMin)) {
        if ((r.instagram_followers ?? 0) < igMin) return false;
      }
      if (igMax != null && !Number.isNaN(igMax)) {
        if ((r.instagram_followers ?? 0) > igMax) return false;
      }
      if (filters.openriceLevel && r.openrice_level !== filters.openriceLevel) return false;
      if (filters.publishPlatforms) {
        const p = (r.publish_platforms || '').toLowerCase();
        if (!p.includes(filters.publishPlatforms.trim().toLowerCase())) return false;
      }
      if (filters.tastingFrequency && r.tasting_frequency !== filters.tastingFrequency) return false;
      if (filters.tastingExperience && r.tasting_experience !== filters.tastingExperience) return false;
      if (filters.modelExperience && r.model_experience !== filters.modelExperience) return false;
      if (filters.wineClub && r.wine_club !== filters.wineClub) return false;
      if (filters.cooperationIntent) {
        const c = (r.cooperation_intent || '').toLowerCase();
        if (!c.includes(filters.cooperationIntent.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, filters]);

  const activeFilterCount = countActiveFilters(filters);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm(emptyForm());
  };

  const openEdit = (row: KolProfile) => {
    setEditing(row);
    setCreating(false);
    setForm(rowToForm(row));
  };

  const closeEditor = () => {
    setEditing(null);
    setCreating(false);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    const payload = formToPayload(form);
    if (!payload.name && !payload.phone) {
      toast.error('請至少填寫姓名或電話');
      return;
    }
    setSaving(true);
    try {
      if (creating) {
        const { error: err } = await supabase.from('kol_profile').insert({
          ...payload,
          raw_payload: { themeLabel: themeLabel({ blog_themes: payload.blog_themes || [], raw_payload: null } as KolProfile) },
        });
        if (err) throw err;
        toast.success('已新增 KOL');
      } else if (editing) {
        const { error: err } = await supabase
          .from('kol_profile')
          .update(payload)
          .eq('id', editing.id);
        if (err) throw err;
        toast.success('已儲存');
      }
      closeEditor();
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const setFormField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const editorOpen = creating || Boolean(editing);

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">KOL列表</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              共 {rows.length} 位博客 · 符合條件 {filtered.length} 位
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setShowImportHint(true)}
            >
              <Upload size={16} />
              匯入
            </Button>
            <Button type="button" className="h-10 bg-emerald-600 hover:bg-emerald-700" onClick={openCreate}>
              <Plus size={16} />
              新增KOL
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋名稱、IG、電話、電郵..."
              className="pl-9 h-10 bg-white"
            />
          </div>
          <Button
            type="button"
            variant={showFilters || activeFilterCount > 0 ? 'default' : 'outline'}
            className={cn(
              'h-10',
              (showFilters || activeFilterCount > 0) && 'bg-teal-600 hover:bg-teal-700'
            )}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            進階搜尋{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'px-3 py-1.5 text-[12px] rounded-md',
                view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'
              )}
            >
              列表
            </button>
            <button
              type="button"
              onClick={() => setView('gallery')}
              className={cn(
                'px-3 py-1.5 text-[12px] rounded-md',
                view === 'gallery' ? 'bg-slate-900 text-white' : 'text-slate-600'
              )}
            >
              相片牆
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <FilterSelect
                label="年齡層"
                value={filters.ageGroup}
                onChange={(v) => setFilters((f) => ({ ...f, ageGroup: v }))}
                options={filterOptions.ageGroup}
              />
              <FilterSelect
                label="出生月份"
                value={filters.birthMonth}
                onChange={(v) => setFilters((f) => ({ ...f, birthMonth: v }))}
                options={filterOptions.birthMonth}
              />
              <div className="space-y-1">
                <Label className="text-[12px] text-slate-600">地區（居住/工作）</Label>
                <Input
                  value={filters.area}
                  onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))}
                  placeholder="如：油麻地、中環"
                  className="h-9 text-[13px]"
                />
              </div>
              <FilterSelect
                label="主題範疇"
                value={filters.theme}
                onChange={(v) => setFilters((f) => ({ ...f, theme: v }))}
                options={filterOptions.theme}
                allLabel="全部範疇"
              />
              <div className="space-y-1">
                <Label className="text-[12px] text-slate-600">IG 粉絲下限</Label>
                <Input
                  value={filters.igMin}
                  onChange={(e) => setFilters((f) => ({ ...f, igMin: e.target.value }))}
                  placeholder="如：1000"
                  className="h-9 text-[13px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px] text-slate-600">IG 粉絲上限</Label>
                <Input
                  value={filters.igMax}
                  onChange={(e) => setFilters((f) => ({ ...f, igMax: e.target.value }))}
                  placeholder="如：50000"
                  className="h-9 text-[13px]"
                />
              </div>
              <FilterSelect
                label="Openrice 評級"
                value={filters.openriceLevel}
                onChange={(v) => setFilters((f) => ({ ...f, openriceLevel: v }))}
                options={filterOptions.openriceLevel}
                allLabel="不限"
              />
              <div className="space-y-1">
                <Label className="text-[12px] text-slate-600">發佈平台</Label>
                <Input
                  value={filters.publishPlatforms}
                  onChange={(e) => setFilters((f) => ({ ...f, publishPlatforms: e.target.value }))}
                  placeholder="如：Openrice、Instagram"
                  className="h-9 text-[13px]"
                />
              </div>
              <FilterSelect
                label="試食頻率"
                value={filters.tastingFrequency}
                onChange={(v) => setFilters((f) => ({ ...f, tastingFrequency: v }))}
                options={filterOptions.tastingFrequency}
                allLabel="不限"
              />
              <FilterSelect
                label="試食經驗"
                value={filters.tastingExperience}
                onChange={(v) => setFilters((f) => ({ ...f, tastingExperience: v }))}
                options={filterOptions.tastingExperience}
                allLabel="不限"
              />
              <FilterSelect
                label="Model經驗"
                value={filters.modelExperience}
                onChange={(v) => setFilters((f) => ({ ...f, modelExperience: v }))}
                options={filterOptions.modelExperience}
                allLabel="不限"
              />
              <FilterSelect
                label="Wine Club"
                value={filters.wineClub}
                onChange={(v) => setFilters((f) => ({ ...f, wineClub: v }))}
                options={filterOptions.wineClub}
                allLabel="不限"
              />
              <div className="space-y-1">
                <Label className="text-[12px] text-slate-600">專長 / 主題分類</Label>
                <Input
                  value={filters.specialty}
                  onChange={(e) => setFilters((f) => ({ ...f, specialty: e.target.value }))}
                  placeholder="關鍵字"
                  className="h-9 text-[13px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[12px] text-slate-600">合作意向</Label>
                <Input
                  value={filters.cooperationIntent}
                  onChange={(e) => setFilters((f) => ({ ...f, cooperationIntent: e.target.value }))}
                  placeholder="關鍵字"
                  className="h-9 text-[13px]"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFilters(emptyFilters())}
              >
                清除篩選
              </Button>
            </div>
          </div>
        )}
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
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <UserRound size={28} className="opacity-50" />
          <p className="text-[14px]">沒有符合條件的 KOL</p>
        </div>
      ) : view === 'gallery' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((row) => (
            <KolCard key={row.id} row={row} onClick={() => openEdit(row)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left font-medium px-3 py-2">姓名</th>
                <th className="text-left font-medium px-3 py-2">年齡層</th>
                <th className="text-left font-medium px-3 py-2">IG</th>
                <th className="text-left font-medium px-3 py-2">粉絲</th>
                <th className="text-left font-medium px-3 py-2">地區</th>
                <th className="text-left font-medium px-3 py-2">主題</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => openEdit(row)}
                >
                  <td className="px-3 py-2 font-medium">{row.name || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.age_group || '—'}</td>
                  <td className="px-3 py-2 text-teal-700">{formatIg(row.instagram_account) || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.instagram_followers != null ? row.instagram_followers.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.residence_area || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[11px]">
                      {themeLabel(row)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import hint */}
      {showImportHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h2 className="text-[16px] font-semibold">匯入說明</h2>
              <button type="button" onClick={() => setShowImportHint(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Food Blogger Excel 已透過腳本匯入至資料庫（Status=complete，電話／電郵去重）。
              若需重新匯入，請於專案根目錄執行：
            </p>
            <pre className="text-[11px] bg-slate-50 border rounded-lg p-3 overflow-x-auto">
{`node scripts/import_kol_food_blogger.mjs
node scripts/push_kol_batches.mjs`}
            </pre>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowImportHint(false); void load(); }}>
                重新載入
              </Button>
              <Button type="button" onClick={() => setShowImportHint(false)}>知道了</Button>
            </div>
          </div>
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-[16px] font-semibold">
                {creating ? '新增KOL' : `編輯 · ${editing?.name || 'KOL'}`}
              </h2>
              <button type="button" onClick={closeEditor} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <FormField label="IG 粉絲數">
                  <Input value={form.instagram_followers} onChange={(e) => setFormField('instagram_followers', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Openrice 評級">
                  <Input value={form.openrice_level} onChange={(e) => setFormField('openrice_level', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="試食頻率">
                  <Input value={form.tasting_frequency} onChange={(e) => setFormField('tasting_frequency', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="試食經驗">
                  <Input value={form.tasting_experience} onChange={(e) => setFormField('tasting_experience', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Model 經驗">
                  <Input value={form.model_experience} onChange={(e) => setFormField('model_experience', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Wine Club">
                  <Input value={form.wine_club} onChange={(e) => setFormField('wine_club', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="相片 URL">
                  <Input value={form.photo_url} onChange={(e) => setFormField('photo_url', e.target.value)} className="h-9" />
                </FormField>
              </div>
              <FormField label="Blog 主題（逗號分隔）">
                <Input value={form.blog_themes} onChange={(e) => setFormField('blog_themes', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="專長 / 主題分類">
                <Input value={form.specialty} onChange={(e) => setFormField('specialty', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="發佈平台">
                <Input value={form.publish_platforms} onChange={(e) => setFormField('publish_platforms', e.target.value)} className="h-9" />
              </FormField>
              <FormField label="合作意向">
                <Textarea
                  value={form.cooperation_intent}
                  onChange={(e) => setFormField('cooperation_intent', e.target.value)}
                  rows={2}
                  className="text-[13px]"
                />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Facebook">
                  <Input value={form.facebook_url} onChange={(e) => setFormField('facebook_url', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="小紅書">
                  <Input value={form.xiaohongshu_url} onChange={(e) => setFormField('xiaohongshu_url', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="YouTube">
                  <Input value={form.youtube_url} onChange={(e) => setFormField('youtube_url', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Openrice 連結">
                  <Input value={form.openrice_url} onChange={(e) => setFormField('openrice_url', e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Blog">
                  <Input value={form.blog_url} onChange={(e) => setFormField('blog_url', e.target.value)} className="h-9" />
                </FormField>
              </div>
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
          </div>
        </div>
      )}
    </div>
  );
}
