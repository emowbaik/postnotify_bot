export const DISCORD_REQUEST_TIMEOUT_MS = 15_000;

/** Bound Discord network waits so state persistence still runs after an outage. */
export async function fetchDiscord(
  input: string,
  init: RequestInit,
  timeoutMs = DISCORD_REQUEST_TIMEOUT_MS
): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error: unknown) {
    if (
      error instanceof Error
      && (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new Error(`Discord API request timed out after ${timeoutMs}ms.`, { cause: error });
    }
    throw error;
  }
}
