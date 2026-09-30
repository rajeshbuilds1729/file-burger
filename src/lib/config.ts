/**
 * Shared configuration. Values come from environment variables where available
 * and always degrade to safe defaults so the app runs with zero configuration.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function int(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Public base URL of the deployment (used for share links, QR codes, metadata). */
export const SITE_URL = env("NEXT_PUBLIC_SITE_URL") ?? "";

/** Transfer sessions auto-expire after this many hours. */
export const SESSION_TTL_HOURS = Math.min(
  72,
  Math.max(1, int("SESSION_TTL_HOURS", 6)),
);

export const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

/** STUN servers used for NAT traversal. Public, free, no credentials. */
export const DEFAULT_STUN_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun.cloudflare.com:3478",
];

/**
 * Optional TURN servers, served to browsers via /api/ice.
 *
 * SECURITY NOTE: with static TURN credentials these are readable by anyone
 * using the site. For production, prefer short-lived credentials from a
 * credential API (see docs/DEPLOYMENT.md).
 */
export const TURN_URLS: string[] = parseJsonArray(env("NEXT_PUBLIC_TURN_URLS"));

export const TURN_USERNAME = env("NEXT_PUBLIC_TURN_USERNAME");
export const TURN_CREDENTIAL = env("NEXT_PUBLIC_TURN_CREDENTIAL");

/** Extra origins allowed to open the WebSocket signaling connection. */
export const ALLOWED_ORIGINS = (env("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  } catch {
    return [];
  }
}

/** Limits applied by the signaling server to abuse oversized payloads. */
export const SIGNAL_LIMITS = {
  /** Max size of a single signaling message (WebSockets + HTTP bodies). */
  maxSignalBytes: 128 * 1024,
  /** Max number of files announced per transfer. */
  maxFiles: 512,
  /** Max size of the serialized file manifest. */
  maxManifestBytes: 256 * 1024,
  /** Max queued signals per peer before new ones are dropped. */
  maxQueuedSignals: 64,
} as const;

/** File transfer protocol constants. */
export const TRANSFER = {
  protocolVersion: 1,
  /** Starting chunk size (16 KiB is safe in every modern browser). */
  minChunkSize: 16 * 1024,
  /** Chunks adaptively grow up to this size. */
  maxChunkSize: 64 * 1024,
  /** Sender pauses reading once this much is buffered on the channel. */
  highWaterMark: 4 * 1024 * 1024,
  /** Resume reading once buffering drains below this. */
  lowWaterMark: 1 * 1024 * 1024,
  /** Files up to this size accumulate in memory; larger ones go to IndexedDB. */
  memorySinkLimit: 64 * 1024 * 1024,
  /** Progress UI update interval (ms). */
  progressIntervalMs: 400,
  /** Receiver reconnect attempts after a dropped connection. */
  reconnectAttempts: 3,
  /** Files larger than this get a warning during selection. */
  largeFileWarningBytes: 2 * 1024 * 1024 * 1024,
} as const;
