#!/usr/bin/env node
// brip-cli — public, Apache-2.0.
//
// Command surface is stubbed. Real commands land in their phases, e.g.
// `brip-cli audit verify` (Phase 2b) re-derives the audit hash chain and proves
// an entry against a transparency anchor. See docs/SPEC.md.

export const VERSION = '0.0.0';

const COMMANDS: Record<string, string> = {
  'audit verify': 'Re-derive the audit chain and prove an entry (Phase 2b)',
  version: 'Print the CLI version',
  help: 'Show this help',
};

export function help(): string {
  const rows = Object.entries(COMMANDS)
    .map(([cmd, desc]) => `  ${cmd.padEnd(16)} ${desc}`)
    .join('\n');
  return `brip-cli ${VERSION}\n\nUsage: brip-cli <command>\n\nCommands:\n${rows}\n`;
}

export function run(argv: readonly string[]): number {
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(help());
    return 0;
  }
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  process.stderr.write(`Unknown command: ${argv.join(' ')}\n\n${help()}`);
  return 1;
}

// Only auto-run when invoked as a binary, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(run(process.argv.slice(2)));
}
