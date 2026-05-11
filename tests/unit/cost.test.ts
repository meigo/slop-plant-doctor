import { describe, it, expect } from 'vitest';
import { estimateCostCents, parseActualCostCents, getModelRate } from '../../src/lib/cost';

describe('cost estimator', () => {
  it('estimates from token counts using model rate table', () => {
    // Qwen2.5-VL: input ~$0.40/Mtok, output ~$1.20/Mtok (rates in cost.ts)
    // 1000 input + 500 output tokens → 0.04¢ + 0.06¢ ≈ 0¢ in cents (round up to 1 minimum)
    const cents = estimateCostCents('qwen/qwen-2.5-vl-72b-instruct', 1000, 500);
    expect(cents).toBeGreaterThanOrEqual(1);
    expect(cents).toBeLessThanOrEqual(10);
  });

  it('falls back to a conservative default for unknown models', () => {
    const cents = estimateCostCents('unknown/model', 1000, 500);
    expect(cents).toBeGreaterThan(0);
  });

  it('returns rate info for known model', () => {
    const rate = getModelRate('qwen/qwen-2.5-vl-72b-instruct');
    expect(rate.inputCentsPerMtok).toBeGreaterThan(0);
    expect(rate.outputCentsPerMtok).toBeGreaterThan(0);
  });
});

describe('parseActualCostCents', () => {
  it('extracts usage.total_cost (USD) from OpenRouter response and converts to cents', () => {
    const response = { usage: { total_cost: 0.0042 } } as any;
    expect(parseActualCostCents(response)).toBe(1); // 0.42 cents rounds up to 1
  });

  it('returns null when no usage info present', () => {
    expect(parseActualCostCents({} as any)).toBeNull();
    expect(parseActualCostCents({ usage: {} } as any)).toBeNull();
  });
});
