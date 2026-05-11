// Manual quality runner. Run with: npm run quality
// Reads tests/fixtures/plant-photos.manifest.json + tests/fixtures/plant-photos/
// Calls OpenRouter for each fixture, writes a report to quality-reports/<timestamp>.md

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { callOpenRouter } from '../src/lib/openrouter';
import { buildSystemPrompt, buildUserContent } from '../src/lib/prompt';
import { parseDiagnosisResponse } from '../src/lib/parser';

type Fixture = {
  id: string;
  file: string;
  freeformText: string;
  expected: {
    speciesContains?: string;
    primaryCategory: string;
    primaryCategoryAlternatives?: string[];
  };
  notes?: string;
};

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL ?? 'qwen/qwen-2.5-vl-72b-instruct';
if (!apiKey) {
  console.error('OPENROUTER_API_KEY not set');
  process.exit(1);
}

const manifestPath = 'tests/fixtures/plant-photos.manifest.json';
const photosDir = 'tests/fixtures/plant-photos';
const reportsDir = 'quality-reports';

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { fixtures: Fixture[] };

async function loadAsDataUrl(path: string): Promise<string> {
  const buf = readFileSync(path);
  const ext = path.toLowerCase().split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function matches(actual: string, expected: string): boolean {
  return actual.toLowerCase().includes(expected.toLowerCase());
}

async function run() {
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(reportsDir, `${stamp}.md`);

  let report = `# Quality run ${stamp}\n\nModel: \`${model}\`\n\n`;
  let speciesMatches = 0;
  let categoryMatches = 0;
  let total = 0;

  for (const fx of manifest.fixtures) {
    const photoPath = join(photosDir, fx.file);
    if (!existsSync(photoPath)) {
      report += `## ${fx.id}\n\n_SKIPPED — fixture file missing at ${photoPath}_\n\n`;
      continue;
    }
    total++;

    const dataUrl = await loadAsDataUrl(photoPath);
    let result;
    try {
      const raw = await callOpenRouter({
        apiKey: apiKey!,
        model,
        systemPrompt: buildSystemPrompt(),
        userContent: buildUserContent(dataUrl, fx.freeformText),
        maxOutputTokens: 1500
      });
      result = parseDiagnosisResponse(raw.content);
    } catch (e) {
      report += `## ${fx.id}\n\n_ERROR: ${(e as Error).message}_\n\n`;
      continue;
    }

    const speciesOk = !fx.expected.speciesContains
      || (result.species && matches(result.species.name, fx.expected.speciesContains));
    const categoryHits = [fx.expected.primaryCategory, ...(fx.expected.primaryCategoryAlternatives ?? [])];
    const categoryOk = categoryHits.some(c => matches(result.primary.name, c));

    if (speciesOk) speciesMatches++;
    if (categoryOk) categoryMatches++;

    report += `## ${fx.id}\n\n`;
    report += `Species: ${result.species?.name ?? 'null'} (${speciesOk ? 'OK' : 'MISS'})\n`;
    report += `Primary: ${result.primary.name} @ ${Math.round(result.primary.confidence * 100)}% (${categoryOk ? 'OK' : 'MISS'})\n`;
    report += `Rationale: ${result.primary.rationale}\n\n`;
    if (result.primary.recovery.length > 0) {
      report += `Recovery:\n`;
      for (const s of result.primary.recovery) report += `- ${s.action} — ${s.when}\n`;
    }
    report += `\n---\n\n`;
  }

  report = report.replace(
    'Model:',
    `Species match: ${speciesMatches}/${total} (${total > 0 ? Math.round(speciesMatches/total*100) : 0}%)\nCategory match: ${categoryMatches}/${total} (${total > 0 ? Math.round(categoryMatches/total*100) : 0}%)\n\nModel:`
  );

  writeFileSync(reportPath, report);
  console.log(`Report written to ${reportPath}`);
  console.log(`Species: ${speciesMatches}/${total} · Category: ${categoryMatches}/${total}`);
}

run().catch(e => { console.error(e); process.exit(1); });
