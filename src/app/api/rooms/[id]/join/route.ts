import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/signaling/store";
import { validateJoin } from "@/lib/signaling/server";
import { generatePeerId, isValidTransferId, normalizeTransferId } from "@/lib/ids";
import { createRateLimiter } from "@/lib/rate-limit";
import { clientIp, jsonError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const joinLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

/** Join a room for HTTP-polling signaling. Returns a server-assigned peer ID. */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  if (!isValidTransferId(roomId)) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  const ip = clientIp(request);
  if (!joinLimiter.check(ip)) {
    return jsonError(429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const body = (await request.json().catch(() => null)) as {
    role?: unknown;
    ownerKey?: unknown;
    transport?: unknown;
  } | null;
  const role = body?.role;
  if (role !== "sender" && role !== "receiver") {
    return jsonError(400, "invalid_input", "Invalid role.");
  }
  const transport = body?.transport === "ws" ? "ws" : "http";
  const ownerKey = typeof body?.ownerKey === "string" ? body.ownerKey : undefined;

  const validation = await validateJoin(roomId, role, ownerKey);
  if (!validation.ok) {
    const status =
      validation.code === "owner_unauthorized"
        ? 403
        : validation.code === "room_revoked"
          ? 404
          : 404;
    return jsonError(status, validation.code, validation.message);
  }

  const store = await getRoomStore();
  const peerId = await generatePeerId();
  const peer = await store.ensurePeer({ roomId, peerId, role, transport });
  if (!peer) {
    return jsonError(403, "room_full", "This transfer has too many connected peers.");
  }

  return NextResponse.json({ peerId }, { headers: { "Cache-Control": "no-store" } });
}
