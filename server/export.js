/* GitHub Actions-এর জন্য: পাইপলাইন একবার চালিয়ে স্ট্যাটিক সাইট (_site/) বানায় —
   ফ্রন্টএন্ড ফাইল + /api/bootstrap.json। GitHub Pages এই ফোল্ডারটাই serve করে। */

import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './pipeline.js';
import { bootstrapJSON } from './api.js';
import { db } from './db.js';
import { config } from './config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '_site');

/* DB ছোট রাখা: ৭ দিনের বেশি পুরোনো প্রতিবেদন ও অনাথ ক্লাস্টার ছাঁটা —
   ডেটা-ব্রাঞ্চের কমিট সাইজ স্থির থাকে */
function prune() {
  /* লাইভ মোডে ডেমো-কর্পাসের নমুনা প্রতিবেদন সরিয়ে ফেলা — হোস্টেড সাইটে
     শুধু আসল স্ক্র্যাপ-করা খবর */
  if (config.INGEST_MODE === 'live') {
    db.prepare("DELETE FROM articles WHERE url LIKE 'https://demo.%'").run();
  }
  const cutoff = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
  db.prepare(`DELETE FROM headline_history WHERE article_id IN
    (SELECT id FROM articles WHERE published_at < ?)`).run(cutoff);
  db.prepare('DELETE FROM articles WHERE published_at < ?').run(cutoff);
  db.prepare(`DELETE FROM clusters WHERE id NOT IN
    (SELECT DISTINCT cluster_id FROM articles WHERE cluster_id IS NOT NULL)`).run();
  db.exec('VACUUM');
}

await runPipeline('export');
prune();

mkdirSync(join(OUT, 'api'), { recursive: true });
writeFileSync(join(OUT, 'api', 'bootstrap.json'), JSON.stringify(bootstrapJSON()));

const STATIC_FILES = [
  'index.html', 'story.html', 'source.html', 'sources.html', 'blindspot.html',
  'styles.css', 'app.js', 'data.js',
];
for (const file of STATIC_FILES) copyFileSync(join(ROOT, file), join(OUT, file));

console.log(`[export] _site প্রস্তুত — ${STATIC_FILES.length}টি ফাইল + api/bootstrap.json`);
