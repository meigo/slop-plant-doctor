// Per-IP hourly rate limit using a KV counter keyed by hash + UTC hour bucket.
// Each hit increments the counter; expiry handled by KV TTL.

const TTL_SECONDS = 60 * 60 * 2; // 2 hours, covers the active hour with slack

type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

function currentHourBucket(now: number = Date.now()): { bucket: string; secondsToNextHour: number } {
  const d = new Date(now);
  const bucket = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}-${d.getUTCHours().toString().padStart(2, '0')}`;
  const next = new Date(d);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(d.getUTCHours() + 1);
  return { bucket, secondsToNextHour: Math.ceil((next.getTime() - now) / 1000) };
}

export async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  ipHash: string,
  limit: number
): Promise<RateLimitResult> {
  const { bucket, secondsToNextHour } = currentHourBucket();
  const key = `rl:${ipHash}:${bucket}`;

  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;

  if (current >= limit) {
    return { allowed: false, retryAfterSeconds: secondsToNextHour };
  }

  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: TTL_SECONDS });
  return { allowed: true, remaining: limit - next };
}
