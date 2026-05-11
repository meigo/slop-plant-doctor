const TTL_SECONDS = 60 * 60 * 48;

type Result = { allowed: true; remaining: number } | { allowed: false };

function currentDateBucket(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

export async function checkAndIncrementDailyCap(
  kv: KVNamespace,
  ipHash: string,
  cap: number
): Promise<Result> {
  const key = `daily:${ipHash}:${currentDateBucket()}`;
  const current = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  if (current >= cap) return { allowed: false };
  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: TTL_SECONDS });
  return { allowed: true, remaining: cap - next };
}
