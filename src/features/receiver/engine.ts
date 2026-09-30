/**
 * Receiver engine: top-level orchestrator for receiving a transfer.
 *
 * Responsibilities:
 *  - fetch transfer metadata (password gate handled here)
 *  - explicit accept/decline — no bytes move before the receiver accepts
 *  - WebRTC connection (receiver-initiated offer) over the signaling layer
 *  - one ReceiverTransfer per connection, with automatic reconnects
 *  - state snapshots for React (via useSyncExternalStore)
 */

import { SignalingClient } from "@/lib/signaling/client";
import type { ServerSignal } from "@/lib/signaling/types";
import { createPeerConnection, defaultIceConfig } from "@/lib/webrtc/peer";
import {
  ReceiverTransfer,
  type ReceiverFile,
  type ReceiverState,
  type ReceiverTransferSnapshot,
} from "@/lib/webrtc/receiver-transfer";
import { createPhaseMachine, type PhaseMachine } from "@/features/transfer/state-machine";
import { pickDirectory, supportsFileSystemAccess, type SinkResult } from "@/lib/files/sink";
import { deriveVerifier } from "@/lib/crypto/password";
import type {
  ConnectionQuality,
  FileMeta,
  TransferError,
  TransferPhase,
} from "@/types/transfer";

export interface ReceiverEngineState {
  phase: TransferPhase;
  roomId: string;
  /** Pre-accept file list from the server. */
  metadataFiles: FileMeta[] | null;
  /** Live per-file state once the transfer starts. */
  files: ReceiverFile[] | null;
  requiresPassword: boolean;
  /** Unlocked via a correct password (for UI display). */
  unlocked: boolean;
  expiresAt: number | null;
  currentFileId: string | null;
  currentFileName: string | null;
  fileBytes: number;
  totalBytes: number;
  totalSize: number;
  progress: number;
  speed: number;
  etaSeconds: number;
  connectionQuality: ConnectionQuality;
  signalingKind: "ws" | "http" | null;
  error: TransferError | null;
  /** Received file blobs by file ID (null blob = already saved to disk). */
  results: Record<string, SinkResult>;
  /** Completion stats. */
  durationSeconds: number;
  avgSpeed: number;
}

export class ReceiverEngine {
  private readonly machine: PhaseMachine;
  private signaling: SignalingClient | null = null;
  private pc: RTCPeerConnection | null = null;
  private transfer: ReceiverTransfer | null = null;
  private iceServers: RTCIceServer[] = defaultIceConfig().iceServers;
  private metadataFiles: FileMeta[] | null = null;
  private requiresPassword = false;
  private unlocked = false;
  private salt: string | null = null;
  private expiresAt: number | null = null;
  private connectionQuality: ConnectionQuality = "unknown";
  private signalingKind: "ws" | "http" | null = null;
  private error: TransferError | null = null;
  private reconnecting = false;
  private stopped = false;
  private hadConnection = false;
  private durationSeconds = 0;
  private avgSpeed = 0;

  private listeners = new Set<() => void>();
  private snapshotCache: ReceiverEngineState;

  constructor(private readonly roomId: string) {
    this.machine = createPhaseMachine("idle");
    this.snapshotCache = this.computeSnapshot();
  }

  // ── React store interface ────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ReceiverEngineState => this.snapshotCache;

  private emit(): void {
    this.snapshotCache = this.computeSnapshot();
    for (const listener of this.listeners) listener();
  }

