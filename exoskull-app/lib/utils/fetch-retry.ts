export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  config?: { maxRetries?: number; delayMs?: number; retryOn?: number[] },
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 2;
  const delayMs = config?.delayMs ?? 1000;
  const retryOn = config?.retryOn ?? [500, 502, 503, 504];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (
      response.ok ||
      !retryOn.includes(response.status) ||
      attempt === maxRetries
    ) {
      return response;
    }
    await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
  }
  // Unreachable but satisfies TypeScript
  return fetch(url, options);
}
