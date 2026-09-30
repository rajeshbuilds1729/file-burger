"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BurgerMark } from "@/components/logo";
import { ErrorState } from "@/components/error-state";
import { PhaseBadge } from "@/components/status-badge";
import { ReceiverEngine } from "@/features/receiver/engine";
import { AcceptGate } from "@/features/receiver/components/accept-gate";
import { ReceivingDashboard } from "@/features/receiver/components/receiving-dashboard";
import { ReceiverCompletion } from "@/features/receiver/components/receiver-completion";

export function useReceiverEngine(roomId: string) {
  const [engine] = useState(() => new ReceiverEngine(roomId));
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getState,
    () => engine.getState(),
  );

  useEffect(() => {
    void engine.open();
    return () => {
      void engine.dispose();
    };
  }, [engine]);

  return { engine, state };
}

export function ReceiverScreen({ roomId }: { roomId: string }) {
  const { engine, state } = useReceiverEngine(roomId);

  switch (state.phase) {
    case "connecting":
      return (
        <Shell>
          <LoadingScreen />
        </Shell>
      );
    case "waiting":
      return (
        <Shell>
          {state.metadataFiles && state.metadataFiles.length > 0 ? (
            <AcceptGate
              files={state.metadataFiles}
              requiresPassword={state.requiresPassword}
              onVerify={(password) => engine.verifyPassword(password)}
              onAccept={(options) => void engine.acceptTransfer(options)}
              onDecline={() => engine.decline()}
              connecting={false}
            />
          ) : (
            <LoadingScreen />
          )}
        </Shell>
      );
    case "negotiating":
    case "reconnecting":
      return (
        <Shell>
          <div className="rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
            <BurgerMark className="breathe mx-auto h-12 w-14" />
            <h2 className="mt-5 text-lg font-semibold tracking-tight">
              {state.phase === "reconnecting"
                ? "Reconnecting…"
                : "Connecting to the sender…"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Establishing an encrypted browser-to-browser connection. This
              usually takes a few seconds.
            </p>
            <div className="mt-5 flex justify-center">
              <PhaseBadge phase={state.phase} />
            </div>
          </div>
        </Shell>
      );
    case "transferring":
    case "paused":
      return (
        <Shell>
          <ReceivingDashboard
            state={state}
            onPause={() => engine.pause()}
            onResume={() => engine.resume()}
            onCancel={() => engine.cancel()}
          />
        </Shell>
      );
    case "completed":
      return (
        <Shell>
          <ReceiverCompletion state={state} />
        </Shell>
      );
    case "declined":
      return (
        <Shell>
          <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-10">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Transfer declined
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              You declined this transfer. Nothing was downloaded.
            </p>
          </div>
        </Shell>
      );
    case "cancelled":
      return (
        <Shell>
          <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-10">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Transfer cancelled
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {state.error?.message ??
                "The transfer was cancelled. Nothing further was transferred."}
            </p>
          </div>
        </Shell>
      );
    default:
      return (
        <Shell>
          {state.error ? (
            <ErrorState
              error={state.error}
              onRetry={() => {
                void engine.open();
              }}
              title={
                state.error.code === "room_expired" || state.error.code === "room_revoked"
                  ? "Transfer unavailable"
                  : "Transfer failed"
              }
            />
          ) : (
            <LoadingScreen />
          )}
        </Shell>
      );
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {children}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
      <BurgerMark className="breathe mx-auto h-12 w-14" />
      <h2 className="mt-5 text-lg font-semibold tracking-tight">
        Preparing the transfer…
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Loading the transfer details.
      </p>
    </div>
  );
}
