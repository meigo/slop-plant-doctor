import { defineConfig } from 'demogen';

export default defineConfig({
  dev: {
    framework: 'sveltekit',
    port: 5183,
    env: {
      PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      OPENROUTER_API_KEY: 'mock',
      HASH_SALT: 'demo-salt'
    }
  },
  viewport: 'iphone-13',
  trim: { start: 3, end: 0 },
  mocks: {
    '/api/diagnose': { delay: 1500, body: { id: 'demo-id' } }
  },
  steps: async (page, ctx) => {
    await page.addStyleTag({ content: '#turnstile-container { display: none !important; }' });
    await new Promise(r => setTimeout(r, 1500));

    const galleryInput = page.locator('input[type="file"]').nth(1);
    await galleryInput.setInputFiles(ctx.fixture('tests/fixtures/plant-photos'));
    await page.waitForSelector('img[alt="Selected plant"]', { state: 'visible' });
    await new Promise(r => setTimeout(r, 1200));

    await page.locator('textarea').click();
    await page.locator('textarea').pressSequentially('Yellowing lower leaves, soft stem', { delay: 70 });
    await new Promise(r => setTimeout(r, 1200));

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.waitFor({ state: 'visible' });
    await submitBtn.click();
    await new Promise(r => setTimeout(r, 1800));

    await page.goto(`${ctx.base}/example`);
    await new Promise(r => setTimeout(r, 2400));

    await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, 2200));
    await page.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, 2200));
    await page.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, 1800));
  }
});
