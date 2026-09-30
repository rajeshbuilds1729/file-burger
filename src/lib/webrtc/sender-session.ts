/**
 * Sender-side transfer session: one accepted receiver's transfer over one
 * DataChannel.
 *
 * Responsibilities:
 *  - protocol handshake (hello → manifest → accept, with optional password
 *    proof verification and resume offset)
 *  - chunked streaming with real backpressure (waits for the channel to
 *    drain before reading more of the file)
 *  - adaptive chunk sizes
 *  - incremental SHA-256 (computed while streaming, verified by receiver)
 *  - pause/resume, cancellation, completion handshake
 *
 * The session survives receiver reconnects: when the receiver re-offers, the
 * engine calls `attach` with the new channel and the handshake restarts, with
 * the receiver reporting its resume offset.
 */

import { TRANSFER } from "@/lib/config";
import { createHasher } from "@/lib/files/hash";
import { readChunks } from "@/lib/files/chunker";
import { Speedometer, estimateEta } from "@/features/transfer/speedometer";
import type { FileMetaWithHash } from "@/types/transfer";
import { waitForChannelDrain, type DataChannelLike } from "./channel";
import { decodeControl, encodeControl, type ControlMessage } from "./protocol";

export type SenderSessionState =
  | "handshaking"
  | "awaiting-accept"
  | "transferring"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export interface SenderSessionSnapshot {
  peerId: string;
  state: SenderSessionState;
  /** File currently being sent. */
  fileId: string | null;
  /** Bytes sent for the current file (including accepted resume offset). */
  fileBytes: number;
  /** Bytes of fully completed files in this session. */
  completedBytes: number;
  /** Overall progress 0..1 across the accepted file set. */
  progress: number;
  speed: number;
  etaSeconds: number;
  chunkSize: number;
  /** File IDs still to send. */
  pending: string[];
  /** File IDs completed (verified by the receiver). */
  done: string[];
}

export interface SenderSessionOptions {
  peerId: string;
  /** Full manifest (hashes may be null until computed while streaming). */
  files: FileMetaWithHash[];
  getFile: (fileId: string) => File | undefined;
  /** Sender's own PBKDF2 verifier; when set, accepts must prove it. */
  passwordVerifier: string | null;
  /** Backpressure thresholds (default from TRANSFER config). */
  highWaterMark?: number;
  lowWaterMark?: number;
  onSnapshot: (snapshot: SenderSessionSnapshot) => void;
  /** Called once when the session reaches a terminal state. */
  onFinished: (snapshot: SenderSessionSnapshot, terminal: SenderSessionState) => void;
}

const PROGRESS_NOTIFY_MS = 400;

export class SenderSession {
  private channel: DataChannelLike | null = null;
  private state: SenderSessionState = "handshaking";
  private paused = false;
  private pausedWaiters: Array<() => void> = [];
  private aborted = false;

  private acceptedFiles: string[] = [];
  private resumeOffset = 0;
  private currentFileId: string | null = null;
  private completedBytes = 0;
  private currentFileBytes = 0;
  private chunkSize = TRANSFER.minChunkSize;
  private lastNotify = 0;
  private speedometer = new Speedometer();

  private doneIds = new Set<string>();
  private readonly highWaterMark: number;
  private readonly lowWaterMark: number;

  constructor(private readonly options: SenderSessionOptions) {
    this.highWaterMark = options.highWaterMark ?? TRANSFER.highWaterMark;
    this.lowWaterMark = options.lowWaterMark ?? TRANSFER.lowWaterMark;
  }

  get terminal(): boolean {
    return (
      this.state === "completed" ||
      this.state === "cancelled" ||
      this.state === "failed"
    );
  }

  get snapshot(): SenderSessionSnapshot {
    const acceptedIds = this.acceptedFiles;
    const acceptedSize = acceptedIds.reduce(
      (total, id) => total + (this.options.files.find((f) => f.id === id)?.size ?? 0),
      0,
    );
    const sentBytes = this.completedBytes + this.currentFileBytes;
    const progress = acceptedSize > 0 ? Math.min(1, sentBytes / acceptedSize) : 0;
    const remaining = Math.max(0, acceptedSize - sentBytes);
    return {
      peerId: this.options.peerId,
      state: this.state,
      fileId: this.currentFileId,
      fileBytes: this.currentFileBytes,
      completedBytes: this.completedBytes,
      progress,
      speed: this.speedometer.value,
      etaSeconds: estimateEta(remaining, this.speedometer.value),
      chunkSize: this.chunkSize,
      pending: acceptedIds.filter(
        (id) => id !== this.currentFileId && !this.isDone(id),
      ),
      done: acceptedIds.filter((id) => this.isDone(id)),
    };
  }

