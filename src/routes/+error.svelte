<script lang="ts">
  import { page } from '$app/state';
  import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head>
  <title>Plant Doctor — {page.status}</title>
</svelte:head>

<PageHeader>Plant Doctor</PageHeader>

<h1 class="text-xl font-semibold tracking-tight mb-2">
  {page.status === 404 ? "Diagnosis not found" : "Something went wrong"}
</h1>

{#if page.status === 404}
  <p>This diagnosis isn't available — it may have expired or the link is wrong.</p>
{:else}
  <p>Try again, or come back later.</p>
{/if}

<a href="/" class="btn-primary mt-6 text-center no-underline inline-block">
  Diagnose a new plant
</a>
