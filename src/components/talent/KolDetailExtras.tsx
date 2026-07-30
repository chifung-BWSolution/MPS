import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { KolProfile } from '@/components/talent/KolListModule';
import {
  computeOverallScore,
  emptyRatingDraft,
  KOL_PRESET_TAGS,
  RATING_DIMENSIONS,
  refreshKolRatingCache,
  type KolCooperationRow,
  type KolRatingRow,
  type RatingDraft,
} from '@/components/talent/kolRating';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
      {children}
    </h3>
  );
}

function ScorePicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] text-slate-600">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'h-8 w-8 rounded-md text-[13px] font-medium border transition-colors',
              value >= n
                ? 'bg-amber-100 border-amber-400 text-amber-800'
                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
            )}
            aria-label={`${label} ${n} 分`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function KolTagsSection({
  tags,
  onSaved,
}: {
  tags: string[];
  onSaved: (nextTags: string[]) => Promise<void>;
}) {
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [customTag, setCustomTag] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  const toggleTag = (tag: string) => {
    setLocalTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustom = () => {
    const t = customTag.trim();
    if (!t || localTags.includes(t)) return;
    setLocalTags((prev) => [...prev, t]);
    setCustomTag('');
  };

  const saveTags = async () => {
    setSaving(true);
    try {
      await onSaved(localTags);
      toast.success('已更新標籤');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionTitle>標籤</SectionTitle>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {KOL_PRESET_TAGS.map((tag) => {
          const active = localTags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                active
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
              )}
            >
              {tag}
            </button>
          );
        })}
        {localTags
          .filter((t) => !KOL_PRESET_TAGS.includes(t as (typeof KOL_PRESET_TAGS)[number]))
          .map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] bg-teal-600 text-white border border-teal-600"
            >
              {tag}
              <X size={10} />
            </button>
          ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={customTag}
          onChange={(e) => setCustomTag(e.target.value)}
          placeholder="自定義標籤"
          className="h-8 text-[12px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={addCustom}>
          加入
        </Button>
        <Button type="button" size="sm" className="h-8 shrink-0" disabled={saving} onClick={() => void saveTags()}>
          儲存標籤
        </Button>
      </div>
    </section>
  );
}

