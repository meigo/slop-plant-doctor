import type { RequestHandler } from './$types';
import { verifyTurnstile } from '$lib/turnstile';
import { sha256Hex } from '$lib/hash';
import { checkAndIncrementRateLimit } from '$lib/rateLimit';
import { checkAndIncrementDailyCap } from '$lib/dailyCap';
import { canSpend } from '$lib/budget';
import { runDiagnose } from '$lib/diagnose';
import {
  ApiError,
  turnstileFailed, rateLimited, dailyCapHit, budgetExhausted,
  photoTooLarge, photoUnsupportedFormat, textTooLong, internalError
} from '$lib/errors';

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function envInt(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${blob.type};base64,${btoa(bin)}`;
}

function errorResponse(e: ApiError): Response {
  const body = JSON.stringify({ code: e.code, message: e.userMessage });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (e.retryAfterSeconds !== undefined) headers['Retry-After'] = String(e.retryAfterSeconds);
  return new Response(body, { status: e.httpStatus, headers });
}

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
  if (!platform) return errorResponse(internalError());
  const env = platform.env;

  try {
    const form = await request.formData();
    const photo = form.get('photo');
    const text = (form.get('text') as string | null) ?? '';
    const turnstileToken = (form.get('turnstileToken') as string | null) ?? '';

    if (!(photo instanceof Blob) || photo.size === 0) {
      return errorResponse(photoTooLarge()); // reuse for "missing"; user message is generic enough
    }
    if (photo.size > MAX_PHOTO_BYTES) return errorResponse(photoTooLarge());
    if (!ALLOWED_MIME.has(photo.type)) return errorResponse(photoUnsupportedFormat());
    if (text.length > MAX_TEXT_CHARS) return errorResponse(textTooLong());

    const ip = getClientAddress();
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
    if (!ok) return errorResponse(turnstileFailed());

    const ipHash = await sha256Hex(ip);

    const rate = await checkAndIncrementRateLimit(env.DIAGNOSES, ipHash, envInt(env.RATE_LIMIT_PER_HOUR, 10));
    if (!rate.allowed) return errorResponse(rateLimited(rate.retryAfterSeconds));

    const day = await checkAndIncrementDailyCap(env.DIAGNOSES, ipHash, envInt(env.DAILY_CAP_PER_IP, 50));
    if (!day.allowed) return errorResponse(dailyCapHit());

    // Reserve worst-case cost so we don't blow past the cap on a single call.
    const reserveEstimate = 30; // 30 cents headroom per request — generous; refined post-launch
    const budget = await canSpend(env.DIAGNOSES, envInt(env.DAILY_BUDGET_CENTS, 1000), reserveEstimate);
    if (!budget.allowed) return errorResponse(budgetExhausted());

    const photoDataUrl = await blobToDataUrl(photo);

    const result = await runDiagnose({
      kv: env.DIAGNOSES,
      ipHash,
      photoDataUrl,
      freeformText: text,
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL ?? 'qwen/qwen-2.5-vl-72b-instruct',
      maxOutputTokens: envInt(env.MAX_OUTPUT_TOKENS, 1500)
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    console.error('diagnose endpoint error:', e);
    return errorResponse(internalError());
  }
};
