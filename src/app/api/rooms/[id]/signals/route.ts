import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/signaling/store";
import { deliverSignal } from "@/lib/signaling/server";
import { isValidTransferId, normalizeTransferId } from "@/lib/ids";
import { createRateLimiter } from "@/lib/rate-limit";
import { SIGNAL_LIMITS } from "@/lib/config";
import { clientIp, jsonError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Generous headroom: polling runs at ~86 req/min per client. */
const signalLimiter = createRateLimiter({ limit: 600, windowMs: 60_000 });

const PEER_ID_PATTERN = /^[0-9a-f]{8,64}$/i;

/** Fetch queued signals for a peer (HTTP-polling fallback transport). */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  if (!isValidTransferId(roomId)) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  if (!signalLimiter.check(`get:${clientIp(request)}`)) {
    return jsonError(429, "rate_limited", "Too many requests. Slow down.");
  }
  const peerId = new URL(request.url).searchParams.get("peerId");
  if (!peerId || !PEER_ID_PATTERN.test(peerId)) {
    return jsonError(400, "invalid_input", "Missing or invalid peerId.");
  }
  const store = await getRoomStore();
  const room = await store.getRoom(roomId);
  if (!room) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  const peer = await store.getPeer(roomId, peerId);
  if (!peer) {
    return jsonError(404, "peer_unknown", "Peer is not in this room.");
  }
  const signals = peer.queue.splice(0);
  return NextResponse.json({ signals }, { headers: { "Cache-Control": "no-store" } });
}

interface SignalBody {
  peerId?: unknown;
  to?: unknown;
  kind?: unknown;
  data?: unknown;
}

/** Route a signaling message to its target peer. */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  if (!isValidTransferId(roomId)) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  if (!signalLimiter.check(`post:${clientIp(request)}`)) {
    return jsonError(429, "rate_limited", "Too many requests. Slow down.");
  }

  const body = (await request.json().catch(() => null)) as SignalBody | null;
  const { peerId, to, kind, data } = body ?? {};
  if (typeof peerId !== "string" || !PEER_ID_PATTERN.test(peerId)) {
    return jsonError(400, "invalid_input", "Missing or invalid peerId.");
  }
  if (typeof to !== "string" || (to !== "sender" && !PEER_ID_PATTERN.test(to))) {
    return jsonError(400, "invalid_input", "Invalid signal target.");
  }
  if (kind !== "description" && kind !== "candidate") {
    return jsonError(400, "invalid_input", "Invalid signal kind.");
  }
  if (data === undefined || data === null) {
    return jsonError(400, "invalid_input", "Missing signal data.");
  }
  try {
    if (JSON.stringify(data).length > SIGNAL_LIMITS.maxSignalBytes) {
      return jsonError(413, "invalid_input", "Signal too large.");
    }
  } catch {
    return jsonError(400, "invalid_input", "Invalid signal data.");
  }

  const store = await getRoomStore();
  const room = await store.getRoom(roomId);
  if (!room) {
    return jsonError(404, "room_not_found", "This transfer doesn't exist or has expired.");
  }
  // The sender must be present and known; peers may only signal as
  // themselves (peer IDs are server-assigned and never shared between peers).
  const fromPeer = await store.getPeer(roomId, peerId);
  if (!fromPeer) {
    return jsonError(403, "peer_unknown", "Peer is not in this room.");
  }

  const delivered = await deliverSignal(
    roomId,
    to,
    { t: "signal", from: peerId, kind, data },
    store,
  );
  if (!delivered) {
    return jsonError(410, "peer_unavailable", "The target peer is no longer connected.");
  }
  return new NextResponse(null, { status: 204 });
}
