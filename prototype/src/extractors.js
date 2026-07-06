// Signal extractors: each turns raw HTML into normalized fragments that the
// BRIP builder merges. Every extractor is best-effort and returns partial data.

import {
  clean, stripTags, firstTag, allTags, metaTags, linkTags, anchors, absolutize
} from './html.js';

const WEEKDAYS = {
  mo: 'monday', tu: 'tuesday', we: 'wednesday', th: 'thursday',
  fr: 'friday', sa: 'saturday', su: 'sunday'
};

/** Pull and JSON-parse every <script type="application/ld+json"> block. */
export function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // Some sites emit slightly-invalid JSON-LD; try a lenient cleanup.
      try {
        blocks.push(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')));
      } catch { /* skip */ }
    }
  }
  // JSON-LD can be an array, a @graph, or a single node. Flatten to nodes.
  const nodes = [];
  const push = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(push);
    if (Array.isArray(n['@graph'])) n['@graph'].forEach(push);
    nodes.push(n);
  };
  blocks.forEach(push);
  return nodes;
}

const ORG_TYPES = new Set([
  'Organization', 'LocalBusiness', 'Corporation', 'Store', 'Restaurant',
  'ProfessionalService', 'NGO', 'EducationalOrganization', 'Airline',
  'MedicalOrganization', 'GovernmentOrganization', 'SportsOrganization'
]);

function nodeType(node) {
  const t = node['@type'];
  return Array.isArray(t) ? t : (t ? [t] : []);
}

/** Interpret JSON-LD nodes into a normalized fragment. */
export function fromJsonLd(nodes, base) {
  const frag = { signals: [], organization: {}, contact: {}, offerings: [], hours: [], people: [] };
  if (!nodes.length) return frag;

  const org = nodes.find((n) => nodeType(n).some((t) => ORG_TYPES.has(t)));
  if (org) {
    frag.signals.push('json-ld:org');
    const o = frag.organization;
    if (org.name) o.name = clean(org.name);
    if (org.legalName) o.legalName = clean(org.legalName);
    if (org.description) o.description = clean(org.description);
    if (org.url) o.url = absolutize(org.url, base);
    o.type = nodeType(org).find((t) => ORG_TYPES.has(t));
    const logo = typeof org.logo === 'object' ? org.logo?.url : org.logo;
    if (logo) o.logo = absolutize(logo, base);
    const sameAs = [].concat(org.sameAs || []).filter(Boolean).map((u) => absolutize(u, base)).filter(Boolean);
    if (sameAs.length) o.sameAs = sameAs;

    if (org.email) frag.contact.emails = [String(org.email).replace(/^mailto:/i, '')];
    if (org.telephone) frag.contact.phones = [clean(String(org.telephone))];
    const addr = org.address;
    if (addr && typeof addr === 'object') {
      frag.contact.addresses = [].concat(addr).map((a) => ({
        streetAddress: clean(a.streetAddress || ''),
        locality: clean(a.addressLocality || ''),
        region: clean(a.addressRegion || ''),
        postalCode: clean(a.postalCode || ''),
        country: clean(a.addressCountry?.name || a.addressCountry || '')
      })).filter((a) => Object.values(a).some(Boolean));
    }
    // Opening hours in schema.org come as "Mo-Fr 09:00-17:00" strings.
    const specs = [].concat(org.openingHours || org.openingHoursSpecification || []);
    for (const s of specs) frag.hours.push(...parseHoursSpec(s));
  }

  // Products / services / offers anywhere in the graph.
  for (const n of nodes) {
    if (nodeType(n).some((t) => ['Product', 'Service', 'Offer'].includes(t))) {
      frag.offerings.push({
        name: clean(n.name || ''),
        description: clean(n.description || ''),
        price: n.offers?.price ? `${n.offers.priceCurrency || ''} ${n.offers.price}`.trim() : clean(n.price || ''),
        url: absolutize(n.url || '', base)
      });
    }
    if (nodeType(n).includes('Person') && n.name) {
      frag.people.push({
        name: clean(n.name),
        role: clean(n.jobTitle || ''),
        url: absolutize(n.url || '', base)
      });
    }
  }
  frag.offerings = frag.offerings.filter((o) => o.name);
  return frag;
}

