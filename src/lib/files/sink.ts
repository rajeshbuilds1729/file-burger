/**
 * File sinks: where received file data is written on the receiving side.
 *
 * Three implementations behind one interface, chosen by availability and
 * file size:
 *  - FileSystemDirectorySink: streams chunks straight to disk via the File
 *    System Access API (Chromium). Opt-in; the user picks a directory when
 *    accepting the transfer. No memory limits.
 *  - IndexedDbSink: stores chunks in IndexedDB, assembles a Blob at the end.
 *    Default for large files.
 *  - MemorySink: accumulates Blob parts in memory. Default for small files.
 *
 * All are local to the receiving browser — nothing touches the server.
 */

import { clearFileChunks, chunkKey, getAllChunks, isIndexedDbAvailable, putChunk } from "./idb";
import { sanitizeFileName } from "@/lib/sanitize";
import { TRANSFER } from "@/lib/config";

export interface FileSink {
  /** Which sink implementation this is. */
  readonly kind: SinkKind;
  /** The assembled result after close() (null blob = saved to disk). */
  readonly result: SinkResult;
  write(chunk: ArrayBuffer): Promise<void>;
  /** Finish the file and make it available via `getResult`. */
  close(): Promise<void>;
  /** Abort and discard everything written so far. */
  abort(): Promise<void>;
}

export interface SinkResult {
  /** The received file as a Blob (null for directory sinks — data is on disk). */
  blob: Blob | null;
  /** File name on disk for directory sinks. */
  fileName?: string;
}

export interface SinkOptions {
  fileId: string;
  fileName: string;
  fileSize: number;
  /**
   * Opt-in File System Access API directory handle. When provided (and the
   * API is available), data streams straight to disk.
   */
  directoryHandle?: FileSystemDirectoryHandle | null;
}

export type SinkKind = "memory" | "indexeddb" | "fsa";

/** Decide which sink to use for a file. */
export function chooseSinkKind(options: {
  fileSize: number;
  directoryHandle?: FileSystemDirectoryHandle | null;
}): SinkKind {
  if (options.directoryHandle && supportsFileSystemAccess()) return "fsa";
  if (options.fileSize > TRANSFER.memorySinkLimit && isIndexedDbAvailable()) {
    return "indexeddb";
  }
  return "memory";
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function createFileSink(options: SinkOptions): FileSink {
  const kind = chooseSinkKind(options);
  switch (kind) {
    case "fsa":
      return new FileSystemDirectorySink(options);
    case "indexeddb":
      return new IndexedDbSink(options);
    default:
      return new MemorySink();
  }
}

class MemorySink implements FileSink {
  readonly kind: SinkKind = "memory";
  private parts: ArrayBuffer[] = [];
  private closed = false;
  readonly result: SinkResult = { blob: null };

  async write(chunk: ArrayBuffer): Promise<void> {
    if (this.closed) return;
    this.parts.push(chunk);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.result.blob = new Blob(this.parts, { type: "application/octet-stream" });
    this.parts = [];
  }

  async abort(): Promise<void> {
    this.closed = true;
    this.parts = [];
  }
}

class IndexedDbSink implements FileSink {
  readonly kind: SinkKind = "indexeddb";
  private seq = 0;
  private closed = false;
  readonly result: SinkResult = { blob: null };

  constructor(private readonly options: SinkOptions) {}

  async write(chunk: ArrayBuffer): Promise<void> {
    if (this.closed) return;
    await putChunk({
      key: chunkKey(this.options.fileId, this.seq),
      fileId: this.options.fileId,
      seq: this.seq,
      blob: new Blob([chunk], { type: "application/octet-stream" }),
    });
    this.seq += 1;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const parts = await getAllChunks(this.options.fileId);
    this.result.blob = new Blob(parts, { type: "application/octet-stream" });
    await clearFileChunks(this.options.fileId);
  }

  async abort(): Promise<void> {
    this.closed = true;
    await clearFileChunks(this.options.fileId);
  }
}

class FileSystemDirectorySink implements FileSink {
  readonly kind: SinkKind = "fsa";
  private handle: FileSystemFileHandle | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private closed = false;
  private bytesWritten = 0;
  readonly result: SinkResult = { blob: null };

  constructor(private readonly options: SinkOptions) {}

  async write(chunk: ArrayBuffer): Promise<void> {
    if (this.closed) return;
    if (!this.writable) {
      this.handle = await this.options.directoryHandle!.getFileHandle(
        await safeFileName(this.options.fileName),
        { create: true },
      );
      this.writable = await this.handle.createWritable({ keepExistingData: false });
    }
    await this.writable.write(chunk);
    this.bytesWritten += chunk.byteLength;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.writable) {
      await this.writable.close();
      this.writable = null;
      this.result.fileName = this.handle?.name;
    }
  }

  async abort(): Promise<void> {
    this.closed = true;
    try {
      await this.writable?.abort();
      await this.writable?.close();
    } catch {
      // ignore
    }
    this.writable = null;
  }
}

/** Sanitize a filename for writing to disk (prevents path traversal). */
export const safeFileName = sanitizeFileName;

/** Request a writable directory handle (must be called from a user gesture). */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsFileSystemAccess()) return null;
  try {
    const picker = (
      window as Window & {
        showDirectoryPicker?: (options?: {
          mode?: string;
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) return null;
    return await picker({ mode: "readwrite" });
  } catch {
    // User cancelled — fall back to the default sink.
    return null;
  }
}
