import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  VolunteerCampaignPublic,
  VolunteerTreatmentType,
  getVolunteerCampaignPublic,
  submitVolunteerApply,
} from '@/lib/volunteer-apply-api';

type FormState = {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram_account: string;
  follower_count: string;
  treatment_type: VolunteerTreatmentType | '';
  skin_concerns: string;
  agree_followup: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  phone: '',
  whatsapp: '',
  email: '',
  instagram_account: '',
  follower_count: '',
  treatment_type: '',
  skin_concerns: '',
  agree_followup: true,
});

export function VolunteerApplyPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [campaign, setCampaign] = useState<VolunteerCampaignPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!slug) {
        setLoadError('無效的報名連結');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getVolunteerCampaignPublic(slug);
        if (cancelled) return;
        if (!data) {
          setLoadError('找不到此招募活動');
          setCampaign(null);
        } else {
          setCampaign(data);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '載入失敗');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const followerCount = Number(form.follower_count);
  const followersTooLow = useMemo(() => {
    if (!campaign || !form.follower_count.trim()) return false;
    if (Number.isNaN(followerCount)) return true;
    return followerCount < campaign.min_followers;
  }, [campaign, form.follower_count, followerCount]);

  const treatmentFull = useMemo(() => {
    if (!campaign || !form.treatment_type) return false;
    return form.treatment_type === 'face'
      ? campaign.face_remaining <= 0
      : campaign.body_remaining <= 0;
  }, [campaign, form.treatment_type]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!campaign) return;
    setSubmitError(null);

    if (!form.name.trim()) {
      setSubmitError('請填寫姓名');
      return;
    }
    if (!form.instagram_account.trim()) {
      setSubmitError('請填寫 Instagram 帳號');
      return;
    }
    if (!form.phone.trim() && !form.whatsapp.trim() && !form.email.trim()) {
      setSubmitError('請至少提供電話、WhatsApp 或 Email 其中一項');
      return;
    }
    if (!form.treatment_type) {
      setSubmitError('請選擇 Face 或 Body');
      return;
    }
    if (!form.follower_count.trim() || Number.isNaN(followerCount) || followerCount < 0) {
      setSubmitError('請填寫有效粉絲數');
      return;
    }
    if (followerCount < campaign.min_followers) {
      setSubmitError(`粉絲數需達 ${campaign.min_followers.toLocaleString()} 或以上，無法提交`);
      return;
    }
    if (!campaign.is_accepting) {
      setSubmitError('活動目前未開放報名');
      return;
    }
    if (treatmentFull) {
      setSubmitError(`${form.treatment_type === 'face' ? 'Face' : 'Body'} 名額已滿`);
      return;
    }
    if (!form.agree_followup) {
      setSubmitError('請確認同意療程後約兩週回訪拍攝 before / after');
      return;
    }

    setSubmitting(true);
    try {
      await submitVolunteerApply({
        campaign_id: campaign.id,
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        email: form.email.trim() || undefined,
        instagram_account: form.instagram_account.trim().replace(/^@/, ''),
        follower_count: followerCount,
        treatment_type: form.treatment_type,
        skin_concerns: form.skin_concerns.trim() || undefined,
        agree_followup: form.agree_followup,
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> 載入報名頁…
        </div>
      </div>
    );
  }

  if (loadError || !campaign) {
    return (
      <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center px-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-6 max-w-md w-full text-center">
          <h1 className="text-[18px] font-bold text-[#0d1a2d]">無法開啟報名</h1>
          <p className="text-[13px] text-muted-foreground mt-2">{loadError || '活動不存在'}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center px-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-8 max-w-md w-full text-center space-y-3">
          <CheckCircle2 className="mx-auto text-teal-600" size={40} />
          <h1 className="text-[20px] font-bold text-[#0d1a2d]">報名已提交</h1>
          <p className="text-[13px] text-muted-foreground">
            感謝你的申請。我們會盡快審核，並透過你提供的聯絡方式通知結果。
          </p>
        </div>
      </div>
    );
  }

  const closed = !campaign.is_accepting;

  return (
    <div className="min-h-screen bg-[#f5f8fc] py-8 px-4">
      <div className="max-w-[640px] mx-auto space-y-5">
        <div className="text-center">
          <h1 className="text-[24px] font-bold text-[#0d1a2d] tracking-tight">{campaign.title}</h1>
          {campaign.product_name ? (
            <p className="text-[13px] text-teal-700 font-medium mt-1">{campaign.product_name}</p>
          ) : null}
        </div>

        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-5 space-y-3 text-[13px]">
          {campaign.description ? <p className="text-[#0d1a2d] leading-relaxed">{campaign.description}</p> : null}
          {campaign.incentive ? (
            <p>
              <span className="font-medium">贊助：</span>
              {campaign.incentive}
            </p>
          ) : null}
          {campaign.deliverables ? (
            <p>
              <span className="font-medium">合作交付：</span>
              {campaign.deliverables}
            </p>
          ) : null}
          {campaign.requirements_note ? (
            <p>
              <span className="font-medium">資格：</span>
              {campaign.requirements_note}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1 text-[12px] text-muted-foreground">
            <span>
              Face 剩餘 {campaign.face_remaining}/{campaign.face_quota}
            </span>
            <span>
              Body 剩餘 {campaign.body_remaining}/{campaign.body_quota}
            </span>
            <span>最低粉絲 {campaign.min_followers.toLocaleString()}</span>
            {campaign.deadline ? (
              <span>截止 {new Date(campaign.deadline).toLocaleString('zh-HK')}</span>
            ) : null}
          </div>
        </div>

        {closed ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-4 text-[13px]">
            此活動目前未開放報名（已截止、已關閉或名額已滿）。
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-5 space-y-4"
          >
            <div className="space-y-1.5">
              <Label>姓名 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="你的姓名"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>電話</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">電話 / WhatsApp / Email 請至少填一項</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Instagram 帳號 *</Label>
                <Input
                  value={form.instagram_account}
                  onChange={(e) => setForm((f) => ({ ...f, instagram_account: e.target.value }))}
                  placeholder="@yourhandle"
                />
              </div>
              <div className="space-y-1.5">
                <Label>粉絲數 *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.follower_count}
                  onChange={(e) => setForm((f) => ({ ...f, follower_count: e.target.value }))}
                />
                {followersTooLow ? (
                  <p className="text-[11px] text-rose-600">
                    粉絲數需達 {campaign.min_followers.toLocaleString()} 或以上，無法提交
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>申請部位 *</Label>
              <div className="grid grid-cols-2 gap-3">
                {(['face', 'body'] as const).map((type) => {
                  const remaining = type === 'face' ? campaign.face_remaining : campaign.body_remaining;
                  const disabled = remaining <= 0;
                  const selected = form.treatment_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={disabled}
                      onClick={() => setForm((f) => ({ ...f, treatment_type: type }))}
                      className={cn(
                        'rounded-md border px-3 py-3 text-left transition-colors',
                        selected
                          ? 'border-teal-600 bg-teal-50 text-teal-800'
                          : 'border-slate-200 hover:border-slate-300',
                        disabled && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <div className="font-medium uppercase">{type}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {disabled ? '名額已滿' : `剩餘 ${remaining}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>皮膚問題 / 備註</Label>
              <Textarea
                rows={3}
                value={form.skin_concerns}
                onChange={(e) => setForm((f) => ({ ...f, skin_concerns: e.target.value }))}
                placeholder="例如：色素、黑頭、暗瘡、暗沉…"
              />
            </div>

            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.agree_followup}
                onChange={(e) => setForm((f) => ({ ...f, agree_followup: e.target.checked }))}
              />
              <span>我同意療程後約兩週回訪拍攝 before / after</span>
            </label>

            {submitError ? (
              <div className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
                {submitError}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={submitting || followersTooLow}
              className="w-full bg-teal-600 hover:bg-teal-700"
            >
              {submitting ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
              提交報名
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
