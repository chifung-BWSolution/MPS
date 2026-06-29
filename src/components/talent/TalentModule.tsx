import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Star, Link2, Copy, Check, X, Pencil, Calendar,
  Tag, Users, Camera, FileText, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { getSiteOrigin } from '@/lib/siteUrl';

// =====================================================================
// Types
// =====================================================================
type Region = 'HK' | 'SZ' | 'OTHER';
type CooperationStatus = 'cooperated' | 'pending' | 'not_yet';

const TALENT_CATEGORIES = [
  { id: 'photo_model', label: '平面拍攝模特兒' },
  { id: 'event_model', label: '活動模特兒' },
  { id: 'host', label: '主持人（上台型）' },
  { id: 'vo', label: 'VO（聲音演出）' },
  { id: 'self_media', label: '自媒體 / 直播藝人' },
] as const;

type TalentCategoryId = typeof TALENT_CATEGORIES[number]['id'] | string;

interface TalentRating {
  appearance: number;       // 外表 / 上鏡感 1-10
  speaking: number;          // 講話流利度 / 聲音
  posture: number;           // 儀態
  personality: number;       // 性格
  oncamera: number;          // 上鏡感
}

interface CollaborationRecord {
  id: string;
  date: string;
  projectTitle: string;
  videoLink?: string;
  fee: number;
  rating: number;            // 1-5
  notes?: string;
}

interface Talent {
  id: string;
  photoUrl?: string;
  galleryUrls: string[];
  // Basic
  name: string;
  stageName?: string;
  age?: number;
  height?: number;
  measurements?: string;     // e.g. 32-24-34
  region: Region;
  // Tags
  categories: TalentCategoryId[];
  hasLiveExperience: boolean;
  aspirations?: string;      // 志向 / 夢想
  // Status
  cooperationStatus: CooperationStatus;
  recentVideoCount: number;
  // Ratings
  rating?: TalentRating;
  overallRating?: number;    // computed average 1-10
  // Interview
  hasInterviewed: boolean;
  interviewScheduledAt?: string;
  interviewNotes?: string;
  auditionMediaUrls?: string[];
  // Collaboration history
  collaborations: CollaborationRecord[];
  // Self-fill invite
  inviteToken?: string;
  inviteCreatedAt?: string;
  inviteSubmittedAt?: string;
}

const REGION_LABELS: Record<Region, string> = {
  HK: '香港',
  SZ: '深圳',
  OTHER: '其他',
};

