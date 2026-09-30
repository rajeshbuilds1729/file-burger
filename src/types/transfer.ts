/** Shared transfer types used by the engine, signaling and UI layers. */

export interface FileMeta {
  /** Stable ID, unique within a transfer. */
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface FileMetaWithHash extends FileMeta {
  /** SHA-256 hex digest, computed by the sender while streaming. */
  hash: string | null;
}

/** Overall phase of a transfer. Driven through the transfer state machine. */
export type TransferPhase =
  | "idle"
  | "selecting"
  | "ready"
  | "creating"
  | "connecting"
  | "negotiating"
  | "waiting"
  | "transferring"
  | "paused"
  | "reconnecting"
  | "completed"
  | "declined"
  | "cancelled"
  | "failed"
  | "expired";

export type ConnectionQuality =
  | "unknown"
  | "checking"
  | "direct"
  | "relayed"
  | "failed";

export type TransferRole = "sender" | "receiver";

export interface TransferError {
  /** Stable error code, e.g. `room_not_found`. */
  code: TransferErrorCode;
  /** Human-readable, actionable explanation. */
  message: string;
}

export type TransferErrorCode =
  | "room_not_found"
  | "room_expired"
  | "room_revoked"
  | "room_cancelled"
  | "signaling_unavailable"
  | "webrtc_failed"
  | "peer_disconnected"
  | "password_required"
  | "password_mismatch"
  | "storage_full"
  | "integrity_failed"
  | "invalid_input"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "unknown";

export interface ReceiverSummary {
  peerId: string;
  state:
    | "connecting"
    | "connected"
    | "transferring"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed";
  progress: number;
  joinedAt: number;
}

export interface TransferStats {
  /** Bytes transferred for the current file. */
  fileBytes: number;
  /** Bytes transferred overall. */
  totalBytes: number;
  /** Smoothed speed estimate in bytes/second. */
  speed: number;
  /** Estimated seconds remaining for the overall transfer. */
  etaSeconds: number;
  /** Elapsed seconds since the transfer started. */
  elapsedSeconds: number;
}
