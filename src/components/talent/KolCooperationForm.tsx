import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  emptyCooperationForm,
  KOL_COOP_PRESET_PLATFORMS,
  saveCooperationRecord,
  type KolCooperationFormValues,
  type KolCooperationRow,
} from '@/components/talent/kolCooperation';

export interface KolPickerOption {
  id: string;
  name: string | null;
  instagram_account: string | null;
  phone: string | null;
}

function PlatformPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (platforms: string[]) => void;
}) {
  const [custom, setCustom] = useState('');

  const toggle = (platform: string) => {
    onChange(
      selected.includes(platform)
        ? selected.filter((p) => p !== platform)
        : [...selected, platform]
    );
  };

  const addCustom = () => {
    const p = custom.trim();
    if (!p || selected.includes(p)) return;
    onChange([...selected, p]);
    setCustom('');
  };

  const customSelected = selected.filter(
    (p) => !KOL_COOP_PRESET_PLATFORMS.includes(p as (typeof KOL_COOP_PRESET_PLATFORMS)[number])
  );

  return (
    <div className="space-y-2">
      <Label className="text-[12px] text-slate-600">合作平台</Label>
      <div className="flex flex-wrap gap-1.5">
        {KOL_COOP_PRESET_PLATFORMS.map((p) => {
          const active = selected.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[12px] border transition-colors',
                active
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
              )}
            >
              {p}
            </button>
          );
        })}
        {customSelected.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[12px] bg-violet-600 text-white border border-violet-600"
          >
            {p}
            <X size={11} />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="手動新增平台（如 TikTok、Threads）"
          className="h-8 text-[12px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={addCustom}>
          添加
        </Button>
      </div>
    </div>
  );
}

function KolPicker({
  value,
  onChange,
  fixedKol,
}: {
  value: string;
  onChange: (id: string, option?: KolPickerOption) => void;
  fixedKol?: KolPickerOption | null;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<KolPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<KolPickerOption | null>(fixedKol || null);

  useEffect(() => {
    if (fixedKol) {
      setSelected(fixedKol);
      onChange(fixedKol.id, fixedKol);
    }
  }, [fixedKol, onChange]);

  const search = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 1) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const pattern = `%${term}%`;
      const { data, error } = await supabase
        .from('kol_profile')
        .select('id, name, instagram_account, phone')
        .or(`name.ilike.${pattern},instagram_account.ilike.${pattern},phone.ilike.${pattern}`)
        .limit(12);
      if (error) throw error;
      setOptions((data as KolPickerOption[]) || []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fixedKol) return;
    const t = window.setTimeout(() => void search(query), 280);
    return () => window.clearTimeout(t);
  }, [query, search, fixedKol]);

  if (fixedKol || selected) {
    const k = selected || fixedKol!;
    return (
      <div className="rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 text-[13px]">
        <p className="font-medium text-slate-800">{k.name || '（未填姓名）'}</p>
        <p className="text-slate-500 text-[12px] mt-0.5">
          {[k.instagram_account, k.phone].filter(Boolean).join(' · ') || '—'}
        </p>
        {!fixedKol && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 mt-1 text-[11px] text-slate-500"
            onClick={() => {
              setSelected(null);
              onChange('');
              setQuery('');
            }}
          >
            重新選擇
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-[12px] text-slate-600">選擇 KOL（S1 篩選）</Label>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋姓名 / IG / 電話"
          className="pl-8 h-9 text-[13px]"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />
        )}
      </div>
      {options.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 border-b border-slate-50 last:border-0"
                onClick={() => {
                  setSelected(opt);
                  onChange(opt.id, opt);
                  setOptions([]);
                  setQuery('');
                }}
              >
                <span className="font-medium">{opt.name || '（未填姓名）'}</span>
                <span className="text-slate-500 ml-2 text-[12px]">
                  {[opt.instagram_account, opt.phone].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && !selected && <p className="text-[11px] text-slate-400">已選 ID: {value}</p>}
    </div>
  );
}

