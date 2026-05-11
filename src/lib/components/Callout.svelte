<script lang="ts">
  import { AlertTriangle, Info } from 'lucide-svelte';

  type Variant = 'danger' | 'warning' | 'info';

  let { variant, title, children }: { variant: Variant; title?: string; children?: any } = $props();

  const styles: Record<Variant, { wrapper: string; iconColor: string; iconComponent: typeof AlertTriangle }> = {
    danger: {
      wrapper: 'border-l-danger bg-danger/10',
      iconColor: 'text-danger',
      iconComponent: AlertTriangle,
    },
    warning: {
      wrapper: 'border-l-warning bg-warning/10',
      iconColor: 'text-warning',
      iconComponent: AlertTriangle,
    },
    info: {
      wrapper: 'border-l-muted bg-surface',
      iconColor: 'text-muted',
      iconComponent: Info,
    },
  };

  const Icon = $derived(styles[variant].iconComponent);
</script>

<div class="border-l-4 {styles[variant].wrapper} p-3 rounded-r-md my-3">
  <div class="flex gap-2 items-start">
    <Icon size={18} class="shrink-0 mt-0.5 {styles[variant].iconColor}" />
    <div class="flex-1">
      {#if title}<div class="font-semibold mb-1">{title}</div>{/if}
      {#if children}{@render children()}{/if}
    </div>
  </div>
</div>
