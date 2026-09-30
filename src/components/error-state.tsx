"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import type { TransferError } from "@/types/transfer";

/**
 * Meaningful failure display: what happened, whether anything was lost,
 * and what to do next. Never a bare spinner.
 */
export function ErrorState({
  error,
  onRetry,
  onDismiss,
  title = "Something went wrong",
  className,
}: {
  error: TransferError;
  onRetry?: () => void;
  onDismiss?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-danger/30 bg-danger/5 p-6 ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-danger">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
            {error.message}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{lostNote(error.code)}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </Button>
            )}
            <Link href="/send" tabIndex={-1}>
              <Button size="sm" variant="secondary" tabIndex={-1}>
                Start a new transfer
              </Button>
            </Link>
            {onDismiss && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function lostNote(code: TransferError["code"]): string {
  switch (code) {
    case "room_not_found":
    case "room_expired":
    case "room_revoked":
    case "room_cancelled":
      return "Nothing was lost — files never left the sender's device.";
    case "peer_disconnected":
      return "Anything already transferred arrived intact; the rest stayed with the sender.";
    case "integrity_failed":
      return "Nothing was saved — the corrupted data was discarded.";
    case "storage_full":
      return "Nothing was saved. Free up space or choose fewer files.";
    case "signaling_unavailable":
      return "No data was affected — files transfer directly between browsers.";
    case "webrtc_failed":
      return "No data was transferred. Files stay on the sender's device.";
    default:
      return "No data was affected.";
  }
}
