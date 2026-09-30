/**
 * Receiver-side transfer: receives files over one DataChannel.
 *
 * Responsibilities:
 *  - protocol handshake (hello, manifest handling, accept with optional
 *    password proof and resume offset)
 *  - sequential chunk processing with backpressure: chunks are queued and
 *    written to a sink one at a time; the sender is paused when the queue
 *    runs ahead and resumed when it drains
 *  - pluggable sinks (File System Access / IndexedDB / memory)
 *  - incremental SHA-256 verification of every received file
 *  - pause/resume, cancellation, completion handshake
 *
 * The transfer object survives connection drops: when the engine re-offers,
 * `attach` is called with the new channel, the handshake restarts, and the
 * receiver reports its resume offset so already-received bytes are skipped.
 */

import { createHasher, type IncrementalHasher } from "@/lib/files/hash";import {
  createFileSink,
  type FileSink,
  type SinkResult,
} from "@/lib/files/sink";
import { Speedometer, estimateEta } from "@/features/transfer/speedometer";
import type { FileMetaWithHash } from "@/types/transfer";
import { decodeControl, encodeControl, PROTOCOL_VERSION, type ControlMessage } from "./protocol";
import type { DataChannelLike } from "./channel";

export type ReceiverState =
  | "handshaking"
  | "awaiting-manifest"
  | "awaiting-accept"
  | "transferring"
  | "paused"
  | "completed"
  | "declined"
  | "cancelled"
  | "failed";

export type ReceiverFileStatus = "pending" | "receiving" | "completed" | "failed";

export interface ReceiverFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: ReceiverFileStatus;
  receivedBytes: number;
  /** Hash received from the sender; verified on completion. */
  expectedHash: string | null;
  verifiedHash: string | null;
  error: string | null;
}

export interface ReceiverTransferSnapshot {
  state: ReceiverState;
  files: ReceiverFile[];
  currentFileId: string | null;
  /** Bytes received for the current file. */
  fileBytes: number;
  /** Bytes of completed files plus the current file. */
  totalReceivedBytes: number;
  /** Total bytes across all files. */
  totalSize: number;
  progress: number;
  speed: number;
  etaSeconds: number;
  /** Per-file Blobs (null until completed; absent for directory sinks). */
  results: Record<string, SinkResult>;
}

export interface ReceiverTransferOptions {
  /** Opt-in File System Access directory (Chromium). Null otherwise. */
  directoryHandle: FileSystemDirectoryHandle | null;
  passwordProof: string | null;
  onSnapshot: (snapshot: ReceiverTransferSnapshot) => void;
  /** Called once when the transfer reaches a terminal state. */
  onFinished: (snapshot: ReceiverTransferSnapshot, terminal: ReceiverState) => void;
  /** Called when the channel drops mid-transfer; the engine decides
   *  whether to reconnect or fail. */
  onConnectionLost?: () => void;
}

const QUEUE_HIGH = 32;
const QUEUE_LOW = 4;
const PROGRESS_NOTIFY_MS = 400;

export class ReceiverTransfer {
  private channel: DataChannelLike | null = null;
  private state: ReceiverState = "handshaking";
  private files: ReceiverFile[] = [];
  private manifestFiles: FileMetaWithHash[] = [];
  private sinks = new Map<string, FileSink>();
  private results: Record<string, SinkResult> = {};
  private currentFileId: string | null = null;
  private completedBytes = 0;
  private speedometer = new Speedometer();
  private lastNotify = 0;
  private startedAt = 0;
  private hashers = new Map<string, IncrementalHasher>();

  private queue: Array<{ fileId: string; data: ArrayBuffer }> = [];
  private processing = false;
  private autoPaused = false;
  private accepted = false;
  private aborted = false;

  private acceptWaiter: (() => void) | null = null;

  constructor(private readonly options: ReceiverTransferOptions) {}

  get terminal(): boolean {
    return (
      this.state === "completed" ||
      this.state === "cancelled" ||
      this.state === "failed"
    );
  }

