/**
 * Shared TypeScript types for PostNotify live monitoring.
 */

/** Info about an active TikTok or YouTube broadcast. */
export interface LiveInfo {
  /** Platform that supplied this live broadcast. */
  platform: 'tiktok' | 'youtube';
  /** Whether the streamer is currently live. */
  isLive: true;
  /** TikTok username or YouTube channel ID, used for state deduplication. */
  username: string;
  /** Human-readable creator or channel name. */
  displayName: string;
  /** Unique room/video ID — used to deduplicate notifications. */
  roomId: string;
  /** Stream title as set by the creator. */
  title: string;
  /** Current number of live viewers (may be 0 if unavailable). */
  viewerCount: number;
  /** URL to the live stream thumbnail image. */
  thumbnailUrl: string | null;
  /** URL to the creator profile picture. */
  profilePicUrl: string | null;
  /** Direct link to the active live stream. */
  liveUrl: string;
  /** Direct link to the creator/channel profile. */
  profileUrl: string;
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
   * Format: "platform:username:roomId"
   */
  activeLiveSessions: string[];
}
