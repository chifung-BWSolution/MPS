-- Readdy -> Framer workbench jobs, shared Framer OAuth/GitHub connection, and asset bucket

create table if not exists public.framer_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  source_type text not null default 'paste',
  github_repo_meta jsonb,
  storage_bundle_path text,
  framer_project_url text not null,
  grid_config jsonb not null,
  raw_readdy_code text not null,
  ir_payload jsonb,
  current_step int not null default 0,
  status text not null default 'pending',
  step_logs jsonb not null default '[]'::jsonb,
  error_log text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists framer_sync_jobs_created_at_idx
  on public.framer_sync_jobs (created_at desc);

alter table public.framer_sync_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_sync_jobs'
      and policyname = 'Authenticated users can read framer_sync_jobs'
  ) then
    create policy "Authenticated users can read framer_sync_jobs"
      on public.framer_sync_jobs for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_sync_jobs'
      and policyname = 'Authenticated users can insert framer_sync_jobs'
  ) then
    create policy "Authenticated users can insert framer_sync_jobs"
      on public.framer_sync_jobs for insert to authenticated with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_sync_jobs'
      and policyname = 'Authenticated users can update framer_sync_jobs'
  ) then
    create policy "Authenticated users can update framer_sync_jobs"
      on public.framer_sync_jobs for update to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_sync_jobs'
      and policyname = 'Authenticated users can delete framer_sync_jobs'
  ) then
    create policy "Authenticated users can delete framer_sync_jobs"
      on public.framer_sync_jobs for delete to authenticated using (true);
  end if;
end $$;

create table if not exists public.framer_oauth_connections (
  id text primary key default 'default',
  client_id text,
  redirect_uri text,
  access_token text,
  refresh_token text,
  token_type text default 'Bearer',
  scope text,
  expires_at timestamptz,
  pending_state text,
  pending_code_verifier text,
  pending_expires_at timestamptz,
  github_token text,
  github_token_preview text,
  connected_at timestamptz,
  last_used_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.framer_oauth_connections enable row level security;

insert into storage.buckets (id, name, public)
values ('readdy-framer-assets', 'readdy-framer-assets', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Public read readdy-framer-assets'
  ) then
    create policy "Public read readdy-framer-assets"
      on storage.objects for select using (bucket_id = 'readdy-framer-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated insert readdy-framer-assets'
  ) then
    create policy "Authenticated insert readdy-framer-assets"
      on storage.objects for insert to authenticated with check (bucket_id = 'readdy-framer-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated update readdy-framer-assets'
  ) then
    create policy "Authenticated update readdy-framer-assets"
      on storage.objects for update to authenticated
      using (bucket_id = 'readdy-framer-assets')
      with check (bucket_id = 'readdy-framer-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Authenticated delete readdy-framer-assets'
  ) then
    create policy "Authenticated delete readdy-framer-assets"
      on storage.objects for delete to authenticated using (bucket_id = 'readdy-framer-assets');
  end if;
end $$;

alter table public.framer_sync_jobs
  add column if not exists page_path text,
  add column if not exists page_title text,
  add column if not exists project_name text;

create index if not exists framer_sync_jobs_page_path_idx
  on public.framer_sync_jobs (page_path, created_at desc);
