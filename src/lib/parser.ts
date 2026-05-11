import { DiagnosisResultSchema } from './schema';
import type { DiagnosisResult } from './types';

export class ParseError extends Error {
  constructor(message: string, public stage: 'extract' | 'parse' | 'schema') {
    super(message);
    this.name = 'ParseError';
  }
}

// Strip surrounding markdown code fences if present.
function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

// Locate the first balanced JSON object in the string. Returns the substring or null.
function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return input.substring(start, i + 1);
    }
  }
  return null;
}

export function parseDiagnosisResponse(raw: string): DiagnosisResult {
  const dejacketed = stripFences(raw);
  const jsonStr = extractFirstJsonObject(dejacketed);
  if (!jsonStr) {
    throw new ParseError('No JSON object found in response', 'extract');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new ParseError(`Invalid JSON: ${(e as Error).message}`, 'parse');
  }

  const result = DiagnosisResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ParseError(`Schema validation failed: ${result.error.message}`, 'schema');
  }
  return result.data;
}