  private computeSnapshot(): ReceiverEngineState {
    const transferSnapshot = this.transfer?.snapshot ?? null;
    const files = transferSnapshot?.files ?? null;
    const totalSize =
      transferSnapshot?.totalSize ??
      (this.metadataFiles
        ? this.metadataFiles.reduce((total, file) => total + file.size, 0)
        : 0);
    const currentFile = transferSnapshot?.currentFileId
      ? files?.find((file) => file.id === transferSnapshot.currentFileId) ?? null
      : null;
    return {
      phase: this.machine.phase,
      roomId: this.roomId,
      metadataFiles: this.metadataFiles,
      files,
      requiresPassword: this.requiresPassword,
      unlocked: this.unlocked,
      expiresAt: this.expiresAt,
      currentFileId: currentFile?.id ?? null,
      currentFileName: currentFile?.name ?? null,
      fileBytes: transferSnapshot?.fileBytes ?? 0,
      totalBytes: transferSnapshot?.totalReceivedBytes ?? 0,
      totalSize,
      progress: transferSnapshot?.progress ?? 0,
      speed: transferSnapshot?.speed ?? 0,
      etaSeconds: transferSnapshot?.etaSeconds ?? Infinity,
      connectionQuality: this.connectionQuality,
      signalingKind: this.signalingKind,
      error: this.error,
      results: transferSnapshot?.results ?? {},
      durationSeconds: this.durationSeconds,
      avgSpeed: this.avgSpeed,
    };
  }

  // ── metadata ─────────────────────────────────────────────────────────────

  /** Fetch transfer metadata. Call once when the page opens. */
  async open(): Promise<void> {
    if (this.stopped) return;
    this.machine.reset("connecting");
    this.emit();
    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(this.roomId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | {
            requiresPassword?: boolean;
            salt?: string;
            expiresAt?: number;
            files?: FileMeta[];
            error?: string;
            message?: string;
          }
        | null;

      if (response.status === 404) {
        this.failWithError({
          code: (body?.error as TransferError["code"]) ?? "room_not_found",
          message:
            body?.message ??
            "This transfer doesn't exist, has expired, or was revoked. Ask the sender for a fresh link.",
        });
        return;
      }
      if (response.status === 429) {
        this.failWithError({
          code: "rate_limited",
          message: "Too many requests. Wait a moment and try again.",
        });
        return;
      }
      if (!response.ok || !body) {
        this.failWithError({
          code: "unknown",
          message: "Could not load the transfer details. Try again.",
        });
        return;
      }

      this.expiresAt = body.expiresAt ?? null;
      if (body.requiresPassword) {
        this.requiresPassword = true;
        this.salt = body.salt ?? null;
        this.machine.dispatch("awaiting-accept");
        this.emit();
        return;
      }

      this.metadataFiles = body.files ?? [];
      this.machine.dispatch("awaiting-accept");
      this.emit();
    } catch {
      this.failWithError({
        code: "signaling_unavailable",
        message: "Could not reach the File Burger server. Check your connection.",
      });
    }
  }

