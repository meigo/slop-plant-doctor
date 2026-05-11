import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTurnstile } from '../../src/lib/turnstile';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('verifyTurnstile', () => {
  it('returns true on a success response', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as any;
    const ok = await verifyTurnstile('secret', 'token', '1.2.3.4');
    expect(ok).toBe(true);
  });

  it('returns false on a failure response', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as any;
    const ok = await verifyTurnstile('secret', 'token', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false on network error', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); }) as any;
    const ok = await verifyTurnstile('secret', 'token', '1.2.3.4');
    expect(ok).toBe(false);
  });
});
