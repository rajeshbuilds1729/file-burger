"use client";

import { cn } from "@/lib/utils";

/**
 * Progress bar with a smooth fill transition and an optional shimmer while
 * actively transferring. Width is driven by `value` (0..1).
 */
export function Progress({
  value,
  active = false,
  className,
  ariaLabel,
}: {
  value: number;
  active?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const percent = Math.round(clamped * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={ariaLabel}
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-muted",
        active && clamped < 1 && "progress-shimmer",
        className,
      )}
    >
      <div
        className="progress-fill h-full rounded-full bg-gradient-to-r from-accent-strong to-accent"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
