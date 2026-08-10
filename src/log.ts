const MAX_LOG_VALUE_LENGTH = 300;

/**
 * Normalizes untrusted platform text into one bounded physical log line.
 * Display data is not changed; callers use this value only for console output.
 */
export function safeLogValue(value: unknown): string {
  const normalized = String(value ?? '')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const bounded = normalized.length <= MAX_LOG_VALUE_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_LOG_VALUE_LENGTH - 1)}…`;
  return JSON.stringify(bounded);
}
