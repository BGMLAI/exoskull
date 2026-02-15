/**
 * Exponential backoff retry (1s, 2s, 4s, 8s, 16s)
 */

export async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; label?: string } = {},
): Promise<T> {
  const maxAttempts = options.attempts || 5;
  const label = options.label || "operation";

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) break;

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
      console.error(
        `[Retry] ${label} attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
