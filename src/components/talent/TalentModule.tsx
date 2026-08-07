import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Star, Link2, Copy, Check, X, Calendar,
  Tag, Users, Camera, FileText, Loader2, ExternalLink, Pencil,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { getSiteOrigin } from '@/lib/siteUrl';
import { useAuth } from '@/context/AuthContext';
import { TalentApplicationFormV2 } from '@/components/settings/TalentApplicationFormV2';
import { updateArtistApplyV2, type ArtistApplyV2Form } from '@/lib/artist-apply-api';
import {
  createPendingReportItem,
  localDateString,
  resolveBubbleStaffId,
  updatePendingReportHours,
} from '@/services/reportLinkService';
import { VolunteerRecruitmentModule } from '@/components/marketing/VolunteerRecruitmentModule';
import { KolListModule, type KolProfile } from '@/components/talent/KolListModule';
import { KolCooperatedModule } from '@/components/talent/KolCooperatedModule';
import { KolApplyModule } from '@/components/talent/KolApplyModule';

// =====================================================================
// Types
// =====================================================================
type Region = 'HK' | 'SZ' | 'OTHER';
type CooperationStage = 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5';

const TALENT_LIST_PAGE_SIZE = 20;

const hasModelExperience = (value: string | null | undefined): boolean =>
  !!value && /^有/.test(value.trim());

const kolSalutationToGender = (salutation: string | null | undefined): string | undefined => {
  const s = (salutation || '').trim();
  if (!s) return undefined;
  if (/小姐|女士|Ms|Miss|Mrs/i.test(s)) return '女';
  if (/先生|Mr/i.test(s)) return '男';
  return s;
};

const kolResidenceToRegion = (area: string | null | undefined): Region => {
  if (!area) return 'HK';
  if (/深圳|SZ/i.test(area)) return 'SZ';
  return 'HK';
};

const parseKolAge = (ageGroup: string | null | undefined): number | undefined => {
  if (!ageGroup?.trim()) return undefined;
  const n = Number(ageGroup);
  if (!Number.isNaN(n) && n > 0) return n;
  const m = ageGroup.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
};

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
  gender?: string;
  height?: number;
  measurements?: string;     // e.g. 32-24-34
  instagramAccount?: string;
  region: Region;
  // Tags
  categories: TalentCategoryId[];
  hasLiveExperience: boolean;
  aspirations?: string;      // 志向 / 夢想
  // Status
  cooperationStage: CooperationStage;
  recentVideoCount: number;
  // Ratings
  rating?: TalentRating;
  overallRating?: number;    // computed average 1-10
  // Interview
  hasInterviewed: boolean;
  interviewScheduledAt?: string;
  interviewNotes?: string;
  reportHours?: number;
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

