import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    topic TEXT,
    summary TEXT DEFAULT '',
    blindspot TEXT,
    blindspot_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    headline TEXT NOT NULL,
    published_at TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    cluster_id INTEGER REFERENCES clusters(id),
    stance TEXT,
    topic TEXT,
    embedding TEXT,
    changes INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id);
  CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
  CREATE TABLE IF NOT EXISTS headline_history (
    article_id INTEGER NOT NULL REFERENCES articles(id),
    headline TEXT NOT NULL,
    seen_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

/* মাইগ্রেশন: পুরোনো DB-তে image কলাম যোগ */
try { db.exec('ALTER TABLE articles ADD COLUMN image TEXT'); } catch { /* আছে */ }

export const q = {
  articleByUrl: db.prepare('SELECT * FROM articles WHERE url = ?'),
  insertArticle: db.prepare(`INSERT INTO articles
    (source, url, headline, published_at, first_seen, image, cluster_id, stance, topic, embedding, changes)
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0)`),
  setImage: db.prepare('UPDATE articles SET image = ? WHERE id = ?'),
  updateHeadline: db.prepare('UPDATE articles SET headline = ?, changes = changes + 1 WHERE id = ?'),
  insertHistory: db.prepare('INSERT INTO headline_history (article_id, headline, seen_at) VALUES (?, ?, ?)'),
  setArticleCluster: db.prepare('UPDATE articles SET cluster_id = ?, embedding = ? WHERE id = ?'),
  setArticleAnalysis: db.prepare('UPDATE articles SET stance = ?, topic = ? WHERE id = ?'),
  articlesOfCluster: db.prepare('SELECT * FROM articles WHERE cluster_id = ? ORDER BY published_at ASC'),
  insertCluster: db.prepare('INSERT INTO clusters (title, topic, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
  touchCluster: db.prepare('UPDATE clusters SET updated_at = ? WHERE id = ?'),
  setClusterSummary: db.prepare('UPDATE clusters SET title = ?, summary = ?, topic = ? WHERE id = ?'),
  setClusterBlindspot: db.prepare('UPDATE clusters SET blindspot = ?, blindspot_note = ? WHERE id = ?'),
  activeClusters: db.prepare('SELECT * FROM clusters WHERE updated_at >= ? ORDER BY updated_at DESC'),
  clusterById: db.prepare('SELECT * FROM clusters WHERE id = ?'),
  clusterEmbeddings: db.prepare('SELECT embedding FROM articles WHERE cluster_id = ? AND embedding IS NOT NULL'),
  stanceCountsBySource: db.prepare(`SELECT source, stance, COUNT(*) AS n FROM articles
    WHERE stance IS NOT NULL GROUP BY source, stance`),
  articlesBySource: db.prepare(`SELECT a.*, c.topic AS cluster_topic FROM articles a
    LEFT JOIN clusters c ON c.id = a.cluster_id
    WHERE a.source = ? ORDER BY a.published_at DESC LIMIT 12`),
  moveArticles: db.prepare('UPDATE articles SET cluster_id = ? WHERE cluster_id = ?'),
  deleteCluster: db.prepare('DELETE FROM clusters WHERE id = ?'),
  counts: db.prepare('SELECT (SELECT COUNT(*) FROM articles) AS articles, (SELECT COUNT(*) FROM clusters) AS clusters'),
};

export const meta = {
  get(key, fallback = null) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  },
  set(key, value) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  },
};
