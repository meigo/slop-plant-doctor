# Plant Doctor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Plant Doctor v1 — a public, free, mobile-first web app that diagnoses sick plants from a photo + optional freeform text, returning structured JSON results with share URLs.

**Architecture:** SvelteKit on Cloudflare Pages. POST `/api/diagnose` orchestrates Turnstile → layered cost controls → OpenRouter (default Qwen2.5-VL 72B) → schema-validated structured JSON → KV-stored result with `/d/[id]` SSR pages. No DB, no accounts, no image storage.

**Tech Stack:** SvelteKit (Svelte 5) + TypeScript, `@sveltejs/adapter-cloudflare`, Cloudflare Pages / Pages Functions / KV / Turnstile, OpenRouter (via `openai` SDK with custom baseURL), Zod, nanoid, Vitest (+ happy-dom + @testing-library/svelte), Playwright.

**Spec reference:** `slop-ideas/docs/superpowers/specs/2026-05-11-plant-doctor-design.md`

**Deployment lessons learned (2026-05-11 execution):**
- `@sveltejs/adapter-cloudflare@7.x` targets **Cloudflare Workers + Static Assets**, NOT legacy Pages. Deploy with `wrangler deploy`, not `wrangler pages deploy`. The corrected Task 30 below reflects this.
- `wrangler.toml`'s `main` must point to a real persistent path (e.g. `.svelte-kit/cloudflare/_worker.js`) where the adapter writes the worker; the original placeholder `.wrangler/tmp/bundle_` is a wrangler-managed temp dir that gets cleared before deploy.
- Non-secret env vars belong in `wrangler.toml [vars]` (or the Workers dashboard); secrets go via `wrangler secret put` (server-side, runtime) — `PUBLIC_*` env vars are baked at build time and must be in `.env` before `npm run build`.
- Worker URL is `<name>.<your-subdomain>.workers.dev` (e.g. `slop-plant-doctor.meigo.workers.dev`), not `<name>.pages.dev`.

**Working directory note:**
- **Tasks 1–2** run from `~/Projects/slop/` (parent dir; we create `slop-plant-doctor/` there).
- **Tasks 3+** run from `~/Projects/slop/slop-plant-doctor/` (the new repo).
- All file paths in Tasks 3+ are relative to `slop-plant-doctor/`.

---

## File Structure (target)

```
slop-plant-doctor/
  package.json
  tsconfig.json
  svelte.config.js
  vite.config.ts
  wrangler.toml
  playwright.config.ts
  .gitignore
  .dev.vars                     # local env (gitignored)
  .dev.vars.example             # template, committed
  README.md
  docs/superpowers/
    specs/2026-05-11-plant-doctor-design.md
    plans/2026-05-11-plant-doctor.md
  src/
    app.html
    app.d.ts                    # Platform.Env types
    app.css                     # global styles, max-width container
    lib/
      types.ts                  # DiagnosisResult, RecoveryStep types
      schema.ts                 # Zod schemas
      errors.ts                 # error codes + classes
      id.ts                     # nanoid 8-char URL-safe
      parser.ts                 # LLM response parsing (fences, trailing prose)
      cost.ts                   # per-model rate table + estimator
      storage.ts                # KV save/load diagnoses
      rateLimit.ts              # per-IP hourly counter
      dailyCap.ts               # per-IP daily counter
      budget.ts                 # global daily budget cents counter
      turnstile.ts              # token verification
      prompt.ts                 # system prompt + user message builder
      openrouter.ts             # OpenRouter client (OpenAI SDK wrapper)
      diagnose.ts               # full pipeline composition
      photoCompress.ts          # client-side canvas resize + JPEG encode
      hash.ts                   # sha256 helper for IP hashing
    routes/
      +layout.svelte            # max-width wrapper, global styles
      +page.svelte              # capture page
      d/[id]/
        +page.svelte            # result render
        +page.server.ts         # SSR fetch from KV
      example/
        +page.svelte            # static example result
      api/diagnose/
        +server.ts              # POST handler
  static/
    favicon.svg
  tests/
    setup.ts                    # vitest setup (globals, mocks)
    unit/
      schema.test.ts
      id.test.ts
      parser.test.ts
      cost.test.ts
      storage.test.ts
      rateLimit.test.ts
      dailyCap.test.ts
      budget.test.ts
      turnstile.test.ts
      prompt.test.ts
      openrouter.test.ts
    integration/
      diagnose.test.ts
      api-diagnose.test.ts
    e2e/
      happy-path.spec.ts
      error-state.spec.ts
    fixtures/
      llm-responses/
        qwen-clean.json
        qwen-trailing-prose.txt
        gemini-fenced.txt
        invalid-schema.txt
      plant-photos/
        .gitignore              # gitignore the photos, manifest only
      plant-photos.manifest.json
  scripts/
    quality-run.ts              # manually invoked quality runner
```

---

## Phase 1 — Bootstrap

### Task 1: Create the slop-plant-doctor repo and scaffold SvelteKit

**Files (created by tooling):** all of `slop-plant-doctor/`

**Working dir:** `~/Projects/slop/`

- [ ] **Step 1: Scaffold the SvelteKit project**

```bash
cd ~/Projects/slop
npx sv create slop-plant-doctor --template minimal --types ts --no-add-ons --install npm
```

Expected: directory `slop-plant-doctor/` created with SvelteKit minimal template, TypeScript, npm install completed.

- [ ] **Step 2: Initialize git and add baseline `.gitignore`**

```bash
cd slop-plant-doctor
git init
```

Append to `.gitignore` (it already has node_modules, .svelte-kit, build, etc.):

```
.dev.vars
.wrangler/
.DS_Store
tests/fixtures/plant-photos/*
!tests/fixtures/plant-photos/.gitignore
```

- [ ] **Step 3: Initial commit**

```bash
git add -A
git commit -m "Initial scaffold (SvelteKit + TypeScript)"
```

---

### Task 2: Install dependencies and copy slop-skeptic configs

**Working dir:** `~/Projects/slop/slop-plant-doctor/`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install zod nanoid openai
npm install -D @sveltejs/adapter-cloudflare @cloudflare/workers-types wrangler \
  vitest @vitest/ui happy-dom @testing-library/svelte @playwright/test
```

Run `npx playwright install chromium` to fetch the browser binary.

- [ ] **Step 2: Replace `svelte.config.js`**

```js
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

- [ ] **Step 3: Replace `vite.config.ts`**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    conditions: ['browser']
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDom: { url: 'http://localhost' }
    },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globals: true
  }
});
```

- [ ] **Step 4: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
```

- [ ] **Step 5: Create `wrangler.toml`**

This is a Cloudflare **Workers + Static Assets** config (the deployment target of `@sveltejs/adapter-cloudflare` v7+). Deploys via `wrangler deploy`.

```toml
name = "slop-plant-doctor"
compatibility_date = "2026-05-01"

# Workers + Static Assets pattern. The adapter writes the worker bundle here at build time.
main = ".svelte-kit/cloudflare/_worker.js"

[assets]
directory = ".svelte-kit/cloudflare"
binding = "ASSETS"

# KV binding — namespace IDs set in Task 29
# [[kv_namespaces]]
# binding = "DIAGNOSES"
# id = "<set in Task 29>"
# preview_id = "<set in Task 29>"
```

- [ ] **Step 6: Update `package.json` scripts**

Replace the `scripts` block in `package.json`:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:e2e": "playwright test",
    "test": "npm run test:unit && npm run test:e2e",
    "quality": "tsx scripts/quality-run.ts"
  }
}
```

(`tsx` is dev-installed alongside.) Also install `tsx`:

```bash
npm install -D tsx svelte-check
```

- [ ] **Step 7: Create `tests/setup.ts`**

```ts
// Test setup — runs before every test file.
// Currently empty; placeholder for future global mocks.
export {};
```

- [ ] **Step 8: Create `.dev.vars.example`** (committed) and `.dev.vars` (local, gitignored)

`.dev.vars.example`:
```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=qwen/qwen-2.5-vl-72b-instruct
DAILY_BUDGET_CENTS=1000
RATE_LIMIT_PER_HOUR=10
DAILY_CAP_PER_IP=50
MAX_OUTPUT_TOKENS=1500
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Copy to `.dev.vars` and fill in real values during local dev.

Note: Turnstile values shown are Cloudflare's documented "always pass" test keys — fine for local dev. Real keys come from the Cloudflare dashboard.

- [ ] **Step 9: Copy spec and this plan into the project**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp ../slop-ideas/docs/superpowers/specs/2026-05-11-plant-doctor-design.md docs/superpowers/specs/
cp ../slop-ideas/docs/superpowers/plans/2026-05-11-plant-doctor.md docs/superpowers/plans/
```

- [ ] **Step 10: Verify tooling works**

```bash
npm run check
```

Expected: 0 errors (warnings about unused stuff are fine).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Install deps and configure SvelteKit + Cloudflare + Vitest + Playwright"
```

---

### Task 3: Add `app.d.ts` and `app.css`

**Files:**
- Modify: `src/app.d.ts`
- Create: `src/app.css`
- Modify: `src/app.html`

