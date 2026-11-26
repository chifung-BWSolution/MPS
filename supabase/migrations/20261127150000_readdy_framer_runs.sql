-- Framer MCP sessions live in their own rows, and one-click conversion
-- continues from a server queue instead of the browser tab.

create table if not exists public.framer_mcp_sessions (
  slot int not null,
  project_key text not null,
  project_id text not null default '',
  project_url text not null default '',
  mcp_session_id text,
  project_session text not null default '',
  opened_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  reopen_after timestamptz,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (slot, project_key)
);

alter table public.framer_mcp_sessions enable row level security;

create table if not exists public.framer_conversion_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  project_key text not null,
  status text not null default 'queued',
  payload jsonb not null,
  progress jsonb not null default '{}'::jsonb,
  page_index int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists framer_conversion_runs_status_idx
  on public.framer_conversion_runs (status, updated_at);

alter table public.framer_conversion_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_conversion_runs'
      and policyname = 'Authenticated read conversion runs'
  ) then
    create policy "Authenticated read conversion runs"
      on public.framer_conversion_runs for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_conversion_runs'
      and policyname = 'Users insert own conversion runs'
  ) then
    create policy "Users insert own conversion runs"
      on public.framer_conversion_runs for insert to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'framer_conversion_runs'
      and policyname = 'Users update own conversion runs'
  ) then
    create policy "Users update own conversion runs"
      on public.framer_conversion_runs for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'framer_conversion_runs'
     ) then
    alter publication supabase_realtime add table public.framer_conversion_runs;
  end if;
end $$;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  src_cmd text;
  new_cmd text;
begin
  if exists (select 1 from cron.job where jobname = 'readdy-conversion-tick') then
    return;
  end if;

  select command into src_cmd
  from cron.job
  where command ilike '%net.http_post%'
    and command ilike '%/functions/v1/%'
  order by jobname
  limit 1;

  if src_cmd is null then
    raise notice
      'readdy-conversion-tick 未建立：找不到可複製 auth 的 functions HTTP cron。';
    return;
  end if;

  new_cmd := regexp_replace(src_cmd, 'functions/v1/[^'']+', 'functions/v1/readdy-conversion-worker', 'g');
  perform cron.schedule('readdy-conversion-tick', '* * * * *', new_cmd);
  raise notice 'readdy-conversion-tick 已建立：每分鐘續跑佇列';
end $$;
