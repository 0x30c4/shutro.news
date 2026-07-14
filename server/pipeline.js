/* পাইপলাইন: ইনজেস্ট → শিরোনাম-বদল শনাক্ত → এমবেড → ক্লাস্টার →
   stance/topic শ্রেণীকরণ → নিরপেক্ষ সারসংক্ষেপ → ব্লাইন্ডস্পট। */

import { config } from './config.js';
import { db, q, meta } from './db.js';
import { SOURCES, TOPICS } from './registry.js';
import { fetchFeed } from './rss.js';
import { nextDemoBatch } from './demoFeed.js';
import { embedBatch, chatJSON } from './openaiClient.js';
import { cosine } from './util.js';

let running = false;
export const isRunning = () => running;

const CLASSIFY_SYSTEM = `তুমি বাংলাদেশের সংবাদমাধ্যম-বিশ্লেষক। প্রতিটি শিরোনামের জন্য নির্ধারণ করো:
1) stance — প্রতিবেদনটির অবস্থান সরকার/কর্তৃপক্ষের প্রতি:
   "govt" = সরকারের ভাষ্য, সাফল্য বা যুক্তি প্রাধান্য পেয়েছে;
   "critic" = সরকার/কর্তৃপক্ষের সমালোচনা বা ব্যর্থতা প্রাধান্য পেয়েছে;
   "neutral" = তথ্যনির্ভর, কোনো পক্ষের ভাষ্য প্রাধান্য পায়নি।
2) topic — এই তালিকা থেকে: ${TOPICS.join(', ')}, অন্যান্য।
শুধু JSON দাও: {"items":[{"id":<number>,"stance":"govt|neutral|critic","topic":"..."}]}`;

const ADJUDICATE_SYSTEM = `তুমি সংবাদ-ক্লাস্টারিং বিচারক। ইনপুটে পাবে:
existing_clusters — সক্রিয় ঘটনাগুলোর তালিকা (প্রতিটির কয়েকটি সদস্য-শিরোনামসহ),
new_headlines — নতুন শিরোনাম। প্রতিটি নতুন শিরোনাম কোন ক্লাস্টারের, নাকি নতুন ঘটনা?
কঠোর নিয়ম:
- "একই ক্লাস্টার" মানে একই সুনির্দিষ্ট ঘটনা/সিদ্ধান্ত/ম্যাচ/দুর্ঘটনা — শুধু একই বিষয় বা খাত নয়।
- একই বিষয়ের (যেমন অর্থনীতি) দুটি ভিন্ন ঘটনা = ভিন্ন ক্লাস্টার → null দাও।
  উদাহরণ: "টাকার দরপতন" আর "রপ্তানি আয়ে রেকর্ড" দুটোই অর্থনীতি, কিন্তু ভিন্ন ঘটনা → null।
- ভাষা/দৃষ্টিভঙ্গি ভিন্ন হলেও ঘটনা এক হলে ক্লাস্টার দাও।
  উদাহরণ: "ভাড়া ২০% বাড়ছে" আর "জনগণের পকেট কাটছে মেট্রোরেল" — একই ঘটনা।
- সন্দেহ থাকলে null।
cluster দিলে proof-ও দাও: সেই ক্লাস্টারের যেকোনো একটি সদস্য-শিরোনাম *হুবহু* কপি করে।
শুধু JSON দাও: {"items":[{"id":<number>,"cluster":<number|null>,"proof":"<সদস্য-শিরোনাম>"}]}`;

const MERGE_VERIFY_SYSTEM = `দুটি সংবাদ-ক্লাস্টারের সদস্য-শিরোনাম দেওয়া হবে।
এরা কি নিশ্চিতভাবে *একই সুনির্দিষ্ট ঘটনার* প্রতিবেদন? একই বিষয়, একই খাত বা
একই ধরনের ঘটনা যথেষ্ট নয় — একই ঘটনা/সিদ্ধান্ত/মুহূর্ত হতে হবে।
(যেমন: "মেট্রোরেলের ভাড়া বৃদ্ধি" আর "পদ্মা সেতুর টোল আদায়ে রেকর্ড" — দুটোই
পরিবহন-ভাড়া/টোল, কিন্তু সম্পূর্ণ ভিন্ন ঘটনা → false।)
নিশ্চিত না হলে false। শুধু JSON: {"same_event": true|false}`;

