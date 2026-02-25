/** Sleep with exponential backoff + jitter */
function backoff(attempt: number, baseMs: number): Promise<void> {
  const delay = baseMs * 2 ** attempt + Math.random() * baseMs;
  return new Promise((r) => setTimeout(r, delay));
}

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  config?: { maxRetries?: number; delayMs?: number; retryOn?: number[] },
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 3;
  const delayMs = config?.delayMs ?? 1000;
  const retryOn = config?.retryOn ?? [500, 502, 503, 504, 529];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (
        response.ok ||
        !retryOn.includes(response.status) ||
        attempt === maxRetries
      ) {
        return response;
      }
      await backoff(attempt, delayMs);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await backoff(attempt, delayMs);
    }
  }
  return fetch(url, options);
}

/** Retry any async fn on transient errors (500, 529, overloaded, network) */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: { maxRetries?: number; delayMs?: number; label?: string },
): Promise<T> {
  const maxRetries = config?.maxRetries ?? 3;
  const delayMs = config?.delayMs ?? 1000;
  const label = config?.label ?? "withRetry";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 529 ||
        msg.includes("overloaded") ||
        msg.includes("Internal server error") ||
        msg.includes("ECONNRESET") ||
        msg.includes("socket hang up");

      if (!isRetryable || attempt === maxRetries) throw err;
      console.warn(
        `[${label}] Attempt ${attempt + 1}/${maxRetries} failed (${status || msg}), retrying...`,
      );
      await backoff(attempt, delayMs);
    }
  }
  // Unreachable
  return fn();
}
