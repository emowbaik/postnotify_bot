/**
 * State management — loads and saves state.json to track which live sessions
 * have already been notified, preventing duplicate Discord notifications.
 *
 * The state file is committed back to the repository by the GitHub Actions
 * workflow after each run, so it persists across workflow executions.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type {
  BotState,
  PersistedPlatformError,
  Platform,
} from './types.js';

const STATE_FILE = path.resolve(
  fileURLToPath(new URL('../state.json', import.meta.url))
);

const DEFAULT_STATE: BotState = {
  activeLiveSessions: [],
  youtubeActiveVideos: {},
  platformErrors: {},
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
  };
}

/** Load the current state from state.json, falling back to empty defaults. */
export function loadState(): BotState {
  if (!existsSync(STATE_FILE)) return structuredClone(DEFAULT_STATE);

  try {
    const raw = readFileSync(STATE_FILE, 'utf8').trim();
    return raw ? normalizeBotState(JSON.parse(raw) as unknown) : structuredClone(DEFAULT_STATE);
  } catch {
    console.warn('Failed to parse state.json — starting fresh.');
    return structuredClone(DEFAULT_STATE);
  }
}

/** Persist the current state to state.json. */
export function saveState(state: BotState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
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
  state.activeLiveSessions = state.activeLiveSessions.filter(
    (key) => !key.startsWith(prefix) || key === activeSessionKey
  );
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
