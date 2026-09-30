import { describe, expect, it } from "vitest";
import { createHasher, hashBlob } from "@/lib/files/hash";

describe("hasher", () => {
  it("produces the known SHA-256 digest", () => {
    const hasher = createHasher();
    hasher.update(new TextEncoder().encode("hello world"));
    // sha256("hello world")
    expect(hasher.digest()).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });

  it("incremental updates equal whole-buffer hashing", async () => {
    const data = new Uint8Array(100_000);
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 31 + 7) & 0xff;

    const whole = createHasher();
    whole.update(data);

    const incremental = createHasher();
    let offset = 0;
    const chunkSize = 4096;
    while (offset < data.length) {
      const end = Math.min(offset + chunkSize, data.length);
      incremental.update(data.slice(offset, end));
      offset = end;
    }

    expect(incremental.digest()).toBe(whole.digest());
  });

  it("reset() starts a fresh digest", () => {
    const hasher = createHasher();
    hasher.update(new TextEncoder().encode("first"));
    hasher.reset();
    hasher.update(new TextEncoder().encode("hello world"));
    expect(hasher.digest()).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });
});

describe("hashBlob", () => {
  it("streams a Blob and produces the same digest as whole-buffer hashing", async () => {
    const data = new Uint8Array(50_000);
    for (let i = 0; i < data.length; i += 1) data[i] = (i * 13) & 0xff;
    const blob = new Blob([data]);

    const whole = createHasher();
    whole.update(data);

    expect(await hashBlob(blob, 4096)).toBe(whole.digest());
  });

  it("hashes empty blobs", async () => {
    // sha256 of empty input
    expect(await hashBlob(new Blob([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
