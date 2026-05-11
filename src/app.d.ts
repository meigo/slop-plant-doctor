declare global {
  namespace App {
    interface Platform {
      env: {
        DIAGNOSES: KVNamespace;
        OPENROUTER_API_KEY: string;
        OPENROUTER_MODEL?: string;
        DAILY_BUDGET_CENTS?: string;
        RATE_LIMIT_PER_HOUR?: string;
        DAILY_CAP_PER_IP?: string;
        MAX_OUTPUT_TOKENS?: string;
        TURNSTILE_SITE_KEY: string;
        TURNSTILE_SECRET_KEY: string;
      };
      context: { waitUntil(promise: Promise<unknown>): void };
      caches: CacheStorage & { default: Cache };
    }
  }
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, opts: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback'?: () => void;
        'expired-callback'?: () => void;
      }) => string;
    };
    onTurnstileLoad?: () => void;
  }
}

export {};
