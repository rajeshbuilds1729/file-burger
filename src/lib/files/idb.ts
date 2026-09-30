/**
 * Tiny promise wrapper around IndexedDB for chunk storage.
 *
 * Chunks are stored as Blobs (stored by reference in Chromium, so this stays
 * memory-friendly for very large files).
 */

const DB_NAME = "file-burger";
const DB_VERSION = 1;
const CHUNKS_STORE = "chunks";

export interface ChunkRecord {
  key: string; // `${fileId}:${seq}`
  fileId: string;
  seq: number;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_error"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, mode);
      const request = fn(tx.objectStore(CHUNKS_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexeddb_error"));
    });
  } finally {
    db.close();
  }
}

export function chunkKey(fileId: string, seq: number): string {
  return `${fileId}:${seq}`;
}

export async function putChunk(record: ChunkRecord): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put(record) as unknown as IDBRequest<void>,
  );
}

export async function getAllChunks(fileId: string): Promise<Blob[]> {
  const records = await withStore<ChunkRecord[]>("readonly", (store) =>
    store.getAll() as unknown as IDBRequest<ChunkRecord[]>,
  );
  return records
    .filter((record) => record.fileId === fileId)
    .sort((a, b) => a.seq - b.seq)
    .map((record) => record.blob);
}

export async function clearFileChunks(fileId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHUNKS_STORE, "readwrite");
      const store = tx.objectStore(CHUNKS_STORE);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value as ChunkRecord;
        if (record.fileId === fileId) {
          cursor.delete();
        }
        cursor.continue();
      };
      cursorRequest.onerror = () =>
        reject(cursorRequest.error ?? new Error("indexeddb_error"));
    });
  } finally {
    db.close();
  }
}

export async function clearAllChunks(): Promise<void> {
  await withStore("readwrite", (store) =>
    store.clear() as unknown as IDBRequest<void>,
  );
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
