/// <reference types="@cloudflare/workers-types" />

// In-memory KVNamespace mock — supports the subset used by the app.
export function makeKvMock(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  const now = () => Date.now();

  const isExpired = (entry: { expiresAt?: number }) =>
    entry.expiresAt !== undefined && entry.expiresAt <= now();

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      const expiresAt = opts?.expirationTtl ? now() + opts.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() { return { keys: [], list_complete: true, cursor: '' }; },
    async getWithMetadata() { return { value: null, metadata: null, cacheStatus: null }; }
  } as unknown as KVNamespace;
}
