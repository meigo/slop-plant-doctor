/**
 * Records a short demo of the capture → diagnose → result flow and writes it
 * to `demo.gif` at the repo root. Fully agentic: spawns vite dev with test
 * Turnstile keys, mocks /api/diagnose, drives Playwright on an iPhone-13
 * viewport, then converts the recorded WebM to an optimised GIF via ffmpeg.
 *
 * Pre-requisites:
 *   - One fixture photo in `tests/fixtures/plant-photos/` (JPEG/PNG/WebP)
 *   - ffmpeg on PATH
 *   - Playwright browsers installed (`npx playwright install chromium`)
 *
 * Run: `npm run demo:record`
 */
import { chromium, devices } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIXTURE_DIR = join(ROOT, 'tests/fixtures/plant-photos');
const OUT_DIR = join(HERE, 'demo-output');
const FINAL_GIF = join(ROOT, 'demo.gif');
const PORT = 5183;
const BASE = `http://localhost:${PORT}`;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function findFixture(): string {
  if (!existsSync(FIXTURE_DIR)) fail(`Missing fixture dir: ${FIXTURE_DIR}`);
  const photos = readdirSync(FIXTURE_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  if (!photos.length) fail(`No photos in ${FIXTURE_DIR}. Drop one fixture image there and re-run.`);
  return join(FIXTURE_DIR, photos[0]);
}

async function bootVite(): Promise<() => void> {
  const env = {
    ...process.env,
    PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    OPENROUTER_API_KEY: 'mock',
    HASH_SALT: 'demo-salt'
  };
  const proc = spawn('npx', ['vite', 'dev', '--port', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise<void>((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error('vite dev did not become ready within 30s')), 30_000);
    proc.stdout!.on('data', chunk => {
      if (chunk.toString().includes('Local:')) { clearTimeout(timer); resolveReady(); }
    });
    proc.on('exit', code => rejectReady(new Error(`vite dev exited early with code ${code}`)));
  });

  // Pre-warm SvelteKit's lazy route compile so the recording doesn't start with a blank frame.
  await fetch(`${BASE}/`).catch(() => {});
  await fetch(`${BASE}/example`).catch(() => {});

  return () => proc.kill('SIGTERM');
}

async function record(photoPath: string) {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    recordVideo: { dir: OUT_DIR, size: { width: 390, height: 844 } }
  });
  const page = await context.newPage();

  await page.route('**/api/diagnose', async route => {
    await sleep(1500);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'demo-id' }) });
  });

  await page.goto(BASE);
  await page.addStyleTag({ content: '#turnstile-container { display: none !important; }' });
  await sleep(1200);

  const galleryInput = page.locator('input[type="file"]').nth(1);
  await galleryInput.setInputFiles(photoPath);
  await page.waitForSelector('img[alt="Selected plant"]', { state: 'visible' });
  await sleep(900);

  await page.locator('textarea').click();
  await page.locator('textarea').pressSequentially('Yellowing lower leaves, soft stem', { delay: 50 });
  await sleep(700);

  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.waitFor({ state: 'visible' });
  await submitBtn.click();
  await sleep(1400);

  await page.goto(`${BASE}/example`);
  await sleep(1500);

  await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
  await sleep(1400);
  await page.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' }));
  await sleep(1400);
  await page.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' }));
  await sleep(1200);

  await context.close();
  await browser.close();
}

function convertToGif() {
  const videos = readdirSync(OUT_DIR).filter(f => f.endsWith('.webm'));
  if (!videos.length) fail('Playwright produced no .webm');
  const webm = join(OUT_DIR, videos[0]);

  const filter = 'fps=15,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer';
  execSync(`ffmpeg -y -ss 3 -i "${webm}" -vf "${filter}" -loop 0 "${FINAL_GIF}"`, { stdio: 'inherit' });
}

const photoPath = findFixture();
console.log(`→ Using fixture: ${photoPath}`);
const killVite = await bootVite();
try {
  await record(photoPath);
} finally {
  killVite();
}
convertToGif();
rmSync(OUT_DIR, { recursive: true, force: true });
console.log(`✓ Wrote ${FINAL_GIF}`);
