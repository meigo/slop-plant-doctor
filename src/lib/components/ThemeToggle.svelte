<script lang="ts">
  import { Sun, Moon } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import { getCurrentTheme, toggleTheme, type Theme } from '$lib/theme';

  let theme = $state<Theme>('dark');

  onMount(() => {
    theme = getCurrentTheme();
  });

  function handleToggle() {
    theme = toggleTheme();
  }
</script>

<button
  type="button"
  onclick={handleToggle}
  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  class="p-2 rounded-md text-muted hover:text-fg hover:bg-surface transition"
>
  {#if theme === 'dark'}
    <Sun size={18} />
  {:else}
    <Moon size={18} />
  {/if}
</button>
