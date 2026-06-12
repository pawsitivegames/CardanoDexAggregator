export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

/**
 * Fetch with exponential backoff retry for transient failures.
 * Retries on network errors, timeouts, and 5xx responses.
 * Does NOT retry on 4xx responses (client errors).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxRetries = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      // Retry on server errors only; client errors are not retried
      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(2 ** attempt * 500);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(2 ** attempt * 500);
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
