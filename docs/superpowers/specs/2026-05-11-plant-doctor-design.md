# Plant Doctor v1 Design

**Date:** 2026-05-11
**Status:** Brainstorming → ready for writing-plans
**Project repo (planned):** `../slop-plant-doctor/` (not yet bootstrapped)
**Vetted entry:** `VETTED.md` → Plant Doctor
**Follows pattern:** Vision-LLM as Ambient Domain Expert

## Summary

Plant Doctor is a public, free, mobile-first web app that takes a photo of a struggling plant plus optional freeform text and returns a structured diagnosis: species ID, primary diagnosis with confidence and evidence-cited rationale, 1–2 alternative diagnoses, concrete recovery plan, and "what would change my mind" verification steps.

v1 ships as a stateless single-page flow with server-side result persistence so diagnoses get shareable `/d/[id]` URLs. No accounts, no DB, no image storage. The LLM call routes through OpenRouter with Qwen2.5-VL 72B as the default model. Cost is bounded by a layered defense (Turnstile + IP rate limit + per-IP daily cap + global daily budget cap, all env-tunable).

The goal of v1 is to validate the Vision-LLM as Ambient Domain Expert pattern on the lowest-stakes vertical before tackling higher-WTP siblings (Appliance Troubleshooter, Antiques Appraiser, etc.).

## Context

Plant Doctor is the first instance of the Vision-LLM as Ambient Domain Expert pattern (see `VETTED.md`). The pattern bet: vision-LLMs combined with calibrated reasoning + actionable next-step output close the "expert-in-your-pocket" gap that classical CV ID apps (PictureThis, iNaturalist, Picture Insect) intentionally leave open.

Plant Doctor was picked as the first build because:
- Shortest effort estimate (3–5 weeks)
- Open reference data ready (iNaturalist, GBIF, university extension service publications) — though v1 will skip reference data and lean on the LLM alone
- Dogfooding is trivial — every household has a struggling plant
- Lowest stakes: wrong diagnosis costs a $20 plant, not a $500 service call or a missed antique
- Differentiation from PictureThis is clear (diagnosis with reasoning, not just ID)

## Scope

**In scope for v1:**
- Public, shareable web app at a single domain
- Photo upload (camera input on mobile, drag/drop/paste/file picker on desktop)
- Optional freeform text input
- Diagnosis via Vision-LLM (OpenRouter, default Qwen2.5-VL 72B)
- Structured result with species, primary diagnosis, alternatives, recovery plan, "what would change my mind"
- Sharable result URLs (`/d/[id]`, 90-day KV TTL)
- Layered cost controls
- Mobile-first responsive UI, single column, ~700px max width
- Quality-test fixture set (~15–20 photos with expected diagnoses)

