/**
 * Transfer identifier generation.
 *
 * IDs are derived from cryptographically random bits (WebCrypto in the
 * browser, node:crypto on the server) and encoded with Crockford base32 so
 * they are unambiguous when read aloud or typed. A 60-bit ID makes
 * enumeration of active transfers computationally infeasible.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const TRANSFER_ID_LENGTH = 12;

/** 60 bits of entropy -> 12 Crockford base32 characters. */
function encodeBits(bits: Uint8Array, length: number): string {
  let value = 0n;
  for (const byte of bits) {
    value = (value << 8n) | BigInt(byte);
  }
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET[Number(value % 32n)] + out;
    value /= 32n;
  }
  return out;
}

/** Generate a fresh, non-guessable transfer ID. */
export async function generateTransferId(): Promise<string> {
  const bits = new Uint8Array(8); // 64 bits -> 60 used
  getRandomValues(bits);
  return encodeBits(bits, TRANSFER_ID_LENGTH);
}

/** Generate a 128-bit owner key (hex) that authorizes sender-only operations. */
export async function generateOwnerKey(): Promise<string> {
  const bits = new Uint8Array(16);
  getRandomValues(bits);
  return Array.from(bits, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a random salt bytes (hex) for password verifiers. */
export async function generateSalt(): Promise<string> {
  const bits = new Uint8Array(16);
  getRandomValues(bits);
  return Array.from(bits, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a peer ID for the signaling layer (server-assigned per join). */
export async function generatePeerId(): Promise<string> {
  const bits = new Uint8Array(8);
  getRandomValues(bits);
  return Array.from(bits, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getRandomValues(bytes: Uint8Array): void {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return;
  }
  throw new Error("No secure random source available");
}

/**
 * Normalize user-typed IDs: uppercase, strip separators, and map ambiguous
 * characters to their Crockford equivalents (I/L -> 1, O -> 0, U -> V).
 */
export function normalizeTransferId(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-_.]/g, "")
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
}

/** Format an ID for display: 8K4X2P9QWM5T -> 8K4X-2P9Q-WM5T. */
export function formatTransferId(id: string): string {
  return (id.match(/.{1,4}/g) ?? [id]).join("-");
}

export function isValidTransferId(id: string): boolean {
  return (
    id.length === TRANSFER_ID_LENGTH &&
    Array.from(id).every((char) => ALPHABET.includes(char))
  );
}
