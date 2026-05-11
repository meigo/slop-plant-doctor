<script lang="ts">
  import { ArrowLeft } from 'lucide-svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  let { backHref = '/', children }: { backHref?: string; children?: any } = $props();
</script>

<header class="flex items-center justify-between mb-6">
  <a href={backHref} class="flex items-center gap-1.5 text-muted hover:text-fg transition no-underline">
    <ArrowLeft size={16} />
    {#if children}{@render children()}{/if}
  </a>
  <ThemeToggle />
</header>
