import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Instagram,
  Loader2,
  Plus,
  Search,
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

const PAGE_SIZE = 100;

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
  facebook_likes: string;
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
  facebook_likes: '',
  xiaohongshu_url: '',
  youtube_url: '',
  openrice_url: '',
  blog_url: '',
});

// =====================================================================
// Helpers
// =====================================================================

function themeLabel(row: Pick<KolProfile, 'blog_themes' | 'raw_payload'>): string {
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

function genderLabel(salutation: string | null | undefined): string {
  const s = (salutation || '').trim();
  if (!s) return '—';
  if (/小姐|女士|Ms|Miss|Mrs/i.test(s)) return '女';
  if (/先生|Mr/i.test(s)) return '男';
  return s;
}

function formatIg(account: string | null | undefined): string | null {
  if (!account?.trim()) return null;
  const handle = account.trim().replace(/^@/, '');
  return handle ? `@${handle}` : null;
}

function igUrl(account: string): string {
  return `https://instagram.com/${encodeURIComponent(account.replace(/^@/, '').trim())}`;
}

function facebookHref(url: string | null | undefined): string | null {
  const s = (url || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function formatCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

/** Prefer source Excel date, fall back to DB created_at. */
function entryDateRaw(row: KolProfile): string | null {
  return row.source_created_at || row.created_at || null;
}

function entryDateSortKey(row: KolProfile): number {
  const raw = entryDateRaw(row);
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

function formatEntryDate(row: KolProfile): string {
  const raw = entryDateRaw(row);
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // keep Excel-style "Jul 04, 2026 ..." shortened
    return raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i, '').trim() || raw;
  }
  return d.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v || '').trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
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
    facebook_likes: row.facebook_likes != null ? String(row.facebook_likes) : '',
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
    facebook_likes: Number.isFinite(fbLikes as number) ? fbLikes : null,
    xiaohongshu_url: form.xiaohongshu_url.trim() || null,
    youtube_url: form.youtube_url.trim() || null,
    openrice_url: form.openrice_url.trim() || null,
    blog_url: form.blog_url.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

async function fetchAllKolProfiles(): Promise<KolProfile[]> {
  const pageSize = 1000;
  const all: KolProfile[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('kol_profile')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const chunk = (data as KolProfile[]) || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}

// =====================================================================
// Subcomponents
// =====================================================================

function KolCard({ row, onClick }: { row: KolProfile; onClick: () => void }) {
  const ig = formatIg(row.instagram_account);
  const tag = themeLabel(row);
  const fb = facebookHref(row.facebook_url);
  const [imgError, setImgError] = useState(false);
  const showPhoto = Boolean(row.photo_url) && !imgError;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-xl border border-[rgba(13,26,45,0.08)] bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow w-full"
    >
      <div className="flex gap-3 p-3">
        <div className="relative w-[42%] shrink-0 aspect-square rounded-lg overflow-hidden bg-slate-100">
          {showPhoto ? (
            <img
              src={row.photo_url!}
              alt={row.name || 'KOL'}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
              <Camera size={22} strokeWidth={1.5} />
              <span className="text-[11px]">未有相片</span>
            </div>
          )}
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#f4a261] text-white text-[10px] font-medium shadow-sm">
            {tag}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
          <p className="text-[11px] font-medium text-slate-400">基礎信息</p>
          <p className="text-[14px] font-semibold text-slate-900 truncate leading-tight">
            {row.name || '（未填姓名）'}
          </p>
          <p className="text-[12px] text-slate-600">
            {genderLabel(row.salutation)}
            <span className="text-slate-300 mx-1">·</span>
            {row.age_group || '—'}
          </p>
          <p className="text-[12px] text-slate-600 truncate">
            電話 {row.phone || '—'}
          </p>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100 pt-2.5 text-[12px]">
        <div className="flex items-center gap-1.5 min-w-0">
          {ig ? (
            <a
              href={igUrl(row.instagram_account!)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-teal-600 hover:underline shrink-0"
            >
              <Instagram size={12} />
              {ig}
            </a>
          ) : (
            <span className="text-slate-400 inline-flex items-center gap-1">
              <Instagram size={12} />
              無 IG
            </span>
          )}
          <span className="text-slate-400">·</span>
          <span className="text-slate-600 truncate">粉絲 {formatCount(row.instagram_followers)}</span>
        </div>

        <p className="text-slate-600 leading-snug line-clamp-2">
          <span className="text-slate-400">試食經驗</span>{' '}
          {row.tasting_experience || '—'}
          <span className="text-slate-300 mx-1">|</span>
          <span className="text-slate-400">Openrice</span>{' '}
          {row.openrice_level || '—'}
        </p>

        <div className="flex items-center gap-1.5 min-w-0">
          {fb ? (
            <a
              href={fb}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[#1877F2] hover:underline shrink-0"
            >
              <Facebook size={12} />
              Facebook
            </a>
          ) : (
            <span className="text-slate-400 inline-flex items-center gap-1">
              <Facebook size={12} />
              無 FB
            </span>
          )}
          <span className="text-slate-400">·</span>
          <span className="text-slate-600 truncate">讚好 {formatCount(row.facebook_likes)}</span>
        </div>

        <p className="text-slate-500">
          收錄日期 {formatEntryDate(row)}
        </p>
      </div>
    </button>
  );
}

/** Compact select: label shown via placeholder, fixed narrow width for 2-row toolbar. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = '全部',
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel?: string;
  className?: string;
}) {
  return (
    <Select value={value || '__all__'} onValueChange={(v) => onChange(v === '__all__' ? '' : v)}>
      <SelectTrigger
        className={cn(
          'h-8 w-full min-w-0 text-[11px] bg-white px-1.5 [&>span]:truncate',
          value && 'border-teal-400 text-teal-800',
          className
        )}
        title={value ? `${label}：${value}` : label}
      >
        <SelectValue placeholder={`${label}·${allLabel}`} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">
          {label}·{allLabel}
        </SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || label}
      title={label}
      className={cn(
        'h-8 w-full min-w-0 text-[11px] bg-white px-1.5',
        value && 'border-teal-400',
        className
      )}
    />
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-[13px] py-1.5 border-b border-slate-50 last:border-0">
      <dt className="text-slate-400 shrink-0">{label}</dt>
      <dd className="text-slate-800 break-words min-w-0">{value || '—'}</dd>
    </div>
  );
}

function LinkValue({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <span className="text-slate-400">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline break-all">
      {children}
    </a>
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
  const [view, setView] = useState<ViewMode>('gallery');
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<KolProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showImportHint, setShowImportHint] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllKolProfiles();
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
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

    const list = rows.filter((r) => {
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
      if (igMin != null && !Number.isNaN(igMin) && (r.instagram_followers ?? 0) < igMin) return false;
      if (igMax != null && !Number.isNaN(igMax) && (r.instagram_followers ?? 0) > igMax) return false;
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

    return list.sort((a, b) => entryDateSortKey(b) - entryDateSortKey(a));
  }, [rows, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const openCreate = () => {
    setCreating(true);
    setEditing(true);
    setDetail(null);
    setForm(emptyForm());
  };

  const openDetail = (row: KolProfile) => {
    setDetail(row);
    setCreating(false);
    setEditing(false);
    setForm(rowToForm(row));
  };

  const closeDrawer = () => {
    setDetail(null);
    setCreating(false);
    setEditing(false);
    setForm(emptyForm());
  };

  const startEditFromDetail = () => {
    if (!detail) return;
    setForm(rowToForm(detail));
    setEditing(true);
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
        const { data, error: err } = await supabase
          .from('kol_profile')
          .insert({
            ...payload,
            raw_payload: {
              themeLabel: themeLabel({
                blog_themes: payload.blog_themes || [],
                raw_payload: null,
              }),
            },
          })
          .select('*')
          .single();
        if (err) throw err;
        toast.success('已新增 KOL');
        setCreating(false);
        setEditing(false);
        setDetail(data as KolProfile);
      } else if (detail) {
        const { data, error: err } = await supabase
          .from('kol_profile')
          .update(payload)
          .eq('id', detail.id)
          .select('*')
          .single();
        if (err) throw err;
        toast.success('已儲存');
        setEditing(false);
        setDetail(data as KolProfile);
      }
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

  const drawerOpen = Boolean(detail) || creating;
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageTo = Math.min(safePage * PAGE_SIZE, filtered.length);

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">KOL列表</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              共 {rows.length} 位博客 · 符合條件 {filtered.length} 位
              {filtered.length > 0 && (
                <span className="text-slate-400">
                  {' '}
                  · 顯示 {pageFrom}–{pageTo}
                </span>
              )}
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
            <Button
              type="button"
              className="h-10 bg-emerald-600 hover:bg-emerald-700"
              onClick={openCreate}
            >
              <Plus size={16} />
              新增KOL
            </Button>
          </div>
        </div>

        {/* 固定兩行：每欄均分寬度，不 wrap 到第三行 */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(6,minmax(0,1fr))_auto] gap-1.5 items-center">
            <div className="relative min-w-0">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="名稱/IG/電話"
                className="pl-6 h-8 text-[11px] bg-white"
              />
            </div>
            <FilterSelect
              label="年齡層"
              value={filters.ageGroup}
              onChange={(v) => setFilters((f) => ({ ...f, ageGroup: v }))}
              options={filterOptions.ageGroup}
            />
            <FilterSelect
              label="出生月"
              value={filters.birthMonth}
              onChange={(v) => setFilters((f) => ({ ...f, birthMonth: v }))}
              options={filterOptions.birthMonth}
            />
            <FilterInput
              label="地區"
              value={filters.area}
              onChange={(v) => setFilters((f) => ({ ...f, area: v }))}
              placeholder="地區"
            />
            <FilterSelect
              label="主題"
              value={filters.theme}
              onChange={(v) => setFilters((f) => ({ ...f, theme: v }))}
              options={filterOptions.theme}
              allLabel="全部"
            />
            <FilterInput
              label="IG下限"
              value={filters.igMin}
              onChange={(v) => setFilters((f) => ({ ...f, igMin: v }))}
              placeholder="IG↓"
            />
            <FilterInput
              label="IG上限"
              value={filters.igMax}
              onChange={(v) => setFilters((f) => ({ ...f, igMax: v }))}
              placeholder="IG↑"
            />
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'px-2 py-1 text-[11px] rounded',
                  view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'
                )}
              >
                列表
              </button>
              <button
                type="button"
                onClick={() => setView('gallery')}
                className={cn(
                  'px-2 py-1 text-[11px] rounded',
                  view === 'gallery' ? 'bg-slate-900 text-white' : 'text-slate-600'
                )}
              >
                相片牆
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(8,minmax(0,1fr))_auto] gap-1.5 items-center">
            <FilterSelect
              label="Openrice"
              value={filters.openriceLevel}
              onChange={(v) => setFilters((f) => ({ ...f, openriceLevel: v }))}
              options={filterOptions.openriceLevel}
              allLabel="不限"
            />
            <FilterInput
              label="發佈平台"
              value={filters.publishPlatforms}
              onChange={(v) => setFilters((f) => ({ ...f, publishPlatforms: v }))}
              placeholder="發佈平台"
            />
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
              label="Model"
              value={filters.modelExperience}
              onChange={(v) => setFilters((f) => ({ ...f, modelExperience: v }))}
              options={filterOptions.modelExperience}
              allLabel="不限"
            />
            <FilterSelect
              label="Wine"
              value={filters.wineClub}
              onChange={(v) => setFilters((f) => ({ ...f, wineClub: v }))}
              options={filterOptions.wineClub}
              allLabel="不限"
            />
            <FilterInput
              label="專長"
              value={filters.specialty}
              onChange={(v) => setFilters((f) => ({ ...f, specialty: v }))}
              placeholder="專長"
            />
            <FilterInput
              label="合作意向"
              value={filters.cooperationIntent}
              onChange={(v) => setFilters((f) => ({ ...f, cooperationIntent: v }))}
              placeholder="合作意向"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11px] text-slate-500 shrink-0"
              onClick={() => {
                setSearch('');
                setFilters(emptyFilters());
              }}
            >
              清除
            </Button>
          </div>
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
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <UserRound size={28} className="opacity-50" />
          <p className="text-[14px]">沒有符合條件的 KOL</p>
        </div>
      ) : (
        <>
          {view === 'gallery' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {pageRows.map((row) => (
                <KolCard key={row.id} row={row} onClick={() => openDetail(row)} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">姓名</th>
                    <th className="text-left font-medium px-3 py-2">性別</th>
                    <th className="text-left font-medium px-3 py-2">年齡層</th>
                    <th className="text-left font-medium px-3 py-2">電話</th>
                    <th className="text-left font-medium px-3 py-2">IG</th>
                    <th className="text-left font-medium px-3 py-2">粉絲</th>
                    <th className="text-left font-medium px-3 py-2">Openrice</th>
                    <th className="text-left font-medium px-3 py-2">收錄日期</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => openDetail(row)}
                    >
                      <td className="px-3 py-2 font-medium">{row.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{genderLabel(row.salutation)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.age_group || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{row.phone || '—'}</td>
                      <td className="px-3 py-2 text-teal-700">{formatIg(row.instagram_account) || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{formatCount(row.instagram_followers)}</td>
                      <td className="px-3 py-2 text-slate-600">{row.openrice_level || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{formatEntryDate(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pb-2">
            <p className="text-[12px] text-slate-500">
              每頁 {PAGE_SIZE} 筆 · 第 {safePage} / {totalPages} 頁
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
                上一頁
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0) {
                    const prev = arr[idx - 1];
                    if (typeof prev === 'number' && p - prev > 1) acc.push('…');
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === '…' ? (
                    <span key={`e-${idx}`} className="px-1 text-slate-400 text-[12px]">
                      …
                    </span>
                  ) : (
                    <Button
                      key={p}
                      type="button"
                      variant={p === safePage ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一頁
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Import hint */}
      {showImportHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3">
            <div className="flex items-start justify-between">
              <h2 className="text-[16px] font-semibold">匯入說明</h2>
              <button
                type="button"
                onClick={() => setShowImportHint(false)}
                className="text-slate-400 hover:text-slate-700"
              >
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowImportHint(false);
                  void load();
                }}
              >
                重新載入
              </Button>
              <Button type="button" onClick={() => setShowImportHint(false)}>
                知道了
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Right detail drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            aria-label="關閉"
            onClick={closeDrawer}
          />
          <aside className="relative w-full max-w-md sm:max-w-lg h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold truncate">
                  {creating ? '新增KOL' : detail?.name || 'KOL 詳情'}
                </h2>
                {!creating && detail && (
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {themeLabel(detail)} · 收錄 {formatEntryDate(detail)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {editing || creating ? (
                <div className="space-y-4">
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
                    <FormField label="Facebook">
                      <Input value={form.facebook_url} onChange={(e) => setFormField('facebook_url', e.target.value)} className="h-9" />
                    </FormField>
                    <FormField label="FB 讚好數">
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
              ) : detail ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="relative w-28 h-28 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                      {detail.photo_url ? (
                        <img
                          src={detail.photo_url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-1">
                          <Camera size={20} />
                          <span className="text-[10px]">未有相片</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[18px] font-semibold">{detail.name || '（未填姓名）'}</p>
                      <p className="text-[13px] text-slate-600">
                        {genderLabel(detail.salutation)} · {detail.age_group || '—'}
                      </p>
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-[#f4a261] text-white text-[11px]">
                        {themeLabel(detail)}
                      </span>
                    </div>
                  </div>

                  <section>
                    <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      基礎信息
                    </h3>
                    <dl>
                      <DetailRow label="姓名" value={detail.name} />
                      <DetailRow label="性別" value={genderLabel(detail.salutation)} />
                      <DetailRow label="稱謂" value={detail.salutation} />
                      <DetailRow label="年齡層" value={detail.age_group} />
                      <DetailRow label="出生月份" value={detail.birth_month} />
                      <DetailRow label="電話" value={detail.phone} />
                      <DetailRow label="電郵" value={detail.email} />
                      <DetailRow label="居住地區" value={detail.residence_area} />
                      <DetailRow label="工作地區" value={detail.work_area} />
                    </dl>
                  </section>

                  <section>
                    <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      社媒信息
                    </h3>
                    <dl>
                      <DetailRow
                        label="Instagram"
                        value={
                          detail.instagram_account ? (
                            <span>
                              <LinkValue href={igUrl(detail.instagram_account)}>
                                {formatIg(detail.instagram_account)}
                              </LinkValue>
                              <span className="text-slate-500"> · 粉絲 {formatCount(detail.instagram_followers)}</span>
                            </span>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <DetailRow label="試食經驗" value={detail.tasting_experience} />
                      <DetailRow label="試食頻率" value={detail.tasting_frequency} />
                      <DetailRow
                        label="Openrice"
                        value={
                          <span>
                            {detail.openrice_level || '—'}
                            {detail.openrice_url && (
                              <>
                                {' · '}
                                <LinkValue href={detail.openrice_url}>連結</LinkValue>
                              </>
                            )}
                          </span>
                        }
                      />
                      <DetailRow
                        label="Facebook"
                        value={
                          detail.facebook_url ? (
                            <span>
                              <LinkValue href={facebookHref(detail.facebook_url)}>
                                {detail.facebook_url}
                              </LinkValue>
                              <span className="text-slate-500"> · 讚好 {formatCount(detail.facebook_likes)}</span>
                            </span>
                          ) : (
                            `讚好 ${formatCount(detail.facebook_likes)}`
                          )
                        }
                      />
                      <DetailRow
                        label="小紅書"
                        value={
                          detail.xiaohongshu_url ? (
                            <span>
                              <LinkValue href={detail.xiaohongshu_url}>{detail.xiaohongshu_url}</LinkValue>
                              <span className="text-slate-500">
                                {' '}
                                · 粉絲 {formatCount(detail.xiaohongshu_followers)}
                              </span>
                            </span>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <DetailRow
                        label="YouTube"
                        value={
                          detail.youtube_url ? (
                            <span>
                              <LinkValue href={detail.youtube_url}>{detail.youtube_url}</LinkValue>
                              <span className="text-slate-500">
                                {' '}
                                · 訂閱 {formatCount(detail.youtube_subscribers)}
                              </span>
                            </span>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <DetailRow label="Blog" value={<LinkValue href={detail.blog_url}>{detail.blog_url}</LinkValue>} />
                      <DetailRow label="發佈平台" value={detail.publish_platforms} />
                      <DetailRow label="收錄日期" value={formatEntryDate(detail)} />
                    </dl>
                  </section>

                  <section>
                    <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      其他
                    </h3>
                    <dl>
                      <DetailRow label="主題" value={(detail.blog_themes || []).join('、') || detail.specialty} />
                      <DetailRow label="專長" value={detail.specialty} />
                      <DetailRow label="Model 經驗" value={detail.model_experience} />
                      <DetailRow label="上鏡經驗" value={detail.on_camera_experience} />
                      <DetailRow label="Wine Club" value={detail.wine_club} />
                      <DetailRow label="可試食時間" value={detail.available_times} />
                      <DetailRow label="合作意向" value={detail.cooperation_intent} />
                      <DetailRow label="Entry #" value={detail.entry_number} />
                      <DetailRow label="來源狀態" value={detail.source_status} />
                      <DetailRow label="Referrer" value={detail.referrer_url} />
                    </dl>
                  </section>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0 bg-white">
              {editing || creating ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (creating) closeDrawer();
                      else {
                        setEditing(false);
                        if (detail) setForm(rowToForm(detail));
                      }
                    }}
                    disabled={saving}
                  >
                    取消
                  </Button>
                  <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    儲存
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={closeDrawer}>
                    關閉
                  </Button>
                  <Button type="button" onClick={startEditFromDetail}>
                    編輯
                  </Button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
