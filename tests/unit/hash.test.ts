import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../../src/lib/hash';

describe('sha256Hex', () => {
  it('returns a 64-char hex string', async () => {
    const out = await sha256Hex('hello');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out.length).toBe(64);
  });

  it('is deterministic', async () => {
    const a = await sha256Hex('192.168.1.1');
    const b = await sha256Hex('192.168.1.1');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await sha256Hex('1.1.1.1');
    const b = await sha256Hex('2.2.2.2');
    expect(a).not.toBe(b);
  });
});
