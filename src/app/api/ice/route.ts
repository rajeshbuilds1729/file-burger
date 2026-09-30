import { NextResponse } from "next/server";
import {
  DEFAULT_STUN_SERVERS,
  TURN_CREDENTIAL,
  TURN_URLS,
  TURN_USERNAME,
} from "@/lib/config";

/**
 * ICE server configuration for WebRTC.
 *
 * STUN is always included (public, free, credential-less). Optional TURN
 * servers come from environment configuration.
 *
 * SECURITY NOTE: static TURN credentials in NEXT_PUBLIC_* variables are
 * readable by anyone using the site. For production, serve short-lived
 * credentials from a credential API instead (docs/DEPLOYMENT.md).
 */
export async function GET() {
  const iceServers: RTCIceServer[] = [
    { urls: DEFAULT_STUN_SERVERS },
  ];

  if (TURN_URLS.length > 0) {
    iceServers.push({
      urls: TURN_URLS,
      ...(TURN_USERNAME ? { username: TURN_USERNAME } : {}),
      ...(TURN_CREDENTIAL ? { credential: TURN_CREDENTIAL } : {}),
    });
  }

  return NextResponse.json(
    { iceServers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
