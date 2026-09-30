/**
 * Integration test: signaling room lifecycle — creation, join validation,
 * signal routing (including the "sender" alias), HTTP queue consumption,
 * expiry sweeps and revocation.
 */

import { describe, expect, it } from "vitest";
import {
  createInMemoryRoomStore,
  type RoomStore,
} from "@/lib/signaling/store";
import { validateJoin, timingSafeEqual } from "@/lib/signaling/server";

const FILES = [
  { id: "f1", name: "presentation.pdf", size: 12.4 * 1024 * 1024, type: "application/pdf" },
  { id: "f2", name: "notes.txt", size: 8192, type: "text/plain" },
];

async function createRoom(store: RoomStore, overrides: Partial<Parameters<RoomStore["createRoom"]>[0]> = {}) {
  return store.createRoom({
    id: overrides.id ?? "8K4X2P9QWM5T",
    ownerKey: overrides.ownerKey ?? "owner-key-123",
    files: overrides.files ?? FILES,
    password: overrides.password ?? null,
    ttlMs: overrides.ttlMs ?? 60 * 60 * 1000,
  });
}

describe("room store lifecycle", () => {
  it("creates and retrieves rooms", async () => {
    const store = createInMemoryRoomStore();
    const room = await createRoom(store);
    expect(room.id).toBe("8K4X2P9QWM5T");
    const retrieved = await store.getRoom(room.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.files).toHaveLength(2);
    expect(retrieved!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("validates joins", async () => {
    const store = createInMemoryRoomStore();
    await createRoom(store);

    const receiverJoin = await validateJoin("8K4X2P9QWM5T", "receiver", undefined, store);
    expect(receiverJoin.ok).toBe(true);

    // Sender requires the owner key.
    const badSender = await validateJoin("8K4X2P9QWM5T", "sender", "wrong-key", store);
    expect(badSender.ok).toBe(false);
    if (!badSender.ok) expect(badSender.code).toBe("owner_unauthorized");

    const goodSender = await validateJoin("8K4X2P9QWM5T", "sender", "owner-key-123", store);
    expect(goodSender.ok).toBe(true);

    const unknownRoom = await validateJoin("AAAAAAAAAAAA", "receiver", undefined, store);
    expect(unknownRoom.ok).toBe(false);
    if (!unknownRoom.ok) expect(unknownRoom.code).toBe("room_not_found");
  });

  it("registers peers and routes signals to the sender alias", async () => {
    const store = createInMemoryRoomStore();
    await createRoom(store);

    const sender = await store.ensurePeer({
      roomId: "8K4X2P9QWM5T",
      peerId: "aaaaaaaaaaaaaaaa",
      role: "sender",
      transport: "http",
    });
    const receiver = await store.ensurePeer({
      roomId: "8K4X2P9QWM5T",
      peerId: "bbbbbbbbbbbbbbbb",
      role: "receiver",
      transport: "http",
    });
    expect(sender).not.toBeNull();
    expect(receiver).not.toBeNull();

    // Receiver → "sender" alias resolves to the sender peer.
    const routed = await store.queueSignal("8K4X2P9QWM5T", "sender", {
      t: "signal",
      from: "bbbbbbbbbbbbbbbb",
      kind: "description",
      data: { type: "offer", sdp: "v=0..." },
    });
    expect(routed).toBe(true);
    const senderPeer = await store.getPeer("8K4X2P9QWM5T", "aaaaaaaaaaaaaaaa");
    expect(senderPeer!.queue).toHaveLength(1);
    expect(senderPeer!.queue[0]).toMatchObject({ from: "bbbbbbbbbbbbbbbb", kind: "description" });

    // Sender → specific receiver peer.
    await store.queueSignal("8K4X2P9QWM5T", "bbbbbbbbbbbbbbbb", {
      t: "signal",
      from: "aaaaaaaaaaaaaaaa",
      kind: "candidate",
      data: { candidate: "candidate:1" },
    });
    const freshReceiver = await store.getPeer("8K4X2P9QWM5T", "bbbbbbbbbbbbbbbb");
    expect(freshReceiver!.queue).toHaveLength(1);

    // Consuming drains the queue (HTTP polling semantics).
    const consumed = freshReceiver!.queue.splice(0);
    expect(consumed).toHaveLength(1);
    expect((await store.getPeer("8K4X2P9QWM5T", "bbbbbbbbbbbbbbbb"))!.queue).toHaveLength(0);
  });

  it("rejects signals to unknown peers and oversized signals", async () => {
    const store = createInMemoryRoomStore();
    await createRoom(store);
    await store.ensurePeer({
      roomId: "8K4X2P9QWM5T",
      peerId: "aaaaaaaaaaaaaaaa",
      role: "sender",
      transport: "http",
    });

    const unknown = await store.queueSignal("8K4X2P9QWM5T", "9999999999999999", {
      t: "signal",
      from: "aaaaaaaaaaaaaaaa",
      kind: "candidate",
      data: {},
    });
    expect(unknown).toBe(false);

    const oversized = await store.queueSignal("8K4X2P9QWM5T", "aaaaaaaaaaaaaaaa", {
      t: "signal",
      from: "aaaaaaaaaaaaaaaa",
      kind: "candidate",
      data: { padding: "x".repeat(200 * 1024) },
    });
    expect(oversized).toBe(false);
  });

  it("expires rooms after the TTL", async () => {
    const store = createInMemoryRoomStore();
    await createRoom(store, { ttlMs: 1000 });
    expect(await store.getRoom("8K4X2P9QWM5T")).not.toBeNull();

    const removed = await store.sweep(Date.now() + 2000);
    expect(removed).toBe(1);
    expect(await store.getRoom("8K4X2P9QWM5T")).toBeNull();
  });

  it("revokes rooms only with the correct owner key", async () => {
    const store = createInMemoryRoomStore();
    await createRoom(store);

    const wrongKey = await store.revokeRoom("8K4X2P9QWM5T", "wrong");
    expect(wrongKey).toBe(false);
    expect(await store.getRoom("8K4X2P9QWM5T")).not.toBeNull();

    const rightKey = await store.revokeRoom("8K4X2P9QWM5T", "owner-key-123");
    expect(rightKey).toBe(true);
    expect(await store.getRoom("8K4X2P9QWM5T")).toBeNull();

    const joinAfterRevoke = await validateJoin("8K4X2P9QWM5T", "receiver", undefined, store);
    expect(joinAfterRevoke.ok).toBe(false);
    if (!joinAfterRevoke.ok) expect(joinAfterRevoke.code).toBe("room_not_found");
  });
});

describe("verifier comparison", () => {
  it("compares strings in constant time", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
