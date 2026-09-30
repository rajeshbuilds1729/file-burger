/**
 * Signaling transports.
 *
 * Two implementations behind one interface:
 *  - WebSocketTransport: primary. Low-latency push signaling over a single
 *    WebSocket connection to the custom server.
 *  - HttpTransport: fallback. Short-poll REST signaling that works on any
 *    host, including serverless platforms without WebSocket support.
 *
 * The SignalingClient tries WebSocket first and falls back to HTTP
 * automatically, so the app works in both deployments.
 */

import type {
  ClientSignal,
  ServerSignal,
  SignalingRole,
  SignalingTransportKind,
} from "./types";

export type TransportStatus = "connecting" | "open" | "closed";

export interface JoinParams {
  roomId: string;
  role: SignalingRole;
  ownerKey?: string;
}

export type OutgoingSignal = Extract<ClientSignal, { t: "signal" | "leave" }>;

export interface SignalingTransport {
  readonly kind: SignalingTransportKind;
  connect(params: JoinParams): Promise<{ peerId: string }>;
  disconnect(): Promise<void>;
  send(signal: OutgoingSignal): Promise<void>;
  onMessage(listener: (signal: ServerSignal) => void): () => void;
  onStatus(listener: (status: TransportStatus) => void): () => void;
}

const JOIN_TIMEOUT_MS = 6000;
const HTTP_POLL_INTERVAL_MS = 700;

/** Parse and validate an incoming server signal defensively. */
export function parseServerSignal(raw: unknown): ServerSignal | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const signal = parsed as Record<string, unknown>;
  switch (signal.t) {
    case "joined":
      return typeof signal.peerId === "string"
        ? { t: "joined", peerId: signal.peerId }
        : null;
    case "error":
      return typeof signal.code === "string" && typeof signal.message === "string"
        ? { t: "error", code: signal.code, message: signal.message }
        : null;
    case "signal":
      if (
        typeof signal.from !== "string" ||
        (signal.kind !== "description" && signal.kind !== "candidate")
      ) {
        return null;
      }
      return {
        t: "signal",
        from: signal.from,
        kind: signal.kind,
        data: signal.data,
      };
    default:
      return null;
  }
}

function wsUrlFromOrigin(): string {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

/** Primary transport: a single WebSocket connection with push signaling. */
export class WebSocketTransport implements SignalingTransport {
  readonly kind: SignalingTransportKind = "ws";

  private socket: WebSocket | null = null;
  private messageListeners = new Set<(signal: ServerSignal) => void>();
  private statusListeners = new Set<(status: TransportStatus) => void>();

  constructor(private readonly baseUrl?: string) {}

  connect(params: JoinParams): Promise<{ peerId: string }> {
    const url = this.baseUrl ? `${this.baseUrl}/ws` : wsUrlFromOrigin();
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);
      this.socket = socket;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          socket.close();
        } catch {
          // ignore
        }
        reject(new Error("ws_timeout"));
      }, JOIN_TIMEOUT_MS);

      socket.onopen = () => {
        socket.send(
          JSON.stringify({ t: "join", ...params, transport: "ws" }),
        );
      };

      socket.onmessage = (event: MessageEvent) => {
        const signal = parseServerSignal(event.data);
        if (!signal) return;
        if (signal.t === "joined") {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.emitStatus("open");
          resolve({ peerId: signal.peerId });
          return;
        }
        if (signal.t === "error") {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try {
            socket.close();
          } catch {
            // ignore
          }
          reject(new Error(signal.code));
          return;
        }
        for (const listener of this.messageListeners) {
          listener(signal);
        }
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        this.socket = null;
        if (!settled) {
          settled = true;
          reject(new Error("ws_closed"));
        }
        this.emitStatus("closed");
      };

      socket.onerror = () => {
        // The close event follows; nothing to do here.
      };
    });
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ t: "leave" }));
      } catch {
        // ignore
      }
    }
    try {
      socket?.close();
    } catch {
      // ignore
    }
  }

  async send(signal: OutgoingSignal): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("signaling_closed");
    }
    socket.send(JSON.stringify(signal));
  }

  onMessage(listener: (signal: ServerSignal) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(status: TransportStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

/** Fallback transport: short-poll REST signaling, works on any host. */
export class HttpTransport implements SignalingTransport {
  readonly kind: SignalingTransportKind = "http";

  private peerId: string | null = null;
  private roomId: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private messageListeners = new Set<(signal: ServerSignal) => void>();
  private statusListeners = new Set<(status: TransportStatus) => void>();

  async connect(params: JoinParams): Promise<{ peerId: string }> {
    this.stopped = false;
    this.roomId = params.roomId;
    const response = await fetch(`/api/rooms/${encodeURIComponent(params.roomId)}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: params.role,
        ownerKey: params.ownerKey,
        transport: "http",
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      let code = "join_failed";
      try {
        const body = (await response.json()) as { error?: string };
        if (typeof body?.error === "string") code = body.error;
      } catch {
        const text = (await response.text().catch(() => "")).trim();
        if (text.length > 0 && text.length <= 64) code = text;
      }
      throw new Error(code);
    }
    const data = (await response.json()) as { peerId: string };
    this.peerId = data.peerId;
    this.startPolling();
    this.emitStatus("open");
    return { peerId: data.peerId };
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    this.stopPolling();
    if (this.peerId && this.roomId) {
      try {
        await fetch(`/api/rooms/${encodeURIComponent(this.roomId)}/leave`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ peerId: this.peerId }),
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Best effort — peers also expire server-side.
      }
    }
    this.emitStatus("closed");
  }

  async send(signal: OutgoingSignal): Promise<void> {
    if (!this.peerId || !this.roomId) {
      throw new Error("signaling_closed");
    }
    if (signal.t === "leave") {
      await this.disconnect();
      return;
    }
    const response = await fetch(`/api/rooms/${encodeURIComponent(this.roomId)}/signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        peerId: this.peerId,
        to: signal.to,
        kind: signal.kind,
        data: signal.data,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("signal_send_failed");
    }
  }

  onMessage(listener: (signal: ServerSignal) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, HTTP_POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.peerId || !this.roomId || this.stopped) return;
    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(this.roomId)}/signals?peerId=${encodeURIComponent(this.peerId)}`,
        { cache: "no-store" },
      );
      if (response.status === 404 || response.status === 410) {
        // Room is gone (expired, revoked or never existed).
        this.stopPolling();
        this.emitStatus("closed");
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as { signals?: ServerSignal[] };
      for (const signal of data.signals ?? []) {
        for (const listener of this.messageListeners) {
          listener(signal);
        }
      }
    } catch {
      // Transient network error — keep polling.
    }
  }

  private emitStatus(status: TransportStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

/** Errors that mean "do not retry the join" (server rejected it). */
const FATAL_JOIN_ERRORS = new Set([
  "room_not_found",
  "room_revoked",
  "owner_unauthorized",
  "room_full",
]);

export function isFatalJoinError(error: unknown): boolean {
  return (
    error instanceof Error &&
    FATAL_JOIN_ERRORS.has(error.message)
  );
}
