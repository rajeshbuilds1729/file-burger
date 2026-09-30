/**
 * Server-side signaling helpers shared by the WebSocket hub and the REST
 * signaling routes. Delivers signals to a peer over its live WebSocket when
 * possible, otherwise queues them for HTTP polling.
 */

import type { ServerSignal, SignalingRole } from "./types";
import { getRoomStore, type RoomStore } from "./store";

const globalSockets = globalThis as typeof globalThis & {
  __fileBurgerSockets?: Map<string, WsSocketLike>;
};

/** Minimal structural type for a live WebSocket connection. */
export interface WsSocketLike {
  readyState: number;
  send(data: string): unknown;
}

/** Live WebSocket sockets by peer ID (shared per process). */
function sockets(): Map<string, WsSocketLike> {
  if (!globalSockets.__fileBurgerSockets) {
    globalSockets.__fileBurgerSockets = new Map();
  }
  return globalSockets.__fileBurgerSockets;
}

export function registerSocket(peerId: string, socket: WsSocketLike): void {
  sockets().set(peerId, socket);
}

export function unregisterSocket(peerId: string): void {
  sockets().delete(peerId);
}

export function hasLiveSocket(peerId: string): boolean {
  const socket = sockets().get(peerId);
  return !!socket && socket.readyState === 1 /* WebSocket.OPEN */;
}

/** Push a signal to a peer's live WebSocket socket. */
export function pushToSocket(peerId: string, signal: ServerSignal): boolean {
  const socket = sockets().get(peerId);
  if (!socket || socket.readyState !== 1) return false;
  try {
    socket.send(JSON.stringify(signal));
    return true;
  } catch {
    return false;
  }
}

/** Deliver a signal to a peer: live socket first, HTTP queue as fallback. */
export async function deliverSignal(
  roomId: string,
  to: string,
  signal: Extract<ServerSignal, { t: "signal" }>,
  store?: RoomStore,
): Promise<boolean> {
  if (to !== "sender" && pushToSocket(to, signal)) return true;
  const roomStore = store ?? (await getRoomStore());
  let targetId = to;
  if (to === "sender") {
    const sender = await roomStore.getSenderPeer(roomId);
    if (!sender) return false;
    // Push directly if the sender has a live socket.
    if (pushToSocket(sender.peerId, signal)) return true;
    targetId = sender.peerId;
  }
  return roomStore.queueSignal(roomId, targetId, signal);
}

export type JoinValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Validate a join request against the room store. */
export async function validateJoin(
  roomId: string,
  role: SignalingRole,
  ownerKey: string | undefined,
  store?: RoomStore,
): Promise<JoinValidation> {
  const roomStore = store ?? (await getRoomStore());
  const room = await roomStore.getRoom(roomId);
  if (!room) {
    return {
      ok: false,
      code: "room_not_found",
      message: "This transfer does not exist or has expired.",
    };
  }
  if (room.status === "revoked") {
    return {
      ok: false,
      code: "room_revoked",
      message: "This transfer was revoked by the sender.",
    };
  }
  if (role === "sender" && ownerKey !== room.ownerKey) {
    return {
      ok: false,
      code: "owner_unauthorized",
      message: "Invalid sender key for this transfer.",
    };
  }
  return { ok: true };
}

/** Constant-time string comparison for verifier checks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
