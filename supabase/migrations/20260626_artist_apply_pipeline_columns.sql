-- Move the talent application pipeline from talent_form to artist_apply.
-- talent_form is intentionally left unchanged as historical storage.

ALTER TABLE public.artist_apply
  ADD COLUMN IF NOT EXISTS interviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interview_rating jsonb,
  ADD COLUMN IF NOT EXISTS interview_overall numeric(3,1),
  ADD COLUMN IF NOT EXISTS interview_notes text,
  ADD COLUMN IF NOT EXISTS interview_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS audition_media_urls text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.artist_apply
SET
  interviewed = COALESCE((raw_payload ->> 'legacyInterviewed')::boolean, interviewed),
  interview_rating = COALESCE(raw_payload -> 'legacyInterviewRating', interview_rating),
  interview_overall = COALESCE(NULLIF(raw_payload ->> 'legacyInterviewOverall', '')::numeric(3,1), interview_overall),
  interview_notes = COALESCE(NULLIF(raw_payload ->> 'legacyInterviewNotes', ''), interview_notes),
  interview_scheduled_at = COALESCE(NULLIF(raw_payload ->> 'legacyInterviewScheduledAt', '')::timestamptz, interview_scheduled_at),
  audition_media_urls = COALESCE(
    (
      SELECT array_agg(value)
      FROM jsonb_array_elements_text(COALESCE(raw_payload -> 'legacyAuditionMediaUrls', '[]'::jsonb)) AS t(value)
    ),
    audition_media_urls
  )
WHERE raw_payload ? 'legacyTalentFormId';

CREATE INDEX IF NOT EXISTS artist_apply_interviewed_idx
  ON public.artist_apply (interviewed);

CREATE INDEX IF NOT EXISTS artist_apply_interview_scheduled_idx
  ON public.artist_apply (interview_scheduled_at);

ALTER TABLE public.confirmed_artist
  ADD COLUMN IF NOT EXISTS artist_apply_id uuid REFERENCES public.artist_apply(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS confirmed_artist_artist_apply_idx
  ON public.confirmed_artist (artist_apply_id);
