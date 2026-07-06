import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unprocessable } from '../../shared/errors.js';

/** Normalized licensing policy stored in license_terms.policy (docs/SPEC.md §2). */
export interface Policy {
  usage: Record<string, 'allowed' | 'denied' | 'priced'>;
  pricing?: { unit: string; amountMinor: number; currency: string };
  attribution: boolean;
  licenseUrl?: string;
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'ISK']);

/** Convert a decimal money string to integer minor units for a currency. */
function toMinorUnits(amount: string, currency: string): number {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw unprocessable(`Invalid payment amount: ${amount}`);
  }
  const exponent = ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
  const minor = Math.round(Number(amount) * 10 ** exponent);
  if (!Number.isSafeInteger(minor)) throw unprocessable(`Amount out of range: ${amount}`);
  return minor;
}

function splitUsages(raw: unknown): string[] {
  if (raw == null) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Parse an RSL 1.0 document (a pragmatic subset) into a normalized Policy.
 * Malformed or structurally-unusable input throws a 422 — never a silent default
 * (CLAUDE.md / SPEC §2).
 *
 * Recognized shape:
 *   <rsl><content url="…"><license>
 *     <permits type="usage">search, ai-input</permits>
 *     <prohibits type="usage">ai-train</prohibits>
 *     <payment type="per-crawl" currency="CHF" amount="2.00">
 *       <usage>ai-input</usage>
 *     </payment>
 *     <legal url="https://…/license"/>
 *   </license></content></rsl>
 */
export function parseRsl(raw: string): Policy {
  if (!raw || !raw.trim()) throw unprocessable('Empty RSL document');

  const valid = XMLValidator.validate(raw);
  if (valid !== true) {
    throw unprocessable(`Malformed XML: ${valid.err.msg} (line ${valid.err.line})`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    trimValues: true,
  });
  const doc = parser.parse(raw) as Record<string, unknown>;

  const rsl = doc['rsl'] as Record<string, unknown> | undefined;
  if (!rsl) throw unprocessable('Missing <rsl> root element');

  const content = firstOf(rsl['content']) as Record<string, unknown> | undefined;
  const license = content ? firstOf(content['license']) as Record<string, unknown> | undefined : undefined;
  if (!license) throw unprocessable('Missing <content>/<license> element');

  const usage: Policy['usage'] = {};
  for (const u of splitUsages(textOf(license['permits']))) usage[u] = 'allowed';
  for (const u of splitUsages(textOf(license['prohibits']))) usage[u] = 'denied';

  let pricing: Policy['pricing'];
  const payment = firstOf(license['payment']) as Record<string, unknown> | undefined;
  if (payment) {
    const currency = String(payment['@_currency'] ?? '').toUpperCase();
    const amount = String(payment['@_amount'] ?? '');
    const unit = String(payment['@_type'] ?? 'per-use');
    if (!currency) throw unprocessable('<payment> missing currency');
    pricing = { unit, amountMinor: toMinorUnits(amount, currency), currency };
    for (const u of splitUsages(textOf(payment['usage']))) usage[u] = 'priced';
  }

  if (Object.keys(usage).length === 0 && !pricing) {
    throw unprocessable('License grants no permits, prohibits, or payment terms');
  }

  const attribution = usage['attribution'] === 'allowed'
    || String(textOf(license['permits']) ?? '').toLowerCase().includes('attribution');

  const legal = firstOf(license['legal']) as Record<string, unknown> | undefined;
  const licenseUrl = legal?.['@_url'] ? String(legal['@_url']) : undefined;

  const policy: Policy = { usage, attribution };
  if (pricing) policy.pricing = pricing;
  if (licenseUrl) policy.licenseUrl = licenseUrl;
  return policy;
}

function firstOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/** Element text whether the parser produced a string or an object with #text. */
function textOf(v: unknown): unknown {
  const first = firstOf(v);
  if (first != null && typeof first === 'object') return (first as Record<string, unknown>)['#text'];
  return first;
}
