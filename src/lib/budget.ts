/// <reference types="@cloudflare/workers-types" />

const TTL_SECONDS = 60 * 60 * 48;

function currentDateKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `budget:${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

export async function canSpend(
  kv: KVNamespace,
  capCents: number,
  estimatedCents: number
): Promise<{ allowed: boolean; spentCents: number }> {
  const key = currentDateKey();
  const spentCents = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  return { allowed: spentCents + estimatedCents <= capCents, spentCents };
}

export async function recordSpend(kv: KVNamespace, cents: number): Promise<void> {
  const key = currentDateKey();
  const current = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  await kv.put(key, String(current + cents), { expirationTtl: TTL_SECONDS });
}
