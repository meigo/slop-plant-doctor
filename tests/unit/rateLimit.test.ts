import { describe, it, expect } from 'vitest';
import { checkAndIncrementRateLimit } from '../../src/lib/rateLimit';
import { makeKvMock } from '../support/kvMock';

describe('rate limit', () => {
  it('allows up to the limit then blocks', async () => {
    const kv = makeKvMock();
    const ipHash = 'aaaaaaaa';
    for (let i = 0; i < 5; i++) {
      const r = await checkAndIncrementRateLimit(kv, ipHash, 5);
      expect(r.allowed).toBe(true);
      if (r.allowed) {
        expect(r.remaining).toBe(5 - i - 1);
      }
    }
    const r6 = await checkAndIncrementRateLimit(kv, ipHash, 5);
    expect(r6.allowed).toBe(false);
    if (!r6.allowed) {
      expect(r6.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('isolates different IPs', async () => {
    const kv = makeKvMock();
    for (let i = 0; i < 5; i++) await checkAndIncrementRateLimit(kv, 'aaaaaaaa', 5);
    const other = await checkAndIncrementRateLimit(kv, 'bbbbbbbb', 5);
    expect(other.allowed).toBe(true);
  });
});