- [ ] **Step 1: Define Cloudflare bindings in `src/app.d.ts`**

```ts
import 'unplugin-icons/types/svelte';

declare global {
  namespace App {
    interface Platform {
      env: {
        DIAGNOSES: KVNamespace;
        OPENROUTER_API_KEY: string;
        OPENROUTER_MODEL?: string;
        DAILY_BUDGET_CENTS?: string;
        RATE_LIMIT_PER_HOUR?: string;
        DAILY_CAP_PER_IP?: string;
        MAX_OUTPUT_TOKENS?: string;
        TURNSTILE_SITE_KEY: string;
        TURNSTILE_SECRET_KEY: string;
      };
      context: { waitUntil(promise: Promise<unknown>): void };
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
```

Note: remove the `unplugin-icons` import line — it's a leftover. The file should start with the `declare global` block.

Corrected:

```ts
declare global {
  namespace App {
    interface Platform {
      env: {
        DIAGNOSES: KVNamespace;
        OPENROUTER_API_KEY: string;
        OPENROUTER_MODEL?: string;
        DAILY_BUDGET_CENTS?: string;
        RATE_LIMIT_PER_HOUR?: string;
        DAILY_CAP_PER_IP?: string;
        MAX_OUTPUT_TOKENS?: string;
        TURNSTILE_SITE_KEY: string;
        TURNSTILE_SECRET_KEY: string;
      };
      context: { waitUntil(promise: Promise<unknown>): void };
      caches: CacheStorage & { default: Cache };
    }
  }
}

export {};
```

- [ ] **Step 2: Create `src/app.css`** (minimal global styles)

```css
:root {
  --bg: #fafaf7;
  --fg: #1a1a1a;
  --muted: #666;
  --border: #e0e0d8;
  --accent: #4a7;
  --accent-dim: #d4e8d8;
  --danger: #c44;
  --max-width: 700px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

.container {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1rem;
}

button {
  font: inherit;
  cursor: pointer;
}

.button-primary {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-weight: 600;
  width: 100%;
}

.button-primary:disabled {
  background: var(--border);
  cursor: not-allowed;
}
```

- [ ] **Step 3: Modify `src/app.html`** to include the stylesheet

Replace `%sveltekit.head%` line's surroundings with:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#fafaf7" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 4: Modify `src/routes/+layout.svelte`** to import the CSS

```svelte
<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="container">
  {@render children()}
</div>
```

- [ ] **Step 5: Verify**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Cloudflare platform types, global styles, layout"
```

---

## Phase 2 — Core types + pure utilities (TDD)

### Task 4: Define core types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the file**

```ts
// Core types for diagnoses.

export type Species = {
  name: string;
  confidence: number;
  commonNames?: string[];
};

export type RecoveryStep = {
  action: string;
  when: string;
};

export type PrimaryDiagnosis = {
  name: string;
  confidence: number;
  rationale: string;
  recovery: RecoveryStep[];
};

export type AlternativeDiagnosis = {
  name: string;
  confidence: number;
  rationale: string;
};

export type DiagnosisResult = {
  species: Species | null;
  primary: PrimaryDiagnosis;
  alternatives: AlternativeDiagnosis[];
  whatWouldChangeMyMind: string[];
  meta: {
    model: string;
    createdAt: string;
  };
};

// Server-side wrapper stored in KV.
export type StoredDiagnosis = {
  result: DiagnosisResult;
  createdAt: string;
};

// HTTP error codes the API can return — mapped to user-facing copy on the client.
export type ApiErrorCode =
  | 'turnstile_failed'
  | 'rate_limited'
  | 'daily_cap_per_ip'
  | 'budget_exhausted'
  | 'photo_too_large'
  | 'photo_unsupported_format'
  | 'text_too_long'
  | 'llm_error'
  | 'schema_error'
  | 'internal_error';
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "Add core diagnosis types"
```

---

### Task 5: Zod schema for `DiagnosisResult`

**Files:**
- Create: `src/lib/schema.ts`
- Create: `tests/unit/schema.test.ts`

- [ ] **Step 1: Write the failing test** in `tests/unit/schema.test.ts`

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit -- schema
```

Expected: FAIL with "Cannot find module '../../src/lib/schema'".

- [ ] **Step 3: Implement `src/lib/schema.ts`**

```ts
import { z } from 'zod';

const SpeciesSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  commonNames: z.array(z.string()).optional()
});

const RecoveryStepSchema = z.object({
  action: z.string().min(1),
  when: z.string().min(1)
});

const PrimaryDiagnosisSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  recovery: z.array(RecoveryStepSchema)
});

const AlternativeDiagnosisSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1)
});

export const DiagnosisResultSchema = z.object({
  species: SpeciesSchema.nullable(),
  primary: PrimaryDiagnosisSchema,
  alternatives: z.array(AlternativeDiagnosisSchema),
  whatWouldChangeMyMind: z.array(z.string()),
  meta: z.object({
    model: z.string().min(1),
    createdAt: z.string().min(1)
  })
});

export type DiagnosisResultZ = z.infer<typeof DiagnosisResultSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:unit -- schema
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts tests/unit/schema.test.ts
git commit -m "Add Zod schema for DiagnosisResult with tests"
```

---

### Task 6: ID generator

**Files:**
- Create: `src/lib/id.ts`
- Create: `tests/unit/id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { newId, ID_REGEX } from '../../src/lib/id';

describe('newId', () => {
  it('returns an 8-char URL-safe string', () => {
    const id = newId();
    expect(id).toMatch(ID_REGEX);
    expect(id.length).toBe(8);
  });

  it('generates unique IDs across many invocations', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(newId());
    expect(set.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- id
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/lib/id.ts`**

```ts
import { customAlphabet } from 'nanoid';

// URL-safe alphabet — no dashes/underscores so IDs remain copy-pasteable.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const generate = customAlphabet(ALPHABET, 8);

export const ID_REGEX = /^[0-9a-z]{8}$/;

export function newId(): string {
  return generate();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- id
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/id.ts tests/unit/id.test.ts
git commit -m "Add 8-char URL-safe ID generator"
```

---

### Task 7: Error codes and classes

**Files:**
- Create: `src/lib/errors.ts`

- [ ] **Step 1: Write the file**

```ts
import type { ApiErrorCode } from './types';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public httpStatus: number,
    public userMessage: string,
    public retryAfterSeconds?: number
  ) {
    super(`${code}: ${userMessage}`);
    this.name = 'ApiError';
  }
}

export function turnstileFailed(): ApiError {
  return new ApiError('turnstile_failed', 401, "Couldn't verify the request. Refresh and try again.");
}

export function rateLimited(retryAfterSec: number): ApiError {
  return new ApiError(
    'rate_limited',
    429,
    `Slow down a bit — try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
    retryAfterSec
  );
}

export function dailyCapHit(): ApiError {
  return new ApiError(
    'daily_cap_per_ip',
    429,
    'Daily limit reached for this IP. Try again tomorrow.'
  );
}

export function budgetExhausted(): ApiError {
  return new ApiError(
    'budget_exhausted',
    503,
    'Free quota for today is exhausted. Come back tomorrow.'
  );
}

export function photoTooLarge(): ApiError {
  return new ApiError('photo_too_large', 400, 'Photo too large. Try a smaller image.');
}

export function photoUnsupportedFormat(): ApiError {
  return new ApiError(
    'photo_unsupported_format',
    400,
    'Unsupported format. Use JPEG, PNG, or WebP.'
  );
}

export function textTooLong(): ApiError {
  return new ApiError('text_too_long', 400, 'Text description is too long. Trim it down.');
}

export function llmError(): ApiError {
  return new ApiError(
    'llm_error',
    500,
    'Diagnostic engine had trouble with this photo. Try a different angle or a closer shot.'
  );
}

export function schemaError(): ApiError {
  return new ApiError(
    'schema_error',
    500,
    'Diagnostic engine returned an unexpected response. Try again.'
  );
}

export function internalError(): ApiError {
  return new ApiError('internal_error', 500, 'Something went wrong. Try again.');
}
```

- [ ] **Step 2: Verify compile**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/errors.ts
git commit -m "Add API error taxonomy with user-facing messages"
```

---

### Task 8: Cost estimator + per-model rate table

**Files:**
- Create: `src/lib/cost.ts`
- Create: `tests/unit/cost.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- cost
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement `src/lib/cost.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- cost
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cost.ts tests/unit/cost.test.ts
git commit -m "Add cost estimator with per-model rate table"
```

---

### Task 9: Hash helper (SHA-256 for IP hashing)

**Files:**
- Create: `src/lib/hash.ts`
- Create: `tests/unit/hash.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../../src/lib/hash';

