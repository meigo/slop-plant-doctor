<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<main class="container-page">
  {@render children()}
</main>
