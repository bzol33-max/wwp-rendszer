const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 3000;
const EXPONENTIAL_BACKOFF = 2;

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === maxRetries) {
        throw lastError;
      }

      await delay(delayMs);
      delayMs = Math.min(delayMs * EXPONENTIAL_BACKOFF, maxDelayMs);
    }
  }

  throw lastError || new Error("Unknown error in withRetry");
}