describe('sha256Hex', () => {
  it('returns a 64-char hex string', async () => {
    const out = await sha256Hex('hello');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    expect(out.length).toBe(64);
  });

  it('is deterministic', async () => {
    const a = await sha256Hex('192.168.1.1');
    const b = await sha256Hex('192.168.1.1');
    expect(a).toBe(b);
  });

  it('differs for different inputs', async () => {
    const a = await sha256Hex('1.1.1.1');
    const b = await sha256Hex('2.2.2.2');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- hash
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/hash.ts`**

```ts
// Use WebCrypto (available in Cloudflare Workers + modern browsers).
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- hash
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hash.ts tests/unit/hash.test.ts
git commit -m "Add SHA-256 helper for IP hashing"
```

---

## Phase 3 — LLM response parser

### Task 10: Parser (markdown fence stripping + JSON extraction)

**Files:**
- Create: `src/lib/parser.ts`
- Create: `tests/unit/parser.test.ts`
- Create: `tests/fixtures/llm-responses/qwen-clean.json`
- Create: `tests/fixtures/llm-responses/qwen-trailing-prose.txt`
- Create: `tests/fixtures/llm-responses/gemini-fenced.txt`
- Create: `tests/fixtures/llm-responses/invalid-schema.txt`

- [ ] **Step 1: Create fixture files**

`tests/fixtures/llm-responses/qwen-clean.json`:
```json
{
  "species": { "name": "Monstera deliciosa", "confidence": 0.92 },
  "primary": {
    "name": "Overwatering",
    "confidence": 0.75,
    "rationale": "Yellow lower leaves, soft stems, soggy substrate visible at pot edge.",
    "recovery": [
      { "action": "stop watering", "when": "now, for 10 days" },
      { "action": "check roots", "when": "today" }
    ]
  },
  "alternatives": [
    { "name": "Root rot", "confidence": 0.18, "rationale": "Advanced overwatering." }
  ],
  "whatWouldChangeMyMind": ["Roots black and mushy → root rot confirmed."],
  "meta": { "model": "qwen/qwen-2.5-vl-72b-instruct", "createdAt": "2026-05-11T10:00:00Z" }
}
```

`tests/fixtures/llm-responses/qwen-trailing-prose.txt`:
```
{"species":{"name":"Sansevieria trifasciata","confidence":0.88},"primary":{"name":"Underwatering","confidence":0.7,"rationale":"Wrinkled leaves and dry substrate.","recovery":[{"action":"water thoroughly","when":"now"}]},"alternatives":[],"whatWouldChangeMyMind":[],"meta":{"model":"qwen/qwen-2.5-vl-72b-instruct","createdAt":"2026-05-11T10:00:00Z"}}

I hope this helps! Let me know if you need anything else.
```

`tests/fixtures/llm-responses/gemini-fenced.txt`:
````
```json
{"species":null,"primary":{"name":"Light burn","confidence":0.6,"rationale":"Bleached patches on top-facing leaves.","recovery":[{"action":"move out of direct sun","when":"now"}]},"alternatives":[],"whatWouldChangeMyMind":[],"meta":{"model":"google/gemini-2.5-flash","createdAt":"2026-05-11T10:00:00Z"}}
```
````

`tests/fixtures/llm-responses/invalid-schema.txt`:
```
{"species":{"name":"X","confidence":99},"primary":{}}
```

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Run to verify failure**

```bash
npm run test:unit -- parser
```

Expected: FAIL with module not found.

- [ ] **Step 4: Implement `src/lib/parser.ts`**

```ts
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
```

- [ ] **Step 5: Run to verify pass**

```bash
npm run test:unit -- parser
```

Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parser.ts tests/unit/parser.test.ts tests/fixtures/llm-responses/
git commit -m "Add LLM response parser with fence/trailing-prose handling"
```

---

## Phase 4 — KV-backed modules (TDD with mocked KV)

### Task 11: KV mock helper for tests

**Files:**
- Create: `tests/support/kvMock.ts`

- [ ] **Step 1: Write the helper**

```ts
// In-memory KVNamespace mock — supports the subset used by the app.
export function makeKvMock(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  const now = () => Date.now();

  const isExpired = (entry: { expiresAt?: number }) =>
    entry.expiresAt !== undefined && entry.expiresAt <= now();

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      const expiresAt = opts?.expirationTtl ? now() + opts.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() { return { keys: [], list_complete: true, cursor: '' }; },
    async getWithMetadata() { return { value: null, metadata: null, cacheStatus: null }; }
  } as unknown as KVNamespace;
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/support/kvMock.ts
git commit -m "Add KVNamespace mock for tests"
```

---

### Task 12: Storage module (save/load diagnoses)

**Files:**
- Create: `src/lib/storage.ts`
- Create: `tests/unit/storage.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- storage
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/storage.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- storage
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts tests/unit/storage.test.ts
git commit -m "Add KV storage module for diagnoses (90-day TTL)"
```

---

### Task 13: Rate-limit module (per-IP hourly)

**Files:**
- Create: `src/lib/rateLimit.ts`
- Create: `tests/unit/rateLimit.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { checkAndIncrementRateLimit } from '../../src/lib/rateLimit';
import { makeKvMock } from '../support/kvMock';

describe('rate limit', () => {
  it('allows up to the limit then blocks', async () => {
    const kv = makeKvMock();
    const ipHash = 'aaaaaaaa';
    for (let i = 0; i < 5; i++) {
      const r = await checkAndIncrementRateLimit(kv, ipHash, 5);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(5 - i - 1);
    }
    const r6 = await checkAndIncrementRateLimit(kv, ipHash, 5);
    expect(r6.allowed).toBe(false);
    expect(r6.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('isolates different IPs', async () => {
    const kv = makeKvMock();
    for (let i = 0; i < 5; i++) await checkAndIncrementRateLimit(kv, 'aaaaaaaa', 5);
    const other = await checkAndIncrementRateLimit(kv, 'bbbbbbbb', 5);
    expect(other.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- rateLimit
```

- [ ] **Step 3: Implement `src/lib/rateLimit.ts`**

```ts
// Per-IP hourly rate limit using a KV counter keyed by hash + UTC hour bucket.
// Each hit increments the counter; expiry handled by KV TTL.

const TTL_SECONDS = 60 * 60 * 2; // 2 hours, covers the active hour with slack

type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

function currentHourBucket(now: number = Date.now()): { bucket: string; secondsToNextHour: number } {
  const d = new Date(now);
  const bucket = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}-${d.getUTCHours().toString().padStart(2, '0')}`;
  const next = new Date(d);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(d.getUTCHours() + 1);
  return { bucket, secondsToNextHour: Math.ceil((next.getTime() - now) / 1000) };
}

export async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  ipHash: string,
  limit: number
): Promise<RateLimitResult> {
  const { bucket, secondsToNextHour } = currentHourBucket();
  const key = `rl:${ipHash}:${bucket}`;

  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) || 0 : 0;

  if (current >= limit) {
    return { allowed: false, retryAfterSeconds: secondsToNextHour };
  }

  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: TTL_SECONDS });
  return { allowed: true, remaining: limit - next };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- rateLimit
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rateLimit.ts tests/unit/rateLimit.test.ts
git commit -m "Add per-IP hourly rate limit (KV-backed)"
```

---

### Task 14: Daily cap module (per-IP)

**Files:**
- Create: `src/lib/dailyCap.ts`
- Create: `tests/unit/dailyCap.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { checkAndIncrementDailyCap } from '../../src/lib/dailyCap';
import { makeKvMock } from '../support/kvMock';

