import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanHtml, normalizeInput } from '../src/scanner.js';
import { validate } from '../src/brip.js';
import { renderCard } from '../src/render.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(dir, '..', 'fixtures', name), 'utf8');

test('normalizeInput adds scheme and validates', () => {
  assert.equal(normalizeInput('example.com'), 'https://example.com/');
  assert.equal(normalizeInput('http://x.io/a'), 'http://x.io/a');
  assert.throws(() => normalizeInput(''));
});

test('rich site: structured extraction is complete and high-confidence', () => {
  const doc = scanHtml(fixture('richsite.html'), 'https://bluefox.example');

  assert.equal(doc.brip, '0.1');
  assert.ok(validate(doc).valid, 'document should validate');
  assert.ok(doc.confidence >= 0.75, `confidence ${doc.confidence} should be high`);

  assert.equal(doc.organization.name, 'Blue Fox Coffee');
  assert.equal(doc.organization.legalName, 'Blue Fox Coffee LLC');
  assert.equal(doc.organization.type, 'LocalBusiness');
  assert.equal(doc.organization.logo, 'https://bluefox.example/logo.svg');

  assert.ok(doc.contact.emails.includes('hello@bluefox.example'));
  assert.ok(doc.contact.phones.length >= 1);
  assert.equal(doc.contact.addresses[0].locality, 'Portland');
  assert.equal(doc.contact.addresses[0].postalCode, '97205');

  // sameAs from JSON-LD + anchors, deduped.
  assert.ok(doc.organization.sameAs.some((u) => u.includes('instagram.com/bluefoxcoffee')));

  // Opening hours expanded from "Mo-Fr" + "Sa,Su".
  const days = doc.hours.map((h) => h.day);
  assert.ok(days.includes('monday') && days.includes('friday'));
  assert.ok(days.includes('saturday') && days.includes('sunday'));

  // Product -> offering.
  assert.ok(doc.offerings.some((o) => o.name === 'Ethiopia Yirgacheffe'));
});

test('sparse site: still valid, low confidence, only present sections', () => {
  const doc = scanHtml(fixture('sparsesite.html'), 'https://jane.example');

  assert.ok(validate(doc).valid);
  assert.ok(doc.confidence < 0.4, 'sparse site should be low confidence');
  assert.equal(doc.content.headline, "Hi, I'm Jane — I design things.");
  assert.match(doc.content.summary, /product designer based in Berlin/);

  // Adaptivity: absent sections must not be fabricated.
  assert.equal(doc.contact, undefined);
  assert.equal(doc.hours, undefined);
  assert.equal(doc.offerings, undefined);
});

test('renderer only emits sections that exist', () => {
  const rich = renderCard(scanHtml(fixture('richsite.html'), 'https://bluefox.example'));
  const sparse = renderCard(scanHtml(fixture('sparsesite.html'), 'https://jane.example'));

  assert.match(rich, /Contact/);
  assert.match(rich, /Hours/);
  assert.match(rich, /Offerings/);

  assert.doesNotMatch(sparse, /Contact/);
  assert.doesNotMatch(sparse, /Hours/);
  assert.doesNotMatch(sparse, /Offerings/);
});

test('output escapes HTML to avoid injection', () => {
  const html = '<title>Evil &lt;script&gt;</title><h1>Hi <script>alert(1)</script></h1>';
  const doc = scanHtml(html, 'https://evil.example');
  const card = renderCard(doc);
  assert.doesNotMatch(card, /<script>alert/);
});
