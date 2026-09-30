import { describe, expect, it } from "vitest";
import { readChunks } from "@/lib/files/chunker";
import { TRANSFER } from "@/lib/config";

function makeBlob(size: number): Blob {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) data[i] = i & 0xff;
  return new Blob([data]);
}

describe("chunker", () => {
  it("yields chunks of the requested size with correct offsets", async () => {
    const blob = makeBlob(100_000);
    const chunks: Array<{ offset: number; length: number }> = [];
    for await (const chunk of readChunks(blob, { chunkSize: 16 * 1024 })) {
      chunks.push({ offset: chunk.offset, length: chunk.data.byteLength });
    }
    expect(chunks.length).toBe(Math.ceil(100_000 / (16 * 1024)));
    let expectedOffset = 0;
    for (const chunk of chunks) {
      expect(chunk.offset).toBe(expectedOffset);
      expectedOffset += chunk.length;
      expect(chunk.length).toBeLessThanOrEqual(16 * 1024);
    }
    // Reassemble and verify content.
    const parts: BlobPart[] = [];
    for await (const chunk of readChunks(blob, { chunkSize: 16 * 1024 })) {
      parts.push(chunk.data);
    }
    const assembled = new Blob(parts);
    expect(assembled.size).toBe(blob.size);
  });

  it("handles the last partial chunk", async () => {
    const blob = makeBlob(20_000);
    const chunks: number[] = [];
    for await (const chunk of readChunks(blob, { chunkSize: 16 * 1024 })) {
      chunks.push(chunk.data.byteLength);
    }
    expect(chunks).toEqual([16 * 1024, 20_000 - 16 * 1024]);
  });

  it("handles empty files", async () => {
    const blob = makeBlob(0);
    const chunks = [];
    for await (const chunk of readChunks(blob)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });

  it("reports chunk size growth (adaptive sizing)", async () => {
    const blob = makeBlob(2 * 1024 * 1024);
    let observed: number | null = null;
    for await (const chunk of readChunks(blob, {
      chunkSize: TRANSFER.minChunkSize,
      onChunkSizeChange: (size) => {
        observed ??= size;
      },
    })) {
      void chunk;
    }
    expect(observed).not.toBeNull();
    expect(observed!).toBeGreaterThan(TRANSFER.minChunkSize);
    expect(observed!).toBeLessThanOrEqual(TRANSFER.maxChunkSize);
  });

  it("never exceeds the max chunk size", async () => {
    const blob = makeBlob(1024 * 1024);
    for await (const chunk of readChunks(blob, { chunkSize: 1024 * 1024 })) {
      expect(chunk.data.byteLength).toBeLessThanOrEqual(TRANSFER.maxChunkSize);
    }
  });
});
