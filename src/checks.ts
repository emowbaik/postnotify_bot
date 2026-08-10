import type { LiveCheckResult, Platform } from './types.js';

export interface LiveCheckRequest {
  platform: Platform;
  target: string;
  promise: Promise<LiveCheckResult>;
}

/** Preserve check identity even when its promise rejects unexpectedly. */
export async function settleLiveChecks(
  checks: readonly LiveCheckRequest[]
): Promise<LiveCheckResult[]> {
  const settled = await Promise.allSettled(checks.map((check) => check.promise));

  return settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;

    const check = checks[index]!;
    return {
      status: 'error',
      isLive: false,
      platform: check.platform,
      username: check.target,
      errorCode: `${check.platform.toUpperCase()}_UNEXPECTED_ERROR`,
      message: `Unexpected ${check.platform} check failure.`,
    };
  });
}
