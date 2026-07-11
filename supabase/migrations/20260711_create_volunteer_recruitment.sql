-- ============================================================
-- Volunteer Recruitment (志願招募)
-- Generic campaign-based KOL / volunteer application + screening
-- ============================================================

CREATE TABLE IF NOT EXISTS public.volunteer_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  product_name text,
  description text,
  incentive text,
  deliverables text,
  requirements_note text,
  min_followers integer NOT NULL DEFAULT 5000,
  face_quota integer NOT NULL DEFAULT 20,
  body_quota integer NOT NULL DEFAULT 20,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_campaign_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT volunteer_campaign_min_followers_check CHECK (min_followers >= 0),
  CONSTRAINT volunteer_campaign_face_quota_check CHECK (face_quota >= 0),
  CONSTRAINT volunteer_campaign_body_quota_check CHECK (body_quota >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS volunteer_campaign_slug_uidx
  ON public.volunteer_campaign (slug);

CREATE INDEX IF NOT EXISTS volunteer_campaign_status_idx
  ON public.volunteer_campaign (status);

CREATE TABLE IF NOT EXISTS public.volunteer_apply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.volunteer_campaign(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  status_note text,
  name text NOT NULL,
  phone text,
  whatsapp text,
  email text,
  instagram_account text NOT NULL,
  follower_count integer NOT NULL,
  treatment_type text NOT NULL
    CHECK (treatment_type IN ('face', 'body')),
  skin_concerns text,
  agree_followup boolean NOT NULL DEFAULT true,
  reviewed_at timestamptz,
  reviewed_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_apply_follower_count_check CHECK (follower_count >= 0)
);

CREATE INDEX IF NOT EXISTS volunteer_apply_campaign_id_idx
  ON public.volunteer_apply (campaign_id);
CREATE INDEX IF NOT EXISTS volunteer_apply_status_idx
  ON public.volunteer_apply (status);
CREATE INDEX IF NOT EXISTS volunteer_apply_treatment_type_idx
  ON public.volunteer_apply (treatment_type);
CREATE INDEX IF NOT EXISTS volunteer_apply_submitted_at_idx
  ON public.volunteer_apply (submitted_at DESC);

CREATE OR REPLACE FUNCTION public.set_volunteer_campaign_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_volunteer_campaign_updated_at ON public.volunteer_campaign;
CREATE TRIGGER set_volunteer_campaign_updated_at
BEFORE UPDATE ON public.volunteer_campaign
FOR EACH ROW
EXECUTE FUNCTION public.set_volunteer_campaign_updated_at();

CREATE OR REPLACE FUNCTION public.set_volunteer_apply_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_volunteer_apply_updated_at ON public.volunteer_apply;
CREATE TRIGGER set_volunteer_apply_updated_at
BEFORE UPDATE ON public.volunteer_apply
FOR EACH ROW
EXECUTE FUNCTION public.set_volunteer_apply_updated_at();

ALTER TABLE public.volunteer_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_apply ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on volunteer_campaign" ON public.volunteer_campaign;
DROP POLICY IF EXISTS "Allow authenticated insert on volunteer_campaign" ON public.volunteer_campaign;
DROP POLICY IF EXISTS "Allow authenticated update on volunteer_campaign" ON public.volunteer_campaign;
DROP POLICY IF EXISTS "Allow authenticated delete on volunteer_campaign" ON public.volunteer_campaign;

DROP POLICY IF EXISTS "Allow authenticated read on volunteer_apply" ON public.volunteer_apply;
DROP POLICY IF EXISTS "Allow authenticated insert on volunteer_apply" ON public.volunteer_apply;
DROP POLICY IF EXISTS "Allow authenticated update on volunteer_apply" ON public.volunteer_apply;
DROP POLICY IF EXISTS "Allow authenticated delete on volunteer_apply" ON public.volunteer_apply;

CREATE POLICY "Allow authenticated read on volunteer_campaign"
  ON public.volunteer_campaign FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert on volunteer_campaign"
  ON public.volunteer_campaign FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update on volunteer_campaign"
  ON public.volunteer_campaign FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete on volunteer_campaign"
  ON public.volunteer_campaign FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated read on volunteer_apply"
  ON public.volunteer_apply FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert on volunteer_apply"
  ON public.volunteer_apply FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update on volunteer_apply"
  ON public.volunteer_apply FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete on volunteer_apply"
  ON public.volunteer_apply FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_campaign TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_apply TO authenticated;
GRANT ALL ON public.volunteer_campaign TO service_role;
GRANT ALL ON public.volunteer_apply TO service_role;

-- Public: fetch open campaign by slug + remaining quota
CREATE OR REPLACE FUNCTION public.get_volunteer_campaign_public(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.volunteer_campaign%ROWTYPE;
  face_approved integer;
  body_approved integer;
  is_accepting boolean;
BEGIN
  SELECT * INTO c
  FROM public.volunteer_campaign
  WHERE slug = lower(trim(p_slug));

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE treatment_type = 'face' AND status = 'approved'),
    COUNT(*) FILTER (WHERE treatment_type = 'body' AND status = 'approved')
  INTO face_approved, body_approved
  FROM public.volunteer_apply
  WHERE campaign_id = c.id;

  is_accepting :=
    c.status = 'open'
    AND (c.deadline IS NULL OR c.deadline > now())
    AND (
      face_approved < c.face_quota
      OR body_approved < c.body_quota
    );

  RETURN jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'title', c.title,
    'product_name', c.product_name,
    'description', c.description,
    'incentive', c.incentive,
    'deliverables', c.deliverables,
    'requirements_note', c.requirements_note,
    'min_followers', c.min_followers,
    'face_quota', c.face_quota,
    'body_quota', c.body_quota,
    'face_approved', face_approved,
    'body_approved', body_approved,
    'face_remaining', GREATEST(c.face_quota - face_approved, 0),
    'body_remaining', GREATEST(c.body_quota - body_approved, 0),
    'deadline', c.deadline,
    'status', c.status,
    'is_accepting', is_accepting
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_volunteer_campaign_public(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_volunteer_campaign_public(text) TO authenticated;

-- Public submit with validation (followers / deadline / quota / open)
CREATE OR REPLACE FUNCTION public.submit_volunteer_apply(form_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.volunteer_campaign%ROWTYPE;
  v_campaign_id uuid;
  v_name text;
  v_phone text;
  v_whatsapp text;
  v_email text;
  v_ig text;
  v_followers integer;
  v_treatment text;
  v_skin text;
  v_followup boolean;
  approved_count integer;
  quota_limit integer;
  new_id uuid;
BEGIN
  IF form_payload IS NULL OR jsonb_typeof(form_payload) <> 'object' THEN
    RAISE EXCEPTION 'form_payload must be a JSON object';
  END IF;

  v_campaign_id := NULLIF(form_payload->>'campaign_id', '')::uuid;
  v_name := NULLIF(trim(form_payload->>'name'), '');
  v_phone := NULLIF(trim(form_payload->>'phone'), '');
  v_whatsapp := NULLIF(trim(form_payload->>'whatsapp'), '');
  v_email := NULLIF(trim(form_payload->>'email'), '');
  v_ig := NULLIF(trim(form_payload->>'instagram_account'), '');
  v_followers := COALESCE((form_payload->>'follower_count')::integer, -1);
  v_treatment := lower(NULLIF(trim(form_payload->>'treatment_type'), ''));
  v_skin := NULLIF(trim(form_payload->>'skin_concerns'), '');
  v_followup := COALESCE((form_payload->>'agree_followup')::boolean, true);

  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'campaign_id is required';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION '姓名為必填';
  END IF;
  IF v_ig IS NULL THEN
    RAISE EXCEPTION 'Instagram 帳號為必填';
  END IF;
  IF v_phone IS NULL AND v_whatsapp IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION '請至少提供電話、WhatsApp 或 Email 其中一項';
  END IF;
  IF v_treatment IS NULL OR v_treatment NOT IN ('face', 'body') THEN
    RAISE EXCEPTION '請選擇 Face 或 Body';
  END IF;
  IF v_followers < 0 THEN
    RAISE EXCEPTION '粉絲數無效';
  END IF;

  SELECT * INTO c
  FROM public.volunteer_campaign
  WHERE id = v_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '活動不存在';
  END IF;

  IF c.status <> 'open' THEN
    RAISE EXCEPTION '活動目前未開放報名';
  END IF;

  IF c.deadline IS NOT NULL AND c.deadline <= now() THEN
    RAISE EXCEPTION '報名已截止';
  END IF;

  IF v_followers < c.min_followers THEN
    RAISE EXCEPTION '粉絲數需達 % 或以上', c.min_followers;
  END IF;

  SELECT COUNT(*) INTO approved_count
  FROM public.volunteer_apply
  WHERE campaign_id = c.id
    AND treatment_type = v_treatment
    AND status = 'approved';

  quota_limit := CASE WHEN v_treatment = 'face' THEN c.face_quota ELSE c.body_quota END;

  IF approved_count >= quota_limit THEN
    RAISE EXCEPTION '% 名額已滿', CASE WHEN v_treatment = 'face' THEN 'Face' ELSE 'Body' END;
  END IF;

  INSERT INTO public.volunteer_apply (
    campaign_id,
    name,
    phone,
    whatsapp,
    email,
    instagram_account,
    follower_count,
    treatment_type,
    skin_concerns,
    agree_followup,
    status
  ) VALUES (
    c.id,
    v_name,
    v_phone,
    v_whatsapp,
    v_email,
    v_ig,
    v_followers,
    v_treatment,
    v_skin,
    v_followup,
    'pending'
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_volunteer_apply(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_volunteer_apply(jsonb) TO authenticated;

-- Staff: approve / reject with quota re-check on approve
CREATE OR REPLACE FUNCTION public.review_volunteer_apply(
  p_apply_id uuid,
  p_status text,
  p_status_note text DEFAULT NULL,
  p_reviewed_by text DEFAULT NULL
)
RETURNS public.volunteer_apply
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.volunteer_apply%ROWTYPE;
  c public.volunteer_campaign%ROWTYPE;
  approved_count integer;
  quota_limit integer;
BEGIN
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT * INTO a
  FROM public.volunteer_apply
  WHERE id = p_apply_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '報名紀錄不存在';
  END IF;

  SELECT * INTO c
  FROM public.volunteer_campaign
  WHERE id = a.campaign_id
  FOR UPDATE;

  IF p_status = 'approved' AND a.status <> 'approved' THEN
    SELECT COUNT(*) INTO approved_count
    FROM public.volunteer_apply
    WHERE campaign_id = a.campaign_id
      AND treatment_type = a.treatment_type
      AND status = 'approved'
      AND id <> a.id;

    quota_limit := CASE WHEN a.treatment_type = 'face' THEN c.face_quota ELSE c.body_quota END;

    IF approved_count >= quota_limit THEN
      RAISE EXCEPTION '% 名額已滿，無法通過', CASE WHEN a.treatment_type = 'face' THEN 'Face' ELSE 'Body' END;
    END IF;
  END IF;

  UPDATE public.volunteer_apply
  SET
    status = p_status,
    status_note = NULLIF(trim(p_status_note), ''),
    reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
    reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE NULLIF(trim(p_reviewed_by), '') END
  WHERE id = p_apply_id
  RETURNING * INTO a;

  RETURN a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_volunteer_apply(uuid, text, text, text) TO authenticated;

-- Seed first Doctor Peel campaign (idempotent by slug)
INSERT INTO public.volunteer_campaign (
  slug,
  title,
  product_name,
  description,
  incentive,
  deliverables,
  requirements_note,
  min_followers,
  face_quota,
  body_quota,
  status
)
VALUES (
  'doctor-peel',
  'Doctor Peel 志願招募',
  'Doctor Peel',
  '招募對美妝有興趣的 KOL，免費試用 Doctor Peel（Face / Body）。適合色素、角質、黑頭、暗瘡、皮膚屏障受損、暗沉等肌膚問題；配方無化學添加、純素。',
  '免費贊助 4 次療程',
  '1 條 Instagram Reel + 4 條 Instagram Stories；療程後約兩週回訪拍攝 before / after',
  'Instagram 粉絲需達 5,000 或以上；Face / Body 各 20 個名額',
  5000,
  20,
  20,
  'open'
)
ON CONFLICT (slug) DO NOTHING;
