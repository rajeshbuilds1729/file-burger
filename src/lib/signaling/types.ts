/**
 * Signaling wire types.
 *
 * The signaling layer only ever exchanges the metadata needed to establish a
 * WebRTC connection (session descriptions, ICE candidates, join/leave).
 * File contents never pass through it.
 */

export type SignalingRole = "sender" | "receiver";
export type SignalingTransportKind = "ws" | "http";

/** Messages sent by clients to the signaling server. */
export type ClientSignal =
  | {
      t: "join";
      roomId: string;
      role: SignalingRole;
      /** Owner key authorizes the sender role for this room. */
      ownerKey?: string;
      /** Declared so mixed WS/HTTP routing works cleanly. */
      transport: SignalingTransportKind;
    }
  | {
      t: "signal";
      /** Target peer ID, or the literal "sender" to reach the sender. */
      to: string;
      kind: "description" | "candidate";
      data: unknown;
    }
  | { t: "leave" };

/** Messages sent by the signaling server to clients. */
export type ServerSignal =
  | { t: "joined"; peerId: string }
  | { t: "error"; code: string; message: string }
  | {
      t: "signal";
      from: string;
      kind: "description" | "candidate";
      data: unknown;
    };

/** Envelope for HTTP polling responses. */
export interface SignalPollResponse {
  peerId: string;
  signals: ServerSignal[];
}
