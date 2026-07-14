import { readFileSync } from 'node:fs';

function loadEnvFile() {
  try {
    const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch { /* .env absent — env vars only */ }
}
loadEnvFile();

export const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-5.4-mini',
  /* ক্লাস্টার-বিচার সূক্ষ্ম কাজ — reasoning মডেল লাগে; gpt-4o(-mini) এখানে
     একই-বিষয়-ভিন্ন-ঘটনা গুলিয়ে ফেলে (পরীক্ষিত) */
  OPENAI_ADJUDICATE_MODEL: process.env.OPENAI_ADJUDICATE_MODEL ?? 'gpt-5.4-mini',
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small',
  PORT: Number(process.env.PORT ?? 8790),
  INGEST_MODE: process.env.INGEST_MODE ?? 'mixed', // demo | live | mixed
  REFRESH_MINUTES: Number(process.env.REFRESH_MINUTES ?? 30),
  /* এমবেডিং-মিল ≥ THRESHOLD → সরাসরি একই ক্লাস্টারে (নমুনায় ভিন্ন-ঘটনার
     সর্বোচ্চ মিল ~0.40 মাপা হয়েছে, তাই 0.60 নিরাপদ)। এর নিচে সবকিছুর
     ভাগ্য LLM-বিচারক ঠিক করে — স্পিন-করা শিরোনাম এমবেডিংয়ে ধরা পড়ে না। */
  CLUSTER_THRESHOLD: Number(process.env.CLUSTER_THRESHOLD ?? 0.60),
  ADJUDICATE_MAX_CLUSTERS: Number(process.env.ADJUDICATE_MAX_CLUSTERS ?? 40),
  MAX_NEW_PER_RUN: Number(process.env.MAX_NEW_PER_RUN ?? 40),
  DB_PATH: process.env.DB_PATH ?? new URL('./shutro.db', import.meta.url).pathname,
  ACTIVE_WINDOW_HOURS: 72,
};

if (!config.OPENAI_API_KEY) {
  console.warn('[config] OPENAI_API_KEY নেই — LLM ধাপগুলো fallback-এ চলবে (stance=neutral, summary=শিরোনামভিত্তিক)');
}
