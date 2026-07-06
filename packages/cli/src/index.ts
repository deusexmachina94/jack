#!/usr/bin/env node
// brip-cli — public, Apache-2.0.

import { auditVerify, formatReport } from './audit.js';

export const VERSION = '0.1.0';

const COMMANDS: Record<string, string> = {
  'audit verify': 'Independently verify an audit entry against its transparency anchor',
  version: 'Print the CLI version',
  help: 'Show this help',
};

export function help(): string {
  const rows = Object.entries(COMMANDS)
    .map(([cmd, desc]) => `  ${cmd.padEnd(16)} ${desc}`)
    .join('\n');
  return [
    `brip-cli ${VERSION}`,
    '',
    'Usage: brip-cli <command>',
    '',
    'Commands:',
    rows,
    '',
    'Examples:',
    '  brip-cli audit verify --url https://api.brip.dev --entry <uuid>',
    '',
  ].join('\n');
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function run(argv: readonly string[]): Promise<number> {
  const cmd = argv[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(help());
    return 0;
  }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (cmd === 'audit' && argv[1] === 'verify') {
    const base = flag(argv, 'url');
    const entry = flag(argv, 'entry');
    if (!base || !entry) {
      process.stderr.write('Usage: brip-cli audit verify --url <baseUrl> --entry <entryId>\n');
      return 1;
    }
    try {
      const report = await auditVerify(base, entry);
      process.stdout.write(formatReport(report) + '\n');
      return report.ok ? 0 : 2;
    } catch (err) {
      process.stderr.write(`audit verify failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return 2;
    }
  }

  process.stderr.write(`Unknown command: ${argv.join(' ')}\n\n${help()}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((code) => process.exit(code)).catch(() => process.exit(1));
}
