// Per-model rate table. Cents per million tokens.
// Update as OpenRouter pricing changes; verify against current docs at deploy time.

type ModelRate = {
  inputCentsPerMtok: number;
  outputCentsPerMtok: number;
};

const RATES: Record<string, ModelRate> = {
  'qwen/qwen-2.5-vl-72b-instruct': { inputCentsPerMtok: 40, outputCentsPerMtok: 120 },
  'google/gemini-2.5-flash':       { inputCentsPerMtok: 30, outputCentsPerMtok: 250 },
  'anthropic/claude-sonnet-4.6':   { inputCentsPerMtok: 300, outputCentsPerMtok: 1500 },
  'anthropic/claude-haiku-4.5':    { inputCentsPerMtok: 100, outputCentsPerMtok: 500 },
  'deepseek/deepseek-vl2':         { inputCentsPerMtok: 20, outputCentsPerMtok: 100 }
};

const FALLBACK: ModelRate = { inputCentsPerMtok: 300, outputCentsPerMtok: 1500 };

export function getModelRate(model: string): ModelRate {
  return RATES[model] ?? FALLBACK;
}

export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const rate = getModelRate(model);
  const cents = (inputTokens * rate.inputCentsPerMtok + outputTokens * rate.outputCentsPerMtok) / 1_000_000;
  return Math.max(1, Math.ceil(cents));
}

type OpenRouterResponseWithUsage = {
  usage?: { total_cost?: number; prompt_tokens?: number; completion_tokens?: number };
};

export function parseActualCostCents(response: OpenRouterResponseWithUsage): number | null {
  const usd = response?.usage?.total_cost;
  if (typeof usd !== 'number' || usd <= 0) return null;
  return Math.max(1, Math.ceil(usd * 100));
}