  private isDone(fileId: string): boolean {
    return this.doneIds.has(fileId);
  }

  /** Attach a freshly opened DataChannel (first connect or reconnect). */
  attach(channel: DataChannelLike): void {
    this.channel = channel;
    this.state = "handshaking";
    this.paused = false;
    this.aborted = false;
    channel.binaryType = "arraybuffer";
    channel.onmessage = (event) => this.handleMessage(event.data);
    channel.onclose = () => this.handleChannelClosed();
    channel.onerror = () => this.handleChannelClosed();
  }

  /** Sender-initiated pause. */
  pause(): void {
    if (this.terminal || this.state !== "transferring") return;
    this.paused = true;
    this.updateState("paused");
  }

  /** Sender-initiated resume. */
  resume(): void {
    if (this.terminal || this.state !== "paused") return;
    this.paused = false;
    for (const waiter of this.pausedWaiters.splice(0)) waiter();
    this.updateState("transferring");
  }

  /** Sender-initiated cancel: notify the receiver and tear down. */
  cancel(reason = "sender_cancelled"): void {
    if (this.terminal) return;
    this.aborted = true;
    for (const waiter of this.pausedWaiters.splice(0)) waiter();
    this.safeSend({ t: "cancel", reason });
    this.updateState("cancelled");
    this.options.onFinished(this.snapshot, "cancelled");
    this.closeChannel(200);
  }

  /** Force-fail the session (e.g. connection lost). */
  fail(): void {
    if (this.terminal) return;
    this.aborted = true;
    for (const waiter of this.pausedWaiters.splice(0)) waiter();
    this.updateState("failed");
    this.options.onFinished(this.snapshot, "failed");
  }

  // ── message handling ──────────────────────────────────────────────────────

  /** Handle an incoming DataChannel frame (text = control, binary = ignored). */
  handleMessage(data: string | ArrayBuffer): void {
    if (this.terminal) return;
    if (typeof data !== "string") {
      // The receiver never sends file data in this protocol.
      return;
    }
    const message = decodeControl(data);
    if (!message) return;
    switch (message.t) {
      case "hello":
        this.safeSend({ t: "manifest", files: this.options.files });
        this.updateState("awaiting-accept");
        return;
      case "accept":
        this.handleAccept(message);
        return;
      case "pause":
        if (this.state === "transferring") {
          this.paused = true;
          this.updateState("paused");
        }
        return;
      case "resume":
        if (this.state === "paused") {
          this.paused = false;
          for (const waiter of this.pausedWaiters.splice(0)) waiter();
          this.updateState("transferring");
        }
        return;
      case "cancel":
        this.aborted = true;
        this.updateState("cancelled");
        this.options.onFinished(this.snapshot, "cancelled");
        this.closeChannel(0);
        return;
      case "complete":
        // All files transferred and verified by this receiver.
        this.updateState("completed");
        this.options.onFinished(this.snapshot, "completed");
        this.closeChannel(300);
        return;
      case "error":
        this.aborted = true;
        this.updateState("failed");
        this.options.onFinished(this.snapshot, "failed");
        return;
      default:
        return;
    }
  }

  private handleAccept(message: Extract<ControlMessage, { t: "accept" }>): void {
    if (this.state !== "awaiting-accept") return;

    // Password proof: the sender verifies the receiver's derived verifier.
    if (this.options.passwordVerifier) {
      if (!message.proof || !timingSafeEqualStrings(message.proof, this.options.passwordVerifier)) {
        this.safeSend({
          t: "error",
          code: "password_mismatch",
          message: "The password did not match.",
        });
        this.aborted = true;
        this.updateState("failed");
        this.options.onFinished(this.snapshot, "failed");
        this.closeChannel(200);
        return;
      }
    }

    this.acceptedFiles = message.files.filter((id) =>
      this.options.files.some((file) => file.id === id),
    );
    if (this.acceptedFiles.length === 0) {
      this.safeSend({ t: "reject", reason: "no_files_requested" });
      this.updateState("failed");
      this.options.onFinished(this.snapshot, "failed");
      this.closeChannel(200);
      return;
    }

    this.resumeOffset = 0;
    if (
      message.resume &&
      this.acceptedFiles.includes(message.resume.fileId) &&
      message.resume.offset > 0
    ) {
      const meta = this.options.files.find((f) => f.id === message.resume!.fileId);
      if (meta && message.resume.offset < meta.size) {
        this.resumeOffset = Math.floor(message.resume.offset);
      }
    }

    void this.runTransfer();
  }

