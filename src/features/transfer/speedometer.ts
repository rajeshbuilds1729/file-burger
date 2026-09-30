/**
 * Smoothed transfer-speed estimation (exponential moving average) and ETA.
 */

export class Speedometer {
  private lastBytes = 0;
  private lastTime = 0;
  private speedValue = 0;

  constructor(private readonly alpha = 0.3) {}

  /** Sample the current byte counter; returns the smoothed speed in B/s. */
  sample(bytes: number, now = Date.now()): number {
    if (this.lastTime === 0) {
      this.lastTime = now;
      this.lastBytes = bytes;
      return this.speedValue;
    }
    const dtSeconds = (now - this.lastTime) / 1000;
    if (dtSeconds <= 0) return this.speedValue;
    const instant = (bytes - this.lastBytes) / dtSeconds;
    if (instant >= 0) {
      this.speedValue =
        this.speedValue === 0
          ? instant
          : this.speedValue * (1 - this.alpha) + instant * this.alpha;
    }
    this.lastTime = now;
    this.lastBytes = bytes;
    return this.speedValue;
  }

  get value(): number {
    return this.speedValue;
  }
}

/** Estimated seconds remaining given remaining bytes and speed. */
export function estimateEta(
  remainingBytes: number,
  bytesPerSecond: number,
): number {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return Infinity;
  if (remainingBytes <= 0) return 0;
  return remainingBytes / bytesPerSecond;
}
