import { describe, it, expect } from 'vitest';
import { run, help, VERSION } from '../src/index.js';

describe('brip-cli skeleton', () => {
  it('prints help and exits 0 with no args', () => {
    expect(run([])).toBe(0);
  });

  it('reports version', () => {
    expect(run(['version'])).toBe(0);
    expect(help()).toContain(VERSION);
  });

  it('exits non-zero on unknown command', () => {
    expect(run(['frobnicate'])).toBe(1);
  });
});
