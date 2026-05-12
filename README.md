# Plant Doctor

Public, free, mobile-first web app: photo + a few words → structured plant diagnosis with confidence, evidence-cited rationale, recovery plan, and "what would change my mind" verification.

**Diagnoses are model-generated and can be wrong.** Confidence percentages reflect the model's own estimate, not certainty. Treat the output as a starting point and verify before acting — particularly for rare or valuable plants.

First instance of the **Vision-LLM as Ambient Domain Expert** pattern (see `docs/superpowers/specs/2026-05-11-plant-doctor-design.md`).

![Demo](./demo.gif)

## Stack

SvelteKit (Svelte 5) + TypeScript on Cloudflare Workers + Static Assets. OpenRouter (default Qwen2.5-VL 72B) for diagnosis. KV for result persistence. Turnstile for abuse protection. Tailwind v4 + Lucide + IBM Plex Mono with dark-default theme. No DB, no accounts, no image storage server-side — photos are forwarded to OpenRouter for the diagnosis call and not retained after the response.

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

1. `wrangler kv namespace create slop-plant-doctor-DIAGNOSES` → update `wrangler.toml` with the namespace ID
2. Get real Turnstile site + secret keys from the Cloudflare dashboard
3. Put real site key in `.env` (`PUBLIC_TURNSTILE_SITE_KEY=...`)
4. `wrangler secret put OPENROUTER_API_KEY` and `wrangler secret put TURNSTILE_SECRET_KEY`
5. `npm run build && npx wrangler deploy`

## Cost & abuse controls

> ⚠️ **Read before changing these values.** This is the only thing standing between your OpenRouter account and a runaway bill if the URL gets shared somewhere unfriendly. The defaults are intentionally conservative.

Layered (env-tunable):
- Turnstile captcha (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`) — blocks bots before any LLM call
- Per-IP hourly rate limit (default 10/hour, `RATE_LIMIT_PER_HOUR`)
- Per-IP daily cap (default 50/day, `DAILY_CAP_PER_IP`)
- **Global daily budget cap** (default $10 USD/day, `DAILY_BUDGET_CENTS=1000`) — hard ceiling. Each request reserves an estimated 30¢ in KV *before* calling OpenRouter; when reservations exhaust the cap, the API returns 503 until the next UTC day. With Qwen2.5-VL at current pricing (~0.5¢/call), the 30¢ reservation gives ~60× headroom for model-price drift.

With defaults, the **maximum loss per month is ~$300** (=$10 × 31 days). If you raise `DAILY_BUDGET_CENTS`, you're proportionally raising the worst case. The MIT license disclaims liability; you own the cap you set.

## Style system

Tailwind v4 + Lucide icons + IBM Plex Mono. Dark default with a sun/moon toggle (persisted in `localStorage`). Mono + functional accents palette: grayscale base, red/amber/green only for semantic signals (danger / warning / success). Component primitives in `src/lib/components/` (`ThemeToggle`, `PageHeader`) and theme tokens in `src/app.css`.

## Docs

- Design spec: `docs/superpowers/specs/2026-05-11-plant-doctor-design.md`
- Pattern + sibling instances: tracked in a private idea-management repo
