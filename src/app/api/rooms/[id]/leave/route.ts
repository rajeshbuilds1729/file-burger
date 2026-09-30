import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/signaling/store";
import { isValidTransferId, normalizeTransferId } from "@/lib/ids";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Leave a room (peer cleanup). Best effort — peers also expire server-side. */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  if (!isValidTransferId(roomId)) {
    return new NextResponse(null, { status: 204 });
  }
  const body = (await request.json().catch(() => null)) as {
    peerId?: unknown;
  } | null;
  const peerId = typeof body?.peerId === "string" ? body.peerId : null;
  if (!peerId) {
    return new NextResponse(null, { status: 204 });
  }
  const store = await getRoomStore();
  await store.removePeer(roomId, peerId);
  return new NextResponse(null, { status: 204 });
}