const COOP_LABELS: Record<CooperationStatus, { text: string; color: string }> = {
  cooperated: { text: '已合作', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  pending: { text: '待跟進', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_yet: { text: '未合作', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const categoryLabel = (id: TalentCategoryId): string => {
  const known = TALENT_CATEGORIES.find(c => c.id === id);
  return known?.label || id;
};

// =====================================================================
// Sample seed data (replaced once Supabase is wired up)
// =====================================================================
const seedTalents: Talent[] = [];

// =====================================================================
// Persisted store — hydrates from localStorage so invite links survive refresh.
// Will be replaced by a Supabase-backed store once the talents schema lands.
// =====================================================================
const TALENTS_STORAGE_KEY = 'mps:talents';

const loadTalents = (): Talent[] => {
  if (typeof window === 'undefined') return seedTalents;
  try {
    const raw = window.localStorage.getItem(TALENTS_STORAGE_KEY);
    if (!raw) return seedTalents;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Talent[]) : seedTalents;
  } catch {
    return seedTalents;
  }
};

const persistTalents = (list: Talent[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TALENTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be unavailable (private mode, quota); fall back silently.
  }
};

let _talents: Talent[] = loadTalents();
const _subscribers = new Set<() => void>();
function notify() {
  persistTalents(_talents);
  _subscribers.forEach(fn => fn());
}

function useTalents() {
  const [, force] = useState(0);
  useMemo(() => {
    const sub = () => force(n => n + 1);
    _subscribers.add(sub);
    return () => _subscribers.delete(sub);
  }, []);
  return {
    talents: _talents,
    add: (t: Talent) => { _talents = [..._talents, t]; notify(); },
    update: (id: string, patch: Partial<Talent>) => {
      _talents = _talents.map(t => t.id === id ? { ...t, ...patch } : t);
      notify();
    },
    remove: (id: string) => { _talents = _talents.filter(t => t.id !== id); notify(); },
  };
}

const computeOverall = (r?: TalentRating) => {
  if (!r) return undefined;
  const v = (r.appearance + r.speaking + r.posture + r.personality + r.oncamera) / 5;
  return Math.round(v * 10) / 10;
};

const newId = () => `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// =====================================================================
// Supabase-backed pipeline rows
// =====================================================================
interface TalentFormRow {
  id: string;
  invite_token: string | null;
  fill_date: string | null;
  name_zh: string | null;
  name_en: string | null;
  gender: string | null;
  age: string | null;
  phone: string | null;
  wechat: string | null;
  height: string | null;
  weight: string | null;
  payload: Record<string, any> | null;
  signature_image: string | null;
  submitted_at: string;
  status: 'submitted' | 'pending' | 'confirmed' | 'rejected';
  interviewed: boolean;
  interview_rating: TalentRating | null;
  interview_overall: number | null;
  interview_notes: string | null;
  interview_scheduled_at: string | null;
  audition_media_urls: string[] | null;
}

interface ArtistApplyPhotoRow {
  artist_apply_id: string;
  file_role: string;
  data_url: string | null;
}

interface ConfirmedArtistRow {
  id: string;
  source_form_id: string | null;
  artist_apply_id?: string | null;
  invite_token: string | null;
  name_zh: string | null;
  name_en: string | null;
  gender: string | null;
  age: string | null;
  phone: string | null;
  wechat: string | null;
  height: string | null;
  weight: string | null;
  region: string | null;
  photo_url: string | null;
  categories: string[];
  rating: TalentRating | null;
  overall_rating: number | null;
  interview_notes: string | null;
  payload: Record<string, any> | null;
  signature_image: string | null;
  source: 'direct' | 'after_interview';
  confirmed_at: string;
}

const formDisplayName = (row: { name_zh: string | null; name_en: string | null }) =>
  row.name_zh || row.name_en || '（待填寫）';

const residenceToRegion = (residence: unknown): Region => {
  const first = Array.isArray(residence) ? residence[0] : null;
  const value = typeof residence === 'string' ? residence : first;
  if (value === '香港' || value === 'HK' || value === 'hk') return 'HK';
  if (value === '深圳' || value === 'SZ' || value === 'sz') return 'SZ';
  return 'OTHER';
};

const legacyTalentFormId = (row: TalentFormRow): string | null => {
  const value = row.payload?.legacyTalentFormId;
  return typeof value === 'string' && value ? value : null;
};

// =====================================================================
// Shared UI helpers
// =====================================================================
function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <Icon size={20} className="text-muted-foreground" />
      </div>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {hint && <p className="text-[12px] text-muted-foreground mt-1 max-w-[400px]">{hint}</p>}
    </div>
  );
}

function CategoryChip({ id }: { id: TalentCategoryId }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px]">
      {categoryLabel(id)}
    </span>
  );
}

// =====================================================================
// Talent Form (used for add / edit / self-fill)
// =====================================================================
function TalentForm({
  initial,
  onSave,
  onCancel,
  submitLabel = '保存',
}: {
  initial?: Partial<Talent>;
  onSave: (data: Partial<Talent>) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<Partial<Talent>>({
    name: '',
    region: 'HK',
    categories: [],
    cooperationStatus: 'not_yet',
    hasLiveExperience: false,
    hasInterviewed: false,
    galleryUrls: [],
    collaborations: [],
    recentVideoCount: 0,
    ...initial,
  });
  const [rating, setRating] = useState<TalentRating>(
    initial?.rating || { appearance: 7, speaking: 7, posture: 7, personality: 7, oncamera: 7 },
  );
  const [interviewNotes, setInterviewNotes] = useState(initial?.interviewNotes || '');
  const initialMedia = initial?.auditionMediaUrls || [];
  // Split the existing URLs into a plain URL slot (first http(s)) and an
  // uploaded data-URL slot (first data:) so the form can edit each part
  // independently while preserving any extras through `mediaExtras`.
  const initialUrl = initialMedia.find(u => /^https?:\/\//i.test(u)) || '';
  const initialFileDataUrl = initialMedia.find(u => u.startsWith('data:')) || '';
  const mediaExtras = initialMedia.filter(u => u !== initialUrl && u !== initialFileDataUrl);
  const [auditionUrl, setAuditionUrl] = useState(initialUrl);
  const [auditionFile, setAuditionFile] = useState(initialFileDataUrl);
  const [auditionFileName, setAuditionFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handlePhotoPick = (file: File | null) => {
    setPhotoError(null);
    if (!file) {
      set('photoUrl', undefined);
      return;
    }
    const okType = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/tiff', 'image/webp'].includes(file.type);
    if (!okType) {
      setPhotoError('僅支援 PNG / JPG / JPEG / SVG / TIFF / WebP 格式');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError('檔案大小上限為 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      set('photoUrl', result);
    };
    reader.onerror = () => setPhotoError('讀取檔案失敗');
    reader.readAsDataURL(file);
  };

  const set = <K extends keyof Talent>(key: K, value: Talent[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleCategory = (id: TalentCategoryId) => {
    const list = form.categories || [];
    set('categories', list.includes(id) ? list.filter(c => c !== id) : [...list, id]);
  };

  const handleFilePick = (file: File | null) => {
    setFileError(null);
    if (!file) {
      setAuditionFile('');
      setAuditionFileName('');
      return;
    }
    const okType = ['image/jpeg', 'image/png', 'image/jpg'].includes(file.type);
    if (!okType) {
      setFileError('僅支援 .jpg / .jpeg / .png 格式');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('檔案大小上限為 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAuditionFile(typeof reader.result === 'string' ? reader.result : '');
      setAuditionFileName(file.name);
    };
    reader.onerror = () => setFileError('讀取檔案失敗');
    reader.readAsDataURL(file);
  };

  const Slider = ({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[12px] font-medium text-muted-foreground">{label}</label>
        <span className="text-[13px] font-bold text-teal-700">{value}/10</span>
      </div>
      <input
        type="range" min={1} max={10} step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-600"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Photo upload */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">藝人頭像</label>
        <div className="flex items-start gap-3">
          <label
            className="relative flex items-center justify-center w-24 h-24 rounded-md border border-dashed border-border bg-muted/30 cursor-pointer overflow-hidden hover:border-teal-500 hover:bg-muted/50 transition-colors"
            title="點擊上傳圖片"
          >
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="頭像預覽" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-muted-foreground">
                <Plus size={20} />
                <span className="text-[10.5px] mt-0.5">上傳頭像</span>
              </div>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/tiff,image/webp,.png,.jpg,.jpeg,.svg,.tif,.tiff,.webp"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => handlePhotoPick(e.target.files?.[0] || null)}
            />
          </label>
          <div className="text-[11px] text-muted-foreground space-y-1 pt-1">
            <p>支援 PNG / JPG / JPEG / SVG / TIFF / WebP，上限 10MB，僅可上傳一張。</p>
            {form.photoUrl && (
              <button
                type="button"
                onClick={() => { set('photoUrl', undefined); setPhotoError(null); }}
                className="text-rose-600 hover:underline"
              >
                移除圖片
              </button>
            )}
            {photoError && <p className="text-rose-600">{photoError}</p>}
          </div>
        </div>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">姓名 *</label>
          <input
            value={form.name || ''}
            onChange={(e) => set('name', e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">藝名</label>
          <input
            value={form.stageName || ''}
            onChange={(e) => set('stageName', e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">年齡</label>
          <input
            type="number"
            value={form.age ?? ''}
            onChange={(e) => set('age', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">身高 (cm)</label>
          <input
            type="number"
            value={form.height ?? ''}
            onChange={(e) => set('height', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">三圍</label>
          <input
            placeholder="32-24-34"
            value={form.measurements || ''}
            onChange={(e) => set('measurements', e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬地區</label>
          <select
            value={form.region}
            onChange={(e) => set('region', e.target.value as Region)}
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          >
            {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Categories */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-2">藝人分類（可多選）</label>
        <div className="flex flex-wrap gap-2">
          {TALENT_CATEGORIES.map(cat => {
            const active = (form.categories || []).includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full border text-[12px] transition-colors',
                  active
                    ? 'bg-purple-100 border-purple-400 text-purple-800'
                    : 'bg-white border-border text-muted-foreground hover:border-purple-300'
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Aspirations + live experience */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">志向 / 發展方向</label>
          <input
            value={form.aspirations || ''}
            onChange={(e) => set('aspirations', e.target.value)}
            placeholder="例如：自媒體、直播、旅遊博主..."
            className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={form.hasLiveExperience || false}
              onChange={(e) => set('hasLiveExperience', e.target.checked)}
              className="w-4 h-4 accent-teal-600"
            />
            有直播經驗
          </label>
        </div>
      </div>

      {/* Interview rating */}
      <div className="space-y-3 bg-muted/30 rounded-md p-4">
        <h4 className="text-[13px] font-bold mb-2">評分項目</h4>
        <Slider label="外表" value={rating.appearance} onChange={(v) => setRating({ ...rating, appearance: v })} />
        <Slider label="上鏡感" value={rating.oncamera} onChange={(v) => setRating({ ...rating, oncamera: v })} />
        <Slider label="講話流利度 / 聲音" value={rating.speaking} onChange={(v) => setRating({ ...rating, speaking: v })} />
        <Slider label="儀態" value={rating.posture} onChange={(v) => setRating({ ...rating, posture: v })} />
        <Slider label="性格" value={rating.personality} onChange={(v) => setRating({ ...rating, personality: v })} />
        <div className="text-right text-[12px] text-muted-foreground pt-2 border-t border-border">
          綜合：<span className="font-bold text-teal-700 text-[14px]">{computeOverall(rating)?.toFixed(1)}</span>
        </div>
      </div>

      {/* Interview notes */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">面試備註</label>
        <textarea
          value={interviewNotes}
          onChange={(e) => setInterviewNotes(e.target.value)}
          rows={3}
          placeholder="例如：態度積極、有主持經驗..."
          className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
        />
      </div>

      {/* Audition media: URL + file picker */}
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">試鏡影片 / 照片 URL（可選）</label>
        <input
          value={auditionUrl}
          onChange={(e) => setAuditionUrl(e.target.value)}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
        />
        <label
          className={cn(
            'mt-2 block w-full border border-dashed rounded-md text-[12px] cursor-pointer transition-colors',
            'border-border hover:border-teal-400 hover:bg-teal-50/40',
          )}
        >
          <input
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={(e) => handleFilePick(e.target.files?.[0] || null)}
            className="hidden"
          />
          <div className="px-3 py-4 flex flex-col items-center justify-center text-muted-foreground gap-1">
            {auditionFile ? (
              <>
                <img src={auditionFile} alt="" className="w-20 h-20 object-cover rounded border border-border" />
                <span className="text-[11.5px]">{auditionFileName || '已選擇檔案'} — 點擊重新選擇</span>
              </>
            ) : (
              <>
                <span className="text-[12.5px] text-foreground">點擊此處上傳檔案</span>
                <span>支援 .jpg / .jpeg / .png ・ 上限 10MB</span>
              </>
            )}
          </div>
        </label>
        {auditionFile && (
          <button
            type="button"
            onClick={() => { setAuditionFile(''); setAuditionFileName(''); }}
            className="mt-1 text-[11.5px] text-rose-600 hover:underline"
          >
            移除檔案
          </button>
        )}
        {fileError && <p className="mt-1 text-[11.5px] text-rose-600">{fileError}</p>}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-[13px] text-muted-foreground hover:bg-muted rounded-md"
        >
          取消
        </button>
        <button
          onClick={() => {
            if (!form.name?.trim()) { alert('請輸入姓名'); return; }
            const media = [
              ...(auditionUrl.trim() ? [auditionUrl.trim()] : []),
              ...(auditionFile ? [auditionFile] : []),
              ...mediaExtras,
            ];
            onSave({
              ...form,
              rating,
              overallRating: computeOverall(rating),
              interviewNotes: interviewNotes.trim() || undefined,
              auditionMediaUrls: media.length > 0 ? media : undefined,
            });
          }}
          className="px-4 py-2 text-[13px] bg-teal-600 text-white rounded-md hover:bg-teal-700"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// 2.1 Talent List
// =====================================================================
// Adapter: turn a ConfirmedArtistRow into a Talent-shaped object so the list
// can render it through the same row template. Marked readOnly for the UI.
const confirmedRowToTalent = (c: ConfirmedArtistRow): Talent & { _confirmed: true; _formId?: string; _legacyFormId?: string; _inviteToken?: string } => ({
  id: `ca_${c.id}`,
  name: c.name_zh || c.name_en || '（未填姓名）',
  stageName: c.name_en || undefined,
  age: c.age ? Number(c.age) || undefined : undefined,
  height: c.height ? Number(c.height) || undefined : undefined,
  measurements: undefined,
  region: (c.region === 'HK' || c.region === 'SZ' ? c.region : 'OTHER') as Region,
  categories: c.categories || [],
  hasLiveExperience: false,
  aspirations: undefined,
  cooperationStatus: 'not_yet',
  recentVideoCount: 0,
  hasInterviewed: true,
  rating: c.rating || undefined,
  overallRating: c.overall_rating ?? undefined,
  interviewNotes: c.interview_notes || undefined,
  galleryUrls: [],
  collaborations: [],
  photoUrl: c.photo_url || undefined,
  _confirmed: true,
  _formId: c.artist_apply_id || undefined,
  _legacyFormId: c.source_form_id || undefined,
  _inviteToken: c.invite_token || undefined,
  inviteToken: c.invite_token || undefined,
});

function TalentList() {
  const { talents, add, update, remove } = useTalents();
  const [confirmed, setConfirmed] = useState<ConfirmedArtistRow[]>([]);
  const [confirmedLoading, setConfirmedLoading] = useState(true);
  const [confirmedError, setConfirmedError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | Region>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CooperationStatus>('all');
  const [liveOnly, setLiveOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Talent | null>(null);
  // Multi-select for the 不錄用 (bulk-reject) action. Keys are display-row ids
  // (e.g. "ca_<uuid>" for confirmed_artist rows, raw id for legacy talents).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ rowId: string; name: string; url?: string } | null>(null);
  const [formIdByToken, setFormIdByToken] = useState<Record<string, string>>({});
  const [formIdByLegacyId, setFormIdByLegacyId] = useState<Record<string, string>>({});
  const [ratingRecordTarget, setRatingRecordTarget] = useState<Talent | null>(null);

  const handleAvatarReplace = (rowId: string, file: File | null) => {
    setPhotoUploadError(null);
    if (!file) return;
    const okType = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/tiff', 'image/webp'].includes(file.type);
    if (!okType) {
      setPhotoUploadError('僅支援 PNG / JPG / JPEG / SVG / TIFF / WebP 格式');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoUploadError('檔案大小上限為 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      if (rowId.startsWith('ca_')) {
        const supabaseId = rowId.slice(3);
        const { error } = await supabase
          .from('confirmed_artist')
          .update({ photo_url: dataUrl })
          .eq('id', supabaseId);
        if (error) {
          setPhotoUploadError(`更新失敗：${error.message}`);
          return;
        }
        setConfirmed(prev => prev.map(c => c.id === supabaseId ? { ...c, photo_url: dataUrl } : c));
      } else {
        update(rowId, { photoUrl: dataUrl });
      }
      setPhotoPreview(prev => (prev && prev.rowId === rowId ? { ...prev, url: dataUrl } : prev));
    };
    reader.onerror = () => setPhotoUploadError('讀取檔案失敗');
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('confirmed_artist')
          .select('*')
          .order('confirmed_at', { ascending: false });
        if (cancelled) return;
        if (error) {
          setConfirmedError(error.message);
          setConfirmed([]);
        } else {
          setConfirmed((data ?? []) as ConfirmedArtistRow[]);
          setConfirmedError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setConfirmedError(err instanceof Error ? err.message : '無法載入');
        setConfirmed([]);
      } finally {
        if (!cancelled) setConfirmedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('artist_apply')
        .select('id, invite_token, raw_payload, submitted_at')
        .order('submitted_at', { ascending: false });
      if (cancelled || error || !data) return;
      const tokenMap: Record<string, string> = {};
      const legacyMap: Record<string, string> = {};
      for (const row of data as { id: string; invite_token: string | null; raw_payload?: Record<string, any> | null }[]) {
        if (row.invite_token && !tokenMap[row.invite_token]) tokenMap[row.invite_token] = row.id;
        const legacyId = row.raw_payload?.legacyTalentFormId;
        if (typeof legacyId === 'string' && legacyId) legacyMap[legacyId] = row.id;
      }
      setFormIdByToken(tokenMap);
      setFormIdByLegacyId(legacyMap);
    })();
    return () => { cancelled = true; };
  }, []);

  const merged: (Talent & { _confirmed?: true })[] = [
    ...confirmed.map(confirmedRowToTalent),
    ...talents,
  ];

  const filtered = merged.filter(t => {
    if (search && !`${t.name} ${t.stageName || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (regionFilter !== 'all' && t.region !== regionFilter) return false;
    if (categoryFilter !== 'all' && !t.categories.includes(categoryFilter)) return false;
    if (statusFilter !== 'all' && t.cooperationStatus !== statusFilter) return false;
    if (liveOnly && !t.hasLiveExperience) return false;
    return true;
  });

  // Drop selections that are no longer visible (e.g. filter changes hid them).
  useEffect(() => {
    setSelected(prev => {
      const visible = new Set(filtered.map(f => f.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filtered]);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkReject = async () => {
    if (selected.size === 0) return;
    setRejecting(true);
    setRejectError(null);
    try {
      const targets = filtered.filter(t => selected.has(t.id));
      const confirmedTargets = targets.filter(t => (t as any)._confirmed);
      const localTargets = targets.filter(t => !(t as any)._confirmed);

      // 1) Insert a snapshot into rejected_artist for the confirmed_artist rows
      //    so audit history survives even after we delete the original record.
      if (confirmedTargets.length > 0) {
        const rejectRows = confirmedTargets.map(t => {
          const original = confirmed.find(c => `ca_${c.id}` === t.id);
          return {
            source_form_id: original?.source_form_id ?? null,
            invite_token: original?.invite_token ?? null,
            name_zh: original?.name_zh ?? null,
            name_en: original?.name_en ?? null,
            phone: original?.phone ?? null,
            payload: {
              from: 'confirmed_artist',
              confirmed_artist_id: original?.id ?? null,
              snapshot: original ?? null,
            },
            signature_image: original?.signature_image ?? null,
            reason: '從藝人列表批次不錄用',
            source: 'after_confirmation',
          };
        });
        const { error: insertErr } = await supabase
          .from('rejected_artist')
          .insert(rejectRows);
        if (insertErr) throw insertErr;

        const ids = confirmedTargets.map(t => t.id.replace(/^ca_/, ''));
        const { error: deleteErr } = await supabase
          .from('confirmed_artist')
          .delete()
          .in('id', ids);
        if (deleteErr) throw deleteErr;
      }

      // 2) For legacy in-memory talents we just drop them from local state —
      //    they were never persisted, so there's no row to mirror in supabase.
      localTargets.forEach(t => remove(t.id));

      // 3) Refresh list from supabase so the UI reflects the deletion.
      setConfirmed(prev =>
        prev.filter(c => !confirmedTargets.some(t => t.id === `ca_${c.id}`))
      );
      setSelected(new Set());
      setShowRejectConfirm(false);
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : '不錄用失敗');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="藝人列表"
        subtitle="管理所有藝人完整資料、評分及合作狀態。"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => selected.size > 0 && setShowRejectConfirm(true)}
              disabled={selected.size === 0}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors active:scale-[0.97]',
                selected.size === 0
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-rose-600 text-white hover:bg-rose-700'
              )}
            >
              <X size={14} />不錄用{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
            >
              <Plus size={14} />新增藝人
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px]">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋姓名 / 藝名..."
            className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value as 'all' | Region)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px]"
        >
          <option value="all">所有地區</option>
          {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px]"
        >
          <option value="all">所有分類</option>
          {TALENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | CooperationStatus)}
          className="px-3 py-1.5 border border-border rounded-md text-[13px]"
        >
          <option value="all">所有合作狀態</option>
          <option value="cooperated">已合作</option>
          <option value="pending">待跟進</option>
          <option value="not_yet">未合作</option>
        </select>
        <label className="flex items-center gap-2 text-[12px] cursor-pointer">
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={(e) => setLiveOnly(e.target.checked)}
            className="w-4 h-4 accent-teal-600"
          />
          僅顯示有直播經驗
        </label>
      </div>

      <div className="text-[12px] text-muted-foreground">
        顯示 {filtered.length} 位藝人
        {confirmedLoading && '（讀取中…）'}
        {confirmedError && <span className="text-rose-600 ml-2">已取錄載入失敗：{confirmedError}</span>}
        {photoUploadError && <span className="text-rose-600 ml-2">{photoUploadError}</span>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="暫無藝人資料" hint="點擊右上「新增藝人」直接加入，或前往「新增藝人」頁面產生自助填表連結。" />
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-3" aria-label="選取" />
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">藝人</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">基本資料</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">分類</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">合作狀態</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">最近影片</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">綜合評分</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">申請表格</th>
                <th className="text-right text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      className="w-4 h-4 accent-rose-600 cursor-pointer"
                      aria-label={`選取 ${t.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoUploadError(null);
                          setPhotoPreview({ rowId: t.id, name: t.name, url: t.photoUrl });
                        }}
                        className="relative w-[100px] h-[100px] rounded-lg overflow-hidden shrink-0 cursor-pointer group border border-border"
                        title="點擊查看大圖 / 更換圖片"
                      >
                        {t.photoUrl ? (
                          <img
                            src={t.photoUrl}
                            alt={t.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center text-[28px] font-bold text-muted-foreground">
                            {t.name.slice(0, 1)}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 text-white text-[11px] font-medium flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          查看大圖
                        </div>
                      </button>
                      <div>
                        <div className="text-[13px] font-medium">{t.stageName || t.name}</div>
                        {t.stageName && <div className="text-[11px] text-muted-foreground">{t.name}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted-foreground">
                    {[
                      t.age && `${t.age}歲`,
                      t.height && `${t.height}cm`,
                      t.measurements,
                      REGION_LABELS[t.region],
                    ].filter(Boolean).join(' · ')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.categories.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : t.categories.map(c => <CategoryChip key={c} id={c} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[11px]', COOP_LABELS[t.cooperationStatus].color)}>
                      {COOP_LABELS[t.cooperationStatus].text}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px]">{t.recentVideoCount}</td>
                  <td className="px-4 py-3">
                    {t.overallRating ? (
                      <button
                        type="button"
                        onClick={() => setRatingRecordTarget(t)}
                        title="查看面試記錄"
                        aria-label={`查看 ${t.name} 的面試記錄`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                      >
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        {t.overallRating.toFixed(1)}
                      </button>
                    ) : <span className="text-[12px] text-muted-foreground">未評</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const formId = (t as any)._formId
                        || ((t as any)._legacyFormId ? formIdByLegacyId[(t as any)._legacyFormId] : undefined)
                        || (t.inviteToken ? formIdByToken[t.inviteToken] : undefined);
                      if (!formId) return <span className="text-[12px] text-muted-foreground">—</span>;
                      const url = `/talent/submissions/${formId}`;
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[12px] text-teal-600 inline-flex items-center gap-1 hover:underline"
                        >
                          開啟表格 <ExternalLink size={12} />
                        </a>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(t as any)._confirmed ? (
                      <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        已取錄
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditing(t)}
                          className="text-muted-foreground hover:text-teal-600 mr-2"
                          title="編輯"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => { if (confirm(`刪除 ${t.name}？`)) remove(t.id); }}
                          className="text-muted-foreground hover:text-rose-600"
                          title="刪除"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <Modal title="新增藝人" onClose={() => setShowAdd(false)}>
          <TalentForm
            onCancel={() => setShowAdd(false)}
            onSave={(data) => {
              const newTalent: Talent = {
                id: newId(),
                name: data.name || '',
                photoUrl: data.photoUrl,
                galleryUrls: [],
                stageName: data.stageName,
                age: data.age,
                height: data.height,
                measurements: data.measurements,
                region: data.region || 'HK',
                categories: data.categories || [],
                hasLiveExperience: data.hasLiveExperience || false,
                aspirations: data.aspirations,
                cooperationStatus: 'not_yet',
                recentVideoCount: 0,
                hasInterviewed: false,
                collaborations: [],
              };
              add(newTalent);
              setShowAdd(false);
            }}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title={`編輯 ${editing.name}`} onClose={() => setEditing(null)}>
          <TalentForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(data) => {
              update(editing.id, data);
              setEditing(null);
            }}
            submitLabel="保存修改"
          />
        </Modal>
      )}

      {/* Bulk reject confirmation */}
      {showRejectConfirm && (
        <Modal
          title="確認不錄用"
          onClose={() => { if (!rejecting) { setShowRejectConfirm(false); setRejectError(null); } }}
          width="max-w-[420px]"
        >
          <div className="px-5 py-4 space-y-3">
            <p className="text-[14px]">
              是否確認不錄用 <span className="font-semibold text-rose-600">{selected.size}</span> 位藝人？
            </p>
            <p className="text-[12px] text-muted-foreground">
              這些藝人會從藝人列表移除，並儲存至「rejected_artist」作為紀錄。
            </p>
            {rejectError && (
              <p className="text-[12px] text-rose-600">錯誤：{rejectError}</p>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowRejectConfirm(false); setRejectError(null); }}
              disabled={rejecting}
              className="px-3 py-1.5 text-[13px] border border-border rounded-md hover:bg-muted disabled:opacity-50"
            >
              否
            </button>
            <button
              type="button"
              onClick={handleBulkReject}
              disabled={rejecting}
              className="px-3 py-1.5 text-[13px] bg-rose-600 text-white rounded-md hover:bg-rose-700 disabled:opacity-50"
            >
              {rejecting ? '處理中…' : '是'}
            </button>
          </div>
        </Modal>
      )}

      {photoPreview && (
        <Modal title={`${photoPreview.name} 的頭像`} onClose={() => { setPhotoPreview(null); setPhotoUploadError(null); }} width="max-w-[860px]">
          <div className="p-5 flex flex-col items-center gap-4">
            <div className="w-[800px] max-w-full aspect-square rounded-lg overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
              {photoPreview.url ? (
                <img src={photoPreview.url} alt={photoPreview.name} className="w-full h-full object-contain" />
              ) : (
                <div className="text-[64px] font-bold text-muted-foreground">{photoPreview.name.slice(0, 1)}</div>
              )}
            </div>
            <label className="px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 cursor-pointer">
              更換圖片
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/tiff,image/webp,.png,.jpg,.jpeg,.svg,.tif,.tiff,.webp"
                className="hidden"
                onChange={(e) => {
                  handleAvatarReplace(photoPreview.rowId, e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
            </label>
            {photoUploadError && (
              <div className="text-[12px] text-rose-600">{photoUploadError}</div>
            )}
          </div>
        </Modal>
      )}

      {ratingRecordTarget && (
        <InterviewRecordModal
          record={talentToInterviewRecord(ratingRecordTarget)}
          onClose={() => setRatingRecordTarget(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// Modal helper
// =====================================================================
function Modal({ title, onClose, children, width = 'max-w-[640px]' }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={cn('bg-white rounded-lg shadow-xl w-full max-h-[85vh] flex flex-col', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// =====================================================================
// 2.2 Invite (self-fill flow)
// =====================================================================
interface SubmittedFormRow {
  id: string;
  invite_token: string | null;
  name_zh: string | null;
  name_en: string | null;
  phone: string | null;
  submitted_at: string;
}

function TalentInvite() {
  const { talents, add, remove } = useTalents();
  const [generated, setGenerated] = useState<{ token: string; talentId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [submissions, setSubmissions] = useState<SubmittedFormRow[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);

  const refreshSubmissions = async () => {
    setSubmissionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('artist_apply')
        .select('id, invite_token, name_zh, name_en, phone, submitted_at')
        .order('submitted_at', { ascending: false });
      if (error) {
        setSubmissionsError(error.message);
        setSubmissions([]);
      } else {
        setSubmissions((data ?? []) as SubmittedFormRow[]);
        setSubmissionsError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '無法載入已填寫名單';
      setSubmissionsError(msg);
      setSubmissions([]);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  useEffect(() => {
    refreshSubmissions();
  }, []);

  const generate = () => {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const id = newId();
    add({
      id,
      name: '（待填寫）',
      photoUrl: undefined,
      galleryUrls: [],
      region: 'HK',
      categories: [],
      hasLiveExperience: false,
      cooperationStatus: 'pending',
      recentVideoCount: 0,
      hasInterviewed: false,
      collaborations: [],
      inviteToken: token,
      inviteCreatedAt: new Date().toISOString(),
    });
    setGenerated({ token, talentId: id });
    setCopied(false);
  };

  const inviteUrl = generated ? `${getSiteOrigin()}/talent/invite/${generated.token}` : '';

  const pending = talents.filter(t => t.inviteToken && !t.inviteSubmittedAt);

  return (
    <div className="space-y-6">
      <PageHeader title="新增藝人" subtitle="一鍵產生自助填表連結，發送給藝人填寫詳細資料。" />

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-teal-50 flex items-center justify-center">
            <Link2 size={18} className="text-teal-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-[14px] font-bold mb-1">產生填表連結</h3>
            <p className="text-[12px] text-muted-foreground mb-3">
              點擊「加入新人」後，系統會產生一個專屬連結。將連結傳送給藝人，他們可自行填寫姓名、照片、三圍、分類等資料；
              完成後會自動加入藝人列表並標記為「待跟進」。
            </p>
            <button
              onClick={generate}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700"
            >
              <Plus size={14} />加入新人，產生連結
            </button>
          </div>
        </div>

        {generated && (
          <div className="border-t border-border pt-4">
            <label className="text-[12px] font-medium text-muted-foreground block mb-2">填表連結</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 px-3 py-2 border border-border rounded-md text-[13px] bg-muted/30 font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-[13px] hover:bg-muted"
              >
                {copied ? <Check size={14} className="text-teal-600" /> : <Copy size={14} />}
                {copied ? '已複製' : '複製'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              （示意連結 — 實際整合時可改為發送 SMS / WhatsApp / Email 自動化推送）
            </p>
          </div>
        )}
      </div>

      {/* Pending list */}
      <div>
        <h3 className="text-[14px] font-bold mb-3">未填寫名單（{pending.length}）</h3>
        {pending.length === 0 ? (
          <EmptyState icon={Link2} title="目前沒有等待填表的藝人" hint="產生連結並發送給藝人後會顯示在這裡。" />
        ) : (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] divide-y divide-border">
            {pending.map(t => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    產生時間：{t.inviteCreatedAt ? new Date(t.inviteCreatedAt).toLocaleString() : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const url = `${getSiteOrigin()}/talent/invite/${t.inviteToken}`;
                      navigator.clipboard.writeText(url);
                    }}
                    className="text-[12px] px-3 py-1.5 border border-border rounded-md hover:bg-muted"
                  >
                    複製連結
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('確定要刪除此筆未填寫紀錄嗎？')) {
                        remove(t.id);
                      }
                    }}
                    className="text-[12px] px-3 py-1.5 border border-rose-200 text-rose-600 rounded-md hover:bg-rose-50"
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submitted list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold">
            已填寫名單（{submissionsLoading ? '…' : submissions.length}）
          </h3>
          <button
            onClick={refreshSubmissions}
            disabled={submissionsLoading}
            className="text-[11px] px-2 py-1 border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            {submissionsLoading ? '載入中…' : '重新整理'}
          </button>
        </div>
        {submissionsError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-md px-4 py-3 text-[12px] text-rose-700">
            載入失敗：{submissionsError}
          </div>
        ) : submissions.length === 0 && !submissionsLoading ? (
          <EmptyState
            icon={FileText}
            title="尚未有人遞交表格"
            hint="待藝人透過填表連結遞交後，這裡會顯示已填寫的表格紀錄。"
          />
        ) : (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] divide-y divide-border">
            {submissions.map(s => {
              const displayName = s.name_zh || s.name_en || '（未填姓名）';
              const url = `/talent/submissions/${s.id}`;
              return (
                <button
                  key={s.id}
                  onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-teal-50/40 transition-colors"
                >
                  <div>
                    <div className="text-[13px] font-medium flex items-center gap-1.5">
                      {displayName}
                      {s.phone && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          · {s.phone}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      遞交時間：{new Date(s.submitted_at).toLocaleString('zh-HK')}
                    </div>
                  </div>
                  <span className="text-[12px] text-teal-600 inline-flex items-center gap-1">
                    開啟表格 <ExternalLink size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// 2.3 Categories
// =====================================================================
function TalentCategoriesView() {
  const { talents } = useTalents();

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    talents.forEach(t => t.categories.forEach(c => { map[c] = (map[c] || 0) + 1; }));
    return map;
  }, [talents]);

  return (
    <div className="space-y-6">
      <PageHeader title="藝人分類" subtitle="目前分類概覽；新增藝人時可選擇對應分類。" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TALENT_CATEGORIES.map(cat => (
          <div key={cat.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-5">
            <div className="flex items-center gap-2 mb-2">
              <Tag size={14} className="text-purple-600" />
              <h3 className="text-[14px] font-bold">{cat.label}</h3>
            </div>
            <div className="text-[24px] font-bold text-foreground">{counts[cat.id] || 0}</div>
            <div className="text-[12px] text-muted-foreground">位藝人</div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
        <p className="text-[12px] text-amber-800">
          <span className="font-medium">提示：</span>分類為多選欄位 — 一位藝人可同時屬於多個分類（例如同時是平面模特兒及主持人）。
          未來可在系統設定中擴展自訂分類。
        </p>
      </div>
    </div>
  );
}

// =====================================================================
// 2.4 Interviews
// =====================================================================
function InterviewRatingEditor({ talent, onSave, onCancel }: {
  talent: Talent;
  onSave: (rating: TalentRating, notes: string, scheduledAt: string, mediaUrl?: string) => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState<TalentRating>(talent.rating || {
    appearance: 7, speaking: 7, posture: 7, personality: 7, oncamera: 7,
  });
  const [notes, setNotes] = useState(talent.interviewNotes || '');
  const [scheduledAt, setScheduledAt] = useState(talent.interviewScheduledAt || '');
  const [mediaUrl, setMediaUrl] = useState('');

  const Slider = ({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[12px] font-medium text-muted-foreground">{label}</label>
        <span className="text-[13px] font-bold text-teal-700">{value}/10</span>
      </div>
      <input
        type="range" min={1} max={10} step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-teal-600"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">面試時間</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
        />
      </div>

      <div className="space-y-3 bg-muted/30 rounded-md p-4">
        <h4 className="text-[13px] font-bold mb-2">評分項目</h4>
        <Slider label="外表" value={r.appearance} onChange={(v) => setR({ ...r, appearance: v })} />
        <Slider label="上鏡感" value={r.oncamera} onChange={(v) => setR({ ...r, oncamera: v })} />
        <Slider label="講話流利度 / 聲音" value={r.speaking} onChange={(v) => setR({ ...r, speaking: v })} />
        <Slider label="儀態" value={r.posture} onChange={(v) => setR({ ...r, posture: v })} />
        <Slider label="性格" value={r.personality} onChange={(v) => setR({ ...r, personality: v })} />
        <div className="text-right text-[12px] text-muted-foreground pt-2 border-t border-border">
          綜合：<span className="font-bold text-teal-700 text-[14px]">{computeOverall(r)?.toFixed(1)}</span>
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">面試備註</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="例如：態度積極、有主持經驗..."
          className="w-full px-3 py-2 border border-border rounded-md text-[13px] outline-none focus:ring-1 focus:ring-teal-600"
        />
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">試鏡影片 / 照片 URL（可選）</label>
        <input
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-[13px] hover:bg-muted rounded-md">取消</button>
        <button
          onClick={() => onSave(r, notes, scheduledAt, mediaUrl || undefined)}
          className="px-4 py-2 text-[13px] bg-teal-600 text-white rounded-md hover:bg-teal-700"
        >
          標記為已面試並保存
        </button>
      </div>
    </div>
  );
}

type InterviewRecordViewModel = {
  displayName: string;
  interview_scheduled_at?: string | null;
  interview_overall?: number | null;
  interview_rating?: TalentRating | null;
  interview_notes?: string | null;
  audition_media_urls?: string[];
};

function formRowToInterviewRecord(row: TalentFormRow): InterviewRecordViewModel {
  return {
    displayName: formDisplayName(row),
    interview_scheduled_at: row.interview_scheduled_at,
    interview_overall: row.interview_overall,
    interview_rating: row.interview_rating,
    interview_notes: row.interview_notes,
    audition_media_urls: row.audition_media_urls || [],
  };
}

function talentToInterviewRecord(t: Talent): InterviewRecordViewModel {
  return {
    displayName: t.name,
    interview_scheduled_at: t.interviewScheduledAt || null,
    interview_overall: t.overallRating ?? null,
    interview_rating: t.rating || null,
    interview_notes: t.interviewNotes || null,
    audition_media_urls: t.auditionMediaUrls || [],
  };
}

function InterviewRecordModal({ record, onClose }: {
  record: InterviewRecordViewModel;
  onClose: () => void;
}) {
  const ratingItems = record.interview_rating
    ? [
        { label: '外表', value: record.interview_rating.appearance },
        { label: '上鏡感', value: record.interview_rating.oncamera },
        { label: '講話流利度 / 聲音', value: record.interview_rating.speaking },
        { label: '儀態', value: record.interview_rating.posture },
        { label: '性格', value: record.interview_rating.personality },
      ]
    : [];
  const notes = record.interview_notes?.trim();
  const mediaUrls = record.audition_media_urls || [];

  return (
    <Modal title={`面試記錄 — ${record.displayName}`} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground mb-1">面試時間</div>
            <div className="text-[13px] font-medium">
              {record.interview_scheduled_at
                ? new Date(record.interview_scheduled_at).toLocaleString('zh-HK')
                : '未記錄'}
            </div>
          </div>
          <div className="rounded-md border border-border bg-amber-50 p-3">
            <div className="text-[11px] text-amber-700 mb-1">綜合評分</div>
            <div className="inline-flex items-center gap-1 text-[18px] font-bold text-amber-700">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              {record.interview_overall != null ? Number(record.interview_overall).toFixed(1) : '—'}
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-[13px] font-bold mb-2">評分項目</h4>
          {ratingItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ratingItems.map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                  <span className="text-[12px] text-muted-foreground">{item.label}</span>
                  <span className="text-[13px] font-bold text-teal-700">{item.value}/10</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">暫無評分明細。</p>
          )}
        </div>

        <div>
          <h4 className="text-[13px] font-bold mb-2 flex items-center gap-1.5">
            <FileText size={14} className="text-muted-foreground" />
            面試備註
          </h4>
          <div className="min-h-[88px] whitespace-pre-wrap rounded-md border border-border bg-muted/20 px-3 py-2 text-[13px] leading-6">
            {notes || <span className="text-muted-foreground">暫無面試記錄。</span>}
          </div>
        </div>

        {mediaUrls.length > 0 && (
          <div>
            <h4 className="text-[13px] font-bold mb-2">試鏡影片 / 照片</h4>
            <div className="space-y-2">
              {mediaUrls.map((url, index) => (
                <a
                  key={`${url}-${index}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-[12px] text-teal-700 hover:bg-teal-50"
                >
                  <span className="truncate">{url.startsWith('data:') ? `已上傳媒體 ${index + 1}` : url}</span>
                  <ExternalLink size={13} className="shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Modal asking which categories to assign when 直接取錄.
function ClassifyArtistModal({
  displayName,
  onCancel,
  onConfirm,
}: {
  displayName: string;
  onCancel: () => void;
  onConfirm: (categoryIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));

  return (
    <Modal title={`加入分類 — ${displayName}`} onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-[12.5px] text-muted-foreground">
          請選擇要加入的分類（可多選）。確認後此藝人會加入「藝人列表」。
        </p>
        <div className="flex flex-wrap gap-2">
          {TALENT_CATEGORIES.map(cat => {
            const active = picked.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggle(cat.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full border text-[12.5px] transition-colors',
                  active
                    ? 'bg-purple-100 border-purple-400 text-purple-800'
                    : 'bg-white border-border text-muted-foreground hover:border-purple-300'
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] text-muted-foreground hover:bg-muted rounded-md"
          >
            取消
          </button>
          <button
            disabled={picked.length === 0}
            onClick={() => onConfirm(picked)}
            className={cn(
              'px-4 py-2 text-[13px] rounded-md text-white',
              picked.length === 0 ? 'bg-muted-foreground/40 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'
            )}
          >
            加入藝人列表
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TalentInterviews() {
  const [rows, setRows] = useState<TalentFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TalentFormRow | null>(null);
  const [recordTarget, setRecordTarget] = useState<TalentFormRow | null>(null);
  const [classifyTarget, setClassifyTarget] = useState<{
    row: TalentFormRow;
    source: 'direct' | 'after_interview';
  } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('artist_apply')
        .select(
          'id, invite_token, application_date, name_zh, name_en, gender, age, phone, whatsapp, height, weight, raw_payload, submitted_at, status, interviewed, interview_rating, interview_overall, interview_notes, interview_scheduled_at, audition_media_urls'
        )
        .neq('status', 'rejected')
        .neq('status', 'confirmed')
        .order('submitted_at', { ascending: false });
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        const applyRows = (data ?? []) as any[];
        const applyIds = applyRows.map(row => row.id);
        let signaturesByApplyId: Record<string, string> = {};

        if (applyIds.length > 0) {
          const { data: photoRows, error: photoError } = await supabase
            .from('artist_apply_photo')
            .select('artist_apply_id, file_role, data_url')
            .in('artist_apply_id', applyIds)
            .eq('file_role', 'applicant_signature');
          if (photoError) throw photoError;
          signaturesByApplyId = ((photoRows ?? []) as ArtistApplyPhotoRow[]).reduce<Record<string, string>>((acc, photo) => {
            if (photo.data_url) acc[photo.artist_apply_id] = photo.data_url;
            return acc;
          }, {});
        }

        setRows(applyRows.map(row => ({
          id: row.id,
          invite_token: row.invite_token,
          fill_date: row.application_date,
          name_zh: row.name_zh,
          name_en: row.name_en,
          gender: row.gender,
          age: row.age,
          phone: row.phone,
          wechat: row.whatsapp,
          height: row.height,
          weight: row.weight,
          payload: row.raw_payload || {},
          signature_image: signaturesByApplyId[row.id] || null,
          submitted_at: row.submitted_at,
          status: row.status,
          interviewed: row.interviewed,
          interview_rating: row.interview_rating,
          interview_overall: row.interview_overall,
          interview_notes: row.interview_notes,
          interview_scheduled_at: row.interview_scheduled_at,
          audition_media_urls: row.audition_media_urls || [],
        })) as TalentFormRow[]);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法載入名單');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const notInterviewed = rows.filter(r => !r.interviewed);
  const interviewed = rows.filter(r => r.interviewed);
  const scheduledCount = rows.filter(r => r.interview_scheduled_at && !r.interviewed).length;

  // === 不會取錄 — copy snapshot to rejected_artist + flip status ===
  const handleReject = async (row: TalentFormRow, source: 'direct' | 'after_interview') => {
    if (!confirm(`確定不會取錄「${formDisplayName(row)}」？此筆會從面試安排移除。`)) return;
    try {
      const { error: insErr } = await supabase.from('rejected_artist').insert({
        source_form_id: legacyTalentFormId(row),
        invite_token: row.invite_token,
        name_zh: row.name_zh,
        name_en: row.name_en,
        phone: row.phone,
        payload: { ...(row.payload || {}), artistApplyId: row.id },
        signature_image: row.signature_image,
        source,
      });
      if (insErr) throw insErr;
      const { error: updErr } = await supabase
        .from('artist_apply')
        .update({ status: 'rejected' })
        .eq('id', row.id);
      if (updErr) throw updErr;
      await refresh();
    } catch (err) {
      alert(`操作失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // === 直接取錄 — open classify modal then write confirmed_artist ===
  const handleAccept = async (categoryIds: string[]) => {
    if (!classifyTarget) return;
    const { row, source } = classifyTarget;
    try {
      const payload = row.payload || {};
      const { error: insErr } = await supabase.from('confirmed_artist').insert({
        source_form_id: legacyTalentFormId(row),
        artist_apply_id: row.id,
        invite_token: row.invite_token,
        name_zh: row.name_zh,
        name_en: row.name_en,
        gender: row.gender,
        age: row.age,
        phone: row.phone,
        wechat: row.wechat,
        height: row.height,
        weight: row.weight,
        region:
          residenceToRegion((payload as any).residence) === 'HK'
            ? 'HK'
            : residenceToRegion((payload as any).residence) === 'SZ'
            ? 'SZ'
            : 'OTHER',
        photo_url: null,
        categories: categoryIds,
        rating: row.interview_rating,
        overall_rating: row.interview_overall,
        interview_notes: row.interview_notes,
        payload: { ...payload, artistApplyId: row.id },
        signature_image: row.signature_image,
        source,
      });
      if (insErr) throw insErr;
      const { error: updErr } = await supabase
        .from('artist_apply')
        .update({ status: 'confirmed' })
        .eq('id', row.id);
      if (updErr) throw updErr;
      setClassifyTarget(null);
      await refresh();
    } catch (err) {
      alert(`操作失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const renderRow = (
    r: TalentFormRow,
    source: 'direct' | 'after_interview',
    extraTrailing?: React.ReactNode
  ) => {
    const name = formDisplayName(r);
    return (
      <div
        key={r.id}
        className="px-4 py-3 flex flex-wrap items-center gap-3"
      >
        {/* Identity */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-[12px] shrink-0">
            {(name || '?').slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{name}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {[r.phone, r.fill_date && `填表：${r.fill_date}`]
                .filter(Boolean)
                .join(' · ') || '—'}
              {r.interview_scheduled_at &&
                ` · 已排：${new Date(r.interview_scheduled_at).toLocaleString('zh-HK')}`}
            </div>
          </div>
        </div>
        {/* Accept / reject cluster — fixed width so it lines up vertically
            between 未見面名單 and 已面試藝人 rows regardless of trailing slot. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setClassifyTarget({ row: r, source })}
            className="text-[11.5px] px-2.5 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
          >
            直接取錄
          </button>
          <button
            onClick={() => handleReject(r, source)}
            className="text-[11.5px] px-2.5 py-1 border border-rose-200 text-rose-600 rounded-md hover:bg-rose-50"
          >
            不會取錄
          </button>
        </div>
        {/* Trailing slot — width matches the widest possible content
            (安排面試 / 評分 button) so the score row aligns with the button row. */}
        <div className="w-[120px] flex items-center justify-end shrink-0">
          {extraTrailing}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="面試安排與評分" subtitle="管理未見面名單、面試排程及評分結果。" />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-center">
          <div className="text-[22px] font-bold text-amber-700">{notInterviewed.length}</div>
          <div className="text-[12px] text-amber-600">未見面</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
          <div className="text-[22px] font-bold text-blue-700">{scheduledCount}</div>
          <div className="text-[12px] text-blue-600">已排期</div>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-md p-4 text-center">
          <div className="text-[22px] font-bold text-teal-700">{interviewed.length}</div>
          <div className="text-[12px] text-teal-600">已面試</div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-md px-4 py-3 text-[12px] text-rose-700">
          載入失敗：{error}
        </div>
      )}

      {/* Not interviewed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold flex items-center gap-2">
            <Calendar size={14} className="text-amber-600" />
            未見面名單{loading ? '' : `（${notInterviewed.length}）`}
          </h3>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-[11px] px-2 py-1 border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            {loading ? '載入中…' : '重新整理'}
          </button>
        </div>
        {notInterviewed.length === 0 && !loading ? (
          <EmptyState icon={Calendar} title="目前沒有未見面藝人" hint="待藝人遞交填表連結後會在這裡顯示。" />
        ) : (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] divide-y divide-border">
            {notInterviewed.map(r =>
              renderRow(
                r,
                'direct',
                <button
                  onClick={() => setEditing(r)}
                  className="text-[12px] px-3 py-1.5 bg-teal-600 text-white rounded-md hover:bg-teal-700"
                >
                  安排面試 / 評分
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Interviewed */}
      <div>
        <h3 className="text-[14px] font-bold mb-3 flex items-center gap-2">
          <Check size={14} className="text-teal-600" />
          已面試藝人{loading ? '' : `（${interviewed.length}）`}
        </h3>
        {interviewed.length === 0 && !loading ? (
          <EmptyState icon={Check} title="尚無已面試紀錄" />
        ) : (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] divide-y divide-border">
            {interviewed.map(r =>
              renderRow(
                r,
                'after_interview',
                r.interview_overall != null ? (
                  <button
                    type="button"
                    onClick={() => setRecordTarget(r)}
                    title="查看面試記錄"
                    aria-label={`查看 ${formDisplayName(r)} 的面試記錄`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  >
                    <Star size={12} className="fill-amber-400 text-amber-400" />
                    {Number(r.interview_overall).toFixed(1)}
                  </button>
                ) : null
              )
            )}
          </div>
        )}
      </div>

      {/* Rating modal */}
      {editing && (
        <Modal title={`面試評分 — ${formDisplayName(editing)}`} onClose={() => setEditing(null)}>
          <InterviewRatingEditor
            talent={{
              id: editing.id,
              name: formDisplayName(editing),
              galleryUrls: [],
              region: residenceToRegion(editing.payload?.residence),
              categories: [],
              hasLiveExperience: false,
              cooperationStatus: 'pending',
              recentVideoCount: 0,
              hasInterviewed: editing.interviewed,
              interviewNotes: editing.interview_notes || undefined,
              interviewScheduledAt: editing.interview_scheduled_at || undefined,
              auditionMediaUrls: editing.audition_media_urls || [],
              collaborations: [],
              rating: editing.interview_rating || undefined,
              overallRating: editing.interview_overall ?? undefined,
            }}
            onCancel={() => setEditing(null)}
            onSave={async (rating, notes, scheduledAt, mediaUrl) => {
              try {
                const newMedia = mediaUrl
                  ? [...(editing.audition_media_urls || []), mediaUrl]
                  : editing.audition_media_urls || [];
                const { error } = await supabase
                  .from('artist_apply')
                  .update({
                    interview_rating: rating,
                    interview_overall: computeOverall(rating),
                    interview_notes: notes,
                    interview_scheduled_at: scheduledAt || null,
                    interviewed: true,
                    audition_media_urls: newMedia,
                  })
                  .eq('id', editing.id);
                if (error) throw error;
                setEditing(null);
                await refresh();
              } catch (err) {
                alert(`保存失敗：${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        </Modal>
      )}

      {/* Classify modal */}
      {classifyTarget && (
        <ClassifyArtistModal
          displayName={formDisplayName(classifyTarget.row)}
          onCancel={() => setClassifyTarget(null)}
          onConfirm={handleAccept}
        />
      )}

      {recordTarget && (
        <InterviewRecordModal
          record={formRowToInterviewRecord(recordTarget)}
          onClose={() => setRecordTarget(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// 2.5 Collaborated talents
// =====================================================================
function TalentCollaborated() {
  const { talents } = useTalents();
  const cooperated = talents.filter(t => t.cooperationStatus === 'cooperated' || t.collaborations.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="已合作藝人" subtitle="快速查看曾合作藝人、合作次數、費用及適合類型。" />

      {cooperated.length === 0 ? (
        <EmptyState icon={Users} title="尚無合作紀錄" hint="在「藝人列表」編輯藝人並將合作狀態設為「已合作」即可顯示。" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cooperated.map(t => {
            const totalSpend = t.collaborations.reduce((s, c) => s + (c.fee || 0), 0);
            const avgRating = t.collaborations.length > 0
              ? t.collaborations.reduce((s, c) => s + c.rating, 0) / t.collaborations.length
              : 0;
            return (
              <div key={t.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-4">
                <div className="flex items-start gap-3">
                  {t.photoUrl ? (
                    <img src={t.photoUrl} alt={t.name} className="w-12 h-12 rounded-md object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center text-[14px] font-bold">
                      {t.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold truncate">{t.stageName || t.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.categories.slice(0, 2).map(c => <CategoryChip key={c} id={c} />)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-[16px] font-bold">{t.collaborations.length}</div>
                    <div className="text-[10px] text-muted-foreground">合作次數</div>
                  </div>
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-[16px] font-bold">${totalSpend.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">累計費用</div>
                  </div>
                  <div className="bg-muted/30 rounded p-2">
                    <div className="text-[16px] font-bold flex items-center justify-center gap-0.5">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      {avgRating ? avgRating.toFixed(1) : '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">平均評價</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Module router
// =====================================================================
export function TalentModule({ subModule }: { subModule?: string }) {
  switch (subModule) {
    case 'invite': return <TalentInvite />;
    case 'categories': return <TalentCategoriesView />;
    case 'interviews': return <TalentInterviews />;
    case 'collaborated': return <TalentCollaborated />;
    case 'list':
    default:
      return <TalentList />;
  }
}
