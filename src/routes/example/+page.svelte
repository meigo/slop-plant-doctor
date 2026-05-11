<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';

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

  const pct = (n: number) => `${Math.round(n * 100)}%`;
</script>

<svelte:head>
  <title>Example diagnosis — Plant Doctor</title>
</svelte:head>

<PageHeader>Plant Doctor</PageHeader>

<p class="text-muted text-sm mb-6">This is a static example, not a real diagnosis.</p>

<section class="mb-6">
  <p class="text-xs uppercase tracking-wider text-muted m-0">Species</p>
  <h2 class="text-lg font-semibold tracking-tight m-0">
    {result.species.name}
    <span class="text-muted font-normal text-sm">· {pct(result.species.confidence)}</span>
  </h2>
  <p class="text-muted text-sm mt-1">{result.species.commonNames.join(', ')}</p>
</section>

<section class="mb-6 border-l-2 border-fg pl-4">
  <p class="text-xs uppercase tracking-wider text-muted m-0">Primary diagnosis</p>
  <h2 class="text-lg font-semibold tracking-tight m-0">
    {result.primary.name}
    <span class="text-muted font-normal text-sm">· {pct(result.primary.confidence)}</span>
  </h2>
  <p class="mt-2">{result.primary.rationale}</p>
  <p class="mt-4 mb-2 font-semibold">Recovery plan</p>
  <ul class="m-0 pl-5 list-disc space-y-1">
    {#each result.primary.recovery as step}
      <li><strong>{step.action}</strong> — {step.when}</li>
    {/each}
  </ul>
</section>

<section class="mb-6">
  <p class="text-xs uppercase tracking-wider text-muted mb-2">Alternatives</p>
  {#each result.alternatives as alt}
    <p class="my-1"><strong>{alt.name}</strong> <span class="text-muted">· {pct(alt.confidence)}</span> — {alt.rationale}</p>
  {/each}
</section>

<section class="mb-6">
  <p class="text-xs uppercase tracking-wider text-muted mb-2">What would change my mind</p>
  <ul class="m-0 pl-5 list-disc">
    {#each result.whatWouldChangeMyMind as check}
      <li>{check}</li>
    {/each}
  </ul>
</section>

<footer class="mt-8 pt-4 border-t border-line text-muted text-sm">
  Example · {result.meta.model}
</footer>

<div class="mt-6">
  <a href="/" class="btn-primary text-center no-underline">
    Diagnose your plant
  </a>
</div>