const STAGE_LABELS: Record<CooperationStage, { text: string; color: string }> = {
  stage1: { text: 'Stage1：邀請', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  stage2: { text: 'Stage2：待面試', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  stage3: { text: 'Stage3：待合作', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  stage4: { text: 'Stage4：有合作', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  stage5: { text: 'Stage5：停止合作', color: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const COOPERATION_STAGES: CooperationStage[] = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'];

const migrateCooperationStage = (value: unknown): CooperationStage => {
  if (value === 'stage1' || value === 'stage2' || value === 'stage3' || value === 'stage4' || value === 'stage5') {
    return value;
  }
  if (value === 'not_yet') return 'stage1';
  if (value === 'pending') return 'stage3';
  if (value === 'cooperated') return 'stage4';
  return 'stage3';
};

const extractInstagramAccount = (payload: Record<string, unknown> | null | undefined): string | undefined => {
  const raw = payload?.instagramAccount;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return raw.trim();
};

const formatInstagramHandle = (account: string): string => {
  const trimmed = account.trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed.replace(/^@/, '')}`;
};

const instagramProfileUrl = (account: string): string => {
  const handle = account.replace(/^@/, '').trim();
  return `https://instagram.com/${encodeURIComponent(handle)}`;
};

const getStageDisplay = (stage: CooperationStage): { text: string; color: string } =>
  STAGE_LABELS[stage];

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
    return Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[]).map(row => ({
          ...(row as Talent),
          cooperationStage: migrateCooperationStage(
            (row as Record<string, unknown>).cooperationStage
            ?? (row as Record<string, unknown>).cooperationStatus,
          ),
        }))
      : seedTalents;
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
// Cooperation overlay — frontend-only localStorage until backend lands
// =====================================================================
const COOPERATION_STORAGE_KEY = 'mps:talent-cooperation';

type CooperationOverlay = {
  collaborations: CollaborationRecord[];
};

const loadAllCooperationOverlays = (): Record<string, CooperationOverlay> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COOPERATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, CooperationOverlay>) : {};
  } catch {
    return {};
  }
};

const loadCooperationOverlay = (talentId: string): CooperationOverlay | null =>
  loadAllCooperationOverlays()[talentId] ?? null;

const saveCooperationOverlay = (talentId: string, overlay: CooperationOverlay) => {
  if (typeof window === 'undefined') return;
  try {
    const all = loadAllCooperationOverlays();
    all[talentId] = overlay;
    window.localStorage.setItem(COOPERATION_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore quota / private mode
  }
};

const getCooperationCount = (talent: Talent): number => {
  const overlay = loadCooperationOverlay(talent.id);
  if (overlay?.collaborations.length) return overlay.collaborations.length;
  return talent.collaborations.length;
};

const resolveTalentFormId = (
  talent: Talent & { _formId?: string; _legacyFormId?: string },
  formIdByToken: Record<string, string>,
  formIdByLegacyId: Record<string, string>,
): string | undefined =>
  talent._formId
  || (talent._legacyFormId ? formIdByLegacyId[talent._legacyFormId] : undefined)
  || (talent.inviteToken ? formIdByToken[talent.inviteToken] : undefined);

const createMockCollaborations = (): CollaborationRecord[] => [
  {
    id: `mock_${Date.now()}_1`,
    date: '2024-03-15',
    projectTitle: '品牌宣傳片拍攝',
    videoLink: 'https://example.com/video/brand-campaign',
    fee: 8000,
    rating: 4,
    notes: '準時到場，鏡頭感佳，與團隊配合順暢。',
  },
  {
    id: `mock_${Date.now()}_2`,
    date: '2024-06-01',
    projectTitle: '直播帶貨活動',
    fee: 12000,
    rating: 5,
    notes: '口才流利，帶貨節奏佳，現場應變能力強。',
  },
];

const formatCooperationDate = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('zh-HK');
};

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
  report_hours: number | null;
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
  cooperation_stage?: CooperationStage | null;
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

function SkillCheckboxRow({
  checkedIds,
  readOnly = false,
  onToggle,
}: {
  checkedIds: Set<TalentCategoryId> | TalentCategoryId[];
  readOnly?: boolean;
  onToggle?: (id: TalentCategoryId) => void;
}) {
  const checked = checkedIds instanceof Set ? checkedIds : new Set(checkedIds);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {TALENT_CATEGORIES.map(c => (
        <label
          key={c.id}
          className={cn('inline-flex items-center gap-1.5', !readOnly && 'cursor-pointer')}
        >
          <input
            type="checkbox"
            checked={checked.has(c.id)}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={readOnly ? undefined : () => onToggle?.(c.id)}
            className="w-3.5 h-3.5 accent-teal-600 shrink-0"
          />
          <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">{c.label}</span>
        </label>
      ))}
    </div>
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
    cooperationStage: 'stage3',
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
  gender: c.gender || undefined,
  height: c.height ? Number(c.height) || undefined : undefined,
  instagramAccount: extractInstagramAccount(c.payload),
  measurements: undefined,
  region: (c.region === 'HK' || c.region === 'SZ' ? c.region : 'OTHER') as Region,
  categories: c.categories || [],
  hasLiveExperience: false,
  aspirations: undefined,
  cooperationStage: migrateCooperationStage(c.cooperation_stage ?? 'stage3'),
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

/** KOL with Model experience → artist row (always stage3). */
const kolRowToTalent = (k: KolProfile): Talent & { _kol: true } => ({
  id: `kol_${k.id}`,
  name: k.name?.trim() || '（未填姓名）',
  stageName: undefined,
  age: parseKolAge(k.age_group),
  gender: kolSalutationToGender(k.salutation),
  height: undefined,
  instagramAccount: k.instagram_account?.trim() || undefined,
  measurements: undefined,
  region: kolResidenceToRegion(k.residence_area),
  categories: ['photo_model'],
  hasLiveExperience: false,
  aspirations: k.model_experience || undefined,
  cooperationStage: 'stage3',
  recentVideoCount: 0,
  hasInterviewed: false,
  galleryUrls: [],
  collaborations: [],
  photoUrl: k.photo_url?.trim() || k.work_photo_url?.trim() || undefined,
  _kol: true,
});

async function fetchModelExperienceKols(): Promise<KolProfile[]> {
  const pageSize = 1000;
  const all: KolProfile[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('kol_profile')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = (data as KolProfile[]) || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all.filter((k) => hasModelExperience(k.model_experience));
}

function TalentList() {
  const { talents, add, update, remove } = useTalents();
  const [confirmed, setConfirmed] = useState<ConfirmedArtistRow[]>([]);
  const [confirmedLoading, setConfirmedLoading] = useState(true);
  const [confirmedError, setConfirmedError] = useState<string | null>(null);
  const [kolModel, setKolModel] = useState<KolProfile[]>([]);
  const [kolLoading, setKolLoading] = useState(true);
  const [kolError, setKolError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | Region>('all');
  const [skillFilters, setSkillFilters] = useState<Set<TalentCategoryId>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | CooperationStage>('all');
  const [liveOnly, setLiveOnly] = useState(false);
  const [page, setPage] = useState(1);
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
  const [cooperationTarget, setCooperationTarget] = useState<Talent | null>(null);
  const [cooperationOverlayVersion, setCooperationOverlayVersion] = useState(0);
  const [stageSelectTarget, setStageSelectTarget] = useState<Talent | null>(null);
  const [submissionModalFormId, setSubmissionModalFormId] = useState<string | null>(null);
  const [stageUpdating, setStageUpdating] = useState(false);

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
      } else if (rowId.startsWith('kol_')) {
        const kolId = rowId.slice(4);
        const { error } = await supabase
          .from('kol_profile')
          .update({ photo_url: dataUrl })
          .eq('id', kolId);
        if (error) {
          setPhotoUploadError(`更新失敗：${error.message}`);
          return;
        }
        setKolModel(prev => prev.map(k => k.id === kolId ? { ...k, photo_url: dataUrl } : k));
      } else {
        update(rowId, { photoUrl: dataUrl });
      }
      setPhotoPreview(prev => (prev && prev.rowId === rowId ? { ...prev, url: dataUrl } : prev));
    };
    reader.onerror = () => setPhotoUploadError('讀取檔案失敗');
    reader.readAsDataURL(file);
  };

  const reloadConfirmed = async () => {
    try {
      const { data, error } = await supabase
        .from('confirmed_artist')
        .select('*')
        .order('confirmed_at', { ascending: false });
      if (error) {
        setConfirmedError(error.message);
        setConfirmed([]);
      } else {
        setConfirmed((data ?? []) as ConfirmedArtistRow[]);
        setConfirmedError(null);
      }
    } catch (err) {
      setConfirmedError(err instanceof Error ? err.message : '無法載入');
      setConfirmed([]);
    } finally {
      setConfirmedLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConfirmedLoading(true);
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
      setKolLoading(true);
      try {
        const data = await fetchModelExperienceKols();
        if (cancelled) return;
        setKolModel(data);
        setKolError(null);
      } catch (err) {
        if (cancelled) return;
        setKolError(err instanceof Error ? err.message : '無法載入 KOL');
        setKolModel([]);
      } finally {
        if (!cancelled) setKolLoading(false);
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

  const toggleSkillFilter = (id: TalentCategoryId) => {
    setSkillFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const merged: (Talent & { _confirmed?: true; _kol?: true })[] = useMemo(() => {
    const confirmedTalents = confirmed.map(confirmedRowToTalent);
    const existingPhones = new Set(
      [
        ...confirmed.map(c => c.phone?.trim()).filter(Boolean) as string[],
        ...talents.map(t => (t as Talent & { phone?: string }).phone?.trim()).filter(Boolean) as string[],
      ],
    );
    const importedKolIds = new Set(
      confirmed
        .map(c => c.payload?.kol_profile_id)
        .filter((id): id is string => typeof id === 'string' && !!id),
    );
    const kolTalents = kolModel
      .filter(k => {
        if (importedKolIds.has(k.id)) return false;
        const phone = k.phone?.trim();
        if (phone && existingPhones.has(phone)) return false;
        return true;
      })
      .map(kolRowToTalent);

    return [...confirmedTalents, ...kolTalents, ...talents];
  }, [confirmed, kolModel, talents]);

  const filtered = useMemo(() => merged.filter(t => {
    if (search && !`${t.name} ${t.stageName || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (regionFilter !== 'all' && t.region !== regionFilter) return false;
    if (skillFilters.size > 0 && !t.categories.some(c => skillFilters.has(c))) return false;
    if (statusFilter !== 'all' && t.cooperationStage !== statusFilter) return false;
    if (liveOnly && !t.hasLiveExperience) return false;
    return true;
  }), [merged, search, regionFilter, skillFilters, statusFilter, liveOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TALENT_LIST_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * TALENT_LIST_PAGE_SIZE;
    return filtered.slice(start, start + TALENT_LIST_PAGE_SIZE);
  }, [filtered, safePage]);
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * TALENT_LIST_PAGE_SIZE + 1;
  const pageTo = Math.min(safePage * TALENT_LIST_PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [search, regionFilter, skillFilters, statusFilter, liveOnly]);

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
      const kolTargets = targets.filter(t => (t as any)._kol);
      const localTargets = targets.filter(t => !(t as any)._confirmed && !(t as any)._kol);

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

      // 3) KOL-sourced rows: hide from artist list only (keep kol_profile intact).
      if (kolTargets.length > 0) {
        const hideIds = new Set(kolTargets.map(t => t.id.replace(/^kol_/, '')));
        setKolModel(prev => prev.filter(k => !hideIds.has(k.id)));
      }

      // 4) Refresh list from supabase so the UI reflects the deletion.
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

  const handleStageChange = async (talent: Talent, stage: CooperationStage) => {
    setStageUpdating(true);
    try {
      if (talent.id.startsWith('ca_')) {
        const supabaseId = talent.id.slice(3);
        const { error } = await supabase
          .from('confirmed_artist')
          .update({ cooperation_stage: stage })
          .eq('id', supabaseId);
        if (error) throw error;
        setConfirmed(prev => prev.map(c =>
          c.id === supabaseId ? { ...c, cooperation_stage: stage } : c,
        ));
      } else if (talent.id.startsWith('kol_')) {
        // Promote KOL overlay into confirmed_artist so stage changes persist.
        const kolId = talent.id.slice(4);
        const kol = kolModel.find(k => k.id === kolId);
        if (!kol) throw new Error('找不到對應 KOL 資料');
        const { data, error } = await supabase
          .from('confirmed_artist')
          .insert({
            name_zh: kol.name,
            gender: kolSalutationToGender(kol.salutation) ?? null,
            age: kol.age_group,
            phone: kol.phone,
            region: kolResidenceToRegion(kol.residence_area),
            photo_url: kol.photo_url || kol.work_photo_url || null,
            categories: ['photo_model'],
            payload: {
              source: 'kol_profile',
              kol_profile_id: kol.id,
              instagramAccount: kol.instagram_account,
              model_experience: kol.model_experience,
              email: kol.email,
              residence_area: kol.residence_area,
            },
            source: 'direct',
            cooperation_stage: stage,
          })
          .select('*')
          .single();
        if (error) throw error;
        setConfirmed(prev => [data as ConfirmedArtistRow, ...prev]);
        setKolModel(prev => prev.filter(k => k.id !== kolId));
      } else {
        update(talent.id, { cooperationStage: stage });
      }
      setCooperationOverlayVersion(v => v + 1);
      setStageSelectTarget(null);
    } catch (err) {
      alert(`更新合作狀態失敗：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setStageUpdating(false);
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
      <div className="space-y-3">
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | CooperationStage)}
            className="px-3 py-1.5 border border-border rounded-md text-[13px]"
          >
            <option value="all">所有合作狀態</option>
            {COOPERATION_STAGES.map(stage => (
              <option key={stage} value={stage}>{STAGE_LABELS[stage].text}</option>
            ))}
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12px] font-medium text-muted-foreground shrink-0">技能</span>
          <SkillCheckboxRow checkedIds={skillFilters} onToggle={toggleSkillFilter} />
        </div>
        <div className="text-[12px] text-muted-foreground">
          顯示 {filtered.length} 位藝人
          {filtered.length > 0 && `（第 ${pageFrom}–${pageTo} 筆）`}
          {(confirmedLoading || kolLoading) && '（讀取中…）'}
          {confirmedError && <span className="text-rose-600 ml-2">已取錄載入失敗：{confirmedError}</span>}
          {kolError && <span className="text-rose-600 ml-2">KOL 載入失敗：{kolError}</span>}
          {photoUploadError && <span className="text-rose-600 ml-2">{photoUploadError}</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="暫無藝人資料" hint="點擊右上「新增藝人」直接加入，或前往「新增藝人」頁面產生自助填表連結。" />
      ) : (
        <>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-3" aria-label="選取" />
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">藝人</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">基本資料</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">技能</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">合作狀態</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">合作&評價</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">綜合評分</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(t => (
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
                    <div className="space-y-1">
                      <div>
                        {[
                          t.age && `${t.age}歲`,
                          t.gender,
                          t.height && `${t.height}cm`,
                        ].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div>
                        {t.instagramAccount ? (
                          <button
                            type="button"
                            onClick={() => window.open(instagramProfileUrl(t.instagramAccount!), '_blank', 'noopener,noreferrer')}
                            className="text-teal-600 hover:underline"
                          >
                            {formatInstagramHandle(t.instagramAccount)}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        {(() => {
                          const formId = resolveTalentFormId(t as Talent & { _formId?: string; _legacyFormId?: string }, formIdByToken, formIdByLegacyId);
                          if (!formId) return <span className="text-muted-foreground">—</span>;
                          return (
                            <button
                              type="button"
                              onClick={() => setSubmissionModalFormId(formId)}
                              className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-md font-medium bg-teal-600 text-white hover:bg-teal-700 shadow-sm transition-colors"
                            >
                              <FileText size={12} />
                              藝人詳情
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.categories.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : t.categories.map(c => <CategoryChip key={c} id={c} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      void cooperationOverlayVersion;
                      const stageDisplay = getStageDisplay(t.cooperationStage);
                      return (
                        <button
                          type="button"
                          onClick={() => setStageSelectTarget(t)}
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] cursor-pointer hover:opacity-80 transition-opacity',
                            stageDisplay.color,
                          )}
                        >
                          {stageDisplay.text}
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setCooperationTarget(t)}
                      className="text-[12px] text-teal-700 hover:underline"
                    >
                      {getCooperationCount(t)}次合作
                    </button>
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[12px] text-muted-foreground">
            每頁 {TALENT_LIST_PAGE_SIZE} 筆 · 第 {safePage} / {totalPages} 頁
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft size={14} />
              上一頁
            </button>
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
                  <span key={`e-${idx}`} className="px-1 text-muted-foreground text-[12px]">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={cn(
                      'h-8 w-8 rounded-md border text-[12px] font-medium',
                      p === safePage
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {p}
                  </button>
                ),
              )}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border text-[12px] font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
            >
              下一頁
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        </>
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
                cooperationStage: 'stage3',
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

      {cooperationTarget && (
        <CollaborationReviewModal
          key={`${cooperationTarget.id}-${cooperationOverlayVersion}`}
          talent={cooperationTarget}
          onClose={() => setCooperationTarget(null)}
          onUpdate={() => setCooperationOverlayVersion(v => v + 1)}
          onStageChange={(stage) => handleStageChange(cooperationTarget, stage)}
        />
      )}

      {stageSelectTarget && (
        <StageSelectModal
          talent={stageSelectTarget}
          currentStage={stageSelectTarget.cooperationStage}
          saving={stageUpdating}
          onClose={() => !stageUpdating && setStageSelectTarget(null)}
          onSelect={(stage) => handleStageChange(stageSelectTarget, stage)}
        />
      )}

      {submissionModalFormId && (
        <TalentSubmissionModal
          formId={submissionModalFormId}
          onClose={() => setSubmissionModalFormId(null)}
          onUpdated={reloadConfirmed}
        />
      )}
    </div>
  );
}

// =====================================================================
// Modal helper
// =====================================================================
function Modal({ title, onClose, children, width = 'max-w-[640px]', headerAction }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  headerAction?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={cn('bg-white rounded-lg shadow-xl w-full max-h-[85vh] flex flex-col', width)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-[16px] font-bold">{title}</h3>
          <div className="flex items-center gap-2">
            {headerAction}
            <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function StageSelectModal({
  talent,
  currentStage,
  saving,
  onClose,
  onSelect,
}: {
  talent: Talent;
  currentStage: CooperationStage;
  saving: boolean;
  onClose: () => void;
  onSelect: (stage: CooperationStage) => void;
}) {
  return (
    <Modal title={`選擇合作狀態 — ${talent.stageName || talent.name}`} onClose={onClose} width="max-w-[420px]">
      <div className="px-5 py-4 space-y-2">
        {COOPERATION_STAGES.map(stage => {
          const display = STAGE_LABELS[stage];
          const active = stage === currentStage;
          return (
            <button
              key={stage}
              type="button"
              disabled={saving}
              onClick={() => onSelect(stage)}
              className={cn(
                'w-full text-left rounded-md border px-3 py-2.5 text-[13px] transition-colors disabled:opacity-50',
                active
                  ? cn(display.color, 'font-medium')
                  : 'border-border bg-white hover:bg-muted/30',
              )}
            >
              {display.text}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

interface SubmissionArtistApplyRow {
  id: string;
  invite_token: string | null;
  application_date: string | null;
  name_zh: string | null;
  name_en: string | null;
  display_name: string | null;
  gender: string | null;
  birth_date: string | null;
  age: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  raw_payload: Record<string, unknown> | null;
  submitted_at: string;
}

function TalentSubmissionModal({
  formId,
  onClose,
  onUpdated,
}: {
  formId: string;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const [row, setRow] = useState<SubmissionArtistApplyRow | null>(null);
  const [resolvedApplyId, setResolvedApplyId] = useState<string | null>(null);
  const [applicantSignature, setApplicantSignature] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const loadSubmission = async (targetFormId: string) => {
    setLoading(true);
    setError(null);
    const { data: directData, error: directError } = await supabase
      .from('artist_apply')
      .select('*')
      .eq('id', targetFormId)
      .maybeSingle();

    let applyRow = directData as SubmissionArtistApplyRow | null;
    let applyError = directError;

    if (!applyRow && !directError) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('artist_apply')
        .select('*')
        .filter('raw_payload->>legacyTalentFormId', 'eq', targetFormId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      applyRow = legacyData as SubmissionArtistApplyRow | null;
      applyError = legacyError;
    }

    if (applyError) {
      setError(applyError.message);
      setRow(null);
      setResolvedApplyId(null);
      setLoading(false);
      return;
    }

    if (!applyRow) {
      setRow(null);
      setResolvedApplyId(null);
      setError('找不到此筆資料');
      setLoading(false);
      return;
    }

    const { data: photoData, error: photoError } = await supabase
      .from('artist_apply_photo')
      .select('data_url')
      .eq('artist_apply_id', applyRow.id)
      .eq('file_role', 'applicant_signature')
      .order('created_at', { ascending: false })
      .limit(1);

    if (photoError) {
      setError(photoError.message);
      setRow(null);
      setResolvedApplyId(null);
    } else {
      setRow(applyRow);
      setResolvedApplyId(applyRow.id);
      const signatureRow = photoData?.[0] as { data_url: string | null } | undefined;
      setApplicantSignature(signatureRow?.data_url || '');
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSubmission(formId);
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [formId]);

  const formInitialValue = row ? {
    ...((row.raw_payload as Record<string, unknown>) || {}),
    applicationDate: row.application_date || '',
    nameZh: row.name_zh || '',
    nameEn: row.name_en || '',
    displayName: row.display_name || '',
    gender: row.gender || '',
    birthDate: row.birth_date || '',
    age: row.age || '',
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    email: row.email || '',
    applicantSignature,
  } : undefined;

  const handleSave = async (form: ArtistApplyV2Form) => {
    if (!resolvedApplyId) throw new Error('找不到此筆申請資料。');
    await updateArtistApplyV2(resolvedApplyId, form, row?.invite_token);
    await loadSubmission(resolvedApplyId);
    await onUpdated?.();
    setIsEditing(false);
    setSaveSuccess(new Date().toLocaleString('zh-HK'));
  };

  return (
    <Modal
      title={isEditing ? '編輯申請表格' : '申請表格'}
      onClose={onClose}
      width="max-w-[980px]"
      headerAction={
        !loading && !error && row ? (
          isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] border border-border rounded-md hover:bg-muted/40"
            >
              取消編輯
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSaveSuccess(null);
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700"
            >
              <Pencil size={13} />
              編輯
            </button>
          )
        ) : null
      }
    >
      <div className="overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[13px]">載入中…</span>
          </div>
        ) : error || !row || !formInitialValue ? (
          <div className="py-10 text-center">
            <p className="text-[14px] font-bold text-rose-600 mb-1">無法載入表格</p>
            <p className="text-[12px] text-muted-foreground">{error || '可能已被刪除或連結不正確。'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <p className="text-[12px] text-muted-foreground">
                遞交時間：{new Date(row.submitted_at).toLocaleString('zh-HK')}
              </p>
              {saveSuccess && (
                <p className="text-[12px] text-teal-700 font-medium">已保存修改（{saveSuccess}）</p>
              )}
            </div>
            <TalentApplicationFormV2
              key={isEditing ? `edit-${resolvedApplyId}` : `view-${resolvedApplyId}`}
              mode={isEditing ? 'edit' : 'view'}
              inviteToken={row.invite_token || undefined}
              initialValue={formInitialValue}
              onSave={handleSave}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function CollaborationReviewModal({
  talent,
  onClose,
  onUpdate,
  onStageChange,
}: {
  talent: Talent;
  onClose: () => void;
  onUpdate: () => void;
  onStageChange: (stage: CooperationStage) => void | Promise<void>;
}) {
  const [overlay, setOverlay] = useState<CooperationOverlay>(() => {
    const existing = loadCooperationOverlay(talent.id);
    if (existing && existing.collaborations.length > 0) return existing;
    if (existing) return existing;
    if (talent.collaborations.length > 0) {
      const initial = { collaborations: talent.collaborations };
      saveCooperationOverlay(talent.id, initial);
      return initial;
    }
    const initial = { collaborations: createMockCollaborations() };
    saveCooperationOverlay(talent.id, initial);
    return initial;
  });
  const [selectedId, setSelectedId] = useState<string>(() => overlay.collaborations[0]?.id ?? '');

  useEffect(() => {
    if (overlay.collaborations.length === 0) {
      setSelectedId('');
      return;
    }
    if (!overlay.collaborations.some(c => c.id === selectedId)) {
      setSelectedId(overlay.collaborations[0].id);
    }
  }, [overlay.collaborations, selectedId]);

  const persist = (next: CooperationOverlay) => {
    setOverlay(next);
    saveCooperationOverlay(talent.id, next);
    onUpdate();
  };

  const selected = overlay.collaborations.find(c => c.id === selectedId);

  const handleStopCooperation = () => {
    if (talent.cooperationStage === 'stage5') return;
    if (!confirm(`確認停止與 ${talent.name} 的合作？`)) return;
    void onStageChange('stage5');
  };

  return (
    <Modal title={`合作 & 評價 — ${talent.stageName || talent.name}`} onClose={onClose} width="max-w-[900px]">
      <div className="flex flex-col min-h-[360px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          <div className="rounded-md border border-border bg-muted/10 p-3 min-h-[280px] flex flex-col">
            <h4 className="text-[13px] font-bold mb-3">合作紀錄</h4>
            <div className="flex-1 overflow-y-auto space-y-2">
              {overlay.collaborations.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">暫無合作紀錄。</p>
              ) : (
                overlay.collaborations.map(item => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
                        active
                          ? 'border-teal-300 bg-teal-50'
                          : 'border-border bg-white hover:bg-muted/30',
                      )}
                    >
                      <div className="text-[11px] text-muted-foreground mb-1">
                        {formatCooperationDate(item.date)}
                      </div>
                      <div className="text-[13px] font-medium text-[#0d1a2d]">{item.projectTitle}</div>
                      {item.videoLink && (
                        <div className="text-[11px] text-teal-600 mt-1 truncate">{item.videoLink}</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/10 p-3 min-h-[280px] flex flex-col">
            <h4 className="text-[13px] font-bold mb-3">評價（備註）</h4>
            <div className="flex-1 rounded-md border border-border bg-white px-3 py-2.5 text-[13px] leading-6 whitespace-pre-wrap overflow-y-auto">
              {selected?.notes?.trim()
                ? selected.notes
                : <span className="text-muted-foreground">暫無評價備註。</span>}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={handleStopCooperation}
            disabled={talent.cooperationStage === 'stage5'}
            className="px-4 py-2 text-[13px] border border-rose-200 text-rose-600 rounded-md hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            停止合作
          </button>
        </div>
      </div>
    </Modal>
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
      cooperationStage: 'stage1',
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
              完成後會自動加入藝人列表並標記為「Stage1：邀請」。
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
  onSave: (rating: TalentRating, notes: string, scheduledAt: string, reportHours: number, mediaUrl?: string) => void;
  onCancel: () => void;
}) {
  const [r, setR] = useState<TalentRating>(talent.rating || {
    appearance: 7, speaking: 7, posture: 7, personality: 7, oncamera: 7,
  });
  const [notes, setNotes] = useState(talent.interviewNotes || '');
  const [scheduledAt, setScheduledAt] = useState(talent.interviewScheduledAt || '');
  const [reportHours, setReportHours] = useState<number>(talent.reportHours ?? 0);
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
        <label className="text-[12px] font-medium text-muted-foreground block mb-1">匯報工時 (h) *</label>
        <input
          type="number"
          step={0.5}
          min={0.5}
          max={12}
          value={reportHours || ''}
          onChange={(e) => setReportHours(parseFloat(e.target.value) || 0)}
          placeholder="例如：1.5"
          className="w-full px-3 py-2 border border-border rounded-md text-[13px]"
        />
        <p className="text-[11px] text-muted-foreground mt-1">完成面試時填寫，將自動帶入工作匯報</p>
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
          onClick={() => {
            if (!reportHours || reportHours <= 0) {
              alert('請填寫匯報工時（必須大於 0）');
              return;
            }
            onSave(r, notes, scheduledAt, reportHours, mediaUrl || undefined);
          }}
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
  const { systemUser } = useAuth();
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
          'id, invite_token, application_date, name_zh, name_en, gender, age, phone, whatsapp, height, weight, raw_payload, submitted_at, status, interviewed, interview_rating, interview_overall, interview_notes, interview_scheduled_at, audition_media_urls, report_hours'
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
          report_hours: row.report_hours != null ? Number(row.report_hours) : null,
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
        cooperation_stage: 'stage3',
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
              cooperationStage: 'stage1',
              recentVideoCount: 0,
              hasInterviewed: editing.interviewed,
              interviewNotes: editing.interview_notes || undefined,
              interviewScheduledAt: editing.interview_scheduled_at || undefined,
              auditionMediaUrls: editing.audition_media_urls || [],
              collaborations: [],
              rating: editing.interview_rating || undefined,
              overallRating: editing.interview_overall ?? undefined,
              reportHours: editing.report_hours ?? undefined,
            }}
            onCancel={() => setEditing(null)}
            onSave={async (rating, notes, scheduledAt, reportHours, mediaUrl) => {
              try {
                const staffId = await resolveBubbleStaffId(systemUser);
                if (!staffId) {
                  alert('無法識別當前用戶，請確認員工資料已同步。');
                  return;
                }

                const newMedia = mediaUrl
                  ? [...(editing.audition_media_urls || []), mediaUrl]
                  : editing.audition_media_urls || [];
                const wasInterviewed = editing.interviewed;
                const { error } = await supabase
                  .from('artist_apply')
                  .update({
                    interview_rating: rating,
                    interview_overall: computeOverall(rating),
                    interview_notes: notes,
                    interview_scheduled_at: scheduledAt || null,
                    interviewed: true,
                    report_hours: reportHours,
                    audition_media_urls: newMedia,
                  })
                  .eq('id', editing.id);
                if (error) throw error;

                const artistName = formDisplayName(editing);
                if (!wasInterviewed) {
                  await createPendingReportItem({
                    staffId,
                    reportDate: localDateString(),
                    sourceModule: 'talent',
                    sourceType: 'interview',
                    sourceId: editing.id,
                    category: 'talent_interview',
                    title: `完成藝人面試 — ${artistName}`,
                    suggestedHours: reportHours,
                    metadata: {
                      artistName,
                      overall: computeOverall(rating),
                    },
                  });
                } else {
                  await updatePendingReportHours(
                    staffId,
                    'talent',
                    'interview',
                    editing.id,
                    reportHours,
                  );
                }

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
  const cooperated = talents.filter(t => t.cooperationStage === 'stage4' || t.collaborations.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="已合作藝人" subtitle="快速查看曾合作藝人、合作次數、費用及適合類型。" />

      {cooperated.length === 0 ? (
        <EmptyState icon={Users} title="尚無合作紀錄" hint="在「藝人列表」將合作狀態設為「Stage4：有合作」即可顯示。" />
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
    case 'kol-food':
      return <KolListModule workflowView="food" />;
    case 'kol-beauty':
      return <KolListModule workflowView="beauty" />;
    case 'kol-new-beauty':
      return <KolListModule workflowView="new-beauty" />;
    case 'kol-shortlist':
      return <KolListModule workflowView="shortlist" />;
    case 'kol-meeting':
      return <KolListModule workflowView="meeting" />;
    case 'kol-cooperated':
      return <KolCooperatedModule />;
    case 'kol-star':
      return <KolListModule workflowView="star" />;
    case 'kol-list':
      return <KolListModule workflowView="all" />;
    case 'kol-apply':
      return <KolApplyModule />;
    case 'kol-campaigns':
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight">KOL活動</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              管理 KOL 活動、公開報名連結與篩選結果。
            </p>
          </div>
          <VolunteerRecruitmentModule />
        </div>
      );
    case 'list':
    default:
      return <TalentList />;
  }
}
