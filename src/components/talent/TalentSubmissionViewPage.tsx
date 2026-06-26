import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TalentApplicationFormV2 } from '@/components/settings/TalentApplicationFormV2';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

interface ArtistApplyRow {
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

interface ArtistApplyPhotoRow {
  data_url: string | null;
}

export function TalentSubmissionViewPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<ArtistApplyRow | null>(null);
  const [applicantSignature, setApplicantSignature] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      const { data: directData, error: directError } = await supabase
        .from('artist_apply')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      let applyRow = directData as ArtistApplyRow | null;
      let applyError = directError;

      // Backwards compatibility: old links used talent_form.id. Migrated rows
      // keep that id under raw_payload.legacyTalentFormId.
      if (!applyRow && !directError) {
        const { data: legacyData, error: legacyError } = await supabase
          .from('artist_apply')
          .select('*')
          .filter('raw_payload->>legacyTalentFormId', 'eq', id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        applyRow = legacyData as ArtistApplyRow | null;
        applyError = legacyError;
      }

      if (applyError) {
        setError(applyError.message);
        setLoading(false);
        return;
      }

      if (!applyRow) {
        setRow(null);
        setError(null);
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
      if (cancelled) return;

      if (photoError) {
        setError(photoError.message);
      } else {
        setRow(applyRow);
        const signatureRow = (photoData?.[0] ?? null) as ArtistApplyPhotoRow | null;
        setApplicantSignature(signatureRow?.data_url || '');
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
  };

  return (
    <div className="min-h-screen bg-[#f5f8fc] py-6 px-4">
      <div className="max-w-[940px] mx-auto">
        <div className="mb-4 text-center">
          <h1 className="text-[18px] font-bold text-[#0d1a2d] tracking-tight">
            藝人面試登記表 V2（已遞交）
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
        <TalentApplicationFormV2 mode="view" initialValue={initialValue} />
      </div>
    </div>
  );
}
