import { describe, it, expect } from 'vitest';
import { saveDiagnosis, loadDiagnosis, KEY_PREFIX } from '../../src/lib/storage';
import { makeKvMock } from '../support/kvMock';
import type { DiagnosisResult } from '../../src/lib/types';

const sample: DiagnosisResult = {
  species: { name: 'Monstera deliciosa', confidence: 0.9 },
  primary: { name: 'Overwatering', confidence: 0.7, rationale: 'r', recovery: [] },
  alternatives: [],
  whatWouldChangeMyMind: [],
  meta: { model: 'qwen/qwen-2.5-vl-72b-instruct', createdAt: '2026-05-11T10:00:00Z' }
};

describe('storage', () => {
  it('saveDiagnosis returns an ID and stores under the right key', async () => {
    const kv = makeKvMock();
    const id = await saveDiagnosis(kv, sample);
    expect(id).toMatch(/^[0-9a-z]{8}$/);
    const raw = await kv.get(KEY_PREFIX + id);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.result.species?.name).toBe('Monstera deliciosa');
    expect(stored.createdAt).toBeDefined();
  });

  it('loadDiagnosis returns null for missing key', async () => {
    const kv = makeKvMock();
    expect(await loadDiagnosis(kv, 'aaaaaaaa')).toBeNull();
  });

  it('loadDiagnosis returns the saved result', async () => {
    const kv = makeKvMock();
    const id = await saveDiagnosis(kv, sample);
    const stored = await loadDiagnosis(kv, id);
    expect(stored?.result.species?.name).toBe('Monstera deliciosa');
  });
});
