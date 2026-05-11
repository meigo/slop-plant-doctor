<script lang="ts">
  import { compressPhoto, type CompressedPhoto } from '$lib/photoCompress';
  import { onMount } from 'svelte';
  import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';

  let photo: CompressedPhoto | null = $state(null);
  let photoError = $state<string | null>(null);
  let text = $state('');
  let submitting = $state(false);
  let formError = $state<string | null>(null);
  let turnstileToken = $state<string | null>(null);

  onMount(() => {
    const render = () => {
      if (!window.turnstile) return;
      window.turnstile.render('#turnstile-container', {
        sitekey: PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token) => { turnstileToken = token; },
        'error-callback': () => { turnstileToken = null; },
        'expired-callback': () => { turnstileToken = null; }
      });
    };
    if (window.turnstile) render();
    else window.onTurnstileLoad = render;
  });

  async function handlePhotoChange(e: Event) {
    photoError = null;
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      photoError = 'Use JPEG, PNG, or WebP.';
      return;
    }

    try {
      photo = await compressPhoto(file);
    } catch (err) {
      photoError = 'Could not process that image. Try another.';
    }
  }

  function clearPhoto() {
    photo = null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    formError = null;
    if (!photo) { formError = 'Please add a photo.'; return; }
    if (!turnstileToken) { formError = 'Waiting on captcha. Try again in a moment.'; return; }

    submitting = true;
    try {
      const fd = new FormData();
      fd.append('photo', photo.blob, 'plant.jpg');
      fd.append('text', text);
      fd.append('turnstileToken', turnstileToken);

      const res = await fetch('/api/diagnose', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Something went wrong.' })) as { message?: string };
        formError = body.message ?? 'Something went wrong.';
        return;
      }
      const { id } = (await res.json()) as { id: string };
      window.location.assign(`/d/${id}`);
    } catch (err) {
      formError = "Couldn't reach the server. Check your connection and try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Plant Doctor</title>
  <meta name="description" content="Photo + a few words. Get a plant diagnosis." />
</svelte:head>

<header style="margin-bottom: 2rem;">
  <h1 style="margin: 0 0 0.25rem;">Plant Doctor</h1>
  <p style="margin: 0; color: var(--muted);">Photo + a few words. Get a diagnosis.</p>
</header>

<form onsubmit={handleSubmit}>
  <div class="photo-section">
    {#if photo}
      <img src={photo.dataUrl} alt="Selected plant" style="max-width: 100%; border-radius: 6px;" />
      <button type="button" onclick={clearPhoto} style="margin-top: 0.5rem; background: none; border: none; color: var(--muted); text-decoration: underline; padding: 0;">
        Replace photo
      </button>
    {:else}
      <label class="drop-zone">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onchange={handlePhotoChange}
          style="display: none;"
        />
        <span>Tap to take a photo or pick one</span>
      </label>
    {/if}
    {#if photoError}
      <p style="color: var(--danger); margin-top: 0.5rem;">{photoError}</p>
    {/if}
  </div>

  <div style="margin-top: 1rem;">
    <textarea
      bind:value={text}
      placeholder="What's wrong? Any context? (optional)"
      maxlength="2000"
      rows="3"
      style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; font: inherit;"
    ></textarea>
  </div>

  <!-- Turnstile widget injected in Task 23 -->
  <div id="turnstile-container" style="margin-top: 1rem;"></div>

  {#if formError}
    <p style="color: var(--danger); margin-top: 1rem;">{formError}</p>
  {/if}

  <button type="submit" class="button-primary" style="margin-top: 1.5rem;" disabled={submitting || !photo}>
    {submitting ? 'Diagnosing…' : 'Diagnose'}
  </button>
</form>

<p style="margin-top: 1.5rem; text-align: center; color: var(--muted); font-size: 0.9rem;">
  <a href="/example" style="color: var(--muted);">See an example diagnosis →</a>
</p>

<style>
  .photo-section { width: 100%; }
  .drop-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    border: 2px dashed var(--border);
    border-radius: 8px;
    color: var(--muted);
    cursor: pointer;
    text-align: center;
    padding: 1rem;
  }
  .drop-zone:hover { background: rgba(0, 0, 0, 0.02); }
</style>
