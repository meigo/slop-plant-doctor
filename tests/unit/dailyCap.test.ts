import { describe, it, expect } from 'vitest';
import { checkAndIncrementDailyCap } from '../../src/lib/dailyCap';
import { makeKvMock } from '../support/kvMock';

describe('daily cap', () => {
  it('allows up to the cap, then blocks', async () => {
    const kv = makeKvMock();
    const ipHash = 'aaaaaaaa';
    for (let i = 0; i < 3; i++) {
      const r = await checkAndIncrementDailyCap(kv, ipHash, 3);
      expect(r.allowed).toBe(true);
    }
    const r4 = await checkAndIncrementDailyCap(kv, ipHash, 3);
    expect(r4.allowed).toBe(false);
  });
});