function parseHoursSpec(spec) {
  // Handles both the string form ("Mo-Fr 09:00-17:00") and the object form.
  const out = [];
  if (typeof spec === 'string') {
    const m = spec.match(/([A-Za-z,\- ]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!m) return out;
    for (const day of expandDays(m[1])) out.push({ day, opens: m[2], closes: m[3] });
    return out;
  }
  if (spec && typeof spec === 'object') {
    const days = [].concat(spec.dayOfWeek || []).map((d) => String(d).split('/').pop().toLowerCase());
    for (const day of days) {
      if (spec.opens && spec.closes) out.push({ day, opens: spec.opens, closes: spec.closes });
    }
  }
  return out;
}

function expandDays(token) {
  const parts = token.split(',').map((p) => p.trim()).filter(Boolean);
  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const days = [];
  for (const p of parts) {
    const range = p.match(/([A-Za-z]{2})\s*-\s*([A-Za-z]{2})/);
    if (range) {
      const a = WEEKDAYS[range[1].slice(0, 2).toLowerCase()];
      const b = WEEKDAYS[range[2].slice(0, 2).toLowerCase()];
      const i = order.indexOf(a), j = order.indexOf(b);
      if (i >= 0 && j >= 0) for (let k = i; k <= j; k++) days.push(order[k]);
    } else {
      const d = WEEKDAYS[p.slice(0, 2).toLowerCase()];
      if (d) days.push(d);
    }
  }
  return days;
}

/** Read <title>, meta description, OpenGraph, Twitter cards. */
export function fromMeta(html, base) {
  const frag = { signals: [], meta: {}, organization: {}, content: {}, media: {} };
  const title = clean(stripTags(firstTag(html, 'title')));
  if (title) frag.meta.title = title;

  const og = {}, tw = {};
  let description = '', keywords = [], siteName = '', image = '', lang = '';

  for (const t of metaTags(html)) {
    const key = (t.property || t.name || t.itemprop || '').toLowerCase();
    const val = clean(t.content || '');
    if (!key || !val) continue;
    if (key.startsWith('og:')) og[key.slice(3)] = val;
    else if (key.startsWith('twitter:')) tw[key.slice(8)] = val;
    else if (key === 'description') description = val;
    else if (key === 'keywords') keywords = val.split(',').map((k) => k.trim()).filter(Boolean);
  }
  const htmlTag = html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i);
  if (htmlTag) lang = htmlTag[1];

  siteName = og.site_name || '';
  image = og.image || tw.image || '';
  description = description || og.description || tw.description || '';

  if (Object.keys(og).length) { frag.meta.og = og; frag.signals.push('opengraph'); }
  if (Object.keys(tw).length) frag.meta.twitter = tw;
  if (description) { frag.meta.description = description; frag.signals.push('meta'); }

  if (siteName) frag.organization.name = siteName;
  // Note: `headline` is intentionally left to the H1 heuristic (spec §Content
  // defines it as the hero H1). The raw <title> stays available in meta.title.
  if (description) frag.content.summary = description;
  if (keywords.length) frag.content.keywords = keywords;
  if (lang) frag.content.language = lang;
  if (image) frag.media.socialImage = absolutize(image, base);

  return frag;
}

/** Grab logo from <link rel="icon"> family as a fallback. */
export function fromLinks(html, base) {
  const frag = { media: {} };
  for (const l of linkTags(html)) {
    const rel = (l.rel || '').toLowerCase();
    if (/(^|\s)(icon|apple-touch-icon|shortcut icon)(\s|$)/.test(rel) && l.href) {
      frag.media.logo = absolutize(l.href, base);
      break;
    }
  }
  return frag;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

/** Extract contacts + social links from anchors and raw text. */
export function fromContacts(html, base) {
  const frag = { signals: [], contact: {}, organization: {} };
  const emails = new Set(), phones = new Set(), sameAs = new Set();

  for (const a of anchors(html)) {
    const href = a.href || '';
    if (/^mailto:/i.test(href)) {
      const e = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (e && EMAIL_RE.test(e)) { emails.add(e); frag.signals.push('mailto'); }
    } else if (/^tel:/i.test(href)) {
      phones.add(clean(href.replace(/^tel:/i, '')));
      frag.signals.push('tel');
    } else if (isSocial(href)) {
      const abs = absolutize(href, base);
      if (abs) sameAs.add(abs.split('?')[0]);
    }
  }

  // Text-level scan as a fallback (many sites print the address without mailto).
  const text = stripTags(html);
  for (const e of text.match(EMAIL_RE) || []) emails.add(e.toLowerCase());
  // Phones are noisy in free text; only trust them if a "tel"/"call"/"phone" word is near.
  const phoneCtx = text.match(/(?:tel|phone|call|mobile|contact)[^0-9+]{0,12}(\+?\d[\d\s().-]{6,}\d)/gi) || [];
  for (const p of phoneCtx) {
    const num = (p.match(PHONE_RE) || [])[0];
    if (num) phones.add(clean(num));
  }

  if (emails.size) frag.contact.emails = [...emails];
  if (phones.size) frag.contact.phones = [...phones];
  if (sameAs.size) frag.organization.sameAs = [...sameAs];
  return frag;
}

const SOCIAL_HOSTS = [
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'github.com', 'tiktok.com', 'pinterest.com', 'threads.net',
  'mastodon.social', 'bsky.app'
];
function isSocial(href) {
  try {
    const host = new URL(href, 'https://x').hostname.replace(/^www\./, '');
    return SOCIAL_HOSTS.includes(host);
  } catch { return false; }
}

/** Last-resort heuristics: hero headline and readable summary from body text. */
export function fromHeuristics(html) {
  const frag = { content: {} };
  const h1 = clean(stripTags(firstTag(html, 'h1')));
  if (h1) frag.content.headline = h1;

  // Longest early paragraph as a summary candidate.
  const paras = allTags(html, 'p').map(stripTags).filter((p) => p.length > 40);
  if (paras.length) {
    const summary = paras.sort((a, b) => b.length - a.length)[0];
    if (summary.length <= 600) frag.content.summary = summary;
  }
  return frag;
}
