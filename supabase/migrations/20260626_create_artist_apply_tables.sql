-- ============================================================
-- Artist Apply V2
--
-- Stores the V2 public artist application form without changing
-- the existing talent_form pipeline.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.artist_apply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link / tracking
  invite_token text,
  application_no text,
  application_date date,
  status text NOT NULL DEFAULT 'submitted',
  status_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A1. Basic information
  name_zh text,
  name_en text,
  display_name text,
  gender text,
  birth_date date,
  age text,
  id_last_four text,
  nationality text,
  residence text,
  residence_other text,
  phone text,
  whatsapp text,
  email text,
  emergency_name text,
  emergency_relation text,
  emergency_phone text,

  -- A2. Application categories
  categories text[] NOT NULL DEFAULT '{}'::text[],
  category_other text,

  -- A3. Physical attributes and capabilities
  height text,
  weight text,
  shoe_size text,
  clothing_size text,
  hair_color text,
  languages text[] NOT NULL DEFAULT '{}'::text[],
  language_other text,
  language_fluency text,
  read_script_ability text,
  adlib_ability text,
  outdoor_shooting text,
  studio_shooting text,
  live_streaming text,
  travel_availability text[] NOT NULL DEFAULT '{}'::text[],
  early_night_shift text,
  weekend_holiday_work text,
  license_or_qualification text,
  special_talents text,

  -- A4. Social media and content ability
  instagram_account text,
  instagram_followers text,
  xiaohongshu_account text,
  xiaohongshu_followers text,
  youtube_account text,
  youtube_followers text,
  facebook_account text,
  facebook_followers text,
  tiktok_account text,
  tiktok_followers text,
  other_platform text,
  write_content_ability text,
  shoot_edit_ability text,
  live_commerce_experience text,
  live_commerce_details text,
  portfolio_links text,

  -- A5. Experience and pricing
  signed_company_before text,
  contract_status text,
  agency_company_name text,
  contract_period text,
  need_agency_consent text,
  previous_brands text,
  shooting_types text[] NOT NULL DEFAULT '{}'::text[],
  representative_works text,
  pricing_modes text[] NOT NULL DEFAULT '{}'::text[],
  price_range_from text,
  price_range_to text,
  reimbursable_expenses text,

  -- A6. Positioning and development plan
  image_positioning text[] NOT NULL DEFAULT '{}'::text[],
  development_focus text,
  unacceptable_jobs text,
  dream_brands text,
  company_support_directions text[] NOT NULL DEFAULT '{}'::text[],
  company_support_other text,

  -- A7. Submitted files declaration
  submitted_files text[] NOT NULL DEFAULT '{}'::text[],
  other_file_note text,
  uploaded_file_names text[] NOT NULL DEFAULT '{}'::text[],

  -- A8. Signature metadata / text-only guardian signature
  applicant_sign_date date,
  guardian_name text,
  guardian_signature_text text,
  guardian_sign_date date,

  -- Full V2 raw snapshot for forward compatibility.
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.artist_apply_photo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_apply_id uuid NOT NULL REFERENCES public.artist_apply(id) ON DELETE CASCADE,

  -- Role examples: applicant_signature, guardian_signature, headshot,
  -- full_body, lifestyle, identity_document, other_attachment.
  file_role text NOT NULL,
  file_kind text NOT NULL DEFAULT 'image',

  -- First version supports data_url for signature-pad output and filename-only
  -- attachment metadata. Real file uploads can later use storage_path.
  bucket text NOT NULL DEFAULT 'artist-apply',
  storage_path text,
  public_url text,
  data_url text,
  external_url text,

  original_file_name text,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,

  sort_order integer NOT NULL DEFAULT 0,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT artist_apply_photo_has_reference CHECK (
    storage_path IS NOT NULL
    OR data_url IS NOT NULL
    OR external_url IS NOT NULL
    OR original_file_name IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS artist_apply_invite_token_idx ON public.artist_apply (invite_token);
CREATE INDEX IF NOT EXISTS artist_apply_submitted_at_idx ON public.artist_apply (submitted_at DESC);
CREATE INDEX IF NOT EXISTS artist_apply_status_idx ON public.artist_apply (status);
CREATE INDEX IF NOT EXISTS artist_apply_phone_idx ON public.artist_apply (phone);
CREATE INDEX IF NOT EXISTS artist_apply_name_zh_idx ON public.artist_apply (name_zh);
CREATE INDEX IF NOT EXISTS artist_apply_categories_gin_idx ON public.artist_apply USING gin (categories);
CREATE INDEX IF NOT EXISTS artist_apply_raw_payload_gin_idx ON public.artist_apply USING gin (raw_payload);

CREATE INDEX IF NOT EXISTS artist_apply_photo_apply_id_idx ON public.artist_apply_photo (artist_apply_id);
CREATE INDEX IF NOT EXISTS artist_apply_photo_role_idx ON public.artist_apply_photo (file_role);
CREATE UNIQUE INDEX IF NOT EXISTS artist_apply_photo_storage_path_uidx
  ON public.artist_apply_photo (bucket, storage_path)
  WHERE storage_path IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_artist_apply_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_artist_apply_updated_at ON public.artist_apply;
CREATE TRIGGER set_artist_apply_updated_at
BEFORE UPDATE ON public.artist_apply
FOR EACH ROW
EXECUTE FUNCTION public.set_artist_apply_updated_at();

ALTER TABLE public.artist_apply ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_apply_photo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert on artist_apply" ON public.artist_apply;
DROP POLICY IF EXISTS "Allow authenticated read on artist_apply" ON public.artist_apply;
DROP POLICY IF EXISTS "Allow authenticated insert on artist_apply" ON public.artist_apply;
DROP POLICY IF EXISTS "Allow authenticated update on artist_apply" ON public.artist_apply;
DROP POLICY IF EXISTS "Allow authenticated delete on artist_apply" ON public.artist_apply;

DROP POLICY IF EXISTS "Allow anon insert on artist_apply_photo" ON public.artist_apply_photo;
DROP POLICY IF EXISTS "Allow authenticated read on artist_apply_photo" ON public.artist_apply_photo;
DROP POLICY IF EXISTS "Allow authenticated insert on artist_apply_photo" ON public.artist_apply_photo;
DROP POLICY IF EXISTS "Allow authenticated update on artist_apply_photo" ON public.artist_apply_photo;
DROP POLICY IF EXISTS "Allow authenticated delete on artist_apply_photo" ON public.artist_apply_photo;

CREATE POLICY "Allow anon insert on artist_apply"
  ON public.artist_apply FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated read on artist_apply"
  ON public.artist_apply FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert on artist_apply"
  ON public.artist_apply FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on artist_apply"
  ON public.artist_apply FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on artist_apply"
  ON public.artist_apply FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon insert on artist_apply_photo"
  ON public.artist_apply_photo FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated read on artist_apply_photo"
  ON public.artist_apply_photo FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert on artist_apply_photo"
  ON public.artist_apply_photo FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on artist_apply_photo"
  ON public.artist_apply_photo FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on artist_apply_photo"
  ON public.artist_apply_photo FOR DELETE
  TO authenticated
  USING (true);

GRANT INSERT ON public.artist_apply TO anon;
GRANT INSERT ON public.artist_apply_photo TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_apply TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_apply_photo TO authenticated;
GRANT ALL ON public.artist_apply TO service_role;
GRANT ALL ON public.artist_apply_photo TO service_role;

CREATE OR REPLACE FUNCTION public.submit_artist_apply(
  form_payload jsonb,
  photo_payload jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  apply_id uuid;
BEGIN
  IF form_payload IS NULL OR jsonb_typeof(form_payload) <> 'object' THEN
    RAISE EXCEPTION 'form_payload must be a JSON object';
  END IF;

  IF photo_payload IS NULL THEN
    photo_payload := '[]'::jsonb;
  END IF;

  IF jsonb_typeof(photo_payload) <> 'array' THEN
    RAISE EXCEPTION 'photo_payload must be a JSON array';
  END IF;

  INSERT INTO public.artist_apply (
    invite_token,
    application_no,
    application_date,
    name_zh,
    name_en,
    display_name,
    gender,
    birth_date,
    age,
    id_last_four,
    nationality,
    residence,
    residence_other,
    phone,
    whatsapp,
    email,
    emergency_name,
    emergency_relation,
    emergency_phone,
    categories,
    category_other,
    height,
    weight,
    shoe_size,
    clothing_size,
    hair_color,
    languages,
    language_other,
    language_fluency,
    read_script_ability,
    adlib_ability,
    outdoor_shooting,
    studio_shooting,
    live_streaming,
    travel_availability,
    early_night_shift,
    weekend_holiday_work,
    license_or_qualification,
    special_talents,
    instagram_account,
    instagram_followers,
    xiaohongshu_account,
    xiaohongshu_followers,
    youtube_account,
    youtube_followers,
    facebook_account,
    facebook_followers,
    tiktok_account,
    tiktok_followers,
    other_platform,
    write_content_ability,
    shoot_edit_ability,
    live_commerce_experience,
    live_commerce_details,
    portfolio_links,
    signed_company_before,
    contract_status,
    agency_company_name,
    contract_period,
    need_agency_consent,
    previous_brands,
    shooting_types,
    representative_works,
    pricing_modes,
    price_range_from,
    price_range_to,
    reimbursable_expenses,
    image_positioning,
    development_focus,
    unacceptable_jobs,
    dream_brands,
    company_support_directions,
    company_support_other,
    submitted_files,
    other_file_note,
    uploaded_file_names,
    applicant_sign_date,
    guardian_name,
    guardian_signature_text,
    guardian_sign_date,
    raw_payload
  )
  VALUES (
    NULLIF(form_payload ->> 'inviteToken', ''),
    NULLIF(form_payload ->> 'applicationNo', ''),
    NULLIF(form_payload ->> 'applicationDate', '')::date,
    NULLIF(form_payload ->> 'nameZh', ''),
    NULLIF(form_payload ->> 'nameEn', ''),
    NULLIF(form_payload ->> 'displayName', ''),
    NULLIF(form_payload ->> 'gender', ''),
    NULLIF(form_payload ->> 'birthDate', '')::date,
    NULLIF(form_payload ->> 'age', ''),
    NULLIF(form_payload ->> 'idLastFour', ''),
    NULLIF(form_payload ->> 'nationality', ''),
    NULLIF(form_payload ->> 'residence', ''),
    NULLIF(form_payload ->> 'residenceOther', ''),
    NULLIF(form_payload ->> 'phone', ''),
    NULLIF(form_payload ->> 'whatsapp', ''),
    NULLIF(form_payload ->> 'email', ''),
    NULLIF(form_payload ->> 'emergencyName', ''),
    NULLIF(form_payload ->> 'emergencyRelation', ''),
    NULLIF(form_payload ->> 'emergencyPhone', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'categories', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'categoryOther', ''),
    NULLIF(form_payload ->> 'height', ''),
    NULLIF(form_payload ->> 'weight', ''),
    NULLIF(form_payload ->> 'shoeSize', ''),
    NULLIF(form_payload ->> 'clothingSize', ''),
    NULLIF(form_payload ->> 'hairColor', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'languages', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'languageOther', ''),
    NULLIF(form_payload ->> 'languageFluency', ''),
    NULLIF(form_payload ->> 'readScriptAbility', ''),
    NULLIF(form_payload ->> 'adlibAbility', ''),
    NULLIF(form_payload ->> 'outdoorShooting', ''),
    NULLIF(form_payload ->> 'studioShooting', ''),
    NULLIF(form_payload ->> 'liveStreaming', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'travelAvailability', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'earlyNightShift', ''),
    NULLIF(form_payload ->> 'weekendHolidayWork', ''),
    NULLIF(form_payload ->> 'licenseOrQualification', ''),
    NULLIF(form_payload ->> 'specialTalents', ''),
    NULLIF(form_payload ->> 'instagramAccount', ''),
    NULLIF(form_payload ->> 'instagramFollowers', ''),
    NULLIF(form_payload ->> 'xiaohongshuAccount', ''),
    NULLIF(form_payload ->> 'xiaohongshuFollowers', ''),
    NULLIF(form_payload ->> 'youtubeAccount', ''),
    NULLIF(form_payload ->> 'youtubeFollowers', ''),
    NULLIF(form_payload ->> 'facebookAccount', ''),
    NULLIF(form_payload ->> 'facebookFollowers', ''),
    NULLIF(form_payload ->> 'tiktokAccount', ''),
    NULLIF(form_payload ->> 'tiktokFollowers', ''),
    NULLIF(form_payload ->> 'otherPlatform', ''),
    NULLIF(form_payload ->> 'writeContentAbility', ''),
    NULLIF(form_payload ->> 'shootEditAbility', ''),
    NULLIF(form_payload ->> 'liveCommerceExperience', ''),
    NULLIF(form_payload ->> 'liveCommerceDetails', ''),
    NULLIF(form_payload ->> 'portfolioLinks', ''),
    NULLIF(form_payload ->> 'signedCompanyBefore', ''),
    NULLIF(form_payload ->> 'contractStatus', ''),
    NULLIF(form_payload ->> 'agencyCompanyName', ''),
    NULLIF(form_payload ->> 'contractPeriod', ''),
    NULLIF(form_payload ->> 'needAgencyConsent', ''),
    NULLIF(form_payload ->> 'previousBrands', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'shootingTypes', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'representativeWorks', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'pricingModes', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'priceRangeFrom', ''),
    NULLIF(form_payload ->> 'priceRangeTo', ''),
    NULLIF(form_payload ->> 'reimbursableExpenses', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'imagePositioning', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'developmentFocus', ''),
    NULLIF(form_payload ->> 'unacceptableJobs', ''),
    NULLIF(form_payload ->> 'dreamBrands', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'companySupportDirections', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'companySupportOther', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'submittedFiles', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'otherFileNote', ''),
    COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(COALESCE(form_payload -> 'uploadedFileNames', '[]'::jsonb)) AS t(value)), '{}'::text[]),
    NULLIF(form_payload ->> 'applicantSignDate', '')::date,
    NULLIF(form_payload ->> 'guardianName', ''),
    NULLIF(form_payload ->> 'guardianSignature', ''),
    NULLIF(form_payload ->> 'guardianSignDate', '')::date,
    form_payload
  )
  RETURNING id INTO apply_id;

  INSERT INTO public.artist_apply_photo (
    artist_apply_id,
    file_role,
    file_kind,
    bucket,
    storage_path,
    public_url,
    data_url,
    external_url,
    original_file_name,
    mime_type,
    file_size,
    width,
    height,
    sort_order,
    description,
    metadata
  )
  SELECT
    apply_id,
    COALESCE(NULLIF(photo ->> 'fileRole', ''), NULLIF(photo ->> 'file_role', ''), 'submitted_file'),
    COALESCE(NULLIF(photo ->> 'fileKind', ''), NULLIF(photo ->> 'file_kind', ''), 'image'),
    COALESCE(NULLIF(photo ->> 'bucket', ''), 'artist-apply'),
    COALESCE(NULLIF(photo ->> 'storagePath', ''), NULLIF(photo ->> 'storage_path', '')),
    COALESCE(NULLIF(photo ->> 'publicUrl', ''), NULLIF(photo ->> 'public_url', '')),
    COALESCE(NULLIF(photo ->> 'dataUrl', ''), NULLIF(photo ->> 'data_url', '')),
    COALESCE(NULLIF(photo ->> 'externalUrl', ''), NULLIF(photo ->> 'external_url', '')),
    COALESCE(NULLIF(photo ->> 'originalFileName', ''), NULLIF(photo ->> 'original_file_name', '')),
    COALESCE(NULLIF(photo ->> 'mimeType', ''), NULLIF(photo ->> 'mime_type', '')),
    NULLIF(COALESCE(photo ->> 'fileSize', photo ->> 'file_size'), '')::bigint,
    NULLIF(photo ->> 'width', '')::integer,
    NULLIF(photo ->> 'height', '')::integer,
    COALESCE(NULLIF(COALESCE(photo ->> 'sortOrder', photo ->> 'sort_order'), '')::integer, 0),
    NULLIF(photo ->> 'description', ''),
    COALESCE(photo -> 'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(photo_payload) AS p(photo);

  RETURN apply_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO service_role;
