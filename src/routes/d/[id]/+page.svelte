<script lang="ts">
  import type { PageData } from './$types';
  import { Copy } from 'lucide-svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

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

<PageHeader>Plant Doctor</PageHeader>

<p class="text-xs text-muted mb-6">
  Model-generated diagnosis — verify before acting on anything high-stakes.
</p>

<section class="mb-6">
  {#if result.species}
    <p class="text-xs uppercase tracking-wider text-muted m-0">Species</p>
    <h2 class="text-lg font-semibold tracking-tight m-0">
      {result.species.name}
      <span class="text-muted font-normal text-sm">· {pct(result.species.confidence)}</span>
    </h2>
    {#if result.species.commonNames && result.species.commonNames.length > 0}
      <p class="text-muted text-sm mt-1">{result.species.commonNames.join(', ')}</p>
    {/if}
  {:else}
    <p class="text-muted">
      Couldn't identify the species with confidence — diagnosis still attempts to address visible symptoms.
    </p>
  {/if}
</section>

<section class="mb-6 border-l-2 border-fg pl-4">
  <p class="text-xs uppercase tracking-wider text-muted m-0">Primary diagnosis</p>
  <h2 class="text-lg font-semibold tracking-tight m-0">
    {result.primary.name}
    <span class="text-muted font-normal text-sm">· {pct(result.primary.confidence)}</span>
  </h2>
  <p class="mt-2">{result.primary.rationale}</p>

  {#if result.primary.recovery.length > 0}
    <p class="mt-4 mb-2 font-semibold">Recovery plan</p>
    <ul class="m-0 pl-5 list-disc space-y-1">
      {#each result.primary.recovery as step}
        <li><strong>{step.action}</strong> — {step.when}</li>
      {/each}
    </ul>
  {/if}
</section>

{#if result.alternatives.length > 0}
  <section class="mb-6">
    <p class="text-xs uppercase tracking-wider text-muted mb-2">Alternatives</p>
    {#each result.alternatives as alt}
      <p class="my-1">
        <strong>{alt.name}</strong>
        <span class="text-muted"> · {pct(alt.confidence)}</span>
        — {alt.rationale}
      </p>
    {/each}
  </section>
{/if}

{#if result.whatWouldChangeMyMind.length > 0}
  <section class="mb-6">
    <p class="text-xs uppercase tracking-wider text-muted mb-2">What would change my mind</p>
    <ul class="m-0 pl-5 list-disc">
      {#each result.whatWouldChangeMyMind as check}
        <li>{check}</li>
      {/each}
    </ul>
  </section>
{/if}

<footer class="mt-8 pt-4 border-t border-line text-muted text-sm flex justify-between items-center">
  <span>{result.meta.model} · {created.toLocaleDateString()}</span>
  <button type="button" onclick={copyShareLink} class="btn-ghost border border-line rounded-md px-2 py-1">
    <Copy size={14} />
    Copy link
  </button>
</footer>

<div class="mt-6">
  <a href="/" class="btn-primary text-center no-underline">
    Diagnose another plant
  </a>
</div>
