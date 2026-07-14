/* API — ফ্রন্টএন্ড data.js-এর শেপেই JSON দেয়, তাই ক্লায়েন্ট প্রায় অপরিবর্তিত। */

import { config } from './config.js';
import { q, meta } from './db.js';
import { SOURCES, TOPICS } from './registry.js';
import { bn, clockBn, clockWithPeriodBn, relativeBn } from './util.js';

function computedPatterns() {
  const counts = {};
  for (const row of q.stanceCountsBySource.all()) {
    counts[row.source] ??= { govt: 0, neutral: 0, critic: 0 };
    counts[row.source][row.stance] = row.n;
  }
  const patterns = {};
  for (const [id, c] of Object.entries(counts)) {
    const total = c.govt + c.neutral + c.critic;
    if (total >= 8) {
      const govt = Math.round((c.govt / total) * 100);
      const critic = Math.round((c.critic / total) * 100);
      patterns[id] = { govt, critic, neutral: 100 - govt - critic };
    }
  }
  return patterns;
}

export function sourcesJSON() {
  const patterns = computedPatterns();
  return Object.fromEntries(Object.entries(SOURCES).map(([id, s]) => {
    const { feed, ...pub } = s;
    return [id, { ...pub, pattern: patterns[id] ?? s.pattern, live: Boolean(feed) }];
  }));
}

function clusterJSON(cluster) {
  const articles = q.articlesOfCluster.all(cluster.id);
  if (!articles.length) return null;
  return {
    id: cluster.id,
    topic: cluster.topic ?? 'অন্যান্য',
    title: cluster.title,
    summary: cluster.summary || '',
    reportCount: articles.length,
    portalCount: new Set(articles.map((a) => a.source)).size,
    updated: relativeBn(cluster.updated_at),
    firstPublished: clockWithPeriodBn(articles[0].published_at),
    image: articles.find((a) => a.image)?.image ?? null,
    blindspot: cluster.blindspot,
    blindspotNote: cluster.blindspot_note,
    lead: false,
    reports: articles.map((a) => ({
      src: a.source,
      stance: a.stance ?? 'neutral',
      time: clockBn(a.published_at),
      headline: a.headline,
      ...(a.changes ? { changes: a.changes } : {}),
      ...(a.url.startsWith('https://demo.') ? {} : { url: a.url }),
    })),
  };
}

export function clustersJSON() {
  const since = new Date(Date.now() - config.ACTIVE_WINDOW_HOURS * 3600000).toISOString();
  const clusters = q.activeClusters.all(since)
    .map(clusterJSON)
    .filter(Boolean)
    .sort((a, b) => b.reportCount - a.reportCount);
  if (clusters.length) {
    /* প্রধান খবর: কভারেজ-শীর্ষদের মধ্যে ছবিওয়ালাকে অগ্রাধিকার */
    const top = clusters.slice(0, 5);
    (top.find((c) => c.image) ?? top[0]).lead = true;
  }
  return clusters;
}

export function statusJSON() {
  const s = meta.get('status');
  if (!s) return { ready: false, text: 'প্রথম স্ক্র্যাপ চলছে…', mode: config.INGEST_MODE };
  return {
    ready: true,
    ...s,
    lastRunText: clockBn(s.lastRun),
    nextRunText: clockBn(s.nextRun),
    portalsText: `${bn(s.portalsOk)}/${bn(s.portalsTotal)} পোর্টাল সচল`,
    modeText: s.mode === 'demo' ? 'ডেমো ফিড' : s.mode === 'live' ? 'লাইভ ফিড' : 'লাইভ + ডেমো ফিড',
  };
}

export function bootstrapJSON() {
  return {
    sources: sourcesJSON(),
    clusters: clustersJSON(),
    topics: TOPICS,
    status: statusJSON(),
  };
}

export function clusterDetailJSON(id) {
  const cluster = q.clusterById.get(Number(id));
  return cluster ? clusterJSON(cluster) : null;
}

export function sourceDetailJSON(id) {
  const source = sourcesJSON()[id];
  if (!source) return null;
  const recent = q.articlesBySource.all(id).map((a) => ({
    headline: a.headline,
    stance: a.stance ?? 'neutral',
    time: clockBn(a.published_at),
    clusterId: a.cluster_id,
    topic: a.cluster_topic ?? 'অন্যান্য',
  }));
  return { id, ...source, recent };
}
