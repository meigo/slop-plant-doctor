import { parseDiagnosisResponse, ParseError } from './parser';
import { buildSystemPrompt, buildUserContent } from './prompt';
import { saveDiagnosis } from './storage';
import { recordSpend } from './budget';
import { parseActualCostCents, estimateCostCents } from './cost';
import { llmError, schemaError } from './errors';
import type { OpenRouterCallArgs, OpenRouterCallResult } from './openrouter';
import { callOpenRouter as defaultCallOpenRouter } from './openrouter';
import type { DiagnosisResult } from './types';

export type RunDiagnoseArgs = {
  kv: KVNamespace;
  ipHash: string;
  photoDataUrl: string;
  freeformText: string;
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  // Injectable for tests:
  callOpenRouter?: (args: OpenRouterCallArgs) => Promise<OpenRouterCallResult>;
};

export type RunDiagnoseResult = { id: string; result: DiagnosisResult };

export async function runDiagnose(args: RunDiagnoseArgs): Promise<RunDiagnoseResult> {
  const call = args.callOpenRouter ?? defaultCallOpenRouter;
  const systemPrompt = buildSystemPrompt();

  let lastUsage: OpenRouterCallResult['usage'];
  let parsed: DiagnosisResult | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: OpenRouterCallResult;
    try {
      raw = await call({
        apiKey: args.apiKey,
        model: args.model,
        systemPrompt,
        userContent: buildUserContent(args.photoDataUrl, args.freeformText, { retry: attempt > 0 }),
        maxOutputTokens: args.maxOutputTokens
      });
    } catch (e) {
      throw llmError();
    }
    lastUsage = raw.usage;

    try {
      parsed = parseDiagnosisResponse(raw.content);
      break;
    } catch (e) {
      if (!(e instanceof ParseError) || attempt === 1) {
        throw schemaError();
      }
      // attempt 0 fails → loop continues with retry: true
    }
  }

  if (!parsed) throw schemaError();

  // Overwrite meta with server-known values.
  parsed.meta = { model: args.model, createdAt: new Date().toISOString() };

  // Record spend (best-effort; non-blocking failures are tolerable).
  const costCents = parseActualCostCents({ usage: lastUsage }) ?? estimateCostCents(
    args.model,
    lastUsage?.prompt_tokens ?? 1500,
    lastUsage?.completion_tokens ?? 500
  );
  await recordSpend(args.kv, costCents);

  const id = await saveDiagnosis(args.kv, parsed);
  return { id, result: parsed };
}
