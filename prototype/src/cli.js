#!/usr/bin/env node
// BRIP CLI: scan a URL and emit a BRIP document (or an HTML card).
//
//   node src/cli.js example.com
//   node src/cli.js example.com --html > card.html
//   node src/cli.js example.com --no-subpages

import { scan } from './scanner.js';
import { validate } from './brip.js';
import { renderPage } from './render.js';

function parseArgs(argv) {
  const args = { url: null, html: false, followSubPages: true };
  for (const a of argv) {
    if (a === '--html') args.html = true;
    else if (a === '--no-subpages') args.followSubPages = false;
    else if (!a.startsWith('-')) args.url = a;
  }
  return args;
}

async function main() {
  const { url, html, followSubPages } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error('Usage: brip <url> [--html] [--no-subpages]');
    process.exit(1);
  }

  try {
    const doc = await scan(url, { followSubPages });
    const { valid, errors } = validate(doc);
    if (!valid) {
      console.error('Warning: document failed validation:', errors.join('; '));
    }
    process.stdout.write(html ? renderPage(doc) : JSON.stringify(doc, null, 2));
    process.stdout.write('\n');
  } catch (err) {
    console.error(`Scan failed: ${err.message}`);
    process.exit(2);
  }
}

main();
