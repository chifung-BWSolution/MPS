# Backlink Excel Import Data

Source workbook: `SEO backlink order record + keywords update schedule.xlsx`

Import to Supabase:

```bash
node scripts/import_backlink_excel.mjs --push
```

Unmatched Google Ads domains are listed in `backlink_unmatched_domains.json`.
