/**
 * Incremental SHA-256 hashing for streaming file transfer.
 *
 * Uses js-sha256 so files can be hashed chunk-by-chunk without ever loading
 * the whole file into memory (`file.arrayBuffer()` on a multi-GB file would).
 */

import { sha256 } from "js-sha256";

export interface IncrementalHasher {
  update(data: ArrayBuffer | Uint8Array): void;
  /** Final hex digest. The hasher must not be used afterwards. */
  digest(): string;
  reset(): void;
}

export function createHasher(): IncrementalHasher {
  let instance = sha256.create();
  return {
    update(data) {
      instance.update(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer ?? data));
    },
    digest() {
      return instance.hex();
    },
    reset() {
      instance = sha256.create();
    },
  };
}

/** Hash a complete Blob/File by streaming it in chunks (memory-safe). */
export async function hashBlob(
  blob: Blob,
  chunkSize = 4 * 1024 * 1024,
): Promise<string> {
  const hasher = createHasher();
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const chunk = await blob.slice(offset, offset + chunkSize).arrayBuffer();
    hasher.update(chunk);
  }
  return hasher.digest();
}
