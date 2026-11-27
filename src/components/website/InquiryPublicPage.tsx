import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { InquiryFormView } from '@/components/website/InquiryFormView';
import { fetchPublicInquiry, submitPublicInquiry, type PublicInquiry } from '@/lib/inquiryForm';

export function InquiryPublicPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const [form, setForm] = useState<PublicInquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!linkId) {
        setError('這條連結不正確');
        setLoading(false);
        return;
      }
      try {
        const next = await fetchPublicInquiry(linkId);
        if (cancelled) return;
        if (!next) setError('找不到這份表格');
        else setForm(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  const unavailable = form?.availability !== 'available'
    ? {
        not_published: '這份表格暫時未公開。',
        not_open: '這份表格尚未開始接受回覆。',
        closed: '這份表格已停止接受回覆。',
        full: '這份表格已收滿回覆。',
      }[form?.availability || 'not_published']
    : '';

  return (
    <div className="min-h-dvh bg-[#f5f8fc] px-4 py-10">
      <div className="mx-auto max-w-xl rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        {loading && <p className="text-[14px] text-slate-600">載入中…</p>}
        {!loading && error && <p className="text-[14px] text-rose-800">{error}</p>}
        {!loading && form && unavailable && (
          <div className="space-y-2">
            <h1 className="text-[22px] font-bold text-slate-950">{form.formName}</h1>
            <p className="text-[14px] leading-6 text-slate-700">{unavailable}</p>
          </div>
        )}
        {!loading && form && done && (
          <div className="space-y-2">
            <CheckCircle2 className="text-teal-700" />
            <h1 className="text-[22px] font-bold text-slate-950">已收到</h1>
            <p className="whitespace-pre-wrap text-[14px] leading-6 text-slate-700">{form.confirmationMessage}</p>
          </div>
        )}
        {!loading && form && !unavailable && !done && (
          <InquiryFormView
            formName={form.formName}
            description={form.description}
            websiteName={form.websiteName}
            fields={form.fields}
            submitLabel={form.submitButtonText}
            labelAlignment={form.labelAlignment}
            submitAlignment={form.submitAlignment}
            honeypot={honeypot}
            onHoneypotChange={setHoneypot}
            onSubmit={async (answers) => {
              await submitPublicInquiry(form.linkId, answers, { startedAt, honeypot });
              if (form.confirmationType === 'redirect' && /^https?:\/\//i.test(form.redirectUrl)) {
                window.location.assign(form.redirectUrl);
                return;
              }
              setDone(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
