import { NextResponse } from "next/server";
import { getRoomStore } from "@/lib/signaling/store";
import { isValidTransferId, normalizeTransferId } from "@/lib/ids";
import { clientIp, jsonError } from "@/lib/api-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const NOT_FOUND_MESSAGE =
  "This transfer doesn't exist, has expired, or was revoked. Ask the sender for a fresh link.";

/** Transfer metadata. With a password set, files are withheld until verified. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  if (!isValidTransferId(roomId)) {
    return jsonError(404, "room_not_found", NOT_FOUND_MESSAGE);
  }
  const store = await getRoomStore();
  const room = await store.getRoom(roomId);
  if (!room) {
    return jsonError(404, "room_not_found", NOT_FOUND_MESSAGE);
  }
  if (room.password) {
    // Never expose the file list before the password is verified.
    return NextResponse.json(
      {
        requiresPassword: true,
        salt: room.password.salt,
        expiresAt: room.expiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const totalSize = room.files.reduce((total, file) => total + file.size, 0);
  return NextResponse.json(
    {
      requiresPassword: false,
      files: room.files,
      fileCount: room.files.length,
      totalSize,
      expiresAt: room.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Revoke the transfer link. Requires the sender's owner key. */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const roomId = normalizeTransferId(id);
  const ownerKey = request.headers.get("x-owner-key") ?? "";
  const store = await getRoomStore();
  const revoked = await store.revokeRoom(roomId, ownerKey);
  if (!revoked) {
    return jsonError(403, "owner_unauthorized", "Invalid owner key.");
  }
  void clientIp;
  return new NextResponse(null, { status: 204 });
}