  get snapshot(): ReceiverTransferSnapshot {
    const totalSize = this.files.reduce((total, file) => total + file.size, 0);
    const currentFile = this.currentFileId
      ? this.files.find((file) => file.id === this.currentFileId) ?? null
      : null;
    const currentFileBytes = currentFile?.receivedBytes ?? 0;
    const totalReceived = this.completedBytes + currentFileBytes;
    const progress = totalSize > 0 ? Math.min(1, totalReceived / totalSize) : 0;
    const remaining = Math.max(0, totalSize - totalReceived);
    return {
      state: this.state,
      files: this.files.map((file) => ({ ...file })),
      currentFileId: this.currentFileId,
      fileBytes: currentFileBytes,
      totalReceivedBytes: totalReceived,
      totalSize,
      progress,
      speed: this.speedometer.value,
      etaSeconds: estimateEta(remaining, this.speedometer.value),
      results: this.results,
    };
  }

  /** Attach a freshly opened DataChannel (first connect or reconnect). */
  attach(channel: DataChannelLike): void {
    this.channel = channel;
    this.state = "handshaking";
    channel.binaryType = "arraybuffer";
    channel.onmessage = (event) => this.handleMessage(event.data);
    channel.onclose = () => this.handleChannelClosed();
    channel.onerror = () => this.handleChannelClosed();
    channel.onopen = () => {
      this.safeSend({ t: "hello", protocol: PROTOCOL_VERSION });
    };
    if (channel.readyState === "open") {
      this.safeSend({ t: "hello", protocol: PROTOCOL_VERSION });
    }
  }

  /** UI-triggered accept. Resolves once the accept message has been sent. */
  async accept(fileIds: string[], proof?: string): Promise<void> {
    if (this.state !== "awaiting-accept") return;
    this.accepted = true;
    this.safeSend({
      t: "accept",
      files: fileIds,
      proof: proof ?? this.options.passwordProof ?? undefined,
    });
    const waiter = this.acceptWaiter;
    this.acceptWaiter = null;
    waiter?.();
  }

  /** UI-triggered decline. */
  decline(): void {
    if (this.terminal) return;
    this.aborted = true;
    this.safeSend({ t: "reject", reason: "declined" });
    this.updateState("declined");
    this.options.onFinished(this.snapshot, "declined");
    this.closeChannel(100);
  }

  /** UI-triggered pause (receiver-initiated). */
  pause(): void {
    if (this.terminal || this.state !== "transferring") return;
    this.safeSend({ t: "pause" });
    this.updateState("paused");
  }

  /** UI-triggered resume (receiver-initiated). */
  resume(): void {
    if (this.terminal || this.state !== "paused") return;
    this.safeSend({ t: "resume" });
    this.updateState("transferring");
  }

  /** UI-triggered cancel mid-transfer. */
  cancel(reason = "receiver_cancelled"): void {
    if (this.terminal) return;
    this.aborted = true;
    this.safeSend({ t: "cancel", reason });
    void this.discardSinks();
    this.updateState("cancelled");
    this.options.onFinished(this.snapshot, "cancelled");
    this.closeChannel(100);
  }

  /** Force-fail (e.g. connection lost beyond reconnect attempts). */
  fail(): void {
    if (this.terminal) return;
    this.aborted = true;
    void this.discardSinks();
    this.updateState("failed");
    this.options.onFinished(this.snapshot, "failed");
  }

  /** Receiver-side resume intent, used by the engine when reconnecting. */
  resumeIntent(): { files: string[]; resume: { fileId: string; offset: number } } | null {
    const remaining = this.files
      .filter((file) => file.status === "pending" || file.status === "receiving")
      .map((file) => file.id);
    if (remaining.length === 0) return null;
    const current = this.files.find((file) => file.status === "receiving");
    let offset = current?.receivedBytes ?? 0;
    let fileId = current?.id ?? remaining[0];
    if (current) {
      const sink = this.sinks.get(current.id);
      // File System Access sinks lose unflushed data on reconnect, so the
      // current file restarts from zero.
      if (sink && sink.kind === "fsa") {
        void this.abortSink(current.id);
        offset = 0;
        current.receivedBytes = 0;
        fileId = current.id;
      }
    }
    return { files: remaining, resume: { fileId, offset } };
  }

