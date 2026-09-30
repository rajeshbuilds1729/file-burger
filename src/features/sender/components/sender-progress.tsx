"use client";

import { Clock, Gauge, Pause, Play, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ConnectionBadge, PhaseBadge } from "@/components/status-badge";
import { formatBytes, formatDuration, formatSpeed, fileExtension } from "@/lib/format";
import type { SenderEngineState } from "../engine";
import type { ReceiverSummary } from "@/types/transfer";

/**
 * Premium transfer dashboard for the sender: current file, overall progress,
 * speed, ETA, connection state, per-receiver progress.
 */
export function SenderProgress({
  state,
  onPauseReceiver,
  onResumeReceiver,
  onKick,
}: {
  state: SenderEngineState;
  onPauseReceiver: (peerId: string) => void;
  onResumeReceiver: (peerId: string) => void;
  onKick: (peerId: string) => void;
}) {
  const currentFile = state.files.find((file) => file.id === state.currentFileId);
  const active = state.phase === "transferring";

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

        {currentFile && (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium" title={currentFile.name}>
                {currentFile.name}
                {fileExtension(currentFile.name) && (
                  <span className="ml-2 text-xs font-normal uppercase text-muted-foreground">
                    {fileExtension(currentFile.name)}
                  </span>
                )}
              </p>
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {Math.round(state.totalSize > 0 ? (state.totalBytes / state.totalSize) * 100 : 0)}%
              </p>
            </div>
            <Progress
              value={state.totalSize > 0 ? state.totalBytes / state.totalSize : 0}
              active={active}
              className="mt-2"
              ariaLabel={`Overall transfer progress: ${Math.round(
                state.totalSize > 0 ? (state.totalBytes / state.totalSize) * 100 : 0,
              )}%`}
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
        )}

        {!currentFile && state.phase !== "completed" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Waiting for a receiver to accept the transfer. Keep this tab open.
          </p>
        )}
      </div>

      <ReceiverList
        receivers={state.receivers}
        onPause={onPauseReceiver}
        onResume={onResumeReceiver}
        onKick={onKick}
      />
    </div>
  );
}

function ReceiverList({
  receivers,
  onPause,
  onResume,
  onKick,
}: {
  receivers: ReceiverSummary[];
  onPause: (peerId: string) => void;
  onResume: (peerId: string) => void;
  onKick: (peerId: string) => void;
}) {
  if (receivers.length === 0) return null;
  const connectedCount = receivers.filter(
    (receiver) => receiver.state !== "cancelled" && receiver.state !== "failed",
  ).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-sm font-semibold tracking-tight" aria-live="polite">
        {connectedCount} {connectedCount === 1 ? "receiver" : "receivers"} connected
      </h3>
      <ul className="mt-3.5 space-y-3">
        {receivers.map((receiver) => (
          <li
            key={receiver.peerId}
            className="rounded-xl border border-border bg-muted/60 p-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <StatusDot state={receiver.state} />
                <span className="min-w-0 truncate text-sm font-medium capitalize">
                  {receiver.state}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(receiver.progress * 100)}%
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {receiver.state === "transferring" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onPause(receiver.peerId)}
                    aria-label="Pause this receiver"
                    title="Pause"
                  >
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
                {receiver.state === "paused" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onResume(receiver.peerId)}
                    aria-label="Resume this receiver"
                    title="Resume"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onKick(receiver.peerId)}
                  aria-label="Disconnect this receiver"
                  title="Disconnect"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            <Progress value={receiver.progress} className="mt-2.5 h-1.5" ariaLabel={`Receiver progress ${Math.round(receiver.progress * 100)}%`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ state }: { state: ReceiverSummary["state"] }) {
  const className =
    state === "completed"
      ? "bg-success"
      : state === "failed" || state === "cancelled"
        ? "bg-danger"
        : state === "paused"
          ? "bg-warning"
          : state === "transferring"
            ? "bg-accent"
            : "bg-border";
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 rounded-full ${className} ${
        state === "transferring" ? "breathe" : ""
      }`}
    />
  );
}