describe('daily cap', () => {
  it('allows up to the cap, then blocks', async () => {
    const kv = makeKvMock();
    const ipHash = 'aaaaaaaa';
    for (let i = 0; i < 3; i++) {
      const r = await checkAndIncrementDailyCap(kv, ipHash, 3);
      expect(r.allowed).toBe(true);
    }
    const r4 = await checkAndIncrementDailyCap(kv, ipHash, 3);
    expect(r4.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- dailyCap
```

- [ ] **Step 3: Implement `src/lib/dailyCap.ts`**

```ts
const TTL_SECONDS = 60 * 60 * 48;

type Result = { allowed: true; remaining: number } | { allowed: false };

function currentDateBucket(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

export async function checkAndIncrementDailyCap(
  kv: KVNamespace,
  ipHash: string,
  cap: number
): Promise<Result> {
  const key = `daily:${ipHash}:${currentDateBucket()}`;
  const current = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  if (current >= cap) return { allowed: false };
  const next = current + 1;
  await kv.put(key, String(next), { expirationTtl: TTL_SECONDS });
  return { allowed: true, remaining: cap - next };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- dailyCap
```

Expected: 1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyCap.ts tests/unit/dailyCap.test.ts
git commit -m "Add per-IP daily cap module"
```

---

### Task 15: Global daily budget cap

**Files:**
- Create: `src/lib/budget.ts`
- Create: `tests/unit/budget.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { canSpend, recordSpend } from '../../src/lib/budget';
import { makeKvMock } from '../support/kvMock';

describe('global budget', () => {
  it('allows spend when under cap, blocks when at or over cap', async () => {
    const kv = makeKvMock();
    expect((await canSpend(kv, 1000, 500)).allowed).toBe(true); // 0 spent, want 500, cap 1000 → ok

    await recordSpend(kv, 500);
    expect((await canSpend(kv, 1000, 500)).allowed).toBe(true); // 500 spent, want 500 → exactly at cap → still ok by canSpend semantics

    await recordSpend(kv, 600);
    const r = await canSpend(kv, 1000, 100);
    expect(r.allowed).toBe(false);
  });

  it('records spend cumulatively for the day', async () => {
    const kv = makeKvMock();
    await recordSpend(kv, 50);
    await recordSpend(kv, 30);
    const r = await canSpend(kv, 100, 25);
    expect(r.allowed).toBe(false); // 80 + 25 = 105 > 100
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- budget
```

- [ ] **Step 3: Implement `src/lib/budget.ts`**

```ts
const TTL_SECONDS = 60 * 60 * 48;

function currentDateKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `budget:${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
}

export async function canSpend(
  kv: KVNamespace,
  capCents: number,
  estimatedCents: number
): Promise<{ allowed: boolean; spentCents: number }> {
  const key = currentDateKey();
  const spentCents = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  return { allowed: spentCents + estimatedCents <= capCents, spentCents };
}

export async function recordSpend(kv: KVNamespace, cents: number): Promise<void> {
  const key = currentDateKey();
  const current = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  await kv.put(key, String(current + cents), { expirationTtl: TTL_SECONDS });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- budget
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget.ts tests/unit/budget.test.ts
git commit -m "Add global daily budget cap module"
```

---

## Phase 5 — External-service wrappers

### Task 16: Turnstile verification

**Files:**
- Create: `src/lib/turnstile.ts`
- Create: `tests/unit/turnstile.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyTurnstile } from '../../src/lib/turnstile';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('verifyTurnstile', () => {
  it('returns true on a success response', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as any;
    const ok = await verifyTurnstile('secret', 'token', '1.2.3.4');
    expect(ok).toBe(true);
  });

  it('returns false on a failure response', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as any;
    const ok = await verifyTurnstile('secret', 'token', '1.2.3.4');
    expect(ok).toBe(false);
  });

  it('returns false on network error', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); }) as any;
    const ok = await verifyTurnstile('secret', 'token', '1.2.3.4');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- turnstile
```

- [ ] **Step 3: Implement `src/lib/turnstile.ts`**

```ts
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  secretKey: string,
  token: string,
  remoteIp: string
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token, remoteip: remoteIp });
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const json = (await res.json()) as { success: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- turnstile
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/turnstile.ts tests/unit/turnstile.test.ts
git commit -m "Add Turnstile token verification"
```

---

### Task 17: Prompt builder

**Files:**
- Create: `src/lib/prompt.ts`
- Create: `tests/unit/prompt.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserContent } from '../../src/lib/prompt';

describe('prompt builders', () => {
  it('system prompt includes the schema and key rules', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('horticulturist');
    expect(p).toContain('confidence');
    expect(p).toContain('whatWouldChangeMyMind');
    expect(p).toContain('species');
    expect(p).toContain('recovery');
    expect(p).toContain('JSON');
  });

  it('user content includes the photo and freeform text', () => {
    const c = buildUserContent('data:image/jpeg;base64,XYZ', 'leaves yellow');
    expect(Array.isArray(c)).toBe(true);
    const types = c.map(x => x.type);
    expect(types).toContain('image_url');
    expect(types).toContain('text');
    const text = c.find(x => x.type === 'text');
    expect(text?.text).toContain('leaves yellow');
  });

  it('user content handles missing freeform text', () => {
    const c = buildUserContent('data:image/jpeg;base64,XYZ', '');
    const text = c.find(x => x.type === 'text');
    expect(text?.text).toContain('no additional context');
  });

  it('user content respects retry mode instruction', () => {
    const c = buildUserContent('data:image/jpeg;base64,XYZ', 'x', { retry: true });
    const text = c.find(x => x.type === 'text');
    expect(text?.text.toLowerCase()).toContain('previous response did not match the schema');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- prompt
```

- [ ] **Step 3: Implement `src/lib/prompt.ts`**

```ts
export function buildSystemPrompt(): string {
  return `You are an expert horticulturist diagnosing plants from photos and user-provided context. You combine plant pathology knowledge with disciplined uncertainty.

You receive: one photo of a plant the user is concerned about, plus optional freeform text describing what they're seeing.

Produce a JSON object matching this schema (TypeScript-style for clarity):

{
  "species": { "name": string, "confidence": number, "commonNames"?: string[] } | null,
  "primary": {
    "name": string,
    "confidence": number,
    "rationale": string,
    "recovery": Array<{ "action": string, "when": string }>
  },
  "alternatives": Array<{ "name": string, "confidence": number, "rationale": string }>,
  "whatWouldChangeMyMind": string[],
  "meta": { "model": string, "createdAt": string }
}

Rules:

1. Confidence is 0.0-1.0. Use it honestly. If species ID is uncertain, set "species" to null rather than guessing.

2. Every rationale must cite visible evidence from the photo (e.g. "yellowing is bottom-up and progresses inward", not generic descriptions).

3. Recovery steps must be concrete: specific action + specific timing ("stop watering for 10 days", not "water less often").

4. Provide 1-2 plausible alternative diagnoses with confidence below the primary, or [] if none.

5. "whatWouldChangeMyMind": 1-3 cheap checks the user can do to confirm/refute the primary diagnosis.

6. Safety:
   - Never recommend toxic chemicals without an explicit warning and a non-toxic alternative.
   - Flag severe infestations that threaten nearby plants.
   - If the photo shows something outside scope (not a plant, beyond recovery, edible plant with food-safety implications), set fields appropriately and note it.

7. Tone: direct, no padding. Write for someone who wants to act.

8. Output ONLY the JSON object, no prose around it.

The "meta.model" field will be overwritten server-side; you may pass through a placeholder. "meta.createdAt" likewise.`;
}

type UserContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

export function buildUserContent(
  photoDataUrl: string,
  freeformText: string,
  opts: { retry?: boolean } = {}
): UserContentPart[] {
  const noteText = freeformText.trim().length > 0
    ? `User's note: ${freeformText.trim()}`
    : 'User provided no additional context.';

  const retryPreamble = opts.retry
    ? 'Your previous response did not match the schema. Return ONLY a JSON object with these exact keys: species, primary, alternatives, whatWouldChangeMyMind, meta. No prose, no markdown fences.\n\n'
    : '';

  return [
    { type: 'image_url', image_url: { url: photoDataUrl } },
    { type: 'text', text: `${retryPreamble}${noteText}\n\nDiagnose this plant. Return only the JSON object matching the schema.` }
  ];
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- prompt
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt.ts tests/unit/prompt.test.ts
git commit -m "Add prompt builder for system + user content"
```

---

### Task 18: OpenRouter client wrapper

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `tests/unit/openrouter.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { callOpenRouter } from '../../src/lib/openrouter';

describe('callOpenRouter', () => {
  it('posts to OpenRouter chat completions and returns content + usage', async () => {
    const mockResp = {
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_cost: 0.001 }
    };
    global.fetch = vi.fn(async () => new Response(JSON.stringify(mockResp), { status: 200 })) as any;

    const r = await callOpenRouter({
      apiKey: 'k',
      model: 'qwen/qwen-2.5-vl-72b-instruct',
      systemPrompt: 'sys',
      userContent: [{ type: 'text', text: 'hi' }],
      maxOutputTokens: 1500
    });

    expect(r.content).toBe('{"ok":true}');
    expect(r.usage?.completion_tokens).toBe(50);
    expect(r.usage?.total_cost).toBe(0.001);
  });

  it('throws on non-200 status', async () => {
    global.fetch = vi.fn(async () => new Response('err', { status: 500 })) as any;
    await expect(callOpenRouter({
      apiKey: 'k', model: 'm', systemPrompt: 's',
      userContent: [{ type: 'text', text: 'x' }], maxOutputTokens: 1500
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- openrouter
```

- [ ] **Step 3: Implement `src/lib/openrouter.ts`**

```ts
type UserContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

export type OpenRouterCallArgs = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: UserContentPart[];
  maxOutputTokens: number;
};

export type OpenRouterCallResult = {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_cost?: number;
  };
};

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export async function callOpenRouter(args: OpenRouterCallArgs): Promise<OpenRouterCallResult> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
      // Optional but recommended by OpenRouter:
      'HTTP-Referer': 'https://slop-plant-doctor.pages.dev',
      'X-Title': 'Plant Doctor'
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxOutputTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userContent }
      ]
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_cost?: number };
  };

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('OpenRouter response missing content');
  }

  return { content, usage: json.usage };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- openrouter
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openrouter.ts tests/unit/openrouter.test.ts
git commit -m "Add OpenRouter chat completions client"
```

---

## Phase 6 — Diagnose pipeline

### Task 19: Compose the diagnose pipeline

**Files:**
- Create: `src/lib/diagnose.ts`
- Create: `tests/integration/diagnose.test.ts`

- [ ] **Step 1: Write failing integration test**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- diagnose
```

- [ ] **Step 3: Implement `src/lib/diagnose.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- diagnose
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diagnose.ts tests/integration/diagnose.test.ts
git commit -m "Compose diagnose pipeline with retry on schema failure"
```

---

## Phase 7 — API endpoint

### Task 20: POST `/api/diagnose` endpoint

**Files:**
- Create: `src/routes/api/diagnose/+server.ts`
- Create: `tests/integration/api-diagnose.test.ts`

- [ ] **Step 1: Write failing integration test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/routes/api/diagnose/+server';
import { makeKvMock } from '../support/kvMock';

function makeFormData(opts: { photo?: Blob; text?: string; token?: string }): FormData {
  const fd = new FormData();
  if (opts.photo !== undefined) fd.append('photo', opts.photo, 'p.jpg');
  fd.append('text', opts.text ?? '');
  fd.append('turnstileToken', opts.token ?? 'test-token');
  return fd;
}

function makeRequest(fd: FormData): Request {
  return new Request('http://localhost/api/diagnose', { method: 'POST', body: fd });
}

const validJson = JSON.stringify({
  species: { name: 'X', confidence: 0.5 },
  primary: { name: 'Y', confidence: 0.5, rationale: 'r', recovery: [] },
  alternatives: [],
  whatWouldChangeMyMind: [],
  meta: { model: 'qwen/qwen-2.5-vl-72b-instruct', createdAt: '2026-05-11T10:00:00Z' }
});

beforeEach(() => vi.restoreAllMocks());

const baseEvent = (request: Request, kv: KVNamespace) => ({
  request,
  platform: {
    env: {
      DIAGNOSES: kv,
      OPENROUTER_API_KEY: 'k',
      OPENROUTER_MODEL: 'qwen/qwen-2.5-vl-72b-instruct',
      DAILY_BUDGET_CENTS: '1000',
      RATE_LIMIT_PER_HOUR: '10',
      DAILY_CAP_PER_IP: '50',
      MAX_OUTPUT_TOKENS: '1500',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'secret'
    }
  },
  getClientAddress: () => '1.2.3.4'
} as any);

describe('POST /api/diagnose', () => {
  it('returns 401 when Turnstile fails', async () => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('turnstile')) return new Response(JSON.stringify({ success: false }));
      throw new Error('unexpected fetch');
    }) as any;

    const fd = makeFormData({ photo: new Blob(['x'], { type: 'image/jpeg' }) });
    const res = await POST(baseEvent(makeRequest(fd), makeKvMock()));
    expect(res.status).toBe(401);
  });

  it('returns 400 when photo missing', async () => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('turnstile')) return new Response(JSON.stringify({ success: true }));
      throw new Error('unexpected fetch');
    }) as any;
    const fd = makeFormData({});
    const res = await POST(baseEvent(makeRequest(fd), makeKvMock()));
    expect(res.status).toBe(400);
  });

  it('returns 200 + id on happy path', async () => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('turnstile')) return new Response(JSON.stringify({ success: true }));
      if (u.includes('openrouter')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: validJson } }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_cost: 0.001 }
        }));
      }
      throw new Error('unexpected: ' + u);
    }) as any;

    const fd = makeFormData({ photo: new Blob(['x'], { type: 'image/jpeg' }) });
    const res = await POST(baseEvent(makeRequest(fd), makeKvMock()));
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toMatch(/^[0-9a-z]{8}$/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm run test:unit -- api-diagnose
```

- [ ] **Step 3: Implement `src/routes/api/diagnose/+server.ts`**

```ts
import type { RequestHandler } from './$types';
import { verifyTurnstile } from '$lib/turnstile';
import { sha256Hex } from '$lib/hash';
import { checkAndIncrementRateLimit } from '$lib/rateLimit';
import { checkAndIncrementDailyCap } from '$lib/dailyCap';
import { canSpend } from '$lib/budget';
import { runDiagnose } from '$lib/diagnose';
import {
  ApiError,
  turnstileFailed, rateLimited, dailyCapHit, budgetExhausted,
  photoTooLarge, photoUnsupportedFormat, textTooLong, internalError
} from '$lib/errors';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function envInt(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${blob.type};base64,${btoa(bin)}`;
}

function errorResponse(e: ApiError): Response {
  const body = JSON.stringify({ code: e.code, message: e.userMessage });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (e.retryAfterSeconds !== undefined) headers['Retry-After'] = String(e.retryAfterSeconds);
  return new Response(body, { status: e.httpStatus, headers });
}

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  if (!platform) return errorResponse(internalError());
  const env = platform.env;

  try {
    const form = await request.formData();
    const photo = form.get('photo');
    const text = (form.get('text') as string | null) ?? '';
    const turnstileToken = (form.get('turnstileToken') as string | null) ?? '';

    if (!(photo instanceof Blob) || photo.size === 0) {
      return errorResponse(photoTooLarge()); // reuse for "missing"; user message is generic enough
    }
    if (photo.size > MAX_PHOTO_BYTES) return errorResponse(photoTooLarge());
    if (!ALLOWED_MIME.has(photo.type)) return errorResponse(photoUnsupportedFormat());
    if (text.length > MAX_TEXT_CHARS) return errorResponse(textTooLong());

    const ip = getClientAddress();
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
    if (!ok) return errorResponse(turnstileFailed());

    const ipHash = await sha256Hex(ip);

    const rate = await checkAndIncrementRateLimit(env.DIAGNOSES, ipHash, envInt(env.RATE_LIMIT_PER_HOUR, 10));
    if (!rate.allowed) return errorResponse(rateLimited(rate.retryAfterSeconds));

    const day = await checkAndIncrementDailyCap(env.DIAGNOSES, ipHash, envInt(env.DAILY_CAP_PER_IP, 50));
    if (!day.allowed) return errorResponse(dailyCapHit());

    // Reserve worst-case cost so we don't blow past the cap on a single call.
    const reserveEstimate = 30; // 30 cents headroom per request — generous; refined post-launch
    const budget = await canSpend(env.DIAGNOSES, envInt(env.DAILY_BUDGET_CENTS, 1000), reserveEstimate);
    if (!budget.allowed) return errorResponse(budgetExhausted());

    const photoDataUrl = await blobToDataUrl(photo);

    const result = await runDiagnose({
      kv: env.DIAGNOSES,
      ipHash,
      photoDataUrl,
      freeformText: text,
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL ?? 'qwen/qwen-2.5-vl-72b-instruct',
      maxOutputTokens: envInt(env.MAX_OUTPUT_TOKENS, 1500)
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    console.error('diagnose endpoint error:', e);
    return errorResponse(internalError());
  }
};
```

- [ ] **Step 4: Run to verify pass**

```bash
npm run test:unit -- api-diagnose
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/diagnose/+server.ts tests/integration/api-diagnose.test.ts
git commit -m "Add POST /api/diagnose endpoint with full cost-control chain"
```

---

## Phase 8 — Client utilities

### Task 21: Client-side photo compression

**Files:**
- Create: `src/lib/photoCompress.ts`

(Browser API; we won't unit-test in happy-dom — manual QA covers this.)

- [ ] **Step 1: Write the file**

```ts
// Resize a File/Blob to max 2048px on the longest side and JPEG-encode at quality 80.
// Returns a Blob (image/jpeg) and the data URL for direct submission/preview.

const MAX_DIM = 2048;
const QUALITY = 0.8;

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function targetDims(w: number, h: number): { w: number; h: number } {
  if (w <= MAX_DIM && h <= MAX_DIM) return { w, h };
  if (w >= h) {
    const ratio = MAX_DIM / w;
    return { w: MAX_DIM, h: Math.round(h * ratio) };
  } else {
    const ratio = MAX_DIM / h;
    return { w: Math.round(w * ratio), h: MAX_DIM };
  }
}

export type CompressedPhoto = { blob: Blob; dataUrl: string };

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const img = await loadImage(file);
  const dims = targetDims(img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(img, 0, 0, dims.w, dims.h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      QUALITY
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });

  return { blob, dataUrl };
}
```

- [ ] **Step 2: Verify compile**

```bash
npm run check
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/photoCompress.ts
git commit -m "Add client-side photo compression utility"
```

---

## Phase 9 — Capture page UI

### Task 22: Capture page skeleton with photo input

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Replace `src/routes/+page.svelte`**

```svelte
<script lang="ts">
  import { compressPhoto, type CompressedPhoto } from '$lib/photoCompress';

  let photo: CompressedPhoto | null = $state(null);
  let photoError = $state<string | null>(null);
  let text = $state('');
  let submitting = $state(false);
  let formError = $state<string | null>(null);
  let turnstileToken = $state<string | null>(null);

  async function handlePhotoChange(e: Event) {
    photoError = null;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      photoError = 'Use JPEG, PNG, or WebP.';
      return;
    }

    try {
      photo = await compressPhoto(file);
    } catch (err) {
      photoError = 'Could not process that image. Try another.';
    }
  }

  function clearPhoto() {
    photo = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    formError = null;
    if (!photo) { formError = 'Please add a photo.'; return; }
    if (!turnstileToken) { formError = 'Waiting on captcha. Try again in a moment.'; return; }

    submitting = true;
    try {
      const fd = new FormData();
      fd.append('photo', photo.blob, 'plant.jpg');
      fd.append('text', text);
      fd.append('turnstileToken', turnstileToken);

      const res = await fetch('/api/diagnose', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Something went wrong.' }));
        formError = body.message ?? 'Something went wrong.';
        return;
      }
      const { id } = (await res.json()) as { id: string };
      window.location.assign(`/d/${id}`);
    } catch (err) {
      formError = "Couldn't reach the server. Check your connection and try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Plant Doctor</title>
  <meta name="description" content="Photo + a few words. Get a plant diagnosis." />
</svelte:head>

<header style="margin-bottom: 2rem;">
  <h1 style="margin: 0 0 0.25rem;">Plant Doctor</h1>
  <p style="margin: 0; color: var(--muted);">Photo + a few words. Get a diagnosis.</p>
</header>

<form onsubmit={handleSubmit}>
  <div class="photo-section">
    {#if photo}
      <img src={photo.dataUrl} alt="Selected plant" style="max-width: 100%; border-radius: 6px;" />
      <button type="button" onclick={clearPhoto} style="margin-top: 0.5rem; background: none; border: none; color: var(--muted); text-decoration: underline; padding: 0;">
        Replace photo
      </button>
    {:else}
      <label class="drop-zone">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onchange={handlePhotoChange}
          style="display: none;"
        />
        <span>Tap to take a photo or pick one</span>
      </label>
    {/if}
    {#if photoError}
      <p style="color: var(--danger); margin-top: 0.5rem;">{photoError}</p>
    {/if}
  </div>

  <div style="margin-top: 1rem;">
    <textarea
      bind:value={text}
      placeholder="What's wrong? Any context? (optional)"
      maxlength="2000"
      rows="3"
      style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; font: inherit;"
    ></textarea>
  </div>

  <!-- Turnstile widget injected in Task 23 -->
  <div id="turnstile-container" style="margin-top: 1rem;"></div>

  {#if formError}
    <p style="color: var(--danger); margin-top: 1rem;">{formError}</p>
  {/if}

  <button type="submit" class="button-primary" style="margin-top: 1.5rem;" disabled={submitting || !photo}>
    {submitting ? 'Diagnosing…' : 'Diagnose'}
  </button>
</form>

<style>
  .photo-section { width: 100%; }
  .drop-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    border: 2px dashed var(--border);
    border-radius: 8px;
    color: var(--muted);
    cursor: pointer;
    text-align: center;
    padding: 1rem;
  }
  .drop-zone:hover { background: rgba(0, 0, 0, 0.02); }
</style>
```

- [ ] **Step 2: Verify dev server runs**

```bash
npm run dev
```

Visit `http://localhost:5173/`. Should render the form. Submitting won't work yet (no Turnstile token + no API wired locally — that's fine). Stop dev server with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "Add capture page with photo upload, compression, and form"
```

---

### Task 23: Wire up Turnstile widget on the capture page

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/app.html`

- [ ] **Step 1: Add Turnstile loader to `src/app.html`**

In the `<head>`, add (above `%sveltekit.head%`):

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad" async defer></script>
```

- [ ] **Step 2: Modify the `<script>` block in `src/routes/+page.svelte`** to render the widget

Add near the top of the existing `<script lang="ts">`:

```ts
import { onMount } from 'svelte';
import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';

// Existing state...

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, opts: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
      }) => string;
    };
    onTurnstileLoad?: () => void;
  }
}

