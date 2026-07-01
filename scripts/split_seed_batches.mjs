import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'supabase', 'migrations', 'seed_batches');

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260630_seed_video_output.sql'), 'utf8');
const inserts = source.split(/\r?\n\r?\n(?=INSERT INTO)/).filter(s => s.trim().startsWith('INSERT INTO'));

fs.mkdirSync(outDir, { recursive: true });

const batchSize = 15;
const batches = [];
for (let i = 0; i < inserts.length; i += batchSize) {
  batches.push(inserts.slice(i, i + batchSize));
}

batches.forEach((batch, idx) => {
  const prefix = idx === 0 ? 'DELETE FROM public.video_output;\n\n' : '';
  const file = path.join(outDir, `batch_${String(idx + 1).padStart(2, '0')}.sql`);
  fs.writeFileSync(file, prefix + batch.join('\n\n') + '\n', 'utf8');
  console.log(file, fs.statSync(file).size);
});

console.log('batches', batches.length, 'inserts', inserts.length);
