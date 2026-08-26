-- Remove unused V1 talent application table.
-- Live submissions, interviews, and staff views use artist_apply.
-- CASCADE drops FKs from confirmed_artist / rejected_artist source_form_id;
-- those columns stay as historical ids without a parent table.

DROP TABLE IF EXISTS public.talent_form CASCADE;
