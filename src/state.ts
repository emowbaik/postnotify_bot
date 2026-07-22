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
import type { BotState } from './types.js';

const STATE_FILE = path.resolve(
  fileURLToPath(new URL('../state.json', import.meta.url))
);

const DEFAULT_STATE: BotState = {
  activeLiveSessions: [],
};

/** Load the current state from state.json, falling back to empty defaults. */
export function loadState(): BotState {
  if (!existsSync(STATE_FILE)) {
    return { ...DEFAULT_STATE };
  }

  try {
    const raw = readFileSync(STATE_FILE, 'utf8').trim();
    if (!raw) return { ...DEFAULT_STATE };

    const parsed = JSON.parse(raw) as { activeLiveSessions?: unknown };

    return {
      activeLiveSessions: Array.isArray(parsed.activeLiveSessions)
        ? (parsed.activeLiveSessions as string[])
        : [],
    };
  } catch {
    console.warn('Failed to parse state.json — starting fresh.');
    return { ...DEFAULT_STATE };
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

/**
 * Remove sessions that are no longer active (streamer went offline).
 * This allows a new notification to fire the next time the streamer goes live.
 */
export function pruneOfflineSessions(
  state: BotState,
  activeSessionKeys: string[]
): void {
  state.activeLiveSessions = state.activeLiveSessions.filter((key) =>
    activeSessionKeys.includes(key) || activeSessionKeys.includes(`tiktok:${key}`)
  );
}
