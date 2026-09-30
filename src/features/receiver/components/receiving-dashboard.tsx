"use client";

import { Check, Clock, Gauge, Pause, Play, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ConnectionBadge, PhaseBadge } from "@/components/status-badge";
import { formatBytes, formatDuration, formatSpeed } from "@/lib/format";
import type { ReceiverEngineState } from "../engine";
import type { ReceiverFile } from "@/lib/webrtc/receiver-transfer";

/**
 * Premium transfer dashboard for the receiver: current file, overall
 * progress, speed, ETA, connection state, per-file status.
 */
export function ReceivingDashboard({
  state,
  onPause,
  onResume,
  onCancel,
}: {
  state: ReceiverEngineState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const active = state.phase === "transferring";
  const percent = state.totalSize > 0 ? state.totalBytes / state.totalSize : 0;

  return (
    <div className="space-y-5" aria-live="polite">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight">
              Serving your files…
            </h2>
            <PhaseBadge phase={state.phase} />
          </div>
          <ConnectionBadge quality={state.connectionQuality} />
        </div>

        <div className="mt-5">
          {state.currentFileName && (
            <p className="mb-2 min-w-0 truncate text-sm font-medium" title={state.currentFileName}>
              {state.currentFileName}
            </p>
          )}
          <Progress value={percent} active={active} ariaLabel={`Transfer progress ${Math.round(percent * 100)}%`} />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono text-sm tabular-nums text-foreground">
              {Math.round(percent * 100)}%
            </span>
            <span className="font-mono tabular-nums">
              {formatBytes(state.totalBytes)} / {formatBytes(state.totalSize)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              {formatSpeed(state.speed)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              ETA {Number.isFinite(state.etaSeconds) ? formatDuration(state.etaSeconds) : "—"}
            </span>
          </div>
        </div>
      </div>

      {state.files && state.files.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h3 className="text-sm font-semibold tracking-tight">Files</h3>
          <ul className="mt-3.5 space-y-2">
            {state.files.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Keep this tab open until the transfer finishes.
        </p>
        <div className="flex gap-2">
          {state.phase === "transferring" && (
            <Button size="sm" variant="outline" onClick={onPause}>
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              Pause
            </Button>
          )}
          {state.phase === "paused" && (
            <Button size="sm" variant="outline" onClick={onResume}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileRow({ file }: { file: ReceiverFile }) {
  const percent = file.size > 0 ? file.receivedBytes / file.size : 0;
  return (
    <li className="rounded-xl border border-border bg-muted/60 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm" title={file.name}>
          {file.name}
        </span>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {file.status === "completed"
              ? formatBytes(file.size)
              : `${formatBytes(file.receivedBytes)} / ${formatBytes(file.size)}`}
          </span>
          {file.status === "completed" ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Verified
            </span>
          ) : file.status === "failed" ? (
            <span className="text-xs font-medium text-danger">Failed</span>
          ) : (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {Math.round(percent * 100)}%
            </span>
          )}
        </div>
      </div>
      {file.status !== "completed" && file.status !== "failed" && (
        <Progress value={percent} className="mt-2 h-1.5" ariaLabel={`${file.name} progress`} />
      )}
    </li>
  );
}
