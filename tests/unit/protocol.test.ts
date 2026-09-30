import { describe, expect, it } from "vitest";
import { decodeControl, encodeControl, PROTOCOL_VERSION } from "@/lib/webrtc/protocol";

describe("control message encoding", () => {
  it("round-trips hello", () => {
    const decoded = decodeControl(encodeControl({ t: "hello", protocol: PROTOCOL_VERSION }));
    expect(decoded).toEqual({ t: "hello", protocol: PROTOCOL_VERSION });
  });

  it("round-trips manifest", () => {
    const files = [
      { id: "f1", name: "a.pdf", size: 123, type: "application/pdf", hash: "abc" },
      { id: "f2", name: "b.txt", size: 4, type: "text/plain", hash: null },
    ];
    const decoded = decodeControl(encodeControl({ t: "manifest", files }));
    expect(decoded).toEqual({ t: "manifest", files });
  });

  it("round-trips accept with proof and resume", () => {
    const withProof = decodeControl(
      encodeControl({ t: "accept", files: ["f1"], proof: "deadbeef" }),
    );
    expect(withProof).toMatchObject({ t: "accept", files: ["f1"], proof: "deadbeef" });

    const withResume = decodeControl(
      encodeControl({ t: "accept", files: ["f1", "f2"], resume: { fileId: "f2", offset: 4096 } }),
    );
    expect(withResume).toMatchObject({
      t: "accept",
      files: ["f1", "f2"],
      resume: { fileId: "f2", offset: 4096 },
    });
  });

  it("round-trips file-start and file-end", () => {
    const start = decodeControl(
      encodeControl({
        t: "file-start",
        fileId: "f1",
        name: "photo.jpg",
        size: 800,
        type: "image/jpeg",
        chunkSize: 16384,
      }),
    );
    expect(start).toMatchObject({ t: "file-start", fileId: "f1", size: 800 });

    const end = decodeControl(encodeControl({ t: "file-end", fileId: "f1", hash: "ff00" }));
    expect(end).toEqual({ t: "file-end", fileId: "f1", hash: "ff00" });
  });

  it("round-trips pause, resume, cancel, complete, error", () => {
    expect(decodeControl(encodeControl({ t: "pause" }))).toEqual({ t: "pause" });
    expect(decodeControl(encodeControl({ t: "resume" }))).toEqual({ t: "resume" });
    expect(decodeControl(encodeControl({ t: "cancel", reason: "x" }))).toEqual({
      t: "cancel",
      reason: "x",
    });
    expect(decodeControl(encodeControl({ t: "complete", files: ["f1"] }))).toEqual({
      t: "complete",
      files: ["f1"],
    });
    expect(decodeControl(encodeControl({ t: "error", code: "unknown" }))).toEqual({
      t: "error",
      code: "unknown",
      message: undefined,
    });
  });

  it("returns null for invalid frames", () => {
    expect(decodeControl("not json")).toBeNull();
    expect(decodeControl('{"t":"unknown"}')).toBeNull();
    expect(decodeControl('{"t":"manifest"}')).toBeNull();
    expect(decodeControl('{"t":"file-start"}')).toBeNull();
    expect(decodeControl('{"t":"file-end","fileId":"f1"}')).toBeNull();
    expect(decodeControl('{"t":"accept","files":[1,2]}')).toBeNull();
    expect(decodeControl("42")).toBeNull();
    expect(decodeControl('"just a string"')).toBeNull();
  });
});