  // ── message handling ──────────────────────────────────────────────────────

  /** Handle an incoming DataChannel frame (text = control, binary = chunk). */
  handleMessage(data: string | ArrayBuffer): void {
    if (this.terminal) return;
    if (typeof data === "string") {
      const message = decodeControl(data);
      if (!message) return;
      this.handleControl(message);
      return;
    }
    // Binary frame: a chunk for the current file. Tag it with the file ID at
    // enqueue time — chunks are processed asynchronously and the current file
    // may change before the queue drains. Queue and process sequentially so
    // slow sinks apply backpressure.
    if (this.currentFileId) {
      this.queue.push({ fileId: this.currentFileId, data });
      void this.processQueue();
    }
  }

  private handleControl(message: ControlMessage): void {
    switch (message.t) {
      case "manifest":
        this.handleManifest(message.files);
        return;
      case "file-start":
        this.handleFileStart(message);
        return;
      case "file-end":
        void this.handleFileEnd(message);
        return;
      case "pause":
        if (this.state === "transferring") this.updateState("paused");
        return;
      case "resume":
        if (this.state === "paused") this.updateState("transferring");
        return;
      case "cancel":
        this.aborted = true;
        void this.discardSinks();
        this.updateState("cancelled");
        this.options.onFinished(this.snapshot, "cancelled");
        this.closeChannel(0);
        return;
      case "reject":
        this.aborted = true;
        this.updateState("declined");
        this.options.onFinished(this.snapshot, "declined");
        return;
      case "error":
        this.aborted = true;
        this.updateState("failed");
        this.options.onFinished(this.snapshot, "failed");
        return;
      case "complete":
        // Sender-side signal; receivers detect their own completion.
        return;
      case "hello":
      case "accept":
      default:
        return;
    }
  }

