import { describe, it, expect } from 'vitest';
import { DiagnosisResultSchema } from '../../src/lib/schema';

describe('DiagnosisResultSchema', () => {
  it('parses a minimal valid result', () => {
    const valid = {
      species: { name: 'Monstera deliciosa', confidence: 0.92 },
      primary: {
        name: 'Overwatering',
        confidence: 0.75,
        rationale: 'Yellow lower leaves; soggy substrate at pot edge.',
        recovery: [{ action: 'stop watering', when: 'now, for 10 days' }]
      },
      alternatives: [],
      whatWouldChangeMyMind: ['Pull from pot; black roots = root rot.'],
      meta: { model: 'qwen/qwen-2.5-vl-72b-instruct', createdAt: '2026-05-11T10:00:00Z' }
    };
    expect(() => DiagnosisResultSchema.parse(valid)).not.toThrow();
  });

  it('accepts species: null', () => {
    const data = {
      species: null,
      primary: {
        name: 'Sunburn',
        confidence: 0.6,
        rationale: 'Bleached patches on south-facing leaves.',
        recovery: [{ action: 'move out of direct sun', when: 'now' }]
      },
      alternatives: [],
      whatWouldChangeMyMind: [],
      meta: { model: 'x', createdAt: '2026-05-11T10:00:00Z' }
    };
    expect(() => DiagnosisResultSchema.parse(data)).not.toThrow();
  });

  it('rejects confidence > 1', () => {
    const bad = {
      species: { name: 'X', confidence: 1.5 },
      primary: { name: 'Y', confidence: 0.5, rationale: 'r', recovery: [] },
      alternatives: [],
      whatWouldChangeMyMind: [],
      meta: { model: 'x', createdAt: '2026-05-11T10:00:00Z' }
    };
    expect(() => DiagnosisResultSchema.parse(bad)).toThrow();
  });

  it('rejects missing primary', () => {
    const bad = {
      species: null,
      alternatives: [],
      whatWouldChangeMyMind: [],
      meta: { model: 'x', createdAt: '2026-05-11T10:00:00Z' }
    };
    expect(() => DiagnosisResultSchema.parse(bad)).toThrow();
  });
});
