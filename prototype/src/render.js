// Adaptive renderer: turn a BRIP document into an HTML card.
// Implements the spec's adaptivity contract — a section renders only if present
// and non-empty, and sections are ordered by usefulness, not key order.

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function has(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(has);
  return String(v).trim() !== '';
}

const socialLabel = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  } catch { return 'link'; }
};

/** Render an array of section builders, dropping any that produce nothing. */
function sections(doc) {
  const out = [];
  const push = (html) => { if (html) out.push(html); };

  const org = doc.organization || {};
  const content = doc.content || {};

  // 1. Identity header
  const logo = org.logo || doc.media?.logo || doc.media?.socialImage;
  push(`
    <header class="brip-head">
      ${logo ? `<img class="brip-logo" src="${esc(logo)}" alt="" onerror="this.style.display='none'">` : ''}
      <div>
        <h1>${esc(org.name || content.headline || doc.source.url)}</h1>
        ${org.type ? `<span class="brip-badge">${esc(org.type)}</span>` : ''}
        ${org.url ? `<a class="brip-url" href="${esc(org.url)}">${esc(org.url.replace(/^https?:\/\//, ''))}</a>` : ''}
      </div>
    </header>`);

  // 2. Summary
  const summary = org.description || content.summary;
  if (has(summary)) push(`<section class="brip-section"><p class="brip-summary">${esc(summary)}</p></section>`);

  // 3. Contact
  const c = doc.contact || {};
  if (has(c)) {
    const rows = [];
    for (const e of c.emails || []) rows.push(`<li><span class="k">email</span> <a href="mailto:${esc(e)}">${esc(e)}</a></li>`);
    for (const p of c.phones || []) rows.push(`<li><span class="k">phone</span> <a href="tel:${esc(p.replace(/\s+/g, ''))}">${esc(p)}</a></li>`);
    for (const a of c.addresses || []) {
      const line = a.raw || [a.streetAddress, a.locality, a.region, a.postalCode, a.country].filter(Boolean).join(', ');
      if (line) rows.push(`<li><span class="k">address</span> ${esc(line)}</li>`);
    }
    if (rows.length) push(sectionBlock('Contact', `<ul class="brip-list">${rows.join('')}</ul>`));
  }

  // 4. Hours
  if (has(doc.hours)) {
    const rows = doc.hours.map((h) => `<li><span class="k">${esc(h.day)}</span> ${esc(h.opens || '')}${h.closes ? '–' + esc(h.closes) : ' closed'}</li>`);
    push(sectionBlock('Hours', `<ul class="brip-list">${rows.join('')}</ul>`));
  }

  // 5. Offerings
  if (has(doc.offerings)) {
    const cards = doc.offerings.slice(0, 12).map((o) => `
      <div class="brip-offer">
        <strong>${esc(o.name)}</strong>
        ${o.price ? `<span class="brip-price">${esc(o.price)}</span>` : ''}
        ${o.description ? `<p>${esc(o.description)}</p>` : ''}
      </div>`);
    push(sectionBlock('Offerings', `<div class="brip-offers">${cards.join('')}</div>`));
  }

  // 6. People
  if (has(doc.people)) {
    const rows = doc.people.slice(0, 20).map((p) => `<li><strong>${esc(p.name)}</strong>${p.role ? ` — ${esc(p.role)}` : ''}</li>`);
    push(sectionBlock('People', `<ul class="brip-list">${rows.join('')}</ul>`));
  }

  // 7. Elsewhere / social
  if (has(org.sameAs)) {
    const links = org.sameAs.map((u) => `<a class="brip-chip" href="${esc(u)}">${esc(socialLabel(u))}</a>`);
    push(sectionBlock('Elsewhere', `<div class="brip-chips">${links.join('')}</div>`));
  }

  return out.join('\n');
}

function sectionBlock(title, inner) {
  return `<section class="brip-section"><h2>${esc(title)}</h2>${inner}</section>`;
}

/** Return just the card markup (no <html> wrapper) — embeddable. */
export function renderCard(doc) {
  const pct = Math.round((doc.confidence || 0) * 100);
  return `<article class="brip-card" data-brip="${esc(doc.brip)}">
${sections(doc)}
    <footer class="brip-foot">
      <span class="brip-conf" title="Extraction confidence">confidence ${pct}%</span>
      <span class="brip-src">via BRIP · ${esc((doc.source.signals || []).join(', ') || 'heuristic')}</span>
    </footer>
  </article>`;
}

export const CARD_CSS = `
.brip-card{max-width:640px;margin:0 auto;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  color:#1a1a1a;background:#fff;border:1px solid #e6e6e6;border-radius:16px;overflow:hidden;
  box-shadow:0 1px 3px rgba(0,0,0,.06)}
.brip-head{display:flex;gap:16px;align-items:center;padding:24px 24px 8px}
.brip-logo{width:56px;height:56px;object-fit:contain;border-radius:12px;background:#f4f4f5;flex:0 0 auto}
.brip-head h1{margin:0;font-size:22px;line-height:1.2}
.brip-badge{display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;
  color:#3730a3;background:#eef2ff;padding:2px 8px;border-radius:999px;margin-top:6px}
.brip-url{display:block;color:#6b7280;text-decoration:none;font-size:13px;margin-top:4px}
.brip-url:hover{text-decoration:underline}
.brip-section{padding:12px 24px;border-top:1px solid #f0f0f0}
.brip-section:first-of-type{border-top:none}
.brip-section h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin:0 0 8px}
.brip-summary{margin:8px 0 12px;line-height:1.55;color:#374151}
.brip-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.brip-list li{font-size:14px;color:#374151}
.brip-list .k{display:inline-block;min-width:72px;color:#9ca3af;font-size:12px;text-transform:capitalize}
.brip-list a{color:#4f46e5;text-decoration:none}
.brip-offers{display:grid;gap:10px}
.brip-offer{border:1px solid #eee;border-radius:10px;padding:10px 12px}
.brip-offer p{margin:6px 0 0;font-size:13px;color:#6b7280}
.brip-price{float:right;color:#059669;font-weight:600;font-size:13px}
.brip-chips,.brip-chip{display:inline-flex}
.brip-chips{flex-wrap:wrap;gap:8px}
.brip-chip{text-transform:capitalize;font-size:13px;color:#4f46e5;background:#f5f3ff;
  padding:4px 12px;border-radius:999px;text-decoration:none}
.brip-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:12px 24px;background:#fafafa;border-top:1px solid #f0f0f0;font-size:12px;color:#9ca3af}
.brip-conf{color:#059669;font-weight:600}
@media (prefers-color-scheme:dark){
  .brip-card{background:#161618;color:#e7e7ea;border-color:#2a2a2e}
  .brip-logo{background:#232327}
  .brip-section{border-color:#242428}
  .brip-summary,.brip-list li{color:#c4c4c8}
  .brip-offer{border-color:#2a2a2e}
  .brip-foot{background:#111}
}`;

/** Full standalone HTML page wrapping a card (used by the demo/CLI). */
export function renderPage(doc) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.organization?.name || 'BRIP')} — BRIP</title>
<style>body{margin:0;padding:40px 16px;background:#f4f4f5}${CARD_CSS}
@media (prefers-color-scheme:dark){body{background:#0c0c0d}}</style>
</head><body>${renderCard(doc)}</body></html>`;
}
