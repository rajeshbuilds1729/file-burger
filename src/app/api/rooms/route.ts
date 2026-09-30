import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/signaling/store";
import { generateOwnerKey, generateTransferId } from "@/lib/ids";
import { SESSION_TTL_MS, SIGNAL_LIMITS } from "@/lib/config";
import { createRateLimiter } from "@/lib/rate-limit";
import { sanitizeFileName } from "@/lib/sanitize";
import { clientIp, jsonError } from "@/lib/api-helpers";

const createLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

interface CreateRoomBody {
  files?: unknown;
  password?: unknown;
}

/**
 * Create a transfer session. Only metadata (filenames, sizes, types) is
 * registered — file contents never touch the server.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!createLimiter.check(ip)) {
    return jsonError(
      429,
      "rate_limited",
      "Too many transfers created from this network. Try again shortly.",
    );
  }

  let body: CreateRoomBody;
  try {
    body = (await request.json()) as CreateRoomBody;
  } catch {
    return jsonError(400, "invalid_input", "Invalid request body.");
  }

  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    return jsonError(400, "invalid_input", "At least one file is required.");
  }
  if (files.length > SIGNAL_LIMITS.maxFiles) {
    return jsonError(
      400,
      "invalid_input",
      `Too many files for one transfer (max ${SIGNAL_LIMITS.maxFiles}).`,
    );
  }

  const parsedFiles: Array<{ id: string; name: string; size: number; type: string }> = [];
  let manifestSize = 0;
  for (const entry of files) {
    if (typeof entry !== "object" || entry === null) {
      return jsonError(400, "invalid_input", "Invalid file entry.");
    }
    const { id, name, size, type } = entry as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || id.length > 128) {
      return jsonError(400, "invalid_input", "Invalid file id.");
    }
    if (typeof name !== "string" || name.length === 0 || name.length > 1024) {
      return jsonError(400, "invalid_input", "Invalid file name.");
    }
    if (
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size < 0 ||
      size > 2 ** 53
    ) {
      return jsonError(400, "invalid_input", "Invalid file size.");
    }
    const safeName = sanitizeFileName(name);
    const safeType =
      typeof type === "string" && type.length <= 200 && /^[\w.+-]+$/.test(type)
        ? type
        : "application/octet-stream";
    manifestSize += safeName.length + safeType.length + 64;
    parsedFiles.push({ id, name: safeName, size, type: safeType });
  }
  if (manifestSize > SIGNAL_LIMITS.maxManifestBytes) {
    return jsonError(400, "invalid_input", "File manifest too large.");
  }

  let password: { salt: string; verifier: string } | null = null;
  if (body.password !== null && body.password !== undefined) {
    if (typeof body.password !== "object" || body.password === null) {
      return jsonError(400, "invalid_input", "Invalid password data.");
    }
    const { salt, verifier } = body.password as Record<string, unknown>;
    if (typeof salt !== "string" || !/^[0-9a-f]{32}$/.test(salt)) {
      return jsonError(400, "invalid_input", "Invalid password salt.");
    }
    if (typeof verifier !== "string" || !/^[0-9a-f]{64}$/.test(verifier)) {
      return jsonError(400, "invalid_input", "Invalid password verifier.");
    }
    // Only the PBKDF2 verifier and salt are stored — never the plaintext.
    password = { salt, verifier };
  }

  const store = await getRoomStore();
  const roomId = await generateTransferId();
  const ownerKey = await generateOwnerKey();
  const room = await store.createRoom({
    id: roomId,
    ownerKey,
    files: parsedFiles,
    password,
    ttlMs: SESSION_TTL_MS,
  });

  return NextResponse.json(
    { roomId: room.id, ownerKey, expiresAt: room.expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
