/**
 * ZIP packaging on the receiving side only, using client-zip (streaming,
 * no worker required). The ZIP is built in the receiver's browser from the
 * already-received data — it never passes through the server.
 */

import { downloadZip } from "client-zip";
import { safeFileName } from "./sink";

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/** Build a ZIP Blob from received files with sanitized entry names. */
export async function buildZip(entries: ZipEntry[]): Promise<Blob> {
  const input = await Promise.all(
    entries.map(async (entry) => ({
      name: await safeFileName(entry.name),
      lastModified: new Date(),
      input: entry.blob,
    })),
  );
  return downloadZip(input).blob();
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke a bit later so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadZipAsFile(entries: ZipEntry[], zipName: string): Promise<void> {
  const zip = await buildZip(entries);
  downloadBlob(zip, zipName);
}