const MERGE_SYSTEM = `তুমি সংবাদ-ক্লাস্টার পর্যালোচক। ইনপুটে সক্রিয় ক্লাস্টারের
তালিকা (id + সদস্য-শিরোনাম)। কোন ক্লাস্টারগুলো আসলে *একই সুনির্দিষ্ট ঘটনার*
প্রতিবেদন — তাই এক হওয়া উচিত? স্পিন-করা শিরোনাম চিনে নাও: ভাষা ভিন্ন হলেও
ঘটনা এক হতে পারে (যেমন "ভাড়া ২০% বাড়ছে" = "জনগণের পকেট কাটছে মেট্রোরেল")।
কিন্তু একই বিষয়ের ভিন্ন ঘটনা মার্জ কোরো না (টাকার দরপতন ≠ রপ্তানিতে রেকর্ড)।
সন্দেহ থাকলে মার্জ নয়।
প্রতিটি মার্জ-গ্রুপে প্রতিটি ক্লাস্টারের id-র সঙ্গে সেই ক্লাস্টারের যেকোনো একটি
সদস্য-শিরোনাম *হুবহু* কপি করে দাও — এটি যাচাইয়ে ব্যবহৃত হবে।
শুধু JSON দাও:
{"merges":[[{"id":<number>,"headline":"<সদস্য-শিরোনাম>"},...],...]} — কিছু না থাকলে {"merges":[]}`;