**Out of scope for v1 (deferred to v2+):**
- Accounts, auth, payments
- Plant memory / per-plant journal
- Cloud-synced plant history
- Affiliate-link integration (data model supports; UI doesn't render yet)
- Curated horticultural reference data (RAG over extension publications)
- Multiple LLM consensus / cross-model verification
- BYOK (Bring Your Own Key)
- Native mobile app
- Email/notification reminders
- **i18n** — UI is hardcoded English; system prompt is English. Qwen2.5-VL incidentally responds in user's input language when given non-English freeform text, but this is not designed behavior. v2 should extract UI strings, detect browser locale (with manual override), send `lang` parameter to API, and have the system prompt instruct the model to respond in that language.

## Architecture

### Components

1. **SvelteKit frontend**
   - `/` — capture page (single page, no router complexity)
   - `/d/[id]` — result page (SSR'd so the diagnosis is in the initial HTML)
   - `/example` — static demo result (optional, for "see an example" link)
   - About / legal pages as needed

2. **Worker API routes** (Cloudflare Workers + Static Assets via `@sveltejs/adapter-cloudflare`)
   - `POST /api/diagnose` — multipart accept: photo + text + Turnstile token; returns `{ id, result }`
   - Result reads happen via SvelteKit `+page.server.ts` directly hitting KV (SSR); no separate GET endpoint needed for v1

3. **Cloudflare KV (single namespace `DIAGNOSES`)**
   - Diagnosis results, 90-day TTL
   - Rate-limit counters, short TTLs
   - Daily budget counter, ~48h TTL

4. **OpenRouter**
   - Default model: `qwen/qwen-2.5-vl-72b-instruct`
   - Configurable via `OPENROUTER_MODEL` env var
   - OpenAI-compatible API, single client

5. **Cloudflare Turnstile**
   - Site key on capture form
   - Server-side token verification before any LLM call

### What's deliberately not here

- **No DB.** No D1, no R2 for app data. KV covers v1 needs.
- **No accounts.** No auth provider, no user table.
- **No persisted photos by default.** The full-resolution photo is sent to OpenRouter in the API call and dropped immediately after the response returns. (Open question: whether to store a small ~512px thumbnail alongside the result for shared-link context — see Open Questions.)

### Unit boundaries

- **Frontend** renders against a typed `DiagnosisResult` shape. Can be developed/tested against a stub of the API.
- **LLM module** is one function: `diagnose(photoBytes, userText) → DiagnosisResult`. Testable with recorded fixtures.
- **Storage module** is `{ save(result) → id, load(id) → result | null }`. Testable against a KV mock.
- **Cost-control module** wraps the LLM call. Testable with mocked KV state.
- Each unit is replaceable without breaking consumers.

## Data Flow

### Capture flow

1. User selects a photo (mobile: rear camera via `capture="environment"`; desktop: file picker or drag-drop or paste)
2. Frontend compresses client-side: resize to max 2048px on longest side, JPEG quality 80, target <2MB
3. User adds optional freeform text (textarea, capped at 2000 chars)
4. Turnstile validates the request
5. Submit → `POST /api/diagnose` (multipart: photo + text + Turnstile token)

### Server-side `/api/diagnose`

1. Verify Turnstile token → 401 on failure
2. Per-IP hourly rate-limit check (sliding window, KV `rl:<sha256(ip)>:<hour>`, default 10/hour) → 429 on exceeded with `Retry-After`
3. Per-IP daily cap check (KV `daily:<sha256(ip)>:<date>`, default 50/day) → 429 on exceeded
4. Global daily budget check (KV `budget:<date>`, default `DAILY_BUDGET_CENTS=1000`) → 503 on exceeded
5. Build OpenRouter request: system prompt (diagnostic instructions + JSON schema) + photo (base64) + user text
6. Call OpenRouter with the configured model and `response_format: { type: "json_object" }`
7. Parse response: locate JSON object (strip markdown fences if present, ignore trailing prose); validate with Zod against `DiagnosisResult` schema
8. On schema validation failure: retry once with reinforced "return ONLY JSON matching this schema" instructions; on second failure return 500
9. Increment global daily budget counter by actual cost (from OpenRouter response usage info) or estimated cost (fallback)
10. Generate 8-char URL-safe nanoid; save `{ result, createdAt, model }` to `DIAGNOSES` KV with 90-day TTL
11. Return `{ id, result }` to the client

### Result flow

1. SvelteKit `+page.server.ts` fetches the result from KV server-side (SSR)
2. If KV returns null: render 404 page ("this diagnosis isn't available — may have expired or the link is wrong")
3. Render `DiagnosisResult` (see UI section)
4. "Diagnose another plant" CTA → `/`

### Data model

```ts
type DiagnosisResult = {
  species: {
    name: string             // scientific name (e.g. "Monstera deliciosa")
    confidence: number       // 0.0–1.0
    commonNames?: string[]   // e.g. ["Swiss cheese plant"]
  } | null                   // null if species couldn't be ID'd confidently

  primary: {
    name: string             // e.g. "Overwatering"
    confidence: number       // 0.0–1.0
    rationale: string        // must cite visible evidence
    recovery: RecoveryStep[]
  }

  alternatives: Array<{
    name: string
    confidence: number       // < primary.confidence
    rationale: string        // shorter than primary
  }>

  whatWouldChangeMyMind: string[]  // 1–3 cheap checks

  meta: {
    model: string            // the OpenRouter model identifier used
    createdAt: string        // ISO 8601
  }
}

type RecoveryStep = {
  action: string             // e.g. "stop watering"
  when: string               // e.g. "now, for 10 days"
}
```

### KV keys

| Key pattern | Value | TTL |
|---|---|---|
| `diag:<id>` | `DiagnosisResult` + metadata | 90 days |
| `rl:<sha256(ip)>:<hour>` | request count | 2 hours |
| `daily:<sha256(ip)>:<date>` | request count | 48 hours |
| `budget:<date>` | cents spent today | 48 hours |

## LLM Prompt Design

### System prompt (final wording iterated during build)

```
You are an expert horticulturist diagnosing plants from photos and
user-provided context. You combine plant pathology knowledge with
disciplined uncertainty.

You receive: one photo of a plant the user is concerned about, plus
optional freeform text describing what they're seeing.

Produce a JSON object matching this schema:
  <schema inline>

Rules:

1. Confidence is 0.0–1.0. Use it honestly. If species ID is uncertain,
   set `species` to null rather than guessing.

2. Every rationale must cite visible evidence from the photo (e.g.
   "yellowing is bottom-up and progresses inward", not generic
   descriptions).

3. Recovery steps must be concrete: specific action + specific timing
   ("stop watering for 10 days", not "water less often").

4. Provide 1–2 plausible alternative diagnoses with confidence below
   the primary, or [] if none.

5. `whatWouldChangeMyMind`: 1–3 cheap checks the user can do to
   confirm/refute the primary diagnosis.

6. Safety:
   - Never recommend toxic chemicals without an explicit warning and
     a non-toxic alternative.
   - Flag severe infestations that threaten nearby plants.
   - If the photo shows something outside scope (not a plant, beyond
     recovery, edible plant with food-safety implications), set
     fields appropriately and note it.

7. Tone: direct, no padding. Write for someone who wants to act.

8. Output ONLY the JSON object, no prose around it.
```

### User message structure

```
[image attachment]
"User's note: <freeform text>" OR "User provided no additional context."
"Diagnose this plant. Return only the JSON object matching the schema."
```

### Structured-output enforcement

- Request JSON mode via OpenRouter (`response_format: { type: "json_object" }` where supported)
- Server-side Zod validation against `DiagnosisResult` schema
- On failure: one retry with reinforced "return ONLY a JSON object with these exact keys: [...]" prefix
- On second failure: 500 with friendly user-facing message

### Model-specific quirks (handled in the parser)

- **Qwen2.5-VL** — generally clean JSON, but occasionally emits trailing prose after the closing brace. Parser locates the first balanced JSON object and ignores trailing content.
- **Gemini Flash** — wraps JSON in markdown code fences. Strip fences before parsing.
- **Claude** — most reliable at clean JSON; works as-is.

### Per-request budget

- `max_tokens: 1500` in the OpenRouter request, bounds worst-case output cost
- Input is bounded by client-side photo compression (<2MB) + 2000-char text cap

### Why this prompt shape

- **Evidence-cited rationale** forces the model to engage with the photo, not regurgitate generic advice
- **Honest confidence + nullable species + "what would change my mind"** enforces calibration — the differentiator from PictureThis-class apps
- **Concrete recovery steps** map directly to user action
- **Safety rules** preempt the most likely failure modes

## UI

### Layout principle

Single column, max-width ~700px, mobile-first. Same layout scales gracefully to desktop without responsive flips. Justified by the dominant use case: diagnosis happens at the plant, on a phone. Desktop sessions are secondary, mostly shared-link viewing.

### Capture page (`/`)

- Header: "Plant Doctor" + one-line tagline ("Photo + a few words. Get a diagnosis.")
- Photo input: full-width drop zone
  - Mobile: `<input type="file" accept="image/*" capture="environment">` to open rear camera
  - Desktop: click to pick, drag-drop, paste-from-clipboard
- Photo preview: thumbnail + "replace photo" link after upload
- Text input: `<textarea>` with placeholder "What's wrong? Any context? (optional)"
- Turnstile widget (small, after text)
- Submit button: primary, full-width on mobile
- Below the fold (optional): "See an example diagnosis →" link to a static demo result

### Result page (`/d/[id]`)

Sections stacked vertically:
1. Small photo thumbnail (the original, if we re-include it from the request — see open question below)
2. Species block: name + confidence (or "Couldn't identify with confidence")
3. Primary diagnosis card: name, confidence, rationale (evidence cited), recovery plan (timed steps)
4. Alternatives section: 1–2 alternative diagnoses, shorter rationale each (omit section if empty)
5. "What would change my mind" section: 1–3 cheap checks
6. Meta footer: model used, date, share/copy-link button
7. "Diagnose another plant" CTA → `/`

### Empty / edge states

- Species couldn't be ID'd → "Couldn't identify the species with confidence — diagnosis still attempts to address visible symptoms" (the LLM's primary diagnosis still renders)
- No alternatives → omit the section entirely (less noise)
- Out-of-scope subject → LLM's safety-rule output renders in the primary slot

## Cost Controls

Layered defenses, env-tunable:

1. **Turnstile** — mandatory captcha, first line of defense against bots
2. **Per-IP hourly rate limit** — KV sliding window, default 10/hour (`RATE_LIMIT_PER_HOUR`)
3. **Per-IP daily soft cap** — KV counter, default 50/day (`DAILY_CAP_PER_IP`)
4. **Global daily budget cap** — KV counter of cents spent today, default $10 (`DAILY_BUDGET_CENTS=1000`)

### Cost accuracy

- OpenRouter returns usage info on the response (`usage.total_cost` or similar field)
- Budget counter increments by actual cost where available
- Fallback: estimate from `input_tokens × input_rate + output_tokens × output_rate` using a per-model rate table maintained as a config constant

### Per-request bounds

- Photo: client-compressed to <2MB; server-rejects >4MB raw
- Text: 2000 chars max
- LLM output: `max_tokens: 1500`

### Configuration env vars

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | (required) | API auth |
| `OPENROUTER_MODEL` | `qwen/qwen-2.5-vl-72b-instruct` | Model selection |
| `DAILY_BUDGET_CENTS` | `1000` | Global daily cap |
| `RATE_LIMIT_PER_HOUR` | `10` | Per-IP hourly cap |
| `DAILY_CAP_PER_IP` | `50` | Per-IP daily cap |
| `MAX_OUTPUT_TOKENS` | `1500` | LLM output bound |
| `TURNSTILE_SITE_KEY` | (required) | Captcha site key |
| `TURNSTILE_SECRET_KEY` | (required) | Captcha verification |

### Monitoring

v1 needs no fancy dashboard. Cloudflare Pages Functions logs + Cloudflare Analytics cover it. Manual `wrangler tail` checks during the first 1–2 weeks. Log each call as: `{ model, cost_cents, latency_ms, status, ip_hash, request_id }`. Photo bytes are not logged.

## Error Handling

Honest, concrete, never-blame-the-user error states.

### Capture page

| Trigger | What the user sees |
|---|---|
| Photo too large (>4MB after compression) | Inline: "Photo too large after compression. Try a smaller image." |
| Unsupported format | Inline: "Use JPEG, PNG, or WebP." |
| Turnstile failed (401) | Banner: "Couldn't verify the request. Refresh and try again." |
| Rate-limited (429) | Banner: "Slow down a bit — try again in [X] minutes." (uses `Retry-After`) |
| Daily budget exhausted (503) | Banner: "Free quota for today is exhausted. Come back tomorrow." |
| LLM error (500) | Banner: "Diagnostic engine had trouble with this photo. Try a different angle or a closer shot." |
| Network failure | Banner: "Couldn't reach the server. Check your connection and try again." |

### Result page

| Trigger | What the user sees |
|---|---|
| Expired / not found (404) | "This diagnosis isn't available — it may have expired or the link is wrong. [Diagnose a new plant]" |
| Server error (500) | "Something went wrong loading this diagnosis. Try again." |

### Logging

- Every error logs a short error code + a request ID server-side
- The user sees `Request ID: abc123` in the corner of error messages (proto-feature for v2 "report a problem" link)

## Testing

### Unit (Vitest)

- LLM response parser (markdown fence stripping, JSON extraction, schema validation) — with captured fixtures from Qwen2.5-VL, Gemini Flash, Claude
- Cost estimator (token math, per-model rates, missing-header fallback)
- ID generation (uniqueness, URL-safe character set)
- Rate-limit + budget-cap logic (pure functions over KV state, mock KV)
- Zod schema parses/rejects valid/invalid `DiagnosisResult`

### Integration (Vitest with mocks)

- `POST /api/diagnose` happy path — mock OpenRouter + mock KV, verify full chain
- Cost-control edge cases — rate-limit triggered, daily budget exhausted
- Retry-on-schema-failure path — bad JSON on first call, valid on second
- `GET /api/diagnosis/[id]` happy + 404 paths

### E2E (Playwright, reuse slop-skeptic's config)

- One happy-path: capture → upload fixture photo → submit → result page renders (mocked OpenRouter response via dev-mode endpoint)
- One error-path: server returns 503 → banner renders correctly
- Skip exhaustive UI-state coverage; manual QA is enough at this scale

### LLM output quality (the most important, often skipped)

- Curated fixture set: ~15–20 plant photos with expert-validated expected diagnoses across categories (overwatering, sunburn, pest, root rot, normal seasonal yellowing, healthy plant)
- Sources: r/plantclinic (with permission), university extension service galleries (CC-licensed), personal plants
- Test runner (separate from CI, manually invoked): sends each fixture through the live model, captures responses, writes a report
- Scoring is hybrid:
  - **Automated**: species ID match (exact or near), primary diagnosis category match
  - **Manual review**: rationale cites real visual evidence; recovery steps are concrete; "what would change my mind" is genuinely cheap
- Run **before any model swap** and **before launch**

### Manual dogfooding

From week 1: diagnose own plants, friends' plants. Maintain a notes file capturing wrong diagnoses + right-but-not-useful diagnoses. This is where the v2 backlog comes from.

### Explicitly not in v1

- Load testing (cost cap throttles before infrastructure cares)
- Comprehensive cross-browser (modern evergreens only; dogfood Safari iOS specifically for camera input)

### Reusable from slop-skeptic

- Vitest config + setup
- Playwright config + CF Pages dev-server wiring
- General test scaffolding patterns

## Monetization (deferred — design leaves doors open)

v1 has no monetization. The architecture leaves room for the following without building any of it:

- Affiliate-link slots in recovery plans (data model supports — recovery steps are structured)
- Auth bolt-on later (Cloudflare Access, Clerk, or email-link auth)
- "Save this diagnosis" CTA could later become "Sign up to save your plant history" (current `/d/[id]` URLs are the proto-account)

Realistic staged path post-v1:
- **v1.5** (~1–2 mo post-launch): light affiliate links where genuinely useful
- **v2** (~3–6 mo): freemium Pro tier — plant memory, cloud sync, reminders — requires auth + payments
- **v2.5** (opportunistic): BYOK for power users
- **v3+** (if signal exists): B2B — embeddable widget for nurseries, white-label for plant subscription boxes

Plant Doctor's standalone ceiling is consumer/hobby-class. The real strategic value is validating the Vision-LLM as Ambient Domain Expert pattern so higher-WTP siblings (Appliance Troubleshooter, Antiques Appraiser, Mechanical-Part Identifier) can be built fast on the same rails.

## Open Questions

These are knowingly deferred to implementation time, not blockers for the plan:

1. **Should the result page show the original photo thumbnail?** Trade-off: privacy (we'd need to store the photo) vs. context (recipient of a shared link sees what was diagnosed). Lean: store a small ~512px JPEG thumbnail (≈30KB) in KV alongside the result, with the same 90-day TTL. Re-decide at implementation.
2. **Exact OpenRouter response-usage field name and shape** — verify against current OpenRouter docs at implementation time.
3. **JSON-mode support for Qwen2.5-VL via OpenRouter** — confirm at implementation. If unreliable, fall back to instruction-only with stricter parser.
4. **Quality threshold for launch** — set after running the fixture set: e.g. "primary diagnosis category matches expert on ≥80% of fixtures."

## Stack Reference

| Layer | Tech | Notes |
|---|---|---|
| Frontend | SvelteKit + TypeScript | Match slop-skeptic precedent |
| Hosting | Cloudflare Workers + Static Assets | via `@sveltejs/adapter-cloudflare` v7+ |
| API | SvelteKit route handlers running inside the Worker | Same Worker as the static assets |
| Storage | Cloudflare KV (`DIAGNOSES` namespace) | Single namespace |
| Captcha | Cloudflare Turnstile | Free, integrated |
| LLM | OpenRouter API | OpenAI-compatible, single client |
| Default model | `qwen/qwen-2.5-vl-72b-instruct` | Env-swappable |
| Schema validation | Zod | Standard |
| Testing | Vitest + Playwright | Reuse slop-skeptic config |
| Compression (client) | browser-native canvas resize + JPEG encode | No external dep |
| Dev | `wrangler pages dev` | Local stack |

## Estimated Effort

3–5 weeks for v1 working prototype:
- Week 1: Project bootstrap, capture page, photo upload + compression, basic API skeleton
- Week 2: OpenRouter integration, prompt iteration, structured-output parsing, result page
- Week 3: Cost-control wrappers, Turnstile, error handling, KV persistence, share URLs
- Week 4: Quality-test fixture set + iteration, dogfooding, polish
- Week 5: Launch prep — landing copy, example diagnosis, deploy, monitoring sanity checks

Quality iteration in week 4 is the variable — depending on how well Qwen2.5-VL handles edge cases, may need a model swap and re-evaluation.
