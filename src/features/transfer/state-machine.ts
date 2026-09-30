/**
 * Transfer phase state machine.
 *
 * A pure transition function validates every phase change; the engines drive
 * their overall phase through `createPhaseMachine` so the state machine is
 * genuinely load-bearing, and unit tests cover the transition rules.
 */

import type { TransferPhase } from "@/types/transfer";

export type TransferEvent =
  | "files-added"
  | "files-ready"
  | "create-started"
  | "room-created"
  | "awaiting-receiver"
  | "awaiting-accept"
  | "negotiating"
  | "transfer-started"
  | "transfer-paused"
  | "transfer-resumed"
  | "connection-lost"
  | "transfer-completed"
  | "transfer-declined"
  | "transfer-cancelled"
  | "transfer-failed"
  | "transfer-expired";

/**
 * Allowed transitions. Terminal phases accept nothing; everything else
 * degrades gracefully to a failure state.
 */
export const TRANSITIONS: Record<TransferPhase, TransferPhase[]> = {
  idle: ["selecting", "creating", "connecting"],
  selecting: ["ready", "idle"],
  ready: ["creating", "selecting", "idle"],
  creating: ["connecting", "failed"],
  connecting: ["waiting", "negotiating", "transferring", "cancelled", "declined", "failed", "expired"],
  waiting: [
    "negotiating",
    "transferring",
    "connecting",
    "completed",
    "declined",
    "cancelled",
    "failed",
    "expired",
  ],
  negotiating: [
    "transferring",
    "waiting",
    "reconnecting",
    "connecting",
    "cancelled",
    "failed",
    "expired",
    "declined",
  ],
  transferring: ["paused", "reconnecting", "completed", "cancelled", "failed", "expired"],
  paused: ["transferring", "reconnecting", "cancelled", "failed", "expired"],
  reconnecting: [
    "transferring",
    "negotiating",
    "connecting",
    "waiting",
    "cancelled",
    "failed",
    "expired",
  ],
  completed: [],
  declined: [],
  cancelled: [],
  failed: [],
  expired: [],
};

const EVENT_TO_PHASE: Record<TransferEvent, TransferPhase | null> = {
  "files-added": "selecting",
  "files-ready": "ready",
  "create-started": "creating",
  "room-created": "connecting",
  "awaiting-receiver": "waiting",
  "awaiting-accept": "waiting",
  negotiating: "negotiating",
  "transfer-started": "transferring",
  "transfer-paused": "paused",
  "transfer-resumed": "transferring",
  "connection-lost": "reconnecting",
  "transfer-completed": "completed",
  "transfer-declined": "declined",
  "transfer-cancelled": "cancelled",
  "transfer-failed": "failed",
  "transfer-expired": "expired",
};

/** Pure transition: returns the new phase, or the current one if invalid. */
export function transition(current: TransferPhase, event: TransferEvent): TransferPhase {
  const next = EVENT_TO_PHASE[event];
  if (next === null || next === undefined) return current;
  if (next === current) return current;
  if (!TRANSITIONS[current].includes(next)) return current;
  return next;
}

export interface PhaseMachine {
  readonly phase: TransferPhase;
  /** Dispatch an event; returns the resulting phase. */
  dispatch(event: TransferEvent): TransferPhase;
  /** Force a phase change bypassing validation (only for terminal resets). */
  reset(phase: TransferPhase): void;
}

export function createPhaseMachine(initial: TransferPhase = "idle"): PhaseMachine {
  let phase = initial;
  return {
    get phase() {
      return phase;
    },
    dispatch(event: TransferEvent): TransferPhase {
      phase = transition(phase, event);
      return phase;
    },
    reset(next: TransferPhase): void {
      phase = next;
    },
  };
}
