import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiagnosisResponse, ParseError } from '../../src/lib/parser';

const FIX = join(__dirname, '../fixtures/llm-responses');
const read = (name: string) => readFileSync(join(FIX, name), 'utf8');

describe('parseDiagnosisResponse', () => {
  it('parses a clean Qwen response', () => {
    const r = parseDiagnosisResponse(read('qwen-clean.json'));
    expect(r.species?.name).toBe('Monstera deliciosa');
    expect(r.primary.name).toBe('Overwatering');
  });

  it('handles trailing prose after the JSON object', () => {
    const r = parseDiagnosisResponse(read('qwen-trailing-prose.txt'));
    expect(r.species?.name).toBe('Sansevieria trifasciata');
  });

  it('strips markdown code fences (Gemini-style)', () => {
    const r = parseDiagnosisResponse(read('gemini-fenced.txt'));
    expect(r.species).toBeNull();
    expect(r.primary.name).toBe('Light burn');
  });

  it('throws ParseError on schema-invalid content', () => {
    expect(() => parseDiagnosisResponse(read('invalid-schema.txt'))).toThrow(ParseError);
  });

  it('throws ParseError when no JSON object found', () => {
    expect(() => parseDiagnosisResponse('Just some prose, no JSON here.')).toThrow(ParseError);
  });
});
