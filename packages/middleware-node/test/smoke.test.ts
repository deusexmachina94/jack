import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';

describe('@brip/middleware-node skeleton', () => {
  it('exposes a version', () => {
    expect(typeof VERSION).toBe('string');
  });
});
