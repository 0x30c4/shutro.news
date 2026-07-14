/* ডেমো ওয়্যার — নমুনা কর্পাস (data.js) থেকে ধাপে ধাপে খবর "প্রকাশ" করে,
   যেন সত্যিকারের স্ক্র্যাপ চলছে। প্রতিটি আইটেম বাকি পাইপলাইনের ভেতর দিয়েই
   যায়: এমবেডিং, ক্লাস্টারিং, LLM stance, সারসংক্ষেপ — সবই আসল।
   একটি স্ক্রিপ্টেড শিরোনাম-বদলও আছে (প্রথম আলো / মেট্রো), যাতে
   change-tracking পথটাও চর্চিত হয়। */

import { SAMPLE_CLUSTERS } from './registry.js';
import { meta } from './db.js';

const BATCH_SIZE = 14;

function buildPool() {
  const pool = [];
  const maxReports = Math.max(...SAMPLE_CLUSTERS.map((c) => c.reports.length));
  for (let wave = 0; wave < maxReports; wave++) {
    for (const cluster of SAMPLE_CLUSTERS) {
      const report = cluster.reports[wave];
      if (!report) continue;
      const url = `https://demo.shutro.news/${report.src}/${cluster.id}-${wave}`;
      let headline = report.headline;
      if (cluster.id === 'metro-fare' && report.src === 'prothom-alo') {
        headline = 'মেট্রোরেলের ভাড়া বাড়ছে, কার্যকর ১ আগস্ট'; // v1 — পরে বদলাবে
      }
      // ডেমো খবরের বাস্তব ছবি নেই — ক্লাস্টার-প্রতি নির্ধারিত প্লেসহোল্ডার ফটো
      const image = `https://picsum.photos/seed/shutro-${cluster.id}/640/360`;
      pool.push({ source: report.src, url, headline, image });
    }
  }
  // শিরোনাম-বদলের ঘটনা: একই URL, নতুন শিরোনাম — পরের কোনো রানে
  const metro = SAMPLE_CLUSTERS.find((c) => c.id === 'metro-fare');
  const wave = metro.reports.findIndex((r) => r.src === 'prothom-alo');
  pool.push({
    source: 'prothom-alo',
    url: `https://demo.shutro.news/prothom-alo/metro-fare-${wave}`,
    headline: metro.reports[wave].headline, // v2
  });
  return pool;
}

const POOL = buildPool();

export function nextDemoBatch() {
  const cursor = meta.get('demo_cursor', 0);
  const slice = POOL.slice(cursor, cursor + BATCH_SIZE);
  if (slice.length) meta.set('demo_cursor', cursor + slice.length);
  const now = Date.now();
  return slice.map((item, i) => ({
    ...item,
    publishedAt: new Date(now - (slice.length - i) * 4 * 60000).toISOString(),
  }));
}

export const demoPoolSize = POOL.length;