function clusterMajorityTopic(clusterId) {
  const freq = {};
  for (const a of q.articlesOfCluster.all(clusterId)) {
    if (a.topic) freq[a.topic] = (freq[a.topic] ?? 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'অন্যান্য';
}

/* proof-যাচাই: বিচারকের দেওয়া শিরোনামটি সত্যিই ওই ক্লাস্টারের সদস্য কি না —
   ভুল id/হ্যালুসিনেশন আটকায় */
function proofMatches(clusterId, proof) {
  if (!proof) return false;
  const needle = String(proof).trim();
  return q.articlesOfCluster.all(clusterId).some((a) => a.headline.trim() === needle);
}

async function consolidateClusters(dirtyClusters) {
  const since = new Date(Date.now() - config.ACTIVE_WINDOW_HOURS * 3600000).toISOString();
  const clusters = q.activeClusters.all(since).slice(0, config.ADJUDICATE_MAX_CLUSTERS);
  if (clusters.length < 2) return;

  /* বিষয়-অনুযায়ী ভাগ করে ছোট ছোট সেটে বিচার — বড় তালিকায় id গুলিয়ে যায় */
  const byTopic = {};
  for (const c of clusters) (byTopic[clusterMajorityTopic(c.id)] ??= []).push(c);

  const now = new Date().toISOString();
  const validIds = new Set(clusters.map((c) => c.id));

  for (const group of Object.values(byTopic)) {
    if (group.length < 2) continue;
    let result = null;
    try {
      result = await chatJSON(MERGE_SYSTEM, JSON.stringify({
        clusters: group.map((c) => ({
          id: c.id,
          headlines: q.articlesOfCluster.all(c.id).slice(0, 5).map((a) => a.headline),
        })),
      }), config.OPENAI_ADJUDICATE_MODEL, 'medium');
    } catch (err) {
      console.error('[pipeline] consolidation ব্যর্থ:', err.message);
    }
    for (const merge of result?.merges ?? []) {
      const entries = (Array.isArray(merge) ? merge : []).filter((e) =>
        e && validIds.has(e.id) && proofMatches(e.id, e.headline));
      let ids = [...new Set(entries.map((e) => e.id))];
      if (ids.length < 2) continue;
      /* দ্বিতীয় মতামত: প্রতিটি জোড়া উচ্চ-এফোর্টে যাচাই — ৩০ মিনিট অন্তর বারবার
         বিচারের সুযোগে একবারের ভুল মার্জ স্থায়ী হয়ে যায়, তাই এখানে কড়াকড়ি */
      const [target, ...candidates] = ids;
      const verified = [];
      for (const id of candidates) {
        try {
          const v = await chatJSON(MERGE_VERIFY_SYSTEM, JSON.stringify({
            cluster_a: q.articlesOfCluster.all(target).map((a) => a.headline),
            cluster_b: q.articlesOfCluster.all(id).map((a) => a.headline),
          }), config.OPENAI_ADJUDICATE_MODEL, 'high');
          if (v?.same_event === true) verified.push(id);
        } catch (err) {
          console.error('[pipeline] merge-verify ব্যর্থ:', err.message);
        }
      }
      ids = [target, ...verified];
      if (ids.length < 2) continue;
      const rest = verified;
      for (const id of rest) {
        q.moveArticles.run(target, id);
        q.deleteCluster.run(id);
        validIds.delete(id);
        dirtyClusters.delete(id);
      }
      q.touchCluster.run(now, target);
      dirtyClusters.add(target);
      console.log(`[pipeline] ক্লাস্টার মার্জ: ${ids.join('+')} → ${target}`);
    }
  }
}

const SUMMARY_SYSTEM = `তুমি "সূত্র" — বাংলাদেশ নিউজ বায়াস ট্র্যাকারের নিরপেক্ষ সম্পাদক।
একই ঘটনার একাধিক পোর্টালের শিরোনাম দেওয়া হবে। ফেরত দাও JSON:
{"title":"...","summary":"...","topic":"..."}
- title: ঘটনাটির নিরপেক্ষ, তথ্যনির্ভর শিরোনাম (বাংলা, এক লাইনে)
- summary: ২–৩ বাক্যের নিরপেক্ষ সারসংক্ষেপ; সূত্রগুলোর ভাষার ফারাক থাকলে
  সেটিও এক বাক্যে উল্লেখ করো (কে কীভাবে ফ্রেম করেছে)
- topic: এই তালিকা থেকে: ${TOPICS.join(', ')}, অন্যান্য`;

async function gatherIncoming(errors) {
  const incoming = [];
  let portalsOk = 0;
  const mode = config.INGEST_MODE;

  if (mode === 'demo' || mode === 'mixed') {
    incoming.push(...nextDemoBatch());
    portalsOk = Object.keys(SOURCES).length; // ডেমো ওয়্যারে সব পোর্টাল "সচল"
  }
  if (mode === 'live' || mode === 'mixed') {
    const liveSources = Object.entries(SOURCES).filter(([, s]) => s.feed);
    const results = await Promise.allSettled(
      liveSources.map(async ([id, s]) => {
        const items = await fetchFeed(s.feed);
        return items.slice(0, s.gnews ? 10 : 15).map((item) => ({
          ...item,
          source: id,
          /* Google News শিরোনামের শেষে " - পোর্টালের নাম" থাকে — ছাঁটা */
          headline: s.gnews ? item.headline.replace(/\s+[-–|]\s+[^-–|]+$/, '') : item.headline,
        })).filter((item) =>
          /* ট্যাগ/আর্কাইভ-পাতা জাতীয় আবর্জনা বাদ — খবরের শিরোনাম নয় */
          item.headline.length >= 25 &&
          !/tag related|all news|আর্কাইভ|archive|видео|photos?$/i.test(item.headline));
      }),
    );
    if (mode === 'live') portalsOk = 0;
    results.forEach((r, i) => {
      const [id] = liveSources[i];
      if (r.status === 'fulfilled') {
        if (mode === 'live') portalsOk += 1;
        incoming.push(...r.value);
      } else {
        errors.push(`${id}: ${r.reason?.message ?? r.reason}`);
      }
    });
  }
  return { incoming, portalsOk };
}

function upsertArticles(incoming) {
  const now = new Date().toISOString();
  const freshIds = [];
  const dirtyClusters = new Set();
  for (const item of incoming) {
    const headline = item.headline.trim();
    if (!headline || headline.length < 8) continue;
    const existing = q.articleByUrl.get(item.url);
    if (!existing) {
      const res = q.insertArticle.run(item.source, item.url, headline, item.publishedAt, now, item.image ?? null);
      freshIds.push(Number(res.lastInsertRowid));
      continue;
    }
    if (!existing.image && item.image) q.setImage.run(item.image, existing.id);
    if (existing.headline !== headline) {
      q.insertHistory.run(existing.id, existing.headline, now);
      q.updateHeadline.run(headline, existing.id);
      if (existing.cluster_id) dirtyClusters.add(existing.cluster_id);
      console.log(`[pipeline] শিরোনাম বদল: ${item.source} — "${existing.headline}" → "${headline}"`);
    }
  }
  return { freshIds, dirtyClusters };
}

function loadCentroids() {
  const since = new Date(Date.now() - config.ACTIVE_WINDOW_HOURS * 3600000).toISOString();
  return q.activeClusters.all(since).map((cluster) => {
    const rows = q.clusterEmbeddings.all(cluster.id);
    if (!rows.length) return null;
    const vectors = rows.map((r) => JSON.parse(r.embedding));
    const centroid = vectors[0].map((_, d) =>
      vectors.reduce((sum, v) => sum + v[d], 0) / vectors.length);
    return { id: cluster.id, centroid, n: vectors.length };
  }).filter(Boolean);
}

async function adjudicateBorderline(pending, centroids) {
  const verdicts = new Map();
  if (!pending.length) return verdicts;
  /* বিচারক প্রার্থী-তালিকা নয়, সক্রিয় সব ক্লাস্টার দেখে — স্পিন-করা শিরোনামের
     আসল ক্লাস্টার এমবেডিং-মিলে টপ-৩-এ না-ও আসতে পারে। */
  const clusterList = centroids.slice(0, config.ADJUDICATE_MAX_CLUSTERS).map((c) => ({
    cluster: c.id,
    headlines: q.articlesOfCluster.all(c.id).slice(0, 4).map((a) => a.headline),
  }));
  for (let i = 0; i < pending.length; i += 8) {
    const chunk = pending.slice(i, i + 8);
    let result = null;
    try {
      result = await chatJSON(ADJUDICATE_SYSTEM, JSON.stringify({
        existing_clusters: clusterList,
        new_headlines: chunk.map((p) => ({ id: p.article.id, headline: p.article.headline })),
      }), config.OPENAI_ADJUDICATE_MODEL);
    } catch (err) {
      console.error('[pipeline] adjudication ব্যর্থ:', err.message);
    }
    for (const r of result?.items ?? []) {
      /* proof-যাচাই ছাড়া কোনো assignment গ্রহণ নয় */
      const ok = r.cluster != null && proofMatches(r.cluster, r.proof);
      verdicts.set(r.id, ok ? r.cluster : null);
    }
  }
  return verdicts;
}

async function assignClusters(freshIds, dirtyClusters) {
  /* এই রানের নতুন + আগের রানের অতিরিক্ত (এখনো ক্লাস্টারহীন) ব্যাকলগ —
     MAX_NEW_PER_RUN-এ কাটা পড়া প্রতিবেদন পরের রানে প্রক্রিয়া হয় */
  const fresh = db.prepare(
    'SELECT * FROM articles WHERE cluster_id IS NULL ORDER BY id ASC LIMIT ?',
  ).all(config.MAX_NEW_PER_RUN);
  if (!fresh.length) return [];

  let embeddings;
  try {
    embeddings = await embedBatch(fresh.map((a) => a.headline));
  } catch (err) {
    console.error('[pipeline] embedding ব্যর্থ:', err.message);
    embeddings = fresh.map(() => null);
  }

  const centroids = loadCentroids();
  const now = new Date().toISOString();

  const assign = (article, cluster, vec) => {
    cluster.centroid = cluster.centroid.map((x, d) => (x * cluster.n + vec[d]) / (cluster.n + 1));
    cluster.n += 1;
    q.touchCluster.run(now, cluster.id);
    q.setArticleCluster.run(cluster.id, JSON.stringify(vec), article.id);
    dirtyClusters.add(cluster.id);
  };
  const createNew = (article, vec) => {
    const res = q.insertCluster.run(article.headline, null, '', now, now);
    const clusterId = Number(res.lastInsertRowid);
    if (vec) centroids.push({ id: clusterId, centroid: vec, n: 1 });
    q.setArticleCluster.run(clusterId, vec ? JSON.stringify(vec) : null, article.id);
    dirtyClusters.add(clusterId);
  };

  const pending = [];
  fresh.forEach((article, i) => {
    const vec = embeddings[i];
    if (!vec) { createNew(article, null); return; }
    let best = null;
    for (const c of centroids) {
      const sim = cosine(vec, c.centroid);
      if (!best || sim > best.sim) best = { c, sim };
    }
    if (best && best.sim >= config.CLUSTER_THRESHOLD) assign(article, best.c, vec);
    else pending.push({ article, vec });
  });

  const verdicts = await adjudicateBorderline(pending, centroids);
  for (const p of pending) {
    const target = verdicts.get(p.article.id);
    let cluster = target != null ? centroids.find((c) => c.id === target) : null;
    if (!cluster) {
      /* বিচারকের null-এর পরেও এই রানেই তৈরি নতুন ক্লাস্টারের খুব কাছাকাছি হলে
         (একই ব্যাচে একই ঘটনার দুটি প্রতিবেদন) জোড়া লাগাও */
      let best = null;
      for (const c of centroids) {
        const sim = cosine(p.vec, c.centroid);
        if (!best || sim > best.sim) best = { c, sim };
      }
      if (best && best.sim >= config.CLUSTER_THRESHOLD) cluster = best.c;
    }
    if (cluster) assign(p.article, cluster, p.vec);
    else createNew(p.article, p.vec);
  }
  return fresh;
}

async function classify(freshArticles) {
  for (let i = 0; i < freshArticles.length; i += 16) {
    const chunk = freshArticles.slice(i, i + 16);
    let result = null;
    try {
      result = await chatJSON(CLASSIFY_SYSTEM, JSON.stringify({
        items: chunk.map((a) => ({ id: a.id, source: SOURCES[a.source]?.name ?? a.source, headline: a.headline })),
      }));
    } catch (err) {
      console.error('[pipeline] classification ব্যর্থ:', err.message);
    }
    const byId = new Map((result?.items ?? []).map((r) => [r.id, r]));
    for (const article of chunk) {
      const r = byId.get(article.id);
      const stance = ['govt', 'neutral', 'critic'].includes(r?.stance) ? r.stance : 'neutral';
      const topic = TOPICS.includes(r?.topic) ? r.topic : 'অন্যান্য';
      q.setArticleAnalysis.run(stance, topic, article.id);
    }
  }
}

async function summarizeClusters(dirtyClusters) {
  const ids = [...dirtyClusters].slice(0, 12);
  for (const clusterId of ids) {
    const articles = q.articlesOfCluster.all(clusterId);
    if (!articles.length) continue;
    if (articles.length === 1) {
      // এক-সূত্রের ক্লাস্টার — LLM খরচ নয়; শিরোনামই শিরোনাম, টপিক প্রতিবেদন থেকে
      q.setClusterSummary.run(articles[0].headline, '', articles[0].topic ?? 'অন্যান্য', clusterId);
      continue;
    }
    let result = null;
    try {
      result = await chatJSON(SUMMARY_SYSTEM, JSON.stringify({
        headlines: articles.map((a) => ({
          portal: SOURCES[a.source]?.name ?? a.source,
          stance: a.stance,
          headline: a.headline,
        })),
      }));
    } catch (err) {
      console.error('[pipeline] summary ব্যর্থ:', err.message);
    }
    const fallbackTopic = articles.find((a) => a.topic && a.topic !== 'অন্যান্য')?.topic ?? 'অন্যান্য';
    q.setClusterSummary.run(
      result?.title?.trim() || articles[0].headline,
      result?.summary?.trim() || '',
      TOPICS.includes(result?.topic) ? result.topic : fallbackTopic,
      clusterId,
    );
  }
}

/* ফিডে ছবি না-থাকা লাইভ প্রতিবেদনের পাতা থেকে og:image তুলে আনা */
async function backfillImages() {
  /* news.google.com লিংকের পেছনের আসল পাতা JS ছাড়া মেলে না — og:image
     আনতে গেলে গুগলের নিজের লোগো আসত; তাই বাদ */
  const rows = db.prepare(`SELECT id, url FROM articles
    WHERE image IS NULL AND url LIKE 'http%'
      AND url NOT LIKE 'https://demo.%' AND url NOT LIKE '%news.google.com%'
    ORDER BY id DESC LIMIT 20`).all();
  if (!rows.length) return;
  let found = 0;
  await Promise.allSettled(rows.map(async (row) => {
    const res = await fetch(row.url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ShutroBot/0.1' },
    });
    if (!res.ok) return;
    const html = (await res.text()).slice(0, 300000);
    const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)[^"']*["'][^>]+content=["']([^"']+)/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)/i);
    if (m && /^https?:/.test(m[1])) {
      q.setImage.run(m[1].replace(/&amp;/g, '&'), row.id);
      found += 1;
    }
  }));
  if (found) console.log(`[pipeline] og:image ব্যাকফিল: ${found}/${rows.length}`);
}

function detectBlindspots() {
  const since = new Date(Date.now() - config.ACTIVE_WINDOW_HOURS * 3600000).toISOString();
  for (const cluster of q.activeClusters.all(since)) {
    const articles = q.articlesOfCluster.all(cluster.id);
    let blindspot = null, note = null;
    if (articles.length >= 3) {
      const bySide = { govt: 0, neutral: 0, critic: 0 };
      for (const a of articles) bySide[SOURCES[a.source]?.lean ?? 'neutral'] += 1;
      if (bySide.govt === 0) {
        blindspot = 'govt'; note = 'সরকার-ঘেঁষা পোর্টালে একটিও নেই';
      } else if (bySide.critic === 0) {
        blindspot = 'critic'; note = 'সমালোচক পোর্টালে একটিও নেই';
      } else if (bySide.govt === 1 && articles.length >= 6) {
        blindspot = 'govt'; note = `ঘেঁষা পোর্টালগুলোর মধ্যে ছেপেছে মাত্র ১টি`;
      } else if (bySide.critic === 1 && articles.length >= 6) {
        blindspot = 'critic'; note = `সমালোচক পোর্টালগুলোর মধ্যে ছেপেছে মাত্র ১টি`;
      }
    }
    q.setClusterBlindspot.run(blindspot, note, cluster.id);
  }
}

export async function runPipeline(reason = 'schedule') {
  if (running) return { skipped: true };
  running = true;
  const startedAt = Date.now();
  const errors = [];
  try {
    console.log(`[pipeline] শুরু (${reason})`);
    const { incoming, portalsOk } = await gatherIncoming(errors);
    const { freshIds, dirtyClusters } = upsertArticles(incoming);
    const freshArticles = await assignClusters(freshIds, dirtyClusters);
    await classify(freshArticles);
    if (freshArticles.length) await consolidateClusters(dirtyClusters);
    await summarizeClusters(dirtyClusters);
    detectBlindspots();
    await backfillImages();

    const counts = q.counts.get();
    meta.set('status', {
      lastRun: new Date().toISOString(),
      nextRun: new Date(Date.now() + config.REFRESH_MINUTES * 60000).toISOString(),
      mode: config.INGEST_MODE,
      portalsOk,
      portalsTotal: Object.keys(SOURCES).length,
      articles: counts.articles,
      clusters: counts.clusters,
      newArticles: freshArticles.length,
      tookMs: Date.now() - startedAt,
      errors: errors.slice(0, 10),
    });
    console.log(`[pipeline] শেষ — নতুন ${freshArticles.length}টি, মোট ${counts.articles} প্রতিবেদন / ${counts.clusters} ক্লাস্টার, ${Date.now() - startedAt}ms${errors.length ? `, ফিড-ত্রুটি ${errors.length}` : ''}`);
    return meta.get('status');
  } finally {
    running = false;
  }
}