export function KolRatingSection({
  kolId,
  ratingAvg,
  ratingCount,
  onRated,
}: {
  kolId: string;
  ratingAvg: number | null | undefined;
  ratingCount: number | null | undefined;
  onRated: () => void;
}) {
  const { systemUser, userInfo, user } = useAuth();
  const ratedBy =
    systemUser?.display_name || userInfo?.display_name || user?.email || '同事';

  const [ratings, setRatings] = useState<KolRatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<RatingDraft>(emptyRatingDraft());
  const [notes, setNotes] = useState('');

  const loadRatings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kol_rating')
        .select('*')
        .eq('kol_profile_id', kolId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setRatings((data as KolRatingRow[]) || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
      setRatings([]);
    } finally {
      setLoading(false);
    }
  }, [kolId]);

  useEffect(() => {
    void loadRatings();
  }, [loadRatings]);

  const submitRating = async () => {
    setSaving(true);
    try {
      const overall = computeOverallScore(draft);
      const { error } = await supabase.from('kol_rating').insert({
        kol_profile_id: kolId,
        rated_by: ratedBy,
        ...draft,
        overall_score: overall,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      await refreshKolRatingCache(kolId);
      toast.success(`已提交評分（平均 ${overall.toFixed(1)}）`);
      setDraft(emptyRatingDraft());
      setNotes('');
      await loadRatings();
      onRated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionTitle>評分</SectionTitle>
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 mb-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Star size={14} className="text-amber-500 fill-amber-500" />
          <span className="font-medium text-slate-800">
            {ratingAvg != null ? `${Number(ratingAvg).toFixed(1)} / 5` : '尚未評分'}
          </span>
          <span className="text-slate-500">· {ratingCount ?? 0} 次評分</span>
        </div>
      </div>

      <div className="space-y-3 mb-3">
        {RATING_DIMENSIONS.map((dim) => (
          <ScorePicker
            key={dim.key}
            label={dim.label}
            value={draft[dim.key]}
            onChange={(n) => setDraft((d) => ({ ...d, [dim.key]: n }))}
          />
        ))}
        <div className="space-y-1">
          <Label className="text-[12px] text-slate-600">備註</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-[13px]"
            placeholder="評分備註（可選）"
          />
        </div>
        <Button type="button" size="sm" disabled={saving} onClick={() => void submitRating()}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          提交評分
        </Button>
      </div>

      {loading ? (
        <p className="text-[12px] text-slate-400 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> 載入評分歷史…
        </p>
      ) : ratings.length > 0 ? (
        <ul className="space-y-2 max-h-40 overflow-y-auto">
          {ratings.map((r) => (
            <li key={r.id} className="text-[12px] border-b border-slate-100 pb-2 last:border-0">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-slate-700">{r.rated_by || '—'}</span>
                <span className="text-amber-700">{Number(r.overall_score).toFixed(1)} 分</span>
              </div>
              <p className="text-slate-500">
                {new Date(r.created_at).toLocaleString('zh-HK')}
                {r.notes ? ` · ${r.notes}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-slate-400">尚無評分歷史</p>
      )}
    </section>
  );
}

export function KolCooperationSection({
  kolId,
  canAdd,
}: {
  kolId: string;
  canAdd: boolean;
}) {
  const { systemUser, userInfo, user } = useAuth();
  const createdBy =
    systemUser?.display_name || userInfo?.display_name || user?.email || '同事';

  const [rows, setRows] = useState<KolCooperationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_name: '',
    project_type: '',
    fee: '',
    evaluation: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kol_cooperation')
        .select('*')
        .eq('kol_profile_id', kolId)
        .order('cooperated_at', { ascending: false });
      if (error) throw error;
      setRows((data as KolCooperationRow[]) || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addRecord = async () => {
    if (!form.project_name.trim() && !form.evaluation.trim()) {
      toast.error('請至少填寫項目名稱或評價');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kol_cooperation').insert({
        kol_profile_id: kolId,
        project_name: form.project_name.trim() || null,
        project_type: form.project_type.trim() || null,
        fee: form.fee.trim() || null,
        evaluation: form.evaluation.trim() || null,
        created_by: createdBy,
      });
      if (error) throw error;
      toast.success('已新增合作記錄');
      setForm({ project_name: '', project_type: '', fee: '', evaluation: '' });
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionTitle>合作記錄</SectionTitle>
      {canAdd && (
        <div className="space-y-2 mb-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={form.project_name}
              onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
              placeholder="項目名稱"
              className="h-8 text-[12px]"
            />
            <Input
              value={form.project_type}
              onChange={(e) => setForm((f) => ({ ...f, project_type: e.target.value }))}
              placeholder="項目類型"
              className="h-8 text-[12px]"
            />
            <Input
              value={form.fee}
              onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
              placeholder="收費"
              className="h-8 text-[12px]"
            />
          </div>
          <Textarea
            value={form.evaluation}
            onChange={(e) => setForm((f) => ({ ...f, evaluation: e.target.value }))}
            placeholder="評價 / 備註"
            rows={2}
            className="text-[12px]"
          />
          <Button type="button" size="sm" disabled={saving} onClick={() => void addRecord()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            新增合作記錄
          </Button>
        </div>
      )}
      {loading ? (
        <p className="text-[12px] text-slate-400">載入中…</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-slate-400">尚無合作記錄</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="text-[12px] border border-slate-100 rounded-lg p-2.5">
              <p className="font-medium text-slate-800">{r.project_name || '（未命名項目）'}</p>
              <p className="text-slate-600 mt-0.5">
                {[r.project_type, r.fee ? `收費 ${r.fee}` : null].filter(Boolean).join(' · ') ||
                  '—'}
              </p>
              {r.evaluation && <p className="text-slate-500 mt-1">{r.evaluation}</p>}
              <p className="text-slate-400 mt-1">
                {new Date(r.cooperated_at).toLocaleDateString('zh-HK')}
                {r.created_by ? ` · ${r.created_by}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function KolDetailExtras({
  detail,
  onProfileRefresh,
  onTagsSave,
}: {
  detail: KolProfile;
  onProfileRefresh: () => void;
  onTagsSave: (tags: string[]) => Promise<void>;
}) {
  const status = detail.lifecycle_status || 'unprocessed';
  const showRating = ['shortlist', 'meeting', 'cooperated', 'star'].includes(status);
  const showCoop = ['cooperated', 'star'].includes(status);

  return (
    <div className="space-y-5">
      <KolTagsSection
        tags={detail.tags || []}
        onSaved={(tags) => void onTagsSave(tags)}
      />
      {showRating && (
        <KolRatingSection
          kolId={detail.id}
          ratingAvg={detail.rating_avg}
          ratingCount={detail.rating_count}
          onRated={onProfileRefresh}
        />
      )}
      {showCoop && <KolCooperationSection kolId={detail.id} canAdd />}
    </div>
  );
}
