/**
 * Integration test: the full sender→receiver transfer lifecycle over
 * in-memory channels (no WebRTC, no network). Exercises the real protocol:
 * hello → manifest → accept → file-start → chunks → file-end → complete,
 * including hashing on both sides, backpressure, pause/resume, cancellation
 * and resume after a dropped connection.
 */

import { describe, expect, it, vi } from "vitest";
import { createChannelPair } from "@/lib/webrtc/channel";
import { SenderSession, type SenderSessionSnapshot } from "@/lib/webrtc/sender-session";
import {
  ReceiverTransfer,
  type ReceiverState,
  type ReceiverTransferSnapshot,
} from "@/lib/webrtc/receiver-transfer";
import { createHasher } from "@/lib/files/hash";

function makeFile(name: string, size: number): File {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) data[i] = (i * 7 + 3) & 0xff;
  return new File([data], name, { type: "application/octet-stream" });
}

interface Harness {
  sender: SenderSession;
  receiver: ReceiverTransfer;
  senderFinished: { snapshot: SenderSessionSnapshot; terminal: string } | null;
  receiverFinished: { snapshot: ReceiverTransferSnapshot; terminal: ReceiverState } | null;
  receiverSnapshots: ReceiverTransferSnapshot[];
}

function setup(
  files: Array<{ id: string; name: string; size: number; type: string; hash?: string | null }>,
  fileMap: Map<string, File>,
  options: {
    passwordVerifier?: string | null;
    highWaterMark?: number;
    latencyMs?: number;
  } = {},
): Harness {
  const [chanA, chanB] = createChannelPair({
    latencyMs: options.latencyMs ?? 0,
  });

  const harness: Harness = {
    sender: null as unknown as SenderSession,
    receiver: null as unknown as ReceiverTransfer,
    senderFinished: null,
    receiverFinished: null,
    receiverSnapshots: [],
  };

  const sender = new SenderSession({
    peerId: "receiver1",
    files: files.map((file) => ({ ...file, hash: file.hash ?? null })),
    getFile: (id) => fileMap.get(id),
    passwordVerifier: options.passwordVerifier ?? null,
    highWaterMark: options.highWaterMark,
    lowWaterMark: options.highWaterMark ? Math.floor(options.highWaterMark / 4) : undefined,
    onSnapshot: () => undefined,
    onFinished: (snapshot, terminal) => {
      harness.senderFinished = { snapshot, terminal };
    },
  });

  const receiver = new ReceiverTransfer({
    directoryHandle: null,
    passwordProof: null,
    onSnapshot: (snapshot) => {
      harness.receiverSnapshots.push(snapshot);
    },
    onFinished: (snapshot, terminal) => {
      harness.receiverFinished = { snapshot, terminal };
    },
  });

  // Attach wires the channels automatically: outgoing control messages flow
  // through the pipe and are delivered to the other side's handler.
  sender.attach(chanA);
  receiver.attach(chanB);

  harness.sender = sender;
  harness.receiver = receiver;
  return harness;
}

async function runFullTransfer(files: Array<{ id: string; name: string; size: number; type: string }>, fileMap: Map<string, File>, options?: Parameters<typeof setup>[2]): Promise<Harness> {
  const harness = setup(files, fileMap, options);
  // Wait for the handshake to reach awaiting-accept.
  await vi.waitFor(() => {
    expect(harness.receiver.snapshot.state).toBe("awaiting-accept");
  });
  await harness.receiver.accept(files.map((file) => file.id));
  await vi.waitFor(() => {
    expect(harness.receiverFinished).not.toBeNull();
    expect(harness.senderFinished).not.toBeNull();
  }, { timeout: 15_000 });
  return harness;
}