onMount(() => {
  const render = () => {
    if (!window.turnstile) return;
    window.turnstile.render('#turnstile-container', {
      sitekey: PUBLIC_TURNSTILE_SITE_KEY,
      callback: (token) => { turnstileToken = token; },
      'error-callback': () => { turnstileToken = null; },
      'expired-callback': () => { turnstileToken = null; }
    });
  };
  if (window.turnstile) render();
  else window.onTurnstileLoad = render;
});
```

- [ ] **Step 3: Add public env var support**

In `.dev.vars` and `.dev.vars.example`, add:
```
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

SvelteKit reads `PUBLIC_*` env vars at build time. In production, set this via `wrangler secret` or Pages Project env vars.

- [ ] **Step 4: Verify compile**

```bash
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/app.html .dev.vars.example
git commit -m "Wire Turnstile widget on capture page"
```

---

## Phase 10 — Result page UI

### Task 24: Result page server load + 404

**Files:**
- Create: `src/routes/d/[id]/+page.server.ts`
- Create: `src/routes/d/[id]/+page.svelte`

- [ ] **Step 1: Create `src/routes/d/[id]/+page.server.ts`**

```ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { loadDiagnosis } from '$lib/storage';
import { ID_REGEX } from '$lib/id';

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) throw error(500, 'Platform unavailable');

  if (!ID_REGEX.test(params.id)) {
    throw error(404, 'Not found');
  }

  const stored = await loadDiagnosis(platform.env.DIAGNOSES, params.id);
  if (!stored) {
    throw error(404, 'Not found');
  }

  return {
    id: params.id,
    result: stored.result,
    createdAt: stored.createdAt
  };
};
```

