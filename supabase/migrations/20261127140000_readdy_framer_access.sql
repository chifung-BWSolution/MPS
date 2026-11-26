-- Readdy / Framer access: private source bundles, image-only public reads,
-- owner-only job edits, and a single-flight lock for Framer token refresh.

alter table public.framer_oauth_connections
  add column if not exists token_refresh_until timestamptz;

create or replace function public.claim_framer_token_refresh(claim_until timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  update public.framer_oauth_connections
  set token_refresh_until = claim_until,
      updated_at = now()
  where id = 'default'
    and (token_refresh_until is null or token_refresh_until < now())
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_framer_token_refresh(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_framer_token_refresh(timestamptz) to service_role;

drop policy if exists "Authenticated users can update framer_sync_jobs" on public.framer_sync_jobs;
drop policy if exists "Authenticated users can delete framer_sync_jobs" on public.framer_sync_jobs;

create policy "Users update own framer_sync_jobs"
  on public.framer_sync_jobs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete own framer_sync_jobs"
  on public.framer_sync_jobs for delete to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('readdy-framer-bundles', 'readdy-framer-bundles', false)
on conflict (id) do update set public = false;

drop policy if exists "Public read readdy-framer-assets" on storage.objects;

create policy "Public read readdy image assets"
  on storage.objects for select
  to public
  using (
    bucket_id = 'readdy-framer-assets'
    and name like 'assets/%'
  );

create policy "Authenticated read readdy-framer-assets"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'readdy-framer-assets');

create policy "Authenticated read readdy-framer-bundles"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'readdy-framer-bundles');

create policy "Authenticated insert readdy-framer-bundles"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'readdy-framer-bundles');

create policy "Authenticated update readdy-framer-bundles"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'readdy-framer-bundles')
  with check (bucket_id = 'readdy-framer-bundles');

create policy "Authenticated delete readdy-framer-bundles"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'readdy-framer-bundles');
