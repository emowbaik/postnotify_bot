/**
 * Shared TypeScript types for PostNotify live monitoring.
 */

export type Platform = 'tiktok' | 'youtube';

/** Info about an active TikTok or YouTube broadcast. */
export interface LiveInfo {
  /** Discriminant for successful active broadcasts. */
  status: 'live';
  /** Platform that supplied this live broadcast. */
  platform: Platform;
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

/** Returned when a confirmed check shows that a creator is offline. */
export interface NotLiveInfo {
  status: 'offline';
  isLive: false;
  platform: Platform;
  username: string;
}

/** Returned when a live-status check could not complete reliably. */
export interface LiveCheckError {
  status: 'error';
  isLive: false;
  platform: Platform;
  username: string;
  errorCode: string;
  message: string;
}

export type LiveCheckResult = LiveInfo | NotLiveInfo | LiveCheckError;

export interface PersistedPlatformError {
  fingerprint: string;
  platform: Platform;
  target: string;
  errorCode: string;
  message: string;
  firstSeenAt: string;
}

/** Persisted state stored in state.json and committed to the repo. */
export interface BotState {
  /**
   * Set of session keys that have already been notified.
   * Format: "platform:username:roomId"
   */
  activeLiveSessions: string[];
  /** Last known active YouTube video per channel ID. */
  youtubeActiveVideos: Record<string, string>;
  /** Last Discord-notified platform error per target. */
  platformErrors: Record<string, PersistedPlatformError>;
}
