/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Good enough to blunt obvious abuse (room flooding, signaling spam) for a
 * single-instance deployment. It is not a distributed rate limiter — see
 * docs/SECURITY.md for honest limitations.
 */

interface Window {
  timestamps: number[];
}

export interface RateLimiter {
  /** Returns true when the action is allowed for this key. */
  check(key: string): boolean;
  /** Trim expired windows; call periodically or rely on lazy trimming. */
  sweep(now: number): void;
}

export interface RateLimiterOptions {
  /** Maximum events per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs } = options;
  const windows = new Map<string, Window>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      let window = windows.get(key);
      if (!window) {
        window = { timestamps: [] };
        windows.set(key, window);
      }
      window.timestamps = window.timestamps.filter(
        (timestamp) => now - timestamp < windowMs,
      );
      if (window.timestamps.length >= limit) {
        return false;
      }
      window.timestamps.push(now);
      return true;
    },
    sweep(now: number): void {
      for (const [key, window] of windows) {
        window.timestamps = window.timestamps.filter(
          (timestamp) => now - timestamp < windowMs,
        );
        if (window.timestamps.length === 0) windows.delete(key);
      }
    },
  };
}
