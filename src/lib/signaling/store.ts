/**
 * Ephemeral room store for the signaling server.
 *
 * Rooms hold only transfer metadata (filenames, sizes, types) and signaling
 * state. File contents are NEVER stored here or anywhere server-side.
 *
 * Two implementations:
 *  - InMemoryRoomStore: default, zero configuration, single process.
 *  - RedisRoomStore: used when REDIS_URL is set; keeps state in Redis with
 *    TTLs so sessions expire even across restarts.
 *
 * Both survive dev-server hot reloads via a globalThis cache (see getStore()).
 */

import type { FileMeta } from "@/types/transfer";
import { SIGNAL_LIMITS } from "@/lib/config";
import type { ServerSignal, SignalingRole, SignalingTransportKind } from "./types";

export interface RoomPassword {
  /** Hex salt shown to receivers so they can derive a verifier. */
  salt: string;
  /** PBKDF2 verifier (NOT the plaintext password, which is never sent). */
  verifier: string;
}

export interface Room {
  id: string;
  ownerKey: string;
  files: FileMeta[];
  password: RoomPassword | null;
  createdAt: number;
  expiresAt: number;
  status: "waiting" | "revoked";
}

export interface RoomPeer {
  peerId: string;
  role: SignalingRole;
  transport: SignalingTransportKind;
  lastSeen: number;
  /** Queue consumed by HTTP-polling clients. */
  queue: ServerSignal[];
}

export interface RoomStore {
  createRoom(input: {
    id: string;
    ownerKey: string;
    files: FileMeta[];
    password: RoomPassword | null;
    ttlMs: number;
  }): Promise<Room>;
  getRoom(roomId: string): Promise<Room | null>;
  /** Mark a room as manually revoked by its owner. */
  revokeRoom(roomId: string, ownerKey: string): Promise<boolean>;
  deleteRoom(roomId: string): Promise<void>;
  ensurePeer(input: {
    roomId: string;
    peerId: string;
    role: SignalingRole;
    transport: SignalingTransportKind;
  }): Promise<RoomPeer | null>;
  getPeer(roomId: string, peerId: string): Promise<RoomPeer | null>;
  /** The room's sender peer (receiver signals target the literal "sender"). */
  getSenderPeer(roomId: string): Promise<RoomPeer | null>;
  removePeer(roomId: string, peerId: string): Promise<void>;
  /** Queue a signal for a peer's HTTP polling (WS peers get live pushes). */
  queueSignal(
    roomId: string,
    to: string,
    signal: Extract<ServerSignal, { t: "signal" }>,
  ): Promise<boolean>;
  /** List peers in a room (e.g. so the sender can see connected receivers). */
  listPeers(roomId: string): Promise<RoomPeer[]>;
  /** Expire and clear stale rooms/peers. Returns number of rooms removed. */
  sweep(now: number): Promise<number>;
}

const MAX_SWEPT_PEERS_IDLE_MS = 2 * 60 * 1000;

function assertSignalSize(data: unknown): boolean {
  try {
    return JSON.stringify(data ?? null).length <= SIGNAL_LIMITS.maxSignalBytes;
  } catch {
    return false;
  }
}

