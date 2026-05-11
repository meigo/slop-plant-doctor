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
