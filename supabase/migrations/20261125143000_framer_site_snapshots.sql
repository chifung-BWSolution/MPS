-- Website-level history for the Readdy → Framer workbench.
-- Each row is one imported site (GitHub / zip / paste), separate from per-page analysis jobs.

create table if not exists public.framer_site_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  project_key text not null,
  project_name text not null,
  source_type text not null default 'github',
  source_label text,
  framer_project_url text,
  github_repo_url text,
  github_branch text,
  github_all_paths jsonb not null default '[]'::jsonb,
  storage_bundle_path text,
  analysis jsonb not null,
  page_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists framer_site_snapshots_created_at_idx
  on public.framer_site_snapshots (created_at desc);

alter table public.framer_site_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_site_snapshots'
      and policyname = 'Authenticated users can read framer_site_snapshots'
  ) then
    create policy "Authenticated users can read framer_site_snapshots"
      on public.framer_site_snapshots for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_site_snapshots'
      and policyname = 'Authenticated users can insert framer_site_snapshots'
  ) then
    create policy "Authenticated users can insert framer_site_snapshots"
      on public.framer_site_snapshots for insert to authenticated with check (true);
  end if;
end $$;