  // ── transfer loop ─────────────────────────────────────────────────────────

  private async runTransfer(): Promise<void> {
    this.updateState("transferring");
    const fileIds = [...this.acceptedFiles];
    let first = true;

    try {
      for (const fileId of fileIds) {
        if (this.aborted) return;
        const file = this.options.getFile(fileId);
        const meta = this.options.files.find((f) => f.id === fileId);
        if (!file || !meta) {
          this.safeSend({ t: "error", code: "invalid_input", message: "File missing." });
          this.aborted = true;
          this.updateState("failed");
          this.options.onFinished(this.snapshot, "failed");
          return;
        }

        const startOffset = first ? this.resumeOffset : 0;
        first = false;
        this.currentFileId = fileId;
        this.currentFileBytes = startOffset;
        this.speedometer = new Speedometer();

        this.safeSend({
          t: "file-start",
          fileId,
          name: meta.name,
          size: meta.size,
          type: meta.type,
          chunkSize: this.chunkSize,
        });

        const hasher = createHasher();

        // Re-hash the prefix the receiver already has (resume) so the final
        // digest covers the whole file.
        if (startOffset > 0) {
          const prefix = file.slice(0, startOffset);
          for await (const chunk of readChunks(prefix, { chunkSize: 1024 * 1024 })) {
            if (this.aborted) return;
            hasher.update(chunk.data);
          }
        }

        const body = file.slice(startOffset, file.size);
        let localOffset = 0;

        for await (const chunk of readChunks(body, {
          chunkSize: this.chunkSize,
          onChunkSizeChange: (size) => {
            this.chunkSize = size;
          },
        })) {
          if (this.aborted) return;
          await this.waitIfPaused();
          if (this.aborted) return;

          const channel = this.channel;
          if (!channel || channel.readyState !== "open") {
            throw new Error("channel_closed");
          }

          await waitForChannelDrain(
            channel,
            this.highWaterMark,
            this.lowWaterMark,
            () => this.aborted || channel.readyState !== "open",
          );
          if (this.aborted) return;

          hasher.update(chunk.data);
          channel.send(chunk.data);
          this.currentFileBytes = startOffset + localOffset + chunk.data.byteLength;
          localOffset += chunk.data.byteLength;
          this.notifyProgress();
        }

        const hash = hasher.digest();
        this.safeSend({ t: "file-end", fileId, hash });

        this.completedBytes += Math.max(0, meta.size - startOffset);
        this.doneIds.add(fileId);
        this.currentFileId = null;
        this.currentFileBytes = 0;
        this.emit();
      }

      // Transfer complete; wait for the receiver's `complete` handshake
      // (arriving via handleRawMessage) before the channel is closed.
      this.notifyProgress(true);
    } catch (error) {
      if (this.aborted) return;
      const isChannelError =
        error instanceof Error &&
        (error.message === "channel_closed" || error.name === "AbortError");
      if (isChannelError) {
        // Connection lost mid-transfer; the engine may reconnect.
        this.updateState("failed");
        this.options.onFinished(this.snapshot, "failed");
        return;
      }
      console.error("[file-burger] sender transfer error:", error);
      this.safeSend({ t: "error", code: "unknown", message: "Transfer failed." });
      this.aborted = true;
      this.updateState("failed");
      this.options.onFinished(this.snapshot, "failed");
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private waitIfPaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.pausedWaiters.push(resolve);
    });
  }

  private handleChannelClosed(): void {
    if (this.terminal) return;
    this.fail();
  }

  private safeSend(message: ControlMessage): void {
    const channel = this.channel;
    if (!channel || channel.readyState !== "open") return;
    try {
      channel.send(encodeControl(message));
    } catch {
      // Channel closing — nothing to do.
    }
  }

  private updateState(state: SenderSessionState): void {
    this.state = state;
    this.emit();
  }

  private notifyProgress(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastNotify < PROGRESS_NOTIFY_MS) return;
    this.lastNotify = now;
    this.speedometer.sample(this.completedBytes + this.currentFileBytes, now);
    this.emit();
  }

  private emit(): void {
    this.options.onSnapshot(this.snapshot);
  }

  private closeChannel(delayMs: number): void {
    const channel = this.channel;
    if (!channel) return;
    setTimeout(() => {
      try {
        channel.close();
      } catch {
        // ignore
      }
    }, delayMs);
  }
}

/** Constant-time string comparison for verifier checks. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