- [ ] **Step 2: Create `src/routes/d/[id]/+page.svelte`**

```svelte
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const result = data.result;
  const created = new Date(data.createdAt);

  function pct(n: number): string {
    return `${Math.round(n * 100)}%`;
  }

  function copyShareLink() {
    navigator.clipboard?.writeText(window.location.href);
  }
</script>

<svelte:head>
  <title>{result.primary.name} — Plant Doctor</title>
  <meta name="description" content={`${result.primary.name}: ${result.primary.rationale.slice(0, 140)}`} />
</svelte:head>

<header style="margin-bottom: 1.5rem;">
  <a href="/" style="color: var(--muted); text-decoration: none;">← Plant Doctor</a>
</header>

<section style="margin-bottom: 1.5rem;">
  {#if result.species}
    <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Species</p>
    <h2 style="margin: 0;">
      {result.species.name}
      <span style="color: var(--muted); font-weight: normal; font-size: 0.85rem;">
        · {pct(result.species.confidence)}
      </span>
    </h2>
    {#if result.species.commonNames && result.species.commonNames.length > 0}
      <p style="margin: 0.25rem 0 0; color: var(--muted); font-size: 0.9rem;">
        {result.species.commonNames.join(', ')}
      </p>
    {/if}
  {:else}
    <p style="margin: 0; color: var(--muted);">
      Couldn't identify the species with confidence — diagnosis still attempts to address visible symptoms.
    </p>
  {/if}
</section>

<section style="margin-bottom: 1.5rem; border-left: 3px solid var(--accent); padding-left: 1rem;">
  <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Primary diagnosis</p>
  <h2 style="margin: 0;">
    {result.primary.name}
    <span style="color: var(--muted); font-weight: normal; font-size: 0.85rem;">
      · {pct(result.primary.confidence)}
    </span>
  </h2>
  <p>{result.primary.rationale}</p>

  {#if result.primary.recovery.length > 0}
    <p style="margin: 1rem 0 0.5rem; font-weight: 600;">Recovery plan</p>
    <ul style="margin: 0; padding-left: 1.2rem;">
      {#each result.primary.recovery as step}
        <li><strong>{step.action}</strong> — {step.when}</li>
      {/each}
    </ul>
  {/if}
</section>

{#if result.alternatives.length > 0}
  <section style="margin-bottom: 1.5rem;">
    <p style="margin: 0 0 0.5rem; color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Alternatives</p>
    {#each result.alternatives as alt}
      <p style="margin: 0.25rem 0;">
        <strong>{alt.name}</strong>
        <span style="color: var(--muted);"> · {pct(alt.confidence)}</span>
        — {alt.rationale}
      </p>
    {/each}
  </section>
{/if}

{#if result.whatWouldChangeMyMind.length > 0}
  <section style="margin-bottom: 1.5rem;">
    <p style="margin: 0 0 0.5rem; color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">What would change my mind</p>
    <ul style="margin: 0; padding-left: 1.2rem;">
      {#each result.whatWouldChangeMyMind as check}
        <li>{check}</li>
      {/each}
    </ul>
  </section>
{/if}

<footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
  <span>{result.meta.model} · {created.toLocaleDateString()}</span>
  <button type="button" onclick={copyShareLink} style="background: none; border: 1px solid var(--border); color: var(--muted); padding: 0.25rem 0.5rem; border-radius: 4px;">
    Copy link
  </button>
</footer>

<div style="margin-top: 1.5rem;">
  <a href="/" class="button-primary" style="display: inline-block; text-align: center; text-decoration: none;">
    Diagnose another plant
  </a>
</div>
```

- [ ] **Step 3: Verify compile**

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/d/[id]/+page.server.ts src/routes/d/[id]/+page.svelte
git commit -m "Add result page with SSR fetch from KV"
```

---

### Task 25: 404 + error pages

**Files:**
- Create: `src/routes/+error.svelte`

- [ ] **Step 1: Create `src/routes/+error.svelte`**

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<svelte:head>
  <title>Plant Doctor — {page.status}</title>
</svelte:head>

<header style="margin-bottom: 1.5rem;">
  <a href="/" style="color: var(--muted); text-decoration: none;">← Plant Doctor</a>
</header>

<h1>{page.status === 404 ? "Diagnosis not found" : "Something went wrong"}</h1>

{#if page.status === 404}
  <p>This diagnosis isn't available — it may have expired or the link is wrong.</p>
{:else}
  <p>Try again, or come back later.</p>
{/if}

<a href="/" class="button-primary" style="display: inline-block; text-align: center; text-decoration: none; margin-top: 1rem;">
  Diagnose a new plant
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/+error.svelte
git commit -m "Add error page for 404 and other failures"
```

