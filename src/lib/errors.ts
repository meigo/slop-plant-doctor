import type { ApiErrorCode } from './types';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public httpStatus: number,
    public userMessage: string,
    public retryAfterSeconds?: number
  ) {
    super(`${code}: ${userMessage}`);
    this.name = 'ApiError';
  }
}

export function turnstileFailed(): ApiError {
  return new ApiError('turnstile_failed', 401, "Couldn't verify the request. Refresh and try again.");
}

export function rateLimited(retryAfterSec: number): ApiError {
  return new ApiError(
    'rate_limited',
    429,
    `Slow down a bit — try again in ${Math.ceil(retryAfterSec / 60)} minutes.`,
    retryAfterSec
  );
}

export function dailyCapHit(): ApiError {
  return new ApiError(
    'daily_cap_per_ip',
    429,
    'Daily limit reached for this IP. Try again tomorrow.'
  );
}

export function budgetExhausted(): ApiError {
  return new ApiError(
    'budget_exhausted',
    503,
    'Free quota for today is exhausted. Come back tomorrow.'
  );
}

export function photoTooLarge(): ApiError {
  return new ApiError('photo_too_large', 400, 'Photo too large. Try a smaller image.');
}

export function photoUnsupportedFormat(): ApiError {
  return new ApiError(
    'photo_unsupported_format',
    400,
    'Unsupported format. Use JPEG, PNG, or WebP.'
  );
}

export function textTooLong(): ApiError {
  return new ApiError('text_too_long', 400, 'Text description is too long. Trim it down.');
}

export function llmError(): ApiError {
  return new ApiError(
    'llm_error',
    500,
    'Diagnostic engine had trouble with this photo. Try a different angle or a closer shot.'
  );
}

export function schemaError(): ApiError {
  return new ApiError(
    'schema_error',
    500,
    'Diagnostic engine returned an unexpected response. Try again.'
  );
}

export function internalError(): ApiError {
  return new ApiError('internal_error', 500, 'Something went wrong. Try again.');
}
