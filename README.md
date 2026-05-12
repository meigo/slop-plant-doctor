# Plant Doctor

Public, free, mobile-first web app: photo + a few words → structured plant diagnosis with confidence, evidence-cited rationale, recovery plan, and "what would change my mind" verification.

First instance of the **Vision-LLM as Ambient Domain Expert** pattern (see `docs/superpowers/specs/2026-05-11-plant-doctor-design.md`).

## Stack

SvelteKit (Svelte 5) + TypeScript on Cloudflare Pages. OpenRouter (default Qwen2.5-VL 72B) for diagnosis. KV for result persistence. Turnstile for abuse protection. No DB, no accounts, no image storage.

## Dev

```bash
cp .dev.vars.example .dev.vars
# Fill in OPENROUTER_API_KEY and (optionally) override defaults

cp .env.example .env
# .env contains PUBLIC_TURNSTILE_SITE_KEY (the test value works for local dev)

npm install
npm run dev
```

Visit `http://localhost:5173`.

## Tests

```bash
npm run test:unit          # Vitest
npm run test:e2e           # Playwright (auto-builds)
npm test                   # both
npm run quality            # manual quality runner against the fixture set (requires OPENROUTER_API_KEY)
```

## Deploy

See `docs/superpowers/plans/2026-05-11-plant-doctor.md` Phase 14 (Tasks 29-30).

Summary:
1. `wrangler kv namespace create DIAGNOSES` → update `wrangler.toml` with the namespace ID
2. Get real Turnstile site + secret keys from the Cloudflare dashboard
3. `wrangler pages deploy .svelte-kit/cloudflare --project-name=slop-plant-doctor`
4. Set Pages project env vars + secrets via the Cloudflare dashboard
5. Bind the KV namespace to the Pages project

## Cost controls

Layered (env-tunable):
- Turnstile captcha (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`)
- Per-IP hourly rate limit (default 10/hour, `RATE_LIMIT_PER_HOUR`)
- Per-IP daily cap (default 50/day, `DAILY_CAP_PER_IP`)
- Global daily budget cap (default $10 USD, `DAILY_BUDGET_CENTS=1000`)

When the global cap is hit, the API returns 503 until the next UTC day.

## Docs

- Design spec: `docs/superpowers/specs/2026-05-11-plant-doctor-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-11-plant-doctor.md`
- Pattern + sibling instances: tracked in a private idea-management repo
