import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { runPipeline, isRunning } from './pipeline.js';
import { bootstrapJSON, clustersJSON, clusterDetailJSON, sourcesJSON, sourceDetailJSON, statusJSON } from './api.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, urlPath) {
  const clean = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, clean === '/' || clean === '.' ? 'index.html' : clean);
  if (!file.startsWith(ROOT) || file.includes('.env') || file.includes('server/')) {
    res.writeHead(404); res.end('not found'); return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (path.startsWith('/api/')) {
      if (req.method === 'GET' && path === '/api/bootstrap') return json(res, 200, bootstrapJSON());
      if (req.method === 'GET' && path === '/api/clusters') return json(res, 200, clustersJSON());
      if (req.method === 'GET' && path.match(/^\/api\/clusters\/\d+$/)) {
        const c = clusterDetailJSON(path.split('/').pop());
        return c ? json(res, 200, c) : json(res, 404, { error: 'cluster নেই' });
      }
      if (req.method === 'GET' && path === '/api/sources') return json(res, 200, sourcesJSON());
      if (req.method === 'GET' && path.startsWith('/api/sources/')) {
        const s = sourceDetailJSON(decodeURIComponent(path.split('/').pop()));
        return s ? json(res, 200, s) : json(res, 404, { error: 'source নেই' });
      }
      if (req.method === 'GET' && path === '/api/status') return json(res, 200, statusJSON());
      if (req.method === 'POST' && path === '/api/refresh') {
        if (isRunning()) return json(res, 409, { error: 'pipeline চলছে' });
        const status = await runPipeline('manual');
        return json(res, 200, status);
      }
      return json(res, 404, { error: 'unknown endpoint' });
    }
    await serveStatic(res, path);
  } catch (err) {
    console.error('[server]', err);
    json(res, 500, { error: String(err.message ?? err) });
  }
});

server.listen(config.PORT, () => {
  console.log(`সূত্র backend → http://localhost:${config.PORT} (mode: ${config.INGEST_MODE}, model: ${config.OPENAI_MODEL})`);
  setTimeout(() => runPipeline('boot').catch((e) => console.error('[pipeline]', e)), 500);
  setInterval(() => runPipeline('schedule').catch((e) => console.error('[pipeline]', e)),
    config.REFRESH_MINUTES * 60000);
});
