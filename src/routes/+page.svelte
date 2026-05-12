<script lang="ts">
  import { onMount } from 'svelte';
  import { PUBLIC_TURNSTILE_SITE_KEY } from '$env/static/public';
  import { Camera, Image } from 'lucide-svelte';
  import { compressPhoto, type CompressedPhoto } from '$lib/photoCompress';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let photo: CompressedPhoto | null = $state(null);
  let photoError = $state<string | null>(null);
  let text = $state('');
  let submitting = $state(false);
  let formError = $state<string | null>(null);
  let turnstileToken = $state<string | null>(null);

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
</script>

<svelte:head>
  <title>Plant Doctor</title>
  <meta name="description" content="Photo + a few words. Get a plant diagnosis." />
</svelte:head>

<PageHeader>Plant Doctor</PageHeader>

<p class="text-muted text-sm mb-8">Photo + a few words. Get a diagnosis.</p>

<form onsubmit={handleSubmit}>
  <div>
    {#if photo}
      <img src={photo.dataUrl} alt="Selected plant" class="max-w-full rounded-md border border-line" />
      <button type="button" onclick={clearPhoto} class="btn-ghost mt-2 underline">
        Replace photo
      </button>
    {:else}
      <div class="flex flex-col gap-2">
        <label class="flex items-center justify-center gap-2 min-h-[90px] border-2 border-dashed border-line rounded-lg text-muted hover:bg-surface transition cursor-pointer p-4 text-sm">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onchange={handlePhotoChange}
            class="hidden"
          />
          <Camera size={18} />
          <span>Take a photo</span>
        </label>
        <label class="flex items-center justify-center gap-2 min-h-[90px] border-2 border-dashed border-line rounded-lg text-muted hover:bg-surface transition cursor-pointer p-4 text-sm">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onchange={handlePhotoChange}
            class="hidden"
          />
          <Image size={18} />
          <span>Choose from gallery</span>
        </label>
      </div>
    {/if}
    {#if photoError}
      <p class="text-danger mt-2 text-sm">{photoError}</p>
    {/if}
  </div>

  <div class="mt-4">
    <textarea
      bind:value={text}
      placeholder="What's wrong? Any context? (optional)"
      maxlength="2000"
      rows="3"
      class="input-base"
    ></textarea>
  </div>

  <div id="turnstile-container" class="mt-4"></div>

  {#if formError}
    <p class="text-danger mt-4 text-sm">{formError}</p>
  {/if}

  <button type="submit" class="btn-primary mt-6" disabled={submitting || !photo}>
    {submitting ? 'Diagnosing…' : 'Diagnose'}
  </button>
</form>

<p class="mt-6 text-center text-muted text-sm">
  <a href="/example" class="text-muted hover:text-fg">See an example diagnosis →</a>
</p>
