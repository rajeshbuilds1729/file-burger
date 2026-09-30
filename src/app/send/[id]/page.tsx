"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Clock, File as FileIconLucide, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/error-state";
import { ShareCard } from "@/features/sender/components/share-card";
import { SenderProgress } from "@/features/sender/components/sender-progress";
import { SenderCompletion } from "@/features/sender/components/sender-completion";
import { SenderEngine, type SenderEngineState } from "@/features/sender/engine";
import { useExistingSenderEngine } from "@/features/sender/use-sender";
import { formatTransferId } from "@/lib/ids";
import { formatBytes } from "@/lib/format";
import type { FileMetaWithHash } from "@/types/transfer";

export default function SenderTransferPage() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const roomId = rawId ? rawId.replace(/[\s-_.]/g, "").toUpperCase() : "";
  const { engine, state } = useExistingSenderEngine(roomId);

  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);

  const recoveredKey =
    !engine && roomId ? SenderEngine.getRecoveredOwnerKey(roomId) : null;

  const handleRevoke = useCallback(async () => {
    if (!roomId || revoking) return;
    setRevoking(true);
    try {
      await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "DELETE",
        headers: recoveredKey
          ? { "x-owner-key": recoveredKey }
          : undefined,
      });
    } catch {
      // Best effort.
    }
    setRevoked(true);
  }, [roomId, recoveredKey, revoking]);

  const handleCancel = useCallback(async () => {
    if (!engine) return;
    setRevoking(true);
    await engine.cancel();
    setRevoked(true);
    await engine.dispose();
  }, [engine]);

  // Ensure the engine's resources are released when leaving a terminal state.
  useEffect(() => {
    if (
      engine &&
      (state?.phase === "completed" || state?.phase === "cancelled") &&
      !revoking
    ) {
      void engine.dispose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase]);

  if (revoked) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-10">
          <Link2Off className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
            Transfer revoked
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            The transfer link is no longer valid. Nothing was stored anywhere —
            files stayed on your device.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/send" tabIndex={-1}>
              <Button tabIndex={-1}>Send new files</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (engine && state) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div aria-live="polite" className="space-y-5">
          {state.phase === "completed" ? (
            <>
              <SenderCompletion state={state} />
              <FilesSummary state={state} />
              <div className="flex justify-center">
                <Link href="/send" tabIndex={-1}>
                  <Button variant="secondary" tabIndex={-1}>
                    Send more files
                  </Button>
                </Link>
              </div>
            </>
          ) : state.phase === "failed" ||
            state.phase === "expired" ||
            state.phase === "cancelled" ? (
            <>
              {state.error ? (
                <ErrorState
                  error={state.error}
                  title={
                    state.phase === "expired"
                      ? "Transfer expired"
                      : state.phase === "cancelled"
                        ? "Transfer cancelled"
                        : "Transfer failed"
                  }
                />
              ) : (
                <ErrorState
                  error={{ code: "unknown", message: "The transfer ended unexpectedly." }}
                />
              )}
            </>
          ) : (
            <>
              <ShareCard
                shareUrl={state.shareUrl ?? ""}
                roomId={roomId}
                expiresAt={state.expiresAt}
              />
              <SenderProgress
                state={state}
                onPauseReceiver={(peerId) => engine.pauseReceiver(peerId)}
                onResumeReceiver={(peerId) => engine.resumeReceiver(peerId)}
                onKick={(peerId) => engine.kick(peerId)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Keep this tab open until the transfer finishes — closing it
                  ends the transfer for everyone.
                </p>
                <div className="flex gap-2.5">
                  <Button size="sm" variant="ghost" onClick={() => void handleCancel()}>
                    Cancel transfer
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (recoveredKey) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6 sm:p-8">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">
            Session interrupted
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {"This page was reloaded, so the transfer engine was reset. The link "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {formatTransferId(roomId)}
            </code>{" "}
            {"still exists, but the files were lost from this tab \u2014 the transfer can\u2019t resume. Recipients will see the transfer end."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button variant="outline" onClick={() => void handleRevoke()} loading={revoking}>
              <Link2Off className="h-4 w-4" aria-hidden="true" />
              Revoke link
            </Button>
            <Link href="/send" tabIndex={-1}>
              <Button variant="secondary" tabIndex={-1}>
                Start a new transfer
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <ErrorState
        error={{
          code: "room_not_found",
          message:
            "This transfer link isn't valid for this browser. Transfers are tied to the tab that created them — ask the sender for their link, or start a new transfer.",
        }}
        title="Transfer not found"
      />
    </div>
  );
}

/** Per-file status list for the sender dashboard. */
function FilesSummary({ state }: { state: SenderEngineState }) {
  const files: FileMetaWithHash[] = state.files;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h3 className="text-sm font-semibold tracking-tight">Transferred files</h3>
      <ul className="mt-3.5 space-y-2">
        {files.map((file) => {
          const isDone = state.doneFileIds.includes(file.id);
          const isCurrent = state.currentFileId === file.id;
          return (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileIconLucide className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm" title={file.name}>
                  {file.name}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Sent
                  </span>
                ) : isCurrent ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                    <Clock className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
                    Sending
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Pending</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
