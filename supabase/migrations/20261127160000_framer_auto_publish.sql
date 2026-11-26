-- Team switch: publish the Framer project after MPS syncs a page onto the canvas.

alter table public.framer_oauth_connections
  add column if not exists auto_publish boolean not null default false;
