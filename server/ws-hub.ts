/**
 * WebSocket signaling hub.
 *
 * Handles the `/ws` upgrade for the custom server. Only signaling metadata
 * (join/leave, session descriptions, ICE candidates) flows through here —
 * never file contents.
 *
 * Security:
 *  - Origin checked against the host / ALLOWED_ORIGINS.
 *  - Max payload enforced by the WebSocketServer.
 *  - Sender role requires the room's owner key.
 *  - Per-connection message rate limiting.
 *  - Heartbeat ping/pong reaps dead connections.
 */

import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";
import { ALLOWED_ORIGINS, SIGNAL_LIMITS } from "@/lib/config";
import { getRoomStore, type RoomStore } from "@/lib/signaling/store";
import {
  deliverSignal,
  registerSocket,
  unregisterSocket,
  validateJoin,
} from "@/lib/signaling/server";
import { generatePeerId, isValidTransferId, normalizeTransferId } from "@/lib/ids";
import type { ClientSignal, SignalingRole, SignalingTransportKind } from "@/lib/signaling/types";

const MESSAGE_LIMIT = 240; // per 10s window per connection
const HEARTBEAT_MS = 30_000;

interface ConnectionContext {
  peerId: string | null;
  roomId: string | null;
  alive: boolean;
  timestamps: number[];
}

function originAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true; // non-browser clients (curl, tests)
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.host;
    if (host && originHost === host) return true;
    if (ALLOWED_ORIGINS.includes(originHost)) return true;
    return false;
  } catch {
    return false;
  }
}

export function handleWsConnection(socket: WebSocket, request: IncomingMessage): void {
  if (!originAllowed(request)) {
    socket.close(1008, "origin_not_allowed");
    return;
  }

  const context: ConnectionContext = {
    peerId: null,
    roomId: null,
    alive: true,
    timestamps: [],
  };

  socket.on("pong", () => {
    context.alive = true;
  });

  socket.on("message", (raw: unknown) => {
    context.alive = true;

    // Rate limit messages per connection.
    const now = Date.now();
    context.timestamps = context.timestamps.filter((t) => now - t < 10_000);
    if (context.timestamps.length >= MESSAGE_LIMIT) {
      sendError(socket, "rate_limited", "Too many signaling messages.");
      return;
    }
    context.timestamps.push(now);

    let signal: ClientSignal;
    try {
      signal = JSON.parse(String(raw)) as ClientSignal;
    } catch {
      sendError(socket, "invalid_input", "Invalid signaling message.");
      return;
    }

    void handleMessage(socket, context, signal);
  });

  socket.on("close", () => {
    void handleLeave(context);
  });

  socket.on("error", () => {
    void handleLeave(context);
  });
}

async function handleMessage(
  socket: WebSocket,
  context: ConnectionContext,
  signal: ClientSignal,
): Promise<void> {
  const store = await getRoomStore();

  switch (signal.t) {
    case "join": {
      if (context.peerId) {
        sendError(socket, "invalid_input", "Already joined.");
        return;
      }
      const roomId = normalizeTransferId(signal.roomId ?? "");
      if (!isValidTransferId(roomId)) {
        sendError(socket, "room_not_found", "This transfer doesn't exist or has expired.");
        return;
      }
      const role: SignalingRole = signal.role === "sender" ? "sender" : "receiver";
      const transport: SignalingTransportKind = "ws";
      const validation = await validateJoin(roomId, role, signal.ownerKey, store);
      if (!validation.ok) {
        sendError(socket, validation.code, validation.message);
        return;
      }
      const peerId = await generatePeerId();
      const peer = await store.ensurePeer({ roomId, peerId, role, transport });
      if (!peer) {
        sendError(socket, "room_full", "This transfer has too many connected peers.");
        return;
      }
      context.peerId = peerId;
      context.roomId = roomId;
      registerSocket(peerId, socket);
      send(socket, { t: "joined", peerId });
      return;
    }

    case "signal": {
      if (!context.peerId || !context.roomId) {
        sendError(socket, "invalid_input", "Join before sending signals.");
        return;
      }
      if (signal.kind !== "description" && signal.kind !== "candidate") {
        sendError(socket, "invalid_input", "Invalid signal kind.");
        return;
      }
      const to = typeof signal.to === "string" ? signal.to : "";
      if (!to || (to !== "sender" && !/^[0-9a-f]{8,64}$/i.test(to))) {
        sendError(socket, "invalid_input", "Invalid signal target.");
        return;
      }
      const delivered = await deliverSignal(
        context.roomId,
        to,
        { t: "signal", from: context.peerId, kind: signal.kind, data: signal.data },
        store,
      );
      if (!delivered) {
        sendError(socket, "peer_unavailable", "The target peer is no longer connected.");
      }
      return;
    }

    case "leave": {
      await handleLeave(context);
      return;
    }

    default:
      sendError(socket, "invalid_input", "Unknown message type.");
  }
}

async function handleLeave(context: ConnectionContext): Promise<void> {
  const { peerId, roomId } = context;
  context.peerId = null;
  context.roomId = null;
  if (peerId) unregisterSocket(peerId);
  if (peerId && roomId) {
    const store: RoomStore = await getRoomStore();
    try {
      await store.removePeer(roomId, peerId);
    } catch {
      // ignore
    }
  }
}

function send(socket: WebSocket, signal: unknown): void {
  try {
    socket.send(JSON.stringify(signal));
  } catch {
    // ignore
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { t: "error", code, message });
}

/** Periodic maintenance: heartbeat + room sweep. Call from the server. */
export function startMaintenance(): () => void {
  const timer = setInterval(() => {
    void (async () => {
      const store = await getRoomStore();
      try {
        await store.sweep(Date.now());
      } catch {
        // ignore
      }
    })();
  }, HEARTBEAT_MS);
  return () => clearInterval(timer);
}

export { SIGNAL_LIMITS };
