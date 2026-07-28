/**
 * Parse Food Blogger KOL xlsx (unzipped OOXML) → kol_profile INSERT batches.
 *
 * Usage:
 *   node scripts/import_kol_food_blogger.mjs            # write SQL batches under scripts/_kol_batches/
 *   node scripts/import_kol_food_blogger.mjs --stats    # print parse stats only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '_kol_unzip');
const outDir = path.join(__dirname, '_kol_batches');
const BATCH_SIZE = 80;

const HEADERS = [
  'Entry Number',
  '姓名',
  '稱謂',
  '電郵地址',
  '聯絡電話',
  '年齡層',
  '出生月份\n(通知您生日優惠)',
  '居住地區 (方便試食安排)',
  '工作地區 (方便試食安排)',
  'Blogger 試食時間',
  'Blogger 試食+寫食評經驗',
  '試食報告發佈平台',
  'Openrice 食家連結',
  'Openrice 食家評級',
  'Facebook 網頁連結',
  'Facebook Page讚好數目',
  'Instagram 帳號',
  'Instagram Follower數目',
  '個人網址 / Blog',
  '個人網址訂閱人數',
  '小紅書',
  '小紅書粉絲人數',
  'Youtube Channels',
  'Youtube Subscriber 數目',
  'Other Channels',
  'Other Follower數目',
  'Blog 的主題',
  '合作層面:上鏡機會,\n媒體訪問, 餐飲Party, \n你有興趣嗎? \n(可選多項)',
  '影片Blog內容推廣\n(讓更多人收看你的內容)',
  '可以做試食活動時間\n(可選多於一項)',
  'Wine & Dine KOL Club\n分享品酒文化賺取收入',
  '模特兒 Model 經驗',
  '上鏡經驗',
  '有興趣成為Facebook Live 主播',
  '[相片1] 個人近照',
  '[相片2]  工作時相片\n(方便安排拍攝上鏡機會)',
  'Date Created',
  'IP Address',
  'Status',
  'Referrer URL',
];

function decodeXml(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&#xA;/gi, '\n')
    .replace(/&apos;/g, "'");
}

function loadSharedStrings() {
  const sst = fs.readFileSync(path.join(root, 'xl/sharedStrings.xml'), 'utf8');
  const strings = [];
  for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => decodeXml(x[1]));
    strings.push(parts.join(''));
  }
  return strings;
}

function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(strings) {
  const sheet = fs.readFileSync(path.join(root, 'xl/worksheets/sheet1.xml'), 'utf8');
  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of rowMatch[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?/g)) {
      const col = c[1];
      const attrs = c[3] || '';
      const v = c[4];
      if (v === undefined) {
        cells[colToIndex(col)] = '';
        continue;
      }
      const isShared = /t="s"/.test(attrs);
      cells[colToIndex(col)] = isShared ? (strings[+v] ?? '') : v;
    }
    rows.push(cells);
  }
  return rows;
}

function cell(row, i) {
  const v = row[i];
  if (v == null) return '';
  return String(v).trim();
}

function parseIntSafe(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace(/,/g, '').replace(/\s/g, '');
  const m = s.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeIg(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) s = urlMatch[1];
  s = s.replace(/^@/, '').trim();
  if (!s || s === 'p' || s === 'reel' || s === 'stories') return null;
  return s;
}

function parseThemes(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      // "美食 Food" → prefer Chinese label for card tag
      const zh = t.match(/^([\u4e00-\u9fffA-Za-z0-9 /&+-]+)/);
      return (zh ? zh[1] : t).trim();
    })
    .filter(Boolean);
}

function themeLabel(themes) {
  if (!themes.length) return '未分類';
  const first = themes[0];
  if (/美食|food/i.test(first)) return '美食';
  if (/旅行|travel/i.test(first)) return '旅行';
  if (/生活|life/i.test(first)) return '生活';
  // take first token before space if bilingual
  const short = first.split(/\s+/)[0];
  return short.slice(0, 8) || '未分類';
}

function sqlStr(v) {
  if (v == null || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlArr(arr) {
  if (!arr?.length) return `'{}'::text[]`;
  const inner = arr.map((x) => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  return `ARRAY[${arr.map((x) => sqlStr(x)).join(',')}]::text[]`;
}

function sqlJson(obj) {
  return `${sqlStr(JSON.stringify(obj))}::jsonb`;
}

function sqlInt(v) {
  return v == null ? 'NULL' : String(v);
}

function rowToRecord(row) {
  const get = (i) => cell(row, i);
  const name = get(1);
  const phone = get(4);
  const email = get(3);
  const status = get(38).toLowerCase();
  const themes = parseThemes(get(26));

  return {
    entry_number: get(0) || null,
    name: name || null,
    salutation: get(2) || null,
    email: email || null,
    phone: phone || null,
    age_group: get(5) || null,
    birth_month: get(6) || null,
    residence_area: get(7) || null,
    work_area: get(8) || null,
    tasting_frequency: get(9) || null,
    tasting_experience: get(10) || null,
    publish_platforms: get(11) || null,
    openrice_url: get(12) || null,
    openrice_level: get(13) || null,
    facebook_url: get(14) || null,
    facebook_likes: parseIntSafe(get(15)),
    instagram_account: normalizeIg(get(16)),
    instagram_followers: parseIntSafe(get(17)),
    blog_url: get(18) || null,
    blog_subscribers: parseIntSafe(get(19)),
    xiaohongshu_url: get(20) || null,
    xiaohongshu_followers: parseIntSafe(get(21)),
    youtube_url: get(22) || null,
    youtube_subscribers: parseIntSafe(get(23)),
    other_channels: get(24) || null,
    other_followers: parseIntSafe(get(25)),
    blog_themes: themes,
    specialty: themes.length ? themes.join(', ') : null,
    cooperation_intent: get(27) || null,
    video_blog_promo: get(28) || null,
    available_times: get(29) || null,
    wine_club: get(30) || null,
    model_experience: get(31) || null,
    on_camera_experience: get(32) || null,
    facebook_live_interest: get(33) || null,
    photo_url: get(34) || null,
    work_photo_url: get(35) || null,
    source_created_at: get(36) || null,
    source_status: get(38) || null,
    referrer_url: get(39) || null,
    raw_payload: {
      entryNumber: get(0),
      videoBlogPromo: get(28),
      facebookLiveInterest: get(33),
      ipAddress: get(37),
      themeLabel: themeLabel(themes),
      rawThemes: get(26),
      rawInstagram: get(16),
    },
    _status: status,
    _skipEmpty: !name && !phone,
  };
}

function toInsertSql(rec) {
  return `(
    ${sqlStr(rec.name)},
    ${sqlStr(rec.salutation)},
    ${sqlStr(rec.email)},
    ${sqlStr(rec.phone)},
    ${sqlStr(rec.age_group)},
    ${sqlStr(rec.birth_month)},
    ${sqlStr(rec.residence_area)},
    ${sqlStr(rec.work_area)},
    ${sqlArr(rec.blog_themes)},
    ${sqlStr(rec.specialty)},
    ${sqlStr(rec.instagram_account)},
    ${sqlInt(rec.instagram_followers)},
    ${sqlStr(rec.facebook_url)},
    ${sqlInt(rec.facebook_likes)},
    ${sqlStr(rec.xiaohongshu_url)},
    ${sqlInt(rec.xiaohongshu_followers)},
    ${sqlStr(rec.youtube_url)},
    ${sqlInt(rec.youtube_subscribers)},
    ${sqlStr(rec.openrice_url)},
    ${sqlStr(rec.openrice_level)},
    ${sqlStr(rec.blog_url)},
    ${sqlInt(rec.blog_subscribers)},
    ${sqlStr(rec.other_channels)},
    ${sqlInt(rec.other_followers)},
    ${sqlStr(rec.publish_platforms)},
    ${sqlStr(rec.tasting_frequency)},
    ${sqlStr(rec.tasting_experience)},
    ${sqlStr(rec.model_experience)},
    ${sqlStr(rec.on_camera_experience)},
    ${sqlStr(rec.wine_club)},
    ${sqlStr(rec.cooperation_intent)},
    ${sqlStr(rec.video_blog_promo)},
    ${sqlStr(rec.facebook_live_interest)},
    ${sqlStr(rec.available_times)},
    ${sqlStr(rec.photo_url)},
    ${sqlStr(rec.work_photo_url)},
    ${sqlStr(rec.entry_number)},
    ${sqlStr(rec.source_status)},
    ${sqlStr(rec.source_created_at)},
    ${sqlStr(rec.referrer_url)},
    ${sqlJson(rec.raw_payload)}
  )`;
}

const INSERT_COLS = `name, salutation, email, phone, age_group, birth_month, residence_area, work_area,
  blog_themes, specialty, instagram_account, instagram_followers, facebook_url, facebook_likes,
  xiaohongshu_url, xiaohongshu_followers, youtube_url, youtube_subscribers, openrice_url, openrice_level,
  blog_url, blog_subscribers, other_channels, other_followers, publish_platforms,
  tasting_frequency, tasting_experience, model_experience, on_camera_experience, wine_club,
  cooperation_intent, video_blog_promo, facebook_live_interest, available_times, photo_url, work_photo_url,
  entry_number, source_status, source_created_at, referrer_url, raw_payload`;

function main() {
  if (!fs.existsSync(path.join(root, 'xl/worksheets/sheet1.xml'))) {
    console.error('Missing unzipped xlsx at', root);
    process.exit(1);
  }

  const strings = loadSharedStrings();
  const rows = parseSheet(strings);
  // skip header
  const dataRows = rows.slice(1);

  // Discover actual header texts from row 0 for diagnostics
  const headerRow = rows[0] || {};
  const discovered = [];
  for (let i = 0; i < 40; i++) discovered.push(headerRow[i] ?? '');
  console.log('Discovered headers (first 10):', discovered.slice(0, 10));

  let skippedStatus = 0;
  let skippedEmpty = 0;
  let skippedDup = 0;
  const seenPhone = new Set();
  const seenEmail = new Set();
  const records = [];

  for (const row of dataRows) {
    const rec = rowToRecord(row);
    if (rec._skipEmpty) {
      skippedEmpty++;
      continue;
    }
    if (rec._status && rec._status !== 'complete') {
      skippedStatus++;
      continue;
    }
    const phoneKey = rec.phone ? rec.phone.toLowerCase().trim() : null;
    const emailKey = rec.email ? rec.email.toLowerCase().trim() : null;
    // Phone first, then email — skip if either key already seen
    if (phoneKey && seenPhone.has(phoneKey)) {
      skippedDup++;
      continue;
    }
    if (emailKey && seenEmail.has(emailKey)) {
      skippedDup++;
      continue;
    }
    if (phoneKey) seenPhone.add(phoneKey);
    if (emailKey) seenEmail.add(emailKey);
    records.push(rec);
  }

  console.log(
    JSON.stringify(
      {
        totalRows: dataRows.length,
        toInsert: records.length,
        skippedStatus,
        skippedEmpty,
        skippedDup,
        withPhoto: records.filter((r) => r.photo_url).length,
        withIg: records.filter((r) => r.instagram_account).length,
      },
      null,
      2
    )
  );

  if (process.argv.includes('--stats')) return;

  fs.mkdirSync(outDir, { recursive: true });
  // clear old batches
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.sql') || f.endsWith('.json')) fs.unlinkSync(path.join(outDir, f));
  }

  const batches = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const values = chunk.map(toInsertSql).join(',\n');
    // ON CONFLICT DO NOTHING on unique indexes — use WHERE NOT EXISTS for phone/email
    const sql = `INSERT INTO public.kol_profile (${INSERT_COLS})
VALUES
${values}
ON CONFLICT DO NOTHING;`;
    // Note: partial unique indexes don't work with ON CONFLICT without constraint name.
    // Use DO NOTHING via exception-safe approach: insert with WHERE NOT EXISTS per row is heavy.
    // Instead use ON CONFLICT ON CONSTRAINT — but we have partial unique indexes.
    // Fallback: plain INSERT and catch duplicates at apply time, OR use:
    batches.push({ index: batches.length + 1, sql: null, chunk });
  }

  // Rebuild with explicit conflict-safe inserts
  const safeBatches = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const stmts = chunk.map((rec) => {
      const phoneCond = rec.phone
        ? `NOT EXISTS (SELECT 1 FROM public.kol_profile k WHERE lower(k.phone) = lower(${sqlStr(rec.phone)}))`
        : 'TRUE';
      const emailCond = rec.email
        ? `NOT EXISTS (SELECT 1 FROM public.kol_profile k WHERE lower(k.email) = lower(${sqlStr(rec.email)}))`
        : 'TRUE';
      return `INSERT INTO public.kol_profile (${INSERT_COLS})
SELECT ${toInsertSql(rec).replace(/^\(/, '').replace(/\)$/, '')}
WHERE (${phoneCond}) AND (${emailCond});`;
    });
    // Simpler: multi-value insert is fine if we pre-deduped; DB unique will reject — use single INSERT ... VALUES with exception handling via CTE
    const values = chunk.map(toInsertSql).join(',\n');
    const sql = `-- batch ${safeBatches.length + 1}, rows ${chunk.length}
INSERT INTO public.kol_profile (${INSERT_COLS})
VALUES
${values};`;
    const file = path.join(outDir, `batch_${String(safeBatches.length + 1).padStart(2, '0')}.sql`);
    fs.writeFileSync(file, sql, 'utf8');
    // also write JSON for MCP/API insert
    const jsonFile = path.join(outDir, `batch_${String(safeBatches.length + 1).padStart(2, '0')}.json`);
    const jsonRows = chunk.map((r) => {
      const { _status, _skipEmpty, ...rest } = r;
      return rest;
    });
    fs.writeFileSync(jsonFile, JSON.stringify(jsonRows), 'utf8');
    safeBatches.push(file);
  }

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ total: records.length, batches: safeBatches.length, batchSize: BATCH_SIZE }, null, 2)
  );
  console.log(`Wrote ${safeBatches.length} batches to ${outDir}`);
}

main();
