import { describe, expect, it } from "vitest";
import {
  createPhaseMachine,
  transition,
  TRANSITIONS,
} from "@/features/transfer/state-machine";
import type { TransferPhase } from "@/types/transfer";

describe("transition()", () => {
  it("follows the happy path (sender)", () => {
    expect(transition("ready", "create-started")).toBe("creating");
    expect(transition("creating", "room-created")).toBe("connecting");
    expect(transition("connecting", "awaiting-receiver")).toBe("waiting");
    expect(transition("waiting", "negotiating")).toBe("negotiating");
    expect(transition("negotiating", "transfer-started")).toBe("transferring");
    expect(transition("transferring", "transfer-completed")).toBe("completed");
  });

  it("follows the happy path (receiver)", () => {
    expect(transition("idle", "files-added")).toBe("selecting");
    expect(transition("selecting", "files-ready")).toBe("ready");
    expect(transition("connecting", "awaiting-accept")).toBe("waiting");
    expect(transition("waiting", "negotiating")).toBe("negotiating");
    expect(transition("negotiating", "transfer-started")).toBe("transferring");
    expect(transition("transferring", "transfer-completed")).toBe("completed");
  });

  it("supports pause and resume", () => {
    expect(transition("transferring", "transfer-paused")).toBe("paused");
    expect(transition("paused", "transfer-resumed")).toBe("transferring");
  });

  it("supports reconnecting from transferring", () => {
    expect(transition("transferring", "connection-lost")).toBe("reconnecting");
    expect(transition("reconnecting", "transfer-started")).toBe("transferring");
    expect(transition("reconnecting", "negotiating")).toBe("negotiating");
  });

  it("terminal phases accept nothing", () => {
    const terminals: TransferPhase[] = ["completed", "cancelled", "failed", "expired", "declined"];
    for (const terminal of terminals) {
      expect(transition(terminal, "transfer-started")).toBe(terminal);
      expect(transition(terminal, "transfer-failed")).toBe(terminal);
      expect(transition(terminal, "negotiating")).toBe(terminal);
    }
  });

  it("rejects invalid transitions and keeps the current phase", () => {
    expect(transition("idle", "transfer-completed")).toBe("idle");
    expect(transition("ready", "transfer-started")).toBe("ready");
    expect(transition("creating", "transfer-completed")).toBe("creating");
    expect(transition("waiting", "files-added")).toBe("waiting");
  });

  it("allows degradation to failure from room-bearing phases", () => {
    // "creating" has no room yet, so expiry cannot occur there.
    for (const phase of ["connecting", "waiting", "negotiating", "transferring", "paused", "reconnecting"] as TransferPhase[]) {
      expect(transition(phase, "transfer-failed")).toBe("failed");
      expect(transition(phase, "transfer-expired")).toBe("expired");
      expect(transition(phase, "transfer-cancelled")).toBe("cancelled");
    }
  });
});

describe("createPhaseMachine()", () => {
  it("dispatches events and exposes the phase", () => {
    const machine = createPhaseMachine("idle");
    expect(machine.phase).toBe("idle");
    machine.dispatch("files-added");
    expect(machine.phase).toBe("selecting");
    machine.dispatch("files-ready");
    expect(machine.phase).toBe("ready");
  });

  it("ignores invalid events", () => {
    const machine = createPhaseMachine("idle");
    machine.dispatch("transfer-completed");
    expect(machine.phase).toBe("idle");
  });

  it("reset() forces a phase (terminal recovery)", () => {
    const machine = createPhaseMachine("transferring");
    machine.reset("connecting");
    expect(machine.phase).toBe("connecting");
  });
});

describe("TRANSITIONS table", () => {
  it("covers every phase", () => {
    const phases: TransferPhase[] = [
      "idle", "selecting", "ready", "creating", "connecting", "waiting",
      "negotiating", "transferring", "paused", "reconnecting", "completed",
      "declined", "cancelled", "failed", "expired",
    ];
    for (const phase of phases) {
      expect(Array.isArray(TRANSITIONS[phase])).toBe(true);
    }
  });
});