describe("transfer lifecycle over channels", () => {
  it("transfers multiple files end to end with matching hashes", async () => {
    const file1 = makeFile("a.bin", 100_000);
    const file2 = makeFile("b.bin", 40_000);
    const fileMap = new Map([["f1", file1], ["f2", file2]]);
    const files = [
      { id: "f1", name: "a.bin", size: file1.size, type: file1.type },
      { id: "f2", name: "b.bin", size: file2.size, type: file2.type },
    ];

    const harness = await runFullTransfer(files, fileMap);

    expect(harness.receiverFinished!.terminal).toBe("completed");
    expect(harness.senderFinished!.terminal).toBe("completed");

    const snapshot = harness.receiverFinished!.snapshot;
    expect(snapshot.totalReceivedBytes).toBe(file1.size + file2.size);
    expect(snapshot.files.every((file) => file.status === "completed")).toBe(true);
    expect(snapshot.files.every((file) => file.verifiedHash !== null)).toBe(true);

    // Content integrity: received blobs equal the source files.
    const blob1 = snapshot.results["f1"]!.blob!;
    const blob2 = snapshot.results["f2"]!.blob!;
    expect(new Uint8Array(await blob1.arrayBuffer())).toEqual(new Uint8Array(await file1.arrayBuffer()));
    expect(new Uint8Array(await blob2.arrayBuffer())).toEqual(new Uint8Array(await file2.arrayBuffer()));

    // Sender computed the same hashes while streaming.
    const senderHash1 = createHasher();
    senderHash1.update(await file1.slice(0, file1.size).arrayBuffer());
    expect(snapshot.files[0]!.verifiedHash).toBe(senderHash1.digest());
  });

  it("applies backpressure: completes correctly with a tiny channel buffer", async () => {
    const file = makeFile("big.bin", 600_000);
    const fileMap = new Map([["f1", file]]);
    const files = [{ id: "f1", name: "big.bin", size: file.size, type: file.type }];

    const harness = await runFullTransfer(files, fileMap, {
      highWaterMark: 16 * 1024,
      latencyMs: 1,
    });

    expect(harness.receiverFinished!.terminal).toBe("completed");
    const snapshot = harness.receiverFinished!.snapshot;
    expect(snapshot.totalReceivedBytes).toBe(file.size);
    expect(new Uint8Array(await snapshot.results["f1"]!.blob!.arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    );
  });

  it("supports pause and resume mid-transfer", async () => {
    const file = makeFile("slow.bin", 800_000);
    const fileMap = new Map([["f1", file]]);
    const files = [{ id: "f1", name: "slow.bin", size: file.size, type: file.type }];

    const harness = setup(files, fileMap, { highWaterMark: 32 * 1024, latencyMs: 25 });
    await vi.waitFor(() => {
      expect(harness.receiver.snapshot.state).toBe("awaiting-accept");
    });
    await harness.receiver.accept(["f1"]);

    // Pause as soon as the transfer starts, then resume.
    await vi.waitFor(
      () => {
        expect(harness.sender.snapshot.state).toBe("transferring");
      },
      { timeout: 10_000, interval: 5 },
    );
    harness.sender.pause();
    expect(harness.sender.snapshot.state).toBe("paused");
    await new Promise((resolve) => setTimeout(resolve, 120));
    harness.sender.resume();
    expect(harness.sender.snapshot.state).toBe("transferring");

    await vi.waitFor(() => {
      expect(harness.receiverFinished).not.toBeNull();
    }, { timeout: 15_000 });
    expect(harness.receiverFinished!.terminal).toBe("completed");
    expect(harness.receiverFinished!.snapshot.totalReceivedBytes).toBe(file.size);
  });

  it("propagates cancellation to the receiver", async () => {
    const file = makeFile("cancel.bin", 600_000);
    const fileMap = new Map([["f1", file]]);
    const files = [{ id: "f1", name: "cancel.bin", size: file.size, type: file.type }];

    const harness = setup(files, fileMap, { highWaterMark: 16 * 1024, latencyMs: 25 });
    await vi.waitFor(() => {
      expect(harness.receiver.snapshot.state).toBe("awaiting-accept");
    });
    await harness.receiver.accept(["f1"]);
    await vi.waitFor(
      () => {
        expect(harness.sender.snapshot.state).toBe("transferring");
      },
      { timeout: 10_000, interval: 5 },
    );

    harness.sender.cancel();

    await vi.waitFor(() => {
      expect(harness.receiverFinished).not.toBeNull();
    }, { timeout: 10_000 });
    expect(harness.receiverFinished!.terminal).toBe("cancelled");
    expect(harness.senderFinished!.terminal).toBe("cancelled");
  });

  it("rejects a wrong password proof", async () => {
    const file = makeFile("secret.bin", 1000);
    const fileMap = new Map([["f1", file]]);
    const files = [{ id: "f1", name: "secret.bin", size: file.size, type: file.type }];

    const harness = setup(files, fileMap, { passwordVerifier: "a".repeat(64) });
    await vi.waitFor(() => {
      expect(harness.receiver.snapshot.state).toBe("awaiting-accept");
    });
    await harness.receiver.accept(["f1"], "b".repeat(64));

    await vi.waitFor(() => {
      expect(harness.senderFinished).not.toBeNull();
    }, { timeout: 10_000 });
    expect(harness.senderFinished!.terminal).toBe("failed");
    // The receiver was told and failed too.
    await vi.waitFor(() => {
      expect(harness.receiverFinished).not.toBeNull();
    }, { timeout: 10_000 });
    expect(harness.receiverFinished!.terminal).toBe("failed");
  });

  it("accepts a correct password proof", async () => {
    const file = makeFile("secret2.bin", 2000);
    const fileMap = new Map([["f1", file]]);
    const files = [{ id: "f1", name: "secret2.bin", size: file.size, type: file.type }];

    const harness = setup(files, fileMap, { passwordVerifier: "a".repeat(64) });
    await vi.waitFor(() => {
      expect(harness.receiver.snapshot.state).toBe("awaiting-accept");
    });
    await harness.receiver.accept(["f1"], "a".repeat(64));

    await vi.waitFor(() => {
      expect(harness.receiverFinished).not.toBeNull();
    }, { timeout: 10_000 });
    expect(harness.receiverFinished!.terminal).toBe("completed");
  });

  it("resumes a partial transfer after a dropped connection", async () => {
    const file = makeFile("resume.bin", 600_000);
    const fileMap = new Map([["f1", file]]);
    const files = [
      { id: "f1", name: "resume.bin", size: file.size, type: file.type, hash: null },
    ];

    const [chanA, chanB] = createChannelPair({ latencyMs: 1 });
    const senderFinished: Array<{ snapshot: SenderSessionSnapshot; terminal: string }> = [];
    let receiverFinished: { snapshot: ReceiverTransferSnapshot; terminal: ReceiverState } | null = null;

    const sender = new SenderSession({
      peerId: "r1",
      files,
      getFile: (id) => fileMap.get(id),
      passwordVerifier: null,
      onSnapshot: () => undefined,
      onFinished: (snapshot, terminal) => senderFinished.push({ snapshot, terminal }),
    });
    const receiver = new ReceiverTransfer({
      directoryHandle: null,
      passwordProof: null,
      onSnapshot: () => undefined,
      onFinished: (snapshot, terminal) => {
        receiverFinished = { snapshot, terminal };
      },
    });
    sender.attach(chanA);
    receiver.attach(chanB);

    await vi.waitFor(() => {
      expect(receiver.snapshot.state).toBe("awaiting-accept");
    });
    await receiver.accept(["f1"]);
    await vi.waitFor(
      () => {
        expect(sender.snapshot.state).toBe("transferring");
      },
      { timeout: 10_000, interval: 5 },
    );

    // Let some bytes arrive, then drop the connection.
    await vi.waitFor(() => {
      const partial = receiver.snapshot.files[0]!.receivedBytes;
      expect(partial).toBeGreaterThan(0);
    }, { timeout: 10_000 });
    chanA.drop();
    chanB.drop();

    // Both sides keep their state; reconnect with fresh channels.
    const [newA, newB] = createChannelPair({ latencyMs: 1 });
    sender.attach(newA);
    receiver.attach(newB);

    await vi.waitFor(() => {
      expect(receiverFinished).not.toBeNull();
    }, { timeout: 20_000 });

    expect(receiverFinished!.terminal).toBe("completed");
    const snapshot = receiverFinished!.snapshot;
    expect(snapshot.totalReceivedBytes).toBe(file.size);
    expect(new Uint8Array(await snapshot.results["f1"]!.blob!.arrayBuffer())).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    );
  });
});
