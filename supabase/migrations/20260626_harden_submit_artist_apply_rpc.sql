-- Run the V2 artist application submitter as a controlled database function.
-- Public users still cannot read artist_apply rows; they can only execute this
-- insert-only RPC, which writes artist_apply and artist_apply_photo together.

ALTER FUNCTION public.submit_artist_apply(jsonb, jsonb) SECURITY DEFINER;
ALTER FUNCTION public.submit_artist_apply(jsonb, jsonb) SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_artist_apply(jsonb, jsonb) TO service_role;
