/**
 * Client-side store for selected files and active transfer engines.
 *
 * File objects cannot be serialized into URLs or sessionStorage, so selected
 * files travel between the landing page and /send through this module-level
 * store (cached on globalThis to survive hot reloads).
 */

import type { FileMeta } from "@/types/transfer";

export interface SelectedFile extends FileMeta {
  file: File;
}

const globalStore = globalThis as typeof globalThis & {
  __fileBurgerFiles?: SelectedFile[];
  __fileBurgerEngines?: Map<string, unknown>;
};

export function getSelectedFiles(): SelectedFile[] {
  return globalStore.__fileBurgerFiles ?? [];
}

export function setSelectedFiles(files: SelectedFile[]): void {
  globalStore.__fileBurgerFiles = files;
}

export function addSelectedFiles(incoming: File[]): SelectedFile[] {
  const existing = getSelectedFiles();
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const file of incoming) {
    byId.set(fileIdFor(file), {
      id: fileIdFor(file),
      file,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
    });
  }
  const next = Array.from(byId.values());
  setSelectedFiles(next);
  return next;
}

/** Duplicate filenames are fine — the identity key includes size and index. */
function fileIdFor(file: File): string {
  const existing = getSelectedFiles().find(
    (entry) => entry.file === file,
  );
  if (existing) return existing.id;
  return `${file.name}:${file.size}:${file.lastModified}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function removeSelectedFile(id: string): SelectedFile[] {
  const next = getSelectedFiles().filter((entry) => entry.id !== id);
  setSelectedFiles(next);
  return next;
}

/** Generic engine registry keyed by room ID (survives route changes). */
export function getEngineRegistry(): Map<string, unknown> {
  if (!globalStore.__fileBurgerEngines) {
    globalStore.__fileBurgerEngines = new Map();
  }
  return globalStore.__fileBurgerEngines;
}

export function setEngine<T>(roomId: string, engine: T): void {
  getEngineRegistry().set(roomId, engine);
}

export function getEngine<T>(roomId: string): T | undefined {
  return getEngineRegistry().get(roomId) as T | undefined;
}

export function deleteEngine(roomId: string): void {
  getEngineRegistry().delete(roomId);
}
