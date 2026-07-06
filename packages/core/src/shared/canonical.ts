/**
 * Deterministic JSON serialization: object keys sorted lexicographically at every
 * level, arrays preserved in order, no insignificant whitespace. This is the
 * `canonical_json` referenced by the audit hash chain (docs/SPEC.md §5) — two
 * structurally-equal payloads MUST serialize to byte-identical strings.
 *
 * Not a cryptographic primitive; pure serialization.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return 'null';

  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('canonicalJson: non-finite number is not serializable');
    }
    return JSON.stringify(value);
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t === 'bigint') return `"${(value as bigint).toString()}"`;

  if (Array.isArray(value)) {
    return `[${value.map((v) => serialize(v ?? null)).join(',')}]`;
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`)
      .join(',');
    return `{${body}}`;
  }

  throw new Error(`canonicalJson: unsupported type ${t}`);
}
