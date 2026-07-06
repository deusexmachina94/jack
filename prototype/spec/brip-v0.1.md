# BRIP — Business Readable Information Protocol

**Version:** 0.1 (MVP / draft)
**Status:** Experimental — open for feedback
**License:** MIT

BRIP is an open standard for representing the **public, factual information about a
business** in a single portable document. It is the layer between "a website that
humans read" and "a client that needs the facts."

The problem it solves: every business already publishes its identity, contact
details, offerings, and hours on a public website — but that information is trapped
in HTML built for humans. Any client (a directory, an assistant, a CRM, a partner's
onboarding form, an AI agent) that wants those facts has to re-scrape and re-guess
them every time. BRIP defines **one document shape** so that information is extracted
once and consumed anywhere.

```
   Public website  ──►  [ BRIP scanner ]  ──►  brip.json  ──►  any client
   (HTML for humans)      extract + normalize    (facts)        (adaptive UI,
                                                                 agent, directory…)
```

A BRIP document is **self-describing and partial by design**: a client renders or
consumes only the sections that are present. A one-page portfolio and a
multi-location retailer both produce valid BRIP — they just fill in different fields.
This is what "adapts to the content" means: the shape is fixed, the presence of each
section is not.

---

## 1. Transport

A BRIP document is a UTF-8 JSON object. It may be:

- **Served** by a publisher at a well-known location: `GET /.well-known/brip.json`
  (the "publish" model — a site advertises its own BRIP).
- **Derived** by a scanner from an arbitrary public URL (the "scan" model — this
  reference implementation).

Both produce the same document shape defined below.

The recommended media type is `application/brip+json` (falls back to
`application/json`).

## 2. Top-level document

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `brip` | string | yes | Spec version, e.g. `"0.1"`. |
| `generatedAt` | string (ISO-8601) | yes | When this document was produced. |
| `source` | `Source` | yes | Where the facts came from. |
| `confidence` | number `0..1` | yes | Overall extraction confidence (see §5). |
| `organization` | `Organization` | no | Who the business is. |
| `contact` | `Contact` | no | How to reach them. |
| `offerings` | `Offering[]` | no | What they sell / do. |
| `hours` | `OpeningHours[]` | no | When they are open. |
| `people` | `Person[]` | no | Named people (team, founders). |
| `content` | `Content` | no | Human-readable summary of the site. |
| `media` | `Media` | no | Logos / images. |
| `meta` | `Meta` | no | Raw title/description/OpenGraph, for debugging. |

Every field other than the four required ones MAY be omitted or empty. A consumer
MUST treat a missing section as "unknown," never as "false" or "zero."

### `Source`
| Field | Type | Meaning |
|-------|------|---------|
| `url` | string | The entry URL that was scanned. |
| `fetchedAt` | string | ISO timestamp of the fetch. |
| `pages` | string[] | URLs actually fetched (MVP scans the entry page + same-origin contact/about links). |
| `signals` | string[] | Which extractors fired, e.g. `["json-ld","meta","mailto"]`. |

### `Organization`
| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | Display name. |
| `legalName` | string | Registered/legal name if different. |
| `type` | string | schema.org-ish type: `Organization`, `LocalBusiness`, `Store`, … |
| `description` | string | One-paragraph description. |
| `url` | string | Canonical homepage. |
| `logo` | string | Logo image URL. |
| `sameAs` | string[] | Profile URLs on other platforms (social, directories). |

### `Contact`
| Field | Type | Meaning |
|-------|------|---------|
| `emails` | string[] | Deduplicated e-mail addresses. |
| `phones` | string[] | Phone numbers (as published). |
| `addresses` | `PostalAddress[]` | Physical addresses. |

`PostalAddress`: `{ streetAddress, locality, region, postalCode, country, raw }` —
all optional; `raw` holds the unparsed string when structure is unavailable.

### `Offering`
`{ name, description?, price?, category?, url? }` — a product, service, or plan.

### `OpeningHours`
`{ day, opens, closes }` — `day` is a lowercase weekday or `"public"`; times are
`HH:MM` 24h. `closes` omitted implies closed that day.

### `Person`
`{ name, role?, email?, url? }`.

### `Content`
| Field | Type | Meaning |
|-------|------|---------|
| `headline` | string | Primary H1 / hero line. |
| `summary` | string | Best available prose summary. |
| `keywords` | string[] | Topical keywords. |
| `language` | string | BCP-47 language tag. |

### `Media`
`{ logo?, socialImage?, images?: string[] }`.

### `Meta`
Raw extracted primitives — `{ title?, description?, og?: object, twitter?: object }`.
Present for transparency/debugging; clients should prefer the normalized fields above.

## 3. Example (minimal)

```json
{
  "brip": "0.1",
  "generatedAt": "2026-07-06T10:00:00.000Z",
  "source": { "url": "https://example.com", "fetchedAt": "2026-07-06T10:00:00.000Z", "pages": ["https://example.com"], "signals": ["meta"] },
  "confidence": 0.4,
  "organization": { "name": "Example Co", "url": "https://example.com" },
  "content": { "headline": "We make examples", "summary": "Example Co builds examples." }
}
```

## 4. Adaptivity contract

A conforming **renderer/client** MUST:

1. Render/consume a section only if it is present and non-empty.
2. Never fabricate a section that the document does not contain.
3. Degrade gracefully: an unknown future field MUST be ignored, not error.
4. Order presentation by usefulness, not by document key order.

This is what lets one BRIP document drive many surfaces (a card, a directory row, an
agent's context block) from the same facts.

## 5. Confidence

`confidence` is a heuristic `0..1` summarizing how much structured evidence backed the
extraction. As a guide:

- **≥ 0.75** — structured data present (JSON-LD / microdata Organization).
- **0.4 – 0.75** — solid meta/OpenGraph + parsed contacts.
- **< 0.4** — mostly heuristic text scraping; treat as a hint.

Per-section confidence is out of scope for 0.1 and reserved for a future version.

## 6. Versioning

`brip` is `MAJOR.MINOR`. Additive changes bump MINOR and MUST remain
backward-compatible (rule §4.3). Breaking changes bump MAJOR.

## 7. Not in scope for 0.1

Authentication, write-back, private data, pagination of large catalogs, per-field
provenance, and signing. These are candidates for 0.2+.
