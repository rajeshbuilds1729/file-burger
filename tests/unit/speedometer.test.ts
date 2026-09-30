import { describe, expect, it } from "vitest";
import { Speedometer, estimateEta } from "@/features/transfer/speedometer";

describe("Speedometer", () => {
  it("returns 0 on the first sample", () => {
    const meter = new Speedometer();
    expect(meter.sample(0)).toBe(0);
  });

  it("smooths speed across samples", () => {
    const meter = new Speedometer(0.5);
    const t0 = 1000;
    meter.sample(0, t0);
    const speed1 = meter.sample(1000, t0 + 1000); // 1000 B/s instant
    expect(speed1).toBe(1000);
    const speed2 = meter.sample(3000, t0 + 2000); // 2000 B/s instant
    expect(speed2).toBe(1500); // 1000 * 0.5 + 2000 * 0.5
  });

  it("ignores counter resets (instant < 0)", () => {
    const meter = new Speedometer();
    const t0 = 1000;
    meter.sample(5000, t0);
    const speed = meter.sample(1000, t0 + 1000); // counter went backwards
    expect(speed).toBe(0);
  });
});

describe("estimateEta", () => {
  it("computes remaining seconds", () => {
    expect(estimateEta(1000, 100)).toBe(10);
    expect(estimateEta(0, 100)).toBe(0);
  });

  it("returns Infinity for zero/negative speed", () => {
    expect(estimateEta(1000, 0)).toBe(Infinity);
    expect(estimateEta(1000, -5)).toBe(Infinity);
    expect(estimateEta(1000, NaN)).toBe(Infinity);
  });
});
