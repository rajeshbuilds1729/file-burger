/**
 * File transfer protocol.
 *
 * One DataChannel carries both control messages (JSON text frames) and file
 * data (binary frames of raw chunk bytes). Chunks always belong to the file
 * announced by the most recent `file-start`, and the channel is ordered and
 * reliable, so no per-chunk header is needed.
 *
 * Protocol walkthrough (receiver-initiated offers):
 *   receiver → sender : `hello`
 *   sender → receiver : `manifest` (files + hashes)
 *   receiver → sender : `accept` (file IDs it wants, optional password proof
 *                        and resume offset)
 *   sender → receiver : `file-start` → chunks → `file-end` (per file)
 *   either side       : `pause` / `resume` / `cancel`
 *
 * The receiver detects its own completion (all bytes received, hash verified).
 */

import type { FileMetaWithHash } from "@/types/transfer";

export const PROTOCOL_VERSION = 1;

export type ControlMessage =
  | { t: "hello"; protocol: number }
  | { t: "manifest"; files: FileMetaWithHash[] }
  | {
      t: "accept";
      /** File IDs the receiver wants transferred. */
      files: string[];
      /** PBKDF2 verifier proving the receiver knows the password. */
      proof?: string;
      /** Resume state: continue this file at this byte offset. */
      resume?: { fileId: string; offset: number };
    }
  | { t: "reject"; reason: string }
  | {
      t: "file-start";
      fileId: string;
      name: string;
      size: number;
      type: string;
      chunkSize: number;
    }
  | { t: "file-end"; fileId: string; hash: string }
  | { t: "pause" }
  | { t: "resume" }
  | { t: "cancel"; reason?: string }
  /** Receiver → sender, after every file is verified. Sender may close. */
  | { t: "complete"; files: string[] }
  | { t: "error"; code: string; message?: string };

/** Encode a control message as a text frame payload. */
export function encodeControl(message: ControlMessage): string {
  return JSON.stringify(message);
}

/** Decode and validate a control message. Returns null for invalid frames. */
export function decodeControl(raw: string): ControlMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as Record<string, unknown>;
  switch (message.t) {
    case "hello":
      return { t: "hello", protocol: PROTOCOL_VERSION };
    case "manifest": {
      const files = message.files;
      if (!Array.isArray(files)) return null;
      return { t: "manifest", files: files as FileMetaWithHash[] };
    }
    case "accept": {
      const files = message.files;
      if (!Array.isArray(files) || files.some((id) => typeof id !== "string")) {
        return null;
      }
      const result: ControlMessage = {
        t: "accept",
        files: files as string[],
      };
      if (typeof message.proof === "string") {
        return { ...result, proof: message.proof } as Extract<
          ControlMessage,
          { t: "accept" }
        >;
      }
      if (
        typeof message.resume === "object" &&
        message.resume !== null &&
        typeof (message.resume as Record<string, unknown>).fileId === "string" &&
        typeof (message.resume as Record<string, unknown>).offset === "number"
      ) {
        const resume = message.resume as { fileId: string; offset: number };
        return { ...result, resume } as Extract<ControlMessage, { t: "accept" }>;
      }
      return result;
    }
    case "reject":
      return typeof message.reason === "string"
        ? { t: "reject", reason: message.reason }
        : null;
    case "file-start": {
      if (
        typeof message.fileId !== "string" ||
        typeof message.name !== "string" ||
        typeof message.size !== "number" ||
        typeof message.chunkSize !== "number"
      ) {
        return null;
      }
      return {
        t: "file-start",
        fileId: message.fileId,
        name: message.name,
        size: message.size,
        type: typeof message.type === "string" ? message.type : "application/octet-stream",
        chunkSize: message.chunkSize,
      };
    }
    case "file-end":
      return typeof message.fileId === "string" && typeof message.hash === "string"
        ? { t: "file-end", fileId: message.fileId, hash: message.hash }
        : null;
    case "pause":
      return { t: "pause" };
    case "resume":
      return { t: "resume" };
    case "cancel":
      return { t: "cancel", reason: typeof message.reason === "string" ? message.reason : undefined };
    case "complete": {
      const files = message.files;
      if (!Array.isArray(files) || files.some((id) => typeof id !== "string")) return null;
      return { t: "complete", files: files as string[] };
    }
    case "error":
      return typeof message.code === "string"
        ? { t: "error", code: message.code, message: typeof message.message === "string" ? message.message : undefined }
        : null;
    default:
      return null;
  }
}
