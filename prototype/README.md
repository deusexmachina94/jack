# BRIP — Business Readable Information Protocol

**An open standard + reference implementation for turning any public website into a
portable, structured business profile that clients can render or consume.**

You point BRIP at a client's public website. It scans the page, extracts the facts
(who they are, how to reach them, what they offer, when they're open), and produces
one standard document — `brip.json`. Any surface can then render that document as an
**adaptive profile** that shows *only* the information the site actually publishes: a
multi-location retailer and a one-page portfolio both produce valid BRIP, they just
fill in different sections.

```
   Public website  ──►  [ BRIP scanner ]  ──►  brip.json  ──►  any client
   (HTML for humans)      extract + normalize    (the facts)     (card, agent,
                                                                  directory, CRM…)
```

This repo is the MVP: the spec, a zero-dependency scanner, an adaptive renderer, a
CLI, and a small server with a live demo. No build step, no npm install.

---

## Quick start

```bash
# 1. Scan a site to a BRIP document (JSON on stdout)
node src/cli.js example.com

# 2. …or render the adaptive card straight to HTML
node src/cli.js example.com --html > card.html

# 3. Run the server + live demo
node src/server.js
# open http://localhost:8787
```

> **Egress note:** the scanner uses Node's built-in `fetch`, which does **not**
> honor proxy environment variables by default. In sandboxes or corporate networks
> that require an HTTP proxy, run with Node's env-proxy support:
> `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/path/to/ca.crt node src/cli.js <url>`.

## What you get out

A single JSON document. Every section except the four required top-level fields is
optional and present only when found — see [`examples/sample.brip.json`](examples/sample.brip.json):

```jsonc
{
  "brip": "0.1",
  "generatedAt": "2026-07-06T…",
  "source": { "url": "…", "pages": ["…"], "signals": ["json-ld:org", "meta", "mailto"] },
  "confidence": 1,
  "organization": { "name": "Blue Fox Coffee", "type": "LocalBusiness", "logo": "…", "sameAs": ["…"] },
  "contact":      { "emails": ["…"], "phones": ["…"], "addresses": [{ "locality": "Portland", … }] },
  "hours":        [ { "day": "monday", "opens": "07:00", "closes": "18:00" }, … ],
  "offerings":    [ { "name": "Ethiopia Yirgacheffe", "price": "USD 19.00" } ],
  "content":      { "headline": "…", "summary": "…", "keywords": ["…"] }
}
```

## How it adapts to the content

Extraction runs a chain of best-effort signals, highest-trust first, and merges what
each finds:

| Signal | Source | Fills |
|--------|--------|-------|
| `json-ld:org` | `<script type="application/ld+json">` (schema.org) | org, contact, hours, offerings, people |
| `opengraph` / `meta` | `<meta property="og:…">`, description, `<title>` | name, summary, keywords, social image |
| `mailto` / `tel` | anchors | emails, phones |
| social | anchors to known platforms | `sameAs` |
| heuristic | `<h1>`, longest paragraph, `<link rel=icon>` | headline, summary, logo |

Empty sections are dropped from the document, and the renderer only emits sections
that are present — so the output shape follows the site. A `confidence` score (0–1)
summarizes how much *structured* evidence backed the result.

## API surface (server)

| Route | Purpose |
|-------|---------|
| `GET /` | Live demo UI — enter a URL, see the card + JSON |
| `GET /scan?url=…&format=json\|html\|card` | Scan a URL |
| `POST /scan` `{ "url": "…" }` | Scan a URL (JSON body) |
| `GET /.well-known/brip.json` | The server's own BRIP doc (the "publish" model) |
| `GET /spec/schema.json` | JSON Schema for a BRIP document |

Every response sets `Access-Control-Allow-Origin: *`, so a client page can fetch a
profile directly and render it with the shipped CSS (`renderCard` + `CARD_CSS`).

## Two ways to adopt BRIP

- **Scan** (this implementation): derive a BRIP document from any public URL. Good for
  onboarding a client from just their website.
- **Publish**: a site serves its own `/.well-known/brip.json`. No scraping, canonical
  facts. Same document shape — a consumer treats both identically.

## Project layout

```
spec/
  brip-v0.1.md      the protocol specification
  schema.json       JSON Schema (draft-07)
src/
  html.js           dependency-free HTML helpers
  extractors.js     per-signal extractors (json-ld, meta, contacts, heuristics)
  brip.js           merge fragments → document, confidence, validation
  scanner.js        fetch + orchestrate a scan
  render.js         adaptive card renderer (+ CSS)
  cli.js            command-line entry
  server.js         HTTP server + demo API
public/index.html   live demo front-end
fixtures/           sample HTML (rich + sparse) for offline testing
examples/           a generated sample BRIP document
test/               node:test suite (offline, no network)
```

## Testing

```bash
npm test        # node --test — runs fully offline against the fixtures
```

The suite covers structured extraction, the sparse/adaptive case, renderer output,
and HTML-escaping (no injection from scanned content).

## Status & roadmap

v0.1 is an MVP draft. Deliberately **out of scope** for now: auth, write-back,
private data, catalog pagination, per-field provenance, and document signing — all
candidates for 0.2+. Feedback on the spec is welcome.

## License

MIT.
