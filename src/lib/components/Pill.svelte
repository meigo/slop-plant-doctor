<script lang="ts">
  type Variant = 'easy' | 'moderate' | 'advanced' | 'info';

  let { variant, children }: { variant: Variant; children: any } = $props();

  const variants: Record<Variant, string> = {
    easy: 'bg-success/15 text-success border-success/30',
    moderate: 'bg-warning/15 text-warning border-warning/30',
    advanced: 'bg-danger/15 text-danger border-danger/30',
    info: 'bg-surface text-muted border-line',
  };
</script>

<span class="inline-flex items-center px-2 py-0.5 text-xs uppercase tracking-wider font-semibold rounded-full border {variants[variant]}">
  {@render children()}
</span>
