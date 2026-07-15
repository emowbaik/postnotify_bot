/**
 * Shared TypeScript types for the TikTok Live Notifier Bot.
 */

/** Info about a TikTok live stream. */
export interface LiveInfo {
  /** Whether the streamer is currently live. */
  isLive: true;
  /** TikTok username (without @). */
  username: string;
  /** Unique room/session ID — used to deduplicate notifications. */
  roomId: string;
  /** Stream title as set by the streamer. */
  title: string;
  /** Current number of live viewers (may be 0 if unavailable). */
  viewerCount: number;
  /** URL to the live stream thumbnail image. */
  thumbnailUrl: string | null;
  /** Direct link to the TikTok live stream. */
  liveUrl: string;
  /** ISO timestamp of when the live started. */
  startedAt: string;
}

/** Returned when a streamer is NOT live, or when the check fails. */
export interface NotLiveInfo {
  isLive: false;
  username: string;
}

export type LiveCheckResult = LiveInfo | NotLiveInfo;

/** Persisted state stored in state.json and committed to the repo. */
export interface BotState {
  /**
   * Set of session keys that have already been notified.
   * Format: "username:roomId"
   */
  activeLiveSessions: string[];
}
