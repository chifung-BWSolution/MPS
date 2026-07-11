import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Search,
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
import { useAuth } from '@/context/AuthContext';
import {
  VolunteerApply,
  VolunteerApplyStatus,
  VolunteerCampaign,
  VolunteerCampaignInput,
  VolunteerCampaignStatus,
  VolunteerTreatmentType,
  countQuota,
  createVolunteerCampaign,
  getVolunteerPublicUrl,
  listVolunteerApplies,
  listVolunteerCampaigns,
  reviewVolunteerApply,
  updateVolunteerCampaign,
} from '@/lib/volunteer-apply-api';

const campaignStatusConfig: Record<
  VolunteerCampaignStatus,
  { label: string; color: string; bg: string }
> = {
  draft: { label: '草稿', color: 'text-slate-700', bg: 'bg-slate-100' },
  open: { label: '開放中', color: 'text-teal-700', bg: 'bg-teal-100' },
  closed: { label: '已關閉', color: 'text-rose-700', bg: 'bg-rose-100' },
};

const applyStatusConfig: Record<
  VolunteerApplyStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: '待篩選', color: 'text-amber-700', bg: 'bg-amber-100' },
  approved: { label: '已通過', color: 'text-teal-700', bg: 'bg-teal-100' },
  rejected: { label: '已拒絕', color: 'text-rose-700', bg: 'bg-rose-100' },
};

