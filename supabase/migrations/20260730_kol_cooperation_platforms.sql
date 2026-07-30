-- kol_cooperation: cooperation content + platforms

ALTER TABLE public.kol_cooperation
  ADD COLUMN IF NOT EXISTS cooperation_content text,
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS kol_cooperation_platforms_gin_idx
  ON public.kol_cooperation USING GIN (platforms);

-- Backfill content from legacy evaluation field
UPDATE public.kol_cooperation
SET cooperation_content = evaluation
WHERE cooperation_content IS NULL AND evaluation IS NOT NULL AND btrim(evaluation) <> '';
