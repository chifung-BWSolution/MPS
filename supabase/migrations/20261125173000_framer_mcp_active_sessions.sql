alter table public.framer_oauth_connections
  add column if not exists active_mcp_sessions jsonb not null default '{}'::jsonb;
