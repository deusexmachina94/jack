// Minimal, dependency-free HTML utilities.
// This is deliberately small: BRIP's MVP extracts from structured signals
// (JSON-LD, meta, links) first and falls back to light text heuristics, so we
// don't need a full DOM. Everything here operates on the raw HTML string.

/** Decode the handful of HTML entities that show up in extracted text. */
export function decodeEntities(str = '') {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', copy: '©',
    reg: '®', trade: '™', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”'
  };
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => (name.toLowerCase() in named ? named[name.toLowerCase()] : m));
}

function safeCodePoint(cp) {
  try { return String.fromCodePoint(cp); } catch { return ''; }
}

/** Collapse whitespace and trim. */
export function clean(str = '') {
  return decodeEntities(str).replace(/\s+/g, ' ').trim();
}

/** Strip tags, scripts, and styles to get readable text. */
export function stripTags(html = '') {
  return clean(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

/** Return the raw inner content of the first matching tag, or ''. */
export function firstTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

/** Return inner text of every matching tag. */
export function allTags(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** Parse an attribute list string like `href="x" rel="me"` into an object. */
export function parseAttrs(tagString = '') {
  const attrs = {};
  const re = /([a-z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(tagString)) !== null) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Extract every <meta ...> tag as an attribute object. */
export function metaTags(html) {
  const out = [];
  const re = /<meta\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(parseAttrs(m[1]));
  return out;
}

/** Extract every <link ...> tag as an attribute object. */
export function linkTags(html) {
  const out = [];
  const re = /<link\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(parseAttrs(m[1]));
  return out;
}

/** Extract every <a ...>text</a> as { href, rel, text }. */
export function anchors(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = parseAttrs(m[1]);
    out.push({ ...attrs, text: stripTags(m[2]) });
  }
  return out;
}

/** Resolve a possibly-relative URL against a base; returns '' on failure. */
export function absolutize(href, base) {
  if (!href) return '';
  try { return new URL(href, base).href; } catch { return ''; }
}
