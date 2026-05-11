<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const result = $derived(data.result);
  const created = $derived(new Date(data.createdAt));

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
