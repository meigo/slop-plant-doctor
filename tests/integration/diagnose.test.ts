import { describe, it, expect, vi } from 'vitest';
import { runDiagnose } from '../../src/lib/diagnose';
import { makeKvMock } from '../support/kvMock';

const validJson = (model: string) => JSON.stringify({
  species: { name: 'Monstera deliciosa', confidence: 0.9 },
  primary: { name: 'Overwatering', confidence: 0.7, rationale: 'r', recovery: [] },
  alternatives: [],
  whatWouldChangeMyMind: [],
  meta: { model, createdAt: '2026-05-11T10:00:00Z' }
});

describe('runDiagnose', () => {
  it('returns id + result on happy path; updates budget', async () => {
    const kv = makeKvMock();
    const openRouter = vi.fn(async () => ({
      content: validJson('qwen/qwen-2.5-vl-72b-instruct'),
      usage: { prompt_tokens: 1000, completion_tokens: 500, total_cost: 0.005 }
    }));

    const r = await runDiagnose({
      kv,
      ipHash: 'ip',
      photoDataUrl: 'data:image/jpeg;base64,xxx',
      freeformText: '',
      apiKey: 'k',
      model: 'qwen/qwen-2.5-vl-72b-instruct',
      maxOutputTokens: 1500,
      callOpenRouter: openRouter as any
    });

    expect(r.id).toMatch(/^[0-9a-z]{8}$/);
    expect(r.result.species?.name).toBe('Monstera deliciosa');
    expect(r.result.meta.model).toBe('qwen/qwen-2.5-vl-72b-instruct'); // overwritten from arg
  });

  it('retries once on schema error and succeeds', async () => {
    const kv = makeKvMock();
    const openRouter = vi.fn()
      .mockResolvedValueOnce({ content: '{"bad":true}', usage: { total_cost: 0.001 } })
      .mockResolvedValueOnce({ content: validJson('qwen/qwen-2.5-vl-72b-instruct'), usage: { total_cost: 0.005 } });

    const r = await runDiagnose({
      kv, ipHash: 'ip', photoDataUrl: 'data:image/jpeg;base64,xxx', freeformText: '',
      apiKey: 'k', model: 'qwen/qwen-2.5-vl-72b-instruct', maxOutputTokens: 1500,
      callOpenRouter: openRouter as any
    });

    expect(openRouter).toHaveBeenCalledTimes(2);
    expect(r.result.primary.name).toBe('Overwatering');
  });

  it('throws schemaError after second failure', async () => {
    const kv = makeKvMock();
    const openRouter = vi.fn(async () => ({ content: '{"still":"bad"}', usage: { total_cost: 0 } }));

    await expect(runDiagnose({
      kv, ipHash: 'ip', photoDataUrl: 'data:image/jpeg;base64,xxx', freeformText: '',
      apiKey: 'k', model: 'qwen/qwen-2.5-vl-72b-instruct', maxOutputTokens: 1500,
      callOpenRouter: openRouter as any
    })).rejects.toThrow(/schema/i);

    expect(openRouter).toHaveBeenCalledTimes(2);
  });
});