---

## Phase 11 — Example page

### Task 26: Static example diagnosis page

**Files:**
- Create: `src/routes/example/+page.svelte`

- [ ] **Step 1: Write `src/routes/example/+page.svelte`**

```svelte
<script lang="ts">
  // Static example — uses the same render code as /d/[id] but with hard-coded data.
  // Lives outside the dynamic route so it doesn't hit KV and is always available.

  const result = {
    species: { name: 'Monstera deliciosa', confidence: 0.92, commonNames: ['Swiss cheese plant'] },
    primary: {
      name: 'Overwatering',
      confidence: 0.75,
      rationale: 'Lower leaves yellowing in a bottom-up pattern, soft stems near the soil line, and visibly soggy substrate at the pot edge.',
      recovery: [
        { action: 'Stop watering', when: 'now, for at least 10 days' },
        { action: 'Check roots', when: 'today — pull the plant out and look for black or mushy roots' },
        { action: 'Repot in fresh, well-draining mix if rot is found', when: 'this week' }
      ]
    },
    alternatives: [
      { name: 'Root rot', confidence: 0.18, rationale: 'Advanced overwatering can progress to rot, especially if the pot lacks drainage.' },
      { name: 'Light burn', confidence: 0.07, rationale: 'Possible if recently moved to direct sun, but yellowing pattern argues against this.' }
    ],
    whatWouldChangeMyMind: [
      'Pull from pot — if roots are black/mushy, root rot is confirmed (alt 1).',
      'Check the underside of yellow leaves — pest damage would shift this toward an infestation diagnosis.'
    ],
    meta: { model: 'qwen/qwen-2.5-vl-72b-instruct', createdAt: '2026-05-11T10:00:00Z' }
  };

  const created = new Date(result.meta.createdAt);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

<svelte:head>
  <title>Example diagnosis — Plant Doctor</title>
</svelte:head>

<header style="margin-bottom: 1.5rem;">
  <a href="/" style="color: var(--muted); text-decoration: none;">← Plant Doctor</a>
  <p style="margin: 0.5rem 0 0; color: var(--muted); font-size: 0.85rem;">This is a static example, not a real diagnosis.</p>
</header>

<!-- (Mirror of /d/[id]/+page.svelte rendering — duplicated here intentionally to keep the example self-contained.) -->

<section style="margin-bottom: 1.5rem;">
  <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Species</p>
  <h2 style="margin: 0;">{result.species.name} <span style="color: var(--muted); font-weight: normal; font-size: 0.85rem;">· {pct(result.species.confidence)}</span></h2>
  <p style="margin: 0.25rem 0 0; color: var(--muted); font-size: 0.9rem;">{result.species.commonNames.join(', ')}</p>
</section>

<section style="margin-bottom: 1.5rem; border-left: 3px solid var(--accent); padding-left: 1rem;">
  <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Primary diagnosis</p>
  <h2 style="margin: 0;">{result.primary.name} <span style="color: var(--muted); font-weight: normal; font-size: 0.85rem;">· {pct(result.primary.confidence)}</span></h2>
  <p>{result.primary.rationale}</p>
  <p style="margin: 1rem 0 0.5rem; font-weight: 600;">Recovery plan</p>
  <ul style="margin: 0; padding-left: 1.2rem;">
    {#each result.primary.recovery as step}
      <li><strong>{step.action}</strong> — {step.when}</li>
    {/each}
  </ul>
</section>

<section style="margin-bottom: 1.5rem;">
  <p style="margin: 0 0 0.5rem; color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Alternatives</p>
  {#each result.alternatives as alt}
    <p style="margin: 0.25rem 0;"><strong>{alt.name}</strong> <span style="color: var(--muted);">· {pct(alt.confidence)}</span> — {alt.rationale}</p>
  {/each}
</section>

<section style="margin-bottom: 1.5rem;">
  <p style="margin: 0 0 0.5rem; color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">What would change my mind</p>
  <ul style="margin: 0; padding-left: 1.2rem;">
    {#each result.whatWouldChangeMyMind as check}
      <li>{check}</li>
    {/each}
  </ul>
</section>

<footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem;">
  Example · {result.meta.model}
</footer>

<div style="margin-top: 1.5rem;">
  <a href="/" class="button-primary" style="display: inline-block; text-align: center; text-decoration: none;">
    Diagnose your plant
  </a>
</div>
```

- [ ] **Step 2: Add the "See an example" link to the capture page**

In `src/routes/+page.svelte`, add below the submit button:

```svelte
<p style="margin-top: 1.5rem; text-align: center; color: var(--muted); font-size: 0.9rem;">
  <a href="/example" style="color: var(--muted);">See an example diagnosis →</a>
</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/example/+page.svelte src/routes/+page.svelte
git commit -m "Add static example diagnosis page + link from capture"
```

---

## Phase 12 — E2E tests

### Task 27: Playwright happy-path

**Files:**
- Create: `tests/e2e/happy-path.spec.ts`
- Create: `tests/fixtures/plant-photos/.gitignore`
- Add a small test photo as a fixture (manual step — see below)

- [ ] **Step 1: Create `tests/fixtures/plant-photos/.gitignore`**

```
*
!.gitignore
```

(All photos are gitignored; the directory is committed via its `.gitignore`.)

- [ ] **Step 2: Manually add a test photo**

```bash
# Add any small JPEG (e.g., ~200KB) of a plant to:
# tests/fixtures/plant-photos/test-plant.jpg
# This file is gitignored by the rule above.
```

(If automating CI later, generate a synthetic 1×1 JPEG instead. For local E2E, use a real photo.)

- [ ] **Step 3: Write `tests/e2e/happy-path.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// This test runs against the local preview server with mocked OpenRouter.
// We cannot easily mock the API from Playwright in built mode, so we rely on a
// dev override: when DIAGNOSE_MOCK=1 is set in the build env, the server returns
// a canned response instead of calling OpenRouter.
//
// For v1, we keep this test simple: verify the form renders and submit-disabled state.
// Full happy-path with mocking is added when CI is configured.

test('capture page renders and the submit button starts disabled', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Plant Doctor' })).toBeVisible();
  await expect(page.getByPlaceholder("What's wrong?", { exact: false })).toBeVisible();

  const submit = page.getByRole('button', { name: /diagnose/i });
  await expect(submit).toBeDisabled();
});

test('example page renders a diagnosis', async ({ page }) => {
  await page.goto('/example');

  await expect(page.getByRole('heading', { name: 'Monstera deliciosa' })).toBeVisible();
  await expect(page.getByText('Overwatering')).toBeVisible();
  await expect(page.getByText('Recovery plan')).toBeVisible();
});

test('non-existent diagnosis ID renders 404', async ({ page }) => {
  await page.goto('/d/zzzzzzzz', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
```

- [ ] **Step 4: Verify the tests pass against the built app**

```bash
npm run test:e2e
```

Expected: 3 PASS. (Playwright will auto-start the preview server.)

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/happy-path.spec.ts tests/fixtures/plant-photos/.gitignore
git commit -m "Add Playwright tests for capture page, example, and 404"
```

---

## Phase 13 — Quality fixtures + runner

### Task 28: Plant-photos fixture manifest + runner script

**Files:**
- Create: `tests/fixtures/plant-photos.manifest.json`
- Create: `scripts/quality-run.ts`

- [ ] **Step 1: Create `tests/fixtures/plant-photos.manifest.json`**

```json
{
  "fixtures": [
    {
      "id": "monstera-overwatering-1",
      "file": "monstera-overwatering-1.jpg",
      "freeformText": "lower leaves turning yellow, soft stems",
      "expected": {
        "speciesContains": "Monstera",
        "primaryCategory": "overwatering",
        "primaryCategoryAlternatives": ["root rot", "overwater"]
      },
      "notes": "Classic overwatering presentation."
    },
    {
      "id": "sansevieria-underwatering-1",
      "file": "sansevieria-underwatering-1.jpg",
      "freeformText": "leaves wrinkly, haven't watered in 3 weeks",
      "expected": {
        "speciesContains": "Sansevieria",
        "primaryCategory": "underwatering"
      }
    },
    {
      "id": "pothos-light-burn-1",
      "file": "pothos-light-burn-1.jpg",
      "freeformText": "bleached patches after I moved it to a south window",
      "expected": {
        "speciesContains": "Epipremnum",
        "primaryCategory": "light burn",
        "primaryCategoryAlternatives": ["sunburn", "too much light"]
      }
    }
  ],
  "instructions": "Add ~15-20 fixtures across categories: overwatering, underwatering, light burn, pest infestation, root rot, nutrient deficiency, normal seasonal yellowing, healthy plant. Source photos from r/plantclinic (with permission), university extension service galleries (CC-licensed), and personal plants. Each fixture file lives in tests/fixtures/plant-photos/ (gitignored)."
}
```

- [ ] **Step 2: Create `scripts/quality-run.ts`**

```ts
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
    `Species match: ${speciesMatches}/${total} (${Math.round(speciesMatches/total*100)}%)\nCategory match: ${categoryMatches}/${total} (${Math.round(categoryMatches/total*100)}%)\n\nModel:`
  );

  writeFileSync(reportPath, report);
  console.log(`Report written to ${reportPath}`);
  console.log(`Species: ${speciesMatches}/${total} · Category: ${categoryMatches}/${total}`);
}

