import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TalentApplicationForm } from '@/components/settings/TalentApplicationForm';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

interface TalentFormRow {
  id: string;
  invite_token: string | null;
  fill_date: string | null;
  name_zh: string | null;
  name_en: string | null;
  payload: Record<string, unknown> | null;
  signature_image: string | null;
  submitted_at: string;
}

export function TalentSubmissionViewPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<TalentFormRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('talent_form')
        .select('*')
        .eq('id', id)
        .single();
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setRow(data as TalentFormRow);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[13px]">載入中…</span>
        </div>
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="min-h-screen bg-[#f5f8fc] flex items-center justify-center">
        <div className="bg-white rounded-md border border-rose-200 px-6 py-5 text-center max-w-md">
          <p className="text-[14px] font-bold text-rose-600 mb-1">找不到此筆資料</p>
          <p className="text-[12px] text-muted-foreground">
            {error || '可能已被刪除或連結不正確。'}
          </p>
        </div>
      </div>
    );
  }

  const initialValue = {
    ...((row.payload as Record<string, unknown>) || {}),
    fillDate: row.fill_date || '',
    nameZh: row.name_zh || '',
    nameEn: row.name_en || '',
    signature: row.signature_image || '',
  };

  return (
    <div className="min-h-screen bg-[#f5f8fc] py-6 px-4">
      <div className="max-w-[940px] mx-auto">
        <div className="mb-4 text-center">
          <h1 className="text-[18px] font-bold text-[#0d1a2d] tracking-tight">
            藝人面試登記表（已遞交）
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1">
            遞交時間：{new Date(row.submitted_at).toLocaleString('zh-HK')}
          </p>
          {row.invite_token && (
            <p className="text-[10.5px] text-muted-foreground/70 mt-1">
              填表編號：{row.invite_token}
            </p>
          )}
        </div>
        <TalentApplicationForm mode="view" initialValue={initialValue} />
      </div>
    </div>
  );
}
