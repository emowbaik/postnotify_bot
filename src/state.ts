/**
 * State management — loads and saves state.json to track which live sessions
 * have already been notified, preventing duplicate Discord notifications.
 *
 * The workflow materializes state.json from the dedicated postnotify-state
 * branch before each run and fast-forwards that non-code branch afterward.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import type {
  BotState,
  PersistedDeliveryError,
  PersistedPlatformError,
  Platform,
  TikTokDetectorDiagnostic,
} from './types.js';

const STATE_FILE = path.resolve(
  fileURLToPath(new URL('../state.json', import.meta.url))
);

const DEFAULT_STATE: BotState = {
  activeLiveSessions: [],
  youtubeActiveVideos: {},
  platformErrors: {},
  detectorDiagnostics: {},
  deliveryErrors: {},
};

/** Normalize persisted data while preserving compatibility with older state files. */
export function normalizeBotState(value: unknown): BotState {
  if (!isRecord(value)) return structuredClone(DEFAULT_STATE);

  return {
    activeLiveSessions: isStringArray(value.activeLiveSessions)
      ? value.activeLiveSessions
      : [],
    youtubeActiveVideos: stringRecord(value.youtubeActiveVideos),
    platformErrors: platformErrorRecord(value.platformErrors),
    detectorDiagnostics: detectorDiagnosticRecord(value.detectorDiagnostics),
    deliveryErrors: deliveryErrorRecord(value.deliveryErrors),
  };
}

/** Load state without replacing corrupt persisted data with empty defaults. */
export function loadState(stateFile = STATE_FILE): BotState {
  if (!existsSync(stateFile)) return structuredClone(DEFAULT_STATE);

  try {
    const raw = readFileSync(stateFile, 'utf8').trim();
    if (!raw) throw new SyntaxError('State file is empty.');
    return normalizeBotState(JSON.parse(raw) as unknown);
  } catch (error: unknown) {
    throw new Error(
      `Failed to load ${path.basename(stateFile)}; existing state was preserved.`,
      { cause: error }
    );
  }
}

