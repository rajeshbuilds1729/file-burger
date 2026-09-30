/**
 * PBKDF2 password verification, computed entirely in the browser.
 *
 * The sender derives a verifier from their password and registers it; the
 * receiver derives the same verifier from the password they type. Only these
 * verifiers are transmitted (over TLS) — the plaintext password never leaves
 * either browser, and the server only ever sees/store a KDF verifier.
 * Requires a secure context (HTTPS or localhost) for WebCrypto.
 */

export const PBKDF2 = {
  iterations: 150_000,
  hash: "SHA-256",
  saltBytes: 16,
} as const;

export async function deriveVerifier(
  password: string,
  saltHex: string,
): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("insecure_context");
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const salt = hexToBytes(saltHex);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: PBKDF2.hash,
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2.iterations,
    },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
