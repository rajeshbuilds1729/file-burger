/**
 * Chunked file reading with adaptive chunk sizes.
 *
 * Chunks start small (safe in every browser) and grow while the data channel
 * keeps up, capped at a conservative maximum. Only one small slice is in
 * memory at a time — never the whole file.
 */

import { TRANSFER } from "@/lib/config";

export interface Chunk {
  /** Byte offset of this chunk within the file. */
  offset: number;
  data: ArrayBuffer;
}

export interface ReadChunkOptions {
  chunkSize?: number;
  onChunkSizeChange?: (chunkSize: number) => void;
}

/**
 * Async generator over a file's chunks with adaptive sizing.
 *
 * The caller applies backpressure by only pulling the next chunk when the
 * data channel has drained (see `waitForChannelDrain` in the sender engine).
 */
export async function* readChunks(
  file: Blob,
  options: ReadChunkOptions = {},
): AsyncGenerator<Chunk> {
  // Cap the requested size for cross-browser safety; adaptive growth never
  // exceeds this either.
  let chunkSize = Math.min(
    options.chunkSize ?? TRANSFER.minChunkSize,
    TRANSFER.maxChunkSize,
  );
  let chunksAtSize = 0;

  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const data = await slice.arrayBuffer();
    if (data.byteLength === 0) break;
    yield { offset, data };
    offset += data.byteLength;

    // Adaptive sizing: if the consumer never had to pause us for this many
    // chunks, the channel can keep up — grow the chunk size.
    chunksAtSize += 1;
    if (
      chunksAtSize >= 48 &&
      chunkSize < TRANSFER.maxChunkSize &&
      options.onChunkSizeChange
    ) {
      chunkSize = Math.min(TRANSFER.maxChunkSize, chunkSize * 2);
      chunksAtSize = 0;
      options.onChunkSizeChange(chunkSize);
    }
  }
}
