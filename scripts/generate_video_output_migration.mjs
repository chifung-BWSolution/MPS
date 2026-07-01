import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'vchannel-xlsx-0tkTm8', 'unzipped');
const outPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260630_seed_video_output.sql');

const sst = fs.readFileSync(path.join(root, 'xl/sharedStrings.xml'), 'utf8');
const strings = [];
for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  strings.push(m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'));
}

const sheet = fs.readFileSync(path.join(root, 'xl/worksheets/sheet3.xml'), 'utf8');
const rows = sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];

function colRef(ref) {
  return ref.replace(/[0-9]/g, '');
}

function getCellValue(c) {
  const ref = c.match(/ r="([^"]+)"/)[1];
  if (c.includes(' t="s"')) {
    const v = parseInt(c.match(/<v>([^<]+)<\/v>/)[1], 10);
    return { ref, val: strings[v] ?? '' };
  }
  if (c.includes(' t="b"')) {
    return { ref, val: c.includes('<v>1</v>') };
  }
  const vm = c.match(/<v>([^<]+)<\/v>/);
  return { ref, val: vm ? vm[1] : '' };
}

function parseRow(rowXml) {
  const out = {};
  for (const m of rowXml.matchAll(/<c [^>]+>[\s\S]*?<\/c>/g)) {
    const { ref, val } = getCellValue(m[0]);
    out[colRef(ref)] = val;
  }
  return out;
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!n || Number.isNaN(n) || n < 1000) return null;
  const utc = Date.UTC(1899, 11, 30 + Math.floor(n));
  return new Date(utc).toISOString().slice(0, 10);
}

function parseDate(val) {
  if (val === true || val === false || val === undefined || val === null || val === '') return null;
  const s = String(val).trim();
  if (!s || s === 'true' || s === 'false') return null;
  if (/^\d{4}[./-]\d{1,2}([./-]\d{1,2})?$/.test(s)) {
    const parts = s.split(/[./-]/);
    const y = parts[0];
    const mo = parts[1]?.padStart(2, '0') ?? '01';
    const d = parts[2]?.padStart(2, '0') ?? '01';
    return `${y}-${mo}-${d}`;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToDate(s);
  return null;
}

function parseBool(val) {
  if (val === true) return true;
  if (val === false) return false;
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return false;
  return s === 'true' || s === 'y' || s === 'yes' || s === '1';
}

function parseOptionalBool(val) {
  if (val === true) return true;
  if (val === false) return false;
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'true' || s === 'y') return true;
  if (s === 'false' || s === 'n') return false;
  return null;
}

function parsePlatformPublish(row) {
  const map = {
    youtube: 'N',
    instagram: 'O',
    facebook: 'P',
    threads: 'Q',
    xiaohongshu: 'R',
    douyin: 'S',
    wechat_channels: 'T',
    wechat_official: 'U',
    zh_cn: 'V',
    zh_tw: 'W',
  };
  const out = {};
  for (const [key, col] of Object.entries(map)) {
    out[key] = parseBool(row[col]);
  }
  return out;
}

function resolveChannelPrefix(videoCode, vchannelCol) {
  const fromCol = String(vchannelCol ?? '').trim().toUpperCase();
  if (fromCol) return fromCol.split('/')[0];
  const code = String(videoCode ?? '').trim();
  if (!code) return '';
  return code.split('-')[0].split('/')[0].toUpperCase();
}

function inferCategory(channelPrefix) {
  const n = parseInt(channelPrefix.replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return 'client';
  return n <= 4 ? 'internal' : 'client';
}

function sqlStr(s) {
  if (s === null || s === undefined) return 'NULL';
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlBool(v) {
  if (v === null || v === undefined) return 'NULL';
  return v ? 'true' : 'false';
}

function sqlJson(obj) {
  return `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;
}

const records = [];
for (let i = 2; i < rows.length; i++) {
  const row = parseRow(rows[i]);
  const videoCode = String(row.C ?? '').trim();
  const title = String(row.D ?? '').trim();
  if (!videoCode && !title) continue;
  if (videoCode === 'Video Code') continue;

  const channelPrefix = resolveChannelPrefix(videoCode, row.B);
  const yearRaw = String(row.A ?? '').trim();
  const productionYear = yearRaw ? Math.round(parseFloat(yearRaw)) : null;
  const needsEditing = parseOptionalBool(row.I) ?? parseOptionalBool(row.J);

  records.push({
    channelPrefix,
    productionYear,
    videoCode,
    title: title || videoCode,
    asanaTaskId: String(row.E ?? '').trim() || null,
    asanaUrl: String(row.Y ?? '').trim() || null,
    shootSz: parseBool(row.F),
    shootHk: parseBool(row.G),
    rawFootageDone: parseBool(row.H),
    needsEditing,
    demoDone: parseBool(row.K),
    plannedPublishDate: parseDate(row.L),
    publishedDate: parseDate(row.M),
    platformPublish: parsePlatformPublish(row),
    storagePath: String(row.X ?? '').trim() || null,
    projectCategory: inferCategory(channelPrefix),
  });
}

const lines = [
  '-- Video output seed from Excel sheet 影片 Video輸出(改）',
  '-- Generated by scripts/generate_video_output_migration.mjs',
  '',
  'DELETE FROM public.video_output;',
  '',
];

for (const r of records) {
  lines.push(`INSERT INTO public.video_output (
  vchannel_id, production_year, video_code, title,
  asana_task_id, asana_url,
  shoot_sz, shoot_hk, raw_footage_done, needs_editing, demo_done,
  planned_publish_date, published_date,
  platform_publish, storage_path, project_category
) SELECT id, ${r.productionYear ?? 'NULL'}, ${sqlStr(r.videoCode)}, ${sqlStr(r.title)},
  ${sqlStr(r.asanaTaskId)}, ${sqlStr(r.asanaUrl)},
  ${sqlBool(r.shootSz)}, ${sqlBool(r.shootHk)}, ${sqlBool(r.rawFootageDone)}, ${sqlBool(r.needsEditing)}, ${sqlBool(r.demoDone)},
  ${r.plannedPublishDate ? sqlStr(r.plannedPublishDate) : 'NULL'}, ${r.publishedDate ? sqlStr(r.publishedDate) : 'NULL'},
  ${sqlJson(r.platformPublish)}, ${sqlStr(r.storagePath)}, ${sqlStr(r.projectCategory)}
FROM public.vchannels WHERE channel_code = ${sqlStr(r.channelPrefix)}
ON CONFLICT (video_code) DO NOTHING;`);
  lines.push('');
}

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${records.length} records to ${outPath}`);
