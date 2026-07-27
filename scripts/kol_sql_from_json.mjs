/**
 * Print a single INSERT...SELECT jsonb_to_recordset SQL for one batch JSON file.
 * Usage: node scripts/kol_sql_from_json.mjs 01
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const n = process.argv[2];
if (!n) {
  console.error('Usage: node scripts/kol_sql_from_json.mjs <NN>');
  process.exit(1);
}
const file = path.join(__dirname, '_kol_batches', `batch_${String(n).padStart(2, '0')}.json`);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const sql = `INSERT INTO public.kol_profile (
  name, salutation, email, phone, age_group, birth_month, residence_area, work_area,
  blog_themes, specialty, instagram_account, instagram_followers, facebook_url, facebook_likes,
  xiaohongshu_url, xiaohongshu_followers, youtube_url, youtube_subscribers, openrice_url, openrice_level,
  blog_url, blog_subscribers, other_channels, other_followers, publish_platforms,
  tasting_frequency, tasting_experience, model_experience, on_camera_experience, wine_club,
  cooperation_intent, available_times, photo_url, work_photo_url, entry_number, source_status,
  source_created_at, referrer_url, raw_payload
)
SELECT
  name, salutation, email, phone, age_group, birth_month, residence_area, work_area,
  COALESCE(blog_themes, '{}'::text[]), specialty, instagram_account, instagram_followers, facebook_url, facebook_likes,
  xiaohongshu_url, xiaohongshu_followers, youtube_url, youtube_subscribers, openrice_url, openrice_level,
  blog_url, blog_subscribers, other_channels, other_followers, publish_platforms,
  tasting_frequency, tasting_experience, model_experience, on_camera_experience, wine_club,
  cooperation_intent, available_times, photo_url, work_photo_url, entry_number, source_status,
  source_created_at, referrer_url, COALESCE(raw_payload, '{}'::jsonb)
FROM jsonb_to_recordset('${esc(JSON.stringify(rows))}'::jsonb) AS x(
  name text, salutation text, email text, phone text, age_group text, birth_month text,
  residence_area text, work_area text, blog_themes text[], specialty text,
  instagram_account text, instagram_followers int, facebook_url text, facebook_likes int,
  xiaohongshu_url text, xiaohongshu_followers int, youtube_url text, youtube_subscribers int,
  openrice_url text, openrice_level text, blog_url text, blog_subscribers int,
  other_channels text, other_followers int, publish_platforms text,
  tasting_frequency text, tasting_experience text, model_experience text, on_camera_experience text,
  wine_club text, cooperation_intent text, available_times text,
  photo_url text, work_photo_url text, entry_number text, source_status text,
  source_created_at text, referrer_url text, raw_payload jsonb
);`;

process.stdout.write(sql);