  /**
   * Verify a password against the transfer. The verifier is derived locally;
   * only the verifier (not the plaintext password) is sent over TLS.
   */
  async verifyPassword(password: string): Promise<{ ok: boolean; error?: TransferError }> {
    if (!this.salt) return { ok: false };
    let verifier: string;
    try {
      verifier = await deriveVerifier(password, this.salt);
    } catch (error) {
      if (error instanceof Error && error.message === "insecure_context") {
        return {
          ok: false,
          error: {
            code: "invalid_input",
            message:
              "Password verification requires a secure connection (HTTPS or localhost).",
          },
        };
      }
      return {
        ok: false,
        error: { code: "unknown", message: "Could not verify the password." },
      };
    }
    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(this.roomId)}/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ verifier }),
          cache: "no-store",
        },
      );
      if (response.status === 403) {
        return {
          ok: false,
          error: {
            code: "password_mismatch",
            message: "That password doesn't match. Ask the sender and try again.",
          },
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: "rate_limited",
            message: "Too many attempts. Wait a moment and try again.",
          },
        };
      }
      const data = (await response.json()) as { files?: FileMeta[] };
      this.metadataFiles = data.files ?? [];
      this.unlocked = true;
      this.emit();
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: {
          code: "signaling_unavailable",
          message: "Could not reach the File Burger server.",
        },
      };
    }
  }

  // ── accept / decline ─────────────────────────────────────────────────────

  /**
   * Accept the transfer and start the P2P connection.
   * Must be called from a user gesture (for the optional directory picker).
   */
  async acceptTransfer(options: { saveToDisk?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    if (this.machine.phase !== "waiting") return;

    let directoryHandle: FileSystemDirectoryHandle | null = null;
    if (options.saveToDisk && supportsFileSystemAccess()) {
      directoryHandle = await pickDirectory();
    }
    this.lastDirectoryHandle = directoryHandle;

    this.machine.dispatch("negotiating");
    this.emit();

    try {
      await this.establishConnection(directoryHandle, 0);
    } catch (error) {
      this.handleConnectionFailure(error);
    }
  }

  decline(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.transfer?.decline();
    void this.signaling?.stop();
    this.machine.dispatch("transfer-declined");
    this.emit();
  }

  cancel(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.transfer?.cancel();
    void this.signaling?.stop();
    this.machine.dispatch("transfer-cancelled");
    this.emit();
  }

  pause(): void {
    this.transfer?.pause();
  }

  resume(): void {
    this.transfer?.resume();
  }

  /** Release resources. */
  async dispose(): Promise<void> {
    this.stopped = true;
    await this.signaling?.stop();
    this.signaling = null;
    try {
      this.pc?.close();
    } catch {
      // ignore
    }
    this.pc = null;
  }

  // ── connection ───────────────────────────────────────────────────────────

  private async establishConnection(
    directoryHandle: FileSystemDirectoryHandle | null,
    attempt: number,
  ): Promise<void> {
    await this.signaling?.stop();
    this.signaling = new SignalingClient({
      roomId: this.roomId,
      role: "receiver",
      onMessage: (signal) => this.handleSignalingMessage(signal),
      onStatus: (status, kind) => this.handleSignalingStatus(status, kind),
      onFatal: (code) => this.handleSignalingFatal(code),
    });
    await this.signaling.start();
    if (this.stopped) return;

    this.pc = createPeerConnection({
      iceServers: this.iceServers,
      onConnectionType: (quality) => {
        this.connectionQuality = quality;
        this.emit();
      },
    });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        void this.signaling
          ?.send("sender", "candidate", event.candidate.toJSON())
          .catch(() => undefined);
      }
    };

    if (!this.transfer) {
      this.transfer = new ReceiverTransfer({
        directoryHandle,
        passwordProof: null,
        onSnapshot: (snapshot) => this.handleTransferSnapshot(snapshot),
        onFinished: (snapshot, terminal) => this.handleTransferFinished(snapshot, terminal),
        onConnectionLost: () => this.handleConnectionLost(),
      });
    }
    const channel = this.pc.createDataChannel("file-burger", { ordered: true });
    this.transfer.attach(channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.signaling
      .send("sender", "description", this.pc.localDescription?.toJSON() ?? offer)
      .catch(() => undefined);

    // Watchdog: fail with a clear error instead of a spinner if the
    // connection never establishes.
    const deadline = Date.now() + 30000;
    while (this.pc.connectionState !== "connected" && Date.now() < deadline) {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") {
        throw new Error("webrtc_failed");
      }
      await sleep(200);
      if (this.stopped) return;
    }
    if (this.pc.connectionState !== "connected") {
      throw new Error("webrtc_timeout");
    }
    this.hadConnection = true;
    this.emit();
    void attempt; // attempts are tracked by the reconnect loop
  }

  private handleSignalingMessage(signal: ServerSignal): void {
    if (this.stopped) return;
    if (signal.t !== "signal") return;
    if (signal.kind === "candidate") {
      void this.pc
        ?.addIceCandidate(signal.data as RTCIceCandidateInit)
        .catch(() => undefined);
      return;
    }
    if (signal.kind === "description") {
      // The receiver initiated the offer, so incoming descriptions are
      // the sender's answers.
      void this.pc
        ?.setRemoteDescription(signal.data as RTCSessionDescriptionInit)
        .catch((error) => {
          console.error("[file-burger] failed to apply answer:", error);
        });
    }
  }

  private handleSignalingStatus(
    status: "connecting" | "open" | "closed",
    kind: "ws" | "http",
  ): void {
    if (this.stopped) return;
    this.signalingKind = kind;
    if (status === "open" && this.machine.phase === "connecting") {
      this.machine.dispatch("awaiting-accept");
    }
    this.emit();
  }

  private handleSignalingFatal(code: string): void {
    if (this.stopped) return;
    if (code === "room_not_found") {
      this.failWithError({
        code: this.hadConnection ? "peer_disconnected" : "room_not_found",
        message: this.hadConnection
          ? "The sender closed their browser or the transfer expired."
          : "This transfer doesn't exist, has expired, or was revoked. Ask the sender for a fresh link.",
      });
    } else if (code === "room_revoked") {
      this.failWithError({
        code: "peer_disconnected",
        message: "The sender revoked this transfer.",
      });
    } else if (code === "signaling_unavailable") {
      this.failWithError({
        code: "signaling_unavailable",
        message: "Lost contact with the signaling server.",
      });
    } else {
      this.failWithError({
        code: "unknown",
        message: "Could not join this transfer.",
      });
    }
  }

  private handleConnectionLost(): void {
    if (this.reconnecting || this.stopped || this.transfer?.terminal) return;
    this.machine.dispatch("connection-lost");
    this.emit();
    void this.reconnectLoop();
  }

  /**
   * Wire transfer-level snapshots: auto-accept once the manifest arrives
   * (the user already consented), and move the overall phase to
   * transferring when data starts flowing.
   */
  private handleTransferSnapshot(snapshot: ReceiverTransferSnapshot): void {
    if (snapshot.state === "awaiting-accept" && this.transfer && !this.transfer.terminal) {
      void this.transfer.accept(snapshot.files.map((file) => file.id));
    }
    if (
      snapshot.state === "transferring" &&
      (this.machine.phase === "negotiating" ||
        this.machine.phase === "waiting" ||
        this.machine.phase === "connecting")
    ) {
      this.machine.dispatch("transfer-started");
    }
    this.emit();
  }

  private async reconnectLoop(): Promise<void> {
    this.reconnecting = true;
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await sleep(1200 * attempt);
        if (this.stopped || this.transfer?.terminal) return;
        try {
          await this.establishConnection(this.lastDirectoryHandle, attempt);
          // Connected — the transfer resumes automatically via resume-state.
          return;
        } catch {
          // Try again.
        }
      }
      this.transfer?.fail();
      this.emit();
    } finally {
      this.reconnecting = false;
    }
  }

  private lastDirectoryHandle: FileSystemDirectoryHandle | null = null;

  private handleTransferFinished(
    snapshot: ReceiverTransferSnapshot,
    terminal: ReceiverState,
  ): void {
    if (terminal === "completed") {
      this.durationSeconds = this.transfer?.elapsedSeconds ?? 0;
      const totalBytes = snapshot.totalReceivedBytes;
      this.avgSpeed =
        this.durationSeconds > 0 ? totalBytes / this.durationSeconds : 0;
      this.machine.dispatch("transfer-completed");
    } else if (terminal === "cancelled") {
      this.machine.dispatch("transfer-cancelled");
    } else if (terminal === "declined") {
      this.machine.dispatch("transfer-declined");
    } else {
      this.machine.dispatch("transfer-failed");
    }
    this.emit();
  }

  private handleConnectionFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "webrtc_timeout" || message === "webrtc_failed") {
      this.failWithError({
        code: "webrtc_failed",
        message:
          "Couldn't establish a direct browser-to-browser connection. This can happen behind strict networks — try again, or check that both devices are online.",
      });
      return;
    }
    this.failWithError({
      code: "unknown",
      message: "Something went wrong while connecting. Try again.",
    });
  }

  private failWithError(error: TransferError): void {
    this.error = error;
    this.machine.reset("failed");
    this.emit();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
