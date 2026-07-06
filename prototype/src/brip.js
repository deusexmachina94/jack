// Merge extracted fragments into one normalized BRIP document and score it.

export const BRIP_VERSION = '0.1';

/** Deep-ish merge tuned for BRIP fragments: prefer higher-trust values,
 *  union arrays, and never overwrite a filled field with an empty one. */
function mergeInto(target, frag) {
  for (const [key, val] of Object.entries(frag || {})) {
    if (key === 'signals') continue;
    if (val == null || val === '') continue;

    if (Array.isArray(val)) {
      target[key] = dedupe([...(target[key] || []), ...val]);
    } else if (typeof val === 'object') {
      target[key] = target[key] || {};
      mergeInto(target[key], val);
    } else if (!target[key]) {
      target[key] = val; // scalar: first non-empty wins (extractors run trust-first)
    }
  }
}

function dedupeByDigits(phones) {
  const seen = new Map();
  for (const p of phones) {
    const digits = String(p).replace(/\D/g, '');
    if (!digits) continue;
    const prev = seen.get(digits);
    // Prefer the entry with formatting (spaces/dashes) as the human-readable one.
    if (!prev || (/[ ().-]/.test(p) && !/[ ().-]/.test(prev))) seen.set(digits, p);
  }
  return [...seen.values()];
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = typeof item === 'object' ? JSON.stringify(item) : String(item).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * Build a BRIP document from an ordered list of fragments (highest-trust first)
 * plus source metadata. Empty sections are dropped so the document is partial
 * by design — the adaptivity contract in the spec.
 */
export function buildDocument(fragments, source) {
  const merged = {};
  const signals = new Set(source.signals || []);
  for (const frag of fragments) {
    (frag.signals || []).forEach((s) => signals.add(s));
    mergeInto(merged, frag);
  }

  const doc = {
    brip: BRIP_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      url: source.url,
      fetchedAt: source.fetchedAt || new Date().toISOString(),
      pages: source.pages || [source.url],
      signals: [...signals]
    },
    confidence: 0
  };

  // Phones arrive from JSON-LD and tel: links in different formats; collapse
  // duplicates that share the same digits, preferring the readable form.
  if (Array.isArray(merged.contact?.phones)) {
    merged.contact.phones = dedupeByDigits(merged.contact.phones);
  }

  // Attach only non-empty sections.
  for (const section of ['organization', 'contact', 'offerings', 'hours', 'people', 'content', 'media', 'meta']) {
    const v = merged[section];
    if (isNonEmpty(v)) doc[section] = v;
  }

  doc.confidence = scoreConfidence(doc);
  return doc;
}

function isNonEmpty(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(isNonEmpty);
  return v !== '';
}

/** Heuristic 0..1 confidence, per spec §5. */
function scoreConfidence(doc) {
  let score = 0;
  const sig = new Set(doc.source.signals);
  if (sig.has('json-ld:org')) score += 0.5;
  if (sig.has('opengraph')) score += 0.15;
  if (sig.has('meta')) score += 0.1;
  if (doc.organization?.name) score += 0.1;
  if (doc.contact?.emails?.length || doc.contact?.phones?.length) score += 0.1;
  if (doc.contact?.addresses?.length) score += 0.05;
  if (doc.offerings?.length) score += 0.05;
  if (doc.organization?.sameAs?.length) score += 0.05;
  // Small floor: extracting a usable headline/summary is worth more than nothing.
  if (doc.content?.headline || doc.content?.summary) score += 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}

/** Lightweight structural validation against the required fields of the spec. */
export function validate(doc) {
  const errors = [];
  if (doc.brip !== BRIP_VERSION && !/^\d+\.\d+$/.test(doc.brip || '')) errors.push('brip: missing/invalid version');
  if (!doc.generatedAt) errors.push('generatedAt: required');
  if (!doc.source?.url) errors.push('source.url: required');
  if (typeof doc.confidence !== 'number' || doc.confidence < 0 || doc.confidence > 1) {
    errors.push('confidence: must be a number in 0..1');
  }
  return { valid: errors.length === 0, errors };
}
