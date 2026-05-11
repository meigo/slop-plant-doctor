<script lang="ts">
  import { ArrowLeft } from 'lucide-svelte';
  import { page } from '$app/state';
  import ThemeToggle from './ThemeToggle.svelte';

  let { backHref = '/', children }: { backHref?: string; children?: any } = $props();
  const isHome = $derived(page.url.pathname === backHref);
</script>

<header class="flex items-center justify-between mb-6">
  {#if isHome}
    <span></span>
  {:else}
    <a href={backHref} class="flex items-center gap-1.5 text-muted hover:text-fg transition no-underline">
      <ArrowLeft size={16} />
      {#if children}{@render children()}{/if}
    </a>
  {/if}
  <ThemeToggle />
</header>
