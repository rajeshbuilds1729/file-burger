/**
 * RTCPeerConnection factory and connection-quality detection.
 *
 * STUN is always configured for NAT traversal; optional TURN servers come
 * from /api/ice (environment configuration) for peers that cannot connect
 * directly. `detectConnectionType` reports whether the selected path is
 * Direct P2P or Relayed — we never pretend every transfer is direct.
 */

import type { ConnectionQuality } from "@/types/transfer";

export interface IceConfig {
  iceServers: RTCIceServer[];
}

/** Default STUN configuration used until /api/ice responds. */
export function defaultIceConfig(): IceConfig {
  return {
    iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }],
  };
}

export interface CreatePeerOptions {
  iceServers?: RTCIceServer[];
  onConnectionType?: (quality: ConnectionQuality) => void;
}

export function createPeerConnection(options: CreatePeerOptions = {}): RTCPeerConnection {
  const pc = new RTCPeerConnection({
    iceServers: options.iceServers ?? defaultIceConfig().iceServers,
    // Keep the candidate gathering short — a few seconds is plenty for STUN.
    iceCandidatePoolSize: 4,
  });

  if (options.onConnectionType) {
    void pollConnectionType(pc, options.onConnectionType);
  }

  return pc;
}

/**
 * Determine whether the selected candidate pair is direct or relayed by
 * inspecting WebRTC stats. Retries until a pair is selected or the timeout.
 */
export async function pollConnectionType(
  pc: RTCPeerConnection,
  onResult: (quality: ConnectionQuality) => void,
  timeoutMs = 20000,
): Promise<ConnectionQuality> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      onResult("failed");
      return "failed";
    }
    try {
      const stats = await pc.getStats();
      for (const report of stats.values()) {
        const pair = report as {
          type?: string;
          state?: string;
          selected?: boolean;
          localCandidateId?: string;
        };
        const isSelectedPair =
          pair.type === "candidate-pair" &&
          (pair.selected === true || pair.state === "succeeded");
        if (!isSelectedPair || !pair.localCandidateId) continue;
        const local = stats.get(pair.localCandidateId) as {
          candidateType?: string;
        } | undefined;
        const quality: ConnectionQuality =
          local?.candidateType === "relay" ? "relayed" : "direct";
        onResult(quality);
        return quality;
      }
    } catch {
      // Stats unavailable — keep trying until the timeout.
    }
    await sleep(600);
  }
  onResult("failed");
  return "failed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
