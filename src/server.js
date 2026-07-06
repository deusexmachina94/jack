// BRIP reference server.
//
//   GET  /                       -> demo UI (public/index.html)
//   GET  /.well-known/brip.json  -> this server's own BRIP document (publish model)
//   POST /scan   { "url": "..." } -> BRIP document (scan model)
//   GET  /scan?url=...&format=html|json -> same, convenient for the browser
//   GET  /spec/schema.json       -> the JSON Schema
//
// Zero dependencies: Node's built-in http + fetch.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scan } from './scanner.js';
import { validate } from './brip.js';
import { renderPage, renderCard, CARD_CSS } from './render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 8787;

const SELF_BRIP = {
  brip: '0.1',
  generatedAt: new Date().toISOString(),
  source: { url: `http://localhost:${PORT}`, fetchedAt: new Date().toISOString(), pages: [], signals: ['self'] },
  confidence: 1,
  organization: {
    name: 'BRIP Reference Server',
    type: 'Organization',
    description: 'Reference implementation of the Business Readable Information Protocol.',
    sameAs: []
  },
  content: { headline: 'Scan any public website into a portable business profile.' }
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'access-control-allow-origin': '*', ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) =>
  send(res, status, JSON.stringify(obj, null, 2), { 'content-type': 'application/brip+json; charset=utf-8' });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function handleScan(res, url, format) {
  if (!url) return sendJson(res, 400, { error: 'Missing "url".' });
  try {
    const doc = await scan(url);
    const { valid, errors } = validate(doc);
    if (format === 'html') {
      return send(res, 200, renderPage(doc), { 'content-type': 'text/html; charset=utf-8' });
    }
    if (format === 'card') {
      return send(res, 200, `<style>${CARD_CSS}</style>${renderCard(doc)}`, { 'content-type': 'text/html; charset=utf-8' });
    }
    return sendJson(res, valid ? 200 : 200, { ...doc, _validation: valid ? undefined : errors });
  } catch (err) {
    return sendJson(res, 502, { error: err.message, url });
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type'
    });
  }

  try {
    if (u.pathname === '/' ) {
      const html = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
      return send(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }
    if (u.pathname === '/.well-known/brip.json') {
      return sendJson(res, 200, { ...SELF_BRIP, generatedAt: new Date().toISOString() });
    }
    if (u.pathname === '/spec/schema.json') {
      const schema = await readFile(join(ROOT, 'spec', 'schema.json'), 'utf8');
      return send(res, 200, schema, { 'content-type': 'application/json; charset=utf-8' });
    }
    if (u.pathname === '/scan' && req.method === 'GET') {
      return handleScan(res, u.searchParams.get('url'), u.searchParams.get('format') || 'json');
    }
    if (u.pathname === '/scan' && req.method === 'POST') {
      const body = await readBody(req);
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch { return sendJson(res, 400, { error: 'Invalid JSON body.' }); }
      return handleScan(res, payload.url, payload.format || 'json');
    }
    return sendJson(res, 404, { error: 'Not found', path: u.pathname });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`BRIP server on http://localhost:${PORT}`);
  console.log(`  demo:  http://localhost:${PORT}/`);
  console.log(`  scan:  http://localhost:${PORT}/scan?url=example.com&format=html`);
});

export { server };
