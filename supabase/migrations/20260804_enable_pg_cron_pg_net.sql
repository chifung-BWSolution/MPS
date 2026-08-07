-- Enable extensions used by Ads daily crons (schedules configured in prod separately:
-- google-ads-incremental-daily @ 0 22 * * *, facebook-ads-incremental-daily @ 15 22 * * *)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