  private handleManifest(files: FileMetaWithHash[]): void {
    if (this.state !== "handshaking" && this.state !== "awaiting-manifest") return;
    this.manifestFiles = files;    if (this.files.length === 0) {
      this.files = files.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        type: file.type,
        status: "pending" as const,
        receivedBytes: 0,
        expectedHash: file.hash ?? null,
        verifiedHash: null,
        error: null,
      }));
    } else {
      // Resumed session: keep existing per-file state, refresh metadata.
      this.files = files.map((file) => {
        const existing = this.files.find((f) => f.id === file.id);
        if (!existing) {
          return {
            id: file.id,
            name: file.name,
            size: file.size,
            type: file.type,
            status: "pending" as const,
            receivedBytes: 0,
            expectedHash: file.hash ?? null,
            verifiedHash: null,
            error: null,
          };
        }
        return { ...existing, name: file.name, size: file.size, type: file.type };
      });
    }

    if (this.accepted) {
      // Auto-accept on resume; the user already consented.
      const intent = this.resumeIntent();
      if (intent) {
        this.safeSend({
          t: "accept",
          files: intent.files,
          resume: intent.resume,
        });
        this.updateState("handshaking");
        return;
      }
      // Everything already received.
      this.updateState("completed");
      this.options.onFinished(this.snapshot, "completed");
      this.closeChannel(100);
      return;
    }

    this.updateState("awaiting-accept");
  }

  private handleFileStart(message: Extract<ControlMessage, { t: "file-start" }>): void {
    if (this.aborted) return;
    const file = this.files.find((f) => f.id === message.fileId);
    if (!file) return;
    this.currentFileId = file.id;
    file.status = "receiving";
    file.expectedHash = file.expectedHash ?? null;
    this.speedometer = new Speedometer();
    if (!this.sinks.has(file.id)) {
      this.sinks.set(
        file.id,
        createFileSink({
          fileId: file.id,
          fileName: file.name,
          fileSize: file.size,
          directoryHandle: this.options.directoryHandle,
        }),
      );
      this.hashers.set(file.id, createHasher());
    }
    if (this.startedAt === 0) this.startedAt = Date.now();
    this.updateState("transferring");
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0 && !this.aborted && !this.terminal) {
        const item = this.queue.shift()!;
        await this.processChunk(item);
        this.maybeAutoPause();
      }
    } finally {
      this.processing = false;
    }
  }

  private async processChunk(chunk: { fileId: string; data: ArrayBuffer }): Promise<void> {
    const sink = this.sinks.get(chunk.fileId);
    const hasher = this.hashers.get(chunk.fileId);
    if (!sink || !hasher) return;
    await sink.write(chunk.data);
    hasher.update(chunk.data);
    const file = this.files.find((f) => f.id === chunk.fileId);
    if (file) file.receivedBytes += chunk.data.byteLength;
    this.notifyProgress();
  }

  private maybeAutoPause(): void {
    if (this.autoPaused) {
      if (this.queue.length <= QUEUE_LOW) {
        this.autoPaused = false;
        this.safeSend({ t: "resume" });
      }
      return;
    }
    if (this.queue.length >= QUEUE_HIGH) {
      this.autoPaused = true;
      this.safeSend({ t: "pause" });
    }
  }

  private async handleFileEnd(message: Extract<ControlMessage, { t: "file-end" }>): Promise<void> {
    if (this.aborted) return;
    const fileId = message.fileId;
    const file = this.files.find((f) => f.id === fileId);
    if (!file) return;

    // Wait for all queued chunks of this file to be processed.
    while (this.queue.length > 0 && !this.aborted) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    if (this.aborted) return;

    const sink = this.sinks.get(fileId);
    const hasher = this.hashers.get(fileId);

    this.emit();

    let result: SinkResult | null = null;
    if (sink) {
      await sink.close();
      result = sink.result;
    }

    const actualHash = hasher ? hasher.digest() : null;
    file.verifiedHash = actualHash;

    if (actualHash && message.hash && actualHash !== message.hash) {
      file.status = "failed";
      file.error = "Integrity check failed — the file may be corrupted.";
      this.aborted = true;
      this.updateState("failed");
      this.options.onFinished(this.snapshot, "failed");
      return;
    }

    file.status = "completed";
    if (result?.blob) this.results[fileId] = result;
    this.completedBytes += file.size;
    this.currentFileId = null;
    this.emit();

    const allDone = this.files.every((f) => f.status === "completed");
    if (allDone) {
      this.safeSend({ t: "complete", files: this.files.map((f) => f.id) });
      this.updateState("completed");
      this.options.onFinished(this.snapshot, "completed");
      this.closeChannel(100);
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private handleChannelClosed(): void {
    if (this.terminal) return;
    if (this.options.onConnectionLost) {
      // The engine decides whether to reconnect or fail.
      return;
    }
    this.updateState("failed");
    this.options.onFinished(this.snapshot, "failed");
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

  private updateState(state: ReceiverState): void {
    this.state = state;
    this.emit();
  }

  private emit(): void {
    this.options.onSnapshot(this.snapshot);
  }

  private notifyProgress(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastNotify < PROGRESS_NOTIFY_MS) return;
    this.lastNotify = now;
    const currentFile = this.currentFileId
      ? this.files.find((file) => file.id === this.currentFileId) ?? null
      : null;
    this.speedometer.sample(
      this.completedBytes + (currentFile?.receivedBytes ?? 0),
      now,
    );
    this.emit();
  }

  private async discardSinks(): Promise<void> {
    for (const [, sink] of this.sinks) {
      try {
        await sink.abort();
      } catch {
        // ignore
      }
    }
    this.sinks.clear();
  }

  private async abortSink(fileId: string): Promise<void> {
    const sink = this.sinks.get(fileId);
    if (!sink) return;
    try {
      await sink.abort();
    } catch {
      // ignore
    }
    this.sinks.delete(fileId);
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

  /** Total elapsed transfer time in seconds (for the completion screen). */
  get elapsedSeconds(): number {
    if (this.startedAt === 0) return 0;
    return (Date.now() - this.startedAt) / 1000;
  }
}