/** Persist state through a same-directory atomic rename. */
export function saveState(state: BotState, stateFile = STATE_FILE): void {
  const temporaryFile = `${stateFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSync(temporaryFile, stateFile);
  } finally {
    if (existsSync(temporaryFile)) unlinkSync(temporaryFile);
  }
}

/** Build a platform-prefixed deduplication key for a live session. */
export function buildSessionKey(
  platform: 'tiktok' | 'youtube',
  username: string,
  roomId: string
): string {
  return `${platform}:${username}:${roomId}`;
}

/** Existing TikTok keys from earlier versions remain valid until stream end. */
export function buildLegacyTikTokSessionKey(username: string, roomId: string): string {
  return `${username}:${roomId}`;
}

/** Check whether a live session has already been notified. */
export function hasNotified(state: BotState, sessionKey: string): boolean {
  if (state.activeLiveSessions.includes(sessionKey)) return true;

  const legacyTikTokKey = sessionKey.startsWith('tiktok:')
    ? sessionKey.slice('tiktok:'.length)
    : null;
  return legacyTikTokKey !== null && state.activeLiveSessions.includes(legacyTikTokKey);
}

/** Mark a session as notified. */
export function markNotified(state: BotState, sessionKey: string): void {
  if (!state.activeLiveSessions.includes(sessionKey)) {
    state.activeLiveSessions.push(sessionKey);
  }
}

/** Remove sessions belonging to one successfully checked target. */
export function pruneTargetSessions(
  state: BotState,
  platform: Platform,
  target: string,
  activeSessionKey?: string
): void {
  const prefix = `${platform}:${target}:`;
  const activeLegacyKey = platform === 'tiktok' && activeSessionKey?.startsWith(prefix)
    ? activeSessionKey.slice('tiktok:'.length)
    : undefined;
  let migrateActiveLegacyKey = false;

  state.activeLiveSessions = state.activeLiveSessions.filter((key) => {
    if (key.startsWith(prefix)) return key === activeSessionKey;
    if (!isLegacyTikTokTargetKey(key, platform, target)) return true;
    if (key === activeLegacyKey) migrateActiveLegacyKey = true;
    return false;
  });

  if (
    migrateActiveLegacyKey
    && activeSessionKey
    && !state.activeLiveSessions.includes(activeSessionKey)
  ) {
    state.activeLiveSessions.push(activeSessionKey);
  }
}

function isLegacyTikTokTargetKey(key: string, platform: Platform, target: string): boolean {
  if (platform !== 'tiktok' || !key.startsWith(`${target}:`)) return false;
  return key.indexOf(':', target.length + 1) === -1;
}

/** Legacy whole-run pruning retained until orchestration migration. */
export function pruneOfflineSessions(
  state: BotState,
  activeSessionKeys: string[]
): void {
  state.activeLiveSessions = state.activeLiveSessions.filter((key) =>
    activeSessionKeys.includes(key) || activeSessionKeys.includes(`tiktok:${key}`)
  );
}

export function getYouTubeActiveVideo(
  state: BotState,
  channelId: string
): string | undefined {
  return state.youtubeActiveVideos[channelId];
}

export function setYouTubeActiveVideo(
  state: BotState,
  channelId: string,
  videoId: string
): void {
  state.youtubeActiveVideos[channelId] = videoId;
}

export function clearYouTubeActiveVideo(state: BotState, channelId: string): void {
  delete state.youtubeActiveVideos[channelId];
}

function errorKey(platform: Platform, target: string): string {
  return `${platform}:${target}`;
}

export function getPlatformError(
  state: BotState,
  platform: Platform,
  target: string
): PersistedPlatformError | undefined {
  return state.platformErrors[errorKey(platform, target)];
}

export function setPlatformError(
  state: BotState,
  error: PersistedPlatformError
): void {
  state.platformErrors[errorKey(error.platform, error.target)] = error;
}

export function clearPlatformError(
  state: BotState,
  platform: Platform,
  target: string
): void {
  delete state.platformErrors[errorKey(platform, target)];
}

export function setDetectorDiagnostic(
  state: BotState,
  diagnostic: TikTokDetectorDiagnostic
): void {
  state.detectorDiagnostics[diagnostic.target] = diagnostic;
}

export function getDeliveryError(
  state: BotState,
  sessionKey: string
): PersistedDeliveryError | undefined {
  return state.deliveryErrors[sessionKey];
}

export function setDeliveryError(
  state: BotState,
  error: PersistedDeliveryError
): void {
  state.deliveryErrors[error.sessionKey] = error;
}

export function clearDeliveryError(state: BotState, sessionKey: string): void {
  delete state.deliveryErrors[sessionKey];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((result, [key, item]) => {
    if (key.length > 0 && typeof item === 'string' && item.length > 0) {
      result[key] = item;
    }
    return result;
  }, {});
}

function platformErrorRecord(value: unknown): Record<string, PersistedPlatformError> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, PersistedPlatformError] => {
      const error = entry[1];
      return isRecord(error)
        && typeof error.fingerprint === 'string'
        && (error.platform === 'tiktok' || error.platform === 'youtube')
        && typeof error.target === 'string'
        && typeof error.errorCode === 'string'
        && typeof error.message === 'string'
        && typeof error.firstSeenAt === 'string';
    })
  );
}

function detectorDiagnosticRecord(value: unknown): Record<string, TikTokDetectorDiagnostic> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, TikTokDetectorDiagnostic] => {
      const diagnostic = entry[1];
      return isRecord(diagnostic)
        && entry[0] === diagnostic.target
        && diagnostic.platform === 'tiktok'
        && boundedText(diagnostic.target, 100)
        && (diagnostic.classification === 'live'
          || diagnostic.classification === 'offline'
          || diagnostic.classification === 'error')
        && isStringArray(diagnostic.sourceOutcomes)
        && diagnostic.sourceOutcomes.length <= 12
        && diagnostic.sourceOutcomes.every((item) => boundedText(item, 80))
        && (diagnostic.roomIdSuffix === undefined
          || /^\d{1,8}$/u.test(diagnostic.roomIdSuffix as string))
        && (diagnostic.errorCode === undefined
          || boundedCode(diagnostic.errorCode))
        && validTimestamp(diagnostic.observedAt);
    })
  );
}

function deliveryErrorRecord(value: unknown): Record<string, PersistedDeliveryError> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, PersistedDeliveryError] => {
      const error = entry[1];
      return isRecord(error)
        && entry[0] === error.sessionKey
        && (error.platform === 'tiktok' || error.platform === 'youtube')
        && boundedText(error.target, 100)
        && boundedText(error.sessionKey, 300)
        && (error.stage === 'configuration' || error.stage === 'preview' || error.stage === 'discord')
        && boundedCode(error.errorCode)
        && validTimestamp(error.firstSeenAt)
        && validTimestamp(error.lastSeenAt)
        && Number.isSafeInteger(error.attemptCount)
        && (error.attemptCount as number) > 0
        && (error.attemptCount as number) <= 1_000_000
        && (error.alertSentAt === undefined || validTimestamp(error.alertSentAt));
    })
  );
}

function boundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function boundedCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9_]{1,80}$/u.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 30
    && Number.isFinite(Date.parse(value));
}