const emptyCampaignForm = (): VolunteerCampaignInput => ({
  slug: '',
  title: '',
  product_name: '',
  description: '',
  incentive: '',
  deliverables: '',
  requirements_note: '',
  min_followers: 5000,
  face_quota: 20,
  body_quota: 20,
  deadline: null,
  status: 'draft',
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('zh-HK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function toDatetimeLocalValue(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function VolunteerRecruitmentModule() {
  const { systemUser } = useAuth();
  const [campaigns, setCampaigns] = useState<VolunteerCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applies, setApplies] = useState<VolunteerApply[]>([]);
  const [appliesLoading, setAppliesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VolunteerApplyStatus>('all');
  const [treatmentFilter, setTreatmentFilter] = useState<'all' | VolunteerTreatmentType>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VolunteerCampaign | null>(null);
  const [form, setForm] = useState<VolunteerCampaignInput>(emptyCampaignForm());
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const selected = useMemo(
    () => campaigns.find((c) => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listVolunteerCampaigns();
      setCampaigns(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '載入活動失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApplies = useCallback(async (campaignId: string) => {
    setAppliesLoading(true);
    try {
      const rows = await listVolunteerApplies(campaignId);
      setApplies(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '載入報名失敗');
    } finally {
      setAppliesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedId) void loadApplies(selectedId);
    else setApplies([]);
  }, [selectedId, loadApplies]);

  const filteredApplies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applies.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (treatmentFilter !== 'all' && a.treatment_type !== treatmentFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.instagram_account.toLowerCase().includes(q) ||
        (a.phone ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.whatsapp ?? '').toLowerCase().includes(q)
      );
    });
  }, [applies, search, statusFilter, treatmentFilter]);

  const faceApproved = selected ? countQuota(applies, 'face') : 0;
  const bodyApproved = selected ? countQuota(applies, 'body') : 0;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyCampaignForm());
    setShowForm(true);
  };

  const openEdit = (campaign: VolunteerCampaign) => {
    setEditing(campaign);
    setForm({
      slug: campaign.slug,
      title: campaign.title,
      product_name: campaign.product_name ?? '',
      description: campaign.description ?? '',
      incentive: campaign.incentive ?? '',
      deliverables: campaign.deliverables ?? '',
      requirements_note: campaign.requirements_note ?? '',
      min_followers: campaign.min_followers,
      face_quota: campaign.face_quota,
      body_quota: campaign.body_quota,
      deadline: campaign.deadline,
      status: campaign.status,
    });
    setShowForm(true);
  };

  const handleSaveCampaign = async () => {
    if (!form.title.trim()) {
      toast.error('請填寫活動標題');
      return;
    }
    if (!form.slug.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
      toast.error('Slug 僅可用小寫英文、數字與連字號');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateVolunteerCampaign(editing.id, form);
        setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success('活動已更新');
      } else {
        const created = await createVolunteerCampaign(form);
        setCampaigns((prev) => [created, ...prev]);
        toast.success('活動已建立');
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (slug: string) => {
    const url = getVolunteerPublicUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('報名連結已複製');
    } catch {
      toast.error('複製失敗，請手動複製');
    }
  };

  const handleReview = async (apply: VolunteerApply, status: VolunteerApplyStatus) => {
    setReviewingId(apply.id);
    try {
      const updated = await reviewVolunteerApply({
        applyId: apply.id,
        status,
        reviewedBy: systemUser?.display_name || systemUser?.email || undefined,
      });
      setApplies((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(status === 'approved' ? '已通過' : status === 'rejected' ? '已拒絕' : '已改回待篩選');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新狀態失敗');
    } finally {
      setReviewingId(null);
    }
  };

  if (showForm) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> 返回活動列表
        </button>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-5 space-y-4 max-w-3xl">
          <h2 className="text-[18px] font-bold">{editing ? '編輯活動' : '新建活動'}</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label>活動標題 *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例如：Doctor Peel KOL活動"
              />
            </div>
            <div className="space-y-1.5">
              <Label>公開連結 Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  }))
                }
                placeholder="doctor-peel"
              />
              <p className="text-[11px] text-muted-foreground">
                公開網址：/volunteer/apply/{form.slug || '…'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>產品名稱</Label>
              <Input
                value={form.product_name}
                onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>最低粉絲數</Label>
              <Input
                type="number"
                min={0}
                value={form.min_followers}
                onChange={(e) =>
                  setForm((f) => ({ ...f, min_followers: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>狀態</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as VolunteerCampaignStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="open">開放中</SelectItem>
                  <SelectItem value="closed">已關閉</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Face 名額</Label>
              <Input
                type="number"
                min={0}
                value={form.face_quota}
                onChange={(e) =>
                  setForm((f) => ({ ...f, face_quota: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Body 名額</Label>
              <Input
                type="number"
                min={0}
                value={form.body_quota}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body_quota: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>報名截止時間</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocalValue(form.deadline)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deadline: fromDatetimeLocalValue(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>活動說明</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>贊助 / 激勵</Label>
              <Textarea
                rows={2}
                value={form.incentive}
                onChange={(e) => setForm((f) => ({ ...f, incentive: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>合作交付</Label>
              <Textarea
                rows={2}
                value={form.deliverables}
                onChange={(e) => setForm((f) => ({ ...f, deliverables: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>資格備註</Label>
              <Textarea
                rows={2}
                value={form.requirements_note}
                onChange={(e) => setForm((f) => ({ ...f, requirements_note: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void handleSaveCampaign()} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
              {saving ? <Loader2 className="animate-spin" size={14} /> : null}
              儲存
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (selected) {
    const sConfig = campaignStatusConfig[selected.status];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> 返回活動列表
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={() => void copyLink(selected.slug)}>
              <Copy size={12} /> 複製報名連結
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-[12px]"
              onClick={() => window.open(getVolunteerPublicUrl(selected.slug), '_blank')}
            >
              <ExternalLink size={12} /> 開啟報名頁
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-[12px]" onClick={() => openEdit(selected)}>
              編輯活動
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[20px] font-bold tracking-tight">{selected.title}</h2>
              <p className="text-[12px] text-muted-foreground mt-1">
                /volunteer/apply/{selected.slug}
              </p>
            </div>
            <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>
              {sConfig.label}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
              <div className="text-muted-foreground">Face 已通過</div>
              <div className="text-[16px] font-bold mt-1">
                {faceApproved} / {selected.face_quota}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
              <div className="text-muted-foreground">Body 已通過</div>
              <div className="text-[16px] font-bold mt-1">
                {bodyApproved} / {selected.body_quota}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
              <div className="text-muted-foreground">待篩選</div>
              <div className="text-[16px] font-bold mt-1">
                {applies.filter((a) => a.status === 'pending').length}
              </div>
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-100 p-3">
              <div className="text-muted-foreground">最低粉絲</div>
              <div className="text-[16px] font-bold mt-1">
                {selected.min_followers.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-[13px]"
              placeholder="搜尋姓名 / IG / 聯絡方式"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[130px] h-9 text-[12px]">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="pending">待篩選</SelectItem>
              <SelectItem value="approved">已通過</SelectItem>
              <SelectItem value="rejected">已拒絕</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={treatmentFilter}
            onValueChange={(v) => setTreatmentFilter(v as typeof treatmentFilter)}
          >
            <SelectTrigger className="w-[120px] h-9 text-[12px]">
              <SelectValue placeholder="部位" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部部位</SelectItem>
              <SelectItem value="face">Face</SelectItem>
              <SelectItem value="body">Body</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
          {appliesLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-[13px]">
              <Loader2 className="animate-spin" size={16} /> 載入報名中…
            </div>
          ) : filteredApplies.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted-foreground">尚無符合條件的報名</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">申請人</th>
                    <th className="text-left font-medium px-4 py-2.5">IG / 粉絲</th>
                    <th className="text-left font-medium px-4 py-2.5">部位</th>
                    <th className="text-left font-medium px-4 py-2.5">聯絡</th>
                    <th className="text-left font-medium px-4 py-2.5">狀態</th>
                    <th className="text-left font-medium px-4 py-2.5">提交時間</th>
                    <th className="text-right font-medium px-4 py-2.5">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApplies.map((a) => {
                    const aConfig = applyStatusConfig[a.status];
                    const busy = reviewingId === a.id;
                    return (
                      <tr key={a.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#0d1a2d]">{a.name}</div>
                          {a.skin_concerns ? (
                            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {a.skin_concerns}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div>@{a.instagram_account.replace(/^@/, '')}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.follower_count.toLocaleString()} 粉絲
                          </div>
                        </td>
                        <td className="px-4 py-3 uppercase">{a.treatment_type}</td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground">
                          <div>{a.whatsapp || a.phone || '—'}</div>
                          <div>{a.email || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', aConfig.bg, aConfig.color)}>
                            {aConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap">
                          {formatDateTime(a.submitted_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {a.status !== 'approved' && (
                              <Button
                                size="sm"
                                className="h-7 text-[11px] gap-1 bg-teal-600 hover:bg-teal-700"
                                disabled={busy}
                                onClick={() => void handleReview(a, 'approved')}
                              >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                通過
                              </Button>
                            )}
                            {a.status !== 'rejected' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] gap-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                                disabled={busy}
                                onClick={() => void handleReview(a, 'rejected')}
                              >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                拒絕
                              </Button>
                            )}
                            {a.status !== 'pending' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px]"
                                disabled={busy}
                                onClick={() => void handleReview(a, 'pending')}
                              >
                                改回待篩選
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          建立活動、複製公開報名連結，並在此篩選申請。
        </p>
        <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700" onClick={openCreate}>
          <Plus size={14} /> 新建活動
        </Button>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-[13px]">
            <Loader2 className="animate-spin" size={16} /> 載入中…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-muted-foreground">尚無活動，請先新建</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {campaigns.map((c) => {
              const sConfig = campaignStatusConfig[c.status];
              return (
                <div
                  key={c.id}
                  className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <button
                    type="button"
                    className="text-left flex-1 min-w-0"
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[14px] text-[#0d1a2d]">{c.title}</span>
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>
                        {sConfig.label}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      /volunteer/apply/{c.slug}
                      {' · '}
                      Face {c.face_quota} / Body {c.body_quota}
                      {' · '}
                      ≥{c.min_followers.toLocaleString()} 粉絲
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] gap-1"
                      onClick={() => void copyLink(c.slug)}
                    >
                      <Copy size={12} /> 連結
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      onClick={() => setSelectedId(c.id)}
                    >
                      篩選
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
