# সূত্র — Bangladesh news bias tracker (prototype)

Static Bengali frontend + zero-dependency Node backend (Node ≥ 22.5: built-in `fetch` + `node:sqlite`).

## Run

```sh
cp .env.example .env   # put your OPENAI_API_KEY in .env
npm start              # → http://localhost:8790
```

The server serves the frontend, runs the ingest pipeline on boot and every
`REFRESH_MINUTES` (default 30), and exposes:

| Endpoint | What |
| --- | --- |
| `GET /api/bootstrap` | sources + clusters + topics + status (frontend uses this) |
| `GET /api/clusters`, `GET /api/clusters/:id` | story clusters |
| `GET /api/sources`, `GET /api/sources/:id` | portal ownership profiles + computed 30-day stance patterns |
| `GET /api/status` | last/next scrape, portal health |
| `POST /api/refresh` | force a pipeline run |

## Pipeline

ingest (RSS and/or demo wire) → dedupe + headline-change tracking →
OpenAI embeddings → cosine clustering → per-report stance/topic
classification (govt / neutral / critic) → neutral Bengali cluster summaries →
blindspot detection (story absent from one side's portals).

`INGEST_MODE`:
- `demo` — replays the sample corpus through the full (real-LLM) pipeline; includes a scripted headline change.
- `live` — real RSS only. Most Bangladeshi portals bot-block or lack feeds; feed URLs are per-source in `server/registry.js`.
- `mixed` (default) — both.

Without a backend (opening `index.html` directly or static hosting) the
frontend falls back to the bundled sample data in `data.js`.

## Files

- `index.html`, `story.html`, `source.html`, `sources.html`, `blindspot.html`, `styles.css`, `app.js`, `data.js` — frontend
- `server/` — backend (`index.js` http+scheduler, `pipeline.js`, `api.js`, `db.js`, `registry.js`, `rss.js`, `openaiClient.js`, `demoFeed.js`)
- DB: `server/shutro.db` (SQLite, gitignored). Delete it to reset.

All ownership/stance data is illustrative — this is a demo, not editorial claims.
