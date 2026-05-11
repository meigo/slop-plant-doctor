import { newId } from './id';
import type { DiagnosisResult, StoredDiagnosis } from './types';

export const KEY_PREFIX = 'diag:';
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export async function saveDiagnosis(kv: KVNamespace, result: DiagnosisResult): Promise<string> {
  const id = newId();
  const stored: StoredDiagnosis = {
    result,
    createdAt: new Date().toISOString()
  };
  await kv.put(KEY_PREFIX + id, JSON.stringify(stored), { expirationTtl: TTL_SECONDS });
  return id;
}

export async function loadDiagnosis(kv: KVNamespace, id: string): Promise<StoredDiagnosis | null> {
  const raw = await kv.get(KEY_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDiagnosis;
  } catch {
    return null;
  }
}
