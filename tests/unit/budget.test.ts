import { describe, it, expect } from 'vitest';
import { canSpend, recordSpend } from '../../src/lib/budget';
import { makeKvMock } from '../support/kvMock';

describe('global budget', () => {
  it('allows spend when under cap, blocks when at or over cap', async () => {
    const kv = makeKvMock();
    expect((await canSpend(kv, 1000, 500)).allowed).toBe(true); // 0 spent, want 500, cap 1000 → ok

    await recordSpend(kv, 500);
    expect((await canSpend(kv, 1000, 500)).allowed).toBe(true); // 500 spent, want 500 → exactly at cap → still ok by canSpend semantics

    await recordSpend(kv, 600);
    const r = await canSpend(kv, 1000, 100);
    expect(r.allowed).toBe(false);
  });

  it('records spend cumulatively for the day', async () => {
    const kv = makeKvMock();
    await recordSpend(kv, 50);
    await recordSpend(kv, 30);
    const r = await canSpend(kv, 100, 25);
    expect(r.allowed).toBe(false); // 80 + 25 = 105 > 100
  });
});