export function createInMemoryRoomStore(): RoomStore {
  const rooms = new Map<string, Room>();
  const peers = new Map<string, Map<string, RoomPeer>>();

  const store: RoomStore = {
    async createRoom(input) {
      const room: Room = {
        id: input.id,
        ownerKey: input.ownerKey,
        files: input.files,
        password: input.password,
        createdAt: Date.now(),
        expiresAt: Date.now() + input.ttlMs,
        status: "waiting",
      };
      rooms.set(input.id, room);
      return room;
    },

    async getRoom(roomId) {
      const room = rooms.get(roomId);
      if (!room) return null;
      if (Date.now() > room.expiresAt) {
        rooms.delete(roomId);
        peers.delete(roomId);
        return null;
      }
      return room;
    },

    async revokeRoom(roomId, ownerKey) {
      const room = rooms.get(roomId);
      if (!room || room.ownerKey !== ownerKey) return false;
      room.status = "revoked";
      rooms.delete(roomId);
      peers.delete(roomId);
      return true;
    },

    async deleteRoom(roomId) {
      rooms.delete(roomId);
      peers.delete(roomId);
    },

    async ensurePeer({ roomId, peerId, role, transport }) {
      const room = store.getRoom(roomId);
      if (!room) return null;
      let roomPeers = peers.get(roomId);
      if (!roomPeers) {
        roomPeers = new Map();
        peers.set(roomId, roomPeers);
      }
      const existing = roomPeers.get(peerId);
      if (existing) {
        existing.lastSeen = Date.now();
        existing.transport = transport;
        return existing;
      }
      if (roomPeers.size >= 64) return null;
      const peer: RoomPeer = {
        peerId,
        role,
        transport,
        lastSeen: Date.now(),
        queue: [],
      };
      roomPeers.set(peerId, peer);
      return peer;
    },

    async getPeer(roomId, peerId) {
      return peers.get(roomId)?.get(peerId) ?? null;
    },

    async getSenderPeer(roomId) {
      const roomPeers = peers.get(roomId);
      if (!roomPeers) return null;
      for (const peer of roomPeers.values()) {
        if (peer.role === "sender") return peer;
      }
      return null;
    },

    async removePeer(roomId, peerId) {
      peers.get(roomId)?.delete(peerId);
    },

    async queueSignal(roomId, to, signal) {
      if (!assertSignalSize(signal.data)) return false;
      let target = peers.get(roomId)?.get(to) ?? null;
      if (!target && to === "sender") {
        target = await store.getSenderPeer(roomId);
      }
      if (!target) return false;
      if (target.queue.length >= SIGNAL_LIMITS.maxQueuedSignals) return false;
      target.queue.push(signal);
      return true;
    },

    async listPeers(roomId) {
      const roomPeers = peers.get(roomId);
      if (!roomPeers) return [];
      return Array.from(roomPeers.values());
    },

    async sweep(now) {
      let removed = 0;
      for (const [roomId, room] of rooms) {
        if (now > room.expiresAt) {
          rooms.delete(roomId);
          peers.delete(roomId);
          removed += 1;
        }
      }
      for (const [roomId, roomPeers] of peers) {
        for (const [peerId, peer] of roomPeers) {
          if (now - peer.lastSeen > MAX_SWEPT_PEERS_IDLE_MS) {
            roomPeers.delete(peerId);
          }
        }
        if (roomPeers.size === 0 && !rooms.has(roomId)) {
          peers.delete(roomId);
        }
      }
      return removed;
    },
  };

  return store;
}

/**
 * Redis-backed store. Sessions live in Redis with TTLs so they expire even if
 * the process restarts. Signals use Redis lists consumed with RPOP (no
 * blocking calls), which also works across multiple instances.
 */