export function KolCooperationForm({
  createdBy,
  fixedKol,
  onSuccess,
  onCancel,
  submitLabel = '儲存合作記錄',
}: {
  createdBy: string;
  fixedKol?: KolPickerOption | null;
  onSuccess: () => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [kolId, setKolId] = useState(fixedKol?.id || '');
  const [form, setForm] = useState(emptyCooperationForm());
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(kolId && form.project_name.trim() && form.cooperation_content.trim()),
    [kolId, form.project_name, form.cooperation_content]
  );

  const handleSubmit = async () => {
    if (!kolId) {
      toast.error('請先選擇 KOL');
      return;
    }
    if (!form.project_name.trim()) {
      toast.error('請填寫合作項目名稱');
      return;
    }
    if (!form.cooperation_content.trim()) {
      toast.error('請填寫合作內容');
      return;
    }
    setSaving(true);
    try {
      const payload: KolCooperationFormValues = {
        kol_profile_id: kolId,
        ...form,
      };
      await saveCooperationRecord(payload, createdBy);
      toast.success('已儲存合作記錄');
      setForm(emptyCooperationForm());
      if (!fixedKol) setKolId('');
      onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <KolPicker value={kolId} fixedKol={fixedKol} onChange={(id) => setKolId(id)} />

      <div className="space-y-1">
        <Label className="text-[12px] text-slate-600">合作項目名稱（S2）</Label>
        <Input
          value={form.project_name}
          onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
          placeholder="例如：夏季新品試食推廣"
          className="h-9 text-[13px]"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[12px] text-slate-600">合作內容（S3）</Label>
        <Textarea
          value={form.cooperation_content}
          onChange={(e) => setForm((f) => ({ ...f, cooperation_content: e.target.value }))}
          placeholder="描述合作形式、交付物、備註等"
          rows={4}
          className="text-[13px]"
        />
      </div>

      <PlatformPicker
        selected={form.platforms}
        onChange={(platforms) => setForm((f) => ({ ...f, platforms }))}
      />

      <div className="space-y-1">
        <Label className="text-[12px] text-slate-600">合作日期（S5）</Label>
        <Input
          type="date"
          value={form.cooperated_at}
          onChange={(e) => setForm((f) => ({ ...f, cooperated_at: e.target.value }))}
          className="h-9 text-[13px] max-w-[200px]"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            取消
          </Button>
        )}
        <Button type="button" disabled={saving || !canSubmit} onClick={() => void handleSubmit()}>
          {saving && <Loader2 size={14} className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function CooperationRecordList({
  rows,
  loading,
}: {
  rows: KolCooperationRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="text-[13px] text-slate-400 flex items-center gap-2 py-8 justify-center">
        <Loader2 size={16} className="animate-spin" /> 載入中…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-[14px]">尚無合作記錄</p>
        <p className="text-[12px] mt-1">點「新增合作記錄」開始記錄與 KOL 的合作</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-[13px] min-w-[720px]">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left font-medium px-3 py-2.5">日期</th>
            <th className="text-left font-medium px-3 py-2.5">KOL</th>
            <th className="text-left font-medium px-3 py-2.5">項目名稱</th>
            <th className="text-left font-medium px-3 py-2.5">平台</th>
            <th className="text-left font-medium px-3 py-2.5">合作內容</th>
            <th className="text-left font-medium px-3 py-2.5">記錄人</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                {new Date(r.cooperated_at).toLocaleDateString('zh-HK')}
              </td>
              <td className="px-3 py-2.5 font-medium text-slate-800">
                {r.kol_profile?.name || '—'}
                {r.kol_profile?.instagram_account && (
                  <span className="block text-[11px] font-normal text-teal-600">
                    {r.kol_profile.instagram_account}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-800">{r.project_name || '—'}</td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {(r.platforms || []).length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    (r.platforms || []).map((p) => (
                      <span
                        key={p}
                        className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] text-slate-600"
                      >
                        {p}
                      </span>
                    ))
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 text-slate-600 max-w-xs">
                <p className="line-clamp-3">{r.cooperation_content || r.evaluation || '—'}</p>
              </td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.created_by || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
