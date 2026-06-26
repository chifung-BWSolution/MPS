-- Link legacy confirmed_artist rows to the migrated artist_apply records.
-- Existing source_form_id still points to talent_form; artist_apply_id is the
-- new canonical link for opening V2 application records.

UPDATE public.confirmed_artist ca
SET artist_apply_id = aa.id
FROM public.artist_apply aa
WHERE ca.artist_apply_id IS NULL
  AND ca.source_form_id IS NOT NULL
  AND aa.raw_payload ->> 'legacyTalentFormId' = ca.source_form_id::text;
