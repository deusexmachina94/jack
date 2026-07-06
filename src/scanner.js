// Orchestrates a scan: fetch the entry page (+ a couple same-origin sub-pages),
// run every extractor, and assemble a BRIP document.

import {
  extractJsonLd, fromJsonLd, fromMeta, fromLinks, fromContacts, fromHeuristics
} from './extractors.js';
import { anchors, absolutize } from './html.js';
import { buildDocument } from './brip.js';

const DEFAULT_UA = 'BRIP-Scanner/0.1 (+https://brip.dev)';
const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 3_000_000;

async function fetchHtml(url, { userAgent = DEFAULT_UA } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' }
    });
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    if (!/html|xml/.test(ctype) && ctype) throw new Error(`Not HTML (${ctype}) at ${url}`);
    const text = (await res.text()).slice(0, MAX_BYTES);
    return { html: text, finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

/** Find same-origin contact/about links worth following (max `limit`). */
function discoverSubPages(html, base, limit = 2) {
  const wanted = /(contact|about|team|company|impressum|imprint|legal)/i;
  const origin = new URL(base).origin;
  const found = [];
  const seen = new Set([normalize(base)]);
  for (const a of anchors(html)) {
    const abs = absolutize(a.href, base);
    if (!abs) continue;
    let u;
    try { u = new URL(abs); } catch { continue; }
    if (u.origin !== origin) continue;
    if (!wanted.test(u.pathname) && !wanted.test(a.text || '')) continue;
    const key = normalize(abs);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(abs.split('#')[0]);
    if (found.length >= limit) break;
  }
  return found;
}

const normalize = (u) => u.replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();

function runExtractors(html, base) {
  const jsonld = extractJsonLd(html);
  return [
    // Order matters: highest-trust first, so scalars from structured data win.
    fromJsonLd(jsonld, base),
    fromMeta(html, base),
    fromContacts(html, base),
    fromLinks(html, base),
    fromHeuristics(html)
  ];
}

/**
 * Scan a URL and return a BRIP document.
 * @param {string} inputUrl
 * @param {{ followSubPages?: boolean, userAgent?: string, fetchImpl?: Function }} opts
 */
export async function scan(inputUrl, opts = {}) {
  const url = normalizeInput(inputUrl);
  const fetchFn = opts.fetchImpl || ((u) => fetchHtml(u, opts));

  const { html, finalUrl } = await fetchFn(url);
  const base = finalUrl || url;
  const pages = [base];
  let fragments = runExtractors(html, base);

  if (opts.followSubPages !== false) {
    const subs = discoverSubPages(html, base, opts.maxSubPages ?? 2);
    for (const sub of subs) {
      try {
        const { html: subHtml, finalUrl: subFinal } = await fetchFn(sub);
        pages.push(subFinal || sub);
        // Sub-pages only contribute contacts/people — not headline/summary.
        fragments.push(fromContacts(subHtml, subFinal || sub));
        const subJsonLd = fromJsonLd(extractJsonLd(subHtml), subFinal || sub);
        fragments.push({ people: subJsonLd.people, contact: subJsonLd.contact });
      } catch { /* a broken sub-page shouldn't fail the scan */ }
    }
  }

  return buildDocument(fragments, {
    url: base,
    fetchedAt: new Date().toISOString(),
    pages
  });
}

/** Accept "example.com" or "https://example.com" and normalize. */
export function normalizeInput(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('A URL is required.');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme); // throws on garbage
  return u.href;
}

/** Scan raw HTML directly (used by tests / offline). */
export function scanHtml(html, base, opts = {}) {
  const fragments = runExtractors(html, base);
  return buildDocument(fragments, {
    url: base,
    fetchedAt: new Date().toISOString(),
    pages: [base],
    ...opts
  });
}
