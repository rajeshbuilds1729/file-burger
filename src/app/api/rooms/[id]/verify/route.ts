import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/signaling/store";
import { timingSafeEqual } from "@/lib/signaling/server";
import { isValidTransferId, normalizeTransferId } from "@/lib/ids";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp, jsonError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Blunt brute-force attempts; PBKDF2 (150k iterations) does the rest. */
const verifyLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

/**
 * Verify a password-derived verifier and unlock the file list.
 * Only the verifier is exchanged — the plaintext password never reaches
 * the server and is never stored.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  if (!isValidTransferId(roomId)) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  const ip = clientIp(request);
  if (!verifyLimiter.check(`${ip}:${roomId}`)) {
    return jsonError(429, "rate_limited", "Too many attempts. Wait a moment and try again.");
  }

  const body = (await request.json().catch(() => null)) as {
    verifier?: unknown;
  } | null;
  const verifier = body?.verifier;
  if (typeof verifier !== "string" || !/^[0-9a-f]{64}$/.test(verifier)) {
    return jsonError(400, "invalid_input", "Invalid verifier.");
  }

  const store = await getRoomStore();
  const room = await store.getRoom(roomId);
  if (!room) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  if (!room.password) {
    return NextResponse.json({ ok: true, files: room.files });
  }
  if (!timingSafeEqual(verifier, room.password.verifier)) {
    return jsonError(403, "password_mismatch", "That password doesn't match. Ask the sender and try again.");
  }
  const totalSize = room.files.reduce((total, file) => total + file.size, 0);
  return NextResponse.json({
    ok: true,
    files: room.files,
    fileCount: room.files.length,
    totalSize,
    expiresAt: room.expiresAt,
  });
}