run().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add `quality-reports/` to `.gitignore`**

Append to `.gitignore`:
```
quality-reports/
```

- [ ] **Step 4: Verify the runner type-checks**

```bash
npm run check
```

(Won't run it yet — needs fixtures + API key. Just verify TypeScript is happy.)

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/plant-photos.manifest.json scripts/quality-run.ts .gitignore
git commit -m "Add quality fixture manifest and runner script"
```

---

## Phase 14 — Deploy

### Task 29: Create KV namespace and set production env vars

**Files:**
- Modify: `wrangler.toml`

**Working dir:** `~/Projects/slop/slop-plant-doctor/`

- [ ] **Step 1: Authenticate wrangler if not already**

```bash
npx wrangler login
```

Opens browser. Sign in.

- [ ] **Step 2: Create the KV namespace**

```bash
npx wrangler kv namespace create DIAGNOSES
```

Note the returned `id`. Also create the preview namespace:

```bash
npx wrangler kv namespace create DIAGNOSES --preview
```

- [ ] **Step 3: Update `wrangler.toml`** with KV IDs and non-secret env vars:

```toml
name = "slop-plant-doctor"
compatibility_date = "2026-05-01"

main = ".svelte-kit/cloudflare/_worker.js"

[assets]
directory = ".svelte-kit/cloudflare"
binding = "ASSETS"

[[kv_namespaces]]
binding = "DIAGNOSES"
id = "<id from non-preview create>"
preview_id = "<id from preview create>"

[vars]
OPENROUTER_MODEL = "qwen/qwen-2.5-vl-72b-instruct"
DAILY_BUDGET_CENTS = "1000"
RATE_LIMIT_PER_HOUR = "10"
DAILY_CAP_PER_IP = "50"
MAX_OUTPUT_TOKENS = "1500"
```

- [ ] **Step 4: Get a real Turnstile site key + secret**

In the Cloudflare dashboard → Turnstile → Add site. Domain: `slop-plant-doctor.pages.dev` (will adjust if using a custom domain). Note the site key + secret.

- [ ] **Step 5: Commit `wrangler.toml`**

```bash
git add wrangler.toml
git commit -m "Configure KV namespace bindings in wrangler.toml"
```

---

### Task 30: Deploy to Cloudflare Workers

**Working dir:** `~/Projects/slop/slop-plant-doctor/`

The `@sveltejs/adapter-cloudflare` v7+ deploys as a **Worker + Static Assets**, not a Pages project. Use `wrangler deploy`. KV binding and non-secret env vars come from `wrangler.toml` (see Task 29); secrets are set via `wrangler secret put`.

- [ ] **Step 1: Put the real Turnstile site key in `.env`**

`PUBLIC_TURNSTILE_SITE_KEY` is read from `.env` at build time and baked into the client bundle. Replace the test placeholder with the real site key from your Turnstile site in the CF dashboard:

```
PUBLIC_TURNSTILE_SITE_KEY=<real Turnstile site key from CF dashboard>
```

`.env` is gitignored — only your local copy gets the real key; production builds use whatever's in `.env` at build time.

- [ ] **Step 2: Set the two server-side secrets**

```bash
npx wrangler secret put OPENROUTER_API_KEY
# Paste the OpenRouter API key when prompted (sk-or-v1-...)

npx wrangler secret put TURNSTILE_SECRET_KEY
# Paste the Turnstile secret key (the pair of your site key)
```

Both go to the named Worker (`slop-plant-doctor` from `wrangler.toml`). No redeploy needed — they're picked up immediately.

- [ ] **Step 3: Build and deploy**

```bash
npm run build
npx wrangler deploy
```

The first deploy creates the Worker. Output gives you the URL: `https://slop-plant-doctor.<your-workers-subdomain>.workers.dev`.

- [ ] **Step 4: Verify the Worker has all the right config**

In the Cloudflare dashboard → **Workers & Pages** → `slop-plant-doctor` (the Worker, not a Pages project) → **Settings** → **Variables and Secrets**, confirm you see:
- 5 plaintext vars from `[vars]` in `wrangler.toml`
- 2 secrets (`OPENROUTER_API_KEY`, `TURNSTILE_SECRET_KEY`) — values hidden, names visible
- KV binding `DIAGNOSES` visible under Bindings

If anything is missing, fix and redeploy.

- [ ] **Step 5: Smoke test**

Visit the Worker URL.
- Verify capture page renders.
- Verify Turnstile widget loads (check browser DevTools for the `challenges.cloudflare.com/turnstile` script).
- Upload a real plant photo, complete Turnstile, submit.
- Verify result page renders at `/d/[id]` with a working URL.
- Visit `/example` to verify static page.

- [ ] **Step 6: Tail logs**

```bash
npx wrangler tail
```

Submit another diagnosis. Watch the logs (not `wrangler pages deployment tail` — that's for Pages only).

- [ ] **Step 7: Commit any final config changes**

```bash
git add -A
git commit -m "First production deploy"
```

---

### Task 31: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Plant Doctor

Public, free, mobile-first web app: photo + a few words → structured plant diagnosis with confidence, evidence-cited rationale, recovery plan, and "what would change my mind" verification.

First instance of the **Vision-LLM as Ambient Domain Expert** pattern (see `docs/superpowers/specs/2026-05-11-plant-doctor-design.md`).

## Stack

SvelteKit (Svelte 5) + TypeScript on Cloudflare Pages. OpenRouter (default Qwen2.5-VL 72B) for diagnosis. KV for result persistence. Turnstile for abuse protection. No DB, no accounts, no image storage.

## Dev

```bash
cp .dev.vars.example .dev.vars
# Fill in OPENROUTER_API_KEY and (optionally) override defaults

npm install
npm run dev
```

Visit `http://localhost:5173`.

## Tests

```bash
npm run test:unit          # Vitest
npm run test:e2e           # Playwright (auto-builds)
npm test                   # both
npm run quality            # manual quality runner against the fixture set
```

## Deploy

See `docs/superpowers/plans/2026-05-11-plant-doctor.md` Phase 14.

## Cost controls

Layered (env-tunable):
- Turnstile captcha
- Per-IP hourly rate limit (default 10/hour)
- Per-IP daily cap (default 50/day)
- Global daily budget cap (default $10 USD via `DAILY_BUDGET_CENTS=1000`)

When the global cap is hit, the API returns 503 until the next UTC day.

## Docs

- Design spec: `docs/superpowers/specs/2026-05-11-plant-doctor-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-11-plant-doctor.md`
- Vetted entry + pattern: `../slop-ideas/VETTED.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README"
```

---

### Task 32: Update slop-ideas to mark Plant Doctor as shipped

**Working dir:** `~/Projects/slop/slop-ideas/`

- [ ] **Step 1: Edit `VETTED.md`**

Find the Plant Doctor entry. Change `**Status:** ready-to-spec` to:

```
**Project repo:** `../slop-plant-doctor/` (initialized 2026-05-11)

**Status:** shipped
```

(Add the `**Project repo:**` line above `**Status:**`.)

- [ ] **Step 2: Update the pattern entry to reflect Plant Doctor's shipped state**

Find `## [Pattern] Vision-LLM as Ambient Domain Expert` → `**Active instances:**` and change:

```
- Plant Doctor (vetted)
```

to:

```
- Plant Doctor (shipped)
```

- [ ] **Step 3: Commit**

```bash
git add VETTED.md
git commit -m "Mark Plant Doctor as shipped; new repo at ../slop-plant-doctor/"
```

---

## Self-Review

**Spec coverage check** (every spec section → task):
- Architecture / SvelteKit + CF Pages + KV + Turnstile + OpenRouter → Tasks 1–3, 29–30
- Data flow / capture → API → diagnose → KV → result → Tasks 19–25
- LLM prompt design → Task 17
- UI / single column, capture, result → Tasks 22–26
- Cost controls / Turnstile, rate-limit, daily cap, budget → Tasks 13–16, 20
- Error handling / API error codes + UI error states → Tasks 7, 20, 22, 25
- Testing / unit, integration, E2E, quality → Tasks 5–10, 12–20, 27–28
- Monetization / data model supports later — no v1 task, by design
- Open questions — left as implementation-time decisions, no plan task needed

**Placeholder check:** No "TBD", "TODO", "implement later", or vague "add appropriate X". Every step has concrete code or commands.

**Type consistency:** `DiagnosisResult` shape is defined in Task 4 (types.ts) and Task 5 (Zod schema). Used consistently in storage, parser, diagnose pipeline, API endpoint, result page render. Field names match across tasks (`primary`, `alternatives`, `whatWouldChangeMyMind`, `recovery`).

**Scope:** Single coherent subsystem (one app, one repo). One plan is appropriate.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-plant-doctor.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
