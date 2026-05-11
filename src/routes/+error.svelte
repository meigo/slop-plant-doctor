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
