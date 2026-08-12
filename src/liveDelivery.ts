import {
  buildSessionKey,
  clearDeliveryError,
  getDeliveryError,
  hasNotified,
  markNotified,
  setDeliveryError,
} from './state.ts';
import type {
  BotState,
  LiveDeliveryStage,
  LiveInfo,
} from './types.ts';

export interface LiveDeliveryDependencies {
  sendLive(info: LiveInfo): Promise<void>;
  sendRecovery(info: LiveInfo): Promise<void>;
  now?(): string;
}

export type LiveDeliveryOutcome =
  | { status: 'sent' | 'already-notified'; sessionKey: string }
  | {
      status: 'failed';
      sessionKey: string;
      stage: LiveDeliveryStage;
      errorCode: string;
    };

export async function deliverLiveSession(
  state: BotState,
  info: LiveInfo,
  dependencies: LiveDeliveryDependencies
): Promise<LiveDeliveryOutcome> {
  const sessionKey = buildSessionKey(info.platform, info.username, info.roomId);
  if (hasNotified(state, sessionKey)) {
    try {
      await dependencies.sendRecovery(info);
    } catch {
      // Session was already delivered; recovery remains best-effort.
    }
    return { status: 'already-notified', sessionKey };
  }

  try {
    await dependencies.sendLive(info);
  } catch (error: unknown) {
    const previous = getDeliveryError(state, sessionKey);
    const now = dependencies.now?.() ?? new Date().toISOString();
    const { stage, errorCode } = deliveryFailureMetadata(error);
    setDeliveryError(state, {
      platform: info.platform,
      target: info.username,
      sessionKey,
      stage,
      errorCode,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      attemptCount: Math.min((previous?.attemptCount ?? 0) + 1, 1_000_000),
      ...(previous?.alertSentAt && { alertSentAt: previous.alertSentAt }),
    });
    return { status: 'failed', sessionKey, stage, errorCode };
  }

  markNotified(state, sessionKey);
  clearDeliveryError(state, sessionKey);
  try {
    await dependencies.sendRecovery(info);
  } catch {
    // Live delivery already succeeded; recovery is best-effort health messaging.
  }
  return { status: 'sent', sessionKey };
}

function deliveryFailureMetadata(error: unknown): {
  stage: LiveDeliveryStage;
  errorCode: string;
} {
  if (!isDeliveryError(error)) {
    return { stage: 'configuration', errorCode: 'LIVE_DELIVERY_UNKNOWN_ERROR' };
  }
  return { stage: error.stage, errorCode: safeDeliveryCode(error.errorCode) };
}

function isDeliveryError(error: unknown): error is Error & {
  stage: LiveDeliveryStage;
  errorCode: string;
} {
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & Record<string, unknown>;
  return (candidate.stage === 'configuration'
      || candidate.stage === 'preview'
      || candidate.stage === 'discord')
    && typeof candidate.errorCode === 'string';
}

function safeDeliveryCode(value: string): string {
  return /^[A-Z0-9_]{1,80}$/u.test(value)
    ? value
    : 'LIVE_DELIVERY_UNKNOWN_ERROR';
}