export async function createRedisRoomStore(
  url: string,
): Promise<RoomStore> {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  const key = {
    room: (id: string) => `fb:room:${id}`,
    peers: (id: string) => `fb:peers:${id}`,
    peer: (id: string, peerId: string) => `fb:peer:${id}:${peerId}`,
    queue: (id: string, peerId: string) => `fb:queue:${id}:${peerId}`,
  };

  function serializeRoom(room: Room): string {
    return JSON.stringify(room);
  }

  const store: RoomStore = {
    async createRoom(input) {
      const room: Room = {
        id: input.id,
        ownerKey: input.ownerKey,
        files: input.files,
        password: input.password,
        createdAt: Date.now(),
        expiresAt: Date.now() + input.ttlMs,
        status: "waiting",
      };
      const ttlSeconds = Math.ceil(input.ttlMs / 1000);
      const pipeline = redis.multi();
      pipeline.set(key.room(input.id), serializeRoom(room), "EX", ttlSeconds);
      pipeline.del(key.peers(input.id));
      await pipeline.exec();
      return room;
    },

    async getRoom(roomId) {
      const raw = await redis.get(key.room(roomId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Room;
      } catch {
        return null;
      }
    },

    async revokeRoom(roomId, ownerKey) {
      const room = await store.getRoom(roomId);
      if (!room || room.ownerKey !== ownerKey) return false;
      await redis.del(key.room(roomId));
      await redis.del(key.peers(roomId));
      return true;
    },

    async deleteRoom(roomId) {
      await redis.del(key.room(roomId));
      await redis.del(key.peers(roomId));
    },

    async ensurePeer({ roomId, peerId, role, transport }) {
      const room = await store.getRoom(roomId);
      if (!room) return null;
      const peerKey = key.peer(roomId, peerId);
      const raw = await redis.get(peerKey);
      if (raw) {
        const peer = JSON.parse(raw) as RoomPeer;
        peer.lastSeen = Date.now();
        peer.transport = transport;
        await redis.set(peerKey, JSON.stringify(peer), "EX", 300);
        return peer;
      }
      const count = await redis.scard(key.peers(roomId));
      if (count >= 64) return null;
      const peer: RoomPeer = {
        peerId,
        role,
        transport,
        lastSeen: Date.now(),
        queue: [],
      };
      await redis.sadd(key.peers(roomId), peerId);
      await redis.set(peerKey, JSON.stringify(peer), "EX", 300);
      return peer;
    },

    async getPeer(roomId, peerId) {
      const raw = await redis.get(key.peer(roomId, peerId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as RoomPeer;
      } catch {
        return null;
      }
    },

    async getSenderPeer(roomId) {
      const ids = await redis.smembers(key.peers(roomId));
      for (const peerId of ids) {
        const peer = await store.getPeer(roomId, peerId);
        if (peer && peer.role === "sender") return peer;
      }
      return null;
    },

    async removePeer(roomId, peerId) {
      await redis.del(key.peer(roomId, peerId));
      await redis.del(key.queue(roomId, peerId));
      await redis.srem(key.peers(roomId), peerId);
    },

    async queueSignal(roomId, to, signal) {
      if (!assertSignalSize(signal.data)) return false;
      let target = await store.getPeer(roomId, to);
      if (!target && to === "sender") {
        target = await store.getSenderPeer(roomId);
      }
      if (!target) return false;
      const queued = await redis.rpush(
        key.queue(roomId, target.peerId),
        JSON.stringify(signal),
      );
      await redis.ltrim(
        key.queue(roomId, target.peerId),
        -SIGNAL_LIMITS.maxQueuedSignals,
        -1,
      );
      return queued > 0;
    },

    async listPeers(roomId) {
      const ids = await redis.smembers(key.peers(roomId));
      const peersOut: RoomPeer[] = [];
      for (const peerId of ids) {
        const peer = await store.getPeer(roomId, peerId);
        if (peer) peersOut.push(peer);
      }
      return peersOut;
    },

    async sweep() {
      // Redis TTLs handle expiry; peers expire via their 300s TTL.
      return 0;
    },
  };

  return store;
}

/** Cached per-process store that survives dev hot reloads. */
async function getStore(): Promise<RoomStore> {
  const globalStore = globalThis as typeof globalThis & {
    __fileBurgerRoomStore?: RoomStore;
    __fileBurgerRoomStorePromise?: Promise<RoomStore>;
  };
  if (globalStore.__fileBurgerRoomStore) {
    return globalStore.__fileBurgerRoomStore;
  }
  if (!globalStore.__fileBurgerRoomStorePromise) {
    const url = process.env.REDIS_URL;
    globalStore.__fileBurgerRoomStorePromise = (async () => {
      if (url && url.length > 0) {
        try {
          const store = await createRedisRoomStore(url);
          globalStore.__fileBurgerRoomStore = store;
          return store;
        } catch (error) {
          console.warn(
            "[file-burger] Failed to connect to Redis, falling back to in-memory room store:",
            error instanceof Error ? error.message : error,
          );
        }
      }
      const store = createInMemoryRoomStore();
      globalStore.__fileBurgerRoomStore = store;
      return store;
    })();
  }
  return globalStore.__fileBurgerRoomStorePromise;
}

/** Get the process-wide room store (awaited). */
export async function getRoomStore(): Promise<RoomStore> {
  return getStore();
}
