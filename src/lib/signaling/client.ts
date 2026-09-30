/**
 * Signaling client. Wraps a transport with join/retry/fallback logic so the
 * transfer engines can simply `start()`, `send()` and `stop()`.
 */

import type { ServerSignal, SignalingRole, SignalingTransportKind } from "./types";
import {
  HttpTransport,
  WebSocketTransport,
  isFatalJoinError,
  type JoinParams,
  type SignalingTransport,
  type TransportStatus,
} from "./transport";

export interface SignalingClientOptions {
  roomId: string;
  role: SignalingRole;
  /** Required for the sender role; authorizes sender-only operations. */
  ownerKey?: string;
  onMessage: (signal: ServerSignal) => void;
  onStatus: (status: TransportStatus, transport: SignalingTransportKind) => void;
  /** Called when the server rejects the join or signaling is unreachable. */
  onFatal?: (code: string) => void;
}

const MAX_CONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 600;

export class SignalingClient {
  private transport: SignalingTransport | null = null;
  private stopped = false;
  private reconnecting = false;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly options: SignalingClientOptions) {}

  get transportKind(): SignalingTransportKind | null {
    return this.transport?.kind ?? null;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connectWithRetry();
  }

  async send(to: string, kind: "description" | "candidate", data: unknown): Promise<void> {
    if (!this.transport) throw new Error("signaling_closed");
    await this.transport.send({ t: "signal", to, kind, data });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const transport = this.transport;
    this.transport = null;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    if (transport) {
      try {
        await transport.disconnect();
      } catch {
        // ignore
      }
    }
  }

  private joinParams(): JoinParams {
    return {
      roomId: this.options.roomId,
      role: this.options.role,
      ownerKey: this.options.ownerKey,
    };
  }

  private async connectWithRetry(): Promise<void> {
    let attempts = 0;
    while (!this.stopped && attempts < MAX_CONNECT_ATTEMPTS) {
      attempts += 1;
      this.options.onStatus("connecting", this.transport?.kind ?? "ws");
      try {
        this.transport = await this.createTransport();
        this.attachTransport();
        this.options.onStatus("open", this.transport.kind);
        return;
      } catch (error) {
        if (isFatalJoinError(error)) {
          this.options.onFatal?.(
            error instanceof Error ? error.message : "join_failed",
          );
          return;
        }
        if (this.stopped) return;
        // WebSocket probe failed — the next attempt falls back to HTTP.
        await sleep(BASE_BACKOFF_MS * attempts);
      }
    }
    if (!this.stopped) {
      this.options.onStatus("closed", this.transport?.kind ?? "ws");
      this.options.onFatal?.("signaling_unavailable");
    }
  }

  private async createTransport(): Promise<SignalingTransport> {
    // Prefer WebSocket; fall back to HTTP polling on any failure.
    if (this.transport === null && typeof WebSocket !== "undefined") {
      try {
        const wsTransport = new WebSocketTransport();
        await wsTransport.connect(this.joinParams());
        return wsTransport;
      } catch (error) {
        if (isFatalJoinError(error)) throw error;
        // Fall through to HTTP.
      }
    }
    const httpTransport = new HttpTransport();
    await httpTransport.connect(this.joinParams());
    return httpTransport;
  }

  private attachTransport(): void {
    const transport = this.transport;
    if (!transport) return;
    this.unsubscribers.push(
      transport.onMessage((signal) => {
        if (!this.stopped) this.options.onMessage(signal);
      }),
    );
    this.unsubscribers.push(
      transport.onStatus((status) => {
        if (this.stopped) return;
        if (status === "closed") {
          // Unexpected drop (e.g. WS died) — reconnect in the background.
          void this.reconnect();
        }
        this.options.onStatus(
          this.transport?.kind && status === "open" ? "open" : status,
          transport.kind,
        );
      }),
    );
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.stopped) return;
    this.reconnecting = true;
    try {
      const previous = this.transport;
      this.transport = null;
      if (previous) {
        try {
          await previous.disconnect();
        } catch {
          // ignore
        }
      }
      await this.connectWithRetry();
    } finally {
      this.reconnecting = false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
